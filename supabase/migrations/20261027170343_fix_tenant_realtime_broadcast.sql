-- Server producers run as the restricted tenant executor. Clients retain only
-- their existing receive policy; they cannot publish messages through this rule.
create policy leadlaju_tenant_broadcast_insert
on realtime.messages for insert to leadlaju_tenant_executor
with check (
  extension = 'broadcast' and private = true
  and leadlaju_private.request_brand() is not null
  and (
    topic = 'brand:' || leadlaju_private.request_brand()::text || ':operations'
    or exists (
      select 1 from public.profiles p
      where p.brand_id = leadlaju_private.request_brand()
        and topic = 'user:' || p.id::text
    )
  )
);
