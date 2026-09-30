-- Tenant isolation is enforced even inside legacy SECURITY DEFINER RPCs:
-- their non-login, non-BYPASSRLS owner sees only the validated request brand.
alter type public.leadlaju_role add value if not exists 'master';
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.brands(id,name,slug) values
 ('00000000-0000-4000-8000-000000000001','Safrich','safrich');
create table public.master_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.profiles(id),
  brand_id uuid references public.brands(id),
  action text not null,
  target_id uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.brands enable row level security;
alter table public.master_audit_log enable row level security;
revoke all on public.brands,public.master_audit_log from anon,authenticated;
grant select on public.brands,public.master_audit_log to authenticated;
grant all on public.brands,public.master_audit_log to service_role;
grant usage,select on sequence public.master_audit_log_id_seq to service_role;

do $$
declare t text;
begin
  foreach t in array array['profiles','projects','agent_project_eligibility','agent_availability',
    'dispatch_state','project_dispatch_state','leads','lead_assignments','lead_events','appointments',
    'reminders','push_subscriptions','notification_outbox','action_requests','ingestion_api_keys',
    'ingestion_events','report_export_jobs','report_export_runs','bulletins','bulletin_recipients']
  loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('alter table public.%I add column brand_id uuid references public.brands(id)',t);
    execute format('update public.%I set brand_id = %L',t,'00000000-0000-4000-8000-000000000001');
    if t <> 'profiles' then execute format('alter table public.%I alter column brand_id set not null',t); end if;
    execute format('create index %I on public.%I(brand_id)',t||'_brand_idx',t);
    execute format('alter table public.%I enable row level security',t);
  end loop;
end;
$$;
alter table public.profiles add constraint profiles_role_brand_shape check
 ((role::text='master' and brand_id is null) or (role::text<>'master' and brand_id is not null));

create or replace function leadlaju_private.is_master(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=p_user and role::text='master'
   and active and approval_status='approved');
$$;
create or replace function leadlaju_private.request_brand()
returns uuid language plpgsql stable security definer set search_path='' as $$
declare p public.profiles; b uuid; h jsonb;
begin
  h := coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  if auth.uid() is not null then
    select * into p from public.profiles where id=auth.uid();
    if not found or not p.active or p.approval_status<>'approved' then return null; end if;
    if p.role::text='master' then b:=nullif(h->>'x-leadlaju-brand','')::uuid;
    else
      b:=p.brand_id;
      if nullif(h->>'x-leadlaju-brand','') is not null and (h->>'x-leadlaju-brand')::uuid<>b
        then raise exception 'Brand access denied' using errcode='42501'; end if;
    end if;
  elsif coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'='service_role' then
    b:=nullif(h->>'x-leadlaju-brand','')::uuid;
  elsif session_user='postgres' then
    b:=nullif(current_setting('leadlaju.worker_brand',true),'')::uuid;
  end if;
  if exists(select 1 from public.brands where id=b and active) then return b; end if;
  return null;
end;
$$;
create or replace function leadlaju_private.is_admin(p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=p_user_id and p.active
   and p.approval_status='approved' and (
     p.role::text='master' or (p.role::text='admin' and p.brand_id=leadlaju_private.request_brand())));
$$;
revoke all on function leadlaju_private.is_master(uuid),leadlaju_private.request_brand() from public,anon;
grant execute on function leadlaju_private.is_master(uuid),leadlaju_private.request_brand() to authenticated,service_role;
create policy brands_member_read on public.brands for select to authenticated using
 (leadlaju_private.is_master() or id=(select brand_id from public.profiles where id=auth.uid()));
create policy master_audit_read on public.master_audit_log for select to authenticated using (leadlaju_private.is_master());

do $$ begin
 if not exists(select 1 from pg_roles where rolname='leadlaju_tenant_executor') then
   create role leadlaju_tenant_executor nologin noinherit nobypassrls;
 end if;
end $$;
grant leadlaju_tenant_executor to postgres;
grant create on schema public,leadlaju_private to leadlaju_tenant_executor;
grant usage on schema public,leadlaju_private,auth,extensions,realtime to leadlaju_tenant_executor;
grant select,insert,update,delete on all tables in schema public to leadlaju_tenant_executor;
grant usage,select on all sequences in schema public to leadlaju_tenant_executor;
grant execute on all functions in schema auth,extensions,realtime,leadlaju_private to leadlaju_tenant_executor;

