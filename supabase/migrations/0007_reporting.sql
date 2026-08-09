-- ============================================================================
-- 0007_reporting
--
-- Head-office numbers. Revenue here is EXPECTED, derived from completed
-- appointments at the central flat price (REQUIREMENTS.md §8) — not takings.
-- Card sales run on a standalone terminal which is the merchant of record, so
-- this figure has no tips, discounts, product sales or comps in it and will
-- never reconcile with the till. It is good for utilisation and per-shop
-- comparison and is labelled as expected everywhere it appears.
-- ============================================================================

create or replace function company_stats()
returns jsonb language plpgsql security definer set search_path = public as $stats$
declare
  v_shops jsonb;
  v_totals jsonb;
begin
  with window_days as (
    select generate_series(current_date - 27, current_date, interval '1 day')::date as d
  ),
  rostered as (
    select s.shop_id,
           sum(extract(epoch from (rp.end_time - rp.start_time)) / 60)::numeric as mins
      from rota_patterns rp
      join staff s on s.id = rp.staff_id
      join window_days w on extract(isodow from w.d)::int = rp.weekday
     group by s.shop_id
  ),
  worked as (
    select a.shop_id,
           sum(extract(epoch from (a.ends_at - a.starts_at)) / 60)::numeric as mins,
           count(*) filter (where a.status = 'completed') as completed,
           count(*) as total,
           count(*) filter (where a.source = 'online') as online,
           coalesce(sum(sv.price_pence) filter (where a.status = 'completed'), 0)::bigint as revenue
      from appointments a
      join services sv on sv.id = a.service_id
     where a.starts_at >= (current_date - 27)::timestamptz
       and a.starts_at <  (current_date + 1)::timestamptz
       and a.status <> 'cancelled'
     group by a.shop_id
  ),
  upcoming as (
    select shop_id, count(*) as booked_next_7
      from appointments
     where status = 'booked' and starts_at >= now() and starts_at < now() + interval '7 days'
     group by shop_id
  )
  select jsonb_agg(jsonb_build_object(
           'shop', sh.name,
           'slug', sh.slug,
           'is_pilot', sh.is_pilot,
           'booked_next_7', coalesce(u.booked_next_7, 0),
           'completed_last_28', coalesce(w.completed, 0),
           'expected_revenue_pence', coalesce(w.revenue, 0),
           'utilisation_pct', round(100 * coalesce(w.mins, 0) / nullif(r.mins, 0)),
           'online_share_pct', round(100.0 * coalesce(w.online, 0) / nullif(w.total, 0))
         ) order by sh.is_pilot desc, sh.name)
    into v_shops
    from shops sh
    left join rostered r on r.shop_id = sh.id
    left join worked   w on w.shop_id = sh.id
    left join upcoming u on u.shop_id = sh.id;

  select jsonb_build_object(
    'clients',              (select count(*) from clients),
    'contactable',          (select count(*) from clients where mobile is not null),
    'no_shows_last_28',     (select count(*) from appointments
                              where status = 'no_show' and starts_at >= (current_date - 27)::timestamptz),
    'appointments_last_28', (select count(*) from appointments
                              where starts_at >= (current_date - 27)::timestamptz and status <> 'cancelled')
  ) into v_totals;

  return jsonb_build_object('shops', v_shops, 'totals', v_totals);
end;
$stats$;

grant execute on function company_stats() to authenticated, service_role;
