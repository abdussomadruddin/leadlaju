-- Installation alone does not run or schedule a deletion. Approved release only.
-- cron.job_run_details is platform-owned: reuse its PK rather than widen ownership.
create table leadlaju_private.cron_retention_cursor (
 singleton boolean primary key default true check (singleton),
 last_runid bigint not null default 0 check (last_runid >= 0),
 updated_at timestamptz not null default now()
);
alter table leadlaju_private.cron_retention_cursor enable row level security;
revoke all on leadlaju_private.cron_retention_cursor from public,anon,authenticated,service_role;
insert into leadlaju_private.cron_retention_cursor(singleton) values(true);

create or replace function leadlaju_private.prune_completed_cron_logs() returns integer
language plpgsql security definer set search_path='' as $$
declare cursor_id bigint; scanned_id bigint; affected integer;
begin
 if auth.uid() is not null or coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'='service_role' then
  raise exception 'Trusted scheduler required' using errcode='42501';
 end if;
 if not pg_try_advisory_xact_lock(hashtext('leadlaju-cron-retention')) then return 0; end if;
 select last_runid into strict cursor_id from leadlaju_private.cron_retention_cursor where singleton for update;
 -- Materialize a PK range BEFORE filtering age/status. Even a no-op is bounded.
 with scanned as materialized (
  select runid,status,end_time from cron.job_run_details where runid>cursor_id order by runid limit 2000
 ), victims as materialized (
  select locked.runid,locked.tid from scanned s cross join lateral (
   select d.runid,d.ctid as tid from cron.job_run_details d
   where d.runid=s.runid for update of d skip locked
  ) locked
  where s.end_time is not null and ((s.status='succeeded' and s.end_time<now()-interval '7 days')
   or (s.status='failed' and s.end_time<now()-interval '30 days'))
  order by s.runid limit 1000
 ), removed as (
  delete from cron.job_run_details d using victims v where d.ctid=v.tid returning d.runid
 ) select count(*)::integer,
  case when count(*)=1000 then max(runid) else (select max(runid) from scanned) end
  into affected,scanned_id from removed;
 -- At end of the sweep, wrap so previously recent/locked rows are revisited.
 update leadlaju_private.cron_retention_cursor set last_runid=coalesce(scanned_id,0),updated_at=now() where singleton;
 return affected;
end $$;
revoke all on function leadlaju_private.prune_completed_cron_logs() from public,anon,authenticated,service_role;
