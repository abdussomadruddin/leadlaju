-- Keep dashboard callers and RLS ownership unchanged; trim only unused fields.
do $$ declare d text; projection text; begin
 select pg_get_functiondef('public.get_dashboard_state()'::regprocedure) into d;
 if position('to_jsonb(l)' in d)=0 then raise exception 'Unexpected dashboard shape'; end if;
 projection:=$projection$jsonb_build_object(
 'id',l.id,'brand_id',l.brand_id,'name',l.name,'phone',l.phone,'email',l.email,
 'source',l.source,'created_at',l.created_at,'updated_at',l.updated_at,
 'received_at',l.received_at,'assigned_agent_id',l.assigned_agent_id,'expires_at',l.expires_at,
 'status',l.status,'pass_count',l.pass_count,'assignment_revision',l.assignment_revision,
 'status_revision',l.status_revision,'queue_state',l.queue_state,'response_ms',l.response_ms,
 'contacted_at',l.contacted_at,'follow_up_activity_at',l.follow_up_activity_at,
 'follow_up_count',l.follow_up_count,'notes',l.notes)$projection$;
 execute replace(d,'to_jsonb(l)',projection);
end $$;

-- Keep the same five-second recovery schedule and immediate new-lead trigger.
-- EXISTS mirrors claim eligibility; it never marks, claims or consumes a row.
do $$ declare j record; guarded text; claim_definition text; begin
 select lower(pg_get_functiondef('public.claim_notification_outbox(integer)'::regprocedure)) into claim_definition;
 if claim_definition not like '%n.sent_at is null%' or claim_definition not like '%n.available_at<=now()%'
  or claim_definition not like '%n.claimed_at<now()-interval ''2 minutes''%' then
  raise exception 'Claim eligibility changed; review idle-worker guard';
 end if;
 select * into strict j from cron.job where jobname='leadlaju-process-notification-outbox';
 if j.command not ilike '%select net.http_post(%' or j.command ilike '%where exists%' then
  raise exception 'Unexpected notification cron command';
 end if;
 guarded:=regexp_replace(trim(j.command),';\s*$','') || $guard$
 where exists(select 1 from public.notification_outbox n where n.sent_at is null
 and n.available_at<=now() and (n.claimed_at is null or n.claimed_at<now()-interval '2 minutes'))
 $guard$;
 perform cron.schedule(j.jobname,j.schedule,guarded);
end $$;
