begin;

alter table public.investigators
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists name text,
  add column if not exists phone text,
  add column if not exists languages text,
  add column if not exists hakka_dialect text,
  add column if not exists life_area_1 text,
  add column if not exists survey_area_1 text,
  add column if not exists life_area_2 text,
  add column if not exists survey_area_2 text,
  add column if not exists life_area_3 text,
  add column if not exists survey_area_3 text,
  add column if not exists sheet_synced_at timestamp with time zone;

update public.investigators
set id = coalesce(id, gen_random_uuid()),
    name = coalesce(nullif(name, ''), nullif(user_name, ''), account),
    email = coalesce(nullif(email, ''), account),
    is_active = coalesce(is_active, true);

alter table public.investigators
  alter column id set not null,
  alter column name set not null,
  alter column email set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'investigators_id_key'
      and conrelid = 'public.investigators'::regclass
  ) then
    alter table public.investigators add constraint investigators_id_key unique (id);
  end if;
end $$;

delete from public.investigators
where role <> 'admin';

update public.task_assignments ta
set is_active = false
where ta.is_active = true
  and not exists (
    select 1
    from public.investigators i
    where i.role = 'admin'
      and (i.account = ta.investigator or i.user_name = ta.investigator)
  );

create or replace function public.sync_sheet_users(p_users jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user jsonb;
  v_email text;
  v_name text;
  v_active boolean;
  v_count integer := 0;
begin
  if jsonb_typeof(p_users) <> 'array' then
    raise exception 'p_users must be a JSON array';
  end if;

  for v_user in select value from jsonb_array_elements(p_users) loop
    v_email := lower(trim(v_user->>'email'));
    v_name := trim(v_user->>'name');

    if coalesce(v_email, '') = '' or coalesce(v_name, '') = '' then
      continue;
    end if;

    v_active := case
      when lower(trim(coalesce(v_user->>'active', 'true'))) in ('true', '1', 'yes', 'y', 'on', '是', '啟用') then true
      when lower(trim(coalesce(v_user->>'active', 'true'))) in ('false', '0', 'no', 'n', 'off', '否', '停用') then false
      else true
    end;

    insert into public.investigators (
      id, account, password, user_name, role, email, is_active, specialty,
      name, phone, languages, hakka_dialect,
      life_area_1, survey_area_1, life_area_2, survey_area_2, life_area_3, survey_area_3,
      sheet_synced_at
    ) values (
      gen_random_uuid(), v_email, '', v_name, 'user', v_email, v_active,
      nullif(trim(coalesce(v_user->>'languages', '')), ''),
      v_name,
      nullif(trim(coalesce(v_user->>'phone', '')), ''),
      nullif(trim(coalesce(v_user->>'languages', '')), ''),
      nullif(trim(coalesce(v_user->>'hakka_dialect', '')), ''),
      nullif(trim(coalesce(v_user->>'life_area_1', '')), ''),
      nullif(trim(coalesce(v_user->>'survey_area_1', '')), ''),
      nullif(trim(coalesce(v_user->>'life_area_2', '')), ''),
      nullif(trim(coalesce(v_user->>'survey_area_2', '')), ''),
      nullif(trim(coalesce(v_user->>'life_area_3', '')), ''),
      nullif(trim(coalesce(v_user->>'survey_area_3', '')), ''),
      now()
    )
    on conflict (account) do update set
      user_name = excluded.user_name,
      email = excluded.email,
      is_active = excluded.is_active,
      specialty = excluded.specialty,
      name = excluded.name,
      phone = excluded.phone,
      languages = excluded.languages,
      hakka_dialect = excluded.hakka_dialect,
      life_area_1 = excluded.life_area_1,
      survey_area_1 = excluded.survey_area_1,
      life_area_2 = excluded.life_area_2,
      survey_area_2 = excluded.survey_area_2,
      life_area_3 = excluded.life_area_3,
      survey_area_3 = excluded.survey_area_3,
      sheet_synced_at = now()
    where public.investigators.role <> 'admin';

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

create or replace function public.set_investigator_active(p_user_id uuid, p_is_active boolean, p_actor_account text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not exists (
    select 1
    from public.investigators
    where account = p_actor_account
      and role = 'admin'
      and is_active = true
  ) then
    raise exception 'admin permission required';
  end if;

  update public.investigators
  set is_active = p_is_active
  where id = p_user_id
    and role <> 'admin';

  if not found then
    raise exception 'target investigator not found';
  end if;
end;
$function$;

drop function if exists public.login_investigator(text);
drop function if exists public.login_admin(text, text);

create function public.login_investigator(p_email text)
returns table(user_id uuid, account text, role text)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
  select i.id, i.account, i.role
  from public.investigators i
  where lower(i.email) = lower(trim(p_email))
    and i.role <> 'admin'
    and i.is_active = true;
end;
$function$;

create function public.login_admin(p_email text, p_password text)
returns table(user_id uuid, account text, role text)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
  select i.id, i.account, i.role
  from public.investigators i
  where lower(i.email) = lower(trim(p_email))
    and i.password = p_password
    and i.role = 'admin'
    and i.is_active = true;
end;
$function$;

drop view if exists public.app_users_view;
create view public.app_users_view as
select id, account, role, is_active
from public.investigators;

revoke execute on function public.sync_sheet_users(jsonb) from public;
revoke execute on function public.sync_sheet_users(jsonb) from anon, authenticated;
grant execute on function public.sync_sheet_users(jsonb) to service_role;

commit;
