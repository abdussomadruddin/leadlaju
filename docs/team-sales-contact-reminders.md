# Team Sales contact reminders

Agent-mode brands are unchanged. Team Sales dashboard status buttons use current
ownership and assignment history dates in Asia/Kuala_Lumpur, matching the server
performance report. Follow Up Due is current outstanding work, not date-filtered.

The minute scheduler creates owner reminders at 15/60 minutes from ingestion.
A late assignment receives only the latest eligible stage. Each lead/stage is
claimed once, irrespective of subsequent assignment revisions. Admin summaries
combine newly eligible leads per brand/tick. No expiry, penalty or redistribution
is introduced.

The delivery worker revalidates active brand, recipient, New status, owner and
assignment revision before each device/retry. Admin payloads drop obsolete leads.
No subscription or delivery failure remains retryable; obsolete jobs are retired.
The database receipts are private, RLS-enabled and inaccessible to API roles.

## Coordinated release

1. Back up database and record counts; run local SQL/RLS, regression and browser tests.
2. Apply `20261004135026_team_sales_action_reminders.sql`. Its cutoff is initially
   `infinity`, so the scheduler cannot enqueue historical reminders.
3. Deploy `process-notification-outbox`; run the rollback-only production tests
   `scripts/test-sales-reminders-production.sql` and `scripts/test-team-sales-production.sql`.
4. Deploy frontend/PWA cache v137 and verify production assets/READY state.
5. Activate once through trusted operator SQL:

```sql
update leadlaju_private.sales_reminder_release
set activated_at = clock_timestamp()
where activated_at = 'infinity'::timestamptz;
```

Do not reset that cutoff during subsequent deployments. Scheduler delivery occurs
on the first eligible tick, followed by the existing outbox worker. Device/browser
permission, connectivity and OS policy can delay actual notification presentation.
Browser fixtures do not establish physical iPhone/Android push reception.
