create or replace view public.app_users_view as
select
  id,
  account,
  role,
  is_active,
  name,
  email,
  phone,
  languages,
  hakka_dialect,
  life_area_1,
  survey_area_1,
  life_area_2,
  survey_area_2,
  life_area_3,
  survey_area_3
from public.investigators;

grant select on public.app_users_view to anon, authenticated;
