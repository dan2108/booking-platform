-- Local-only shim so the production migrations run unchanged against a plain
-- Postgres. Supabase provides these; a bare cluster does not. Nothing here
-- ships to production — it exists so the schema, the RLS policies and the
-- reservation guarantee can be tested on a laptop with no cloud account.

create schema if not exists auth;

create table if not exists auth.users (id uuid primary key);

-- Supabase derives auth.uid() from the request JWT. Same contract here.
create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth  to anon, authenticated, service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public
  grant select on tables to anon;
