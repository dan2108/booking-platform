/**
 * Integration tests against a real Postgres.
 *
 * These are the tests that matter. The pure-function suite proves the maths;
 * this suite proves the GUARANTEE — and it does it the only way a concurrency
 * guarantee can honestly be proved: with genuinely concurrent connections
 * racing each other against a real database.
 *
 *   pnpm db:up && pnpm test:db
 *
 * Requires a local Postgres (scripts/local-db.sh). No cloud account needed:
 * the correctness core is plain Postgres, not a Supabase feature.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool, Client } from 'pg';
import { DateTime } from 'luxon';

const CONN = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5433/booking';
const TZ = 'Europe/London';

let pool: Pool;
let ctx: {
  shopId: string;
  barberId: string;
  otherBarberId: string;
  serviceId: string;      // Cut & Style, 30 min
  longServiceId: string;  // Cut & Beard, 60 min
};

/** A time the barber is genuinely rostered for and has nothing booked in. */
async function freeSlot(barberId: string, minutes = 30, daysAhead = 1): Promise<string> {
  for (let d = daysAhead; d <= 14; d++) {
    const { rows } = await pool.query<{ g: Date }>(
      `select g from generate_series(
           (current_date + $2::int + time '09:00') at time zone $3,
           (current_date + $2::int + time '18:00') at time zone $3,
           interval '15 minutes') g
        where staff_is_working($1, g, g + make_interval(mins => $4::int))
          and not exists (
            select 1 from appointments a
             where a.barber_id = $1
               and a.status in ('booked','in_progress')
               and tstzrange(a.starts_at, a.ends_at, '[)')
                && tstzrange(g, g + make_interval(mins => $4::int), '[)'))
        limit 1`,
      [barberId, d, TZ, minutes]
    );
    if (rows.length) return rows[0].g.toISOString();
  }
  throw new Error('no free slot in the next fortnight — is the database seeded?');
}

const reserveSql = `select reserve(
  p_shop_id           => $1,
  p_barber_id         => $2,
  p_service_id        => $3,
  p_starts_at         => $4::timestamptz,
  p_source            => $5::appointment_source,
  p_client_name       => $6,
  p_client_mobile     => $7,
  p_lead_time_minutes => $8::int
) as r`;

type ReserveOk = { ok: true; appointment_id: string; client_id: string | null; status: string };
type ReserveErr = { ok: false; code: string; message: string };
type Reserved = ReserveOk | ReserveErr;

async function reserve(
  opts: Partial<{
    barberId: string;
    serviceId: string;
    startsAt: string;
    source: 'online' | 'staff';
    name: string | null;
    mobile: string | null;
    leadTime: number;
  }> = {}
): Promise<Reserved> {
  const { rows } = await pool.query<{ r: Reserved }>(reserveSql, [
    ctx.shopId,
    opts.barberId ?? ctx.barberId,
    opts.serviceId ?? ctx.serviceId,
    opts.startsAt ?? (await freeSlot(ctx.barberId)),
    opts.source ?? 'online',
    // `undefined` means "not specified"; an explicit null must stay null, so
    // the anonymous-walk-in path can actually be tested
    opts.name === undefined ? 'Test Client' : opts.name,
    opts.mobile === undefined ? '+447700900999' : opts.mobile,
    opts.leadTime ?? 30,
  ]);
  return rows[0].r;
}

beforeAll(async () => {
  pool = new Pool({ connectionString: CONN, max: 24 });

  const { rows: shops } = await pool.query(`select id from shops where slug = 'camden'`);
  const { rows: barbers } = await pool.query(
    `select id from staff where role = 'barber' and shop_id = $1 order by name`,
    [shops[0].id]
  );
  const { rows: services } = await pool.query(`select id, name from services`);

  ctx = {
    shopId: shops[0].id,
    barberId: barbers[0].id,
    otherBarberId: barbers[1].id,
    serviceId: services.find((s) => s.name === 'Cut & Style')!.id,
    longServiceId: services.find((s) => s.name === 'Cut & Beard')!.id,
  };
});

