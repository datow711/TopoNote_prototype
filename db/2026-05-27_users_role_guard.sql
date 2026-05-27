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
  v_role text;
  v_active boolean;
  v_count integer := 0;
begin
  if jsonb_typeof(p_users) <> 'array' then
    raise exception 'p_users must be a JSON array';
  end if;

  for v_user in select value from jsonb_array_elements(p_users) loop
    v_email := lower(trim(v_user->>'email'));
    v_name := trim(v_user->>'name');
    v_role := lower(trim(coalesce(v_user->>'role', 'user')));

    if coalesce(v_email, '') = '' or coalesce(v_name, '') = '' then
      continue;
    end if;

    if v_role <> '' and v_role <> 'user' then
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

revoke execute on function public.sync_sheet_users(jsonb) from public;
revoke execute on function public.sync_sheet_users(jsonb) from anon, authenticated;
grant execute on function public.sync_sheet_users(jsonb) to service_role;
