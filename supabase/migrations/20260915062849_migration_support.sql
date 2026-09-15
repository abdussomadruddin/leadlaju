alter table public.profiles add column source_agent_id text;
create unique index profiles_source_agent_id_unique on public.profiles (source_agent_id)
  where source_agent_id is not null;

alter table public.reminders add column source_reminder_id text;
alter table public.reminders add constraint reminders_source_reminder_id_unique unique (source_reminder_id);
