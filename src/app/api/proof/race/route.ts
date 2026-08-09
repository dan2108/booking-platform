import { NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { db } from '@/lib/supabase/server';
import { getRota, getBusy, reserve } from '@/lib/data';
import { generateSlots } from '@/lib/availability';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const RACERS = 8;
const MARKER = 'RACE-TEST';

/**
 * The live concurrency proof.
 *
 * Fires N genuinely simultaneous reservations at ONE slot for ONE barber.
 * Each is a separate HTTP request to PostgREST on its own connection, so this
 * is a real race against the real database — not a simulation, and not
 * sequential calls dressed up as one.
 *
 * Expected result, every time: exactly one commits. The others come back with
 * code 'slot_taken', which is the correct outcome rather than a failure.
 *
 * This is PLAN.md Layer 2's definition of done: "a concurrency test fires N
 * simultaneous reservations at one slot and exactly one wins."
 */
export async function POST() {
  const started = Date.now();

  // clean up anything a previous run left behind
  await db.from('appointments').delete().eq('notes', MARKER);

  const { data: barber } = await db
    .from('staff')
    .select('id, shop_id, name, initials')
    .eq('role', 'barber')
    .eq('is_active', true)
    .order('name')
    .limit(1)
    .single();

  const { data: service } = await db
    .from('services')
    .select('id, name, duration_minutes, price_pence')
    .eq('name', 'Cut & Style')
    .single();

  if (!barber?.shop_id || !service) {
    return NextResponse.json({ error: 'Demo data is not seeded.' }, { status: 500 });
  }

  const { data: shop } = await db
    .from('shops')
    .select('id, name, timezone')
    .eq('id', barber.shop_id)
    .single();
  if (!shop) return NextResponse.json({ error: 'Shop missing.' }, { status: 500 });

  // Find a genuinely free slot in the next fortnight so the race is against
  // real rota data rather than a made-up time.
  const now = DateTime.now().setZone(shop.timezone);
  const [{ patterns, exceptions }, busy] = await Promise.all([
    getRota(barber.id),
    getBusy(
      barber.id,
      now.startOf('day').toUTC().toISO()!,
      now.plus({ days: 14 }).toUTC().toISO()!
    ),
  ]);

  let slot: string | null = null;
  let slotLabel = '';
  let slotDate = '';
  for (let i = 1; i <= 14 && !slot; i++) {
    const day = now.plus({ days: i });
    const slots = generateSlots({
      date: day.toISODate()!,
      timezone: shop.timezone,
      durationMinutes: service.duration_minutes,
      patterns,
      exceptions,
      busy,
      now,
    });
    if (slots.length) {
      slot = slots[Math.floor(slots.length / 2)].startsAt;
      slotLabel = slots[Math.floor(slots.length / 2)].label;
      slotDate = day.toFormat('cccc d LLLL');
    }
  }

  if (!slot) {
    return NextResponse.json({ error: 'No free slot to race for.' }, { status: 409 });
  }

  // ------------------------------------------------------------- the race --
  // Promise.all, not a loop: these leave the server together.
  const raceStart = Date.now();
  const results = await Promise.all(
    Array.from({ length: RACERS }, async (_, i) => {
      const t0 = Date.now();
      try {
        const r = await reserve({
          shopId: barber.shop_id!,
          barberId: barber.id,
          serviceId: service.id,
          startsAt: slot!,
          source: i % 2 === 0 ? 'online' : 'staff',
          clientName: `Racer ${i + 1}`,
          clientMobile: `+4477009009${String(i + 10).padStart(2, '0')}`,
          notes: MARKER,
        });
        return {
          racer: i + 1,
          channel: i % 2 === 0 ? ('online' as const) : ('staff' as const),
          ms: Date.now() - t0,
          won: r.ok,
          code: r.ok ? 'reserved' : r.code,
          message: r.ok ? 'Got the slot' : r.message,
        };
      } catch (err) {
        return {
          racer: i + 1,
          channel: i % 2 === 0 ? ('online' as const) : ('staff' as const),
          ms: Date.now() - t0,
          won: false,
          code: 'error',
          message: err instanceof Error ? err.message : 'unknown error',
        };
      }
    })
  );
  const raceMs = Date.now() - raceStart;

  // What the database actually holds now — the only answer that counts.
  const { count: committed } = await db
    .from('appointments')
    .select('*', { count: 'exact', head: true })
    .eq('barber_id', barber.id)
    .eq('starts_at', slot)
    .eq('status', 'booked');

  const winners = results.filter((r) => r.won).length;
  const rejected = results.filter((r) => r.code === 'slot_taken').length;

  // put the calendar back exactly as we found it
  await db.from('appointments').delete().eq('notes', MARKER);
  await db.from('clients').delete().like('name', 'Racer %');

  return NextResponse.json({
    ok: winners === 1 && committed === 1,
    barber: barber.name,
    shop: shop.name,
    service: service.name,
    slotLabel,
    slotDate,
    racers: RACERS,
    winners,
    rejected,
    committedRows: committed ?? 0,
    raceMs,
    totalMs: Date.now() - started,
    results: results.sort((a, b) => a.ms - b.ms),
  });
}
