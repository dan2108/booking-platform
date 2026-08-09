# Plan — to the one-shop pilot

Drafted 2026-07-27 against `REQUIREMENTS.md` v3.

> **Status note, added 2026-07-30.** This plan was **never formally signed off**.
> Building started anyway, on Dan's instruction, to get a working demo in front of the
> business. Layers 0–5 are built and tested; layers 6–7 are not started. The stack in §2
> is now recorded in CLAUDE.md and is therefore settled.
>
> The plan should still be read and approved on its merits — the existence of code is
> not the same as agreement, and §7 lists opens that a demo does not close. Progress
> against each layer is marked inline below; `docs/ARCHITECTURE.md` has the honest gap
> list.

## 1. What this plan is for

Get **one pilot shop running real clients** on online booking + a staff calendar, with a
provable no-double-booking guarantee. Then the 6-shop trial. Then 20+.

Everything below is sequenced so that **the hardest and most valuable thing is proved
first** (the reservation guarantee), and every layer has a definition of done you can
check without believing anyone's claims.

## 2. Architecture

**Stack (recommended — §13 of requirements):** Next.js App Router + TypeScript strict +
Tailwind, pnpm · Supabase (Postgres + Auth) · Vercel · PWA for staff, no native app.

**Three surfaces, one codebase:**

| Surface | Who | Device | Auth |
|---|---|---|---|
| Public booking | clients | own phone | none — mobile is identity, no login |
| Staff | barbers | own phone (PWA) | Supabase Auth |
| Admin | managers, head office | phone/desktop | Supabase Auth |

**Shape of the system:**

- **Tenancy in the database, not the app.** Every row carries `shop_id`. RLS enforces
  isolation at the database so an application bug can't leak shop A's clients to shop B.
  This is what makes non-negotiable #1 real instead of aspirational.
- **The reservation is server-owned.** Booking writes go through a Postgres function in
  a transaction. No client-issued inserts into `appointments`, ever.
