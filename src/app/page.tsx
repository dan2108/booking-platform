import Link from 'next/link';
import { getCompanyStats, getShops, getServices, staffQuery } from '@/lib/data';
import { usingServiceRole } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const SURFACES = [
  {
    href: '/book',
    eyebrow: 'Surface 01',
    title: 'Book a cut',
    who: 'Clients · own phone · no login',
    body:
      'Pick a shop, a barber, a service and a time. The mobile number is the account — no password, no signup, no account-management screens to build or support.',
    cta: 'Open the client flow',
  },
  {
    href: '/staff',
    eyebrow: 'Surface 02',
    title: "The barber's day",
    who: 'Barbers · own phone · PWA',
    body:
      'One column, their own clients, nothing else. Start a walk-in now or book one into a later slot, mark done or no-show, and see when the day is running late.',
    cta: 'Open a barber’s phone',
  },
  {
    href: '/manager',
    eyebrow: 'Surface 03',
    title: 'Shop floor',
    who: 'Managers · whole shop',
    body:
      'Every chair in one shop, side by side, plus the rota editor that decides what clients can actually book. Managers own the rota — barbers are read-only on their own.',
    cta: 'Open the manager view',
  },
  {
    href: '/admin',
    eyebrow: 'Surface 04',
    title: 'Head office',
    who: 'Ops · every shop',
    body:
      'Utilisation, online-booking share and the contactable-client count across all shops — the numbers that decide whether the pilot worked.',
    cta: 'Open head office',
  },
];

