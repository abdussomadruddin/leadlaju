do $$
declare
  v_job record;
begin
  for v_job in
    select jobid from cron.job
    where jobname in ('leadlaju-sweep-sheet-input', 'leadlaju-export-sheet-report')
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

drop function if exists public.get_sheet_reporting_snapshot();
drop table if exists public.report_export_runs;
