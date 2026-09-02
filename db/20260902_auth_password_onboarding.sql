-- Track whether an Auth user has acknowledged the shared-password onboarding.
-- NULL means the one-time email bootstrap login is still allowed.

begin;

alter table public.investigators
  add column if not exists password_onboarding_acknowledged_at timestamptz;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.get_password_onboarding_status()
returns table(
  password_login_required boolean,
  acknowledged_at timestamptz
)
language plpgsql
security definer
set search_path to 'public, private'
as $function$
declare
  v_user record;
begin
  select * into v_user from private.get_authenticated_investigator();
  if not found then
    raise exception 'authenticated investigator required';
  end if;

  return query
  select
    i.password_onboarding_acknowledged_at is not null,
    i.password_onboarding_acknowledged_at
  from public.investigators i
  where i.id = v_user.user_id
    and i.is_active = true;

  if not found then
    raise exception 'active investigator profile required';
  end if;
end;
$function$;

revoke all on function private.get_password_onboarding_status()
  from public, anon, authenticated;
grant execute on function private.get_password_onboarding_status()
  to authenticated;

create or replace function public.get_password_onboarding_status()
returns table(
  password_login_required boolean,
  acknowledged_at timestamptz
)
language sql
security invoker
set search_path to 'public, private'
as $function$
  select * from private.get_password_onboarding_status();
$function$;

revoke all on function public.get_password_onboarding_status()
  from public, anon, authenticated;
grant execute on function public.get_password_onboarding_status()
  to authenticated;

create or replace function private.acknowledge_password_onboarding()
returns table(
  password_login_required boolean,
  acknowledged_at timestamptz
)
language plpgsql
security definer
set search_path to 'public, private'
as $function$
declare
  v_user record;
  v_acknowledged_at timestamptz;
begin
  select * into v_user from private.get_authenticated_investigator();
  if not found then
    raise exception 'authenticated investigator required';
  end if;

  update public.investigators i
  set password_onboarding_acknowledged_at =
    coalesce(i.password_onboarding_acknowledged_at, now())
  where i.id = v_user.user_id
    and i.is_active = true
  returning i.password_onboarding_acknowledged_at
  into v_acknowledged_at;

  if not found then
    raise exception 'active investigator profile required';
  end if;

  return query select true, v_acknowledged_at;
end;
$function$;

revoke all on function private.acknowledge_password_onboarding()
  from public, anon, authenticated;
grant execute on function private.acknowledge_password_onboarding()
  to authenticated;

create or replace function public.acknowledge_password_onboarding()
returns table(
  password_login_required boolean,
  acknowledged_at timestamptz
)
language sql
security invoker
set search_path to 'public, private'
as $function$
  select * from private.acknowledge_password_onboarding();
$function$;

revoke all on function public.acknowledge_password_onboarding()
  from public, anon, authenticated;
grant execute on function public.acknowledge_password_onboarding()
  to authenticated;

commit;
