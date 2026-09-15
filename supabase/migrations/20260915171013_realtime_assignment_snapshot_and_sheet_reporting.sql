create or replace function leadlaju_private.broadcast_assignment_snapshot()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_project_name text;
begin
  if new.status <> 'new' or new.queue_state <> 'active' or new.assigned_agent_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.assigned_agent_id is not distinct from new.assigned_agent_id
    and old.assignment_revision = new.assignment_revision
    and old.queue_state = new.queue_state and old.status = new.status then
    return new;
  end if;

  select name into v_project_name from public.projects where id = new.project_id;
  perform realtime.send(
    jsonb_build_object(
      'leadSnapshot', to_jsonb(new) || jsonb_build_object('project', coalesce(v_project_name, ''))
    ),
    'assignment_snapshot',
    'user:' || new.assigned_agent_id::text,
    true
  );
  return new;
end;
$$;

drop trigger if exists leads_assignment_snapshot_broadcast on public.leads;
create trigger leads_assignment_snapshot_broadcast
after insert or update of assigned_agent_id, assignment_revision, queue_state, status on public.leads
for each row execute function leadlaju_private.broadcast_assignment_snapshot();

create table if not exists public.report_export_runs (
  id bigint generated always as identity primary key,
  state text not null check (state in ('sent', 'failed')),
  row_counts jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now()
);
alter table public.report_export_runs enable row level security;

create or replace function public.get_sheet_reporting_snapshot()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  return jsonb_build_object(
    'generatedAt', now(),
    'leads', coalesce((select jsonb_agg(jsonb_build_object(
      'id', l.id, 'sourceLeadId', l.source_lead_id, 'createdAt', l.created_at,
      'name', l.name, 'phone', l.phone, 'email', l.email, 'city', l.city,
      'project', pr.name, 'source', l.source, 'status', l.status, 'queueState', l.queue_state,
      'assignedAgent', ap.name, 'assignedAgentEmail', ap.email,
      'receivedAt', l.received_at, 'expiresAt', l.expires_at,
      'assignmentRevision', l.assignment_revision, 'statusRevision', l.status_revision,
      'passCount', l.pass_count, 'contactedAt', l.contacted_at, 'notes', l.notes,
      'updatedAt', l.updated_at
    ) order by l.created_at desc) from public.leads l
      join public.projects pr on pr.id = l.project_id
      left join public.profiles ap on ap.id = l.assigned_agent_id), '[]'::jsonb),
    'agents', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'phone', p.phone, 'email', p.email, 'role', p.role,
      'active', p.active, 'approvalStatus', p.approval_status, 'leadReady', av.lead_ready,
      'notificationReady', av.notification_ready, 'lastSeenAt', av.last_seen_at,
      'presenceLeaseUntil', av.presence_lease_until, 'leadsHandled', p.leads_handled,
      'createdAt', p.created_at
    ) order by p.created_at) from public.profiles p
      left join public.agent_availability av on av.agent_id = p.id), '[]'::jsonb),
    'projects', coalesce((select jsonb_agg(jsonb_build_object(
      'id', pr.id, 'name', pr.name, 'active', pr.active, 'createdAt', pr.created_at
    ) order by pr.created_at) from public.projects pr), '[]'::jsonb),
    'appointments', coalesce((select jsonb_agg(jsonb_build_object(
      'id', a.id, 'leadId', a.lead_id, 'leadName', l.name, 'project', pr.name,
      'assignedAgent', p.name, 'type', a.type, 'scheduledAt', a.scheduled_at,
      'location', a.location, 'notes', a.notes, 'status', a.status, 'updatedAt', a.updated_at
    ) order by a.scheduled_at) from public.appointments a
      join public.leads l on l.id = a.lead_id join public.projects pr on pr.id = l.project_id
      left join public.profiles p on p.id = a.assigned_agent_id), '[]'::jsonb),
    'reminders', coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'message', r.message, 'target', r.target, 'createdBy', p.name, 'createdAt', r.created_at
    ) order by r.created_at desc) from public.reminders r
      left join public.profiles p on p.id = r.created_by_id), '[]'::jsonb)
  );
end;
$$;

revoke all on table public.report_export_runs from public, anon, authenticated;
revoke all on function public.get_sheet_reporting_snapshot() from public, anon, authenticated;
grant execute on function public.get_sheet_reporting_snapshot() to service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'leadlaju-export-sheet-report';
select cron.schedule(
  'leadlaju-export-sheet-report', '* * * * *',
  $$select net.http_post(
    url := 'https://zvplvrtqvsfrftnjfdsh.supabase.co/functions/v1/export-sheet-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-LeadLaju-Worker', (select decrypted_secret from vault.decrypted_secrets where name = 'notification_worker_secret')
    ),
    body := jsonb_build_object(
      'sheet_endpoint', 'https://script.google.com/macros/s/AKfycbx4enThtoL_ryvBEulDU-yIkm9OoJUusJpT9BqVdaeT-OQ3gTjmb-eENA-aZHf6qtI/exec',
      'report_token', (select decrypted_secret from vault.decrypted_secrets where name = 'leadlaju_report_export_secret')
    ),
    timeout_milliseconds := 30000
  )$$
);
