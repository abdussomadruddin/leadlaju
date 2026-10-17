-- Preserve current tenant owners, grants, signatures and action guards.
do $patch$
declare definition text; f record; changed text;
begin
 definition:=pg_get_functiondef('public.record_lead_follow_up(uuid,integer)'::regprocedure);
 if strpos(definition,'v_next_count = 3')=0 then raise exception 'Unexpected follow-up action shape';end if;
 definition:=replace(definition,'v_next_count integer;','v_next_count integer; v_promote boolean;');
 definition:=replace(definition,'v_next_count := v_lead.follow_up_count + 1;',
   'v_next_count := v_lead.follow_up_count + 1; v_promote := v_next_count >= 4 and v_lead.status = ''contacted'';');
 execute replace(definition,'v_next_count = 3','v_promote');
 -- Only predicates comparing activity to a due threshold are changed.
 -- Status totals and New-lead reminders remain unchanged.
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname in ('public','leadlaju_private') and p.prokind='f'
     and p.prosrc like '%follow_up_activity_at%' and p.prosrc like '%interval%'
 loop
   definition:=pg_get_functiondef(f.oid);
   changed:=regexp_replace(definition,
     '((?:[a-z_]+\.)?)follow_up_activity_at\s*<=\s*(now\(\)|p_now)\s*-\s*interval',
     '\1follow_up_count < 4 and \1follow_up_activity_at <= \2 - interval','g');
   if changed<>definition then execute changed;end if;
 end loop;
end $patch$;

-- Backfill only Contacted 4–6. No assignments or existing history removed.
with changed as (
 update public.leads set status='all_offer_presented',queue_state='all_offer_presented',
   status_revision=status_revision+1,status_updated_at=now(),updated_at=now()
 where status='contacted' and follow_up_count>=4
 returning id,brand_id,assignment_revision,status_revision,follow_up_count
)
insert into public.lead_events(lead_id,brand_id,event_type,assignment_revision,status_revision,payload)
select id,brand_id,'status_changed:all_offer_presented',assignment_revision,status_revision,
 jsonb_build_object('reason','follow_up_four_backfill','follow_up_count',follow_up_count) from changed;
