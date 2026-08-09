import Link from 'next/link';
import { DateTime } from 'luxon';
import {
  getShops,
  getShop,
  getBarbers,
  getDayForShop,
  getRotaForShop,
} from '@/lib/data';
import { RotaEditor } from '@/components/RotaEditor';
import { money, relativeDay, time, STATUS_LABEL } from '@/lib/format';
import { KeyNotice } from '@/components/KeyNotice';
import { usingServiceRole } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function Manager({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string; date?: string; view?: string }>;
}) {
  if (!usingServiceRole) return <KeyNotice surface="shop floor" />;

  const query = await searchParams;
  const shops = await getShops();
  const shop = (await getShop(query.shop ?? '')) ?? shops[0];
  const view = query.view === 'rota' ? 'rota' : 'floor';

  const now = DateTime.now().setZone(shop.timezone);
  const date = query.date ?? now.toISODate()!;
  const day = DateTime.fromISO(date, { zone: shop.timezone });

  const [barbers, appointments, rota] = await Promise.all([
    getBarbers(shop.id),
    getDayForShop(shop.id, date, shop.timezone),
    getRotaForShop(shop.id),
  ]);

  const byBarber = barbers.map((b) => ({
    barber: b,
    appts: appointments.filter((a) => a.barber_id === b.id),
  }));

  const expected = appointments
    .filter((a) => a.status === 'completed')
    .reduce((s, a) => s + a.service.price_pence, 0);
  const online = appointments.filter((a) => a.source === 'online').length;

  const href = (next: { shop?: string; date?: string; view?: string }) => {
    const sp = new URLSearchParams();
    sp.set('shop', next.shop ?? shop.slug);
    sp.set('view', next.view ?? view);
    if (next.date ?? query.date) sp.set('date', next.date ?? query.date!);
    return `/manager?${sp}`;
  };

  return (
    <main className="min-h-screen pb-16">
      <div className="pole-rule" />

      <header className="border-b border-ink-3 px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4">
          <Link href="/" className="font-mono text-xs uppercase tracking-[0.14em] text-muted hover:text-bone">
            ← Demo
          </Link>
          <p className="eyebrow">Manager</p>

          <div className="ml-auto flex flex-wrap gap-px bg-ink-3">
            {shops.map((s) => (
              <Link
                key={s.id}
                href={href({ shop: s.slug })}
                className={`px-3 py-2 font-mono text-[0.625rem] uppercase tracking-widest transition-colors ${
                  s.id === shop.id ? 'bg-oxblood text-bone' : 'bg-ink text-muted hover:text-bone'
                }`}
              >
                {s.name.replace('Sharp & Sons — ', '')}
              </Link>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
        <div className="reveal flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl">{shop.name.replace('Sharp & Sons — ', '')}</h1>
            <p className="mt-1 text-sm text-bone/50">{shop.address}</p>
          </div>
          <div className="flex gap-px bg-ink-3">
            {(['floor', 'rota'] as const).map((v) => (
              <Link
                key={v}
                href={href({ view: v })}
                className={`px-4 py-2.5 font-mono text-[0.625rem] uppercase tracking-widest transition-colors ${
                  v === view ? 'bg-bone text-ink' : 'bg-ink text-muted hover:text-bone'
                }`}
              >
                {v === 'floor' ? 'Shop floor' : 'Rota editor'}
              </Link>
            ))}
          </div>
        </div>

        {view === 'floor' ? (
          <>
            <div className="mt-8 flex items-center justify-between gap-4">
              <h2 className="text-2xl">{relativeDay(date, shop.timezone)}</h2>
              <div className="flex gap-1">
                <Link href={href({ date: day.minus({ days: 1 }).toISODate()! })} className="btn btn-ghost !px-3 !py-1.5 !text-[0.625rem]">
                  ‹
                </Link>
                <Link href={href({ date: now.toISODate()! })} className="btn btn-ghost !px-3 !py-1.5 !text-[0.625rem]">
                  Today
                </Link>
                <Link href={href({ date: day.plus({ days: 1 }).toISODate()! })} className="btn btn-ghost !px-3 !py-1.5 !text-[0.625rem]">
                  ›
                </Link>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-px bg-ink-3 sm:grid-cols-4">
              {[
                ['In the book', String(appointments.length)],
                ['Completed', String(appointments.filter((a) => a.status === 'completed').length)],
                ['Booked online', appointments.length ? `${Math.round((online / appointments.length) * 100)}%` : '—'],
                ['Expected', money(expected)],
              ].map(([k, v]) => (
                <div key={k} className="bg-ink px-4 py-4">
                  <p className="eyebrow">{k}</p>
                  <p className="num mt-1 text-2xl">{v}</p>
                </div>
              ))}
            </div>

            {/* Every chair side by side — what a manager actually looks at. */}
            <div className="mt-6 grid gap-px bg-ink-3 md:grid-cols-2 xl:grid-cols-3">
              {byBarber.map(({ barber, appts }, i) => (
                <section
                  key={barber.id}
                  className="reveal bg-ink"
                  style={{ animationDelay: `${60 + i * 50}ms` }}
                >
                  <header className="flex items-center gap-3 border-b border-ink-3 px-4 py-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-ink-4 font-mono text-[0.625rem] tracking-widest text-bone/70">
                      {barber.initials}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">{barber.name}</span>
                    <span className="num text-xs text-muted">{appts.length}</span>
                  </header>

                  <div className="max-h-96 overflow-y-auto">
                    {appts.length === 0 ? (
                      <p className="px-4 py-8 text-center text-xs text-muted">Not working</p>
                    ) : (
                      appts.map((a) => (
                        <div
                          key={a.id}
                          className={`appt appt-${a.status} ${a.at_risk ? 'appt-at-risk' : ''} flex items-baseline gap-3 border-b border-ink-3 px-3 py-2`}
                        >
                          <span className="num w-11 shrink-0 text-xs text-bone/70">
                            {time(a.starts_at)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">
                              {a.client?.name ?? 'Walk-in'}
                            </span>
                            <span className="block truncate text-[0.6875rem] text-muted">
                              {a.service.name}
                              {a.source === 'staff' && ' · walk-in'}
                            </span>
                          </span>
                          {a.status !== 'booked' && (
                            <span className="shrink-0 font-mono text-[0.5625rem] uppercase tracking-widest text-muted">
                              {STATUS_LABEL[a.status]}
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </section>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="mt-8 max-w-2xl">
              <h2 className="text-2xl">Rota</h2>
              <p className="mt-2 text-sm leading-relaxed text-bone/60">
                This is what decides what clients can book. Change a barber’s hours here and the
                public booking page reflects it immediately — availability is computed from the
                rota, never from shop opening times.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Rotas are manager-owned. Barbers can see their own and nothing else.
              </p>
            </div>

            <div className="mt-6 max-w-3xl">
              <RotaEditor barbers={rota} />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
