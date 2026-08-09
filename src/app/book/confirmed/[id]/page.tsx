import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAppointment, getClientHistory } from '@/lib/data';
import { money, dateWithTime, timeRange, duration, prettyMobile, longDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function Confirmed({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const appt = await getAppointment(id);
  if (!appt) notFound();

  const history = appt.client_id ? await getClientHistory(appt.client_id) : [];
  const previous = history.filter((h) => h.id !== appt.id && h.status === 'completed');

  return (
    <main className="min-h-screen">
      <div className="pole-rule" />

      <div className="mx-auto max-w-2xl px-6 py-12 sm:px-10">
        <div className="reveal paper">
          <div className="border-b border-bone-3 px-7 py-8 text-center">
            <p className="eyebrow">Booked</p>
            <h1 className="mt-3 text-4xl leading-tight">
              You’re in the book,
              <br />
              <span className="italic">{appt.client?.name?.split(' ')[0] ?? 'see you soon'}</span>
            </h1>
          </div>

          <dl className="divide-y divide-bone-2 px-7">
            {[
              ['When', dateWithTime(appt.starts_at)],
              ['Time', `${timeRange(appt.starts_at, appt.ends_at)} · ${duration(appt.service.duration_minutes)}`],
              ['Who', appt.barber?.name ?? '—'],
              ['Where', appt.shop?.name.replace('Sharp & Sons — ', '') ?? '—'],
              ['Service', `${appt.service.name} · ${money(appt.service.price_pence)}`],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-6 py-4">
                <dt className="eyebrow">{k}</dt>
                <dd className="text-right text-base">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="border-t border-bone-3 px-7 py-6">
            <p className="text-sm leading-relaxed text-muted-2">
              We’ve got you as{' '}
              <span className="num text-ink">{prettyMobile(appt.client?.mobile ?? null)}</span>.
              Keep this link — it’s how you check or change this booking. There’s no account to
              log into, by design.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-2">
              Payment is taken in the shop on the day.
            </p>
          </div>

          {previous.length > 0 && (
            <div className="border-t border-bone-3 px-7 py-6">
              <p className="eyebrow">You’ve been in {previous.length} times before</p>
              <ul className="mt-3 space-y-1.5">
                {previous.slice(0, 4).map((h) => (
                  <li key={h.id} className="flex justify-between gap-4 text-sm text-muted-2">
                    <span className="num">{longDate(h.starts_at)}</span>
                    <span className="truncate">
                      {h.service.name} · {h.shop?.name.replace('Sharp & Sons — ', '')}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs leading-relaxed text-muted-2">
                Your history follows you to any Sharp &amp; Sons — one record, every shop. That
                is the asset this platform exists to own.
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/book" className="btn btn-ghost">
            Book another
          </Link>
          <Link href="/" className="btn btn-ghost">
            Back to the demo
          </Link>
        </div>

        <p className="mt-8 border-l-2 border-jade pl-4 text-xs leading-relaxed text-muted">
          This appointment was written by a single server-owned Postgres transaction. Between
          you tapping the slot and this page rendering, no other client — online or at the
          counter — could have been promised the same barber at the same time.
        </p>
      </div>
    </main>
  );
}
