# Architecture

What was built, why it is shaped this way, and where the edges are.
Companion to `REQUIREMENTS.md` (what the business needs) and `PLAN.md` (the
build order). This one is about the code.

## The shape

```
Client's phone ─┐
                ├─► Next.js server ──► Postgres  ◄── the guarantee lives here
Barber's phone ─┘   (server actions,      │
                     route handlers)      └── RLS enforces tenancy
```

One codebase, four surfaces, one database. The browser holds no database
credential and issues no queries: every read is a server component and every
write is a server action. `src/lib/supabase/server.ts` is marked `server-only`,
so importing it from a client component is a build error rather than a
production incident.

| Surface | Route | Who | Auth |
|---|---|---|---|
| Public booking | `/book` | clients | none — the mobile number is the account |
| Barber's day | `/staff/[id]` | barbers | staff session (demo: role switcher) |
| Shop floor + rota | `/manager` | managers | staff session |
| Head office | `/admin` | ops | staff session |
| The guarantee | `/proof` | anyone | none |

## The correctness core

Everything else in this system is CRUD around one constraint.

```sql
ALTER TABLE appointments ADD CONSTRAINT no_double_booking
  EXCLUDE USING gist (
    barber_id                           WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status = 'booked');
```

**Why in the database.** The usual approach — check whether the slot is free,
then insert — has a gap between the two steps. Under real traffic (a client on
their phone while a barber books a walk-in at the counter) two writes pass the
same check and both commit. Locking closes it, but only if every future code
path remembers to take the lock. A constraint cannot be forgotten by code that
does not exist yet.

**Why `booked` only.** A `booked` row is a *promise to a client* and is
constrained absolutely. An `in_progress` row is a *record of what is physically
happening* and deliberately is not — so a barber can start a walk-in that will
overrun their next appointment. The system records reality and flags the
downstream appointment `at_risk` rather than blocking the chair or silently
moving anyone. Fail closed on promises, fail visible on live overruns.

**Why nothing to clean up.** Cancelled and completed rows fall outside the
predicate, so a cancellation frees the slot the instant it happens. There is no
nightly job to forget to run.

**Half-open ranges.** `[start, end)` means a 10:00–10:30 and a 10:30–11:00
appointment do not overlap. Back-to-back bookings work; that is the whole
reason for the `'[)'` and it is worth not changing by accident.

## The reservation path

`reserve()` (`supabase/migrations/0004`) is the only way an appointment comes
into existence. There is **no INSERT policy on `appointments` for any role** —
that is asserted by a test, for every role, so "server-owned" is a mechanical
fact rather than a convention.

Both entry surfaces call the same function, so an online booking for 11:40 and
a staff-booked walk-in for 11:40 compete atomically. `source` is recorded for
reporting and never branches behaviour.

It returns a **structured result** rather than throwing on expected failures:
`slot_taken`, `outside_rota`, `too_soon`, `in_past`, `mobile_required`. Losing
a race is a correct outcome, not an error. Anything genuinely unexpected still
raises and surfaces.

One subtlety worth knowing about: client dedupe on mobile is a single atomic
upsert, not select-then-insert. Two reservations arriving at the same instant
for the same *new* number — a client double-tapping confirm — otherwise both
find nothing, both insert, and the second dies on the unique index. That was a
real bug, caught by the concurrency test rather than by reading the code.

## Tenancy, and the hole in it

Enforced by RLS in the database, not by the application. A bug in a screen
cannot widen what a role can read.

- `appointments`, `staff`, `rota_*` → **shop-scoped**. Within a shop, a barber
  sees only their own column; a manager sees the whole shop; head office sees
  everything.
- `clients` → **company-scoped, on purpose**. Every staff member can resolve
  every client.

That second one is a deliberate hole and worth being explicit about: "a barber
cannot see another shop's clients" is **not true here**, by design. One person,
one record, across all 20+ shops is exactly what makes cross-shop booking and a
single win-back list work — and it is the asset the business is leaving Fresha
to own.