export default async function Home() {
  // Shops and services are public. The estate-wide numbers are not — they read
  // appointments and client records, so they only appear when the server holds
  // a staff key. The hub itself never breaks either way.
  const [shops, services, stats] = await Promise.all([
    getShops(),
    getServices(),
    staffQuery(getCompanyStats),
  ]);
  const pilot = shops.find((s) => s.is_pilot);
  const contactablePct = stats
    ? Math.round((stats.totals.contactable / stats.totals.clients) * 100)
    : 0;

  const tiles = stats
    ? [
        { k: 'Shops', v: String(stats.shops.length), n: 'Camden is the pilot' },
        {
          k: 'Appointments',
          v: stats.totals.appointments_last_28.toLocaleString('en-GB'),
          n: 'last 28 days, seeded',
        },
        { k: 'Clients', v: String(stats.totals.clients), n: `${contactablePct}% contactable` },
        {
          k: 'Online share',
          v: `${stats.shops.find((s) => s.is_pilot)?.online_share_pct ?? 0}%`,
          n: 'at the pilot shop',
        },
      ]
    : [
        { k: 'Shops', v: String(shops.length), n: 'Camden is the pilot' },
        { k: 'Services', v: String(services.length), n: 'one central catalogue' },
        { k: 'Pricing', v: 'Flat', n: 'same at every shop' },
        { k: 'Estate', v: '20+', n: 'six-shop trial first' },
      ];

  return (
    <main className="min-h-screen">
      <div className="pole-rule" />

      {/* ---------------------------------------------------------- hero -- */}
      <header className="border-b border-ink-3 px-6 py-16 sm:px-10 lg:px-16 lg:py-24">
        <div className="mx-auto max-w-6xl">
          <p className="eyebrow reveal">Working demo · live database · London region</p>

          <h1
            className="reveal mt-6 text-5xl leading-[0.95] sm:text-7xl lg:text-8xl"
            style={{ animationDelay: '60ms' }}
          >
            Sharp &amp; Sons
            <span className="block italic text-oxblood-hi">booking platform</span>
          </h1>

          <p
            className="reveal mt-8 max-w-2xl text-lg leading-relaxed text-bone/70"
            style={{ animationDelay: '120ms' }}
          >
            A replacement for Fresha, built multi-shop from day one. Three surfaces on one
            codebase, one central service catalogue, and a reservation path that makes
            double-booking a barber <em className="not-italic text-bone">physically impossible</em>{' '}
            rather than merely unlikely.
          </p>

          <div
            className="reveal mt-10 flex flex-wrap gap-3"
            style={{ animationDelay: '180ms' }}
          >
            <Link href="/proof" className="btn btn-primary">
              See the guarantee proved →
            </Link>
            <Link href="/book" className="btn btn-ghost">
              Book an appointment
            </Link>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------- the data -- */}
      <section className="border-b border-ink-3 px-6 py-10 sm:px-10 lg:px-16">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px bg-ink-3 sm:grid-cols-4">
          {tiles.map((stat, i) => (
            <div
              key={stat.k}
              className="reveal bg-ink px-5 py-6"
              style={{ animationDelay: `${240 + i * 50}ms` }}
            >
              <p className="eyebrow">{stat.k}</p>
              <p className="num mt-2 text-3xl text-bone">{stat.v}</p>
              <p className="mt-1 text-xs text-muted">{stat.n}</p>
            </div>
          ))}
        </div>
      </section>

      {/* -------------------------------------------------------- surfaces -- */}
      <section className="px-6 py-16 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl">
          <p className="eyebrow">Four surfaces, one codebase</p>
          <h2 className="mt-3 text-3xl sm:text-4xl">Who touches what</h2>

          <div className="mt-10 grid gap-px bg-ink-3 sm:grid-cols-2">
            {SURFACES.map((s, i) => (
              <Link
                key={s.href}
                href={s.href}
                className="reveal group relative bg-ink p-8 transition-colors hover:bg-ink-2"
                style={{ animationDelay: `${100 + i * 60}ms` }}
              >
                <p className="eyebrow">{s.eyebrow}</p>
                <h3 className="mt-3 text-3xl">{s.title}</h3>
                <p className="mt-1 font-mono text-xs tracking-wide text-oxblood-hi">{s.who}</p>
                <p className="mt-5 text-sm leading-relaxed text-bone/60">{s.body}</p>
                <p className="mt-6 font-mono text-xs uppercase tracking-[0.14em] text-muted transition-colors group-hover:text-bone">
                  {s.cta} →
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- the pitch -- */}
      <section className="border-t border-ink-3 px-6 py-16 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl">
          <p className="eyebrow">Why this exists</p>
          <h2 className="mt-3 max-w-3xl text-3xl leading-tight sm:text-4xl">
            Fresha does the job. The win is fees, cost and{' '}
            <span className="italic text-oxblood-hi">owning the client list</span>.
          </h2>

          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {[
              {
                n: '01',
                h: 'Own the data',
                p: 'The client list and every booking lives in our database, not someone else’s platform. One person, one record, across all 20+ shops — history follows them wherever they book.',
              },
              {
                n: '02',
                h: 'No per-seat fee',
                p: 'Subscription and per-seat cost scale with the estate. This does not. The pilot runs on infrastructure that costs nothing at this size.',
              },
              {
                n: '03',
                h: 'No marketplace cut',
                p: 'No fee on a new client walking through the door. Every booking arrives on our own domain.',
              },
            ].map((c) => (
              <div key={c.n} className="border-t border-ink-3 pt-5">
                <p className="num text-sm text-oxblood-hi">{c.n}</p>
                <h3 className="mt-2 text-xl">{c.h}</h3>
                <p className="mt-2 text-sm leading-relaxed text-bone/60">{c.p}</p>
              </div>
            ))}
          </div>

          <p className="mt-12 max-w-3xl border-l-2 border-brass pl-5 text-sm leading-relaxed text-bone/60">
            <span className="text-brass">The honest bar:</span> this is a cost-and-ownership
            play, not a features play. We will not beat Fresha on features, so we have to reach
            rough parity before a single shop switches over. Everything in this demo is aimed at
            that bar — {pilot ? pilot.name.replace('Sharp & Sons — ', '') : 'the pilot shop'}{' '}
            first, then the six-shop trial, then the rest.
          </p>
        </div>
      </section>

      <footer className="border-t border-ink-3 px-6 py-10 sm:px-10 lg:px-16">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <p className="font-mono text-xs text-muted">
            Next.js · TypeScript strict · Postgres · Row-Level Security · Vercel
          </p>
          <div className="flex items-center gap-4">
            {!usingServiceRole && (
              <span className="tag text-brass">dev keys</span>
            )}
            <Link href="/proof" className="font-mono text-xs uppercase tracking-[0.14em] text-muted hover:text-bone">
              The guarantee →
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
