-- ============================================================================
-- 0002_no_double_booking  —  THE CORRECTNESS CORE
--
-- CLAUDE.md non-negotiable #2: "Bookings are money. Double-bookings, lost
-- appointments, and silent failures are unacceptable."
--
-- This is the one thing in the system that must be provably right, and it is
-- deliberately enforced in Postgres rather than in application code. Two
-- overlapping PROMISES for one barber are made physically impossible to
-- insert — regardless of races, retries, connection pools, or application
-- bugs. No amount of concurrent traffic can produce a double booking, because
-- the database will not hold the row.
--
-- Everything else in this system is CRUD around this constraint. Availability
-- is a read-side convenience that can never contradict it: if two clients race
-- for the same slot, one is told "that slot just went", which is correct
-- behaviour rather than a failure.
-- ============================================================================

alter table appointments
  add constraint no_double_booking
  exclude using gist (
    barber_id                            with =,
    tstzrange(starts_at, ends_at, '[)')  with &&
  )
  where (status = 'booked');

comment on constraint no_double_booking on appointments is
  'Scoped to status = booked only. A booked row is a PROMISE to a client and is '
  'constrained absolutely. An in_progress row is a RECORD OF WHAT IS PHYSICALLY '
  'HAPPENING and is deliberately unconstrained, so a barber can start a walk-in '
  'that overruns into their next appointment — the system records reality rather '
  'than blocking the chair. Cancelled and completed rows free the slot '
  'automatically, so there is no cleanup job. See REQUIREMENTS.md §9.';

-- --------------------------------------------------------------------------
-- Live overruns: fail-VISIBLE rather than fail-closed.
--
-- When a barber starts an appointment (status -> in_progress) that will run
-- past the start of their next promised appointment, we do not block them and
-- we never silently move anyone. We flag the next appointment at_risk and
-- surface it on the barber's phone.
-- --------------------------------------------------------------------------
create or replace function flag_downstream_at_risk()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  projected_end timestamptz;
begin
  -- how long this appointment is actually going to take, measured from when
  -- the barber really started rather than from when it was promised
  select coalesce(new.started_at, now()) + make_interval(mins => s.duration_minutes)
    into projected_end
    from services s
   where s.id = new.service_id;

  -- clear stale flags first: the barber may have caught up
  update appointments a
     set at_risk = false
   where a.barber_id = new.barber_id
     and a.status    = 'booked'
     and a.starts_at >= new.starts_at
     and a.at_risk;

  update appointments a
     set at_risk = true
   where a.barber_id = new.barber_id
     and a.status    = 'booked'
     and a.starts_at >= new.starts_at
     and a.starts_at <  projected_end;

  return new;
end;
$$;

create trigger appointments_flag_at_risk
  after update of status, started_at on appointments
  for each row
  when (new.status = 'in_progress')
  execute function flag_downstream_at_risk();

-- --------------------------------------------------------------------------
-- No-show counter on the client record (REQUIREMENTS.md §7). Formalises what
-- staff already track informally. Cheap win, no payment rails needed.
-- --------------------------------------------------------------------------
create or replace function sync_no_show_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.client_id is null then
    return new;
  end if;

  if new.status = 'no_show' and old.status is distinct from 'no_show' then
    update clients set no_show_count = no_show_count + 1 where id = new.client_id;
  elsif old.status = 'no_show' and new.status is distinct from 'no_show' then
    update clients set no_show_count = greatest(0, no_show_count - 1) where id = new.client_id;
  end if;

  return new;
end;
$$;

create trigger appointments_sync_no_show
  after update of status on appointments
  for each row execute function sync_no_show_count();
