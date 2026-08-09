import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DateTime } from 'luxon';
import {
  getStaffMember,
  getShops,
  getServices,
  getDayForBarber,
  getRota,
  getBusy,
} from '@/lib/data';
import { generateSlots, rotaWindowFor } from '@/lib/availability';
import { AppointmentRow } from '@/components/AppointmentRow';
import { WalkInSheet } from '@/components/WalkInSheet';
import { money, relativeDay, time } from '@/lib/format';
import { KeyNotice } from '@/components/KeyNotice';
import { usingServiceRole } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function BarberDay({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);

  // Reads appointments and client records — staff-level access required.
  if (!usingServiceRole) return <KeyNotice surface="barber’s day" />;

  const barber = await getStaffMember(id);
  if (!barber || !barber.shop_id) notFound();

  const shops = await getShops();
  const shop = shops.find((s) => s.id === barber.shop_id);
  if (!shop) notFound();

  const now = DateTime.now().setZone(shop.timezone);
  const date = query.date ?? now.toISODate()!;
  const day = DateTime.fromISO(date, { zone: shop.timezone });

  const [appointments, services, { patterns, exceptions }] = await Promise.all([
    getDayForBarber(barber.id, date, shop.timezone),
    getServices(),
    getRota(barber.id),
  ]);

  const window = rotaWindowFor(date, shop.timezone, patterns, exceptions);

  // Walk-in slots for the rest of TODAY only — a barber booking someone back
  // in is always thinking about the next couple of hours.
  const busy = await getBusy(
    barber.id,
    day.startOf('day').toUTC().toISO()!,
    day.plus({ days: 1 }).startOf('day').toUTC().toISO()!
  );
  // One slot list PER SERVICE. Generating a single list from the shortest
  // service would offer a 14:30 slot for a 45-minute skin fade that collides
  // with the 15:15 booking — reserve() would refuse it, so nothing would break,
  // but offering a slot you are about to reject is a bad thing to do to someone
  // standing at the chair with a client in front of them.
  const slotsByService = Object.fromEntries(
    services.map((svc) => [
      svc.id,
      generateSlots({
        date,
        timezone: shop.timezone,
        durationMinutes: svc.duration_minutes,
        patterns,
        exceptions,
        busy,
        now,
        leadTimeMinutes: 0, // the barber can see the chair; the buffer is for clients
      }),
    ])
  );

  const live = appointments.find((a) => a.status === 'in_progress');
  const upcoming = appointments.filter(
    (a) => a.status === 'booked' && DateTime.fromISO(a.starts_at) > now
  );
  const next = upcoming[0];
  const atRisk = appointments.filter((a) => a.at_risk && a.status === 'booked');
  const takings = appointments
    .filter((a) => a.status === 'completed')
    .reduce((sum, a) => sum + a.service.price_pence, 0);
  const isToday = date === now.toISODate();

  // "Start" only appears on work that is actually in front of the barber:
  // anything already due, plus the next 45 minutes. Everything later in the
  // day is visible but not actionable yet.
  const startableUntil = now.plus({ minutes: 45 });

  const dateHref = (d: DateTime) => `/staff/${barber.id}?date=${d.toISODate()}`;

  return (
    <main className="min-h-screen pb-28">
      <div className="pole-rule" />

      {/* --------------------------------------------------------- header -- */}
      <header className="sticky top-0 z-30 border-b border-ink-3 bg-ink/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <Link href="/staff" className="font-mono text-xs text-muted hover:text-bone">
            ←
          </Link>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-ink-4 font-mono text-[0.625rem] tracking-widest text-bone/70">
            {barber.initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm leading-tight">{barber.name}</p>
            <p className="truncate font-mono text-[0.625rem] uppercase tracking-widest text-muted">
              {shop.name.replace('Sharp & Sons — ', '')}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Link href={dateHref(day.minus({ days: 1 }))} className="btn btn-ghost !px-2.5 !py-1.5 !text-[0.625rem]">
              ‹
            </Link>
            <Link href={dateHref(day.plus({ days: 1 }))} className="btn btn-ghost !px-2.5 !py-1.5 !text-[0.625rem]">
              ›
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="reveal flex items-baseline justify-between gap-4">
          <h1 className="text-3xl">{relativeDay(date, shop.timezone)}</h1>
          <p className="num text-xs text-muted">
            {window ? `${window.start.toFormat('HH:mm')}–${window.end.toFormat('HH:mm')}` : 'Not working'}
          </p>
        </div>

        {/* ------------------------------------------------------ at risk -- */}
        {atRisk.length > 0 && isToday && (
          <div className="reveal mt-5 border-l-2 border-brass bg-brass/5 px-4 py-3">
            <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-brass">
              Running late
            </p>
            <p className="mt-1 text-sm leading-relaxed text-bone/80">
              {atRisk.length === 1 ? 'The' : `${atRisk.length} of the`} next appointment
              {atRisk.length > 1 ? 's are' : ' is'} at risk because the chair is still busy.
              Nothing has been moved.
            </p>
          </div>
        )}

        {/* --------------------------------------------------------- now -- */}
        {isToday && (
          <div className="reveal mt-5 grid grid-cols-2 gap-px bg-ink-3" style={{ animationDelay: '60ms' }}>
            <div className="bg-ink-2 px-4 py-4">
              <p className="eyebrow">In the chair</p>
              {live ? (
                <>
                  <p className="mt-1.5 truncate text-lg text-jade-hi">
                    {live.client?.name ?? 'Walk-in'}
                  </p>
                  <p className="num text-xs text-muted">
                    started {live.started_at ? time(live.started_at) : time(live.starts_at)}
                  </p>
                </>
              ) : (
                <p className="mt-1.5 text-lg text-muted">Empty</p>
              )}
            </div>
            <div className="bg-ink-2 px-4 py-4">
              <p className="eyebrow">Next up</p>
              {next ? (
                <>
                  <p className="mt-1.5 truncate text-lg">{next.client?.name ?? 'Walk-in'}</p>
                  <p className="num text-xs text-muted">{time(next.starts_at)}</p>
                </>
              ) : (
                <p className="mt-1.5 text-lg text-muted">Nothing booked</p>
              )}
            </div>
          </div>
        )}

        {/* ---------------------------------------------------- timeline -- */}
        <div className="mt-6 space-y-px">
          {appointments.length === 0 ? (
            <p className="border border-ink-3 px-4 py-10 text-center text-sm text-muted">
              {window ? 'Nothing in the book for this day.' : `${barber.name.split(' ')[0]} isn’t working.`}
            </p>
          ) : (
            appointments.map((appt, i) => (
              <div key={appt.id} className="reveal" style={{ animationDelay: `${Math.min(i * 30, 400)}ms` }}>
                <AppointmentRow
                  appt={appt}
                  isPast={DateTime.fromISO(appt.starts_at) < now}
                  startable={isToday && DateTime.fromISO(appt.starts_at) <= startableUntil}
                />
              </div>
            ))
          )}
        </div>

        {/* ------------------------------------------------------ footer -- */}
        <div className="mt-6 grid grid-cols-3 gap-px bg-ink-3">
          {[
            ['In the book', String(appointments.length)],
            ['Done', String(appointments.filter((a) => a.status === 'completed').length)],
            ['Expected', money(takings)],
          ].map(([k, v]) => (
            <div key={k} className="bg-ink px-3 py-4 text-center">
              <p className="eyebrow">{k}</p>
              <p className="num mt-1 text-xl">{v}</p>
            </div>
          ))}
        </div>

        <p className="mt-4 text-center text-[0.6875rem] leading-relaxed text-muted">
          “Expected” is the flat catalogue price of completed cuts — not takings. Card sales run
          on a separate terminal, so this will not reconcile with the till and is never presented
          as if it does.
        </p>
      </div>

      {window && isToday && (
        <WalkInSheet
          shopId={shop.id}
          barberId={barber.id}
          services={services}
          slotsByService={slotsByService}
        />
      )}
    </main>
  );
}
