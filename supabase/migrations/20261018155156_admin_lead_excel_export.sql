-- A read-only, bounded export path: no dashboard aggregation or assignment history.
create function public.export_brand_leads_page(p_after uuid default null,p_cutoff timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare b uuid; cutoff timestamptz:=coalesce(p_cutoff,statement_timestamp()); result jsonb; total bigint;
begin
 if auth.uid() is null or not leadlaju_private.is_admin(auth.uid()) then
  raise exception 'Admin required' using errcode='42501';
 end if;
 b:=leadlaju_private.request_brand();
 if b is null then raise exception 'Active brand required' using errcode='42501'; end if;
 if cutoff>statement_timestamp() then raise exception 'Invalid export cutoff'; end if;
 if p_after is null then
  select count(*) into total from public.leads where brand_id=b and ingested_at<=cutoff;
 end if;
 with page as materialized (
  select l.id,l.name,l.phone,l.email,l.project_id,l.source,l.status,l.assigned_agent_id,
   l.follow_up_count,l.notes,l.created_at,l.updated_at
  from public.leads l where l.brand_id=b and l.ingested_at<=cutoff
   and (p_after is null or l.id>p_after) order by l.id limit 501
 ), batch as (select * from page order by id limit 500)
 select jsonb_build_object('brand_id',b,'brand_name',br.name,'distribution_mode',br.distribution_mode,
  'cutoff',cutoff,'total',total,'has_more',(select count(*)>500 from page),
  'rows',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from (
   select q.id,q.name,q.phone,q.email,pr.name project,q.source,q.status,p.name owner,
    q.follow_up_count,q.notes,q.created_at,q.updated_at
   from batch q left join public.projects pr on pr.brand_id=b and pr.id=q.project_id
    left join public.profiles p on p.brand_id=b and p.id=q.assigned_agent_id
  ) x),'[]'::jsonb)) into result from public.brands br where br.id=b;
 return result;
end $$;
-- Ownership transfer requires CREATE temporarily; never retain that capability.
grant create on schema public to leadlaju_tenant_executor;
alter function public.export_brand_leads_page(uuid,timestamptz) owner to leadlaju_tenant_executor;
revoke create on schema public from leadlaju_tenant_executor;
revoke all on function public.export_brand_leads_page(uuid,timestamptz) from public,anon,service_role;
grant execute on function public.export_brand_leads_page(uuid,timestamptz) to authenticated;