afterAll(async () => {
  await pool.query(`delete from appointments where notes = 'TEST' or notes is null and false`);
  await pool.end();
});

beforeEach(async () => {
  await pool.query(`delete from appointments where notes = 'TEST'`);
  await pool.query(`delete from clients where mobile like '+4477009009%'`);
});

// ===========================================================================

describe('the guarantee, under genuine concurrency', () => {
  it('lets exactly ONE of 12 simultaneous reservations win', async () => {
    const slot = await freeSlot(ctx.barberId);

    // 12 separate connections. They open first, then fire together, so the
    // race is real rather than serialised by connection setup.
    const clients = await Promise.all(
      Array.from({ length: 12 }, async () => {
        const c = new Client({ connectionString: CONN });
        await c.connect();
        return c;
      })
    );

    try {
      const results = await Promise.all(
        clients.map((c, i) =>
          c
            .query(reserveSql, [
              ctx.shopId,
              ctx.barberId,
              ctx.serviceId,
              slot,
              i % 2 === 0 ? 'online' : 'staff',
              `Racer ${i}`,
              `+44770090090${i % 10}`,
              30,
            ])
            .then((r) => r.rows[0].r as Reserved)
        )
      );

      const winners = results.filter((r) => r.ok);
      const losers = results.filter((r): r is ReserveErr => !r.ok);

      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(11);
      // every loser gets the same honest answer, not a crash
      expect(new Set(losers.map((l) => l.code))).toEqual(new Set(['slot_taken']));

      // and the database agrees — the only answer that actually counts
      const { rows } = await pool.query(
        `select count(*)::int as n from appointments
          where barber_id = $1 and starts_at = $2 and status = 'booked'`,
        [ctx.barberId, slot]
      );
      expect(rows[0].n).toBe(1);
    } finally {
      await Promise.all(clients.map((c) => c.end()));
      await pool.query(`delete from appointments where barber_id = $1 and starts_at = $2`, [
        ctx.barberId,
        slot,
      ]);
      await pool.query(`delete from clients where name like 'Racer %'`);
    }
  }, 30_000);

  it('holds when the SAME slot is raced from both entry surfaces', async () => {
    const slot = await freeSlot(ctx.barberId);
    const [online, walkIn] = await Promise.all([
      reserve({ startsAt: slot, source: 'online', mobile: '+447700900991' }),
      reserve({ startsAt: slot, source: 'staff', mobile: '+447700900992' }),
    ]);
    expect([online.ok, walkIn.ok].filter(Boolean)).toHaveLength(1);
    await pool.query(`delete from appointments where barber_id = $1 and starts_at = $2`, [
      ctx.barberId,
      slot,
    ]);
  });

  /**
   * Regression test for the deadlock fixed in migration 0009.
   *
   * The single-round race above passes most of the time even with the bug,
   * which is exactly why the bug survived: it is a ~15% per-round flake. This
   * repeats the race so the suite actually fails when reserve() can raise
   * instead of returning a structured result.
   *
   * Two separate assertions, and the difference matters:
   *   - exactly one winner per round  -> THE GUARANTEE. Held even before 0009.
   *   - no thrown exceptions          -> the FAILURE MODE. This is what broke.
   *
   * Distinct mobiles on purpose: sharing one mobile serialises the racers on
   * that client row and hides the deadlock entirely.
   */
  it('never raises instead of returning a result, over repeated races', async () => {
    const ROUNDS = 6;
    const RACERS = 12;
    const raised: string[] = [];

    for (let round = 0; round < ROUNDS; round++) {
      const slot = await freeSlot(ctx.barberId);
      const conns = await Promise.all(
        Array.from({ length: RACERS }, async () => {
          const c = new Client({ connectionString: CONN });
          await c.connect();
          return c;
        })
      );

      try {
        const results = await Promise.all(
          conns.map((c, i) =>
            c
              .query(reserveSql, [
                ctx.shopId,
                ctx.barberId,
                ctx.serviceId,
                slot,
                i % 2 === 0 ? 'online' : 'staff',
                `Flake ${round}-${i}`,
                `+4477009008${String(i).padStart(2, '0')}`,
                30,
              ])
              .then((r) => r.rows[0].r as Reserved)
              .catch((e: Error & { code?: string }) => {
                raised.push(`${e.code}: ${e.message}`);
                return { ok: false, code: 'threw', message: e.message } as Reserved;
              })
          )
        );

        expect(results.filter((r) => r.ok)).toHaveLength(1);
      } finally {
        await Promise.all(conns.map((c) => c.end()));
        await pool.query(`delete from appointments where barber_id = $1 and starts_at = $2`, [
          ctx.barberId,
          slot,
        ]);
        await pool.query(`delete from clients where mobile like '+4477009008%'`);
      }
    }

    // Losing a race is a structured 'slot_taken', never an exception. A
    // deadlock victim chosen arbitrarily by the database must not become a
    // lost booking (CLAUDE.md non-negotiable #2).
    expect(raised).toEqual([]);
  }, 60_000);

  it('lets two barbers hold the same time as each other', async () => {
    const slot = await freeSlot(ctx.barberId);
    const a = await reserve({ startsAt: slot, mobile: '+447700900993' });
    expect(a.ok).toBe(true);

    // the constraint is per barber, not global — this must still succeed if
    // the other barber happens to be free then
    const worksToo = await pool.query(
      `select staff_is_working($1, $2::timestamptz, $2::timestamptz + interval '30 min') as ok`,
      [ctx.otherBarberId, slot]
    );
    if (worksToo.rows[0].ok) {
      const b = await reserve({
        barberId: ctx.otherBarberId,
        startsAt: slot,
        mobile: '+447700900994',
      });
      expect(b.ok || (b as ReserveErr).code === 'slot_taken').toBe(true);
    }
    await pool.query(`delete from appointments where starts_at = $1`, [slot]);
  });
});

