-- ============================================================================
-- 0005_demo_seed
--
-- Demo data as re-runnable FUNCTIONS rather than a one-shot script.
-- `select seed_demo_data();` wipes and rebuilds everything relative to now(),
-- so the demo resets between run-throughs and the calendar is never stale.
--
-- A plausible UK independent barbering chain: three shops, one of them the
-- Fresha pilot, flat central pricing, barbers on genuinely variable hours.
-- Client mobiles use Ofcom's reserved 07700 900xxx drama range.
--
-- Split into several functions because each stays comfortably readable and
-- because the appointment walk is the only interesting one.
-- ============================================================================

create or replace function seed_demo_shops_staff()
returns void language plpgsql security definer set search_path = public as $seed$
declare
  v_camden uuid; v_shoreditch uuid; v_islington uuid; v_tz text := 'Europe/London';
begin
  delete from appointments;
  delete from rota_exceptions;
  delete from rota_patterns;
  delete from clients;
  delete from staff;
  delete from services;
  delete from shops;

  insert into shops (name, slug, address, timezone, phone, is_pilot) values
    ('Sharp & Sons — Camden',     'camden',     '48 Parkway, Camden Town, London NW1 7AH',       v_tz, '020 7946 0812', true),
    ('Sharp & Sons — Shoreditch', 'shoreditch', '112 Curtain Road, Shoreditch, London EC2A 3AH', v_tz, '020 7946 0433', false),
    ('Sharp & Sons — Islington',  'islington',  '9 Upper Street, Islington, London N1 0PQ',      v_tz, '020 7946 0187', false);

  select id into v_camden     from shops where slug = 'camden';
  select id into v_shoreditch from shops where slug = 'shoreditch';
  select id into v_islington  from shops where slug = 'islington';

  insert into services (name, description, duration_minutes, price_pence, sort_order) values
    ('Skin Fade',       'Clipper fade to skin, scissor finish on top',    45, 2800, 1),
    ('Cut & Style',     'Classic cut, washed and styled',                 30, 2200, 2),
    ('Cut & Beard',     'Full cut with beard shape-up and line',          60, 3500, 3),
    ('Beard Trim',      'Shape, line-up and condition',                   20, 1400, 4),
    ('Hot Towel Shave', 'Traditional cut-throat shave, hot towel finish', 30, 2500, 5),
    ('Buzz Cut',        'Single guard all over, neckline tidied',         15, 1200, 6),
    ('Kids Cut',        'Under 12s',                                      25, 1600, 7);

  insert into staff (shop_id, name, role, initials, bio) values
    (v_camden, 'Marcus Bell',    'manager', 'MB', 'Manages Camden. Fifteen years on the floor.'),
    (v_camden, 'Tino Rossi',     'barber',  'TR', 'Skin fades and classic scissor work.'),
    (v_camden, 'Deniz Kaya',     'barber',  'DK', 'Beard specialist, hot towel shaves.'),
    (v_camden, 'Reece Aldridge', 'barber',  'RA', 'Textured crops and modern styling.'),
    (v_camden, 'Femi Adeyemi',   'barber',  'FA', 'Afro and textured hair, all grades.'),
    (v_camden, 'Jay Okonkwo',    'barber',  'JO', 'Fast, precise, kids welcome.'),
    (v_shoreditch, 'Sasha Nowak',  'manager', 'SN', 'Runs Shoreditch.'),
    (v_shoreditch, 'Kwame Mensah', 'barber',  'KM', 'Fades and line-ups.'),
    (v_shoreditch, 'Liam Doherty', 'barber',  'LD', 'Scissor cuts and beard work.'),
    (v_shoreditch, 'Arjun Patel',  'barber',  'AP', 'Classic barbering, hot towel shaves.'),
    (v_islington, 'Grace Kelleher', 'manager', 'GK', 'Runs Islington.'),
    (v_islington, 'Ollie Trent',    'barber',  'OT', 'Crops, quiffs, skin fades.'),
    (v_islington, 'Hassan Farid',   'barber',  'HF', 'Beards, shaves, sharp lines.');

  insert into staff (shop_id, name, role, initials, bio) values
    (null, 'Dan Holt',    'head_office', 'DH', 'Operations — all shops.'),
    (null, 'Priya Raman', 'head_office', 'PR', 'Ops manager — all shops.');

  -- Stable demo identities so the RLS deny-path proof can assume each persona.
  -- In production these come from Supabase Auth signups.
  update staff set auth_user_id = ('00000000-0000-4000-8000-' || lpad(r.n::text, 12, '0'))::uuid
    from (select id, row_number() over (order by name) as n from staff) r
   where staff.id = r.id;
