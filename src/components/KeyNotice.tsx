import Link from 'next/link';

/**
 * Shown when the server is running on the publishable key alone.
 *
 * The public booking flow works on public keys by design (see migration 0008).
 * The staff surfaces read appointments and client records, and Row-Level
 * Security correctly refuses that to anyone who is not a staff member — a
 * publishable key is not a staff member.
 *
 * This is the security model working, not a bug. Rendering an honest notice is
 * better than a 500, and much better than loosening the policies to make a
 * screen render.
 */
export function KeyNotice({ surface }: { surface: string }) {
  return (
    <main className="min-h-screen">
      <div className="pole-rule" />
      <div className="mx-auto max-w-2xl px-6 py-20 sm:px-10">
        <p className="eyebrow">Locked</p>
        <h1 className="mt-3 text-4xl leading-tight">
          The {surface} needs a staff key.
        </h1>

        <p className="mt-6 leading-relaxed text-bone/70">
          This surface reads appointments and client records. Row-Level Security is
          refusing, because this server is running on the public key and a public key is
          not a staff member.
        </p>
        <p className="mt-4 leading-relaxed text-bone/70">
          That is the tenancy boundary doing exactly its job — no screen can talk its way
          past it. The public booking flow works without it, because a booking page is
          meant to be public.
        </p>

        <div className="mt-8 border border-ink-3 px-5 py-5">
          <p className="eyebrow">To unlock</p>
          <p className="mt-2 text-sm leading-relaxed text-bone/60">
            Set <code className="num text-bone">SUPABASE_SERVICE_ROLE_KEY</code> in the
            deployment environment and redeploy. Nothing else changes — the key is read
            server-side only and never reaches the browser.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/book" className="btn btn-primary">
            Book an appointment →
          </Link>
          <Link href="/proof" className="btn btn-ghost">
            See the guarantee
          </Link>
          <Link href="/" className="btn btn-ghost">
            Back
          </Link>
        </div>
      </div>
    </main>
  );
}