describe('cancelled and completed rows free the slot', () => {
  it('re-books a slot the moment the first booking is cancelled', async () => {
    const slot = await freeSlot(ctx.barberId);
    const first = (await reserve({ startsAt: slot, mobile: '+447700900995' })) as ReserveOk;
    expect(first.ok).toBe(true);

    const blocked = await reserve({ startsAt: slot, mobile: '+447700900996' });
    expect(blocked.ok).toBe(false);
    expect((blocked as ReserveErr).code).toBe('slot_taken');

    await pool.query(`update appointments set status = 'cancelled' where id = $1`, [
      first.appointment_id,
    ]);

    const second = await reserve({ startsAt: slot, mobile: '+447700900996' });
    expect(second.ok).toBe(true); // no cleanup job, no delay

    await pool.query(`delete from appointments where starts_at = $1`, [slot]);
  });
});

describe('live overruns are allowed and flagged, never blocked', () => {
  it('permits work in progress to run past the next promised appointment', async () => {
    // two back-to-back bookings for the same barber
    const slot = await freeSlot(ctx.barberId, 60);
    const first = (await reserve({
      startsAt: slot,
      serviceId: ctx.longServiceId, // 60 minutes
      mobile: '+447700900997',
    })) as ReserveOk;
    expect(first.ok).toBe(true);

    const nextStart = DateTime.fromISO(slot).plus({ minutes: 60 }).toUTC().toISO()!;
    const second = (await reserve({
      startsAt: nextStart,
      mobile: '+447700900998',
    })) as ReserveOk;

    if (!second.ok) {
      // barber's shift ended; nothing to prove here
      await pool.query(`delete from appointments where id = $1`, [first.appointment_id]);
      return;
    }

    // the barber starts the long one LATE — it will now overrun the next
    await pool.query(
      `update appointments
          set status = 'in_progress', started_at = $2::timestamptz - interval '30 minutes'
        where id = $1`,
      [first.appointment_id, nextStart]
    );

    const { rows } = await pool.query(
      `select status, at_risk from appointments where id = any($1)`,
      [[first.appointment_id, second.appointment_id]]
    );

    // the chair was never blocked...
    expect(rows.find((r) => r.status === 'in_progress')).toBeTruthy();
    // ...and the appointment it threatens is flagged rather than moved
    const flagged = rows.filter((r) => r.at_risk);
    expect(flagged).toHaveLength(1);

    await pool.query(`delete from appointments where id = any($1)`, [
      [first.appointment_id, second.appointment_id],
    ]);
  });

  it('increments the client no-show counter exactly once', async () => {
    const slot = await freeSlot(ctx.barberId);
    const appt = (await reserve({ startsAt: slot, mobile: '+447700900989' })) as ReserveOk;

    const before = await pool.query(`select no_show_count from clients where id = $1`, [
      appt.client_id,
    ]);
    await pool.query(`update appointments set status = 'no_show' where id = $1`, [
      appt.appointment_id,
    ]);
    const after = await pool.query(`select no_show_count from clients where id = $1`, [
      appt.client_id,
    ]);
    expect(after.rows[0].no_show_count).toBe(before.rows[0].no_show_count + 1);

    // and reverses if the barber taps it by mistake
    await pool.query(`update appointments set status = 'completed' where id = $1`, [
      appt.appointment_id,
    ]);
    const reverted = await pool.query(`select no_show_count from clients where id = $1`, [
      appt.client_id,
    ]);
    expect(reverted.rows[0].no_show_count).toBe(before.rows[0].no_show_count);

    await pool.query(`delete from appointments where id = $1`, [appt.appointment_id]);
  });
});