end;
$seed$;

create or replace function seed_demo_rotas()
returns void language plpgsql security definer set search_path = public as $seed$
begin
  -- Genuinely variable weekly hours: no two barbers work the same week.
  -- weekday: 1 = Monday ... 7 = Sunday (ISO-8601)
  insert into rota_patterns (staff_id, weekday, start_time, end_time)
  select s.id, r.weekday, r.start_time, r.end_time
    from staff s
    join (values
      ('Tino Rossi',     2, time '09:00', time '18:00'),
      ('Tino Rossi',     3, time '09:00', time '18:00'),
      ('Tino Rossi',     4, time '11:00', time '20:00'),
      ('Tino Rossi',     5, time '09:00', time '18:00'),
      ('Tino Rossi',     6, time '08:30', time '17:00'),
      ('Deniz Kaya',     1, time '10:00', time '19:00'),
      ('Deniz Kaya',     2, time '10:00', time '19:00'),
      ('Deniz Kaya',     4, time '10:00', time '19:00'),
      ('Deniz Kaya',     5, time '12:00', time '20:00'),
      ('Deniz Kaya',     6, time '09:00', time '18:00'),
      ('Deniz Kaya',     7, time '10:00', time '16:00'),
      ('Reece Aldridge', 1, time '09:30', time '17:30'),
      ('Reece Aldridge', 3, time '09:30', time '17:30'),
      ('Reece Aldridge', 4, time '09:30', time '17:30'),
      ('Reece Aldridge', 5, time '09:30', time '19:00'),
      ('Reece Aldridge', 6, time '09:00', time '18:00'),
      ('Femi Adeyemi',   2, time '11:00', time '20:00'),
      ('Femi Adeyemi',   3, time '11:00', time '20:00'),
      ('Femi Adeyemi',   4, time '11:00', time '20:00'),
      ('Femi Adeyemi',   6, time '09:00', time '18:00'),
      ('Femi Adeyemi',   7, time '10:00', time '16:00'),
      ('Jay Okonkwo',    1, time '09:00', time '16:00'),
      ('Jay Okonkwo',    2, time '09:00', time '16:00'),
      ('Jay Okonkwo',    3, time '13:00', time '20:00'),
      ('Jay Okonkwo',    5, time '09:00', time '18:00'),
      ('Jay Okonkwo',    6, time '08:30', time '17:30'),
      ('Kwame Mensah',   1, time '10:00', time '19:00'),
      ('Kwame Mensah',   2, time '10:00', time '19:00'),
      ('Kwame Mensah',   3, time '10:00', time '19:00'),
      ('Kwame Mensah',   5, time '10:00', time '19:00'),
      ('Kwame Mensah',   6, time '09:00', time '18:00'),
      ('Liam Doherty',   2, time '09:00', time '17:00'),
      ('Liam Doherty',   3, time '09:00', time '17:00'),
      ('Liam Doherty',   4, time '09:00', time '17:00'),
      ('Liam Doherty',   6, time '09:00', time '18:00'),
      ('Arjun Patel',    3, time '11:00', time '20:00'),
      ('Arjun Patel',    4, time '11:00', time '20:00'),
      ('Arjun Patel',    5, time '11:00', time '20:00'),
      ('Arjun Patel',    6, time '09:30', time '18:30'),
      ('Arjun Patel',    7, time '11:00', time '16:00'),
      ('Ollie Trent',    1, time '09:00', time '18:00'),
      ('Ollie Trent',    2, time '09:00', time '18:00'),
      ('Ollie Trent',    4, time '09:00', time '18:00'),
      ('Ollie Trent',    5, time '09:00', time '18:00'),
      ('Ollie Trent',    6, time '08:30', time '17:00'),
      ('Hassan Farid',   2, time '10:30', time '19:30'),
      ('Hassan Farid',   3, time '10:30', time '19:30'),
      ('Hassan Farid',   4, time '10:30', time '19:30'),
      ('Hassan Farid',   5, time '10:30', time '19:30'),
      ('Hassan Farid',   7, time '10:00', time '16:00')
    ) as r(name, weekday, start_time, end_time) on r.name = s.name;

  insert into rota_exceptions (staff_id, date, start_time, end_time, reason)
  select s.id, (current_date + 9), null, null, 'Annual leave' from staff s where s.name = 'Reece Aldridge';
  insert into rota_exceptions (staff_id, date, start_time, end_time, reason)
  select s.id, (current_date + 10), null, null, 'Annual leave' from staff s where s.name = 'Reece Aldridge';
  insert into rota_exceptions (staff_id, date, start_time, end_time, reason)
  select s.id, (current_date + 3), time '13:00', time '20:00', 'Dentist appointment, late start' from staff s where s.name = 'Tino Rossi';
