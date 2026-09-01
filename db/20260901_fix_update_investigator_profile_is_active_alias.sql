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
    '    select task_id, new_investigator, assigned_by, assigned_at, is_active',
    '    select ma.task_id, ma.new_investigator, ma.assigned_by, ma.assigned_at, ma.is_active'
  );

  if position('select ma.task_id, ma.new_investigator, ma.assigned_by, ma.assigned_at, ma.is_active' in v_definition) = 0 then
    raise exception 'expected update_investigator_profile CTE projection was not found';
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
