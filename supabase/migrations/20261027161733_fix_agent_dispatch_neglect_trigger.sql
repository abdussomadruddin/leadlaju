-- GET LEAD and successful contact can synchronously dispatch queued leads for
-- other eligible agents. Auth.uid() is still the caller during those internal
-- writes. Recognize only the dispatcher's exact New assignment/expiry shapes;
-- keep non-owner business edits, RLS, grants and Neglected invariants unchanged.
do $migration$
declare d text; original text := $old$ if auth.uid() is not null and not leadlaju_private.is_admin(auth.uid()) and old.assigned_agent_id is distinct from auth.uid() then
   raise exception 'Lead bukan milik ejen ini' using errcode='42501';
 end if;$old$;
begin
 d:=pg_get_functiondef('leadlaju_private.track_neglect_activity()'::regprocedure);
 if position(original in d)=0 then raise exception 'Unexpected Neglected ownership guard'; end if;
 execute replace(d,original,$new$ if auth.uid() is not null and not leadlaju_private.is_admin(auth.uid()) and old.assigned_agent_id is distinct from auth.uid() then
   if not coalesce((
     old.status='new' and new.status='new'
     and not old.admin_assigned and not new.admin_assigned
     and not old.neglected_held and not new.neglected_held
     and new.assignment_revision=old.assignment_revision+1
     and (to_jsonb(new)-array['assigned_agent_id','received_at','expires_at','queued_at','queue_state',
       'assignment_revision','updated_at','pass_count','retry_after_cycle','neglect_activity_at'])
       = (to_jsonb(old)-array['assigned_agent_id','received_at','expires_at','queued_at','queue_state',
       'assignment_revision','updated_at','pass_count','retry_after_cycle','neglect_activity_at'])
     and (
       (old.queue_state='queued' and new.queue_state='active'
         and old.assigned_agent_id is null and new.assigned_agent_id is not null
         and new.received_at is not null and new.expires_at=new.received_at+interval '5 minutes'
         and new.queued_at is null and new.pass_count=old.pass_count
         and new.retry_after_cycle=old.retry_after_cycle)
       or (old.queue_state='active' and new.queue_state='queued'
         and old.assigned_agent_id is not null and new.assigned_agent_id is null
         and old.expires_at<=clock_timestamp() and new.received_at is null and new.expires_at is null
         and new.queued_at is not null and new.pass_count=old.pass_count+1)
     )
   ),false) then raise exception 'Lead bukan milik ejen ini' using errcode='42501'; end if;
 end if;$new$);
end $migration$;
