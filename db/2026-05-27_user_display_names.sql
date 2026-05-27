-- Surface investigator profile fields used for name-first UI display.

drop view if exists public.app_users_view;
drop function if exists public.login_investigator(text);
drop function if exists public.login_admin(text, text);

create function public.login_investigator(p_email text)
returns table(user_id uuid, account text, role text, name text, email text, phone text)
language sql
security definer
set search_path = public
as $$
    select i.id, i.account, i.role, i.name, i.email, i.phone
    from public.investigators i
    where lower(i.email) = lower(p_email)
      and i.role = 'user'
      and i.is_active = true
    limit 1;
$$;

create function public.login_admin(p_email text, p_password text)
returns table(user_id uuid, account text, role text, name text, email text, phone text)
language sql
security definer
set search_path = public
as $$
    select i.id, i.account, i.role, i.name, i.email, i.phone
    from public.investigators i
    where lower(i.email) = lower(p_email)
      and i.admin_password = p_password
      and i.role = 'admin'
      and i.is_active = true
    limit 1;
$$;

create view public.app_users_view as
select id, account, role, is_active, name, email, phone
from public.investigators;

grant execute on function public.login_investigator(text) to anon, authenticated;
grant execute on function public.login_admin(text, text) to anon, authenticated;
grant select on public.app_users_view to anon, authenticated;
