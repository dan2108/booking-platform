/**
 * Availability — PURE functions over plain data.
 *
 * PLAN.md §2: "Availability calculation, slot generation and rota expansion are
 * pure functions over plain data — unit-testable on fixtures with no database."
 *
 * Nothing in this file touches Supabase, the network, or the clock unless a
 * clock is passed in. That is deliberate: availability is the part of the
 * system most likely to be subtly wrong (variable rotas, holidays, British
 * Summer Time), and it is much cheaper to prove correct on fixtures than to
 * debug against a live database.
 *
 * Availability is also only ever a READ-SIDE CONVENIENCE. It can never
 * contradict the write-side guarantee: if this file says a slot is free and
 * two people race for it, the exclusion constraint still lets exactly one
 * through and the other is told "that slot just went". See
 * supabase/migrations/0002_no_double_booking.sql.
 */

import { DateTime, Interval } from 'luxon';

/** 1 = Monday … 7 = Sunday (ISO-8601, matches Luxon's `weekday`). */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface RotaPattern {
  weekday: number;
  /** Wall-clock local time at the shop, "HH:mm" or "HH:mm:ss". */
  start_time: string;
  end_time: string;
}

export interface RotaException {
  /** "YYYY-MM-DD" */
  date: string;
  /** Both null = an explicit day off that overrides the weekly pattern. */
  start_time: string | null;
  end_time: string | null;
}

export interface BusyInterval {
  /** ISO-8601 instants. */
  starts_at: string;
  ends_at: string;
}

export interface Slot {
  /** ISO-8601 instant, UTC. */
  startsAt: string;
  endsAt: string;
  /** "HH:mm" in the shop's local time — what the client actually reads. */
  label: string;
  available: boolean;
  reason?: 'busy' | 'too_soon' | 'past' | 'outside_rota';
}

export interface RotaWindow {
  start: DateTime;
  end: DateTime;
  /** Where the hours came from — useful in the rota editor and for debugging. */
  source: 'pattern' | 'exception';
}

function parseLocalTime(day: DateTime, hhmm: string): DateTime {
  const [h, m] = hhmm.split(':').map(Number);
  return day.set({ hour: h, minute: m ?? 0, second: 0, millisecond: 0 });
}

/**
 * Resolve one barber's working window for one calendar date.
 *
 * Exceptions beat patterns. An exception with null times is a day off, which is
 * different from "no exception row" — that distinction is why holidays work.
 *
 * The date is resolved in the SHOP's timezone, not the server's. A rota that
 * reads "Tuesdays 09:00–18:00" means 08:00Z in winter and 09:00Z... no —
 * 09:00Z in winter and 08:00Z under British Summer Time. Hard-coding either
 * puts every appointment an hour out for half the year.
 */
export function rotaWindowFor(
  date: string,
  timezone: string,
  patterns: RotaPattern[],
  exceptions: RotaException[] = []
): RotaWindow | null {
  const day = DateTime.fromISO(date, { zone: timezone }).startOf('day');
  if (!day.isValid) return null;

  const exception = exceptions.find((e) => e.date === date);
  if (exception) {
    if (!exception.start_time || !exception.end_time) return null; // day off
    return {
      start: parseLocalTime(day, exception.start_time),
      end: parseLocalTime(day, exception.end_time),
      source: 'exception',
    };
  }

  const pattern = patterns.find((p) => p.weekday === day.weekday);
  if (!pattern) return null; // not rostered this weekday

  return {
    start: parseLocalTime(day, pattern.start_time),
    end: parseLocalTime(day, pattern.end_time),
    source: 'pattern',
  };
}

export interface GenerateSlotsInput {
  date: string;
  timezone: string;
  durationMinutes: number;
  patterns: RotaPattern[];
  exceptions?: RotaException[];
  /** Existing appointments that block the barber. */
  busy?: BusyInterval[];
  /** How far apart candidate start times are. */
  granularityMinutes?: number;
  /**
   * Nobody may book a slot closer than this to now — stops a client taking a
   * slot minutes away while a walk-in is mid-cut (REQUIREMENTS.md §9).
   */
  leadTimeMinutes?: number;
  /** Injected so tests are deterministic and never flake on wall-clock time. */
  now?: DateTime;
  /** Include unbookable slots in the output, flagged with a reason. */
  includeUnavailable?: boolean;
}

export function generateSlots({
  date,
  timezone,
  durationMinutes,
  patterns,
  exceptions = [],
  busy = [],
  granularityMinutes = 15,
  leadTimeMinutes = 30,
  now = DateTime.now(),
  includeUnavailable = false,
}: GenerateSlotsInput): Slot[] {
  const window = rotaWindowFor(date, timezone, patterns, exceptions);
  if (!window) return [];

  const busyIntervals = busy.map((b) =>
    Interval.fromDateTimes(DateTime.fromISO(b.starts_at), DateTime.fromISO(b.ends_at))
  );

  const earliest = now.plus({ minutes: leadTimeMinutes });
  const slots: Slot[] = [];

  let cursor = window.start;
  while (cursor.plus({ minutes: durationMinutes }) <= window.end) {
    const slotEnd = cursor.plus({ minutes: durationMinutes });
    const candidate = Interval.fromDateTimes(cursor, slotEnd);

    let reason: Slot['reason'] | undefined;
    if (cursor < now) {
      reason = 'past';
    } else if (cursor < earliest) {
      reason = 'too_soon';
    } else if (busyIntervals.some((b) => b.overlaps(candidate))) {
      reason = 'busy';
    }

    if (!reason || includeUnavailable) {
      slots.push({
        startsAt: cursor.toUTC().toISO()!,
        endsAt: slotEnd.toUTC().toISO()!,
        label: cursor.setZone(timezone).toFormat('HH:mm'),
        available: !reason,
        ...(reason ? { reason } : {}),
      });
    }

    cursor = cursor.plus({ minutes: granularityMinutes });
  }

  return slots;
}

/** The next N dates from `from`, as "YYYY-MM-DD" in the shop's timezone. */
export function upcomingDates(from: DateTime, count: number, timezone: string): string[] {
  const start = from.setZone(timezone).startOf('day');
  return Array.from({ length: count }, (_, i) => start.plus({ days: i }).toISODate()!);
}

/**
 * Does this barber have ANY bookable slot on this date? Used to grey out days
 * in the date strip so clients do not tap into empty days.
 */
export function hasAvailability(input: GenerateSlotsInput): boolean {
  return generateSlots({ ...input, includeUnavailable: false }).length > 0;
}
