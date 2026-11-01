-- Retain API signatures, owner, grants, cooldown and tenant RLS.
do $migration$
declare d text; marker text;
begin
 d:=pg_get_functiondef('public.contact_assignment(uuid,uuid,bigint)'::regprocedure);
 marker:='  select result into v_result from public.action_requests where action_id = p_action_id;';
 if position(marker in d)=0 then raise exception 'Unexpected contact definition'; end if;
 d:=replace(d,marker,$guard$  if p_action_id is null or p_lead_id is null or p_assignment_revision is null then
    return jsonb_build_object('ok',false,'stale',true,'error','Invalid contact action');
  end if;
  -- Lock the canonical lead BEFORE inserting its FK-backed action. A concurrent
  -- deletion/reassignment cannot invalidate it between validation and mutation.
  select * into v_lead from public.leads where id=p_lead_id for update;
  if not found or v_lead.assigned_agent_id is distinct from v_user then
    raise exception 'Lead access denied' using errcode='42501';
  end if;
  if v_lead.assignment_revision is distinct from p_assignment_revision then
    return jsonb_build_object('ok',false,'stale',true,'error','Assignment is no longer active');
  end if;
$guard$||marker);
 -- A replay must belong to this caller, lead, revision and action kind.
 d:=replace(d,marker,marker||$identity$
  if found and not exists(select 1 from public.action_requests where action_id=p_action_id
    and actor_id=v_user and lead_id=p_lead_id and assignment_revision=p_assignment_revision
    and action_type='contacted') then
    return jsonb_build_object('ok',false,'stale',true,'error','Action identity conflict');
  end if;
$identity$);
 d:=replace(d,'  select * into v_lead from public.leads where id = p_lead_id for update;', '');
 execute d;
end $migration$;

-- The previous cursor only wrapped on an EMPTY page. A busy cron continuously
-- appends rows, so cleanup chased the live tail forever and never revisited old
-- successes after they aged past retention. Wrap when the scanned tail is reached.
do $migration$
declare d text; marker text;
begin
 d:=pg_get_functiondef('leadlaju_private.prune_completed_cron_logs()'::regprocedure);
 marker:='case when count(*)=1000 then max(runid) else (select max(runid) from scanned) end';
 if position(marker in d)=0 then raise exception 'Unexpected retention definition'; end if;
 execute replace(d,marker,$wrap$case when count(*)=1000 then max(runid)
    when (select count(*) from scanned)<2000 then 0
    else (select max(runid) from scanned) end$wrap$);
end $migration$;

-- Read the same tenant-scoped visible leads once for history and projection.
do $migration$
declare d text; original_query text; candidate_query text;
begin
 d:=pg_get_functiondef('public.get_dashboard_state()'::regprocedure);
 if position('with assignment_histories as materialized (' in d)=0
   or position('join public.leads visible on visible.id=la.lead_id' in d)=0 then
   raise exception 'Unexpected dashboard definition';
 end if;
 original_query:=substring(d from position('  with assignment_histories' in d));
 original_query:=split_part(original_query,' into v_result;',1)||' into v_result;';
 d:=replace(d,'with assignment_histories as materialized (',$cte$with visible_leads as materialized (
    select * from public.leads where v_is_admin or assigned_agent_id=v_user
  ), assignment_histories as materialized ($cte$);
 d:=replace(d,'join public.leads visible on visible.id=la.lead_id','join visible_leads visible on visible.id=la.lead_id');
 d:=replace(d,'from public.leads l join public.projects pr on pr.id=l.project_id left join assignment_histories',
  'from visible_leads l join public.projects pr on pr.id=l.project_id left join assignment_histories');
 candidate_query:=substring(d from position('  with visible_leads' in d));
 candidate_query:=split_part(candidate_query,' into v_result;',1)||' into v_result;';
 -- Keep the original plan for agent-sized reads: materialization only helps the
 -- large admin/Master snapshot, as measured on both live brands.
 d:=replace(d,candidate_query,'  if v_is_admin then '||candidate_query||
   ' else '||original_query||' end if;');
 execute d;
end $migration$;
