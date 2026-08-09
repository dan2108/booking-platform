-- ============================================================================
-- 0004_reservation_engine
--
-- The server-owned reservation path (PLAN.md §2, CLAUDE.md non-negotiable #2).
--
-- There is NO insert policy on `appointments` for any role. The only way an
-- appointment can come into existence is through reserve(), which runs as
-- SECURITY DEFINER inside a single transaction. A client-issued insert is not
-- merely discouraged — it is impossible.
--
-- Both entry surfaces (public web, staff phone) call this same function, so a
-- walk-in booked for 11:40 and an online booking for 11:40 compete for the
-- same barber-time atomically. One reservation path, two surfaces.
-- ============================================================================

-- --------------------------------------------------------------------------
-- UK mobile normalisation. The mobile number IS the account (REQUIREMENTS.md
-- §3), so "07700 900123", "+447700900123" and "07700900123" must resolve to
-- one client record, not three.
-- --------------------------------------------------------------------------
create or replace function normalise_mobile(p_raw text)
returns text language plpgsql immutable as $$
declare
  digits text;
begin
  if p_raw is null or btrim(p_raw) = '' then
    return null;
  end if;

  digits := regexp_replace(p_raw, '[^0-9+]', '', 'g');

  if digits like '+44%' then
    return digits;
  elsif digits like '0044%' then
    return '+44' || substring(digits from 5);
  elsif digits like '44%' and length(digits) = 12 then
    return '+' || digits;
  elsif digits like '0%' then
    return '+44' || substring(digits from 2);
  end if;

  return digits;
end;
$$;

-- --------------------------------------------------------------------------
-- Rota expansion, database side. Pattern + exception, resolved against the
-- SHOP's timezone rather than the server's. A rota says "Tuesdays 10:00–18:00"
-- in wall-clock local time; whether that is 09:00Z or 10:00Z depends on the
-- date, and getting that wrong books people an hour out twice a year.
-- --------------------------------------------------------------------------
create or replace function staff_is_working(
  p_staff_id  uuid,
  p_starts_at timestamptz,
  p_ends_at   timestamptz
) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  tz           text;
  local_start  timestamp;
  local_end    timestamp;
  local_date   date;
  win_start    time;
  win_end      time;
  exc          record;
begin
  select sh.timezone into tz
    from staff s join shops sh on sh.id = s.shop_id
   where s.id = p_staff_id;

  if tz is null then
    return false;
  end if;

  local_start := p_starts_at at time zone tz;
  local_end   := p_ends_at   at time zone tz;
  local_date  := local_start::date;

  -- an appointment may not straddle local midnight
  if local_end::date <> local_date and local_end::time <> time '00:00' then
    return false;
  end if;

  -- an exception for this date overrides the weekly pattern entirely
  select * into exc from rota_exceptions
   where staff_id = p_staff_id and date = local_date;

  if found then
    if exc.start_time is null then
      return false;                    -- explicit day off / holiday
    end if;
    win_start := exc.start_time;
    win_end   := exc.end_time;
  else
    select rp.start_time, rp.end_time into win_start, win_end
      from rota_patterns rp
     where rp.staff_id = p_staff_id
       and rp.weekday  = extract(isodow from local_date)::int;

    if not found then
      return false;                    -- not rostered that weekday
    end if;
  end if;

  return local_start::time >= win_start and local_end::time <= win_end;
end;
$$;

-- --------------------------------------------------------------------------
-- reserve() — the one correctness-critical operation.
--
-- Returns a structured result rather than throwing on the expected-failure
-- paths, so the caller can surface "that slot just went" as the correct
-- outcome it is. Unexpected failures still raise: fail closed, never silent.
-- --------------------------------------------------------------------------
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
      return jsonb_build_object('ok', false, 'code', 'slot_taken',
        'message', 'Sorry — that slot has just been taken.');
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

-- The browser must never be able to call this directly. Public bookings go
-- through a Next.js server action holding the service-role key; staff calls
-- carry an authenticated session.
revoke all on function reserve(uuid, uuid, uuid, timestamptz, appointment_source,
  text, text, text, uuid, uuid, boolean, int, text) from public, anon;
grant execute on function reserve(uuid, uuid, uuid, timestamptz, appointment_source,
  text, text, text, uuid, uuid, boolean, int, text) to authenticated, service_role;

grant execute on function staff_is_working(uuid, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function normalise_mobile(text) to authenticated, service_role;