end;
$seed$;

create or replace function seed_demo_clients()
returns void language plpgsql security definer set search_path = public as $seed$
declare
  v_camden uuid; v_shoreditch uuid; v_islington uuid;
begin
  select id into v_camden     from shops where slug = 'camden';
  select id into v_shoreditch from shops where slug = 'shoreditch';
  select id into v_islington  from shops where slug = 'islington';

  -- Mobiles use the Ofcom 07700 900xxx drama range, reserved and unroutable.
  insert into clients (name, mobile, email, home_shop_id) values
    ('James Whelan',    '+447700900101', 'j.whelan@example.com',  v_camden),
    ('Ade Bakare',      '+447700900102', 'ade.b@example.com',     v_camden),
    ('Tom Fletcher',    '+447700900103', null,                    v_camden),
    ('Ryan Cooke',      '+447700900104', 'ryancooke@example.com', v_camden),
    ('Marek Zielinski', '+447700900105', null,                    v_camden),
    ('Danny Osei',      '+447700900106', 'd.osei@example.com',    v_camden),
    ('Chris Vance',     '+447700900107', null,                    v_camden),
    ('Nathan Idris',    '+447700900108', 'nidris@example.com',    v_camden),
    ('Sam Beckwith',    '+447700900109', null,                    v_camden),
    ('Yusuf Rahman',    '+447700900110', 'yusuf.r@example.com',   v_camden),
    ('Elliot Haynes',   '+447700900111', null,                    v_camden),
    ('Paul Deverill',   '+447700900112', 'pdev@example.com',      v_camden),
    ('Michael Ansah',   '+447700900113', null,                    v_camden),
    ('Joe Cartwright',  '+447700900114', 'joec@example.com',      v_camden),
    ('Omar Haddad',     '+447700900115', null,                    v_camden),
    ('Luca Bianchi',    '+447700900116', 'luca.b@example.com',    v_shoreditch),
    ('Theo Marsden',    '+447700900117', null,                    v_shoreditch),
    ('Kofi Boateng',    '+447700900118', 'kofi.b@example.com',    v_shoreditch),
    ('Alex Ferreira',   '+447700900119', null,                    v_shoreditch),
    ('Zac Lindley',     '+447700900120', 'zac.l@example.com',     v_shoreditch),
    ('Ibrahim Sesay',   '+447700900121', null,                    v_shoreditch),
    ('Callum Pryce',    '+447700900122', 'cpryce@example.com',    v_shoreditch),
    ('Dev Chauhan',     '+447700900123', null,                    v_shoreditch),
    ('Harvey Locke',    '+447700900124', 'harvey@example.com',    v_islington),
    ('Amir Tahir',      '+447700900125', null,                    v_islington),
    ('Brendan Quill',   '+447700900126', 'bquill@example.com',    v_islington),
    ('Seb Ashworth',    '+447700900127', null,                    v_islington),
    ('Noah Freeman',    '+447700900128', 'noahf@example.com',     v_islington),
    ('Rob Tennant',     '+447700900129', null,                    v_islington),
    ('Wesley Amponsah', '+447700900130', 'wes.a@example.com',     v_islington);

  -- Anonymous walk-in records: named, no number. Exactly the clients the
  -- win-back list can never reach (REQUIREMENTS.md section 6).
  insert into clients (name, home_shop_id) values
    ('Walk-in (Steve)', v_shoreditch),
    ('Walk-in (Dave)',  v_shoreditch),
    ('Walk-in',         v_islington),
    ('Walk-in (Tony)',  v_camden);
end;
$seed$;

