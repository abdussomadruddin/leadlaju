-- Re-check the same account gates at both core candidate selections.
-- Preserve tenant owner, lock ordering, timer and round-robin algorithm.
do $migration$
declare
 definition text;
 old_guard text := $old$where p.role = 'agent' and p.active and p.approval_status = 'approved'$old$;
 new_guard text := $new$where p.role = 'agent' and p.active and p.approval_status = 'approved'
      and p.get_lead_allowed and not p.follow_up_due_blocked$new$;
begin
 definition := pg_get_functiondef('leadlaju_private.dispatch_available_leads_current_cycle(timestamptz)'::regprocedure);
 if strpos(definition,new_guard)>0 then return; end if;
 if (length(definition)-length(replace(definition,old_guard,'')))/length(old_guard)<>2 then
   raise exception 'Unexpected core dispatcher: expected two candidate guards';
 end if;
 execute replace(definition,old_guard,new_guard);
end $migration$;
