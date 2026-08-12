-- Repair language workflow states that were overwritten after assignment writeback.
-- The caller must first repair the Google Sheet, then call this service-role-only RPC
-- to align the Supabase source snapshot and task_language_reviews.sheet_state.

begin;

create or replace function public.repair_assigned_language_states(p_repairs jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_count integer := 0;
begin
  if jsonb_typeof(p_repairs) <> 'array' then
    raise exception 'p_repairs must be a JSON array';
  end if;

  with repair_rows as (
    select *
    from jsonb_to_recordset(p_repairs) as x(
      task_id integer,
      review_id bigint,
      source_id text,
      source_table text,
      language text,
      expected_state text,
      assigned_to text,
      updated_stamp text
    )
  )
  update public.task_language_reviews r
  set sheet_state = x.expected_state,
      updated_at = now()
  from repair_rows x
  where r.id = x.review_id
    and r.task_id = x.task_id
    and r.language = x.language
    and nullif(trim(coalesce(r.assigned_to, '')), '') = nullif(trim(coalesce(x.assigned_to, '')), '')
    and coalesce(r.app_state, '') in ('尚未標注', '待指派')
    and x.expected_state in ('錄音中', '書面標注中')
    and x.source_table in ('third_phase_places', 'test_places');

  with repair_rows as (
    select *
    from jsonb_to_recordset(p_repairs) as x(
      task_id integer,
      review_id bigint,
      source_id text,
      source_table text,
      language text,
      expected_state text,
      assigned_to text,
      updated_stamp text
    )
  )
  update public.third_phase_places p
  set t_state = case when x.language = '台語' then x.expected_state else p.t_state end,
      t_annotator = case when x.language = '台語' then x.assigned_to else p.t_annotator end,
      t_updated_at = case when x.language = '台語' then x.updated_stamp else p.t_updated_at end,
      h_state = case when x.language = '客語' then x.expected_state else p.h_state end,
      h_annotator = case when x.language = '客語' then x.assigned_to else p.h_annotator end,
      h_updated_at = case when x.language = '客語' then x.updated_stamp else p.h_updated_at end,
      synced_at = now()
  from repair_rows x
  where x.source_table = 'third_phase_places'
    and p.uuid = x.source_id
    and x.expected_state in ('錄音中', '書面標注中')
    and (
      (x.language = '台語' and coalesce(nullif(trim(p.t_state), ''), '待指派') = '待指派')
      or
      (x.language = '客語' and coalesce(nullif(trim(p.h_state), ''), '待指派') = '待指派')
    );

  with repair_rows as (
    select *
    from jsonb_to_recordset(p_repairs) as x(
      task_id integer,
      review_id bigint,
      source_id text,
      source_table text,
      language text,
      expected_state text,
      assigned_to text,
      updated_stamp text
    )
  )
  update public.test_places p
  set t_state = case when x.language = '台語' then x.expected_state else p.t_state end,
      t_annotator = case when x.language = '台語' then x.assigned_to else p.t_annotator end,
      t_updated_at = case when x.language = '台語' then x.updated_stamp else p.t_updated_at end,
      h_state = case when x.language = '客語' then x.expected_state else p.h_state end,
      h_annotator = case when x.language = '客語' then x.assigned_to else p.h_annotator end,
      h_updated_at = case when x.language = '客語' then x.updated_stamp else p.h_updated_at end,
      synced_at = now()
  from repair_rows x
  where x.source_table = 'test_places'
    and p.uuid = x.source_id
    and x.expected_state in ('錄音中', '書面標注中')
    and (
      (x.language = '台語' and coalesce(nullif(trim(p.t_state), ''), '待指派') = '待指派')
      or
      (x.language = '客語' and coalesce(nullif(trim(p.h_state), ''), '待指派') = '待指派')
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function public.repair_assigned_language_states(jsonb) from public, anon, authenticated;
grant execute on function public.repair_assigned_language_states(jsonb) to service_role;

commit;
