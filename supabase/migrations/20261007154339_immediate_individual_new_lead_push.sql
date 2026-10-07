-- Wake the trusted worker immediately after a new-lead outbox insert commits.
-- pg_net queues HTTP until commit. Retry cron remains as recovery, not batching.
create or replace function leadlaju_private.wake_new_lead_notification_worker()
returns trigger language plpgsql security definer set search_path='' as $$
declare secret text;
begin
 if new.notification_type not in ('new_lead','sales_new_lead') then return new; end if;
 select decrypted_secret into secret from vault.decrypted_secrets where name='notification_worker_secret' limit 1;
 if coalesce(secret,'')='' then return new; end if;
 perform net.http_post(
   url:='https://zvplvrtqvsfrftnjfdsh.supabase.co/functions/v1/process-notification-outbox',
   headers:=jsonb_build_object('Content-Type','application/json','X-LeadLaju-Worker',secret),
   body:='{}'::jsonb,timeout_milliseconds:=10000);
 return new;
exception when others then
 -- A transient transport failure must not cancel ingestion or assignment.
 raise warning 'Notification worker wake failed: %',sqlstate;
 return new;
end $$;
revoke all on function leadlaju_private.wake_new_lead_notification_worker() from public,anon,authenticated,service_role;
create trigger wake_new_lead_notification_worker
after insert on public.notification_outbox for each row
execute function leadlaju_private.wake_new_lead_notification_worker();