describe('reserve() refuses what it should', () => {
  it('rejects a time outside the barber rota', async () => {
    const threeAm = DateTime.now()
      .setZone(TZ)
      .plus({ days: 2 })
      .set({ hour: 3, minute: 0, second: 0, millisecond: 0 })
      .toUTC()
      .toISO()!;
    const r = await reserve({ startsAt: threeAm });
    expect(r.ok).toBe(false);
    expect((r as ReserveErr).code).toBe('outside_rota');
  });

  it('rejects a time in the past', async () => {
    const r = await reserve({
      startsAt: DateTime.now().minus({ days: 1 }).toUTC().toISO()!,
    });
    expect(r.ok).toBe(false);
    expect((r as ReserveErr).code).toBe('in_past');
  });

  it('enforces the lead-time buffer for online bookings', async () => {
    const soon = DateTime.now().plus({ minutes: 5 }).toUTC().toISO()!;
    const r = await reserve({ startsAt: soon, source: 'online', leadTime: 30 });
    expect(r.ok).toBe(false);
    expect(['too_soon', 'outside_rota']).toContain((r as ReserveErr).code);
  });

  it('does NOT apply the lead-time buffer to staff at the chair', async () => {
    // a staff booking inside the buffer must fail for rota reasons at worst,
    // never for 'too_soon' — the barber can see the chair
    const soon = DateTime.now().plus({ minutes: 5 }).toUTC().toISO()!;
    const r = await reserve({ startsAt: soon, source: 'staff', mobile: null });
    if (!r.ok) expect((r as ReserveErr).code).not.toBe('too_soon');
  });

  it('requires a mobile for online bookings but never for walk-ins', async () => {
    const online = await reserve({ source: 'online', mobile: null, name: 'No Number' });
    expect(online.ok).toBe(false);
    expect((online as ReserveErr).code).toBe('mobile_required');

    const slot = await freeSlot(ctx.barberId);
    const walkIn = await reserve({
      startsAt: slot,
      source: 'staff',
      mobile: null,
      name: null,
    });
    expect(walkIn.ok).toBe(true);
    expect((walkIn as ReserveOk).client_id).toBeNull(); // genuinely anonymous
    await pool.query(`delete from appointments where id = $1`, [
      (walkIn as ReserveOk).appointment_id,
    ]);
  });

  it('refuses a barber who does not work at that shop', async () => {
    const { rows } = await pool.query(
      `select s.id from staff s join shops sh on sh.id = s.shop_id
        where sh.slug = 'shoreditch' and s.role = 'barber' limit 1`
    );
    const r = await reserve({ barberId: rows[0].id });
    expect(r.ok).toBe(false);
    expect((r as ReserveErr).code).toBe('barber_shop_mismatch');
  });
});