-- Walk each barber's real rota window in service-duration steps. Sequential by
-- construction, so the seed can never trip the exclusion constraint: that
-- constraint exists to protect real races, not sloppy data loading.
create or replace function seed_demo_appointments()
returns int language plpgsql security definer set search_path = public as $seed$
declare
  v_tz        text := 'Europe/London';
  v_camden    uuid;
  v_barber    record;
  v_day       date;
  v_cursor    timestamptz;
  v_win_start time;
  v_win_end   time;
  v_day_end   timestamptz;
  v_svc       record;
  v_client    uuid;
  v_status    appointment_status;
  v_source    appointment_source;
  v_appts     int := 0;
  v_clients   uuid[];
  v_fill      numeric;
  v_r         numeric;
begin
  select id into v_camden from shops where slug = 'camden';
  select array_agg(id) into v_clients from clients;

  for v_barber in select s.id, s.shop_id from staff s where s.role = 'barber' order by s.name
  loop
    for v_day in select generate_series(current_date - 28, current_date + 6, interval '1 day')::date
    loop
      if exists (select 1 from rota_exceptions
                  where staff_id = v_barber.id and date = v_day and start_time is null) then
        continue;
      end if;

      select coalesce(e.start_time, p.start_time), coalesce(e.end_time, p.end_time)
        into v_win_start, v_win_end
        from (select 1) x
        left join rota_patterns p
               on p.staff_id = v_barber.id and p.weekday = extract(isodow from v_day)::int
        left join rota_exceptions e
               on e.staff_id = v_barber.id and e.date = v_day;

      if v_win_start is null then
        continue;
      end if;

      -- leave genuine gaps: a barber's day is never 100% full, and the demo
      -- needs bookable slots on today and tomorrow
      if v_day < current_date then
        v_fill := 0.30;
      elsif v_day = current_date then
        v_fill := 0.45;
      else
        v_fill := 0.62;
      end if;

      v_cursor  := (v_day + v_win_start) at time zone v_tz;
      v_day_end := (v_day + v_win_end)   at time zone v_tz;

      while v_cursor < v_day_end loop
        select * into v_svc from services order by random() limit 1;
        exit when v_cursor + make_interval(mins => v_svc.duration_minutes) > v_day_end;

        if random() < v_fill then
          if v_cursor + make_interval(mins => v_svc.duration_minutes) <= now() then
            v_r := random();
            if v_r < 0.06 then
              v_status := 'no_show';
            elsif v_r < 0.10 then
              v_status := 'cancelled';
            else
              v_status := 'completed';
            end if;
          else
            v_status := 'booked';
          end if;

          -- walk-in shops skew heavily to staff-created; the Fresha pilot shop
          -- already has real online booking behaviour
          v_r := random();
          v_source := 'staff';
          if v_barber.shop_id = v_camden then
            if v_r < 0.72 then
              v_source := 'online';
            end if;
          elsif v_r < 0.22 then
            v_source := 'online';
          end if;

          v_client := v_clients[1 + floor(random() * array_length(v_clients, 1))::int];

          insert into appointments (shop_id, barber_id, client_id, service_id, starts_at, ends_at, status, source)
          values (v_barber.shop_id, v_barber.id, v_client, v_svc.id, v_cursor,
                  v_cursor + make_interval(mins => v_svc.duration_minutes), v_status, v_source);
          v_appts := v_appts + 1;
        end if;

        v_cursor := v_cursor + make_interval(mins => v_svc.duration_minutes);
      end loop;
    end loop;
  end loop;

  -- no_show_count is trigger-maintained on UPDATE, so backfill seeded history
  update clients c
     set no_show_count = coalesce(
       (select count(*) from appointments a where a.client_id = c.id and a.status = 'no_show'), 0);

  return v_appts;
end;
$seed$;

create or replace function seed_demo_data()
returns jsonb language plpgsql security definer set search_path = public as $orch$
declare
  v_appts int;
begin
  perform seed_demo_shops_staff();
  perform seed_demo_rotas();
  perform seed_demo_clients();
  v_appts := seed_demo_appointments();
  return jsonb_build_object(
    'shops',        (select count(*) from shops),
    'staff',        (select count(*) from staff),
    'services',     (select count(*) from services),
    'clients',      (select count(*) from clients),
    'rota_rows',    (select count(*) from rota_patterns),
    'appointments', v_appts
  );
end;
$orch$;

revoke all on function seed_demo_data() from public, anon;
grant execute on function seed_demo_data() to service_role;
