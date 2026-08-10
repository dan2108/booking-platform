# Demo run sheet

Ten minutes, four moments, one thing they remember.

The single sentence to land: **we can leave Fresha without giving up
reliability, because the thing Fresha protects you from is now impossible
rather than merely unlikely.**

---

## Before you walk in

1. **Reset the data** so the calendar is live and today looks busy:

   Supabase → SQL Editor → `select seed_demo_data();`

   Takes about five seconds. Do this the morning of, not the night before —
   everything is generated relative to `now()`, so a stale seed shows a
   half-empty today.

2. **Open these tabs, in this order.** Leave them open; do not navigate from
   the home page during the demo, it wastes ten seconds each time.

   | Tab | URL |
   |---|---|
   | 1 | `/` — the hub |
   | 2 | `/book` — public booking |
   | 3 | `/book` — public booking **again** (this is the race) |
   | 4 | `/staff` — barber's phone |
   | 5 | `/manager` — shop floor + rota |
   | 6 | `/admin` — head office |
   | 7 | `/proof` — the guarantee |

3. **Have your phone out** with the booking URL already loaded. The strongest
   moment in the whole demo is handing your boss a phone.

4. Check `/proof` loads and the race runs **once, before the meeting**. If the
   database has been idle it takes a second to wake.

---

## The run

### 1 · Book something. On his phone. (2 min)

Hand him the phone at `/book`. Say nothing except *"book yourself in with
Tino."*

Let him do it himself. Shop → barber → service → day → time → name and number
→ done. Do not narrate. The point is that nobody has to explain it.

When he lands on the confirmation, one line:

> "No account, no password, no app. His mobile number is the account. Next
> time he books, we know him and his history comes with him — at any of the
> twenty shops, not just that one."

**If he asks "how did it know Tino was free at that time?"** — that is the
rota. Park it; you show it in step 3.

---

### 2 · The race (2 min) — *the moment*

Go to `/proof`. Don't read the page. Scroll to **Run the race** and press it.

While it runs (about a second):

> "Eight people trying to book the same barber at the same minute — four on
> the website, four walk-ins at the counter. All at once, on a real database."

Then point at the four numbers: **8 tried · 1 reserved · 7 told the slot had
gone · 1 row in the database.**

> "That's not the code being careful. The rule lives in the database. The
> second overlapping booking isn't rejected — it physically cannot be stored.
> Press it again, it's one every time."

Press it again. It looks better the second time because he's watching for it.

Then the commercial line, which is the actual point:

> "A double-booking isn't a bug report. It's two blokes in the shop for one
> chair and one of them leaves. That's the failure that would end a pilot
> fastest, so it's the first thing we made impossible — before there was a
> single screen."

**Optional, if he's technical or brought someone who is:** scroll up and show
the five lines of SQL. It's short enough to read out.

---

### 3 · The barber's day (3 min) — *the one he'll have opinions about*

`/staff` → pick **Jay Okonkwo** (Camden). Hold the phone, don't project it. This
screen was designed for a hand, not a boardroom.

> "This is a barber's own phone. His column, his clients, nothing else. No
> shared tablet at the counter to buy, break, or argue over."

Four things, in this order. Each one answers an objection before he raises it.

**a) The morning has collapsed.** Point at the three thin grey lines at the top.

> "Done cuts shrink to one line. Mid-shift he doesn't want to scroll past the
> morning to find out who's next — he wants now, and next."

**b) Now and next, without reading anything.** The two boxes: who's in the chair,
who's after. Then the amber bar.

> "He's running late. The system worked that out from when he actually started,
> not when the appointment was booked. It flags the next client — and it does
> not move anyone. Software that silently reshuffles a barber's day gets turned
> off in a week."

**c) The buttons are only where they should be.** Scroll to the afternoon.

> "No Start button on the four o'clock. He can see it, he can cancel it, but he
> can't put someone in the chair who isn't in the building. Only what's actually
> due is actionable."

**d) The walk-in.** Tap **+ Walk-in**.

- **In the chair now** — one tap, booked and started.
- **Come back later** — real slots from his real rota. Change the service and
  the times change with it: a 45-minute skin fade has fewer openings than a
  15-minute buzz cut, and we never offer a slot we'd then refuse.
