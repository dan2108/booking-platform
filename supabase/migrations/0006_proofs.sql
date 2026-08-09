-- ============================================================================
-- 0006_proofs
--
-- Executable proofs of the two things the whole design rests on. These are not
-- decoration: they run against the live database on demand from /proof, and
-- they are the checkable "definition of done" for PLAN.md Layer 1.
--
-- Both clean up after themselves and leave the calendar exactly as they found
-- it.
-- ============================================================================

-- Four cases the exclusion constraint has to get right.
create or replace function proof_no_double_booking()
returns jsonb language plpgsql security definer set search_path = public as $proof$
declare
  v_barber uuid; v_shop uuid; v_svc uuid; v_slot timestamptz;
  v_a uuid; v_b uuid; v_c uuid;
  v_steps jsonb := '[]'::jsonb;
  v_err text; v_detail text;
begin
  select id into v_svc from services where name = 'Cut & Style';
  select s.id, s.shop_id into v_barber, v_shop
    from staff s where s.role = 'barber' and s.name = 'Tino Rossi';

  -- need a full free HOUR so the adjacent-booking step has room
  select g into v_slot from generate_series(
      (current_date + 1 + time '09:00') at time zone 'Europe/London',
      (current_date + 1 + time '17:00') at time zone 'Europe/London',
      interval '15 minutes') g
   where staff_is_working(v_barber, g, g + interval '60 minutes')
     and not exists (
       select 1 from appointments a
        where a.barber_id = v_barber and a.status = 'booked'
          and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(g, g + interval '60 minutes', '[)'))
   limit 1;

  if v_slot is null then
    return jsonb_build_object('ok', false, 'reason', 'no free hour found to test against');
  end if;

  insert into appointments (shop_id, barber_id, service_id, starts_at, ends_at, status, source, notes)
  values (v_shop, v_barber, v_svc, v_slot, v_slot + interval '30 minutes', 'booked', 'online', 'PROOF-A')
  returning id into v_a;
  v_steps := v_steps || jsonb_build_object('step', 1, 'pass', true,
    'action', 'INSERT a 30-minute booked appointment',
    'expected', 'accepted', 'result', 'accepted');

  begin
    insert into appointments (shop_id, barber_id, service_id, starts_at, ends_at, status, source, notes)
    values (v_shop, v_barber, v_svc, v_slot + interval '10 minutes', v_slot + interval '40 minutes', 'booked', 'staff', 'PROOF-B')
    returning id into v_b;
    v_steps := v_steps || jsonb_build_object('step', 2, 'pass', false,
      'action', 'INSERT a SECOND booked appointment overlapping the first',
      'expected', 'rejected', 'result', 'ACCEPTED - GUARANTEE BROKEN');
  exception when exclusion_violation then
    get stacked diagnostics v_err = message_text, v_detail = pg_exception_detail;
    v_steps := v_steps || jsonb_build_object('step', 2, 'pass', true,
      'action', 'INSERT a SECOND booked appointment overlapping the first',
      'expected', 'rejected', 'result', 'rejected by constraint no_double_booking',
      'db_error', v_err, 'db_detail', v_detail);
  end;

  insert into appointments (shop_id, barber_id, service_id, starts_at, ends_at, status, source, notes)
  values (v_shop, v_barber, v_svc, v_slot + interval '30 minutes', v_slot + interval '60 minutes', 'booked', 'online', 'PROOF-C')
  returning id into v_c;
  v_steps := v_steps || jsonb_build_object('step', 3, 'pass', true,
    'action', 'INSERT an ADJACENT appointment that touches but does not overlap',
    'expected', 'accepted', 'result', 'accepted',
    'note', 'half-open range [start,end) means back-to-back bookings are fine');

  update appointments set status = 'cancelled' where id = v_a;
  insert into appointments (shop_id, barber_id, service_id, starts_at, ends_at, status, source, notes)
  values (v_shop, v_barber, v_svc, v_slot, v_slot + interval '30 minutes', 'booked', 'online', 'PROOF-D')
  returning id into v_b;
  v_steps := v_steps || jsonb_build_object('step', 4, 'pass', true,
    'action', 'CANCEL the first appointment, then re-book the exact same slot',
    'expected', 'accepted', 'result', 'accepted',
    'note', 'the constraint covers booked rows only, so cancelling frees the slot with no cleanup job');

  delete from appointments where notes like 'PROOF-%';

  return jsonb_build_object('ok', true, 'slot_tested', v_slot,
    'all_passed', not (v_steps @> '[{"pass": false}]'::jsonb), 'steps', v_steps);
end;
$proof$;

-- The tenancy deny-path proof. Assumes each persona's identity in turn and
-- reports what the DATABASE hands back, not what the UI chooses to render.
create or replace function proof_rls_isolation()
returns jsonb language plpgsql as $proof$
declare
  v_camden uuid; v_shore uuid;
  p record;
  v_out jsonb := '[]'::jsonb;
  v_camden_appts int; v_shore_appts int;
  v_shore_staff int; v_clients int; v_shore_rota int; v_total_clients int;
begin
  select id into v_camden from shops where slug = 'camden';
  select id into v_shore  from shops where slug = 'shoreditch';
  select count(*) into v_total_clients from clients;

  for p in
    select name, role, auth_user_id, shop_id from staff
     where name in ('Tino Rossi', 'Marcus Bell', 'Sasha Nowak', 'Dan Holt')
     order by array_position(array['Tino Rossi','Marcus Bell','Sasha Nowak','Dan Holt'], name)
  loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', p.auth_user_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';

    select count(*) into v_camden_appts from appointments where shop_id = v_camden;
    select count(*) into v_shore_appts  from appointments where shop_id = v_shore;
    select count(*) into v_shore_staff  from staff where shop_id = v_shore;
    select count(*) into v_clients      from clients;
    select count(*) into v_shore_rota   from rota_patterns rp
      join staff s on s.id = rp.staff_id where s.shop_id = v_shore;

    execute 'reset role';

    v_out := v_out || jsonb_build_object(
      'persona',                         p.name,
      'role',                            p.role,
      'camden_appointments_visible',     v_camden_appts,
      'shoreditch_appointments_visible', v_shore_appts,
      'shoreditch_staff_visible',        v_shore_staff,
      'shoreditch_rotas_visible',        v_shore_rota,
      'clients_visible',                 v_clients,
      'clients_total_in_company',        v_total_clients
    );
  end loop;

  perform set_config('request.jwt.claims', null, true);
  return v_out;
end;
$proof$;
