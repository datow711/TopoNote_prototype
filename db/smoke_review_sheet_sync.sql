-- Smoke test checks for APP review -> Supabase queue -> Google Sheet sync.
-- Default target: TEST0001 in test_places.
-- These queries are read-only. Run before and after the GAS menu action:
-- 地名計畫系統 -> 5. 回寫 APP 審查結果至工作表

-- 1. The test task must be routed through test_places.
select
  'target_task_exists' as check_name,
  ft.id as task_id,
  ft.source_id,
  ft.source_table,
  ft.assigned_to,
  ft.status,
  ft.is_active
from public.final_tasks ft
where ft.source_id = 'TEST0001'
  and ft.source_table = 'test_places';

-- 2. Review state for TEST0001.
-- Before GAS sync, approved rows should have needs_sheet_sync = true.
-- After GAS sync, synced rows should have needs_sheet_sync = false and last_synced_at set.
select
  'review_state_for_test0001' as check_name,
  tlr.id as review_id,
  tlr.task_id,
  ft.source_id,
  ft.source_table,
  tlr.language,
  tlr.app_state,
  tlr.needs_sheet_sync,
  tlr.reviewed_by,
  tlr.reviewed_at,
  tlr.last_synced_at,
  tlr.final_fields
from public.task_language_reviews tlr
join public.final_tasks ft on ft.id = tlr.task_id
where ft.source_id = 'TEST0001'
order by tlr.language;

-- 3. Pending queue rows that GAS will write.
-- Before GAS sync, approved TEST0001 rows should appear here with source_table = test_places.
-- After GAS sync, TEST0001 should no longer appear here.
select
  'queue_rows_for_test0001' as check_name,
  q.review_id,
  q.task_id,
  q.source_id,
  q.source_table,
  q.place_name,
  q.language,
  q.app_state,
  q.reviewed_by,
  q.reviewed_at,
  q.audio_record_id,
  q.recorder_name,
  q.final_fields
from public.app_sheet_sync_queue q
where q.source_id = 'TEST0001'
order by q.language;

-- 4. Safety check: no TEST* review should be routed to a formal source.
-- Expected result: 0 rows.
select
  'unexpected_test_queue_routing' as check_name,
  q.review_id,
  q.task_id,
  q.source_id,
  q.source_table,
  q.language,
  q.app_state
from public.app_sheet_sync_queue q
where q.source_id like 'TEST%'
  and q.source_table <> 'test_places'
order by q.source_id, q.language;

-- 5. Queue summary. Helpful when more than one review is pending.
select
  'pending_queue_summary' as check_name,
  q.source_table,
  count(*) as pending_count,
  array_agg(q.source_id order by q.source_id, q.language) as source_ids
from public.app_sheet_sync_queue q
group by q.source_table
order by q.source_table;
