alter table public.ingestion_api_keys
  add column if not exists provider text,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references public.profiles(id) on delete set null,
  add column if not exists last_result text,
  add column if not exists last_error text,
  add column if not exists last_result_at timestamptz;

alter table public.ingestion_api_keys
  drop constraint if exists ingestion_api_keys_provider_check,
  add constraint ingestion_api_keys_provider_check
    check (provider is null or provider in ('meta_ads', 'tiktok_ads')),
  drop constraint if exists ingestion_api_keys_last_result_check,
  add constraint ingestion_api_keys_last_result_check
    check (last_result is null or last_result in ('inserted', 'duplicate', 'failed'));

create unique index if not exists ingestion_api_keys_one_active_provider
  on public.ingestion_api_keys (provider)
  where active and provider is not null;

create index if not exists ingestion_api_keys_provider_created_idx
  on public.ingestion_api_keys (provider, created_at desc);

create or replace function public.rotate_ingestion_api_key(
  p_provider text,
  p_name text,
  p_key_digest text,
  p_actor uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider text := lower(trim(coalesce(p_provider, '')));
  v_key public.ingestion_api_keys;
begin
  if v_provider not in ('meta_ads', 'tiktok_ads')
    or coalesce(trim(p_name), '') = ''
    or coalesce(trim(p_key_digest), '') = ''
    or p_actor is null
    or not leadlaju_private.is_admin(p_actor) then
    raise exception 'Invalid integration key request';
  end if;

  update public.ingestion_api_keys
  set active = false,
      revoked_at = coalesce(revoked_at, now()),
      revoked_by = coalesce(revoked_by, p_actor)
  where provider = v_provider and active;

  insert into public.ingestion_api_keys (name, provider, key_digest, created_by)
  values (trim(p_name), v_provider, trim(p_key_digest), p_actor)
  returning * into v_key;

  return jsonb_build_object(
    'id', v_key.id,
    'provider', v_key.provider,
    'name', v_key.name,
    'active', v_key.active,
    'created_at', v_key.created_at
  );
end;
$$;

create or replace function public.revoke_ingestion_api_key(
  p_provider text,
  p_actor uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider text := lower(trim(coalesce(p_provider, '')));
  v_revoked integer := 0;
begin
  if v_provider not in ('meta_ads', 'tiktok_ads')
    or p_actor is null
    or not leadlaju_private.is_admin(p_actor) then
    raise exception 'Invalid integration key request';
  end if;

  update public.ingestion_api_keys
  set active = false, revoked_at = now(), revoked_by = p_actor
  where provider = v_provider and active;
  get diagnostics v_revoked = row_count;

  return jsonb_build_object('ok', true, 'provider', v_provider, 'revoked', v_revoked);
end;
$$;

create or replace function public.ingest_lead(
  p_ingestion_key text, p_source_system text, p_source_lead_id text,
  p_name text, p_phone text, p_email text, p_city text, p_project_name text,
  p_source text, p_notes text, p_created_at timestamptz, p_payload_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_project_id uuid; v_lead_id uuid; v_inserted boolean := false;
begin
  if coalesce(trim(p_ingestion_key), '') = '' or coalesce(trim(p_source_system), '') = ''
    or coalesce(trim(p_source_lead_id), '') = '' or coalesce(trim(p_name), '') = ''
    or coalesce(trim(p_phone), '') = '' or coalesce(trim(p_project_name), '') = '' then
    raise exception 'Invalid ingestion payload';
  end if;
  insert into public.ingestion_events (ingestion_key, source_system, source_lead_id, payload_hash, state)
  values (p_ingestion_key, lower(trim(p_source_system)), trim(p_source_lead_id), p_payload_hash, 'processing')
  on conflict (ingestion_key) do update set attempts = public.ingestion_events.attempts + 1, updated_at = now();
  select id into v_project_id from public.projects where active and lower(name) = lower(trim(p_project_name));
  if v_project_id is null then raise exception 'Project is not active or does not exist'; end if;
  insert into public.leads (
    source_system, source_lead_id, ingestion_fingerprint, name, phone, email, city,
    project_id, source, notes, created_at
  ) values (
    lower(trim(p_source_system)), trim(p_source_lead_id), p_payload_hash, trim(p_name), trim(p_phone),
    coalesce(trim(p_email), ''), coalesce(trim(p_city), ''), v_project_id,
    coalesce(nullif(trim(p_source), ''), 'Manual Lead'), coalesce(p_notes, ''), p_created_at
  ) on conflict do nothing returning id into v_lead_id;
  v_inserted := v_lead_id is not null;
  if not v_inserted then
    select id into v_lead_id from public.leads where source_system = lower(trim(p_source_system))
      and source_lead_id = trim(p_source_lead_id) limit 1;
  end if;
  update public.ingestion_events set lead_id = v_lead_id,
    state = case when v_inserted then 'inserted' else 'duplicate' end,
    error = null, updated_at = now()
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

revoke all on function public.rotate_ingestion_api_key(text,text,text,uuid) from public, anon, authenticated;
revoke all on function public.revoke_ingestion_api_key(text,uuid) from public, anon, authenticated;
grant execute on function public.rotate_ingestion_api_key(text,text,text,uuid) to service_role;
grant execute on function public.revoke_ingestion_api_key(text,uuid) to service_role;
