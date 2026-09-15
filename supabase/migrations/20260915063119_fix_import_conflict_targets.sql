drop index if exists public.leads_source_identity_unique;
alter table public.leads add constraint leads_source_identity_unique unique (source_system, source_lead_id);

drop index if exists public.reminders_source_reminder_id_unique;
alter table public.reminders add constraint reminders_source_reminder_id_unique unique (source_reminder_id);
