create index action_requests_actor_id_idx on public.action_requests (actor_id);
create index agent_project_eligibility_project_id_idx on public.agent_project_eligibility (project_id);
create index appointments_assigned_agent_id_idx on public.appointments (assigned_agent_id);
create index appointments_lead_id_idx on public.appointments (lead_id);
create index appointments_parent_appointment_id_idx on public.appointments (parent_appointment_id);
create index ingestion_events_lead_id_idx on public.ingestion_events (lead_id);
create index lead_events_actor_id_idx on public.lead_events (actor_id);
create index lead_events_assignment_id_idx on public.lead_events (assignment_id);
create index lead_events_lead_id_idx on public.lead_events (lead_id, created_at desc);
create index leads_project_id_idx on public.leads (project_id);
create index leads_queue_dispatch_idx on public.leads (status, queue_state, pass_count, created_at, queued_at);
create index notification_outbox_lead_id_idx on public.notification_outbox (lead_id);
create index notification_outbox_pending_idx on public.notification_outbox (available_at, id)
  where sent_at is null;
create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id) where active;
create index reminders_created_by_id_idx on public.reminders (created_by_id);

create policy dispatch_state_admin_read on public.dispatch_state for select to authenticated
  using (leadlaju_private.is_admin((select auth.uid())));
create policy project_dispatch_state_admin_read on public.project_dispatch_state for select to authenticated
  using (leadlaju_private.is_admin((select auth.uid())));
create policy ingestion_events_admin_read on public.ingestion_events for select to authenticated
  using (leadlaju_private.is_admin((select auth.uid())));

grant select on public.dispatch_state, public.project_dispatch_state, public.ingestion_events to authenticated;
