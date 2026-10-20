// Produces disposable fixture SQL only. All writes end in ROLLBACK.
import fs from 'node:fs';
const source=fs.readFileSync('supabase/migrations/20261020152610_optimize_cron_retention_batches.sql','utf8');
const fn=source.slice(source.indexOf('create or replace function'),source.indexOf('revoke all on function'))
 .replaceAll('leadlaju_private.prune_completed_cron_logs','pg_temp.test_prune_cron')
 .replaceAll('leadlaju_private.cron_retention_cursor','pg_temp.test_cursor')
 .replaceAll('cron.job_run_details','pg_temp.test_logs')
 .replaceAll('leadlaju-cron-retention','leadlaju-cron-retention-fixture');
console.log(`begin;set local statement_timeout='15s';set local request.jwt.claims='{}';
create temporary table test_logs(runid bigint primary key,status text,end_time timestamptz);
create temporary table test_cursor(singleton boolean primary key,last_runid bigint,updated_at timestamptz);
insert into test_cursor values(true,0,now());
insert into test_logs select i,'succeeded',now()-interval '8 days' from generate_series(1,1000)i;
insert into test_logs select i,'succeeded',now()-interval '1 day' from generate_series(1001,2000)i;
insert into test_logs select i,'failed',now()-interval '31 days' from generate_series(2001,3000)i;
insert into test_logs values(3001,'failed',now()-interval '1 day'),(3002,'running',now()-interval '40 days'),(3003,'succeeded',null),(3004,'unknown',now()-interval '40 days'),(3005,'succeeded',now()-interval '7 days'),(3006,'failed',now()-interval '30 days');
${fn}
do $$begin
 if pg_temp.test_prune_cron()<>1000 then raise exception 'Success batch';end if;
 if (select last_runid from test_cursor)<>1000 then raise exception 'Cursor skipped capped deletion';end if;
 if pg_temp.test_prune_cron()<>1000 then raise exception 'Failed batch';end if;
 if (select last_runid from test_cursor)<>3000 then raise exception 'Failed cursor';end if;
 if pg_temp.test_prune_cron()<>0 then raise exception 'Ineligible deletion';end if;
 if (select last_runid from test_cursor)<>3006 then raise exception 'No-op must advance';end if;
 if pg_temp.test_prune_cron()<>0 then raise exception 'Wrap must not delete';end if;
 if (select last_runid from test_cursor)<>0 then raise exception 'Must wrap';end if;
 if (select count(*) from test_logs)<>1006 then raise exception 'Preservation';end if;
 update test_logs set end_time=now()-interval '8 days' where runid=1001;
 if pg_temp.test_prune_cron()<>1 then raise exception 'Revisit newly eligible rows';end if;
end $$;
set local request.jwt.claims='{"role":"authenticated","sub":"93000000-0000-4000-8000-000000000001"}';
do $$begin
 begin perform pg_temp.test_prune_cron();raise exception 'Expected authorization denial';exception when insufficient_privilege then null;end;
end $$;
select 'PASS bounded cursor, 1000 cap, 7/30-day boundaries, wrap, protected statuses and authorization; ROLLBACK' result;
rollback;`);
