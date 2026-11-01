# Resource efficiency follow-up — 1 November 2026

## Evidence before release

24-hour chart around 16:18 Kuala Lumpur: CPU 3.68%, memory used 890 MB,
commitment 1.24 GB. SQL snapshot: 20 connections, zero lock waits; the latest
2,000 cron executions (about one hour) had zero failures. Disk I/O charts failed
to load: no claim that physical disk pressure has been eliminated.

Database was approximately 0.82 GB, up about 200 MB since 28 October. Cron logs
occupied about 560 MB. An explicit age check found 839,287 cron rows, including
519,180 successful rows older than the existing seven-day retention.

The old cleanup cursor only wrapped after an empty page. Continuous cron inserts
made every tail page nonempty, so the cursor never revisited newly aged rows.
The repair wraps at a short final page, retaining the 2,000-row scan, 1,000-row
delete limit, advisory try-lock, one-minute schedule and 7/30-day success/failure
retention. No immediate bulk deletion or forced vacuum is performed. Existing
cleanup drains the backlog gradually; physical relation size need not shrink,
but ordinary vacuum can make the space reusable. No lead/history is pruned.

Realtime already rotates daily partitions. On November 1, October 29 onward was
present; October 28 was gone, consistent with Supabase's managed three-day
retention (daily partitions can retain messages up to four days). No additional
cleanup job, partition deletion or retention change is justified.

## Contact reliability

Twenty-one recent FK errors came from contact requests referencing absent leads.
`contact_assignment` now locks and validates the canonical lead before inserting
its FK-backed action. Missing/nonowned/cross-brand leads are denied, stale revisions
return a terminal response, and action replays validate actor/lead/revision/type.
API signature, tenant executor ownership, RLS, cooldown and successful idempotency
remain unchanged. The frontend retires authoritative rejections in its durable
outbox; transient failures keep the same action ID with bounded 2–60 second
backoff. Overlapping sends and drains share their pending request. Brand/account
switches stop the old drain and suppress its reload.

## Dashboard measurement

Controlled same-transaction EXPLAIN ANALYZE and exact payload comparisons against
live data, before permanent changes:

| Context | RPC before / candidate ms | Plan before / candidate ms | Shared hits before / candidate |
| --- | ---: | ---: | ---: |
| Agent-brand admin | 797 / 469 | 727 / 437 | 9,033 / 1,203 |
| Agent-brand Master | 607 / 407 | 598 / 411 | 9,036 / 1,206 |
| Team Sales admin | 54 / 31 | 21 / 20 | 562 / 454 |

The candidate materializes visible leads once for history and projection. Agent
reads did not consistently benefit, so the original query is retained for agents.
All six role/brand payload comparisons passed again using the final conditional
implementation in a rolled-back production transaction. Physical reads and temp
writes were zero in the warm-cache sample; shared hits are not billable Disk I/O.
No additional index was justified. These samples are not latency percentiles.

## Verification and operations

- 445 Node regression tests; 252 real PostgreSQL assertions plus disposable
  retention-tail, Neglected Lead, dispatch and scheduler-lock scenarios.
- Desktop/iPhone/Android: 21 durable contact retry assertions, 21 sync assertions,
  84 Team Sales Copy assertions and 24 authenticated Realtime assertions.
- Live rollback verification: six payload contexts equal; missing lead denied
  without FK insertion; function owners unchanged and anonymous execution denied.
- Syntax and git diff checks pass. Phone browser fixtures do not establish physical
  push delivery or guaranteed uptime under every future load.

Migration: `20261101082544_repair_stale_contacts_and_dashboard_reads`.
PWA cache v179. Definition backup and measurements are stored privately outside
Git at `/Users/abdussomad/LeadLaju-resource-backup-20261101`.

Recheck after 24 hours using `scripts/resource-health.sql`, existing charts and
logs. Compare uptime before query deltas, cron cursor progress/backlog samples,
resource trends and final-action errors. No plan/compute change or restart.
