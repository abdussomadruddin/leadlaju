-- Same tenant boundary, evaluated once per statement rather than per row.
-- No role grants, ownership changes or business-data updates.
do $$
declare p record;
begin
  for p in select schemaname,tablename,policyname,qual,with_check from pg_policies
    where schemaname='public' and 'leadlaju_tenant_executor'=any(roles)
    and policyname in ('tenant_executor','tenant_executor_brands','notes_receipts_tenant')
  loop
    if p.qual <> '(brand_id = leadlaju_private.request_brand())' and
       p.qual <> '(id = leadlaju_private.request_brand())' then
      raise exception 'Unexpected policy shape: %.%',p.tablename,p.policyname;
    end if;
    execute format('alter policy %I on %I.%I using (%s)%s',p.policyname,p.schemaname,p.tablename,
      replace(p.qual,'leadlaju_private.request_brand()','(select leadlaju_private.request_brand())'),
      case when p.with_check is null then '' else ' with check ('||replace(p.with_check,'leadlaju_private.request_brand()','(select leadlaju_private.request_brand())')||')' end);
  end loop;
end;
$$;
create index if not exists lead_events_brand_created_dashboard_idx
on public.lead_events(brand_id,created_at desc);
