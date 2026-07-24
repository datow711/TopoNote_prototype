alter table if exists public.third_phase_places
  add column if not exists location text,
  add column if not exists name_history text,
  add column if not exists std_name_code text;

comment on column public.third_phase_places.location is
  '地名總表 location 欄位的工作清單快照。';

comment on column public.third_phase_places.name_history is
  '地名總表 name_history 欄位的工作清單快照。';

comment on column public.third_phase_places.std_name_code is
  '地名總表 std_name_code 欄位的工作清單快照。';
