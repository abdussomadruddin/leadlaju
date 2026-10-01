-- Notes-mode TikTok ingestion only; legacy provider/Agent ingestion is unchanged.
create table public.notes_ingestion_receipts (
  id uuid primary key default extensions.gen_random_uuid(),
  brand_id uuid not null references public.brands(id),
  project_id uuid not null,
  phone text not null,
  lead_id uuid not null,
  original_source_lead_id text not null default '',
  accepted_at timestamptz not null default clock_timestamp(),
  foreign key (brand_id,project_id) references public.projects(brand_id,id),
  foreign key (brand_id,lead_id) references public.leads(brand_id,id) on delete cascade
);
create index notes_ingestion_recent on public.notes_ingestion_receipts(brand_id,project_id,phone,accepted_at desc);
alter table public.notes_ingestion_receipts enable row level security;
grant select,insert on public.notes_ingestion_receipts to leadlaju_tenant_executor;
create policy notes_receipts_tenant on public.notes_ingestion_receipts for all to leadlaju_tenant_executor
  using (brand_id=leadlaju_private.request_brand()) with check (brand_id=leadlaju_private.request_brand());
revoke all on public.notes_ingestion_receipts from public,anon,authenticated;

create function public.ingest_notes_lead(
  p_ingestion_key text, p_source_system text, p_source_lead_id text,
  p_name text, p_phone text, p_email text, p_city text, p_project_name text,
  p_source text, p_notes text, p_created_at timestamptz, p_payload_hash text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_brand uuid := leadlaju_private.request_brand();
  v_project uuid;
  v_lead uuid;
  v_phone text := regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
  v_now timestamptz;
  v_occurrence text;
  v_result jsonb;
begin
  if v_brand is null or lower(trim(p_source_system)) <> 'tiktok_ads' then
    raise exception 'Notes ingestion requires a valid TikTok brand context' using errcode='42501';
  end if;
  if not exists(select 1 from public.brands where id=v_brand and active) then
    raise exception 'Brand is inactive' using errcode='42501';
  end if;
  if left(v_phone,1)='0' then v_phone:='60'||substr(v_phone,2); end if;
  if v_phone !~ '^601[0-9]{8,9}$' or coalesce(trim(p_name),'')='' or coalesce(trim(p_notes),'')='' then
    raise exception 'Invalid notes ingestion payload';
  end if;
  select id into v_project from public.projects where brand_id=v_brand and active and lower(name)=lower(trim(p_project_name));
  if v_project is null then raise exception 'Project is not active or does not exist'; end if;
  -- Same brand + canonical project + normalized phone must serialize, including concurrent requests.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_brand::text||':'||v_project::text||':'||v_phone,0));
  v_now := clock_timestamp();
  select lead_id into v_lead from public.notes_ingestion_receipts
    where brand_id=v_brand and project_id=v_project and phone=v_phone
      and accepted_at >= v_now-interval '10 minutes'
    order by accepted_at desc limit 1;
  if v_lead is not null then
    return jsonb_build_object('ok',true,'result','duplicate','lead_id',v_lead,'duplicate_window_minutes',10);
  end if;
  -- A later enquiry is a new occurrence even if Pabbly reuses its original source ID.
  -- Preserve the original ID in the receipt instead of altering any historic lead IDs.
  v_occurrence := coalesce(nullif(trim(p_source_lead_id),''),'notes')||':notes:'||extensions.gen_random_uuid()::text;
  v_result := public.ingest_lead('tiktok_ads:'||v_occurrence,'tiktok_ads',v_occurrence,
    p_name,v_phone,p_email,p_city,p_project_name,p_source,p_notes,p_created_at,p_payload_hash);
  if v_result->>'result' <> 'inserted' then raise exception 'Notes occurrence was not inserted'; end if;
  insert into public.notes_ingestion_receipts(brand_id,project_id,phone,lead_id,original_source_lead_id,accepted_at)
    values(v_brand,v_project,v_phone,(v_result->>'lead_id')::uuid,coalesce(p_source_lead_id,''),v_now);
  return v_result;
end;
$$;
-- PostgreSQL requires CREATE on the containing schema during ownership transfer.
-- Scope that permission to this migration transaction, not the runtime role.
grant create on schema public to leadlaju_tenant_executor;
alter function public.ingest_notes_lead(text,text,text,text,text,text,text,text,text,text,timestamptz,text) owner to leadlaju_tenant_executor;
revoke create on schema public from leadlaju_tenant_executor;
revoke all on function public.ingest_notes_lead(text,text,text,text,text,text,text,text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.ingest_notes_lead(text,text,text,text,text,text,text,text,text,text,timestamptz,text) to service_role;
