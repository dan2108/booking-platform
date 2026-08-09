-- ============================================================================
-- 0001_core_schema
-- Data model per docs/PLAN.md §3.
--
-- Tenancy boundary is deliberately split (REQUIREMENTS.md §3, v4):
--   shop-scoped    : staff, rota_patterns, rota_exceptions, appointments
--   company-scoped : clients, services
-- ============================================================================

create extension if not exists btree_gist;
create extension if not exists pgcrypto;

create type staff_role         as enum ('barber', 'manager', 'head_office');
create type appointment_status as enum ('booked', 'in_progress', 'completed', 'no_show', 'cancelled');
create type appointment_source as enum ('online', 'staff');

-- ---------------------------------------------------------------- shops ----
create table shops (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  address    text,
  timezone   text not null default 'Europe/London',
  phone      text,
  is_pilot   boolean not null default false,
  created_at timestamptz not null default now()
);

comment on column shops.timezone is
  'IANA zone. Rota times are wall-clock local; slot generation resolves them against this.';

-- ---------------------------------------------------------------- staff ----
-- A barber is fixed to one shop (REQUIREMENTS.md §4) — no cross-shop
-- availability, which removes the worst of the scheduling complexity.
create table staff (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid references shops(id) on delete cascade,
  name          text not null,
  role          staff_role not null default 'barber',
  auth_user_id  uuid unique,
  initials      text,
  bio           text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),

  -- head office sits above shops; everyone else belongs to exactly one
  constraint staff_shop_matches_role check (
    (role = 'head_office' and shop_id is null) or
    (role <> 'head_office' and shop_id is not null)
  )
);

create index staff_shop_idx on staff (shop_id) where is_active;

-- ------------------------------------------------------------- services ----
-- Central catalogue, flat pricing, no per-shop or per-barber variation
-- (REQUIREMENTS.md §4). Deliberately has no shop_id.
create table services (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  description      text,
  duration_minutes int not null check (duration_minutes > 0 and duration_minutes % 5 = 0),
  price_pence      int not null check (price_pence >= 0),
  sort_order       int not null default 0,
  is_active        boolean not null default true
);

-- -------------------------------------------------------------- clients ----
-- COMPANY-scoped, not shop-scoped (REQUIREMENTS.md §3, v4). One person, one
-- record, bookable at any of the 20+ shops, history follows them. This is the
-- asset the business is leaving Fresha to own, so it does not get fragmented.
--
-- mobile is nullable because walk-ins may stay anonymous (REQUIREMENTS.md §3,
-- open A). Online bookings enforce a mobile at the application layer, not with
-- a NOT NULL, because one table serves both channels.
create table clients (
  id             uuid primary key default gen_random_uuid(),
  name           text,
  mobile         text,
  email          text,
  no_show_count  int not null default 0,
  home_shop_id   uuid references shops(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- the mobile number IS the account (REQUIREMENTS.md §3, open E) — so it must
-- be unique where present, and absent where the client is an anonymous walk-in
create unique index clients_mobile_key on clients (mobile) where mobile is not null;

-- --------------------------------------------------------------- rotas -----
-- Pattern + exception rather than 52 weeks of materialised rows (PLAN.md §3).
-- weekday follows ISO-8601: 1 = Monday ... 7 = Sunday.
create table rota_patterns (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references staff(id) on delete cascade,
  weekday    int  not null check (weekday between 1 and 7),
  start_time time not null,
  end_time   time not null,
  constraint rota_pattern_ordered check (end_time > start_time),
  unique (staff_id, weekday)
);

-- A row with null times is an explicit day OFF that overrides the pattern
-- (holiday). A row with times overrides the pattern hours for that date.
create table rota_exceptions (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references staff(id) on delete cascade,
  date       date not null,
  start_time time,
  end_time   time,
  reason     text,
  unique (staff_id, date),
  constraint rota_exception_ordered check (
    (start_time is null and end_time is null) or
    (start_time is not null and end_time is not null and end_time > start_time)
  )
);

-- ---------------------------------------------------------- appointments ----
-- ONE entity whatever created it (REQUIREMENTS.md §9). A walk-in is just an
-- appointment with source = 'staff'. One atomic reservation path, two entry
-- surfaces. `source` is for reporting and behaviour insight — never a
-- different code path.
create table appointments (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references shops(id) on delete cascade,
  barber_id   uuid not null references staff(id) on delete cascade,
  client_id   uuid references clients(id) on delete set null,
  service_id  uuid not null references services(id),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  status      appointment_status not null default 'booked',
  source      appointment_source not null default 'online',
  at_risk     boolean not null default false,
  started_at  timestamptz,
  notes       text,
  created_by  uuid references staff(id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint appointment_ordered check (ends_at > starts_at)
);

create index appointments_barber_day_idx on appointments (barber_id, starts_at);
create index appointments_shop_day_idx   on appointments (shop_id, starts_at);
create index appointments_client_idx     on appointments (client_id, starts_at desc);

-- an appointment must live at the shop its barber works at
create or replace function assert_barber_belongs_to_shop()
returns trigger
language plpgsql
as $$
declare
  barber_shop uuid;
begin
  select shop_id into barber_shop from staff where id = new.barber_id;
  if barber_shop is null or barber_shop <> new.shop_id then
    raise exception 'barber % does not work at shop %', new.barber_id, new.shop_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger appointments_barber_shop_check
  before insert or update of barber_id, shop_id on appointments
  for each row execute function assert_barber_belongs_to_shop();
