begin;

create or replace function public.change_admin_password(
  p_actor_account text,
  p_new_password text
)
returns table(
  id uuid,
  account text,
  role text,
  email text,
  name text
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor_account text := lower(trim(coalesce(p_actor_account, '')));
  v_new_password text := coalesce(p_new_password, '');
begin
  if v_actor_account = '' then
    raise exception 'admin account is required';
  end if;

  if length(v_new_password) < 8 then
    raise exception 'new password must be at least 8 characters';
  end if;

  update public.investigators i
  set password = v_new_password
  where i.role = 'admin'
    and i.is_active = true
    and (
      lower(trim(coalesce(i.account, ''))) = v_actor_account
      or lower(trim(coalesce(i.email, ''))) = v_actor_account
    )
  returning i.id, i.account, i.role, i.email, i.name
  into id, account, role, email, name;

  if id is null then
    raise exception 'active admin account not found';
  end if;

  return next;
end;
$function$;

revoke all on function public.change_admin_password(text, text) from public;
revoke all on function public.change_admin_password(text, text) from anon;
revoke all on function public.change_admin_password(text, text) from authenticated;
grant execute on function public.change_admin_password(text, text) to service_role;

commit;
