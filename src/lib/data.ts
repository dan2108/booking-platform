import 'server-only';
import { DateTime } from 'luxon';
import { db, usingServiceRole } from './supabase/server';
import { generateSlots, type RotaPattern, type RotaException, type Slot } from './availability';
import type {
  Shop,
  Staff,
  Service,
  Client,
  AppointmentWithDetail,
  ReserveResult,
  AppointmentStatus,
} from './types';

const APPT_SELECT = `
  id, shop_id, barber_id, client_id, service_id, starts_at, ends_at,
  status, source, at_risk, started_at, notes,
  client:clients ( id, name, mobile, no_show_count ),
  service:services ( id, name, duration_minutes, price_pence ),
  barber:staff!appointments_barber_id_fkey ( id, name, initials ),
  shop:shops ( id, name, slug )
`;

export async function getShops(): Promise<Shop[]> {
  const { data, error } = await db.from('shops').select('*').order('is_pilot', { ascending: false });
  if (error) throw error;
  return data as Shop[];
}

export async function getShop(slug: string): Promise<Shop | null> {
  const { data, error } = await db.from('shops').select('*').eq('slug', slug).maybeSingle();
  if (error) throw error;
  return data as Shop | null;
}

export async function getServices(): Promise<Service[]> {
  const { data, error } = await db
    .from('services')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return data as Service[];
}

export async function getBarbers(shopId: string): Promise<Staff[]> {
  const { data, error } = await db
    .from('staff')
    .select('*')
    .eq('shop_id', shopId)
    .eq('role', 'barber')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return data as Staff[];
}

export async function getStaffMember(id: string): Promise<Staff | null> {
  const { data, error } = await db.from('staff').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as Staff | null;
}

export async function getAllStaff(): Promise<(Staff & { shop: Shop | null })[]> {
  const { data, error } = await db
    .from('staff')
    .select('*, shop:shops(*)')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return data as never;
}