- **Adapters from day one** (non-negotiable #3): `NotificationPort` with `email` and
  `sms` implementations behind it. Core booking logic never imports a vendor SDK.
  SMS is metered money — the adapter logs every send and its cost.
- **Pure core.** Availability calculation, slot generation and rota expansion are pure
  functions over plain data — unit-testable on fixtures with no database.

## 3. Data model (first cut)

```
shops            id, name, address, timezone
staff            id, shop_id, name, role(barber|manager|head_office), auth_user_id
services         id, name, duration_minutes, price          -- central, no per-shop variation
clients          id, name?, mobile?, email?, no_show_count   -- COMPANY-scoped, no shop_id
rota_patterns    id, staff_id, weekday, start_time, end_time -- recurring weekly
rota_exceptions  id, staff_id, date, start_time?, end_time?  -- holiday / one-off change
appointments     id, shop_id, barber_id, client_id?, service_id,
                 starts_at, ends_at, status, source, at_risk, created_by
```

Notes and the reasoning behind the awkward bits:

- **`clients.mobile` is nullable** and `client_id` on an appointment is nullable —
  walk-ins may be anonymous (requirements §3). Online bookings enforce a mobile at the
  application layer, not with a `NOT NULL`, because the same table serves both channels.
- **`clients` has no `shop_id` — decided: company-owned** (requirements §3, v4). One
  person, one record, bookable at any of the 20+ shops, history follows them. This
  **splits the tenancy boundary in two** and it's the most important consequence of the
  decision:
  - `appointments`, `staff`, `rota_*` → **shop-scoped**, RLS isolates by `shop_id`
  - `clients` → **company-scoped**, RLS grants any authenticated staff member read access
  - so "a barber cannot see another shop's clients" is **no longer true, by design**. A
    barber at shop A can look up a client who only ever visits shop B — that's what makes
    cross-shop booking and a single win-back list work. The layer 1 deny-path tests are
    reworded accordingly: appointments stay isolated, clients deliberately aren't.
  - the thing still worth protecting is **cross-shop booking *history***. Recommendation:
    staff see a client's identity company-wide but their appointment history only for
    shops they're entitled to. Cheap now, awkward to retrofit.
- **`services` has no `shop_id`** — flat pricing, one central catalogue (requirements §4).
- **Rotas as pattern + exception** rather than materialised rows — a barber's variable
  weekly hours are a recurring pattern with overrides, not 52 weeks of data.

## 4. The correctness core

The one thing that must be provably right:

```sql
-- two overlapping PROMISES for one barber are physically impossible
ALTER TABLE appointments ADD CONSTRAINT no_double_booking
  EXCLUDE USING gist (
    barber_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status = 'booked');
```

- Covers `booked` only, so a live overrun is allowed and flagged instead of blocked
  (requirements §9, open B).
- Requires the `btree_gist` extension.
- **Cancelled/completed rows free the slot automatically** — no cleanup job.

Everything else in the system is CRUD around this. Availability is a read-side
convenience that can never contradict it: if two people race, one gets "that slot just
went", which is correct behaviour rather than a failure.

## 5. Build order

Each layer has a definition of done that is checkable. **Green tests = done. Not green
= not done.** No layer starts before the one above it is green.

### Layer 0 — Foundations  ·  **BUILT**
Repo scaffold, Next.js + TS strict + Tailwind, pnpm, Supabase project, `.env.example`,
CI running lint + typecheck + test.
**Done when:** pipeline is green on an empty app and a fresh clone runs from
`.env.example` alone.

### Layer 1 — Schema, tenancy, and the guarantee *(no UI)*  ·  **BUILT — all four proofs green**
Migrations for the §3 model. RLS policies. The §4 exclusion constraint.
**Done when:**
- migrations apply to a clean database
- a test proves two overlapping `booked` inserts → **exactly one succeeds**
- a test proves a live overrun (`in_progress`) is **allowed** and flags the next
  appointment `at_risk`
- **deny-path RLS tests**: a barber cannot read another shop's **appointments**, and a
  manager cannot read another shop's calendar or rotas at all
- **cross-shop client tests**: any staff member *can* resolve a company-wide client
  record, but a barber cannot read that client's appointment history at shops they
  aren't entitled to

This layer is the whole project's risk. It has no screens and it is the most important
week of work.

### Layer 2 — Availability + reservation engine  ·  **BUILT — 12-connection race passes**
Rota expansion, slot generation, lead-time buffer, the server-owned `reserve()` function.
**Done when:** pure-function tests pass on fixtures covering variable hours, exceptions,
existing appointments and the buffer; and a **concurrency test** fires N simultaneous
reservations at one slot and exactly one wins.

### Layer 3 — Rota editor (manager)  ·  **BUILT**
Weekly patterns + exceptions.
**Done when:** a manager can set up the pilot shop's real rotas and availability reflects
them. *(Sequencing note: layer 4 could come first on seeded rotas, but a manager needs
this to onboard the shop anyway, and seeded rotas give you a demo you can't put real
clients on. Recommend keeping it here.)*

### Layer 4 — Public booking flow  ·  **BUILT**
Pick barber → service → time → confirm with name + mobile. Client dedupe on mobile.
**Done when:** a real booking completes end-to-end on the pilot shop's real rotas, and
the concurrency test from layer 2 still holds through the HTTP path.

### Layer 5 — Staff surface (barber's phone)  ·  **BUILT — except push, unverified on iOS**
Own-day calendar, start walk-in now, book walk-in for later, mark complete / no-show,
at-risk warnings, optional one-tap contact capture.
**Done when:** a barber can run a full day from their own phone without another device.

### Layer 6 — Notifications  ·  **NOT STARTED**
`NotificationPort` + email confirmations first (near-free), then SMS behind the same
adapter with per-message cost logging and a spend cap.
**Done when:** booking confirmations send, reminders fire on schedule, every send is
logged with its cost, and the SMS adapter can be swapped without touching booking logic.

### Layer 7 — Pilot hardening  ·  **NOT STARTED**
Manager + head-office views, no-show counter, pilot shop data seeded, and instrumentation
for the four pilot measurements in requirements §12a.
**Done when:** the shop can be run for a week without you intervening.

**Then:** pilot → review against §12a → 6-shop trial → company-wide.

## 6. Explicitly not in this plan

Payments or till of any kind (§8) · deposits · OTP verification · "any available barber"
allocation · cross-shop staff · per-barber pricing or durations · SaaS signup/billing ·
native apps · Fresha data import *(see open below)*.

## 7. Open decisions in this plan

**Closed 2026-07-27:** clients are **company-owned** (§3) · the pilot is a **Fresha
shop**, which confirms **layer 4 (public booking) before layer 5 (staff surface)** —
that shop's clients already book online, so the public flow is what they meet first ·
**no client login** — the mobile number is the account, so **Supabase Auth is staff-only**
and there is no second auth role class to build.

**Nothing now blocks layer 1.**

1. **Fresha client list + history import** — now on the critical path, not a nice-to-have:
   the pilot shop's clients live in Fresha today, and reason #1 for the whole project is
   owning that data. Needs scoping before cutover. **Action: check what Fresha actually
   lets you export** (clients, history, or neither) — that answer constrains the plan.
3. **SMS provider** — deferred to layer 6, chosen on UK per-message cost.

## 8. Biggest risks

- **RLS misconfiguration leaks client data across shops.** Mitigated by deny-path tests
  in layer 1, before a second shop exists.
- **Online booking adoption in walk-in shops is unproven** (requirements §12a.2). The
  thesis of the whole project rests on it and no amount of engineering de-risks it —
  only the pilot does.
- **Barbers won't capture walk-in contacts**, gutting the win-back upside (§6).
  Measured in the pilot; fixed with UX, not policy.
- **iOS PWA push limitations** could undermine the staff surface. Verify at layer 5,
  before it's load-bearing.
- **Fixed durations with no buffer** may not survive contact with reality (§4).
  Overrun frequency in the pilot tells us.
