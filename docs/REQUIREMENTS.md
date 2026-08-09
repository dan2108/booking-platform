# Requirements — Discovery v3

Captured from discovery with Dan on 2026-07-21. Revised 2026-07-22 (scale + walk-in
model), 2026-07-27 (v1 open decisions closed) and **2026-07-27 (v2 opens A–D closed —
walk-in contact optional, overrun allowed, no OTP, card sales move to a third-party
terminal)**. This is the factual basis the plan hangs off. Where something is undecided
it's marked **OPEN**. Nothing here is code — it's the agreed picture of the business and
what "day one" means.

## 1. What this actually is

A **large barbering company (20+ shops)** building its own booking platform to trial in
a **cohort of ~6 shops** first, then roll out company-wide. Not a Fresha migration — a
**rollout**. Only a handful of shops are on Fresha today; the rest are **walk-in shops
with no booking system at all**. So the project both (a) replaces Fresha for a few shops
and (b) introduces online booking to shops that have never had it. The second is the
bigger behaviour change and the bigger upside.

**Deliberately scoped down:** the company is 20+ shops, but we build and prove the
system on a **6-shop trial** before touching the rest. Design must scale to 20+ (and the
SaaS option, §10) but we do not deploy wide until the trial holds up.

**Why leave Fresha** (in priority order given):
1. Own the data and the client relationship — the client list and booking history
   currently live in someone else's platform.
2. Subscription / per-seat cost.
3. Marketplace / new-client fees.

**Not** a reason: missing features. Fresha does the job. This is a cost-and-ownership
play, which sets a hard bar — **we must reach rough feature parity before switching a
shop over.** We will not beat Fresha on features; the win is fees, cost, and ownership.

**v3 update:** card sales move to a **third-party card terminal**, independent of any
booking software (§8). Fresha is therefore replaced **in full** once booking moves —
all three reasons for leaving are served, and there is no residual Fresha dependency to
stage. This is a significantly cleaner exit than v2 assumed.

## 2. Scale

- **Company: 20+ shops, 25+ staff.** Multi-shop and cross-shop reporting are real from
  day one, not hypothetical. Design for 20+ from the start.
- **Trial cohort: ~6 shops.** What we build and deploy first. Roll out to the remaining
  shops only after the trial proves out.
- Only a handful currently on Fresha; the majority are walk-in.

## 3. Core operating model

- **Booking channel:** mostly online self-serve. The **client-facing booking flow is
  the critical path**, not the staff calendar.
- **Booking flow:** client picks **shop → barber → service → time.** Clients are loyal
  to a specific barber; availability is driven by that barber's rota. ("Any available"
  allocation is *not* required day one.) The shop step is new in v4 (cross-shop booking)
  and should default to the client's usual shop where we know it, not ask cold.
- **Walk-ins are booked, not just absorbed (v2 — decision 1).** Staff must be able to
  **book a walk-in into a slot** from their own side, not merely mark "in the chair
  now". In practice that covers both: the client who sits down immediately, and the
  client told "come back at 11:40" who gets put in the book. This means walk-ins
  **share the same reservation path as online bookings** — see §9, which changed
  substantially as a result.
- **Clients belong to the company, not to a shop (v4).** One person = one client record
  across all 20+ shops. They can **book at any shop**, and their history follows them.
  This is the asset we're leaving Fresha to own, so it does not get fragmented per site.
  Architectural consequence: `clients` is **company-scoped**; appointments, staff and
  rotas stay **shop-scoped**. See PLAN.md §3 — it changes the tenancy boundary and the
  RLS deny-path tests.
- **Client identity — split by channel (v3, refining decision 3).**
  - **Online bookings require a mobile.** No guest path. Every online booking is tied to
    a **persistent client record keyed on mobile number** (email too where given).
    Returning clients are recognised by mobile and their history pulled.
    **No client login (v4 — open E closed).** No passwords, no signup, no sessions, no
    credential-reset or account-management surface. **The mobile number *is* the
    account**: enter it, we recognise you, your history and usual barber come with you,
    and you can book at any shop. Supabase Auth therefore stays **staff-only** — a much
    smaller auth surface than "clients can book across shops" first suggests.
    Consequence, accepted: clients can't browse or cancel their bookings unprompted —
    they need the link we send them in the confirmation (§6).
  - **Walk-ins do not require a contact (v3 — open A closed).** A barber can start a
    walk-in with no number and no name. Contact capture is **optional and one-tap
    skippable**, never a blocker at the chair.
  - Known cost of that split, accepted: walk-in-only clients stay anonymous, so they are
    invisible to reminders and win-back (§6), and a walk-in booked into a *later* slot
    can't be reminded or contacted if it's left blank. Mitigation is UX, not policy —
    prompt for the number, make skipping instant, and let the barber attach it after.

