'use client';

import { useState } from 'react';

interface RaceResult {
  racer: number;
  channel: 'online' | 'staff';
  ms: number;
  won: boolean;
  code: string;
  message: string;
}

interface RaceResponse {
  ok: boolean;
  barber: string;
  shop: string;
  service: string;
  slotLabel: string;
  slotDate: string;
  racers: number;
  winners: number;
  rejected: number;
  committedRows: number;
  raceMs: number;
  results: RaceResult[];
  error?: string;
}

interface RlsRow {
  persona: string;
  role: string;
  camden_appointments_visible: number;
  shoreditch_appointments_visible: number;
  shoreditch_staff_visible: number;
  shoreditch_rotas_visible: number;
  clients_visible: number;
  clients_total_in_company: number;
}

interface ConstraintStep {
  step: number;
  pass: boolean;
  action: string;
  expected: string;
  result: string;
  note?: string;
  db_error?: string;
  db_detail?: string;
}

export function ProofRunner() {
  const [race, setRace] = useState<RaceResponse | null>(null);
  const [racing, setRacing] = useState(false);

  const [rls, setRls] = useState<RlsRow[] | null>(null);
  const [constraint, setConstraint] = useState<ConstraintStep[] | null>(null);
  const [checking, setChecking] = useState(false);

  async function runRace() {
    setRacing(true);
    setRace(null);
    try {
      const res = await fetch('/api/proof/race', { method: 'POST' });
      setRace(await res.json());
    } catch {
      setRace({ error: 'The race could not run.' } as RaceResponse);
    } finally {
      setRacing(false);
    }
  }

  async function runChecks() {
    setChecking(true);
    try {
      const res = await fetch('/api/proof/rls', { method: 'POST' });
      const data = await res.json();
      setRls(data.rls ?? null);
      setConstraint(data.constraint?.steps ?? null);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-16">
      {/* ============================================================ RACE == */}
      <section>
        <p className="eyebrow">Proof 01</p>
        <h2 className="mt-2 text-3xl sm:text-4xl">Eight people, one slot</h2>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-bone/60">
          This fires eight genuinely simultaneous reservations at one barber and one time —
          four from the public booking page, four from a barber’s phone booking a walk-in.
          Each is a separate connection to the real database. Not a simulation.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-bone/60">
          Exactly one commits. Every time. Not because the code is careful, but because the
          database physically cannot hold the second row.
        </p>

        <button onClick={runRace} disabled={racing} className="btn btn-primary mt-6">
          {racing ? 'Racing…' : race ? 'Run it again' : 'Run the race'}
        </button>

        {race?.error && (
          <p className="mt-6 border-l-2 border-oxblood px-4 py-3 text-sm text-oxblood-hi">
            {race.error}
          </p>
        )}

        {race && !race.error && (
          <div className="reveal mt-8">
            <div className="border border-ink-3 px-5 py-4">
              <p className="text-sm text-bone/60">
                Racing for{' '}
                <span className="text-bone">{race.barber}</span> at{' '}
                <span className="text-bone">{race.shop.replace('Sharp & Sons — ', '')}</span> —{' '}
                <span className="num text-bone">{race.slotLabel}</span> on {race.slotDate},{' '}
                {race.service}.
              </p>
            </div>

            <div className="mt-px grid grid-cols-2 gap-px bg-ink-3 sm:grid-cols-4">
              {[
                { k: 'Tried', v: race.racers, tone: 'text-bone' },
                { k: 'Reserved', v: race.winners, tone: 'text-jade-hi' },
                { k: 'Told “slot taken”', v: race.rejected, tone: 'text-brass' },
                { k: 'Rows in the DB', v: race.committedRows, tone: 'text-jade-hi' },
              ].map((s) => (
                <div key={s.k} className="bg-ink px-4 py-5">
                  <p className="eyebrow">{s.k}</p>
                  <p className={`num mt-1 text-4xl ${s.tone}`}>{s.v}</p>
                </div>
              ))}
            </div>

            <div className="mt-px border border-ink-3">
              {race.results.map((r, i) => (
                <div
                  key={r.racer}
                  className={`reveal flex items-center gap-3 border-b border-ink-3 px-4 py-2.5 last:border-b-0 ${
                    r.won ? 'bg-jade/10' : ''
                  }`}
                  style={{ animationDelay: `${i * 45}ms` }}
                >
                  <span className="num w-16 shrink-0 text-xs text-muted">#{r.racer}</span>
                  <span className="w-16 shrink-0 font-mono text-[0.625rem] uppercase tracking-widest text-muted">
                    {r.channel}
                  </span>
                  <span className="num w-16 shrink-0 text-xs text-muted">{r.ms}ms</span>
                  <span
                    className={`min-w-0 flex-1 truncate text-sm ${
                      r.won ? 'text-jade-hi' : 'text-bone/50'
                    }`}
                  >
                    {r.message}
                  </span>
                  <span
                    className={`tag shrink-0 ${r.won ? 'text-jade-hi' : 'text-muted'}`}
                  >
                    {r.won ? 'won' : r.code}
                  </span>
                </div>
              ))}
            </div>

            <p
              className={`mt-4 border-l-2 px-4 py-3 text-sm leading-relaxed ${
                race.ok ? 'border-jade text-bone/80' : 'border-oxblood text-oxblood-hi'
              }`}
            >
              {race.ok ? (
                <>
                  Eight attempts, {race.raceMs}ms, <span className="num">one</span> row in the
                  database. The seven who lost were told the slot had gone — which is the
                  correct answer, not an error. Nothing was half-booked, nothing needs cleaning
                  up, and no client was promised a barber who was already promised to someone
                  else.
                </>
              ) : (
                <>
                  GUARANTEE BROKEN — {race.winners} winners and {race.committedRows} rows
                  committed. This is exactly the failure the constraint exists to prevent.
                </>
              )}
            </p>
          </div>
        )}
      </section>

      {/* ====================================================== THE CHECKS == */}
      <section className="border-t border-ink-3 pt-16">
        <p className="eyebrow">Proof 02 &amp; 03</p>
        <h2 className="mt-2 text-3xl sm:text-4xl">
          The constraint, and who can see what
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-bone/60">
          The first runs the four edge cases the constraint has to get right. The second assumes
          each staff role’s identity in turn and reports what the <em>database</em> hands back —
          not what these screens choose to render. A bug in the UI cannot widen those numbers.
        </p>

        <button onClick={runChecks} disabled={checking} className="btn btn-ghost mt-6">
          {checking ? 'Running…' : constraint ? 'Run again' : 'Run the checks'}
        </button>

        {constraint && (
          <div className="reveal mt-8">
            <p className="eyebrow">Constraint behaviour</p>
            <div className="mt-3 border border-ink-3">
              {constraint.map((s) => (
                <div key={s.step} className="border-b border-ink-3 px-4 py-3 last:border-b-0">
                  <div className="flex items-start gap-3">
                    <span
                      className={`num shrink-0 text-sm ${s.pass ? 'text-jade-hi' : 'text-oxblood-hi'}`}
                    >
                      {s.pass ? '✓' : '✕'}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-bone/90">{s.action}</p>
                      <p className="num mt-0.5 text-[0.6875rem] text-muted">
                        expected {s.expected} → {s.result}
                      </p>
                      {s.note && (
                        <p className="mt-1 text-[0.6875rem] leading-relaxed text-muted">{s.note}</p>
                      )}
                      {s.db_detail && (
                        <p className="num mt-1.5 break-all border-l-2 border-ink-4 pl-3 text-[0.625rem] leading-relaxed text-brass">
                          {s.db_detail}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {rls && (
          <div className="reveal mt-10">
            <p className="eyebrow">Tenancy — what each role can read</p>
            <div className="mt-3 overflow-x-auto border border-ink-3">
              <table className="w-full min-w-[46rem] text-left">
                <thead>
                  <tr className="border-b border-ink-3">
                    {[
                      'Signed in as',
                      'Camden bookings',
                      'Shoreditch bookings',
                      'Shoreditch staff',
                      'Shoreditch rotas',
                      'Clients',
                    ].map((h) => (
                      <th key={h} className="eyebrow px-4 py-3 font-normal">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rls.map((r) => (
                    <tr key={r.persona} className="border-b border-ink-3 last:border-b-0">
                      <td className="px-4 py-3">
                        <span className="block text-sm">{r.persona}</span>
                        <span className="font-mono text-[0.625rem] uppercase tracking-widest text-muted">
                          {r.role.replace('_', ' ')}
                        </span>
                      </td>
                      {[
                        r.camden_appointments_visible,
                        r.shoreditch_appointments_visible,
                        r.shoreditch_staff_visible,
                        r.shoreditch_rotas_visible,
                      ].map((v, i) => (
                        <td
                          key={i}
                          className={`num px-4 py-3 text-sm ${v === 0 ? 'text-muted-2' : 'text-bone'}`}
                        >
                          {v === 0 ? '—' : v.toLocaleString('en-GB')}
                        </td>
                      ))}
                      <td className="num px-4 py-3 text-sm text-jade-hi">
                        {r.clients_visible} / {r.clients_total_in_company}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <p className="border-l-2 border-jade px-4 py-3 text-xs leading-relaxed text-bone/70">
                <span className="text-jade-hi">Isolated:</span> a Camden barber sees only their
                own column. A Camden manager sees all of Camden and nothing of Shoreditch — not
                the bookings, not the staff, not even the rotas. Head office sees everything.
              </p>
              <p className="border-l-2 border-brass px-4 py-3 text-xs leading-relaxed text-bone/70">
                <span className="text-brass">Deliberately not isolated:</span> every staff member
                can resolve every client. One person, one record, across all 20+ shops — that is
                what makes cross-shop booking and a single win-back list possible, and it is the
                asset this project exists to own.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
