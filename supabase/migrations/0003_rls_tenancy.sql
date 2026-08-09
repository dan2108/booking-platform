-- ============================================================================
-- 0003_rls_tenancy
--
-- CLAUDE.md non-negotiable #1: multi-shop from day one. Tenancy is enforced in
-- the DATABASE, not the application, so that an application bug cannot leak
-- shop A's calendar to shop B.
--
-- The boundary is deliberately SPLIT (REQUIREMENTS.md §3 v4, PLAN.md §3):
--
--   appointments, staff, rota_*  ->  SHOP-scoped. Isolated by shop_id.
--   clients                      ->  COMPANY-scoped. Any staff member can
--                                    resolve any client, by design, because
--                                    one person = one record across 20+ shops
--                                    and that is the asset the business is
--                                    leaving Fresha to own.
--
-- So "a barber cannot see another shop's clients" is NOT true here, on purpose.
-- What IS still protected is cross-shop appointment HISTORY: a barber can look
-- a client up by mobile, but cannot read what that client had done at a shop
-- they are not entitled to. Cheap to build now, awkward to retrofit later.
-- ============================================================================

-- Helper functions are SECURITY DEFINER so that they bypass RLS themselves.
-- Without this, a policy on `staff` that queries `staff` recurses infinitely.

create or replace function auth_staff_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from staff where auth_user_id = auth.uid() and is_active
$$;

create or replace function auth_staff_role()
returns staff_role language sql stable security definer set search_path = public as $$
  select role from staff where auth_user_id = auth.uid() and is_active
$$;

create or replace function auth_staff_shop_id()
returns uuid language sql stable security definer set search_path = public as $$
  select shop_id from staff where auth_user_id = auth.uid() and is_active
$$;

create or replace function is_head_office()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role from staff where auth_user_id = auth.uid() and is_active) = 'head_office', false)
$$;

-- ---------------------------------------------------------------------------

alter table shops           enable row level security;
alter table staff           enable row level security;
alter table services        enable row level security;
alter table clients         enable row level security;
alter table rota_patterns   enable row level security;
alter table rota_exceptions enable row level security;
alter table appointments    enable row level security;

-- ---------------------------------------------------------------- shops ----
-- Every staff member can see the list of shops (needed for cross-shop booking
-- and for head office). Only head office may change them.
create policy shops_read on shops
  for select to authenticated using (true);

create policy shops_write on shops
  for all to authenticated using (is_head_office()) with check (is_head_office());

-- ---------------------------------------------------------------- staff ----
-- SHOP-SCOPED. A manager at shop A cannot enumerate shop B's barbers.
create policy staff_read_own_shop on staff
  for select to authenticated
  using (is_head_office() or shop_id = auth_staff_shop_id());

create policy staff_write_manager on staff
  for all to authenticated
  using (is_head_office() or (auth_staff_role() = 'manager' and shop_id = auth_staff_shop_id()))
  with check (is_head_office() or (auth_staff_role() = 'manager' and shop_id = auth_staff_shop_id()));

-- ------------------------------------------------------------- services ----
-- Central catalogue, flat pricing. Readable by all staff, editable by head office.
create policy services_read on services
  for select to authenticated using (true);

create policy services_write on services
  for all to authenticated using (is_head_office()) with check (is_head_office());

-- -------------------------------------------------------------- clients ----
-- COMPANY-SCOPED ON PURPOSE. This is the deliberate hole in shop isolation:
-- a barber at Camden can resolve a client who only ever visits Shoreditch,
-- which is exactly what makes cross-shop booking and a single company-wide
-- win-back list work. Their cross-shop HISTORY is still protected — see the
-- appointments policies below.
create policy clients_read_company_wide on clients
  for select to authenticated using (auth_staff_id() is not null);

create policy clients_write on clients
  for all to authenticated
  using (auth_staff_id() is not null)
  with check (auth_staff_id() is not null);

-- ---------------------------------------------------------------- rotas ----
-- Barbers are READ-ONLY on their own rota (REQUIREMENTS.md §5). Rota editing
-- is manager-owned, not self-serve (v2 decision 4).
create policy rota_patterns_read on rota_patterns
  for select to authenticated
  using (
    is_head_office()
    or exists (
      select 1 from staff s
       where s.id = rota_patterns.staff_id
         and s.shop_id = auth_staff_shop_id()
    )
  );

create policy rota_patterns_write_manager on rota_patterns
  for all to authenticated
  using (
    is_head_office()
    or (auth_staff_role() = 'manager' and exists (
          select 1 from staff s where s.id = rota_patterns.staff_id and s.shop_id = auth_staff_shop_id()))
  )
  with check (
    is_head_office()
    or (auth_staff_role() = 'manager' and exists (
          select 1 from staff s where s.id = rota_patterns.staff_id and s.shop_id = auth_staff_shop_id()))
  );

create policy rota_exceptions_read on rota_exceptions
  for select to authenticated
  using (
    is_head_office()
    or exists (
      select 1 from staff s
       where s.id = rota_exceptions.staff_id
         and s.shop_id = auth_staff_shop_id()
    )
  );

create policy rota_exceptions_write_manager on rota_exceptions
  for all to authenticated
  using (
    is_head_office()
    or (auth_staff_role() = 'manager' and exists (
          select 1 from staff s where s.id = rota_exceptions.staff_id and s.shop_id = auth_staff_shop_id()))
  )
  with check (
    is_head_office()
    or (auth_staff_role() = 'manager' and exists (
          select 1 from staff s where s.id = rota_exceptions.staff_id and s.shop_id = auth_staff_shop_id()))
  );

-- --------------------------------------------------------- appointments ----
-- SHOP-SCOPED, and within a shop a barber sees only their own column
-- (REQUIREMENTS.md §5). This policy is what stops a barber reading a client's
-- appointment history at shops they are not entitled to, even though they can
-- resolve that client's identity company-wide.
create policy appointments_read on appointments
  for select to authenticated
  using (
    is_head_office()
    or (auth_staff_role() = 'manager' and shop_id = auth_staff_shop_id())
    or (auth_staff_role() = 'barber'  and barber_id = auth_staff_id())
  );

-- Staff may UPDATE their own day (mark in progress / complete / no-show) but
-- INSERT is deliberately absent from every role: the ONLY way an appointment
-- comes into existence is through reserve(), which is server-owned.
-- See CLAUDE.md non-negotiable #2 and PLAN.md §2.
create policy appointments_update on appointments
  for update to authenticated
  using (
    is_head_office()
    or (auth_staff_role() = 'manager' and shop_id = auth_staff_shop_id())
    or (auth_staff_role() = 'barber'  and barber_id = auth_staff_id())
  )
  with check (
    is_head_office()
    or (auth_staff_role() = 'manager' and shop_id = auth_staff_shop_id())
    or (auth_staff_role() = 'barber'  and barber_id = auth_staff_id())
  );
