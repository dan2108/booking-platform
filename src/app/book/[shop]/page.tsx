import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DateTime } from 'luxon';
import { getShop, getBarbers, getRota, getBusy, getServices } from '@/lib/data';
import { generateSlots } from '@/lib/availability';

export const dynamic = 'force-dynamic';

export default async function ChooseBarber({
  params,
}: {
  params: Promise<{ shop: string }>;
}) {
  const { shop: slug } = await params;
  const shop = await getShop(slug);
  if (!shop) notFound();

  const [barbers, services] = await Promise.all([getBarbers(shop.id), getServices()]);
  const shortest = Math.min(...services.map((s) => s.duration_minutes));

  const now = DateTime.now().setZone(shop.timezone);
  const from = now.startOf('day');
  const to = from.plus({ days: 7 });

  // "Next free" per barber, so a client can pick on availability rather than
  // tapping through five barbers to find out who is in today.
  const withAvailability = await Promise.all(
    barbers.map(async (barber) => {
      const [{ patterns, exceptions }, busy] = await Promise.all([
        getRota(barber.id),
        getBusy(barber.id, from.toUTC().toISO()!, to.toUTC().toISO()!),
      ]);

      for (let i = 0; i < 7; i++) {
        const day = from.plus({ days: i });
        const slots = generateSlots({
          date: day.toISODate()!,
          timezone: shop.timezone,
          durationMinutes: shortest,
          patterns,
          exceptions,
          busy,
          now,
        });
        if (slots.length) {
          return {
            barber,
            nextFree: slots[0],
            nextFreeDay: day,
            freeToday: i === 0 ? slots.length : 0,
          };
        }
      }
      return { barber, nextFree: null, nextFreeDay: null, freeToday: 0 };
    })
  );

  const dayLabel = (d: DateTime | null) => {
    if (!d) return '';
    const diff = Math.round(d.startOf('day').diff(now.startOf('day'), 'days').days);
    if (diff === 0) return 'today';
    if (diff === 1) return 'tomorrow';
    return d.toFormat('ccc d LLL');
  };

  return (
    <main className="min-h-screen">
      <div className="pole-rule" />

      <header className="border-b border-ink-3 px-6 py-8 sm:px-10">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link href="/book" className="font-mono text-xs uppercase tracking-[0.14em] text-muted hover:text-bone">
            ← Shops
          </Link>
          <p className="eyebrow">Step 2 of 4</p>
        </div>
      </header>

      <section className="px-6 py-12 sm:px-10">
        <div className="mx-auto max-w-4xl">
          <p className="eyebrow reveal">{shop.name.replace('Sharp & Sons — ', '')}</p>
          <h1 className="reveal mt-2 text-4xl sm:text-5xl" style={{ animationDelay: '50ms' }}>
            Who’s cutting?
          </h1>

          <div className="mt-10 grid gap-px bg-ink-3">
            {withAvailability.map(({ barber, nextFree, nextFreeDay, freeToday }, i) => {
              const disabled = !nextFree;
              return (
                <Link
                  key={barber.id}
                  href={disabled ? '#' : `/book/${shop.slug}/${barber.id}`}
                  aria-disabled={disabled}
                  className={`reveal group flex items-center gap-5 bg-ink px-6 py-6 transition-colors ${
                    disabled ? 'pointer-events-none opacity-45' : 'hover:bg-ink-2'
                  }`}
                  style={{ animationDelay: `${90 + i * 60}ms` }}
                >
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center border border-ink-4 font-mono text-sm tracking-widest text-bone/70">
                    {barber.initials}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="text-2xl">{barber.name}</h2>
                    <p className="mt-0.5 truncate text-sm text-bone/50">{barber.bio}</p>
                  </div>

                  <div className="shrink-0 text-right">
                    {nextFree ? (
                      <>
                        <p className="eyebrow">Next free</p>
                        <p className="num mt-1 text-lg text-jade-hi">{nextFree.label}</p>
                        <p className="text-xs text-muted">{dayLabel(nextFreeDay)}</p>
                        {freeToday > 0 && (
                          <p className="num mt-1 text-[0.6875rem] text-muted">
                            {freeToday} slots today
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-muted">Fully booked this week</p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>

          <p className="mt-8 border-l-2 border-ink-4 pl-4 text-xs leading-relaxed text-muted">
            Availability comes from each barber’s own rota — genuinely variable weekly hours,
            plus holidays and one-off changes — not from shop opening times. “Any available
            barber” allocation is deliberately not built: clients here are loyal to a person.
          </p>
        </div>
      </section>
    </main>
  );
}
