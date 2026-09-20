create table public.bulletins (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 5000),
  project_id uuid references public.projects(id) on delete restrict,
  cta_text text,
  cta_url text,
  status text not null default 'published' check (status in ('published', 'archived')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint bulletins_cta_pair check (
    (cta_text is null and cta_url is null)
    or (char_length(cta_text) between 1 and 40 and char_length(cta_url) between 1 and 2048 and cta_url ~* '^https://[^[:space:]]+$')
  )
);
create index bulletins_feed_idx on public.bulletins(status, published_at desc);
create index bulletins_project_idx on public.bulletins(project_id, published_at desc);

create table public.bulletin_recipients (
  bulletin_id uuid not null references public.bulletins(id) on delete cascade,
  agent_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (bulletin_id, agent_id)
);
create index bulletin_recipients_agent_unread_idx on public.bulletin_recipients(agent_id, bulletin_id) where read_at is null;

alter table public.bulletins enable row level security;
alter table public.bulletin_recipients enable row level security;
grant select on public.bulletins, public.bulletin_recipients to authenticated;

create policy bulletins_admin_or_recipient_read on public.bulletins for select to authenticated using (
  leadlaju_private.is_admin((select auth.uid())) or (
    status = 'published' and exists (
      select 1 from public.bulletin_recipients r
      where r.bulletin_id = bulletins.id and r.agent_id = (select auth.uid())
    )
  )
);
create policy bulletin_recipients_admin_or_owner_read on public.bulletin_recipients for select to authenticated using (
  leadlaju_private.is_admin((select auth.uid())) or agent_id = (select auth.uid())
);

create or replace function leadlaju_private.assert_bulletin_admin()
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null or not leadlaju_private.is_admin(v_user) then raise exception 'Admin required'; end if;
  return v_user;
end;
$$;
revoke all on function leadlaju_private.assert_bulletin_admin() from public, anon, authenticated;

create or replace function leadlaju_private.normalized_bulletin_value(p_value text, p_limit integer)
returns text language plpgsql immutable set search_path = '' as $$
declare v_value text := nullif(trim(coalesce(p_value, '')), '');
begin
  if v_value is not null and char_length(v_value) > p_limit then raise exception 'Bulletin field is too long'; end if;
  return v_value;
end;
$$;
revoke all on function leadlaju_private.normalized_bulletin_value(text, integer) from public, anon, authenticated;

create or replace function leadlaju_private.broadcast_bulletin_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_bulletin uuid;
  v_agent uuid;
  v_operation text := lower(tg_op);
begin
  if tg_table_name = 'bulletin_recipients' then
    v_bulletin := coalesce((to_jsonb(new)->>'bulletin_id')::uuid, (to_jsonb(old)->>'bulletin_id')::uuid);
    v_agent := coalesce((to_jsonb(new)->>'agent_id')::uuid, (to_jsonb(old)->>'agent_id')::uuid);
    perform realtime.send(jsonb_build_object('bulletinId', v_bulletin, 'operation', case when tg_op = 'INSERT' then 'published' else 'read' end), 'bulletin_changed', 'user:' || v_agent::text, true);
    if tg_op = 'UPDATE' then
      perform realtime.send(jsonb_build_object('bulletinId', v_bulletin, 'operation', 'read'), 'bulletin_changed', 'admin:operations', true);
    end if;
  else
    v_bulletin := coalesce((to_jsonb(new)->>'id')::uuid, (to_jsonb(old)->>'id')::uuid);
    for v_agent in select agent_id from public.bulletin_recipients where bulletin_id = v_bulletin loop
      perform realtime.send(jsonb_build_object('bulletinId', v_bulletin, 'operation', v_operation), 'bulletin_changed', 'user:' || v_agent::text, true);
    end loop;
    perform realtime.send(jsonb_build_object('bulletinId', v_bulletin, 'operation', v_operation), 'bulletin_changed', 'admin:operations', true);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function leadlaju_private.broadcast_bulletin_change() from public, anon, authenticated;

create trigger bulletins_broadcast after update on public.bulletins
for each row execute function leadlaju_private.broadcast_bulletin_change();
create trigger bulletin_recipients_broadcast after insert or update on public.bulletin_recipients
for each row execute function leadlaju_private.broadcast_bulletin_change();

