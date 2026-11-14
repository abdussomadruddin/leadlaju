-- Team Sales stale New reassignment runs once daily at 09:00 Asia/Kuala_Lumpur.
-- The setting counts calendar days: with N days, a lead received on day D that is
-- still New moves at 09:00 on day D+N. Agent-mode brands remain untouched.
create or replace function leadlaju_private.reassign_stale_team_sales_brand(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path='' as $$
declare bid uuid:=leadlaju_private.request_brand(); days integer; cutoff timestamptz; l public.leads; recipient uuid; last_agent uuid;
 aid uuid; new_revision bigint; n integer:=0;
begin
 select b.sales_reassign_days into days from public.brands b where b.id=bid and b.active and b.distribution_mode='team_sales';
 if days is null then return 0; end if;
 -- Received before local midnight starting day (today - days + 1).
 cutoff:=(((p_now at time zone 'Asia/Kuala_Lumpur')::date-days+1)::timestamp) at time zone 'Asia/Kuala_Lumpur';
 -- Same lock order as dispatch_team_sales: brand dispatch state, project cursor, lead.
 perform 1 from public.dispatch_state where brand_id=bid and singleton for update;
 for l in select * from public.leads where brand_id=bid and status='new' and queue_state='sales_assigned'
  and assigned_agent_id is not null and received_at<cutoff
  order by received_at,id limit 500 for update skip locked loop
  insert into public.project_dispatch_state(brand_id,project_id) values(bid,l.project_id) on conflict(project_id) do nothing;
  select sales_last_agent_id into last_agent from public.project_dispatch_state where project_id=l.project_id and brand_id=bid for update;
  recipient:=null;
  -- Never the member who missed it now; prefer members who never held this lead,
  -- then the project's normal round-robin order.
  select p.id into recipient from public.profiles p
   join public.agent_project_eligibility e on e.agent_id=p.id and e.brand_id=p.brand_id
   where p.brand_id=bid and e.project_id=l.project_id and p.role='agent' and p.active and p.approval_status='approved'
    and p.id<>l.assigned_agent_id
   order by exists(select 1 from public.lead_assignments la where la.lead_id=l.id and la.agent_id=p.id and la.assignment_mode='team_sales'),
    case when last_agent is null or p.id>last_agent then 0 else 1 end,p.id
   limit 1;
  continue when recipient is null; -- Only one member: leave the lead with its owner.
  new_revision:=l.assignment_revision+1;
  update public.lead_assignments set outcome='missed',resolved_at=p_now
   where lead_id=l.id and assignment_revision=l.assignment_revision and assignment_mode='team_sales' and outcome='pending';
  update public.notification_outbox set sent_at=p_now,claimed_at=null,last_error='Cancelled: Team Sales lead reassigned'
   where brand_id=bid and lead_id=l.id and assignment_revision=l.assignment_revision and sent_at is null;
  update public.leads set assigned_agent_id=recipient,received_at=p_now,assignment_revision=new_revision,updated_at=p_now
   where id=l.id and brand_id=bid;
  insert into public.lead_assignments(brand_id,lead_id,agent_id,assignment_revision,assigned_at,expires_at,assignment_mode)
   values(bid,l.id,recipient,new_revision,p_now,null,'team_sales') returning id into aid;
  insert into public.lead_events(brand_id,lead_id,assignment_id,event_type,assignment_revision,payload)
   values(bid,l.id,aid,'assigned',new_revision,jsonb_build_object('reason','sales_stale_reassign',
    'previous_owner',l.assigned_agent_id,'previous_received_at',l.received_at,'days',days));
  insert into public.notification_outbox(brand_id,user_id,lead_id,assignment_revision,notification_type,payload)
   values(bid,recipient,l.id,new_revision,'sales_new_lead',jsonb_build_object('lead_id',l.id,'assignment_revision',new_revision))
   on conflict do nothing;
  update public.project_dispatch_state set sales_last_agent_id=recipient,updated_at=p_now where project_id=l.project_id and brand_id=bid;
  perform realtime.send(jsonb_build_object('leadId',l.id,'brandId',bid,'revision',new_revision),
   'assignment_revoked','user:'||l.assigned_agent_id::text,true);
  n:=n+1;
 end loop;
 return n;
end $$;

create or replace function leadlaju_private.reassign_stale_team_sales() returns integer
language plpgsql security definer set search_path='' as $$
declare bid uuid; previous_brand text:=current_setting('leadlaju.worker_brand',true); total integer:=0; batch integer;
begin
 if auth.uid() is not null then raise exception 'Trusted scheduler required' using errcode='42501'; end if;
 for bid in select b.id from public.brands b where b.active and b.distribution_mode='team_sales' order by b.id loop
  perform set_config('leadlaju.worker_brand',bid::text,true);
  -- Daily run: drain the whole backlog (500 per batch) at 09:00.
  loop
   batch:=leadlaju_private.reassign_stale_team_sales_brand(clock_timestamp());
   total:=total+batch;
   exit when batch<500;
  end loop;
 end loop;
 perform set_config('leadlaju.worker_brand',coalesce(previous_brand,''),true);
 return total;
end $$;

-- pg_cron runs in UTC: 01:00 UTC is 09:00 Asia/Kuala_Lumpur (no DST).
select cron.schedule('leadlaju-team-sales-stale-reassign','0 1 * * *',
 'select leadlaju_private.reassign_stale_team_sales()');
