alter table public.brands add column follow_up_due_limit integer not null default 50 check(follow_up_due_limit between 1 and 100000);
alter table public.profiles add column follow_up_due_blocked boolean not null default false;
create index leads_agent_due_gate_idx on public.leads(brand_id,assigned_agent_id,follow_up_activity_at) where status='contacted';

grant create on schema public,leadlaju_private to leadlaju_tenant_executor;
create function leadlaju_private.refresh_agent_due_gate(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path='' as $$
declare bid uuid:=leadlaju_private.request_brand(); changed integer;
begin
 if bid is null or not exists(select 1 from public.brands where id=bid and active and distribution_mode='agent') then return 0; end if;
 perform 1 from public.dispatch_state where brand_id=bid for update;
 with counts as (
   select p.id,p.follow_up_due_blocked,b.follow_up_due_limit,count(l.id)::integer due_count
   from public.profiles p join public.brands b on b.id=p.brand_id
   left join public.leads l on l.brand_id=p.brand_id and l.assigned_agent_id=p.id
     and l.status='contacted' and l.follow_up_activity_at<=p_now-interval '24 hours'
   where p.brand_id=bid and p.role='agent'
   group by p.id,p.follow_up_due_blocked,b.follow_up_due_limit
 ), next_state as (
   select id,case when due_count=0 then false when due_count>follow_up_due_limit then true else follow_up_due_blocked end blocked from counts
 ) update public.profiles p set follow_up_due_blocked=n.blocked,updated_at=now()
 from next_state n where p.id=n.id and p.follow_up_due_blocked is distinct from n.blocked;
 get diagnostics changed=row_count;
 return changed;
end $$;
alter function leadlaju_private.refresh_agent_due_gate(timestamptz) owner to leadlaju_tenant_executor;
revoke all on function leadlaju_private.refresh_agent_due_gate(timestamptz) from public,anon,authenticated,service_role;
grant execute on function leadlaju_private.refresh_agent_due_gate(timestamptz) to leadlaju_tenant_executor;

create policy admin_due_limit_update on public.brands for update to leadlaju_tenant_executor
using(id=(select leadlaju_private.request_brand()) and distribution_mode='agent' and leadlaju_private.is_admin(auth.uid()))
with check(id=(select leadlaju_private.request_brand()) and distribution_mode='agent' and leadlaju_private.is_admin(auth.uid()));
create policy due_limit_audit on public.master_audit_log for insert to leadlaju_tenant_executor
with check(actor_id=auth.uid() and brand_id=(select leadlaju_private.request_brand()) and action='follow_up_due_limit');

create function public.admin_set_follow_up_due_limit(p_limit integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare bid uuid:=leadlaju_private.request_brand();
begin
 if auth.uid() is null or not leadlaju_private.is_admin(auth.uid()) then raise exception 'Admin required' using errcode='42501'; end if;
 if p_limit is null or p_limit<1 or p_limit>100000 then raise exception 'Had mesti 1 hingga 100000'; end if;
 perform 1 from public.dispatch_state where brand_id=bid for update;
 update public.brands set follow_up_due_limit=p_limit where id=bid and active and distribution_mode='agent';
 if not found then raise exception 'Active Agent brand required' using errcode='42501'; end if;
 perform leadlaju_private.refresh_agent_due_gate(now());
 insert into public.master_audit_log(actor_id,brand_id,action,target_id,details)
 values(auth.uid(),bid,'follow_up_due_limit',bid,jsonb_build_object('limit',p_limit));
 return jsonb_build_object('ok',true,'follow_up_due_limit',p_limit);
end $$;
alter function public.admin_set_follow_up_due_limit(integer) owner to leadlaju_tenant_executor;
revoke all on function public.admin_set_follow_up_due_limit(integer) from public,anon;
grant execute on function public.admin_set_follow_up_due_limit(integer) to authenticated;

alter function public.get_follow_up_due() rename to get_follow_up_due_base;
revoke all on function public.get_follow_up_due_base() from public,anon,authenticated;
grant execute on function public.get_follow_up_due_base() to leadlaju_tenant_executor;
create function public.get_follow_up_due() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; bid uuid; gates jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and active and approval_status='approved') then raise exception 'Active account required' using errcode='42501'; end if;
 bid:=leadlaju_private.request_brand();
 perform leadlaju_private.refresh_agent_due_gate(now());
 result:=public.get_follow_up_due_base();
 select jsonb_agg(jsonb_build_object('id',p.id,'blocked',p.follow_up_due_blocked,'due_count',
   (select count(*) from public.leads l where l.brand_id=bid and l.assigned_agent_id=p.id and l.status='contacted' and l.follow_up_activity_at<=now()-interval '24 hours')))
 into gates from public.profiles p where p.brand_id=bid and p.role='agent' and (p.id=auth.uid() or leadlaju_private.is_admin(auth.uid()));
 return result||jsonb_build_object('follow_up_due_limit',(select follow_up_due_limit from public.brands where id=bid),'gate_profiles',coalesce(gates,'[]'::jsonb));
end $$;
alter function public.get_follow_up_due() owner to leadlaju_tenant_executor;
revoke all on function public.get_follow_up_due() from public,anon;
grant execute on function public.get_follow_up_due() to authenticated;

-- Existing scheduler sweeps brands; dispatch and GET LEAD also check synchronously.
create function leadlaju_private.sweep_agent_due_gate() returns integer
language plpgsql security definer set search_path='' as $$
declare b uuid; total integer:=0; previous text:=current_setting('leadlaju.worker_brand',true);
begin
 if auth.uid() is not null or coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'='service_role' then raise exception 'Trusted scheduler required' using errcode='42501'; end if;
 for b in select id from public.brands where active and distribution_mode='agent' order by id loop
   perform set_config('leadlaju.worker_brand',b::text,true);
   total:=total+leadlaju_private.refresh_agent_due_gate(now());
 end loop;
 perform set_config('leadlaju.worker_brand',coalesce(previous,''),true);
 return total;
end $$;
revoke all on function leadlaju_private.sweep_agent_due_gate() from public,anon,authenticated,service_role;
select cron.schedule('leadlaju-agent-due-gate','* * * * *','select leadlaju_private.sweep_agent_due_gate()');

do $$
declare definition text; signature text;
begin
 definition:=pg_get_functiondef('public.get_dashboard_state()'::regprocedure);
 execute replace(definition,'''get_lead_allowed'', p.get_lead_allowed','''follow_up_due_blocked'', p.follow_up_due_blocked, ''get_lead_allowed'', p.get_lead_allowed');
 definition:=pg_get_functiondef('leadlaju_private.dispatch_available_leads_agent_brand(timestamptz)'::regprocedure);
 if position('p.active and p.get_lead_allowed' in definition)=0 then raise exception 'Agent dispatch shape changed'; end if;
 definition:=replace(definition,'p.active and p.get_lead_allowed','p.active and p.get_lead_allowed and not p.follow_up_due_blocked');
 execute replace(definition,E'begin\n',E'begin\n  perform leadlaju_private.refresh_agent_due_gate(p_now);\n');
 foreach signature in array array['public.set_agent_availability(boolean,boolean)','public.admin_set_agent_lead_readiness(uuid,boolean)','public.admin_set_all_agent_lead_readiness(boolean)'] loop
   definition:=pg_get_functiondef(signature::regprocedure);
   definition:=replace(definition,E'begin\n',E'begin\n  perform leadlaju_private.refresh_agent_due_gate(now());\n');
   if signature='public.set_agent_availability(boolean,boolean)' then
     definition:=replace(definition,'if p_ready and exists(select 1 from public.profiles where id=v_user and not get_lead_allowed)',
       'if p_ready and exists(select 1 from public.profiles where id=v_user and follow_up_due_blocked) then return jsonb_build_object(''ok'',false,''blocked'',true,''error'',''Selesaikan semua Follow Up Due sebelum GET LEAD.''); end if; if p_ready and exists(select 1 from public.profiles where id=v_user and not get_lead_allowed)');
   elsif signature='public.admin_set_agent_lead_readiness(uuid,boolean)' then
     definition:=replace(definition,'if p_ready and not v_agent.get_lead_allowed',
       'if p_ready and v_agent.follow_up_due_blocked then return jsonb_build_object(''ok'',false,''error'',''Selesaikan semua Follow Up Due sebelum GET LEAD.''); end if; if p_ready and not v_agent.get_lead_allowed');
   else
     definition:=replace(definition,'and p.active and p.get_lead_allowed','and p.active and p.get_lead_allowed and not p.follow_up_due_blocked');
   end if;
   execute definition;
 end loop;
 definition:=pg_get_functiondef('public.record_lead_follow_up(uuid,integer)'::regprocedure);
 if position('set follow_up_count = v_next_count,' in definition)=0 then raise exception 'Follow Up action shape changed'; end if;
 execute replace(definition,'set follow_up_count = v_next_count,',
   'set follow_up_count = v_next_count, follow_up_activity_at = case when status=''contacted'' and exists(select 1 from public.brands where id=v_lead.brand_id and distribution_mode=''agent'') then now() else follow_up_activity_at end,');
end $$;
revoke create on schema public,leadlaju_private from leadlaju_tenant_executor;