create or replace function public.publish_bulletin(p_title text, p_body text, p_project_id uuid default null, p_cta_text text default null, p_cta_url text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := leadlaju_private.assert_bulletin_admin(); v_title text; v_body text; v_cta_text text; v_cta_url text; v_id uuid; v_recipients integer;
begin
  v_title := leadlaju_private.normalized_bulletin_value(p_title, 120);
  v_body := leadlaju_private.normalized_bulletin_value(p_body, 5000);
  v_cta_text := leadlaju_private.normalized_bulletin_value(p_cta_text, 40);
  v_cta_url := leadlaju_private.normalized_bulletin_value(p_cta_url, 2048);
  if v_title is null or v_body is null then raise exception 'Title and message are required'; end if;
  if (v_cta_text is null) <> (v_cta_url is null) then raise exception 'CTA text and URL must both be provided'; end if;
  if v_cta_url is not null and v_cta_url !~* '^https://[^[:space:]]+$' then raise exception 'CTA URL must be an absolute https URL'; end if;
  if p_project_id is not null and not exists(select 1 from public.projects where id=p_project_id and active) then raise exception 'Project is not active'; end if;
  insert into public.bulletins(title,body,project_id,cta_text,cta_url,created_by) values(v_title,v_body,p_project_id,v_cta_text,v_cta_url,v_user) returning id into v_id;
  insert into public.bulletin_recipients(bulletin_id,agent_id)
  select v_id,p.id from public.profiles p where p.role='agent' and p.active and p.approval_status='approved'
    and (p_project_id is null or exists(select 1 from public.agent_project_eligibility e where e.agent_id=p.id and e.project_id=p_project_id));
  get diagnostics v_recipients = row_count;
  insert into public.notification_outbox(user_id,notification_type,payload,dedupe_key)
  select r.agent_id,'bulletin',jsonb_build_object('title','Buletin: '||v_title,'body',left(regexp_replace(v_body, '\\s+', ' ', 'g'),140),'tag','leadlaju-bulletin-'||v_id::text,'view','bulletins','url','/?view=bulletins&bulletin='||v_id::text,'bulletinId',v_id::text,'requireInteraction',false),'bulletin:'||v_id::text||':'||r.agent_id::text
  from public.bulletin_recipients r where r.bulletin_id=v_id on conflict do nothing;
  return jsonb_build_object('ok',true,'id',v_id,'recipient_count',v_recipients);
end;
$$;

create or replace function public.update_bulletin(p_bulletin_id uuid, p_title text, p_body text, p_cta_text text default null, p_cta_url text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := leadlaju_private.assert_bulletin_admin(); v_title text; v_body text; v_cta_text text; v_cta_url text;
begin
  v_title:=leadlaju_private.normalized_bulletin_value(p_title,120); v_body:=leadlaju_private.normalized_bulletin_value(p_body,5000); v_cta_text:=leadlaju_private.normalized_bulletin_value(p_cta_text,40); v_cta_url:=leadlaju_private.normalized_bulletin_value(p_cta_url,2048);
  if v_title is null or v_body is null then raise exception 'Title and message are required'; end if;
  if (v_cta_text is null) <> (v_cta_url is null) then raise exception 'CTA text and URL must both be provided'; end if;
  if v_cta_url is not null and v_cta_url !~* '^https://[^[:space:]]+$' then raise exception 'CTA URL must be an absolute https URL'; end if;
  update public.bulletins set title=v_title,body=v_body,cta_text=v_cta_text,cta_url=v_cta_url,updated_at=now() where id=p_bulletin_id and status='published';
  if not found then raise exception 'Published bulletin not found'; end if;
  return jsonb_build_object('ok',true,'id',p_bulletin_id);
end;
$$;

create or replace function public.archive_bulletin(p_bulletin_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform leadlaju_private.assert_bulletin_admin();
  update public.bulletins set status='archived',archived_at=coalesce(archived_at,now()),updated_at=now() where id=p_bulletin_id and status='published';
  if not found and not exists(select 1 from public.bulletins where id=p_bulletin_id and status='archived') then raise exception 'Bulletin not found'; end if;
  return jsonb_build_object('ok',true,'id',p_bulletin_id);
end;
$$;

create or replace function public.mark_bulletin_read(p_bulletin_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid();
begin
  if v_user is null or not exists(select 1 from public.profiles where id=v_user and active and approval_status='approved') then raise exception 'Active approved account required'; end if;
  update public.bulletin_recipients r set read_at=coalesce(read_at,now()) from public.bulletins b where r.bulletin_id=p_bulletin_id and r.agent_id=v_user and b.id=r.bulletin_id and b.status='published';
  if not found and not exists(select 1 from public.bulletin_recipients where bulletin_id=p_bulletin_id and agent_id=v_user) then raise exception 'Bulletin not available'; end if;
  return jsonb_build_object('ok',true,'id',p_bulletin_id);
end;
$$;

create or replace function public.get_bulletin_feed()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_admin boolean; v_feed jsonb; v_unread integer;
begin
  if v_user is null or not exists(select 1 from public.profiles where id=v_user and active and approval_status='approved') then raise exception 'Active approved account required'; end if;
  v_admin:=leadlaju_private.is_admin(v_user);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.published_at desc),'[]'::jsonb) into v_feed from (
    select b.id,b.title,b.body,b.status,b.project_id,p.name as project_name,b.cta_text,b.cta_url,b.created_by,b.published_at,b.updated_at,b.archived_at,
      case when v_admin then (select count(*) from public.bulletin_recipients r where r.bulletin_id=b.id) else null end as recipient_count,
      case when v_admin then (select count(*) from public.bulletin_recipients r where r.bulletin_id=b.id and r.read_at is not null) else null end as read_count,
      case when v_admin then null else r.read_at end as read_at
    from public.bulletins b left join public.projects p on p.id=b.project_id
    left join public.bulletin_recipients r on r.bulletin_id=b.id and r.agent_id=v_user
    where v_admin or (b.status='published' and r.agent_id=v_user)
  ) x;
  select case when v_admin then 0 else count(*) end into v_unread from public.bulletin_recipients r join public.bulletins b on b.id=r.bulletin_id where r.agent_id=v_user and b.status='published' and r.read_at is null;
  return jsonb_build_object('bulletins',v_feed,'unread_count',v_unread,'server_now',now());
end;
$$;

revoke all on function public.publish_bulletin(text,text,uuid,text,text), public.update_bulletin(uuid,text,text,text,text), public.archive_bulletin(uuid), public.mark_bulletin_read(uuid), public.get_bulletin_feed() from public,anon;
grant execute on function public.publish_bulletin(text,text,uuid,text,text), public.update_bulletin(uuid,text,text,text,text), public.archive_bulletin(uuid), public.mark_bulletin_read(uuid), public.get_bulletin_feed() to authenticated;
