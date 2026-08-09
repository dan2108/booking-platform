import Link from 'next/link';
import { getCompanyStats, getShops } from '@/lib/data';
import { money } from '@/lib/format';
import { KeyNotice } from '@/components/KeyNotice';
import { usingServiceRole } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function Admin() {
  if (!usingServiceRole) return <KeyNotice surface="head office view" />;

  const [stats, shops] = await Promise.all([getCompanyStats(), getShops()]);
  const totalExpected = stats.shops.reduce((s, x) => s + x.expected_revenue_pence, 0);
  const contactablePct = Math.round((stats.totals.contactable / stats.totals.clients) * 100);
  const pilot = stats.shops.find((s) => s.is_pilot);
  const walkInShops = stats.shops.filter((s) => !s.is_pilot);
  const walkInOnlineAvg = Math.round(
    walkInShops.reduce((s, x) => s + x.online_share_pct, 0) / (walkInShops.length || 1)
  );

  return (
    <main className="min-h-screen pb-20">
      <div className="pole-rule" />

      <header className="border-b border-ink-3 px-6 py-8 sm:px-10">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/" className="font-mono text-xs uppercase tracking-[0.14em] text-muted hover:text-bone">
            ← Demo
          </Link>
          <p className="eyebrow">Head office · {shops.length} shops</p>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 sm:px-10">
        <section className="py-12">
          <h1 className="reveal text-4xl sm:text-5xl">Across the estate</h1>
          <p className="reveal mt-3 max-w-2xl text-sm leading-relaxed text-bone/60" style={{ animationDelay: '60ms' }}>
            Last 28 days. These are the four numbers that decide whether the pilot worked — not
            vanity metrics, the assumptions in the plan that could actually be wrong.
          </p>

          <div className="reveal mt-8 grid grid-cols-2 gap-px bg-ink-3 lg:grid-cols-4" style={{ animationDelay: '100ms' }}>
            {[
              { k: 'Appointments', v: stats.totals.appointments_last_28.toLocaleString('en-GB'), n: 'all shops, 28 days' },
              { k: 'Expected value', v: money(totalExpected), n: 'completed × list price' },
              { k: 'Clients on file', v: String(stats.totals.clients), n: `${contactablePct}% reachable` },
              { k: 'No-shows', v: String(stats.totals.no_shows_last_28), n: 'counted per client' },
            ].map((s) => (
              <div key={s.k} className="bg-ink px-5 py-6">
                <p className="eyebrow">{s.k}</p>
                <p className="num mt-2 text-3xl">{s.v}</p>
                <p className="mt-1 text-[0.6875rem] text-muted">{s.n}</p>
              </div>
            ))}
          </div>

          <p className="mt-4 border-l-2 border-brass pl-4 text-xs leading-relaxed text-muted">
            <span className="text-brass">Read “expected value” carefully.</span> Card sales run
            on a standalone terminal, so this is completed appointments at the central flat
            price — no tips, discounts, product or comps. It is good for utilisation and
            per-shop comparison. It is not takings and will not reconcile with the till, so it
            is never labelled as if it does.
          </p>
        </section>

        {/* ---------------------------------------------------- per shop -- */}
        <section className="border-t border-ink-3 py-12">
          <p className="eyebrow">Shop by shop</p>
          <h2 className="mt-2 text-3xl">Where the behaviour differs</h2>

          <div className="mt-8 overflow-x-auto border border-ink-3">
            <table className="w-full min-w-[42rem] text-left">
              <thead>
                <tr className="border-b border-ink-3">
                  {['Shop', 'Booked next 7 days', 'Completed', 'Chair utilisation', 'Booked online', 'Expected'].map((h) => (
                    <th key={h} className="eyebrow px-4 py-3 font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.shops.map((s) => (
                  <tr key={s.slug} className="border-b border-ink-3 last:border-b-0">
                    <td className="px-4 py-4">
                      <span className="block">{s.shop.replace('Sharp & Sons — ', '')}</span>
                      {s.is_pilot && <span className="tag mt-1 text-oxblood-hi">pilot · ex-Fresha</span>}
                    </td>
                    <td className="num px-4 py-4">{s.booked_next_7}</td>
                    <td className="num px-4 py-4">{s.completed_last_28}</td>
                    <td className="num px-4 py-4">
                      <span className="flex items-center gap-2">
                        {s.utilisation_pct}%
                        <span className="hidden h-1 w-16 bg-ink-3 sm:block">
                          <span
                            className="block h-1 bg-bone-3"
                            style={{ width: `${Math.min(100, s.utilisation_pct)}%` }}
                          />
                        </span>
                      </span>
                    </td>
                    <td className="num px-4 py-4">
                      <span className={s.online_share_pct > 50 ? 'text-jade-hi' : 'text-brass'}>
                        {s.online_share_pct}%
                      </span>
                    </td>
                    <td className="num px-4 py-4">{money(s.expected_revenue_pence)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ------------------------------------------------ what to watch -- */}
        <section className="border-t border-ink-3 py-12">
          <p className="eyebrow">What the pilot has to answer</p>
          <h2 className="mt-2 max-w-3xl text-3xl leading-tight">
            Four assumptions that could be wrong, and no amount of engineering settles them.
          </h2>

          <div className="mt-8 grid gap-px bg-ink-3 sm:grid-cols-2">
            {[
              {
                n: '01',
                h: 'Will walk-in shops book online at all?',
                now: `${pilot?.online_share_pct ?? 0}% at the pilot vs ${walkInOnlineAvg}% at the walk-in shops`,
                p: 'The pilot shop already came from Fresha, so its clients are used to booking ahead. The rest of the estate has never had a booking system. The whole thesis rests on this gap closing, and only the rollout will tell us.',
                tone: 'brass',
              },
              {
                n: '02',
                h: 'Will barbers capture walk-in numbers?',
                now: `${contactablePct}% of clients are reachable`,
                p: 'Every online client is contactable by construction. A walk-in is contactable only if a barber takes the number — and we made that optional on purpose, because blocking the chair is worse. If this number stays low, the win-back upside never arrives.',
                tone: 'brass',
              },
              {
                n: '03',
                h: 'How often does the day run late?',
                now: 'Flagged live on each barber’s phone',
                p: 'Fixed durations with no turnaround gap is the simplest model that could work. If overruns are constant rather than occasional, that model needs revisiting — but we would rather measure it than guess a buffer.',
                tone: 'muted',
              },
              {
                n: '04',
                h: 'Do barbers cope on their own phone?',
                now: 'No shared front-desk device exists',
                p: 'The barber’s own phone is the only staff surface. There is no counter tablet to fall back on. If that does not work in a busy shop, day one fails regardless of how good the rest is.',
                tone: 'muted',
              },
            ].map((c) => (
              <div key={c.n} className="bg-ink p-6">
                <p className="num text-sm text-oxblood-hi">{c.n}</p>
                <h3 className="mt-2 text-xl leading-snug">{c.h}</h3>
                <p className={`num mt-2 text-xs ${c.tone === 'brass' ? 'text-brass' : 'text-muted'}`}>
                  {c.now}
                </p>
                <p className="mt-3 text-xs leading-relaxed text-bone/55">{c.p}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
