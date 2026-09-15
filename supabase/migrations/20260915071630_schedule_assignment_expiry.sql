create extension if not exists pg_cron with schema pg_catalog;

do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname='leadlaju-expire-assignments';
  if v_job is not null then perform cron.unschedule(v_job); end if;
  perform cron.schedule(
    'leadlaju-expire-assignments',
    '5 seconds',
    'select leadlaju_private.expire_assignments(clock_timestamp())'
  );
end;
$$;
