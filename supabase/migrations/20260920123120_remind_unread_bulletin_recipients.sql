create or replace function public.remind_bulletin_unread(p_bulletin_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bulletin public.bulletins%rowtype;
  v_reminder_id uuid := gen_random_uuid();
  v_unread_count integer := 0;
  v_enqueued_count integer := 0;
begin
  perform leadlaju_private.assert_bulletin_admin();
  select * into v_bulletin
  from public.bulletins
  where id = p_bulletin_id and status = 'published'
  for update;

  if not found then raise exception 'Published bulletin not found'; end if;

  select count(*) into v_unread_count
  from public.bulletin_recipients
  where bulletin_id = p_bulletin_id and read_at is null;

  insert into public.notification_outbox(user_id, notification_type, payload, dedupe_key)
  select r.agent_id, 'bulletin', jsonb_build_object(
    'title', 'Peringatan Buletin: ' || v_bulletin.title,
    'body', left(regexp_replace(v_bulletin.body, '\\s+', ' ', 'g'), 140),
    'tag', 'leadlaju-bulletin-' || v_bulletin.id::text,
    'view', 'bulletins',
    'url', '/?view=bulletins&bulletin=' || v_bulletin.id::text,
    'bulletinId', v_bulletin.id::text,
    'renotify', true,
    'requireInteraction', false,
    'reminderId', v_reminder_id::text
  ), 'bulletin_reminder:' || v_reminder_id::text || ':' || r.agent_id::text
  from public.bulletin_recipients r
  where r.bulletin_id = p_bulletin_id and r.read_at is null
  on conflict do nothing;

  get diagnostics v_enqueued_count = row_count;
  return jsonb_build_object('ok', true, 'id', p_bulletin_id, 'reminder_id', v_reminder_id, 'unread_count', v_unread_count, 'enqueued_count', v_enqueued_count);
end;
$$;

revoke all on function public.remind_bulletin_unread(uuid) from public, anon;
grant execute on function public.remind_bulletin_unread(uuid) to authenticated;
