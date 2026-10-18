-- Installation alone never deletes logs. Release must verify an external backup
-- before explicitly scheduling this bounded operator-only function.
create function leadlaju_private.prune_completed_cron_logs() returns integer
language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
 if auth.uid() is not null or coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'='service_role' then
  raise exception 'Trusted scheduler required' using errcode='42501';
 end if;
 if not pg_try_advisory_xact_lock(hashtext('leadlaju-cron-retention')) then return 0; end if;
 with victims as (
  select runid from cron.job_run_details
  where end_time is not null and ((status='succeeded' and end_time<now()-interval '7 days')
   or (status='failed' and end_time<now()-interval '30 days'))
  order by runid limit 1000 for update skip locked
 ) delete from cron.job_run_details d using victims v where d.runid=v.runid;
 get diagnostics affected=row_count;
 return affected;
end $$;
revoke all on function leadlaju_private.prune_completed_cron_logs() from public,anon,authenticated,service_role;
