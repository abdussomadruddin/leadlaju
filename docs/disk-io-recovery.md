# Bounded Disk I/O recovery

## Diagnosis and boundaries

2026-10-20 audit: cron.job_run_details had ~304k estimated live rows and a 560 MB
relation; its only index is runid and its owner is supabase_admin. No long active
transaction was present in that snapshot. Historical diagnostic/backup queries
were among the largest recorded disk readers. These are cumulative observations,
not proof that cron is the only cause of the Disk I/O alert.

Do not repeatedly count or sort all cron history to monitor this fix. Prefer
pg_stat_all_tables estimates, latest runid ranges and the Database Health charts.
Do not reset pg_stat_statements, disable cron logging globally, kill sessions,
change lead/reminder schedules, force VACUUM FULL or increase paid compute.

## Prepared changes (explicit release required)

- Reuse the cron primary key, reading up to 2,000 rows before eligibility checks.
- Lock/delete at most 1,000 eligible rows using a short-lived locked tuple ID;
  no cursor progress is committed if the statement fails.
- Wrap the cursor so recent or locked rows are revisited in later sweeps.
- Keep completed-success records for at least 7 days, failures for 30 days;
  never delete running, unknown-status, or null-end-time rows.
- One bounded cleanup every minute replaces the 100-call daily burst. It is
  not a change to any operational lead/reminder cron.
- Background fallback reads back off only after errors (60, then 120 seconds).
  Healthy 30-second polling and immediate Realtime/manual requests remain.
- Coalesce identical in-flight presence requests; preserve the five-minute
  heartbeat and server-side leases. Stale context responses cannot confirm them.

## Release and rollback

1. Get approval for permanent deletion of eligible cron logs. No business data
   is targeted. Create an empty private durable backup directory (0700).
2. Run scripts/release-safe-log-retention.mjs --apply with
   LEADLAJU_LOG_BACKUP_DIR pointing to that directory. It stores the previous
   function/schedule and verifies each compressed batch before deleting it.
   Reads have a fixed high-water cursor, so new cron runs cannot extend the job.
3. Install migration 20261020152610 and the bounded cleanup schedule. Verify
   operator-only privileges, cursor advancement and the latest cleanup result.
4. Release frontend with a new PWA version, check READY/live hashes, then compare
   Database Health before/after. No claim of I/O reduction until measured.
5. To stop a problematic new cleanup, unschedule only
   leadlaju-cron-log-retention. Restore its function/schedule from the private
   retention-before.json backup if appropriate. Business cron jobs stay running.
   Deleted history requires the verified external backups to restore; it has no
   in-product undo. Restore only during a separately approved maintenance step.

## Verification

scripts/test-cron-retention-cursor.sql.mjs prints disposable rollback fixture SQL.
It covers page/deletion bounds, no-op progress, wrap, aging rows, status/date
boundaries and authentication rejection. Never substitute the real cron table in
that fixture. The Node regression suite covers polling and heartbeat coalescing.
