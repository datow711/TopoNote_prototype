-- Supabase Auth identity plus read-only annotation draft history.
-- The public wrappers require a real Auth session; role and account are
-- resolved from the database, never from a caller-provided actor account.

begin;

alter table public.investigators
  add column if not exists auth_user_id uuid;

create unique index if not exists investigators_auth_user_id_uidx
  on public.investigators (auth_user_id)
  where auth_user_id is not null;

-- Backfill links that already exist. New Auth users can use the verified
-- email fallback in private.get_authenticated_investigator() until an admin
-- explicitly records auth_user_id.
update public.investigators i
set auth_user_id = u.id
from auth.users u
where i.auth_user_id is null
  and u.email is not null
  and lower(trim(i.email)) = lower(trim(u.email));

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.get_authenticated_investigator()
returns table(
  user_id uuid,
  account text,
  role text,
  name text,
  email text,
  phone text
)
language plpgsql
security definer
set search_path to 'public, private'
as $function$
declare
  v_auth_uid uuid := auth.uid();
  v_auth_email text;
  v_match_count integer;
begin
  if v_auth_uid is null then
    raise exception 'authenticated session required';
  end if;

  select lower(trim(u.email))
  into v_auth_email
  from auth.users u
  where u.id = v_auth_uid
    and u.email_confirmed_at is not null;

  if v_auth_email is null then
    raise exception 'confirmed Auth email required';
  end if;

  select count(*)
  into v_match_count
  from public.investigators i
  where i.is_active = true
    and (
      i.auth_user_id = v_auth_uid
      or (
        i.auth_user_id is null
        and lower(trim(i.email)) = v_auth_email
      )
    );

  if v_match_count = 0 then
    raise exception 'Auth account is not linked to an active investigator';
  end if;
  if v_match_count > 1 then
    raise exception 'Auth email matches multiple investigators';
  end if;

  return query
  select i.id, i.account, i.role, i.name, i.email, i.phone
  from public.investigators i
  where i.is_active = true
    and (
      i.auth_user_id = v_auth_uid
      or (
        i.auth_user_id is null
        and lower(trim(i.email)) = v_auth_email
      )
    )
  order by (i.auth_user_id = v_auth_uid) desc
  limit 1;
end;
$function$;

revoke all on function private.get_authenticated_investigator()
  from public, anon, authenticated;
grant execute on function private.get_authenticated_investigator()
  to authenticated;

create or replace function public.get_authenticated_investigator()
returns table(
  user_id uuid,
  account text,
  role text,
  name text,
  email text,
  phone text
)
language sql
security invoker
set search_path to 'public, private'
as $function$
  select * from private.get_authenticated_investigator();
$function$;

revoke all on function public.get_authenticated_investigator()
  from public, anon, authenticated;
grant execute on function public.get_authenticated_investigator()
  to authenticated;

revoke all on function public.get_review_workflow_audio_sources(bigint, text)
  from public, anon, authenticated;
