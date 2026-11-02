# Per-brand Neglected Lead duration

Admin/Master of an active Agent brand can choose 3–14 days in the Neglected Lead tab,
default 5. Team Sales cannot use this setting. Saving calls
`admin_set_neglect_days(p_days integer)` and returns `{ok, neglect_days}`. Brand
reads carry `neglect_days`. A validated `neglect_settings_changed` brand broadcast
updates the saved value/cache without a new database poll; focused drafts remain.

Existing Contacted deadlines are preserved as `neglect_activity_at + 120 hours`.
Only a later Contacted transition, actual note change, or successful recorded
follow-up captures the setting current at that activity. The deadline is a fixed
number of 24-hour days. Technical updates and direct attempts to edit the clock
or deadline are ignored. Leaving Contacted or holding a Neglected lead clears the
deadline. Follow Up 4 auto-status and WhatsApp-after-6 behavior remain unchanged.

The existing ownership/dispatcher trigger remains intact; a later BEFORE trigger
owns the deadline. The scheduler uses a partial deadline index, the existing
200-row locking batch, assignment revisions, exclusions and reminder cancellation.
A settings save updates only the brand and one audit row: no lead sweep, dispatch,
timer reset or notification to agents. Identical saves are no-ops.

## Validation

Run the real PostgreSQL integration suite with the configured embedded-postgres
module. `scripts/test-neglect-days.sql` inserts legacy fixtures before the actual
migration and checks field preservation, default/bounds, tenant/role restrictions,
prospective resets, server-owned clocks and exact deadline behavior. The main
suite also reruns authenticated GET LEAD after the new trigger is installed.
Run `node scripts/test-neglect-days-ui.mjs` against the local app on port 8769,
Node regressions, syntax and diff checks. Browser fixtures do not prove physical
phone push delivery. No production mutation is needed for implementation tests.

## Release when requested

1. Run `node scripts/prepare-neglect-days-release.mjs --backup` with authorized
   SQL access. Keep its private metadata/clock JSONL and verified completion file
   outside Git. It pages 500 clocks at a time and excludes phone/email/notes.
   Review clock counts, null activity cases and definitions against the migration.
   If API/CLI access is unavailable, perform the equivalent read-only backup via
   the authenticated SQL Editor; do not skip verification or widen credentials.
2. Apply `20261102043753_configurable_agent_neglect_days` atomically with a short
   lock timeout on a quiet release window. It changes no business timestamps.
   The transaction's DDL lock protects the brief broadcast-only suppression during
   metadata backfill; all ownership/business triggers stay enabled, and the
   broadcast trigger is restored before commit. Ownership transfer temporarily
   supplies schema CREATE inside the transaction only and restores the original
   runtime privilege before commit. A failure rolls everything back.
3. Check function ownership/grants, audit RLS, the enabled broadcast trigger,
   backfilled clocks, partial index plan and unchanged scheduler cadence.
4. Then deploy frontend with a new PWA cache version, verify production READY,
   live file hashes and admin/master/agent/Team Sales visibility. The frontend's
   new brand column must not be released before the database migration.
5. Observe scheduler duration/failures, pending deadline progress and cross-brand
   UI updates. Returning the setting to 5 affects future activity only; it does
   not undo deadlines already captured by a lead. Do not roll the schema back
   blindly once new durations have been captured.
