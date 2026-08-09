import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DateTime } from 'luxon';
import { getShop, getStaffMember, getServices, getRota, getBusy } from '@/lib/data';
import { generateSlots } from '@/lib/availability';
import { BookingForm } from '@/components/BookingForm';
import { money, duration, relativeDay } from '@/lib/format';

export const dynamic = 'force-dynamic';

const DAYS_AHEAD = 14;

export default async function BookWithBarber({
  params,
  searchParams,
}: {
  params: Promise<{ shop: string; barber: string }>;
  searchParams: Promise<{ service?: string; date?: string }>;
}) {
  const [{ shop: slug, barber: barberId }, query] = await Promise.all([params, searchParams]);

  const [shop, barber, services] = await Promise.all([
    getShop(slug),
    getStaffMember(barberId),
    getServices(),
  ]);
  if (!shop || !barber || barber.shop_id !== shop.id) notFound();

  const service = services.find((s) => s.id === query.service) ?? services[0];

  const now = DateTime.now().setZone(shop.timezone);
  const from = now.startOf('day');
  const to = from.plus({ days: DAYS_AHEAD });

  const [{ patterns, exceptions }, busy] = await Promise.all([
    getRota(barber.id),
    getBusy(barber.id, from.toUTC().toISO()!, to.toUTC().toISO()!),
  ]);

  // Rota expansion + slot maths are pure functions on plain data — the same
  // code the unit tests run against on fixtures. See src/lib/availability.ts.
  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => {
    const day = from.plus({ days: i });
    const date = day.toISODate()!;
    return {
      date,
      day,
      slots: generateSlots({
        date,
        timezone: shop.timezone,
        durationMinutes: service.duration_minutes,
        patterns,
        exceptions,
        busy,
        now,
      }),
    };
  });

  const selectedDate = query.date && days.some((d) => d.date === query.date)
    ? query.date
    : (days.find((d) => d.slots.length > 0)?.date ?? days[0].date);
  const selectedDay = days.find((d) => d.date === selectedDate)!;

  const href = (next: { service?: string; date?: string }) => {
    const sp = new URLSearchParams();
    sp.set('service', next.service ?? service.id);
    if (next.date) sp.set('date', next.date);
    return `/book/${shop.slug}/${barber.id}?${sp}`;
  };

  return (
    <main className="min-h-screen pb-16">
      <div className="pole-rule" />

      <header className="border-b border-ink-3 px-6 py-8 sm:px-10">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link
            href={`/book/${shop.slug}`}
            className="font-mono text-xs uppercase tracking-[0.14em] text-muted hover:text-bone"
          >
            ← Barbers
          </Link>
          <p className="eyebrow">{shop.name.replace('Sharp & Sons — ', '')}</p>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 sm:px-10">
        {/* ------------------------------------------------------- barber -- */}
        <div className="reveal flex items-center gap-5 py-10">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center border border-ink-4 font-mono text-base tracking-widest text-bone/70">
            {barber.initials}
          </div>
          <div>
            <h1 className="text-4xl">{barber.name}</h1>
            <p className="mt-1 text-sm text-bone/50">{barber.bio}</p>
          </div>
        </div>

        {/* ------------------------------------------------------ service -- */}
        <section className="reveal" style={{ animationDelay: '60ms' }}>
          <p className="eyebrow">Step 1 · What are you having?</p>
          <div className="mt-4 grid gap-px bg-ink-3 sm:grid-cols-2">
            {services.map((s) => {
              const active = s.id === service.id;
              return (
                <Link
                  key={s.id}
                  href={href({ service: s.id })}
                  className={`flex items-baseline justify-between gap-4 px-5 py-4 transition-colors ${
                    active ? 'bg-oxblood text-bone' : 'bg-ink hover:bg-ink-2'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-base">{s.name}</span>
                    <span
                      className={`num block text-xs ${active ? 'text-bone/70' : 'text-muted'}`}
                    >
                      {duration(s.duration_minutes)}
                    </span>
                  </span>
                  <span className="num shrink-0 text-lg">{money(s.price_pence)}</span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* --------------------------------------------------------- date -- */}
        <section className="reveal mt-10" style={{ animationDelay: '120ms' }}>
          <p className="eyebrow">Step 2 · Which day?</p>
          <div className="scrollbar-none mt-4 flex gap-2 overflow-x-auto pb-1">
            {days.map((d) => {
              const active = d.date === selectedDate;
              const empty = d.slots.length === 0;
              return (
                <Link
                  key={d.date}
                  href={empty ? '#' : href({ date: d.date })}
                  aria-disabled={empty}
                  className={`flex w-16 shrink-0 flex-col items-center border py-3 transition-colors ${
                    active
                      ? 'border-oxblood bg-oxblood text-bone'
                      : empty
                        ? 'pointer-events-none border-ink-3 text-muted-2 opacity-40'
                        : 'border-ink-3 hover:border-bone-3'
                  }`}
                >
                  <span className="font-mono text-[0.625rem] uppercase tracking-widest">
                    {d.day.toFormat('ccc')}
                  </span>
                  <span className="num mt-1 text-xl leading-none">{d.day.toFormat('d')}</span>
                  <span
                    className={`num mt-1.5 text-[0.625rem] ${
                      active ? 'text-bone/70' : empty ? 'text-muted-2' : 'text-jade-hi'
                    }`}
                  >
                    {empty ? '—' : d.slots.length}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ------------------------------------------------ time + details -- */}
        <section className="reveal mt-10" style={{ animationDelay: '180ms' }}>
          <BookingForm
            shopId={shop.id}
            barberId={barber.id}
            serviceId={service.id}
            serviceName={`${service.name} · ${money(service.price_pence)}`}
            slots={selectedDay.slots}
            dayLabel={relativeDay(selectedDate, shop.timezone)}
          />
        </section>

        <p className="mt-6 border-l-2 border-ink-4 pl-4 text-xs leading-relaxed text-muted">
          Times shown are {barber.name.split(' ')[0]}’s actual working hours for that day, minus
          appointments already taken and a 30-minute booking buffer so nobody takes a slot while
          a walk-in is mid-cut.
        </p>
      </div>
    </main>
  );
}
