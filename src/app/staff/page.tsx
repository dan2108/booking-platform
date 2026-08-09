import Link from 'next/link';
import { getAllStaff } from '@/lib/data';

export const dynamic = 'force-dynamic';

const ROLE_COPY: Record<string, string> = {
  barber: 'Own column only',
  manager: 'Whole shop',
  head_office: 'Every shop',
};

export default async function StaffPicker() {
  const staff = await getAllStaff();
  const barbers = staff.filter((s) => s.role === 'barber');
  const others = staff.filter((s) => s.role !== 'barber');

  return (
    <main className="min-h-screen">
      <div className="pole-rule" />

      <header className="border-b border-ink-3 px-6 py-8 sm:px-10">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/" className="font-mono text-xs uppercase tracking-[0.14em] text-muted hover:text-bone">
            ← Demo
          </Link>
          <p className="eyebrow">Staff</p>
        </div>
      </header>

      <section className="px-6 py-12 sm:px-10">
        <div className="mx-auto max-w-3xl">
          <h1 className="reveal text-4xl sm:text-5xl">Who’s on?</h1>
          <p className="reveal mt-3 max-w-xl text-sm leading-relaxed text-bone/60" style={{ animationDelay: '60ms' }}>
            In production this is a login. For the demo, pick a person to see exactly what that
            role can reach — a barber sees only their own column, a manager sees their whole
            shop, head office sees every shop. That boundary is enforced in the database, not
            in these screens.
          </p>

          <p className="eyebrow reveal mt-10" style={{ animationDelay: '100ms' }}>
            Barbers
          </p>
          <div className="mt-3 grid gap-px bg-ink-3 sm:grid-cols-2">
            {barbers.map((s, i) => (
              <Link
                key={s.id}
                href={`/staff/${s.id}`}
                className="reveal group flex items-center gap-4 bg-ink px-5 py-5 transition-colors hover:bg-ink-2"
                style={{ animationDelay: `${140 + i * 40}ms` }}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center border border-ink-4 font-mono text-xs tracking-widest text-bone/70">
                  {s.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-lg">{s.name}</span>
                  <span className="block truncate font-mono text-[0.6875rem] uppercase tracking-widest text-muted">
                    {s.shop?.name.replace('Sharp & Sons — ', '')} · {ROLE_COPY[s.role]}
                  </span>
                </span>
                <span className="font-mono text-sm text-muted transition-colors group-hover:text-oxblood-hi">
                  →
                </span>
              </Link>
            ))}
          </div>

          <p className="eyebrow mt-10">Managers &amp; head office</p>
          <div className="mt-3 grid gap-px bg-ink-3 sm:grid-cols-2">
            {others.map((s) => (
              <Link
                key={s.id}
                href={s.role === 'head_office' ? '/admin' : `/manager?shop=${s.shop?.slug ?? ''}`}
                className="group flex items-center gap-4 bg-ink px-5 py-5 transition-colors hover:bg-ink-2"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center border border-ink-4 font-mono text-xs tracking-widest text-bone/70">
                  {s.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-lg">{s.name}</span>
                  <span className="block truncate font-mono text-[0.6875rem] uppercase tracking-widest text-muted">
                    {s.shop?.name.replace('Sharp & Sons — ', '') ?? 'Head office'} ·{' '}
                    {ROLE_COPY[s.role]}
                  </span>
                </span>
                <span className="font-mono text-sm text-muted transition-colors group-hover:text-oxblood-hi">
                  →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
