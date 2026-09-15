create extension if not exists pg_net with schema extensions;

do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname='leadlaju-process-notification-outbox';
  if v_job is not null then perform cron.unschedule(v_job); end if;
  perform cron.schedule(
    'leadlaju-process-notification-outbox',
    '5 seconds',
    $job$
      select net.http_post(
        url := 'https://zvplvrtqvsfrftnjfdsh.supabase.co/functions/v1/process-notification-outbox',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'X-LeadLaju-Worker',(select decrypted_secret from vault.decrypted_secrets where name='notification_worker_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 10000
      )
    $job$
  );
end;
$$;