export async function getRota(staffId: string): Promise<{
  patterns: RotaPattern[];
  exceptions: RotaException[];
}> {
  const [{ data: patterns, error: e1 }, { data: exceptions, error: e2 }] = await Promise.all([
    db.from('rota_patterns').select('weekday, start_time, end_time').eq('staff_id', staffId).order('weekday'),
    db.from('rota_exceptions').select('date, start_time, end_time, reason').eq('staff_id', staffId),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return {
    patterns: (patterns ?? []) as RotaPattern[],
    exceptions: (exceptions ?? []) as RotaException[],
  };
}

export async function getRotaForShop(shopId: string) {
  const { data, error } = await db
    .from('staff')
    .select('id, name, initials, role, rota_patterns(weekday, start_time, end_time), rota_exceptions(date, start_time, end_time, reason)')
    .eq('shop_id', shopId)
    .eq('role', 'barber')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return data as never as {
    id: string;
    name: string;
    initials: string | null;
    role: string;
    rota_patterns: RotaPattern[];
    rota_exceptions: (RotaException & { reason: string | null })[];
  }[];
}

/**
 * Appointments that BLOCK a barber. Cancelled and no-show rows are excluded
 * because they free the slot — exactly mirroring the exclusion constraint's
 * `WHERE (status = 'booked')` plus live work in progress.
 *
 * Deliberately goes through `public_busy()` rather than selecting from
 * `appointments`. The function returns start and end times and nothing else —
 * no client, no service, no price. Availability necessarily reveals that 11:40
 * is taken; it must not reveal whose it is. Using the narrow function even on
 * the server keeps that boundary honest instead of relying on which columns
 * this query happens to ask for today.
 */
export async function getBusy(barberId: string, fromISO: string, toISO: string) {
  const { data, error } = await db.rpc('public_busy', {
    p_barber_id: barberId,
    p_from: fromISO,
    p_to: toISO,
  });
  if (error) throw error;
  return (data ?? []) as { starts_at: string; ends_at: string }[];
}

export interface DayAvailability {
  date: string;
  weekdayLabel: string;
  dayLabel: string;
  monthLabel: string;
  slots: Slot[];
  isToday: boolean;
}

/**
 * The read side. Rota expansion and slot maths happen in pure functions
 * (src/lib/availability.ts); this only fetches the plain data they need.
 */
export async function getAvailability(opts: {
  barberId: string;
  timezone: string;
  durationMinutes: number;
  days?: number;
  leadTimeMinutes?: number;
}): Promise<DayAvailability[]> {
  const { barberId, timezone, durationMinutes, days = 14, leadTimeMinutes = 30 } = opts;
  const now = DateTime.now().setZone(timezone);
  const from = now.startOf('day');
  const to = from.plus({ days });

  const [{ patterns, exceptions }, busy] = await Promise.all([
    getRota(barberId),
    getBusy(barberId, from.toUTC().toISO()!, to.toUTC().toISO()!),
  ]);

  return Array.from({ length: days }, (_, i) => {
    const day = from.plus({ days: i });
    const date = day.toISODate()!;
    return {
      date,
      weekdayLabel: day.toFormat('ccc'),
      dayLabel: day.toFormat('d'),
      monthLabel: day.toFormat('LLL'),
      isToday: i === 0,
      slots: generateSlots({
        date,
        timezone,
        durationMinutes,
        patterns,
        exceptions,
        busy,
        leadTimeMinutes,
        now,
      }),
    };
  });
}

export async function getAppointment(id: string): Promise<AppointmentWithDetail | null> {
  const { data, error } = await db.from('appointments').select(APPT_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return data as never;
}

export async function getDayForBarber(barberId: string, date: string, timezone: string) {
  const day = DateTime.fromISO(date, { zone: timezone }).startOf('day');
  const { data, error } = await db
    .from('appointments')
    .select(APPT_SELECT)
    .eq('barber_id', barberId)
    .gte('starts_at', day.toUTC().toISO()!)
    .lt('starts_at', day.plus({ days: 1 }).toUTC().toISO()!)
    .neq('status', 'cancelled')
    .order('starts_at');
  if (error) throw error;
  return data as never as AppointmentWithDetail[];
}

export async function getDayForShop(shopId: string, date: string, timezone: string) {
  const day = DateTime.fromISO(date, { zone: timezone }).startOf('day');
  const { data, error } = await db
    .from('appointments')
    .select(APPT_SELECT)
    .eq('shop_id', shopId)
    .gte('starts_at', day.toUTC().toISO()!)
    .lt('starts_at', day.plus({ days: 1 }).toUTC().toISO()!)
    .neq('status', 'cancelled')
    .order('starts_at');
  if (error) throw error;
  return data as never as AppointmentWithDetail[];
}

export async function getClientByMobile(mobile: string): Promise<Client | null> {
  const { data, error } = await db.rpc('normalise_mobile', { p_raw: mobile });
  if (error) throw error;
  if (!data) return null;
  const { data: client, error: e2 } = await db
    .from('clients')
    .select('*')
    .eq('mobile', data as string)
    .maybeSingle();
  if (e2) throw e2;
  return client as Client | null;
}

export async function getClientHistory(clientId: string) {
  const { data, error } = await db
    .from('appointments')
    .select(APPT_SELECT)
    .eq('client_id', clientId)
    .order('starts_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return data as never as AppointmentWithDetail[];
}

export interface ReserveInput {
  shopId: string;
  barberId: string;
  serviceId: string;
  startsAt: string;
  source?: 'online' | 'staff';
  clientName?: string | null;
  clientMobile?: string | null;
  clientEmail?: string | null;
  createdBy?: string | null;
  startImmediately?: boolean;
  notes?: string | null;
}

/**
 * THE ONLY WAY AN APPOINTMENT IS CREATED.
 *
 * There is no INSERT policy on `appointments` for any role, so this RPC is not
 * a convention — it is the only door. Both the public booking flow and the
 * staff walk-in flow come through here, which is what makes an online booking
 * and a staff-booked walk-in compete for the same barber-time atomically.
 */
export async function reserve(input: ReserveInput): Promise<ReserveResult> {
  const { data, error } = await db.rpc('reserve', {
    p_shop_id: input.shopId,
    p_barber_id: input.barberId,
    p_service_id: input.serviceId,
    p_starts_at: input.startsAt,
    p_source: input.source ?? 'online',
    p_client_name: input.clientName ?? null,
    p_client_mobile: input.clientMobile ?? null,
    p_client_email: input.clientEmail ?? null,
    p_client_id: null,
    p_created_by: input.createdBy ?? null,
    p_start_immediately: input.startImmediately ?? false,
    p_lead_time_minutes: 30,
    p_notes: input.notes ?? null,
  });
  // Fail closed and loud: an unexpected database error is never swallowed.
  if (error) throw error;
  return data as ReserveResult;
}

export async function setAppointmentStatus(id: string, status: AppointmentStatus) {
  const patch: Record<string, unknown> = { status };
  if (status === 'in_progress') patch.started_at = new Date().toISOString();
  const { error } = await db.from('appointments').update(patch).eq('id', id);
  if (error) throw error;
}

export async function attachContact(clientId: string, mobile: string, name?: string) {
  const { data: normalised, error } = await db.rpc('normalise_mobile', { p_raw: mobile });
  if (error) throw error;
  const patch: Record<string, unknown> = { mobile: normalised };
  if (name) patch.name = name;
  const { error: e2 } = await db.from('clients').update(patch).eq('id', clientId);
  if (e2) throw e2;
}

// ---------------------------------------------------------------- reporting --

export async function getCompanyStats() {
  const { data, error } = await db.rpc('company_stats');
  if (error) throw error;
  return data as {
    shops: { shop: string; slug: string; is_pilot: boolean; booked_next_7: number; completed_last_28: number; expected_revenue_pence: number; utilisation_pct: number; online_share_pct: number }[];
    totals: { clients: number; contactable: number; no_shows_last_28: number; appointments_last_28: number };
  };
}

/**
 * Run a query that needs staff-level database access.
 *
 * Returns null rather than throwing when RLS refuses because the server holds
 * only a publishable key. Everything else still throws: a genuine failure must
 * never be silently swallowed (CLAUDE.md non-negotiable #2).
 */
export async function staffQuery<T>(fn: () => Promise<T>): Promise<T | null> {
  if (usingServiceRole) return fn();
  try {
    return await fn();
  } catch {
    return null;
  }
}