-- Structural references cannot cross brands, even through a service-role write.
do $$
declare c record; t record;
begin
 for t in select table_name from information_schema.columns
   where table_schema='public' and column_name='brand_id' and table_name not in ('brands','master_audit_log')
 loop
   if exists(select 1 from information_schema.columns where table_schema='public' and table_name=t.table_name and column_name='id') then
     execute format('alter table public.%I add constraint %I unique(brand_id,id)',t.table_name,t.table_name||'_brand_identity');
   end if;
 end loop;
 for c in select con.conname,child.relname child,parent.relname parent,ca.attname child_col,pa.attname parent_col
   from pg_constraint con join pg_class child on child.oid=con.conrelid
   join pg_namespace ns on ns.oid=child.relnamespace join pg_class parent on parent.oid=con.confrelid
   join pg_namespace pn on pn.oid=parent.relnamespace
   join pg_attribute ca on ca.attrelid=child.oid and ca.attnum=con.conkey[1]
   join pg_attribute pa on pa.attrelid=parent.oid and pa.attnum=con.confkey[1]
   where con.contype='f' and ns.nspname='public' and pn.nspname='public' and array_length(con.conkey,1)=1
     and ca.attname in ('lead_id','agent_id','assigned_agent_id','user_id','project_id','parent_appointment_id','assignment_id','bulletin_id')
     and pa.attname='id' and exists(select 1 from pg_attribute where attrelid=child.oid and attname='brand_id')
 loop
   execute format('alter table public.%I add constraint %I foreign key(brand_id,%I) references public.%I(brand_id,id) deferrable initially deferred',
     c.child,left(c.conname||'_brand',63),c.child_col,c.parent);
 end loop;
end $$;

alter table public.dispatch_state drop constraint dispatch_state_pkey;
alter table public.dispatch_state add primary key(brand_id,singleton);
alter table public.ingestion_events drop constraint ingestion_events_pkey;
alter table public.ingestion_events add primary key(brand_id,ingestion_key);
alter table public.projects drop constraint if exists projects_source_project_id_key;
drop index public.projects_name_unique;
create unique index projects_name_unique on public.projects(brand_id,lower(name));
create unique index projects_source_brand_unique on public.projects(brand_id,source_project_id);
alter table public.leads drop constraint leads_source_identity_unique;
alter table public.leads add constraint leads_source_identity_unique unique(brand_id,source_system,source_lead_id);
drop index public.leads_ingestion_fingerprint_unique;
create unique index leads_ingestion_fingerprint_unique on public.leads(brand_id,source_system,ingestion_fingerprint) where source_lead_id is null;
drop index public.ingestion_api_keys_one_active_provider;
create unique index ingestion_api_keys_one_active_provider on public.ingestion_api_keys(brand_id,provider) where active and provider is not null;
alter table public.appointments drop constraint if exists appointments_source_appointment_id_key;
create unique index appointments_source_brand_unique on public.appointments(brand_id,source_appointment_id);
alter table public.reminders drop constraint if exists reminders_source_reminder_id_unique;
create unique index reminders_source_brand_unique on public.reminders(brand_id,source_reminder_id);
drop index if exists public.profiles_source_agent_id_unique;
create unique index profiles_source_agent_id_unique on public.profiles(brand_id,source_agent_id) where source_agent_id is not null;

create or replace function leadlaju_private.stamp_brand()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_new jsonb:=to_jsonb(new); v_old jsonb; v_actor uuid; v_actor_brand uuid; v_role text;
begin
 if tg_op='UPDATE' then
   v_old:=to_jsonb(old);
   if v_old->>'brand_id' is distinct from v_new->>'brand_id' then raise exception 'Brand membership is immutable'; end if;
 end if;
 if new.brand_id is null and not (tg_table_name='profiles' and v_new->>'role'='master') then
   new.brand_id:=leadlaju_private.request_brand();
   if new.brand_id is null then raise exception 'Active brand required' using errcode='42501'; end if;
 end if;
 foreach v_actor in array array[nullif(v_new->>'actor_id','')::uuid,nullif(v_new->>'created_by_id','')::uuid,
   nullif(v_new->>'created_by','')::uuid,nullif(v_new->>'revoked_by','')::uuid]
 loop
   if v_actor is null then continue; end if;
   select brand_id,role::text into v_actor_brand,v_role from public.profiles where id=v_actor;
   if v_role<>'master' and v_actor_brand is distinct from new.brand_id then raise exception 'Cross-brand actor denied'; end if;
 end loop;
 return new;