describe('one person, one client record', () => {
  it('resolves the same client however the number is typed', async () => {
    const variants = ['07700 900123', '+447700900123', '07700900123', '+44 7700 900123'];
    const ids = new Set<string>();

    for (const mobile of variants) {
      const slot = await freeSlot(ctx.barberId);
      const r = (await reserve({ startsAt: slot, mobile, name: 'Repeat Client' })) as ReserveOk;
      expect(r.ok).toBe(true);
      ids.add(r.client_id!);
      await pool.query(`delete from appointments where id = $1`, [r.appointment_id]);
    }

    expect(ids.size).toBe(1); // four spellings, one person
    await pool.query(`delete from clients where mobile = '+447700900123'`);
  });

  it('fills in blanks on a returning client without overwriting what they gave before', async () => {
    const slot1 = await freeSlot(ctx.barberId);
    const first = (await reserve({
      startsAt: slot1,
      mobile: '+447700900988',
      name: 'Real Name',
    })) as ReserveOk;

    await pool.query(`delete from appointments where id = $1`, [first.appointment_id]);

    const slot2 = await freeSlot(ctx.barberId);
    await reserve({ startsAt: slot2, mobile: '+447700900988', name: 'Typo Nmae' });

    const { rows } = await pool.query(`select name from clients where id = $1`, [first.client_id]);
    expect(rows[0].name).toBe('Real Name');

    await pool.query(`delete from appointments where barber_id = $1 and starts_at = $2`, [
      ctx.barberId,
      slot2,
    ]);
    await pool.query(`delete from clients where id = $1`, [first.client_id]);
  });
});

describe('tenancy is enforced by the database, not the application', () => {
  const asPersona = async (name: string, fn: (c: Client) => Promise<void>) => {
    const c = new Client({ connectionString: CONN });
    await c.connect();
    try {
      const { rows } = await c.query(`select auth_user_id from staff where name = $1`, [name]);
      await c.query('begin');
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: rows[0].auth_user_id, role: 'authenticated' }),
      ]);
      await c.query('set local role authenticated');
      await fn(c);
      await c.query('rollback');
    } finally {
      await c.end();
    }
  };

  const count = async (c: Client, sql: string, params: unknown[] = []) =>
    (await c.query<{ n: string }>(sql, params)).rows.length;

  it('stops a Camden manager reading anything of Shoreditch', async () => {
    await asPersona('Marcus Bell', async (c) => {
      const shoreditchAppts = await count(
        c,
        `select a.id from appointments a join shops s on s.id = a.shop_id where s.slug = 'shoreditch' limit 5`
      );
      const shoreditchStaff = await count(
        c,
        `select st.id from staff st join shops s on s.id = st.shop_id where s.slug = 'shoreditch' limit 5`
      );
      const shoreditchRotas = await count(
        c,
        `select rp.id from rota_patterns rp join staff st on st.id = rp.staff_id
           join shops s on s.id = st.shop_id where s.slug = 'shoreditch' limit 5`
      );
      expect(shoreditchAppts).toBe(0);
      expect(shoreditchStaff).toBe(0);
      expect(shoreditchRotas).toBe(0);

      const ownShop = await count(
        c,
        `select a.id from appointments a join shops s on s.id = a.shop_id where s.slug = 'camden' limit 5`
      );
      expect(ownShop).toBeGreaterThan(0);
    });
  });

  it('limits a barber to their own column, even inside their own shop', async () => {
    await asPersona('Tino Rossi', async (c) => {
      const { rows } = await c.query(
        `select count(distinct barber_id)::int as n from appointments`
      );
      expect(rows[0].n).toBeLessThanOrEqual(1);
    });
  });

  it('deliberately lets any staff member resolve any client, company-wide', async () => {
    const { rows: all } = await pool.query(`select count(*)::int as n from clients`);
    for (const persona of ['Tino Rossi', 'Marcus Bell', 'Sasha Nowak']) {
      await asPersona(persona, async (c) => {
        const { rows } = await c.query(`select count(*)::int as n from clients`);
        expect(rows[0].n).toBe(all[0].n);
      });
    }
  });

  it('still hides a client cross-shop HISTORY from a barber who is not entitled to it', async () => {
    await asPersona('Tino Rossi', async (c) => {
      const { rows } = await c.query(
        `select count(*)::int as n from appointments a
          join shops s on s.id = a.shop_id where s.slug <> 'camden'`
      );
      expect(rows[0].n).toBe(0);
    });
  });

  it('gives head office everything', async () => {
    const { rows: all } = await pool.query(`select count(*)::int as n from appointments`);
    await asPersona('Dan Holt', async (c) => {
      const { rows } = await c.query(`select count(*)::int as n from appointments`);
      expect(rows[0].n).toBe(all[0].n);
    });
  });

  it('gives NO role a way to insert an appointment directly', async () => {
    // the only door is reserve(); this is what makes it server-owned rather
    // than merely conventional
    for (const persona of ['Tino Rossi', 'Marcus Bell', 'Dan Holt']) {
      await asPersona(persona, async (c) => {
        const slot = DateTime.now().plus({ days: 3 }).toUTC().toISO();
        await expect(
          c.query(
            `insert into appointments (shop_id, barber_id, service_id, starts_at, ends_at, status)
             values ($1, $2, $3, $4::timestamptz, $4::timestamptz + interval '30 min', 'booked')`,
            [ctx.shopId, ctx.barberId, ctx.serviceId, slot]
          )
        ).rejects.toThrow();
      });
    }
  });
});

