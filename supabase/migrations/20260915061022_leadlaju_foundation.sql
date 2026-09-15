create extension if not exists pgcrypto;

create type public.leadlaju_role as enum ('admin', 'agent');
create type public.leadlaju_approval_status as enum ('pending', 'approved', 'rejected');
create type public.leadlaju_lead_status as enum (
  'new', 'contacted', 'passed', 'all_offer_presented', 'need_follow_up',
  'potential', 'rejected', 'cancelled', 'client'
);
create type public.leadlaju_queue_state as enum (
  'queued', 'active', 'contacted', 'passed', 'all_offer_presented',
  'need_follow_up', 'potential', 'rejected', 'cancelled', 'client'
);
create type public.leadlaju_assignment_outcome as enum (
  'pending', 'contacted', 'missed', 'passed', 'all_offer_presented',
  'need_follow_up', 'potential', 'rejected', 'cancelled', 'client'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  phone text not null default '',
  email text not null,
  role public.leadlaju_role not null default 'agent',
  approval_status public.leadlaju_approval_status not null default 'pending',
  active boolean not null default false,
  leads_handled integer not null default 0 check (leads_handled >= 0),
  cooldown_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_email_unique on public.profiles (lower(email));

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  source_project_id text unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index projects_name_unique on public.projects (lower(name));

create table public.agent_project_eligibility (
  agent_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (agent_id, project_id)
);

create table public.agent_availability (
  agent_id uuid primary key references public.profiles(id) on delete cascade,
  lead_ready boolean not null default false,
  notification_ready boolean not null default false,
  last_seen_at timestamptz,
  presence_lease_until timestamptz,
  presence_revision bigint not null default 0 check (presence_revision >= 0),
  forced_offline_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.dispatch_state (
  singleton boolean primary key default true check (singleton),
  queue_cycle bigint not null default 0 check (queue_cycle >= 0),
  pick_latest_next boolean not null default false,
  dispatcher_version text not null default 'sheet-v1',
  updated_at timestamptz not null default now()
);
insert into public.dispatch_state (singleton) values (true);

create table public.project_dispatch_state (
  project_id uuid primary key references public.projects(id) on delete cascade,
  round_robin_cursor integer not null default 0 check (round_robin_cursor >= 0),
  updated_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  source_system text not null default 'google_sheet',
  source_lead_id text,
  ingestion_fingerprint text not null,
  name text not null,
  phone text not null,
  email text not null default '',
  city text not null default '',
  project_id uuid not null references public.projects(id),
  source text not null default 'Manual Lead',
  notes text not null default '',
  status public.leadlaju_lead_status not null default 'new',
  queue_state public.leadlaju_queue_state not null default 'queued',
  assigned_agent_id uuid references public.profiles(id),
  received_at timestamptz,
  expires_at timestamptz,
  queued_at timestamptz default now(),
  pass_count integer not null default 0 check (pass_count >= 0),
  retry_after_cycle bigint not null default 0 check (retry_after_cycle >= 0),
  assignment_revision bigint not null default 0 check (assignment_revision >= 0),
  status_revision bigint not null default 0 check (status_revision >= 0),
  status_updated_at timestamptz not null default now(),
  contacted_at timestamptz,
  response_ms bigint check (response_ms is null or response_ms >= 0),
  created_at timestamptz not null,
  ingested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_runtime_shape check (
    (queue_state = 'active' and status = 'new' and assigned_agent_id is not null and received_at is not null and expires_at is not null)
    or queue_state <> 'active'
  )
);
alter table public.leads add constraint leads_source_identity_unique
  unique (source_system, source_lead_id);
create unique index leads_ingestion_fingerprint_unique on public.leads (source_system, ingestion_fingerprint)
  where source_lead_id is null;
create unique index one_active_lead_per_agent on public.leads (assigned_agent_id)
  where status = 'new' and queue_state = 'active';

create table public.lead_assignments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  agent_id uuid not null references public.profiles(id),
  assignment_revision bigint not null,
  assigned_at timestamptz not null,
  expires_at timestamptz not null,
  resolved_at timestamptz,
  outcome public.leadlaju_assignment_outcome not null default 'pending',
  retry_cycle bigint not null default 0,
  created_at timestamptz not null default now(),
  unique (lead_id, assignment_revision)
);
create unique index one_pending_assignment_per_lead on public.lead_assignments (lead_id)
  where outcome = 'pending';
create unique index one_pending_assignment_per_agent on public.lead_assignments (agent_id)
  where outcome = 'pending';

create table public.lead_events (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.leads(id) on delete cascade,
  assignment_id uuid references public.lead_assignments(id),
  actor_id uuid references public.profiles(id),
  event_type text not null,
  assignment_revision bigint not null default 0,
  status_revision bigint not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  source_appointment_id text unique,
  lead_id uuid not null references public.leads(id) on delete cascade,
  type text not null,
  scheduled_at timestamptz not null,
  location text not null default '',
  notes text not null default '',
  status text not null check (status in ('scheduled', 'show_up', 'no_show', 'reschedule')),
  assigned_agent_id uuid references public.profiles(id),
  parent_appointment_id uuid references public.appointments(id),
  reminder_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  created_by_id uuid references public.profiles(id),
  target text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  active boolean not null default true,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notification_outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  assignment_revision bigint,
  notification_type text not null,
  payload jsonb not null,
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  unique (user_id, lead_id, assignment_revision, notification_type)
);

create table public.action_requests (
  action_id uuid primary key,
  actor_id uuid not null references public.profiles(id),
  lead_id uuid not null references public.leads(id),
  assignment_revision bigint not null,
  action_type text not null,
  state text not null default 'received' check (state in ('received', 'accepted', 'rejected')),
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (lead_id, assignment_revision, action_type)
);

create table public.ingestion_api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_digest text not null unique,
  active boolean not null default true,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.ingestion_events (
  ingestion_key text primary key,
  source_system text not null,
  source_lead_id text,
  payload_hash text not null,
  lead_id uuid references public.leads(id),
  state text not null check (state in ('processing', 'inserted', 'duplicate', 'failed')),
  attempts integer not null default 1,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.report_export_jobs (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.leads(id) on delete cascade,
  export_revision bigint not null,
  payload jsonb not null,
  state text not null default 'pending' check (state in ('pending', 'sent', 'failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  unique (lead_id, export_revision)
);

create schema if not exists leadlaju_private;
revoke all on schema leadlaju_private from public, anon, authenticated;

create or replace function leadlaju_private.is_admin(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = p_user_id and role = 'admin' and active and approval_status = 'approved'
  );
$$;

create or replace function leadlaju_private.dispatch_available_leads(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_state public.dispatch_state%rowtype;
  v_lead public.leads%rowtype;
  v_agent_id uuid;
  v_assignment_id uuid;
  v_assigned integer := 0;
  v_cursor integer;
  v_agent_count integer;
begin
  select * into v_state from public.dispatch_state where singleton for update;

  for v_lead in
    with ranked as (
      select l.id, case when l.pass_count = 0 then 0 else 1 end as queue_group,
        row_number() over (
          partition by (l.pass_count = 0)
          order by case when l.pass_count = 0 then l.created_at else l.queued_at end, l.id
        ) as ascending_position,
        count(*) over (partition by (l.pass_count = 0)) as group_size
      from public.leads l where l.status = 'new' and l.queue_state = 'queued'
    ), ordered as (
      select ranked.id, ranked.queue_group,
        case when not v_state.pick_latest_next then
          case when ascending_position <= (group_size + 1) / 2
            then ascending_position * 2 - 1 else (group_size - ascending_position + 1) * 2 end
        else
          case when ascending_position > group_size / 2
            then (group_size - ascending_position + 1) * 2 - 1 else ascending_position * 2 end
        end as edge_position
      from ranked
    )
    select l.* from ordered o join public.leads l on l.id = o.id
    order by o.queue_group, o.edge_position
    for update of l skip locked
  loop
    select count(*) into v_agent_count
    from public.profiles p
    join public.agent_availability av on av.agent_id = p.id
    join public.agent_project_eligibility ape on ape.agent_id = p.id and ape.project_id = v_lead.project_id
    where p.role = 'agent' and p.active and p.approval_status = 'approved'
      and av.lead_ready and av.notification_ready
      and av.presence_lease_until > p_now
      and (p.cooldown_until is null or p.cooldown_until <= p_now)
      and not exists (
        select 1 from public.leads occupied
        where occupied.assigned_agent_id = p.id and occupied.status = 'new' and occupied.queue_state = 'active'
      )
      and (
        v_lead.pass_count = 0 or not exists (
          select 1 from public.lead_assignments previous
          where previous.lead_id = v_lead.id and previous.agent_id = p.id
            and previous.outcome = 'missed' and previous.retry_cycle = v_state.queue_cycle
        )
      );
    if v_agent_count = 0 or v_lead.retry_after_cycle > v_state.queue_cycle then continue; end if;

    select coalesce(pds.round_robin_cursor, 0) into v_cursor
    from public.projects pr
    left join public.project_dispatch_state pds on pds.project_id = pr.id
    where pr.id = v_lead.project_id;

    select candidate.id into v_agent_id
    from (
      select p.id, row_number() over (order by p.created_at, p.id) - 1 as position
      from public.profiles p
      join public.agent_availability av on av.agent_id = p.id
      join public.agent_project_eligibility ape on ape.agent_id = p.id and ape.project_id = v_lead.project_id
      where p.role = 'agent' and p.active and p.approval_status = 'approved'
        and av.lead_ready and av.notification_ready and av.presence_lease_until > p_now
        and (p.cooldown_until is null or p.cooldown_until <= p_now)
        and not exists (
          select 1 from public.leads occupied where occupied.assigned_agent_id = p.id
            and occupied.status = 'new' and occupied.queue_state = 'active'
        )
        and (v_lead.pass_count = 0 or not exists (
          select 1 from public.lead_assignments previous where previous.lead_id = v_lead.id
            and previous.agent_id = p.id and previous.outcome = 'missed'
            and previous.retry_cycle = v_state.queue_cycle
        ))
    ) candidate
    order by mod(candidate.position - v_cursor + v_agent_count, v_agent_count)
    limit 1;
    if v_agent_id is null then continue; end if;

    if v_lead.pass_count = 0 then v_state.queue_cycle := v_state.queue_cycle + 1; end if;
    update public.leads set
      assigned_agent_id = v_agent_id, received_at = p_now, expires_at = p_now + interval '5 minutes',
      queued_at = null, queue_state = 'active', assignment_revision = assignment_revision + 1,
      updated_at = p_now
    where id = v_lead.id
    returning assignment_revision into v_lead.assignment_revision;

    insert into public.lead_assignments (
      lead_id, agent_id, assignment_revision, assigned_at, expires_at, retry_cycle
    ) values (
      v_lead.id, v_agent_id, v_lead.assignment_revision, p_now, p_now + interval '5 minutes',
      case when v_lead.pass_count > 0 then v_state.queue_cycle else 0 end
    ) returning id into v_assignment_id;

    insert into public.lead_events (lead_id, assignment_id, event_type, assignment_revision)
    values (v_lead.id, v_assignment_id, 'assigned', v_lead.assignment_revision);

    insert into public.notification_outbox (
      user_id, lead_id, assignment_revision, notification_type, payload
    ) values (
      v_agent_id, v_lead.id, v_lead.assignment_revision, 'new_lead',
      jsonb_build_object('lead_id', v_lead.id, 'assignment_revision', v_lead.assignment_revision)
    ) on conflict do nothing;

    insert into public.project_dispatch_state (project_id, round_robin_cursor, updated_at)
    values (v_lead.project_id, mod(v_cursor + 1, greatest(v_agent_count, 1)), p_now)
    on conflict (project_id) do update set
      round_robin_cursor = excluded.round_robin_cursor, updated_at = excluded.updated_at;
    v_state.pick_latest_next := not v_state.pick_latest_next;
    v_assigned := v_assigned + 1;
  end loop;

  update public.dispatch_state set queue_cycle = v_state.queue_cycle,
    pick_latest_next = v_state.pick_latest_next, updated_at = p_now where singleton;
  return v_assigned;
end;
$$;

create or replace function public.ingest_lead(
  p_ingestion_key text, p_source_system text, p_source_lead_id text,
  p_name text, p_phone text, p_email text, p_city text, p_project_name text,
  p_source text, p_notes text, p_created_at timestamptz, p_payload_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_project_id uuid; v_lead_id uuid; v_inserted boolean := false;
begin
  if coalesce(trim(p_ingestion_key), '') = '' or coalesce(trim(p_name), '') = ''
    or coalesce(trim(p_phone), '') = '' or coalesce(trim(p_project_name), '') = '' then
    raise exception 'Invalid ingestion payload';
  end if;
  insert into public.ingestion_events (ingestion_key, source_system, source_lead_id, payload_hash, state)
  values (p_ingestion_key, p_source_system, nullif(trim(p_source_lead_id), ''), p_payload_hash, 'processing')
  on conflict (ingestion_key) do update set attempts = public.ingestion_events.attempts + 1, updated_at = now();
  select id into v_project_id from public.projects where active and lower(name) = lower(trim(p_project_name));
  if v_project_id is null then raise exception 'Project is not active or does not exist'; end if;
  insert into public.leads (
    source_system, source_lead_id, ingestion_fingerprint, name, phone, email, city,
    project_id, source, notes, created_at
  ) values (
    p_source_system, nullif(trim(p_source_lead_id), ''), p_payload_hash, trim(p_name), trim(p_phone),
    coalesce(trim(p_email), ''), coalesce(trim(p_city), ''), v_project_id,
    coalesce(nullif(trim(p_source), ''), 'Manual Lead'), coalesce(p_notes, ''), p_created_at
  ) on conflict do nothing returning id into v_lead_id;
  v_inserted := v_lead_id is not null;
  if not v_inserted then
    select id into v_lead_id from public.leads where source_system = p_source_system and (
      (p_source_lead_id is not null and source_lead_id = p_source_lead_id) or ingestion_fingerprint = p_payload_hash
    ) limit 1;
  end if;
  update public.ingestion_events set lead_id = v_lead_id,
    state = case when v_inserted then 'inserted' else 'duplicate' end, updated_at = now()
  where ingestion_key = p_ingestion_key;
  if v_inserted then
    insert into public.lead_events (lead_id, event_type) values (v_lead_id, 'ingested');
    perform leadlaju_private.dispatch_available_leads(now());
  end if;
  return jsonb_build_object('ok', true, 'lead_id', v_lead_id,
    'result', case when v_inserted then 'inserted' else 'duplicate' end);
exception when others then
  update public.ingestion_events set state = 'failed', error = sqlerrm, updated_at = now()
  where ingestion_key = p_ingestion_key;
  raise;
end;
$$;

create or replace function public.set_agent_availability(p_ready boolean, p_notification_ready boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null or not exists (
    select 1 from public.profiles where id = v_user and role = 'agent'
      and active and approval_status = 'approved'
  ) then raise exception 'Agent is not eligible'; end if;
  if p_ready and not p_notification_ready then raise exception 'Notifications must be ready'; end if;
  insert into public.agent_availability (
    agent_id, lead_ready, notification_ready, last_seen_at, presence_lease_until, presence_revision
  ) values (v_user, p_ready, p_notification_ready, now(),
    case when p_ready then now() + interval '60 minutes' else now() end, 1)
  on conflict (agent_id) do update set
    lead_ready = excluded.lead_ready, notification_ready = excluded.notification_ready,
    last_seen_at = excluded.last_seen_at, presence_lease_until = excluded.presence_lease_until,
    presence_revision = public.agent_availability.presence_revision + 1, updated_at = now();
  if p_ready then perform leadlaju_private.dispatch_available_leads(now()); end if;
  return jsonb_build_object('ok', true, 'ready', p_ready);
end;
$$;

create or replace function public.contact_assignment(
  p_action_id uuid, p_lead_id uuid, p_assignment_revision bigint
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_lead public.leads%rowtype; v_result jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select result into v_result from public.action_requests where action_id = p_action_id;
  if found then return v_result; end if;
  insert into public.action_requests (action_id, actor_id, lead_id, assignment_revision, action_type)
  values (p_action_id, v_user, p_lead_id, p_assignment_revision, 'contacted')
  on conflict (lead_id, assignment_revision, action_type) do nothing;
  if not found and not exists (select 1 from public.action_requests where action_id = p_action_id) then
    select result into v_result from public.action_requests
    where lead_id = p_lead_id and assignment_revision = p_assignment_revision and action_type = 'contacted';
    return v_result;
  end if;
  select * into v_lead from public.leads where id = p_lead_id for update;
  if v_lead.assigned_agent_id <> v_user or v_lead.assignment_revision <> p_assignment_revision
    or v_lead.status <> 'new' or v_lead.queue_state <> 'active' or v_lead.expires_at <= now() then
    v_result := jsonb_build_object('ok', false, 'error', 'Assignment is no longer active');
    update public.action_requests set state = 'rejected', result = v_result, completed_at = now()
    where action_id = p_action_id;
    return v_result;
  end if;
  update public.leads set status = 'contacted', queue_state = 'contacted', expires_at = null,
    contacted_at = now(), response_ms = greatest(0, extract(epoch from (now() - received_at)) * 1000)::bigint,
    status_revision = status_revision + 1, status_updated_at = now(), updated_at = now()
  where id = p_lead_id returning status_revision into v_lead.status_revision;
  update public.lead_assignments set outcome = 'contacted', resolved_at = now()
  where lead_id = p_lead_id and assignment_revision = p_assignment_revision and outcome = 'pending';
  update public.profiles set leads_handled = leads_handled + 1,
    cooldown_until = now() + interval '5 minutes', updated_at = now() where id = v_user;
  insert into public.lead_events (lead_id, actor_id, event_type, assignment_revision, status_revision)
  values (p_lead_id, v_user, 'contacted', p_assignment_revision, v_lead.status_revision);
  v_result := jsonb_build_object('ok', true, 'lead_id', p_lead_id,
    'assignment_revision', p_assignment_revision, 'status_revision', v_lead.status_revision, 'status', 'contacted');
  update public.action_requests set state = 'accepted', result = v_result, completed_at = now()
  where action_id = p_action_id;
  return v_result;
end;
$$;

create or replace function leadlaju_private.expire_assignments(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = '' as $$
declare v_lead public.leads%rowtype; v_cycle bigint; v_expired integer := 0;
begin
  select queue_cycle into v_cycle from public.dispatch_state where singleton for update;
  for v_lead in select * from public.leads where status = 'new' and queue_state = 'active'
    and expires_at <= p_now for update skip locked
  loop
    update public.lead_assignments set outcome = 'missed', resolved_at = p_now, retry_cycle = v_cycle
    where lead_id = v_lead.id and assignment_revision = v_lead.assignment_revision and outcome = 'pending';
    update public.leads set assigned_agent_id = null, received_at = null, expires_at = null,
      queue_state = 'queued', queued_at = p_now, pass_count = pass_count + 1,
      retry_after_cycle = v_cycle + 1, assignment_revision = assignment_revision + 1, updated_at = p_now
    where id = v_lead.id;
    insert into public.lead_events (lead_id, event_type, assignment_revision)
    values (v_lead.id, 'missed', v_lead.assignment_revision);
    v_expired := v_expired + 1;
  end loop;
  perform leadlaju_private.dispatch_available_leads(p_now);
  return v_expired;
end;
$$;

create or replace function public.get_visible_leads()
returns setof public.leads language sql stable security invoker set search_path = '' as $$
  select l.* from public.leads l
  where leadlaju_private.is_admin(auth.uid()) or l.assigned_agent_id = auth.uid();
$$;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.agent_project_eligibility enable row level security;
alter table public.agent_availability enable row level security;
alter table public.dispatch_state enable row level security;
alter table public.project_dispatch_state enable row level security;
alter table public.leads enable row level security;
alter table public.lead_assignments enable row level security;
alter table public.lead_events enable row level security;
alter table public.appointments enable row level security;
alter table public.reminders enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.action_requests enable row level security;
alter table public.ingestion_api_keys enable row level security;
alter table public.ingestion_events enable row level security;
alter table public.report_export_jobs enable row level security;

create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or leadlaju_private.is_admin((select auth.uid())));
create policy projects_read on public.projects for select to authenticated using (active or leadlaju_private.is_admin((select auth.uid())));
create policy eligibility_read on public.agent_project_eligibility for select to authenticated
  using (agent_id = (select auth.uid()) or leadlaju_private.is_admin((select auth.uid())));
create policy availability_read on public.agent_availability for select to authenticated
  using (agent_id = (select auth.uid()) or leadlaju_private.is_admin((select auth.uid())));
create policy leads_read on public.leads for select to authenticated
  using (assigned_agent_id = (select auth.uid()) or leadlaju_private.is_admin((select auth.uid())));
create policy assignments_read on public.lead_assignments for select to authenticated
  using (agent_id = (select auth.uid()) or leadlaju_private.is_admin((select auth.uid())));
create policy events_read on public.lead_events for select to authenticated using (
  leadlaju_private.is_admin((select auth.uid())) or exists (
    select 1 from public.leads l where l.id = lead_id and l.assigned_agent_id = (select auth.uid())
  ));
create policy appointments_read on public.appointments for select to authenticated
  using (assigned_agent_id = (select auth.uid()) or leadlaju_private.is_admin((select auth.uid())));
create policy reminders_read on public.reminders for select to authenticated
  using (leadlaju_private.is_admin((select auth.uid())) or target in ('agents', (select auth.uid())::text));
create policy subscriptions_read on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()) or leadlaju_private.is_admin((select auth.uid())));
create policy actions_read on public.action_requests for select to authenticated
  using (actor_id = (select auth.uid()) or leadlaju_private.is_admin((select auth.uid())));

grant usage on schema leadlaju_private to authenticated;
revoke all on function leadlaju_private.is_admin(uuid) from public, anon;
grant execute on function leadlaju_private.is_admin(uuid) to authenticated;

create policy leadlaju_private_broadcast_read on realtime.messages for select to authenticated using (
  extension = 'broadcast' and (
    realtime.topic() = 'user:' || (select auth.uid())::text
    or (realtime.topic() = 'admin:operations' and leadlaju_private.is_admin((select auth.uid())))
  )
);

revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles, public.projects, public.agent_project_eligibility,
  public.agent_availability, public.leads, public.lead_assignments, public.lead_events,
  public.appointments, public.reminders, public.action_requests to authenticated;
revoke all on function public.ingest_lead(text,text,text,text,text,text,text,text,text,text,timestamptz,text) from public, anon, authenticated;
revoke all on function public.set_agent_availability(boolean,boolean) from public, anon;
revoke all on function public.contact_assignment(uuid,uuid,bigint) from public, anon;
revoke all on function public.get_visible_leads() from public, anon;
grant execute on function public.set_agent_availability(boolean,boolean) to authenticated;
grant execute on function public.contact_assignment(uuid,uuid,bigint) to authenticated;
grant execute on function public.get_visible_leads() to authenticated;
grant execute on function public.ingest_lead(text,text,text,text,text,text,text,text,text,text,timestamptz,text) to service_role;
revoke all on function leadlaju_private.dispatch_available_leads(timestamptz) from public, anon, authenticated;
revoke all on function leadlaju_private.expire_assignments(timestamptz) from public, anon, authenticated;

create or replace function leadlaju_private.broadcast_lead_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.assigned_agent_id, old.assigned_agent_id) is not null then
    perform realtime.broadcast_changes(
      'user:' || coalesce(new.assigned_agent_id, old.assigned_agent_id)::text,
      tg_op, tg_op, tg_table_name, tg_table_schema, new, old
    );
  end if;
  perform realtime.broadcast_changes(
    'admin:operations', tg_op, tg_op, tg_table_name, tg_table_schema, new, old
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger leads_realtime_broadcast after insert or update or delete on public.leads
for each row execute function leadlaju_private.broadcast_lead_change();

-- Scheduling is deliberately enabled only during controlled cutover:
-- select cron.schedule('leadlaju-expiry', '* * * * *',
--   $$select leadlaju_private.expire_assignments(now())$$);
