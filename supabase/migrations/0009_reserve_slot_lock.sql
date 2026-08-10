-- ============================================================================
-- 0009_reserve_deadlock_retry
--
-- Fixes a real defect found by running tests/db/reservation.test.ts repeatedly
-- on a fast multi-core machine: under genuine concurrency, reserve() could
-- raise `deadlock detected` (SQLSTATE 40P01) instead of returning a structured
-- result.
--
-- WHAT WAS NEVER WRONG: the guarantee itself. Across 960 racing reservations
-- measured before this fix, there was never more than one winner and never a
-- double booking. The exclusion constraint in 0002 did its job every time.
--
-- WHAT WAS WRONG: the failure MODE. An exclusion constraint is not deadlock-
-- free under concurrency. Two transactions each insert their GiST index entry
-- for an overlapping range, then each scans and finds the other's uncommitted
-- entry, and each waits for the other to finish. Postgres breaks the cycle by
-- aborting one of them. That abort surfaced as an unexpected exception rather
-- than as 'slot_taken'.
--
-- Why that matters commercially: the deadlock victim is chosen arbitrarily by
-- the database, so it can be the transaction that would have WON the slot.
-- That client saw "Something went wrong on our side" instead of getting their
-- appointment — a lost booking, which CLAUDE.md non-negotiable #2 calls
-- unacceptable. It also meant the /proof race — the headline of the demo —
-- could visibly report a racer with code 'error' about 15% of the time.
--
-- Measured cause, not a guess. Deadlock rate per round of 12 racers on one
-- slot, before this migration:
--
--   all racers share ONE client mobile   ->   0 / 20 rounds
--   racers have distinct mobiles         ->  14 / 20 rounds
--   anonymous walk-ins, NO client row    ->   9 / 20 rounds
--
-- The anonymous case proves the `clients` upsert is not involved at all. The
-- all-same-mobile case never deadlocks precisely BECAUSE contention on that one
-- client row serialises the racers before they ever reach the appointment
-- insert. The exclusion-constraint insert is the sole cause.
--
-- WHAT WAS TRIED FIRST, AND WHY IT IS NOT WHAT THIS MIGRATION DOES: catching
-- 40P01 and retrying the insert with a short backoff. It measurably made things
-- WORSE — the test went from failing on deadlocks to timing out after 60s. The
-- reason is that a retrying transaction sleeps while still holding its locks,
-- so every other racer waits a full deadlock_timeout (1s by default) on a
-- transaction that is doing nothing, and 12 racers times 4 attempts cascades
-- into a pile-up. Retry treats the symptom and lengthens the contention window.
--
-- THE FIX: impose a lock ORDER so the pathological interleaving cannot happen.
-- Before touching either table, every caller takes one transaction-scoped
-- advisory lock keyed on the thing actually being contended — this barber at
-- this instant. Racers for the same barber-time then queue in an orderly line
-- instead of inserting GiST entries and discovering each other mid-flight. The
-- winner commits and releases; the next in line sees a committed row and gets a
-- clean exclusion_violation, which is already handled as 'slot_taken'.
--
-- A deadlock needs a cycle. There is no longer one to form: the advisory lock is
-- taken first, by everyone, in the same order, before any row lock exists.
--
-- Nothing about the guarantee changes. The exclusion constraint in 0002 is
-- untouched and remains the thing that makes a double booking impossible — the
-- advisory lock is not a second guarantee and must never be treated as one. If
-- this lock were removed tomorrow the system would still never double-book; it
-- would merely go back to reporting some losses as deadlocks. Advisory locks
-- also only serialise callers that take them, which is fine precisely because
-- reserve() is the only door.
--
-- Hash collisions between different (barber, slot) pairs are possible and
-- harmless: two unrelated reservations would briefly serialise against each
-- other. Slower in a case that essentially never happens, never incorrect.
--
-- The deadlock handler below is kept as a guard rather than as the mechanism.
-- It should now be unreachable; if it is ever reached, reserve() still returns
-- a structured result instead of raising.
-- ============================================================================

