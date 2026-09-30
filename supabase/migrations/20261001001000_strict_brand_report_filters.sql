-- Foreign-brand filter IDs must be rejected, not treated as an empty report.
do $$ declare definition text; anchor text:='  v_admin := leadlaju_private.is_admin(v_user);'; begin
 definition:=pg_get_functiondef('public.get_agent_performance_report(date,date,uuid,uuid)'::regprocedure);
 if strpos(definition,anchor)=0 then raise exception 'Performance authorization anchor missing'; end if;
 definition:=replace(definition,anchor,anchor||$guard$
  if p_project_id is not null and not exists(select 1 from public.projects where id=p_project_id and brand_id=leadlaju_private.request_brand()) then
    raise exception 'Project is not available in this brand' using errcode='42501';
  end if;
  if p_agent_id is not null and not exists(select 1 from public.profiles where id=p_agent_id and role='agent' and brand_id=leadlaju_private.request_brand()) then
    raise exception 'Agent is not available in this brand' using errcode='42501';
  end if;
$guard$);
 execute definition;
end $$;
