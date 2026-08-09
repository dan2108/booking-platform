# CLAUDE.md — standing rules for this repo

Loaded into every session. This is the operating contract for working on this codebase.

## What this is

An appointment booking platform for a barbering business operating **multiple shops**.
The business currently runs on **Fresha** (booking/POS SaaS for salons and barbers:
online bookings, staff calendars/rotas, client records, payments, reminders, and a
consumer marketplace that charges fees for new-client bookings). This project exists to
replace/outgrow that. Any plan starts from understanding what Fresha actually does for
the business day-to-day — don't design in a vacuum.

## Current status

**BUILDING — a working vertical slice exists.** Superseded the planning-stage freeze on
2026-07-30, when Dan asked for a demo-ready build. Layers 0–5 of `docs/PLAN.md` are
built and tested against a live database; layer 6 (notifications) and layer 7 (pilot
hardening) are not started. See `docs/ARCHITECTURE.md` for what exists and the honest
list of gaps.

The plan document was **not formally signed off before building started** — that
sequencing was overridden by the demo deadline, deliberately and with Dan's instruction.
Nothing in the build contradicts the plan, but the plan should be re-read and approved
rather than treated as ratified by the fact that code now exists.

## Non-negotiables

1. **Multi-shop from day one.** Every entity namespaced by shop/tenant ID.
   *Implemented, with one deliberate exception recorded below.*
2. **Bookings are money.** Double-bookings, lost appointments, and silent failures are
   unacceptable. Side-effecting paths fail closed; errors raise → log → surface.
   *Implemented as a Postgres exclusion constraint, not application logic.*
3. **External services behind adapter layers** (payments, SMS/email reminders, calendar
   sync). Core booking logic never calls a vendor directly. *Not yet exercised —
   no external service is wired up.*
4. Secrets in `.env` (gitignored) with a documented `.env.example`. *Done.*

### Amendment to #1, agreed in requirements v4

The tenancy boundary is **split**, on purpose:

- `appointments`, `staff`, `rota_*` → shop-scoped, isolated by RLS
- `clients` → **company-scoped**; any staff member can resolve any client

So "a barber cannot see another shop's clients" is **not true** in this system, by
design. One person, one record, across all 20+ shops is what makes cross-shop booking
and a single win-back list work. Cross-shop appointment *history* is still protected.
Do not "fix" this by adding `shop_id` to `clients`.

## Stack — decided 2026-07-30

Recorded here, so per the old contract this is now settled rather than recommended.

- **Next.js (App Router) + TypeScript strict + Tailwind, pnpm**
- **Supabase (Postgres + Auth)** — the reservation guarantee is a Postgres feature, so
  the database is not an implementation detail to be abstracted over
- **Vercel** for hosting
- **PWA, not native** — barbers use their own phones
- **Luxon** for time. Rota times are wall-clock local to the shop; the timezone is not
  optional decoration
- **Vitest** for tests, including integration tests against a real Postgres
- **Self-hosted fonts**, not Google Fonts — see `docs/ARCHITECTURE.md`

## Conventions

Global baseline (`~/.claude/CLAUDE.md`) applies. On top of that:

- **No client-side database access.** `src/lib/supabase/server.ts` is `server-only`.
  Every read is a server component, every write a server action or route handler.
- **`reserve()` is the only way an appointment is created.** There is no INSERT policy
  on `appointments` for any role, and a test asserts that for every role. Do not add one.
- **Availability logic stays pure.** `src/lib/availability.ts` takes plain data and an
  injected clock. If a change to it needs a database to test, the change is wrong.
- **Expected revenue is never called takings.** Card sales are on a separate terminal;
  the number has no tips, discounts or comps in it and will not reconcile.
- **Green tests = done.** Not green = not done.

## Build order

`docs/PLAN.md` §5. Layers 0–5 built. Next up, in order:

1. **Staff auth** — replace the demo role switcher with Supabase Auth. The RLS policies
   are already written and tested against real personas; this is wiring, not redesign.
2. **Revoke the `anon` grant on `reserve()`** once the service-role key is in the
   deployment environment.
3. **Layer 6 — notifications** behind `NotificationPort`. Email first (near-free), SMS
   after, with per-message cost logging and a spend cap.
4. **Fresha export scoping.** On the critical path: the pilot shop is a Fresha shop and
   owning that client list is reason #1 for the whole project. If Fresha will not export
   history, that changes the plan — find out before committing to a cutover date.
