-- Changing the threshold resets its old latch; ordinary activity still requires zero.
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('public.admin_set_follow_up_due_limit(integer)'::regprocedure);
 if position('declare bid uuid:=leadlaju_private.request_brand();' in definition)=0 then raise exception 'Limit RPC shape changed'; end if;
 definition:=replace(definition,'declare bid uuid:=leadlaju_private.request_brand();','declare bid uuid:=leadlaju_private.request_brand(); old_limit integer;');
 definition:=replace(definition,'update public.brands set follow_up_due_limit=p_limit','select follow_up_due_limit into old_limit from public.brands where id=bid; update public.brands set follow_up_due_limit=p_limit');
 definition:=replace(definition,'perform leadlaju_private.refresh_agent_due_gate(now());','if old_limit is distinct from p_limit then update public.profiles set follow_up_due_blocked=false,updated_at=now() where brand_id=bid and role=''agent'' and follow_up_due_blocked; end if; perform leadlaju_private.refresh_agent_due_gate(now());');
 execute definition;
end $$;
-- Repair stale blocks after the administrator has already raised the threshold.
do $$
declare bid uuid;
begin
 for bid in select id from public.brands where distribution_mode='agent' order by id loop
   perform 1 from public.dispatch_state where brand_id=bid for update;
   update public.profiles p set follow_up_due_blocked=false,updated_at=now()
   from public.brands b
   where p.brand_id=bid and b.id=bid and p.role='agent' and p.follow_up_due_blocked
     and (select count(*) from public.leads l where l.brand_id=bid and l.assigned_agent_id=p.id
       and l.status='contacted' and l.follow_up_activity_at<=now()-interval '24 hours')<=b.follow_up_due_limit;
 end loop;
end $$;
