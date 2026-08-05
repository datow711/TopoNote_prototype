-- Add explicit, separately auditable proofing returns for annotation and audio.

begin;

create or replace function public.return_review_case(
  p_case_id bigint,
  p_actor_account text,
  p_claim_token uuid,
  p_return_annotation boolean,
  p_return_audio boolean,
  p_annotation_reason text default '',
  p_audio_reason text default ''
)
returns public.annotation_cases
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.workflow_actor_role_(p_actor_account);
  q record;
  v_case public.annotation_cases;
  v_is_written boolean;
  v_next_state text;
begin
  if v_role not in ('admin', 'proofreader') then
    raise exception 'proofreader permission required';
  end if;
  if not coalesce(p_return_annotation, false)
     and not coalesce(p_return_audio, false) then
    raise exception 'select at least one return target';
  end if;
  if p_return_annotation and nullif(trim(coalesce(p_annotation_reason, '')), '') is null then
    raise exception 'annotation return reason is required';
  end if;
  if p_return_audio and nullif(trim(coalesce(p_audio_reason, '')), '') is null then
    raise exception 'audio return reason is required';
  end if;

  select * into q
  from public.app_review_workflow_queue
  where case_id = p_case_id;
  if not found then raise exception 'review case not found'; end if;
  if q.state = U&'\5df2\5b8c\6210' then
    raise exception 'completed review case cannot be returned';
  end if;
  if p_return_audio and coalesce(q.audio_record_count, 0) = 0 then
    raise exception 'audio return requires an audio-bearing case';
  end if;

  if v_role <> 'admin' and (
    p_claim_token is null
    or q.claim_by <> p_actor_account
    or q.claim_token <> p_claim_token
    or q.claim_until is null
    or q.claim_until <= now()
  ) then
    raise exception 'active proofreader claim token required';
  end if;

  v_is_written := lower(coalesce(q.annotation_source_type, '')) = 'satellite'
    or q.class_name = U&'\66f8\9762\6a19\6ce8';
  v_next_state := case
    when p_return_audio then U&'\9304\97f3\4e2d'
    when v_is_written then U&'\66f8\9762\6a19\6ce8\4e2d'
    else U&'\9304\97f3\6a19\6ce8\4e2d'
  end;

  update public.annotation_cases
  set state = v_next_state,
      claim_by = null,
      claim_token = null,
      claim_until = null,
      audio_claim_by = case when p_return_audio then null else audio_claim_by end,
      audio_claim_token = case when p_return_audio then null else audio_claim_token end,
      audio_claim_until = case when p_return_audio then null else audio_claim_until end,
      updated_at = now()
  where id = p_case_id
  returning * into v_case;

  if p_return_annotation then
    insert into public.proofing_events(case_id, action, actor_account, payload)
    values (
      p_case_id,
      'return_annotation',
      p_actor_account,
      jsonb_build_object('reason', trim(p_annotation_reason))
    );
  end if;
  if p_return_audio then
    insert into public.proofing_events(case_id, action, actor_account, payload)
    values (
      p_case_id,
      'return_audio',
      p_actor_account,
      jsonb_build_object('reason', trim(p_audio_reason))
    );
  end if;

  return v_case;
end;
$function$;

revoke all on function public.return_review_case(bigint, text, uuid, boolean, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.return_review_case(bigint, text, uuid, boolean, boolean, text, text)
  to anon, authenticated;

commit;