end $$;
revoke all on function leadlaju_private.stamp_brand() from public,anon,authenticated;

do $$
declare t record;
begin
 for t in select table_name from information_schema.columns where table_schema='public' and column_name='brand_id'
   and table_name not in ('master_audit_log','brands')
 loop
   execute format('create trigger tenant_brand_stamp before insert or update on public.%I for each row execute function leadlaju_private.stamp_brand()',t.table_name);
   -- A restrictive policy composes with every existing ownership/approval policy.
   if t.table_name='profiles' then
     execute format('create policy tenant_boundary on public.%I as restrictive for all to authenticated using (id=auth.uid() or brand_id=leadlaju_private.request_brand()) with check (brand_id=leadlaju_private.request_brand())',t.table_name);
   else
     execute format('create policy tenant_boundary on public.%I as restrictive for all to authenticated using (brand_id=leadlaju_private.request_brand()) with check (brand_id=leadlaju_private.request_brand())',t.table_name);
   end if;
   execute format('create policy tenant_executor on public.%I for all to leadlaju_tenant_executor using (brand_id=leadlaju_private.request_brand()) with check (brand_id=leadlaju_private.request_brand())',t.table_name);
 end loop;
end $$;
create policy tenant_executor_self on public.profiles for select to leadlaju_tenant_executor using(id=auth.uid());
create policy tenant_executor_brands on public.brands for select to leadlaju_tenant_executor using(id=leadlaju_private.request_brand());

-- Preserve existing function bodies and business rules, but remove their RLS bypass.
do $$
declare f record; definition text;
begin
 for f in select p.oid,p.proname,n.nspname,pg_get_function_identity_arguments(p.oid) args
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname in ('public','leadlaju_private') and p.prosecdef
     and p.proname not in ('is_admin','is_master','request_brand','stamp_brand','claim_notification_outbox','finish_notification_outbox','get_follow_up_notification_count')
     and p.prosrc ~ 'public\.(profiles|projects|leads|appointments|bulletins|agent_|notification_|ingestion_|dispatch_state|push_subscriptions|reminders|lead_)'
 loop
   if f.proname='ingest_lead' then
     definition:=pg_get_functiondef(f.oid);
     definition:=replace(definition,'on conflict (ingestion_key)','on conflict (brand_id,ingestion_key)');
     execute definition;
   end if;
   execute format('alter function %I.%I(%s) owner to leadlaju_tenant_executor',f.nspname,f.proname,f.args);
   execute format('grant execute on function %I.%I(%s) to leadlaju_tenant_executor',f.nspname,f.proname,f.args);
 end loop;
end $$;
grant execute on all functions in schema public,leadlaju_private to leadlaju_tenant_executor;

-- Cron iterates active brands. Nested dispatch remains in its caller's brand.
do $$
declare f text; signature text;
begin
 foreach f in array array['dispatch_available_leads','expire_assignments','enqueue_due_operational_notifications',
   'enqueue_follow_up_due_notifications','promote_stale_follow_up_due','process_appointment_outcomes']
 loop
   signature:=format('leadlaju_private.%I(timestamptz)',f);
   execute format('alter function %s rename to %I',signature,f||'_brand');
   execute format($wrapper$
     create function leadlaju_private.%I(p_now timestamptz default now()) returns integer
     language plpgsql security definer set search_path='' as $body$
     declare b uuid; previous_brand text:=current_setting('leadlaju.worker_brand',true); total integer:=0; scoped uuid;
     begin
       scoped:=leadlaju_private.request_brand();
       if auth.uid() is not null or coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'='service_role' then
         if scoped is null then raise exception 'Active brand required'; end if;
         return leadlaju_private.%I(p_now);
       end if;
       if scoped is not null then return leadlaju_private.%I(p_now); end if;
       for b in select id from public.brands where active order by id loop
         perform set_config('leadlaju.worker_brand',b::text,true);
         total:=total+leadlaju_private.%I(p_now);
       end loop;
       perform set_config('leadlaju.worker_brand',coalesce(previous_brand,''),true);
       return total;
     end $body$;
   $wrapper$,f,f||'_brand',f||'_brand',f||'_brand');
   execute format('revoke all on function %s from public,anon,authenticated',signature);
   execute format('grant execute on function %s to leadlaju_tenant_executor',signature);
 end loop;
