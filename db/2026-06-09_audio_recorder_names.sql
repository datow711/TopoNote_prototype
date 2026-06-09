with mapped_records as (
  select distinct on (ar.id)
    ar.id,
    trim(i.name) as recorder_display_name
  from public.audio_records ar
  join public.investigators i
    on lower(trim(ar.recorder_name)) in (
      lower(trim(coalesce(i.account, ''))),
      lower(trim(coalesce(i.email, ''))),
      lower(trim(coalesce(i.user_name, ''))),
      lower(trim(coalesce(i.name, '')))
    )
  where nullif(trim(coalesce(ar.recorder_name, '')), '') is not null
    and nullif(trim(coalesce(i.name, '')), '') is not null
    and lower(trim(ar.recorder_name)) <> lower(trim(i.name))
  order by ar.id,
    case
      when lower(trim(ar.recorder_name)) = lower(trim(coalesce(i.account, ''))) then 1
      when lower(trim(ar.recorder_name)) = lower(trim(coalesce(i.email, ''))) then 2
      when lower(trim(ar.recorder_name)) = lower(trim(coalesce(i.user_name, ''))) then 3
      when lower(trim(ar.recorder_name)) = lower(trim(coalesce(i.name, ''))) then 4
      else 5
    end
)
update public.audio_records ar
set recorder_name = mr.recorder_display_name
from mapped_records mr
where ar.id = mr.id;
