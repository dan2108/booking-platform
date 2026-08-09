/**
 * Layer 2 definition of done (PLAN.md §5):
 *   "pure-function tests pass on fixtures covering variable hours, exceptions,
 *    existing appointments and the buffer"
 *
 * No database, no network, no real clock. `now` is injected everywhere so these
 * cannot flake.
 */

import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import {
  rotaWindowFor,
  generateSlots,
  hasAvailability,
  type RotaPattern,
  type RotaException,
} from '../src/lib/availability';

const TZ = 'Europe/London';

// Tino Rossi's real seeded week: genuinely variable hours, off Mondays and
// Sundays, late start on Thursdays.
const TINO: RotaPattern[] = [
  { weekday: 2, start_time: '09:00', end_time: '18:00' }, // Tue
  { weekday: 3, start_time: '09:00', end_time: '18:00' }, // Wed
  { weekday: 4, start_time: '11:00', end_time: '20:00' }, // Thu — late start
  { weekday: 5, start_time: '09:00', end_time: '18:00' }, // Fri
  { weekday: 6, start_time: '08:30', end_time: '17:00' }, // Sat — early start
];

// 2026-08-04 is a Tuesday. 08-03 Monday, 08-06 Thursday, 08-08 Saturday,
// 08-09 Sunday.
const TUE = '2026-08-04';
const MON = '2026-08-03';
const THU = '2026-08-06';
const SAT = '2026-08-08';
const SUN = '2026-08-09';

const at = (iso: string) => DateTime.fromISO(iso, { zone: TZ });

describe('rotaWindowFor — variable weekly hours', () => {
  it('resolves a normal rostered day from the weekly pattern', () => {
    const w = rotaWindowFor(TUE, TZ, TINO)!;
    expect(w.source).toBe('pattern');
    expect(w.start.toFormat('HH:mm')).toBe('09:00');
    expect(w.end.toFormat('HH:mm')).toBe('18:00');
  });

  it('returns null on a weekday the barber is not rostered', () => {
    expect(rotaWindowFor(MON, TZ, TINO)).toBeNull();
    expect(rotaWindowFor(SUN, TZ, TINO)).toBeNull();
  });

  it('respects per-weekday variation rather than one set of shop hours', () => {
    expect(rotaWindowFor(THU, TZ, TINO)!.start.toFormat('HH:mm')).toBe('11:00');
    expect(rotaWindowFor(SAT, TZ, TINO)!.start.toFormat('HH:mm')).toBe('08:30');
  });
});

describe('rotaWindowFor — exceptions beat patterns', () => {
  it('treats an exception with null times as a day off', () => {
    const holiday: RotaException[] = [{ date: TUE, start_time: null, end_time: null }];
    expect(rotaWindowFor(TUE, TZ, TINO, holiday)).toBeNull();
  });

  it('lets a one-off change override the pattern hours', () => {
    const lateStart: RotaException[] = [
      { date: TUE, start_time: '13:00', end_time: '20:00' },
    ];
    const w = rotaWindowFor(TUE, TZ, TINO, lateStart)!;
    expect(w.source).toBe('exception');
    expect(w.start.toFormat('HH:mm')).toBe('13:00');
    expect(w.end.toFormat('HH:mm')).toBe('20:00');
  });

  it('can create a working day on a weekday with no pattern at all', () => {
    const coveringShift: RotaException[] = [
      { date: MON, start_time: '10:00', end_time: '14:00' },
    ];
    const w = rotaWindowFor(MON, TZ, TINO, coveringShift)!;
    expect(w.start.toFormat('HH:mm')).toBe('10:00');
  });

  it('ignores exceptions belonging to a different date', () => {
    const elsewhere: RotaException[] = [{ date: THU, start_time: null, end_time: null }];
    expect(rotaWindowFor(TUE, TZ, TINO, elsewhere)).not.toBeNull();
  });
});

describe('generateSlots — shape of the day', () => {
  const base = {
    date: TUE,
    timezone: TZ,
    durationMinutes: 30,
    patterns: TINO,
    now: at('2026-08-03T12:00'), // the day before, so nothing is in the past
  };

  it('starts at the rota start and never runs past the rota end', () => {
    const slots = generateSlots(base);
    expect(slots[0].label).toBe('09:00');
    const last = slots[slots.length - 1];
    expect(DateTime.fromISO(last.endsAt).setZone(TZ).toFormat('HH:mm')).toBe('18:00');
  });

  it('never generates a slot whose END would overrun the shift', () => {
    // 45-minute service in a 09:00-18:00 window: last start must be 17:15
    const slots = generateSlots({ ...base, durationMinutes: 45 });
    expect(slots[slots.length - 1].label).toBe('17:15');
  });

  it('returns nothing on a non-working day', () => {
    expect(generateSlots({ ...base, date: MON })).toEqual([]);
  });

  it('respects the granularity', () => {
    const slots = generateSlots({ ...base, granularityMinutes: 60 });
    expect(slots.map((s) => s.label).slice(0, 3)).toEqual(['09:00', '10:00', '11:00']);
  });
});

