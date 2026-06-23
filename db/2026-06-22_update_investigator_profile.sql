begin;

create or replace function public.update_investigator_profile(
  p_user_id uuid,
  p_actor_account text,
  p_email text,
  p_name text,
  p_phone text default null,
  p_languages text default null,
  p_hakka_dialect text default null,
  p_life_area_1 text default null,
  p_survey_area_1 text default null,
  p_life_area_2 text default null,
  p_survey_area_2 text default null,
  p_life_area_3 text default null,
  p_survey_area_3 text default null
)
returns table(
  id uuid,
  account text,
  role text,
  is_active boolean,
  name text,
  email text,
  phone text,
  languages text,
  hakka_dialect text,
  life_area_1 text,
  survey_area_1 text,
  life_area_2 text,
  survey_area_2 text,
  life_area_3 text,
  survey_area_3 text
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_name text := trim(coalesce(p_name, ''));
  v_old_account text;
  v_old_email text;
  v_old_name text;
begin
  if not exists (
    select 1
    from public.investigators
    where lower(trim(account)) = lower(trim(coalesce(p_actor_account, '')))
      and role = 'admin'
      and is_active = true
  ) then
    raise exception 'admin permission required';
  end if;

  if v_email = '' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'valid email is required';
  end if;

  if v_name = '' then
    raise exception 'name is required';
  end if;

  select i.account, i.email, i.name
    into v_old_account, v_old_email, v_old_name
  from public.investigators i
  where i.id = p_user_id
    and i.role <> 'admin';

  if v_old_account is null then
    raise exception 'target investigator not found';
  end if;

  if exists (
    select 1
    from public.investigators i
    where i.id <> p_user_id
      and (
        lower(trim(coalesce(i.account, ''))) = v_email
        or lower(trim(coalesce(i.email, ''))) = v_email
      )
  ) then
    raise exception 'email is already used by another investigator';
  end if;

  update public.investigators i
  set account = v_email,
      email = v_email,
      user_name = v_name,
      name = v_name,
      phone = nullif(trim(coalesce(p_phone, '')), ''),
      specialty = nullif(trim(coalesce(p_languages, '')), ''),
      languages = nullif(trim(coalesce(p_languages, '')), ''),
      hakka_dialect = nullif(trim(coalesce(p_hakka_dialect, '')), ''),
      life_area_1 = nullif(trim(coalesce(p_life_area_1, '')), ''),
      survey_area_1 = nullif(trim(coalesce(p_survey_area_1, '')), ''),
      life_area_2 = nullif(trim(coalesce(p_life_area_2, '')), ''),
      survey_area_2 = nullif(trim(coalesce(p_survey_area_2, '')), ''),
      life_area_3 = nullif(trim(coalesce(p_life_area_3, '')), ''),
      survey_area_3 = nullif(trim(coalesce(p_survey_area_3, '')), ''),
      sheet_synced_at = now()
  where i.id = p_user_id
    and i.role <> 'admin';

  with mapped_assignments as (
    select
      ta.task_id,
      ta.investigator as old_investigator,
      case
        when lower(trim(ta.investigator)) = lower(trim(coalesce(v_old_name, ''))) then v_name
        else v_email
      end as new_investigator,
      ta.assigned_by,
      ta.assigned_at,
      ta.is_active
    from public.task_assignments ta
    where lower(trim(ta.investigator)) in (
      lower(trim(coalesce(v_old_account, ''))),
      lower(trim(coalesce(v_old_email, ''))),
      lower(trim(coalesce(v_old_name, '')))
    )
  ), upserted_assignments as (
    insert into public.task_assignments (task_id, investigator, assigned_by, assigned_at, is_active)
    select task_id, new_investigator, assigned_by, assigned_at, is_active
    from mapped_assignments
    where nullif(trim(new_investigator), '') is not null
      and new_investigator <> old_investigator
    on conflict (task_id, investigator) do update
      set is_active = public.task_assignments.is_active or excluded.is_active,
          assigned_by = coalesce(excluded.assigned_by, public.task_assignments.assigned_by),
          assigned_at = coalesce(public.task_assignments.assigned_at, excluded.assigned_at)
    returning task_id, investigator
  )
  update public.task_assignments ta
  set is_active = false
  from mapped_assignments ma
  where ta.task_id = ma.task_id
    and ta.investigator = ma.old_investigator
    and ma.new_investigator <> ma.old_investigator;

  update public.task_language_reviews tlr
  set assigned_to = case
        when lower(trim(tlr.assigned_to)) = lower(trim(coalesce(v_old_name, ''))) then v_name
        else v_email
      end,
      needs_sheet_sync = true,
      updated_at = now()
  where lower(trim(tlr.assigned_to)) in (
    lower(trim(coalesce(v_old_account, ''))),
    lower(trim(coalesce(v_old_email, ''))),
    lower(trim(coalesce(v_old_name, '')))
  );

  update public.final_tasks ft
  set assigned_to = case
        when lower(trim(ft.assigned_to)) = lower(trim(coalesce(v_old_name, ''))) then v_name
        else v_email
      end
  where lower(trim(ft.assigned_to)) in (
    lower(trim(coalesce(v_old_account, ''))),
    lower(trim(coalesce(v_old_email, ''))),
    lower(trim(coalesce(v_old_name, '')))
  );

  update public.audio_records ar
  set recorder_name = case
        when lower(trim(ar.recorder_name)) = lower(trim(coalesce(v_old_name, ''))) then v_name
        else v_email
      end
  where lower(trim(ar.recorder_name)) in (
    lower(trim(coalesce(v_old_account, ''))),
    lower(trim(coalesce(v_old_email, ''))),
    lower(trim(coalesce(v_old_name, '')))
  );

  return query
  select
    i.id,
    i.account,
    i.role,
    i.is_active,
    i.name,
    i.email,
    i.phone,
    i.languages,
    i.hakka_dialect,
    i.life_area_1,
    i.survey_area_1,
    i.life_area_2,
    i.survey_area_2,
    i.life_area_3,
    i.survey_area_3
  from public.investigators i
  where i.id = p_user_id;
end;
$function$;

revoke all on function public.update_investigator_profile(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text
) from public;
revoke all on function public.update_investigator_profile(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text
) from anon;
revoke all on function public.update_investigator_profile(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text
) from authenticated;
grant execute on function public.update_investigator_profile(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text
) to service_role;

commit;
