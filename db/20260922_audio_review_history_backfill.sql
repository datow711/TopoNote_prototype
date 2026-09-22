-- Backfill legacy audio-review notes and follow-up flags into the case-level fields.
-- The previous audio-review UI stored its note in audio_assessments.reason.
-- Keep the other historical explanatory fields too, because they were part of
-- the old review form and would otherwise disappear from the new card.

begin;

with historical_audio as (
  select
    c.id as case_id,
    coalesce(bool_or(
      aa.decision = U&'\5f85\8ffd\554f'
      or coalesce(aa.needs_followup, false)
    ), false) as has_followup,
    string_agg(
      concat_ws(
        '｜',
        concat('音檔 #', aa.audio_record_id),
        concat('判定：', aa.decision),
        case when nullif(trim(coalesce(aa.reason, '')), '') is not null
          then concat('補充：', trim(aa.reason)) end,
        case when nullif(trim(coalesce(aa.followup_reason_text, '')), '') is not null
          and trim(aa.followup_reason_text) <> trim(coalesce(aa.reason, ''))
          then concat('待追問：', trim(aa.followup_reason_text)) end,
        case when nullif(trim(coalesce(aa.unusable_reason_text, '')), '') is not null
          then concat('不可用原因：', trim(aa.unusable_reason_text)) end
      ),
      E'\n'
      order by aa.created_at nulls first, aa.id
    ) filter (where
      nullif(trim(coalesce(aa.reason, '')), '') is not null
      or nullif(trim(coalesce(aa.followup_reason_text, '')), '') is not null
      or nullif(trim(coalesce(aa.unusable_reason_text, '')), '') is not null
    ) as historical_note
  from public.annotation_cases c
  join public.audio_assessments aa
    on aa.task_id = c.task_id
   and aa.language = c.language
  group by c.id
), eligible as (
  select h.*
  from historical_audio h
  where (h.has_followup or h.historical_note is not null)
    and not exists (
      select 1
      from public.proofing_events pe
      where pe.case_id = h.case_id
        and pe.action = 'audio_review_history_backfill'
        and pe.payload ->> 'migration' = '20260922_audio_review_history_backfill'
    )
), updated as (
  update public.annotation_cases c
  set audio_review_note = case
        when nullif(trim(coalesce(e.historical_note, '')), '') is null
          then c.audio_review_note
        when nullif(trim(coalesce(c.audio_review_note, '')), '') is null
          then trim(e.historical_note)
        else concat(trim(c.audio_review_note), E'\n\n', trim(e.historical_note))
      end,
      needs_followup_review = coalesce(c.needs_followup_review, false) or e.has_followup,
      state = case
        when e.has_followup then U&'\5f85\6aa2\67e5'
        else c.state
      end,
      updated_at = now()
  from eligible e
  where c.id = e.case_id
  returning c.id, e.has_followup, e.historical_note
)
insert into public.proofing_events(case_id, action, actor_account, payload)
select
  u.id,
  'audio_review_history_backfill',
  'system_migration',
  jsonb_build_object(
    'migration', '20260922_audio_review_history_backfill',
    'historical_note_appended', u.historical_note is not null,
    'followup_flag_set', u.has_followup
  )
from updated u;

commit;