end $$;

-- No old shared admin topic remains subscribable. Replace producer topics too.
drop policy if exists leadlaju_private_broadcast_read on realtime.messages;
create or replace function leadlaju_private.can_subscribe_brand_topic(p_topic text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.active and p.approval_status='approved'
   and (p.role::text='master' or exists(select 1 from public.brands b where b.id=p.brand_id and b.active))
   and (p_topic='user:'||p.id::text or exists(select 1 from public.brands b where b.active
      and p_topic='brand:'||b.id::text||':operations'
      and (p.role::text='master' or (p.role::text='admin' and p.brand_id=b.id)))));
$$;
revoke all on function leadlaju_private.can_subscribe_brand_topic(text) from public,anon;
grant execute on function leadlaju_private.can_subscribe_brand_topic(text) to authenticated;
create policy leadlaju_private_broadcast_read on realtime.messages for select to authenticated using (
 extension='broadcast' and leadlaju_private.can_subscribe_brand_topic(realtime.topic())
);
do $$ declare f record; definition text;
begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='leadlaju_private' and p.prosrc like '%admin:operations%'
 loop
   definition:=replace(pg_get_functiondef(f.oid),'''admin:operations''','''brand:'' || coalesce(to_jsonb(new)->>''brand_id'',to_jsonb(old)->>''brand_id'') || '':operations''');
   execute definition;
 end loop;
end $$;

create or replace function public.claim_notification_outbox(p_limit integer default 20)
returns table(outbox_id bigint,notification_type text,payload jsonb,endpoint text,p256dh text,auth_secret text,subscription_id uuid,user_id uuid)
language plpgsql security definer set search_path='' as $$
begin
 return query with claimed as (
   select n.id from public.notification_outbox n join public.brands b on b.id=n.brand_id and b.active
   join public.profiles p on p.id=n.user_id and p.brand_id=n.brand_id and p.active and p.approval_status='approved'
   where n.sent_at is null and n.available_at<=now() and (n.claimed_at is null or n.claimed_at<now()-interval '2 minutes')
   order by n.available_at,n.id for update of n skip locked limit greatest(1,least(coalesce(p_limit,20),100))
 ), marked as (
   update public.notification_outbox n set claimed_at=now(),attempts=n.attempts+1 from claimed c where n.id=c.id
   returning n.id,n.notification_type,n.user_id,n.payload,n.brand_id
 ) select m.id,m.notification_type,m.payload||jsonb_build_object('brandId',m.brand_id),s.endpoint,s.p256dh,s.auth,s.id,m.user_id
 from marked m left join public.push_subscriptions s on s.user_id=m.user_id and s.brand_id=m.brand_id and s.active order by m.id,s.id;
end $$;
revoke all on function public.claim_notification_outbox(integer) from public,anon,authenticated;
grant execute on function public.claim_notification_outbox(integer) to service_role;

create or replace function public.get_follow_up_notification_count(p_agent_id uuid)
returns integer language sql stable security definer set search_path='' as $$
 select count(*)::integer from public.leads l join public.profiles p on p.id=l.assigned_agent_id and p.brand_id=l.brand_id
 join public.brands b on b.id=l.brand_id and b.active
 where p.id=p_agent_id and p.active and p.approval_status='approved' and p.role='agent'
 and l.status='contacted' and l.follow_up_activity_at<=now()-interval '24 hours';
$$;
revoke all on function public.get_follow_up_notification_count(uuid) from public,anon,authenticated;
grant execute on function public.get_follow_up_notification_count(uuid) to service_role;