revoke all on function public.save_audio_annotation_draft(
  bigint, text, jsonb, integer, uuid, boolean, integer, uuid
) from public, anon, authenticated;
create or replace function private.get_review_workflow_audio_sources_authenticated(
  p_case_id bigint
)
returns table(
  audio_record_id integer,
  phonetic_reading text,
  annotations jsonb
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
  select * from public.get_review_workflow_audio_sources(p_case_id, v_user.account);
end;
$function$;
revoke all on function private.get_review_workflow_audio_sources_authenticated(bigint)
  from public, anon, authenticated;
grant execute on function private.get_review_workflow_audio_sources_authenticated(bigint)
  to authenticated;
create or replace function public.get_review_workflow_audio_sources(
  p_case_id bigint
)
returns table(
  audio_record_id integer,
  phonetic_reading text,
  annotations jsonb
)
language sql
security invoker
set search_path to 'public, private'
as $function$
  select * from private.get_review_workflow_audio_sources_authenticated(p_case_id);
$function$;
revoke all on function public.get_review_workflow_audio_sources(bigint)
  from public, anon, authenticated;
grant execute on function public.get_review_workflow_audio_sources(bigint)
  to authenticated;
create or replace function private.save_audio_annotation_draft_authenticated(
  p_case_id bigint,
  p_fields jsonb,
  p_source_audio_record_id integer,
  p_audio_claim_token uuid,
  p_confirmed_unambiguous boolean,
  p_base_version_no integer,
  p_client_request_id uuid
)
returns public.annotation_versions
language plpgsql
security definer
set search_path to 'public, private'
as $function$
declare
  v_user record;
  v_version public.annotation_versions;
begin
  select * into v_user from private.get_authenticated_investigator();
  if not found then
    raise exception 'authenticated investigator required';
  end if;
  select *
  into v_version
  from public.save_audio_annotation_draft(
    p_case_id,
    v_user.account,
    p_fields,
    p_source_audio_record_id,
    p_audio_claim_token,
    p_confirmed_unambiguous,
    p_base_version_no,
    p_client_request_id
  );
  return v_version;
end;
$function$;
revoke all on function private.save_audio_annotation_draft_authenticated(
  bigint, jsonb, integer, uuid, boolean, integer, uuid
) from public, anon, authenticated;
grant execute on function private.save_audio_annotation_draft_authenticated(
  bigint, jsonb, integer, uuid, boolean, integer, uuid
) to authenticated;
create or replace function public.save_audio_annotation_draft(
  p_case_id bigint,
  p_fields jsonb,
  p_source_audio_record_id integer,
  p_audio_claim_token uuid,
  p_confirmed_unambiguous boolean,
  p_base_version_no integer,
  p_client_request_id uuid
)
returns public.annotation_versions
language sql
security invoker
set search_path to 'public, private'
as $function$
  select * from private.save_audio_annotation_draft_authenticated(
    p_case_id,
    p_fields,
    p_source_audio_record_id,
    p_audio_claim_token,
    p_confirmed_unambiguous,
    p_base_version_no,
    p_client_request_id
  );
$function$;
revoke all on function public.save_audio_annotation_draft(
  bigint, jsonb, integer, uuid, boolean, integer, uuid
) from public, anon, authenticated;
grant execute on function public.save_audio_annotation_draft(
  bigint, jsonb, integer, uuid, boolean, integer, uuid
) to authenticated;
drop function if exists public.get_audio_annotation_draft_history(bigint, text);

create or replace function private.get_audio_annotation_draft_history(
  p_case_id bigint
)
returns table(
  id bigint,
  case_id bigint,
  version_no integer,
  version_kind text,
  fields jsonb,
  created_by text,
  source_type text,
  source_actor text,
  source_stamp text,
  created_at timestamptz,
  source_audio_record_id integer,
  changed_fields text[],
  is_current boolean
)
language plpgsql
security definer
set search_path to 'public, private'
as $function$
declare
  v_user record;
  v_role text;
  v_actor text;
  v_case public.annotation_cases;
begin
  select * into v_user from private.get_authenticated_investigator();
  if not found then
    raise exception 'authenticated investigator required';
  end if;

  v_role := lower(trim(coalesce(v_user.role, '')));
  v_actor := lower(trim(coalesce(v_user.account, '')));
  if v_role not in ('admin', 'proofreader', 'audio_assessor') then
    raise exception 'annotation draft history permission required';
  end if;
  if p_case_id is null then
    raise exception 'case id is required';
  end if;

  select ac.*
  into v_case
  from public.annotation_cases ac
  where ac.id = p_case_id;
  if not found then
    raise exception 'review case not found';
  end if;

  if v_role = 'audio_assessor' then
    if not exists (
      select 1
      from public.audio_records ar
      where ar.task_id = v_case.task_id
        and ar.language = v_case.language
        and ar.audio_file_id is not null
        and ar.unlinked_at is null
    ) then
      raise exception 'audio case visibility required';
    end if;
  elsif v_role = 'proofreader' then
    if not (
      lower(trim(coalesce(v_case.assigned_to, ''))) = v_actor
      or (
        lower(trim(coalesce(v_case.claim_by, ''))) = v_actor
        and v_case.claim_until is not null
        and v_case.claim_until > now()
      )
    ) then
      raise exception 'assigned or claimed proofing case required';
    end if;
  end if;

  return query
  select
    av.id,
    av.case_id,
    av.version_no,
    av.version_kind,
    av.fields,
    av.created_by,
    av.source_type,
    av.source_actor,
    av.source_stamp,
    av.created_at,
    case
      when draft_event.payload->>'source_audio_record_id' ~ '^[0-9]+$'
        then (draft_event.payload->>'source_audio_record_id')::integer
      else null
    end,
    case
      when jsonb_typeof(coalesce(draft_event.payload->'changed_fields', 'null'::jsonb)) = 'array'
        then array(
          select jsonb_array_elements_text(draft_event.payload->'changed_fields')
        )::text[]
      else array[]::text[]
    end,
    av.version_no = coalesce(v_case.current_version_no, 0)
  from public.annotation_versions av
  left join lateral (
    select pe.payload
    from public.proofing_events pe
    where pe.case_id = av.case_id
      and pe.action = 'audio_annotation_draft'
      and pe.payload->>'version_id' ~ '^[0-9]+$'
      and (pe.payload->>'version_id')::bigint = av.id
    order by pe.created_at desc, pe.id desc
    limit 1
  ) draft_event on true
  where av.case_id = v_case.id
  order by av.version_no desc, av.id desc;
end;
$function$;

revoke all on function private.get_audio_annotation_draft_history(bigint)
  from public, anon, authenticated;
grant execute on function private.get_audio_annotation_draft_history(bigint)
  to authenticated;

create or replace function public.get_audio_annotation_draft_history(
  p_case_id bigint
)
returns table(
  id bigint,
  case_id bigint,
  version_no integer,
  version_kind text,
  fields jsonb,
  created_by text,
  source_type text,
  source_actor text,
  source_stamp text,
  created_at timestamptz,
  source_audio_record_id integer,
  changed_fields text[],
  is_current boolean
)
language sql
security invoker
set search_path to 'public, private'
as $function$
  select * from private.get_audio_annotation_draft_history(p_case_id);
$function$;

revoke all on function public.get_audio_annotation_draft_history(bigint)
  from public, anon, authenticated;
grant execute on function public.get_audio_annotation_draft_history(bigint)
  to authenticated;

commit;
