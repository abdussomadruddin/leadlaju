create or replace function public.claim_notification_outbox(p_limit integer default 20)
returns table(
  outbox_id bigint, payload jsonb, endpoint text, p256dh text, auth_secret text,
  subscription_id uuid, user_id uuid
) language plpgsql security definer set search_path = '' as $$
begin
  return query
  with claimed as (
    select n.id from public.notification_outbox n
    where n.sent_at is null and n.available_at<=now()
      and (n.claimed_at is null or n.claimed_at<now()-interval '2 minutes')
    order by n.available_at,n.id
    for update skip locked limit greatest(1,least(coalesce(p_limit,20),100))
  ), marked as (
    update public.notification_outbox n set claimed_at=now(),attempts=n.attempts+1
    from claimed c where n.id=c.id
    returning n.id,n.user_id,n.payload
  )
  select m.id,m.payload,s.endpoint,s.p256dh,s.auth,s.id,m.user_id
  from marked m left join public.push_subscriptions s on s.user_id=m.user_id and s.active
  order by m.id,s.id;
end;
$$;

create or replace function public.finish_notification_outbox(
  p_outbox_id bigint, p_success boolean, p_error text default null
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.notification_outbox set
    sent_at=case when p_success then now() else sent_at end,
    claimed_at=null,
    last_error=case when p_success then null else left(coalesce(p_error,'Push failed'),500) end,
    available_at=case when p_success then available_at else now()+least(interval '15 minutes',interval '15 seconds'*greatest(1,attempts)) end
  where id=p_outbox_id;
end;
$$;

revoke all on function public.claim_notification_outbox(integer) from public,anon,authenticated;
revoke all on function public.finish_notification_outbox(bigint,boolean,text) from public,anon,authenticated;
grant execute on function public.claim_notification_outbox(integer) to service_role;
grant execute on function public.finish_notification_outbox(bigint,boolean,text) to service_role;
