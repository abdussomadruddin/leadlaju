create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  phone text not null default '',
  email text not null unique,
  role text not null default 'agent' check (role in ('admin', 'agent')),
  active boolean not null default true,
  leads_handled integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  name text not null,
  phone text not null,
  email text,
  project text not null default 'Tidak dinyatakan',
  source text not null default 'Google Sheet',
  status text not null default 'new' check (status in ('new', 'contacted')),
  assigned_agent_id uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  pass_count integer not null default 0,
  response_ms integer,
  contacted_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('new', 'passed', 'contacted')),
  lead_id uuid references public.leads(id) on delete cascade,
  lead_name text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id integer primary key default 1 check (id = 1),
  google_sheet_endpoint text,
  poll_interval integer not null default 30,
  last_sync_at timestamptz,
  round_robin_index integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id)
values (1)
on conflict (id) do nothing;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
before update on public.leads
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, phone, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    new.email,
    case when new.raw_user_meta_data ->> 'role' = 'admin' then 'admin' else 'agent' end
  )
  on conflict (id) do update
  set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update of email on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin' and active = true
  );
$$;

create or replace function public.can_access_lead(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1
    from public.leads
    where id = p_lead_id and assigned_agent_id = auth.uid()
  );
$$;

alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.activities enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "profiles_read_authenticated" on public.profiles;
create policy "profiles_read_authenticated"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update"
on public.profiles for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "leads_admin_insert" on public.leads;
create policy "leads_admin_insert"
on public.leads for insert
to authenticated
with check (public.is_admin());

drop policy if exists "leads_owner_update_contacted" on public.leads;
create policy "leads_owner_update_contacted"
on public.leads for update
to authenticated
using (
  public.is_admin()
  or (assigned_agent_id = auth.uid() and status = 'contacted')
)
with check (
  public.is_admin()
  or (assigned_agent_id = auth.uid() and status = 'contacted')
);

drop policy if exists "activities_read_visible_leads" on public.activities;
create policy "activities_read_visible_leads"
on public.activities for select
to authenticated
using (
  public.can_access_lead(lead_id)
);

drop policy if exists "activities_insert_assigned" on public.activities;
create policy "activities_insert_assigned"
on public.activities for insert
to authenticated
with check (
  public.can_access_lead(lead_id)
);

drop policy if exists "settings_admin_all" on public.app_settings;
create policy "settings_admin_all"
on public.app_settings for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace function public.get_visible_leads()
returns table (
  id uuid,
  dedupe_key text,
  name text,
  phone text,
  email text,
  project text,
  source text,
  status text,
  assigned_agent_id uuid,
  expires_at timestamptz,
  pass_count integer,
  response_ms integer,
  contacted_at timestamptz,
  notes text,
  created_at timestamptz,
  received_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.id,
    l.dedupe_key,
    l.name,
    case
      when l.status = 'contacted'
        and (l.assigned_agent_id = auth.uid() or public.is_admin())
      then l.phone
      else null
    end,
    case
      when l.status = 'contacted'
        and (l.assigned_agent_id = auth.uid() or public.is_admin())
      then l.email
      else null
    end,
    l.project,
    l.source,
    l.status,
    l.assigned_agent_id,
    l.expires_at,
    l.pass_count,
    l.response_ms,
    l.contacted_at,
    case
      when l.status = 'contacted'
        and (l.assigned_agent_id = auth.uid() or public.is_admin())
      then l.notes
      else ''
    end,
    l.created_at,
    l.received_at
  from public.leads l
  where public.is_admin() or l.assigned_agent_id = auth.uid()
  order by l.received_at desc;
$$;

create or replace function public.claim_lead(p_lead_id uuid)
returns table (
  id uuid,
  dedupe_key text,
  name text,
  phone text,
  email text,
  project text,
  source text,
  status text,
  assigned_agent_id uuid,
  expires_at timestamptz,
  pass_count integer,
  response_ms integer,
  contacted_at timestamptz,
  notes text,
  created_at timestamptz,
  received_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.leads%rowtype;
  agent_name text;
begin
  select * into target
  from public.leads
  where leads.id = p_lead_id
  for update;

  if target.id is null
    or target.status <> 'new'
    or target.expires_at <= now()
    or not (target.assigned_agent_id = auth.uid() or public.is_admin())
  then
    return;
  end if;

  update public.leads
  set
    status = 'contacted',
    contacted_at = now(),
    response_ms = floor(extract(epoch from (now() - received_at)) * 1000)::integer
  where leads.id = p_lead_id;

  update public.profiles
  set leads_handled = leads_handled + 1
  where profiles.id = target.assigned_agent_id
  returning name into agent_name;

  insert into public.activities (type, lead_id, lead_name, message)
  values (
    'contacted',
    target.id,
    target.name,
    coalesce(agent_name, 'Ejen') || ' CALL NOW untuk ' || target.project
  );

  return query
  select
    l.id,
    l.dedupe_key,
    l.name,
    l.phone,
    l.email,
    l.project,
    l.source,
    l.status,
    l.assigned_agent_id,
    l.expires_at,
    l.pass_count,
    l.response_ms,
    l.contacted_at,
    l.notes,
    l.created_at,
    l.received_at
  from public.leads l
  where l.id = p_lead_id;
end;
$$;

create or replace function public.pass_expired_lead(
  p_lead_id uuid,
  p_next_agent_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_count integer;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_next_agent_id and role = 'agent' and active = true
  ) then
    return false;
  end if;

  update public.leads
  set
    assigned_agent_id = p_next_agent_id,
    expires_at = now() + interval '5 minutes',
    pass_count = pass_count + 1
  where id = p_lead_id
    and status = 'new'
    and expires_at <= now()
    and (assigned_agent_id = auth.uid() or public.is_admin());

  get diagnostics changed_count = row_count;
  return changed_count = 1;
end;
$$;

revoke all on function public.get_visible_leads() from public;
revoke all on function public.claim_lead(uuid) from public;
revoke all on function public.pass_expired_lead(uuid, uuid) from public;
grant execute on function public.get_visible_leads() to authenticated;
grant execute on function public.claim_lead(uuid) to authenticated;
grant execute on function public.pass_expired_lead(uuid, uuid) to authenticated;

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant update on public.profiles to authenticated;
grant insert, update on public.leads to authenticated;
grant select, insert on public.activities to authenticated;
grant select, insert, update on public.app_settings to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'leads'
  ) then
    alter publication supabase_realtime add table public.leads;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'activities'
  ) then
    alter publication supabase_realtime add table public.activities;
  end if;
end
$$;
