-- Only deterministic CSV/Excel uploads defer dispatch; ordinary ingestion is unchanged.
create table leadlaju_private.import_dispatch_pending (
 brand_id uuid primary key references public.brands(id), requested_at timestamptz not null default now()
);
alter table leadlaju_private.import_dispatch_pending enable row level security;
grant select,insert,update,delete on leadlaju_private.import_dispatch_pending to leadlaju_tenant_executor;
create policy tenant_import_dispatch on leadlaju_private.import_dispatch_pending
 to leadlaju_tenant_executor using (brand_id=leadlaju_private.request_brand())
 with check (brand_id=leadlaju_private.request_brand());
do $$ declare d text; needle text := 'perform leadlaju_private.dispatch_available_leads(now());'; begin
 select pg_get_functiondef(p.oid) into strict d from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='ingest_lead';
 if position(needle in d)=0 then raise exception 'Unexpected ingest definition'; end if;
 execute replace(d,needle,$replacement$
 if lower(trim(p_source_system))='dashboard' and p_source_lead_id ~ '^upload-[a-f0-9]{32}$' then
   insert into leadlaju_private.import_dispatch_pending(brand_id) values(leadlaju_private.request_brand())
   on conflict(brand_id) do update set requested_at=excluded.requested_at;
 else
   perform leadlaju_private.dispatch_available_leads(now());
 end if;
 $replacement$);
end $$;
create function leadlaju_private.process_import_dispatch() returns integer
language plpgsql security definer set search_path='' as $$
declare b record; total integer:=0; previous_brand text:=current_setting('leadlaju.worker_brand',true);
begin
 if auth.uid() is not null or coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'='service_role' then
  raise exception 'Trusted scheduler required' using errcode='42501';
 end if;
 for b in select q.brand_id from leadlaju_private.import_dispatch_pending q
 join public.brands x on x.id=q.brand_id where x.active for update of q skip locked loop
  begin
   perform set_config('leadlaju.worker_brand',b.brand_id::text,true);
   total:=total+leadlaju_private.dispatch_available_leads(clock_timestamp());
   delete from leadlaju_private.import_dispatch_pending where brand_id=b.brand_id;
  exception when others then
   raise warning 'Import dispatch deferred for brand %, SQLSTATE %', b.brand_id,sqlstate;
  end;
 end loop;
 perform set_config('leadlaju.worker_brand',coalesce(previous_brand,''),true);
 return total;
end $$;
revoke all on function leadlaju_private.process_import_dispatch() from public,anon,authenticated,service_role;
select cron.schedule('leadlaju-import-dispatch','* * * * *','select leadlaju_private.process_import_dispatch()');
