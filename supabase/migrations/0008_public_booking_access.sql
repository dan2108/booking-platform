-- ============================================================================
-- 0008_public_booking_access
--
-- A public booking site has to expose four things to a visitor with no account:
-- which shops exist, which barbers work there, what the services cost, and when
-- each barber is free. That is not a leak — it is the product. It is also
-- exactly what is printed in the shop window.
--
-- What stays invisible to an anonymous visitor: every client record, and every
-- detail of every appointment. Availability is served through a function that
-- returns start and end times ONLY — never who, never what service, never how
-- much. A visitor can see that 11:40 is taken. They cannot see whose it is.
-- ============================================================================

create policy shops_public_read on shops
  for select to anon using (true);

-- Barbers are on the shop window and on the booking page. Managers and head
-- office are not: an anonymous visitor has no business enumerating them.
create policy staff_public_read on staff
  for select to anon using (role = 'barber' and is_active);

create policy services_public_read on services
  for select to anon using (is_active);

-- Working hours, holidays and one-off changes for bookable barbers. This is
-- opening hours; it is meant to be public.
create policy rota_patterns_public_read on rota_patterns
  for select to anon using (
    exists (select 1 from staff s
             where s.id = rota_patterns.staff_id and s.role = 'barber' and s.is_active)
  );

create policy rota_exceptions_public_read on rota_exceptions
  for select to anon using (
    exists (select 1 from staff s
             where s.id = rota_exceptions.staff_id and s.role = 'barber' and s.is_active)
  );

-- NOTE the absence of any anon policy on `appointments` and `clients`. Those
-- stay unreadable. Availability comes through this function instead, which is
-- the minimum disclosure the product actually requires.
create or replace function public_busy(
  p_barber_id uuid,
  p_from      timestamptz,
  p_to        timestamptz
) returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.starts_at, a.ends_at
    from appointments a
   where a.barber_id = p_barber_id
     and a.status in ('booked', 'in_progress')
     and a.starts_at >= p_from
     and a.starts_at <  p_to
   order by a.starts_at
$$;

comment on function public_busy(uuid, timestamptz, timestamptz) is
  'Times only. No client, no service, no price, no status detail. This is the entire surface an anonymous visitor needs in order to be shown free slots, and deliberately nothing more.';

grant execute on function public_busy(uuid, timestamptz, timestamptz)
  to anon, authenticated, service_role;
