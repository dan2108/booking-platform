# booking-platform

Appointment booking for **Sharp & Sons**, a multi-shop barbering business
(20+ shops, ~6-shop trial cohort, a handful currently on Fresha).

**Status: working vertical slice, demo-ready.** Public booking, staff surface,
manager rota editor and head-office reporting run against a live Postgres. The
reservation guarantee is built, tested and demonstrable.

```bash
pnpm install
cp .env.example .env.local     # fill in the Supabase values
pnpm dev
```

## What is here

| | |
|---|---|
| `docs/REQUIREMENTS.md` | What the business needs. Discovery, all decisions closed. |
| `docs/PLAN.md` | Build order, layer by layer, with checkable definitions of done. |
| `docs/ARCHITECTURE.md` | What was built and why it is shaped this way. |
| `docs/DEMO.md` | Run sheet for demoing it. |
| `supabase/migrations/` | The schema, the guarantee, the RLS policies, the seed. |
| `src/lib/availability.ts` | Rota expansion and slot generation. Pure functions. |
| `tests/` | 48 tests, including a real 12-connection concurrent race. |

## The one thing worth reading

`supabase/migrations/0002_no_double_booking.sql`. Two clients can never be
promised the same barber at the same time — not because the application checks,
but because the database cannot hold the second row.

## Commands

```bash
pnpm dev          # development server
pnpm build        # production build
pnpm test         # all 48 tests
pnpm test:unit    # pure functions only, no database needed
pnpm db:up        # local Postgres from migrations + seed (no cloud account)
pnpm test:db      # integration tests, real concurrency
pnpm typecheck    # tsc --noEmit
pnpm lint
```

## Resetting the demo

Everything is generated relative to `now()`, so a stale seed shows a half-empty
today. In the Supabase SQL editor:

```sql
select seed_demo_data();
```

Rebuilds three shops, 15 staff, 34 clients, 50 rota rows and ~1,400
appointments across five weeks of history and a week ahead. Takes a few seconds.
