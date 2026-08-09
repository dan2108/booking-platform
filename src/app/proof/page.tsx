import Link from 'next/link';
import { ProofRunner } from '@/components/ProofRunner';

export const metadata = { title: 'The guarantee — Sharp & Sons' };

const CONSTRAINT = `ALTER TABLE appointments
  ADD CONSTRAINT no_double_booking
  EXCLUDE USING gist (
    barber_id                           WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (status = 'booked');`;

export default function Proof() {
  return (
    <main className="min-h-screen pb-24">
      <div className="pole-rule" />

      <header className="border-b border-ink-3 px-6 py-8 sm:px-10">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/" className="font-mono text-xs uppercase tracking-[0.14em] text-muted hover:text-bone">
            ← Demo
          </Link>
          <p className="eyebrow">The guarantee</p>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 sm:px-10">
        {/* ------------------------------------------------------- intro -- */}
        <section className="py-14">
          <p className="eyebrow reveal">Non-negotiable #2</p>
          <h1 className="reveal mt-4 max-w-3xl text-4xl leading-[1.05] sm:text-6xl" style={{ animationDelay: '60ms' }}>
            Two clients can never be promised
            <span className="italic text-oxblood-hi"> the same barber</span> at the same time.
          </h1>

          <p className="reveal mt-8 max-w-2xl leading-relaxed text-bone/70" style={{ animationDelay: '120ms' }}>
            Most booking systems enforce this in application code: check whether the slot is
            free, then write the appointment. Between those two steps sits a gap, and under
            real traffic — a client on their phone while a barber books a walk-in at the
            counter — two writes can pass the same check.
          </p>

          <p className="reveal mt-4 max-w-2xl leading-relaxed text-bone/70" style={{ animationDelay: '160ms' }}>
            This system closes the gap by not having one. The rule lives in the database as a
            single constraint, so the second overlapping booking is not rejected by a check —
            it is <em className="not-italic text-bone">impossible to store</em>.
          </p>

          <pre className="reveal mt-10 overflow-x-auto border border-ink-3 bg-ink-2 px-5 py-5 text-[0.8125rem] leading-relaxed text-bone/85" style={{ animationDelay: '200ms' }}>
            <code className="font-mono">{CONSTRAINT}</code>
          </pre>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              {
                h: 'Why a range, not a time',
                p: 'A booking occupies an interval. Overlap is the actual question, and Postgres answers it directly with a GiST index rather than four fiddly comparisons that are easy to get subtly wrong.',
              },
              {
                h: 'Why “booked” only',
                p: 'A booked row is a promise to a client and is constrained absolutely. Work already in progress is a record of reality, not a promise — so a barber can overrun into their next appointment and the system flags it instead of blocking the chair.',
              },
              {
                h: 'Why nothing to clean up',
                p: 'Cancelled and completed rows fall out of the constraint automatically, so a cancellation frees the slot the instant it happens. There is no nightly job to forget to run.',
              },
            ].map((c) => (
              <div key={c.h} className="border-t border-ink-3 pt-4">
                <h3 className="text-lg">{c.h}</h3>
                <p className="mt-2 text-xs leading-relaxed text-bone/55">{c.p}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="border-t border-ink-3 pt-14">
          <ProofRunner />
        </div>

        {/* ------------------------------------------------------ closing -- */}
        <section className="mt-16 border-t border-ink-3 pt-14">
          <p className="eyebrow">Why this matters commercially</p>
          <h2 className="mt-3 max-w-3xl text-3xl leading-tight sm:text-4xl">
            A double-booking costs a client, not a bug report.
          </h2>
          <p className="mt-6 max-w-2xl leading-relaxed text-bone/60">
            Two people turn up for the same chair. One waits or leaves. The barber absorbs it,
            the manager hears about it, and the client who left tells people. It is the single
            failure that would end a pilot fastest — so it is the first thing this system was
            built to make impossible, before a single screen existed.
          </p>
          <p className="mt-4 max-w-2xl leading-relaxed text-bone/60">
            The same guarantee is what lets walk-ins and online bookings share one path. Without
            it, the safe design would be to keep them apart — and then the counter and the
            website would quietly disagree about who owns 11:40.
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/book" className="btn btn-primary">
              Book an appointment →
            </Link>
            <Link href="/staff" className="btn btn-ghost">
              Open a barber’s phone
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
