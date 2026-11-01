begin;
set local request.jwt.claims='{}';
create temporary table fixture_cron_logs(runid bigint primary key,status text,end_time timestamptz);
create temporary table fixture_cron_cursor(singleton boolean primary key,last_runid bigint,updated_at timestamptz);
insert into fixture_cron_cursor values(true,0,now());
insert into fixture_cron_logs select i,'succeeded',now()-interval '8 days' from generate_series(1,2100)i;
insert into fixture_cron_logs values(2101,'succeeded',now()),(2102,'failed',now()-interval '29 days'),(2103,'running',null),(2104,'failed',now()-interval '31 days'),(2105,'succeeded',now()-interval '7 days');
do $$declare d text;begin
 d:=pg_get_functiondef('leadlaju_private.prune_completed_cron_logs()'::regprocedure);
 d:=replace(d,'leadlaju_private.prune_completed_cron_logs','pg_temp.test_tail_cleanup');
 d:=replace(d,'leadlaju_private.cron_retention_cursor','pg_temp.fixture_cron_cursor');
 d:=replace(d,'cron.job_run_details','pg_temp.fixture_cron_logs');
 d:=replace(d,'leadlaju-cron-retention','leadlaju-test-tail');
 execute d;
end $$;
do $$begin
 if pg_temp.test_tail_cleanup()<>1000 then raise exception 'Batch cap';end if;
 if pg_temp.test_tail_cleanup()<>1000 then raise exception 'Second batch';end if;
 if pg_temp.test_tail_cleanup()<>101 then raise exception 'Success/failed retention';end if;
 if (select last_runid from fixture_cron_cursor)<>0 then raise exception 'Busy tail must wrap';end if;
 update fixture_cron_logs set end_time=now()-interval '8 days' where runid=2101;
 -- Continuously growing live tail must not starve old eligible rows again.
 insert into fixture_cron_logs values(2106,'succeeded',now());
 if pg_temp.test_tail_cleanup()<>1 then raise exception 'Newly aged row starved';end if;
 if (select count(*) from fixture_cron_logs)<>4 then raise exception 'Recent, boundary, failed and running logs changed';end if;
 if pg_temp.test_tail_cleanup()<>0 then raise exception 'No-op removed protected logs';end if;
end $$;
rollback;
