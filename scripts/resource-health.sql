-- Read-only, on-demand snapshot. No polling, deletion or statistics reset.
-- The cron sample is explicitly bounded to its latest 2,000 runs, not all history.
with recent_cron as materialized (
 select jobid,status,start_time,end_time from cron.job_run_details order by runid desc limit 2000
)
select jsonb_build_object(
 'captured_at',now(),'database_started',pg_postmaster_start_time(),
 'database_bytes',pg_database_size(current_database()),
 'max_connections',current_setting('max_connections'),
 'connections',(select count(*) from pg_stat_activity),
 'active_queries',(select count(*) from pg_stat_activity where state='active' and pid<>pg_backend_pid()),
 'waiting_on_locks',(select count(*) from pg_stat_activity where wait_event_type='Lock'),
 'queries',(select jsonb_agg(s) from (
   select queryid,left(query,1000) query,calls,total_exec_time,mean_exec_time,
     shared_blks_read,shared_blks_hit,shared_blks_written,temp_blks_written
   from extensions.pg_stat_statements order by total_exec_time desc limit 20
 )s),
 'cron_latest_2000',(select jsonb_agg(s) from (
   select j.jobid,j.jobname,j.schedule,j.active,
     count(r.jobid) runs,count(*) filter(where r.status='failed') failures,
     max(r.start_time) latest_start,
     round(avg(extract(epoch from(r.end_time-r.start_time)))::numeric,3) mean_seconds
   from cron.job j left join recent_cron r using(jobid)
   group by j.jobid,j.jobname,j.schedule,j.active order by j.jobid
 )s),
 'function_versions',(select jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,
   'owner',pg_get_userbyid(p.proowner),'definition_md5',md5(pg_get_functiondef(p.oid))))
   from pg_proc p where p.oid in (
     'public.get_dashboard_state()'::regprocedure,
     'leadlaju_private.expire_assignments(timestamptz)'::regprocedure,
     'leadlaju_private.dispatch_available_leads_current_cycle(timestamptz)'::regprocedure,
     'leadlaju_private.dispatch_available_leads_agent_brand(timestamptz)'::regprocedure,
     'leadlaju_private.sweep_agent_due_gate()'::regprocedure
   ))
) snapshot;
