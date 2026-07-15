# 2026-05-26 Test places source

## Scope

- Added Supabase source table `public.test_places` for assignment and review testing.
- Inserted 10 fictional test place names:
  - `TEST0001` 石崁頭
  - `TEST0002` 牛寮坑
  - `TEST0003` 刺竹坪
  - `TEST0004` 後茄苳
  - `TEST0005` 七甲寮
  - `TEST0006` 水流崙
  - `TEST0007` 大潭底
  - `TEST0008` 楓樹崎
  - `TEST0009` 瓦厝埕
  - `TEST0010` 砂崙尾
- Set type, county, town, and village to `測試`.
- Upserted the rows into `final_tasks` with `source_table = test_places`.
- Rebuilt `app_tasks_view` and `app_review_queue_view` so they include both `third_phase_places` and `test_places`.
- Updated frontend task normalization to preserve `source_table`.
- General investigators now exclude unassigned `test_places` rows from the `其他地名` tab; they only see test places when assigned. Admin still sees all test places.
- Saved the applied SQL in `db/2026-05-26_test_places_source.sql`.

## Verification

- Supabase query confirmed:
  - `test_place_count = 10`
  - `final_task_count = 10`
  - `app_task_count = 10`
  - `review_queue_count = 10`
  - labels are all `測試`
  - all test tasks are initially unassigned
- `node --check main.js`
- `git diff --check`

## Security Notes

- `test_places` has RLS enabled and no direct anon table policy, matching the existing source snapshot table pattern.
- Supabase security advisor reports existing project-wide warnings, including security-definer views/functions and RLS-enabled tables without policies. The new table adds the same informational `RLS Enabled No Policy` lint as `third_phase_places`, which is intentional for direct table access.