## 4. Staff, rotas, services

- **Rotas:** every barber is **fixed to one shop** but works **variable weekly hours.**
  Needs a real rota editor. **No cross-shop availability** — a barber can't be
  double-booked across locations because they only ever work one. This removes the
  worst scheduling complexity.
- **Services & pricing:** **same services, same prices across every shop.** One central
  catalogue; shops consume it. No per-shop or per-barber price variation. Flat pricing.
- **Durations:** **fixed duration per service, no turnaround gap.** Simplest slot
  generation. (Reality is appointments overrun — the system must tolerate running late,
  but we are *not* modelling per-barber speed or buffers.)

## 5. Access / roles

- **Barber:** sees only their own column / own bookings. **Read-only on their own rota.**
- **Shop manager:** sees their whole shop — calendar, staff rotas, client records for
  that site. **Owns rota editing (v2 — decision 4: manager-managed, not self-serve).**
- **Head office:** **multiple people** need a cross-shop view (Dan + at least an ops
  manager). Cross-shop calendars, reporting, client records.

## 6. Notifications

- **SMS reminders** before appointment — the main recurring running cost (~2–4p/msg UK).
- **Email confirmations and reminders** — near-free.
- **Booking confirmation** at time of booking.
- **Rebooking / win-back** prompts to lapsed clients — a revenue driver, not just admin.