What *is* still protected is cross-shop **history**: a Camden barber can look a
client up by number but cannot read what that client had done in Shoreditch.
Cheap to build now, awkward to retrofit later.

The helper functions (`auth_staff_id()` and friends) are `SECURITY DEFINER` so
they bypass RLS themselves — without that, a policy on `staff` that queries
`staff` recurses forever.

## Availability

`src/lib/availability.ts` is **pure**. No database, no network, no clock unless
one is passed in. Rota expansion, slot generation and the lead-time buffer are
functions over plain data, tested on fixtures.

This matters because availability is where subtle wrongness hides: variable
weekly hours, holidays, one-off changes, and British Summer Time. Rota times
are wall-clock local to the shop; whether "09:00" is `08:00Z` or `09:00Z`
depends on the date, and hard-coding either books everyone an hour out for half
the year. There are tests for both sides of the clock change.

Availability is only ever a **read-side convenience**. If it says a slot is free
and two people race for it, the constraint still lets exactly one through.

## Testing

```
pnpm test        # everything
pnpm test:unit   # pure functions, no database
pnpm db:up       # local Postgres + migrations + seed
pnpm test:db     # integration, real concurrency
```

47 tests. The ones that matter:

- **12 simultaneous reservations on 12 separate connections** for one slot.
  Exactly one commits; the other 11 get `slot_taken`; the database holds one
  row. This is the guarantee proved the only honest way.
- Live overrun is permitted and flags the next appointment.
- Cancelling frees the slot immediately.
- Deny-path RLS for every persona, including *no role can insert directly*.
- Four spellings of a UK mobile resolve to one client.

`tests/db` needs a local Postgres and no cloud account — the correctness core
is plain Postgres, not a Supabase feature. `scripts/local-db.sh` builds one
from the migrations in about ten seconds.

## Decisions worth knowing

**Self-hosted fonts.** Not Google Fonts. A client-facing UK site that loads
fonts from a third party sends a visitor's IP to that third party on every page
view — avoidable complication under UK GDPR/PECR, and an avoidable dependency.
Not legal advice; worth a professional's eye before go-live.

**No client login.** No passwords, no sessions, no credential-reset surface, no
account-management screens. The mobile number is the account. Supabase Auth is
staff-only. Accepted cost: clients cannot browse their bookings unprompted —
they need the confirmation link.

**Rotas as pattern + exception.** A barber's variable week is a recurring
pattern with dated overrides, not 52 weeks of rows.

**PWA, not native.** Barbers use their own phones. No app store, no install
friction, no release cycle. **Verify iOS push before it becomes load-bearing** —
it is the most likely reason to revisit this.

**Expected revenue, not takings.** Flat central pricing means a completed
appointment yields expected value for free. It has no tips, discounts, product
sales or comps in it and will never reconcile with the terminal. Labelled as
expected everywhere it appears.

## Known gaps

Honest list. Nothing here is hidden in a footnote.

1. **Staff auth is a role switcher, not a login.** The RLS policies are real and
   tested against real personas; the demo picks an identity rather than
   authenticating one. Wiring Supabase Auth is a small job, not a redesign.
2. **`reserve()` is currently granted to `anon`** so the demo runs on public
   keys alone. With the service-role key wired in, revoke it — the browser then
   has no path to the function at all. Validation, the constraint and the
   absence of INSERT policies are unaffected either way.
3. **No notifications.** `NotificationPort` is designed (PLAN.md Layer 6) and
   not built. No confirmations, no reminders, no win-back.
4. **No Fresha import.** On the critical path, because the pilot shop's clients
   live in Fresha today. Needs scoping before any cutover.
5. **No rate limiting** on the public booking action. Fine for a demo, not for
   a public URL with real clients.
6. **No "any available barber"**, no cross-shop staff, no per-barber pricing or
   durations, no deposits, no payments. All deliberately out of scope.