describe('generateSlots — existing appointments block the barber', () => {
  const base = {
    date: TUE,
    timezone: TZ,
    durationMinutes: 30,
    patterns: TINO,
    granularityMinutes: 30,
    now: at('2026-08-03T12:00'),
  };

  it('removes slots that overlap an existing appointment', () => {
    const slots = generateSlots({
      ...base,
      busy: [{ starts_at: at(`${TUE}T10:00`).toISO()!, ends_at: at(`${TUE}T11:00`).toISO()! }],
    });
    const labels = slots.map((s) => s.label);
    expect(labels).not.toContain('10:00');
    expect(labels).not.toContain('10:30');
    expect(labels).toContain('09:30');
    expect(labels).toContain('11:00');
  });

  it('allows a slot that ends exactly when an appointment begins', () => {
    // half-open intervals: [09:30,10:00) and [10:00,11:00) do not overlap
    const slots = generateSlots({
      ...base,
      busy: [{ starts_at: at(`${TUE}T10:00`).toISO()!, ends_at: at(`${TUE}T11:00`).toISO()! }],
    });
    expect(slots.map((s) => s.label)).toContain('09:30');
  });

  it('blocks a long service that would straddle an existing appointment', () => {
    const slots = generateSlots({
      ...base,
      durationMinutes: 60,
      busy: [{ starts_at: at(`${TUE}T10:00`).toISO()!, ends_at: at(`${TUE}T10:30`).toISO()! }],
    });
    const labels = slots.map((s) => s.label);
    expect(labels).not.toContain('09:30'); // 09:30-10:30 straddles it
    expect(labels).not.toContain('10:00');
    expect(labels).toContain('10:30');
  });

  it('handles a fully booked day', () => {
    const slots = generateSlots({
      ...base,
      busy: [{ starts_at: at(`${TUE}T09:00`).toISO()!, ends_at: at(`${TUE}T18:00`).toISO()! }],
    });
    expect(slots).toEqual([]);
  });
});

describe('generateSlots — the lead-time buffer', () => {
  const base = {
    date: TUE,
    timezone: TZ,
    durationMinutes: 30,
    patterns: TINO,
    granularityMinutes: 30,
  };

  it('hides slots inside the buffer but keeps the ones beyond it', () => {
    const slots = generateSlots({
      ...base,
      now: at(`${TUE}T10:00`),
      leadTimeMinutes: 30,
    });
    const labels = slots.map((s) => s.label);
    expect(labels).not.toContain('10:00');
    expect(labels).not.toContain('10:15');
    expect(labels).toContain('10:30');
  });

  it('hides everything already in the past', () => {
    const slots = generateSlots({ ...base, now: at(`${TUE}T14:00`), leadTimeMinutes: 0 });
    expect(slots.every((s) => s.label >= '14:00')).toBe(true);
  });

  it('reports WHY a slot is unavailable when asked', () => {
    const slots = generateSlots({
      ...base,
      now: at(`${TUE}T10:00`),
      leadTimeMinutes: 30,
      includeUnavailable: true,
      busy: [{ starts_at: at(`${TUE}T12:00`).toISO()!, ends_at: at(`${TUE}T12:30`).toISO()! }],
    });
    const byLabel = Object.fromEntries(slots.map((s) => [s.label, s]));
    expect(byLabel['09:00'].reason).toBe('past');
    expect(byLabel['10:00'].reason).toBe('too_soon');
    expect(byLabel['12:00'].reason).toBe('busy');
    expect(byLabel['13:00'].available).toBe(true);
  });

  it('returns an empty day when the buffer swallows the remaining shift', () => {
    expect(
      generateSlots({ ...base, now: at(`${TUE}T17:50`), leadTimeMinutes: 30 })
    ).toEqual([]);
  });
});

describe('British Summer Time — the bug that books everyone an hour out', () => {
  it('anchors a rota to wall-clock local time in summer', () => {
    // 04 Aug 2026 is BST (UTC+1), so a 09:00 local start is 08:00Z
    const slots = generateSlots({
      date: TUE,
      timezone: TZ,
      durationMinutes: 30,
      patterns: TINO,
      now: at('2026-08-03T12:00'),
    });
    expect(slots[0].startsAt).toBe('2026-08-04T08:00:00.000Z');
    expect(slots[0].label).toBe('09:00');
  });

  it('anchors the same rota correctly in winter', () => {
    // 06 Jan 2026 is a Tuesday in GMT (UTC+0), so 09:00 local is 09:00Z
    const slots = generateSlots({
      date: '2026-01-06',
      timezone: TZ,
      durationMinutes: 30,
      patterns: TINO,
      now: at('2026-01-05T12:00'),
    });
    expect(slots[0].startsAt).toBe('2026-01-06T09:00:00.000Z');
    expect(slots[0].label).toBe('09:00');
  });

  it('still produces a full shift on the spring-forward day', () => {
    // 29 Mar 2026: clocks go forward at 01:00. A 09:00-18:00 shift is unaffected
    // in wall-clock terms but is one hour shorter in absolute time overnight.
    const sundayWorker: RotaPattern[] = [{ weekday: 7, start_time: '09:00', end_time: '18:00' }];
    const slots = generateSlots({
      date: '2026-03-29',
      timezone: TZ,
      durationMinutes: 60,
      granularityMinutes: 60,
      patterns: sundayWorker,
      now: at('2026-03-28T12:00'),
    });
    expect(slots).toHaveLength(9);
    expect(slots[0].label).toBe('09:00');
  });
});

describe('hasAvailability', () => {
  const base = {
    timezone: TZ,
    durationMinutes: 30,
    patterns: TINO,
    now: at('2026-08-03T12:00'),
  };

  it('is false on a day off and true on a working day', () => {
    expect(hasAvailability({ ...base, date: MON })).toBe(false);
    expect(hasAvailability({ ...base, date: TUE })).toBe(true);
  });

  it('is false once the day is completely full', () => {
    expect(
      hasAvailability({
        ...base,
        date: TUE,
        busy: [{ starts_at: at(`${TUE}T09:00`).toISO()!, ends_at: at(`${TUE}T18:00`).toISO()! }],
      })
    ).toBe(false);
  });
});