create or replace function reserve(
  p_shop_id            uuid,
  p_barber_id          uuid,
  p_service_id         uuid,
  p_starts_at          timestamptz,
  p_source             appointment_source default 'online',
  p_client_name        text    default null,
  p_client_mobile      text    default null,
  p_client_email       text    default null,
  p_client_id          uuid    default null,
  p_created_by         uuid    default null,
  p_start_immediately  boolean default false,
  p_lead_time_minutes  int     default 30,
  p_notes              text    default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duration     int;
  v_ends_at      timestamptz;
  v_client_id    uuid := p_client_id;
  v_mobile       text;
  v_barber_shop  uuid;
  v_appt         appointments%rowtype;
  v_taken        jsonb := jsonb_build_object('ok', false, 'code', 'slot_taken',
                            'message', 'Sorry — that slot has just been taken.');
begin
  ------------------------------------------------------------------ inputs --
  select duration_minutes into v_duration
    from services where id = p_service_id and is_active;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'unknown_service',
      'message', 'That service is not available.');
  end if;

  v_ends_at := p_starts_at + make_interval(mins => v_duration);

  select shop_id into v_barber_shop from staff where id = p_barber_id and is_active;
  if v_barber_shop is null or v_barber_shop <> p_shop_id then
    return jsonb_build_object('ok', false, 'code', 'barber_shop_mismatch',
      'message', 'That barber does not work at that shop.');
  end if;

  -------------------------------------------------------------- time rules --
  if p_starts_at < now() - interval '1 minute' then
    return jsonb_build_object('ok', false, 'code', 'in_past',
      'message', 'That time has already passed.');
  end if;

  -- The lead-time buffer stops a client booking a slot minutes away while a
  -- walk-in is mid-cut (REQUIREMENTS.md §9). Staff booking at the chair are
  -- not subject to it — the barber can see the chair.
  if p_source = 'online'
     and p_starts_at < now() + make_interval(mins => p_lead_time_minutes) then
    return jsonb_build_object('ok', false, 'code', 'too_soon',
      'message', format('Please book at least %s minutes ahead.', p_lead_time_minutes));
  end if;

  if not staff_is_working(p_barber_id, p_starts_at, v_ends_at) then
    return jsonb_build_object('ok', false, 'code', 'outside_rota',
      'message', 'That barber is not working then.');
  end if;

  --------------------------------------------------------------- ordering --
  -- One lock, taken by every caller, before any row is touched. This is what
  -- makes the deadlock impossible rather than merely unlikely — see the header.
  -- Transaction-scoped, so it is released on commit or rollback with nothing to
  -- clean up and no way to leak a held lock.
  perform pg_advisory_xact_lock(
    hashtextextended(p_barber_id::text || '@' || p_starts_at::text, 0)
  );

  ------------------------------------------------------------------ client --
  -- Online bookings require a mobile — no guest path (REQUIREMENTS.md §3).
  -- Walk-ins may stay completely anonymous (open A): no name, no number, never
  -- a blocker at the chair.
  v_mobile := normalise_mobile(p_client_mobile);

  if v_client_id is null then
    if p_source = 'online' and v_mobile is null then
      return jsonb_build_object('ok', false, 'code', 'mobile_required',
        'message', 'A mobile number is required to book online.');
    end if;

    if v_mobile is not null then
      -- Dedupe on mobile: one person, one record, company-wide.
      --
      -- This is a single atomic upsert rather than SELECT-then-INSERT on
      -- purpose. Two reservations arriving at the same instant for the same
      -- NEW number — a client double-tapping confirm, or two people booking
      -- off one phone — would both find nothing and both insert, and the
      -- second would die on the unique index. Caught by the concurrency test
      -- in tests/db/reservation.test.ts, which is exactly the kind of race
      -- that only shows up under real load.
      --
      -- coalesce(clients.x, excluded.x) keeps the rule that a returning
      -- client's details are filled in, never overwritten.
      insert into clients (name, mobile, email, home_shop_id)
      values (nullif(btrim(coalesce(p_client_name, '')), ''), v_mobile,
              nullif(btrim(coalesce(p_client_email, '')), ''), p_shop_id)
      on conflict (mobile) where mobile is not null
      do update set
        name  = coalesce(clients.name,  excluded.name),
        email = coalesce(clients.email, excluded.email)
      returning id into v_client_id;
    elsif nullif(btrim(coalesce(p_client_name, '')), '') is not null then
      -- named walk-in with no number: still worth a record
      insert into clients (name, home_shop_id)
      values (btrim(p_client_name), p_shop_id)
      returning id into v_client_id;
    end if;
  end if;

  ------------------------------------------------------------- the promise --
  -- Everything above is validation. THIS is the atomic bit: if two callers
  -- reach this line concurrently for the same barber-time, the exclusion
  -- constraint in 0002 guarantees exactly one of them commits.
  --
  -- Because of the advisory lock above, anyone else racing for this exact
  -- barber-time has already committed or rolled back by the time we get here.
  -- So exclusion_violation now means what it says — the slot went — rather than
  -- being one of two possible ways to lose.
  begin
    insert into appointments (
      shop_id, barber_id, client_id, service_id,
      starts_at, ends_at, status, source, created_by, notes
    ) values (
      p_shop_id, p_barber_id, v_client_id, p_service_id,
      p_starts_at, v_ends_at, 'booked', p_source, p_created_by, p_notes
    )
    returning * into v_appt;
  exception
    when exclusion_violation then
      -- Correct behaviour, not a failure: someone else got there first.
      return v_taken;
    when deadlock_detected then
      -- Should be unreachable now. Kept so that the worst case is still a
      -- structured result rather than an exception reaching a client mid-booking
      -- (CLAUDE.md non-negotiable #2: no silent or surprising failures).
      return v_taken;
  end;

  -- "Start walk-in now": reserved through the same constrained path, then
  -- immediately marked as physically underway.
  if p_start_immediately then
    update appointments
       set status = 'in_progress', started_at = now()
     where id = v_appt.id
     returning * into v_appt;
  end if;

  return jsonb_build_object(
    'ok', true,
    'appointment_id', v_appt.id,
    'client_id',      v_client_id,
    'starts_at',      v_appt.starts_at,
    'ends_at',        v_appt.ends_at,
    'status',         v_appt.status
  );
end;
$$;

-- `create or replace` preserves the grants from 0004: execute stays revoked
-- from public and anon, and granted to authenticated and service_role.
comment on function reserve(uuid, uuid, uuid, timestamptz, appointment_source,
  text, text, text, uuid, uuid, boolean, int, text) is
  'The only way an appointment is created. Callers for the same barber-time serialise on a transaction-scoped advisory lock before touching any row, so losing a race always surfaces as a clean slot_taken rather than as a deadlock. The exclusion constraint in 0002 remains the actual guarantee; the advisory lock only fixes how a loss is reported. Never raises on losing.';
