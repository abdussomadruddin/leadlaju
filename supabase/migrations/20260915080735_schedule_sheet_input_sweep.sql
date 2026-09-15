do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname='leadlaju-sweep-sheet-input';
  if v_job is not null then perform cron.unschedule(v_job); end if;
  perform cron.schedule(
    'leadlaju-sweep-sheet-input',
    '* * * * *',
    $job$
      select net.http_post(
        url := 'https://zvplvrtqvsfrftnjfdsh.supabase.co/functions/v1/sweep-sheet-input',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'X-LeadLaju-Worker',(select decrypted_secret from vault.decrypted_secrets where name='notification_worker_secret')
        ),
        body := jsonb_build_object(
          'sheet_endpoint','https://script.google.com/macros/s/AKfycbyXEPXT-m6YETnvOZEy0CxF82CMmMGDmgpVmDIv-a7XTEdJp92mYkOQhaBSRTPnNH7K/exec'
        ),
        timeout_milliseconds := 30000
      )
    $job$
  );
end;
$$;