- **Contact — optional.** Land on this one:

> "We deliberately don't force the number. Making a barber type a phone number
> with a client in the chair is how you get a system barbers hate. But that
> number is the whole difference between a client we can win back and one we
> can't — and most of our shops are walk-in shops, so that's exactly where the
> untapped list is. It's a prompt, never a gate. Whether they actually use it is
> one of the four things the pilot has to tell us."

Then close the sheet and say the line that ties it to the proof:

> "That walk-in goes through the exact same reservation path as the website. If
> someone's mid-checkout for that slot on their phone right now, one of them
> gets it. Not both."

### 3b · The rota behind it (1 min)

`/manager` → **Rota editor** → open a barber → change a finish time → Save.

> "This is what decides what clients can book. Not shop opening hours — each
> barber's own hours, which are all different, plus holidays. Managers own it;
> barbers can see theirs and nothing else."

Go back to that barber's booking page and show the times have moved. That
connection — *manager changes the rota, client sees different slots* — is what
makes it read as a system rather than a set of screens.

### 4 · The numbers that decide the pilot (2 min)

`/admin`.

Point at **online share**: high at Camden (came off Fresha, clients already
book ahead), low at the walk-in shops.

> "That gap is the whole bet. Camden's clients already book online, so the
> pilot there is us debugging software. The other eighteen shops have never had
> a booking system — that's the behaviour change, and no amount of engineering
> settles it. Only running it does."

Then the four boxes at the bottom — the assumptions that could be wrong.

> "I'd rather show you the four things that could sink this than pretend there
> aren't any."

Close on the money:

> "Three reasons to leave: own the client list, stop the per-seat fee, stop the
> marketplace cut on new clients. This does all three. What it doesn't do is
> beat Fresha on features — so we don't switch a shop until we've got rough
> parity. Camden first, then the six, then the rest."

---

## Questions you'll get

**"How much does this cost to run?"**
Nothing at this size — Supabase and Vercel free tiers cover the pilot
comfortably. Realistically £20–50/month once all twenty shops are live, plus
SMS at roughly 2–4p a message if we turn it on. Against per-seat subscription
across 25+ staff plus new-client marketplace fees. Get the actual Fresha
invoice before quoting a saving — don't guess it in the room.

**"What happens if it goes down?"**
Honest answer: same as Fresha going down, except we can fix it. Nothing here
is exotic — it's Postgres and a web app. Worth adding: the shops that are
walk-in today lose nothing, because they have no booking system to lose.

**"Who supports it when you're not around?"**
The real question behind that is *bus factor*, and it's fair. It's a standard
stack any web developer can pick up, everything is in Git, and the schema is
documented. But one person building it is a genuine risk and shouldn't be
brushed off.

**"Why not just pay Fresha?"**
Because the client list is the asset and it isn't ours. Everything else —
subscription, marketplace fees — is money. That one's strategy.

**"Can it take payments?"**
Deliberately not. Card sales move to a standalone terminal, which means we're
never in the money path: no PCI scope, no stored cards, no refund logic. The
trade-off is that we see *expected* value from completed appointments, not
actual takings — and it's labelled that way everywhere, because presenting it
as revenue would be overselling a soft number.

**"How long until it's live?"**
Don't answer with a date. Say what's built, what isn't, and what the next
decision is. The plan sequences pilot → six-shop trial → company-wide with no
hard deadline, and that's the right shape — cutting over before parity is how
this fails.

---

## What to say if he asks "is this finished?"

No, and say so plainly.

**Built and proved:** the reservation guarantee, multi-shop tenancy enforced in
the database, availability from real variable rotas, the public booking flow,
the barber's phone, the manager rota editor, head-office reporting. 48 tests
including a real concurrent race.

**Not built:** SMS and email notifications (adapter layer designed, not
wired), the Fresha client-list import, staff login (the demo has a role
switcher where production has a password), and payments — which are out of
scope on purpose, not missing.

**The one thing to flag yourself before he finds it:** getting the existing
client list out of Fresha needs scoping, and the pilot shop *is* a Fresha shop.
Reason number one for the whole project is owning that data — so if Fresha
won't export it, that changes the plan. Better it comes from you than from him.