create or replace function public.master_manage_brand(p_action text,p_brand jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.brands; bid uuid:=nullif(p_brand->>'id','')::uuid;
begin
 if not leadlaju_private.is_master() then raise exception 'Master required' using errcode='42501'; end if;
 if p_action='list' then
   return jsonb_build_object('ok',true,'brands',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.brands x),'[]'));
 elsif p_action='create' then
   insert into public.brands(name,slug) values(trim(p_brand->>'name'),lower(trim(p_brand->>'slug'))) returning * into b;
   insert into public.dispatch_state(brand_id,singleton) values(b.id,true);
 elsif p_action='update' then
   update public.brands set name=trim(p_brand->>'name'),updated_at=now() where id=bid returning * into b;
   if not found then raise exception 'Brand not found'; end if;
 elsif p_action='set_active' then
   if p_brand->>'confirmation' is distinct from bid::text then raise exception 'Brand confirmation required'; end if;
   update public.brands set active=(p_brand->>'active')::boolean,updated_at=now() where id=bid returning * into b;
   if not found then raise exception 'Brand not found'; end if;
   if not b.active then
     update public.agent_availability set lead_ready=false,notification_ready=false,presence_lease_until=null,updated_at=now() where brand_id=b.id;
     update public.notification_outbox set sent_at=now(),claimed_at=null,last_error='Cancelled: brand suspended' where brand_id=b.id and sent_at is null;
     perform realtime.send(jsonb_build_object('brandId',b.id,'active',false),'brand_suspended','brand:'||b.id||':operations',true);
     perform realtime.send(jsonb_build_object('brandId',b.id,'active',false),'brand_suspended','user:'||p.id::text,true)
       from public.profiles p where p.brand_id=b.id;
   end if;
 else raise exception 'Invalid brand action'; end if;
 insert into public.master_audit_log(actor_id,brand_id,action,target_id,details)
 values(auth.uid(),b.id,'brand_'||p_action,b.id,jsonb_build_object('name',b.name,'active',b.active));
 return jsonb_build_object('ok',true,'brand',to_jsonb(b));
end $$;
revoke all on function public.master_manage_brand(text,jsonb) from public,anon;
grant execute on function public.master_manage_brand(text,jsonb) to authenticated;

-- Service-only bootstrap. It can create the first Master profile only after the
-- trusted Auth admin API creates/invites the explicitly supplied account.
create or replace function public.bootstrap_first_master(p_user_id uuid,p_email text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.profiles where role::text='master') then raise exception 'Master already bootstrapped'; end if;
 if lower(trim(p_email))<>'lurbaymarketing@gmail.com' or not exists(select 1 from auth.users where id=p_user_id and lower(email)=lower(trim(p_email))) then
   raise exception 'Bootstrap identity does not match'; end if;
 if exists(select 1 from public.profiles where id=p_user_id) then raise exception 'Separate Master account required'; end if;
 insert into public.profiles(id,name,email,role,approval_status,active,brand_id)
 values(p_user_id,'Master',lower(trim(p_email)),'master','approved',true,null);
 insert into public.master_audit_log(actor_id,action,target_id) values(p_user_id,'master_bootstrap',p_user_id);
end $$;
revoke all on function public.bootstrap_first_master(uuid,text) from public,anon,authenticated,leadlaju_tenant_executor;
grant execute on function public.bootstrap_first_master(uuid,text) to service_role;
revoke create on schema public,leadlaju_private from leadlaju_tenant_executor;

-- Master operational edits through existing RPCs must also be auditable.
create function leadlaju_private.audit_master_operation()
returns trigger language plpgsql security definer set search_path='' as $$
declare row_data jsonb;
begin
 if leadlaju_private.is_master() then
   row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
   insert into public.master_audit_log(actor_id,brand_id,action,details)
   values(auth.uid(),(row_data->>'brand_id')::uuid,'operation_'||lower(tg_op),
     jsonb_build_object('table',tg_table_name,'record_id',coalesce(row_data->>'id',row_data->>'agent_id',row_data->>'ingestion_key')));
 end if;
 return null;
end $$;
revoke all on function leadlaju_private.audit_master_operation() from public,anon,authenticated;
do $$ declare t record; begin
 for t in select table_name from information_schema.columns where table_schema='public' and column_name='brand_id'
   and table_name not in ('brands','master_audit_log')
 loop
   execute format('create trigger master_operation_audit after insert or update or delete on public.%I for each row execute function leadlaju_private.audit_master_operation()',t.table_name);
 end loop;
end $$;
