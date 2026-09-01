begin;

do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.update_investigator_profile(uuid,text,text,text,text,text,text,text,text,text,text,text,text)'::regprocedure
  )
    into v_definition;

  v_definition := replace(
    v_definition,
    '    select ma.task_id, ma.new_investigator, ma.assigned_by, ma.assigned_at, ma.is_active
    from mapped_assignments
    where nullif(trim(new_investigator), '''') is not null
      and new_investigator <> old_investigator',
    '    select ma.task_id, ma.new_investigator, ma.assigned_by, ma.assigned_at, ma.is_active
    from mapped_assignments ma
    where nullif(trim(ma.new_investigator), '''') is not null
      and ma.new_investigator <> ma.old_investigator'
  );

  if position('from mapped_assignments ma' in v_definition) = 0 then
    raise exception 'expected mapped_assignments alias was not found';
  end if;

  execute v_definition;
end;
$migration$;

revoke all on function public.update_investigator_profile(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text
) from public;
revoke all on function public.update_investigator_profile(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text
) from anon;
revoke all on function public.update_investigator_profile(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text
) from authenticated;
grant execute on function public.update_investigator_profile(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text
) to service_role;

commit;
