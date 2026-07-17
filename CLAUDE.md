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

**PLANNING STAGE — do not build anything yet.** No code, no scaffolding, no stubs.
The deliverable right now is an approved plan: requirements, scope, architecture,
and build order. Building starts only when Dan signs off on the plan.

## Non-negotiables (so far — the plan will extend these)

1. **Multi-shop from day one.** Every entity (staff, services, bookings, clients)
   namespaced by shop/tenant ID. No single-shop assumptions to unpick later.
2. **Bookings are money.** Double-bookings, lost appointments, and silent failures are
   unacceptable. Side-effecting paths fail closed; errors raise → log → surface.
3. **External services behind adapter layers** (payments, SMS/email reminders, calendar
   sync). Core booking logic never calls a vendor directly.
4. Secrets in `.env` (gitignored) with a documented `.env.example`.

## Conventions

Global baseline (`~/.claude/CLAUDE.md`) applies. Stack choices are **open decisions for
the plan** — do not assume them settled until recorded here.

## Build order

To be defined by the plan. Nothing is in flight.
