begin;

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  target_account text,
  created_by text not null,
  created_at timestamptz not null default now(),
  is_active boolean not null default true
);

create table if not exists public.announcement_reads (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  reader_account text not null,
  read_at timestamptz not null default now(),
  primary key (announcement_id, reader_account)
);

create index if not exists announcements_target_created_idx
  on public.announcements (target_account, created_at desc);

create index if not exists announcement_reads_reader_idx
  on public.announcement_reads (reader_account, read_at desc);

alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;

revoke all on table public.announcements from public, anon, authenticated;
revoke all on table public.announcement_reads from public, anon, authenticated;
grant select, insert, update, delete on table public.announcements to service_role;
grant select, insert, update, delete on table public.announcement_reads to service_role;

create or replace function public.get_visible_announcements(
  p_account text,
  p_limit integer default 50
)
returns table(
  id uuid,
  title text,
  body text,
  target_account text,
  created_by text,
  created_at timestamptz,
  read_at timestamptz,
  is_read boolean
)
language sql
security definer
set search_path to 'public'
as $function$
  select
    a.id,
    a.title,
    a.body,
    a.target_account,
    a.created_by,
    a.created_at,
    r.read_at,
    r.read_at is not null as is_read
  from public.announcements a
  left join public.announcement_reads r
    on r.announcement_id = a.id
   and lower(trim(r.reader_account)) = lower(trim(coalesce(p_account, '')))
  where a.is_active = true
    and (
      a.target_account is null
      or lower(trim(a.target_account)) = lower(trim(coalesce(p_account, '')))
    )
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$function$;

create or replace function public.mark_announcement_read(
  p_announcement_id uuid,
  p_reader_account text
)
returns table(
  announcement_id uuid,
  reader_account text,
  read_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_reader text := lower(trim(coalesce(p_reader_account, '')));
begin
  if v_reader = '' then
    raise exception 'reader account is required';
  end if;

  if not exists (
    select 1
    from public.announcements a
    where a.id = p_announcement_id
      and a.is_active = true
      and (
        a.target_account is null
        or lower(trim(a.target_account)) = v_reader
      )
  ) then
    raise exception 'announcement is not visible to this account';
  end if;

  insert into public.announcement_reads as ar (announcement_id, reader_account, read_at)
  values (p_announcement_id, v_reader, now())
  on conflict (announcement_id, reader_account)
  do update set read_at = excluded.read_at
  returning ar.announcement_id, ar.reader_account, ar.read_at
  into announcement_id, reader_account, read_at;

  return next;
end;
$function$;

create or replace function public.get_admin_announcements(
  p_actor_account text,
  p_limit integer default 100
)
returns table(
  id uuid,
  title text,
  body text,
  target_account text,
  created_by text,
  created_at timestamptz,
  read_count bigint
)
language sql
security definer
set search_path to 'public'
as $function$
  select
    a.id,
    a.title,
    a.body,
    a.target_account,
    a.created_by,
    a.created_at,
    count(r.reader_account) as read_count
  from public.announcements a
  left join public.announcement_reads r on r.announcement_id = a.id
  where a.is_active = true
    and exists (
      select 1
      from public.investigators i
      where i.role = 'admin'
        and i.is_active = true
        and (
          lower(trim(coalesce(i.account, ''))) = lower(trim(coalesce(p_actor_account, '')))
          or lower(trim(coalesce(i.email, ''))) = lower(trim(coalesce(p_actor_account, '')))
        )
    )
  group by a.id
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 200));
$function$;

create or replace function public.create_announcement(
  p_actor_account text,
  p_title text,
  p_body text,
  p_target_account text default null
)
returns table(
  id uuid,
  title text,
  body text,
  target_account text,
  created_by text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor text := lower(trim(coalesce(p_actor_account, '')));
  v_title text := trim(coalesce(p_title, ''));
  v_body text := trim(coalesce(p_body, ''));
  v_target text := nullif(lower(trim(coalesce(p_target_account, ''))), '');
begin
  if not exists (
    select 1
    from public.investigators i
    where i.role = 'admin'
      and i.is_active = true
      and (
        lower(trim(coalesce(i.account, ''))) = v_actor
        or lower(trim(coalesce(i.email, ''))) = v_actor
      )
  ) then
    raise exception 'admin permission required';
  end if;

  if v_title = '' then
    raise exception 'announcement title is required';
  end if;

  if v_body = '' then
    raise exception 'announcement body is required';
  end if;

  insert into public.announcements (title, body, target_account, created_by)
  values (v_title, v_body, v_target, v_actor)
  returning announcements.id,
            announcements.title,
            announcements.body,
            announcements.target_account,
            announcements.created_by,
            announcements.created_at
  into id, title, body, target_account, created_by, created_at;

  return next;
end;
$function$;

revoke all on function public.get_visible_announcements(text, integer) from public, anon, authenticated;
revoke all on function public.mark_announcement_read(uuid, text) from public, anon, authenticated;
revoke all on function public.get_admin_announcements(text, integer) from public, anon, authenticated;
revoke all on function public.create_announcement(text, text, text, text) from public, anon, authenticated;

grant execute on function public.get_visible_announcements(text, integer) to service_role;
grant execute on function public.mark_announcement_read(uuid, text) to service_role;
grant execute on function public.get_admin_announcements(text, integer) to service_role;
grant execute on function public.create_announcement(text, text, text, text) to service_role;

commit;
