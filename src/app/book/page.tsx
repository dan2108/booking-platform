import Link from 'next/link';
import { getShops } from '@/lib/data';

export const dynamic = 'force-dynamic';

export default async function ChooseShop() {
  const shops = await getShops();

  return (
    <main className="min-h-screen">
      <div className="pole-rule" />

      <header className="border-b border-ink-3 px-6 py-8 sm:px-10">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link href="/" className="font-display text-2xl">
            Sharp &amp; Sons
          </Link>
          <p className="eyebrow">Step 1 of 4</p>
        </div>
      </header>

      <section className="px-6 py-12 sm:px-10">
        <div className="mx-auto max-w-4xl">
          <h1 className="reveal text-4xl sm:text-5xl">Which shop?</h1>
          <p className="reveal mt-3 text-bone/60" style={{ animationDelay: '60ms' }}>
            Your barber, your history and your usual service follow you to any of them.
          </p>

          <div className="mt-10 grid gap-px bg-ink-3">
            {shops.map((shop, i) => (
              <Link
                key={shop.id}
                href={`/book/${shop.slug}`}
                className="reveal group flex items-center justify-between gap-6 bg-ink px-6 py-7 transition-colors hover:bg-ink-2"
                style={{ animationDelay: `${100 + i * 70}ms` }}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl">{shop.name.replace('Sharp & Sons — ', '')}</h2>
                    {shop.is_pilot && <span className="tag text-oxblood-hi">Pilot shop</span>}
                  </div>
                  <p className="mt-1 text-sm text-bone/50">{shop.address}</p>
                  {shop.phone && (
                    <p className="num mt-1 text-xs text-muted">{shop.phone}</p>
                  )}
                </div>
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
