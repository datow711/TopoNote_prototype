begin;

alter table public.investigators
  add column if not exists auth_login_email text;

comment on column public.investigators.auth_login_email is
  'The Auth email used for login when the legacy account identifier is not itself an email.';

create unique index if not exists investigators_auth_login_email_uidx
  on public.investigators (lower(btrim(auth_login_email)))
  where auth_login_email is not null
    and btrim(auth_login_email) <> '';

commit;