All of these go **behind adapter layers** (per CLAUDE.md non-negotiable #3). SMS cost is
real money and metered — needs spend tracking.

**v3 note — the win-back list is only as good as walk-in capture.** Every *online*
client is contactable by construction. Walk-in-only clients are contactable **only if a
barber bothers to take the number**, which v3 makes optional (§3). Since most shops are
walk-in shops today, that is where the untapped list actually lives. Win-back is still
the biggest commercial lever in the project, but it is now a **behaviour/UX problem, not
a data-model guarantee** — and worth measuring during the pilot (what % of walk-ins get
a number attached). If capture is low, that's the lever to revisit, not the model.

## 7. No-shows

- Currently **absorbed, no policy.** No deposits (payments out of scope day one).
- Cheap win available: a **no-show count on the client record** so staff can see repeat
  offenders. Formalises what staff already track informally. Low cost, no payment rails.
- Deposits / penalties explicitly **out of scope** for now.

## 8. Payments — third-party terminal, outside the platform (v3 — open D closed)

- **Card sales move to a standalone third-party card terminal**, independent of any
  booking software. Fresha's till is not replaced by ours — it's replaced by a terminal.
- **Consequence: Fresha exits completely** when booking moves. No residual dependency,
  no staged till migration, no dual-entry-into-Fresha problem. The v2 concern that the
  pilot would die of counter friction is **resolved** — the barber takes the money on a
  terminal, exactly as a walk-in shop already does today.
- **Our system still holds no payment rails.** No PCI scope, no card capture, no saved
  cards, no refund logic, no deposits. Unchanged and still the right call — the terminal
  is the merchant of record, we are not in the money path at all.
- **We still don't get true takings.** An unintegrated terminal means real revenue lives
  with the terminal provider, not with us.
  - **Cheap partial win available:** because pricing is flat and central (§4), marking an
    appointment `completed` yields **expected** revenue for free — no payment integration,
    no money handling. Good enough for utilisation, per-barber and per-shop comparison,
    and trend reporting.
  - **It must be labelled as expected, not actual.** It won't reconcile with the terminal:
    no tips, discounts, product sales, comps, or price overrides. Presenting it as takings
    would be overselling a soft number. **OPEN (low priority):** whether Dan wants that
    expected-revenue view at all in the pilot.
- **OPEN (not blocking):** which terminal provider. Only matters later — some (SumUp,
  Zettle, Dojo) expose APIs that could reconcile actual takings against appointments in a
  future phase. Worth knowing before that phase, irrelevant to the pilot.

## 9. Booking engine — one reservation path (revised in v2)

CLAUDE.md non-negotiable #2 — double-bookings are unacceptable, side-effecting paths
fail closed.

**v1 said** walk-ins were always "now", tied to the barber physically starting them, and
therefore off the future-reservation path entirely — no race, no locking. **Decision 1
removes that simplification.** If staff can book a walk-in into a slot, a staff booking
and an online booking can race for the same barber-time. The v1 two-type model would
have left a hole between the two paths.

**The v2 model is simpler, not more complex — collapse to one type.**

A barber's day is a timeline of **appointments**. One entity, whatever created it:

- `shop_id`, `barber_id`, `client_id`, `service_id`
- `starts_at`, `ends_at` (derived from the service's fixed duration)
- `source`: `online` | `staff` — reporting and behaviour insight, **not** a different
  code path
- `status`: `booked` | `in_progress` | `completed` | `no_show` | `cancelled`

A walk-in is just an appointment with `source = staff`, started now or booked for later.
**One entity, one atomic reservation, two entry surfaces (public web, staff phone).**

**The one correctness-critical operation** is "reserve this barber for this time range".
Recommended implementation — enforced in Postgres, not in application code:

- an **exclusion constraint** on `(barber_id, [starts_at, ends_at))` so that two
  overlapping appointments for one barber are **physically impossible to insert**,
  regardless of races, retries, or application bugs
- **scoped to `booked` rows only** — see below. Cancelled rows free the slot.

This is stronger than application-level locking and it's a single constraint. The
availability calculation becomes a read-side convenience that can never disagree with
the write-side guarantee: worst case a race loses and the client is told "that slot just
went" — which is correct behaviour, not a failure.

**Why the constraint covers `booked` only (v3 — open B closed: overruns are allowed).**
The guarantee the business actually needs is *"no two clients are ever promised the same
barber at the same time."* That's a statement about **reservations**, not about events.
So:

- **`booked` = a promise to a client.** Constrained absolutely. An online booking and a
  staff-booked walk-in for a later slot are both promises and both compete for the same
  barber-time, atomically. This is the money path and it is provably safe.
- **`in_progress` = a record of what is physically happening.** Not a promise, so not
  constrained. A barber can start a walk-in that will run past their next appointment —
  the system records reality rather than blocking the chair. The next appointment is
  flagged **at-risk / running late** and surfaced to the barber, not silently overwritten
  and never auto-moved.

Two appointments can therefore overlap on the timeline *only* once work is underway and
a human caused it. No promise is ever double-issued. Fail-closed on reservations,
fail-visible on live overruns.

**Online availability** = barber's rota − their live appointments − a short **booking
lead-time buffer** (so nobody books a slot minutes away while a walk-in is mid-cut).

## 10. Timeline & ambition

- **No hard deadline — build it right.** Sequence properly, cut over when genuinely
  ready. **Pilot in one shop** first (online booking + calendar, real clients), then
  expand to the full **6-shop trial cohort**, then company-wide (20+).
- **The pilot shop is a Fresha shop (v4).** Its clients already book online, so the
  behaviour change is small and we're debugging software, not habits. It also means the
  pilot depends on getting that shop's client list out of Fresha (§12). The walk-in
  thesis (§1) is tested **second**, on a known-good platform.
- **Ambition:** internal now, **maybe SaaS later.** Build internal-first but keep the
  tenancy boundary clean so a business/billing layer *could* sit on top later. Small
  cost now (namespace everything by tenant/shop from day one — already a non-negotiable),
  big option preserved. **Not** building signup/billing now.

## 11. Day-one definition of done

**One pilot shop, online booking + staff calendar, working with real clients** (then the
6-shop trial). That means, minimally:
- Public booking flow: pick barber → pick service → pick time → confirm with name+mobile.
- Staff calendar for that shop, mobile-first (barbers use **their own phones** —
  confirmed, decision 2; no shared front-desk device).
- **Staff booking of walk-ins** from a barber's phone — into now or into a later slot,
  through the same reservation path (§9).
- Rota editor, **manager-facing** (decision 4), so availability is real.
- Every **online** booking tied to a client record keyed on mobile; walk-ins may be
  anonymous (§3).
- Booking confirmation (email min; SMS if cost agreed). **No OTP** (v3 — open C closed:
  the confirmation message is the verification; a bad number just bounces).
- No double-booking of any promised slot (the exclusion-constraint guarantee, §9).

Explicitly **not** day one: any payment handling (§8), deposits, OTP verification,
"any available barber" allocation, cross-shop staff, per-barber pricing or durations.

## 12. Open decisions

**All discovery decisions are closed as of 2026-07-27.**

*v1 items 1–6:* walk-ins are booked by staff, not just marked live (§3, §9) · barber's
own phone is the staff surface, no shared device (§11) · online bookings keyed on mobile,
no guest path (§3) · rotas are manager-managed (§5) · Fresha not retained (§8, superseded
by v3) · stack recommended, see §13.

*v2 items A–D:* **A** walk-ins need no contact — optional, one-tap skip (§3) ·
**B** live overruns are allowed, next appointment flagged at-risk (§9) · **C** no OTP,
confirmation message is the verification (§11) · **D** card sales move to a third-party
terminal, so Fresha exits in full (§8).

*v4 (2026-07-27):* clients are **company-owned and bookable at any shop** (§3) · the
**pilot is a Fresha shop**, not a walk-in shop (§10).

**E** clients get **no login** — the mobile number is the account, Supabase Auth stays
staff-only (§3).

**Remaining opens — none block the build:**
- **Expected-revenue view** from completed appointments — wanted in the pilot, or not?
  (§8). Low priority, cheap either way.
- **Which card terminal provider** (§8). Only matters if a future phase reconciles actual
  takings against appointments.
- **Fresha client list + history import.** Now higher stakes: the pilot is a Fresha shop
  (§10), so its clients already exist in Fresha. Needs scoping before cutover.

## 12a. What to measure during the pilot

These are the assumptions that could be wrong, and the pilot is the only thing that will
tell us:
1. **Walk-in contact capture rate** — the win-back upside depends on it (§6).
2. **Online booking adoption in walk-in shops** — the whole thesis of §1, and untested;
   these shops' clients have never booked ahead.
3. **Overrun frequency** — how often live walk-ins run into booked appointments (§9).
   If it's constant, the fixed-duration/no-buffer model (§4) needs revisiting.
4. **Barber phone usability** — no shared device means the barber's phone is the only
   staff surface (§11); if that fails, day one fails.

## 13. Stack — recommendation (decision 6)

Formally still open per CLAUDE.md until Dan approves and it is recorded there.
**Recommended:**

- **Next.js (App Router) + TypeScript strict + Tailwind, pnpm** — Dan's standing default
  for new web apps; one codebase serves the public booking flow and the staff surfaces.
- **Supabase (Postgres + Auth)** — the reservation guarantee in §9 is a Postgres feature.
  This is the single strongest technical reason: the correctness core is a database
  constraint, so we want real Postgres, not an abstraction over it. RLS enforces the
  multi-shop tenancy boundary **at the database**, which is what makes the day-one
  non-negotiable real rather than aspirational.
- **Vercel** for hosting.
- **PWA, not a native app** — barbers use their own phones; no app store, no install
  friction, no release cycle.
- **Adapters** for SMS and email from the start (non-negotiable #3), with the SMS
  provider chosen later on UK per-message cost.

**Caveats stated up front, not buried:**
- **Auth is staff-only.** Clients have no login (§3). Supabase Auth covers barbers,
  managers, head office. That is a much smaller auth surface than it first looks.
- **RLS is easy to get subtly wrong** and a mistake leaks one shop's clients to another.
  It needs its own tests, including deny-path tests, before any second shop is added.
- **Booking writes must go through a database transaction/function**, not a
  client-issued insert — the constraint protects integrity, but the reservation flow
  still needs to be server-owned.
- **PWA push notifications on iOS are more limited than native.** If barbers need
  reliable push for new bookings, verify this early — it is the most likely reason this
  recommendation would need revisiting.

Nothing here is settled until Dan signs off and CLAUDE.md is updated to match.