describe('the executable proofs used in the demo', () => {
  it('passes every case in proof_no_double_booking()', async () => {
    const { rows } = await pool.query(`select proof_no_double_booking() as p`);
    expect(rows[0].p.ok).toBe(true);
    expect(rows[0].p.all_passed).toBe(true);
    expect(rows[0].p.steps).toHaveLength(4);
    for (const step of rows[0].p.steps) expect(step.pass).toBe(true);
  });

  it('leaves no rows behind after running', async () => {
    await pool.query(`select proof_no_double_booking()`);
    const { rows } = await pool.query(
      `select count(*)::int as n from appointments where notes like 'PROOF-%'`
    );
    expect(rows[0].n).toBe(0);
  });

  it('reports the expected isolation shape from proof_rls_isolation()', async () => {
    interface IsolationRow {
      persona: string;
      role: string;
      camden_appointments_visible: number;
      shoreditch_appointments_visible: number;
      clients_visible: number;
      clients_total_in_company: number;
    }
    const { rows } = await pool.query<{ p: IsolationRow[] }>(
      `select proof_rls_isolation() as p`
    );
    const byName: Record<string, IsolationRow> = Object.fromEntries(
      rows[0].p.map((r) => [r.persona, r])
    );

    expect(byName['Tino Rossi'].shoreditch_appointments_visible).toBe(0);
    expect(byName['Marcus Bell'].shoreditch_appointments_visible).toBe(0);
    expect(byName['Sasha Nowak'].camden_appointments_visible).toBe(0);
    expect(byName['Dan Holt'].camden_appointments_visible).toBeGreaterThan(0);
    expect(byName['Dan Holt'].shoreditch_appointments_visible).toBeGreaterThan(0);

    // a barber sees strictly less of their own shop than their manager does
    expect(byName['Tino Rossi'].camden_appointments_visible).toBeLessThan(
      byName['Marcus Bell'].camden_appointments_visible
    );

    // clients are company-wide for everyone, by design
    for (const p of Object.values(byName)) {
      expect(p.clients_visible).toBe(p.clients_total_in_company);
    }
  });
});
