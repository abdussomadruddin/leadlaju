# Supabase resource efficiency — 27 October 2026

## Measurements

After the availability incident, the initial live snapshot showed dashboard reads
averaging 636 ms (253 calls), assignment expiry/dispatch 599 ms (132 calls),
performance reports 291 ms (145 calls), and Follow Up Due 141 ms (293 calls).
These are cumulative statistics, not a sustained-load capacity forecast.

Controlled dashboard EXPLAIN comparisons on the same compute and transaction:

| Dashboard | Before | Candidate | Shared buffer hits before / after |
| --- | ---: | ---: | ---: |
| Agent-brand admin | 1,235 ms | 629 ms | 32,319 / 8,271 |
| Team Sales admin | 93 ms | 82 ms | 1,075 / 640 |

Physical reads and temporary writes were zero in these warm-cache samples. Buffer
hits represent database work; they are not equivalent to billable disk I/O.
Results were compared for admin and agent in both brands, plus Master selecting
each brand: six contexts matched every lead field and assignment history. Lead
arrays were normalized by ID for comparison because equal creation timestamps
have no defined order in the existing API.

During this work the dashboard reported an externally initiated compute resize,
then Micro. This release did not request that change. Do not attribute differences
between snapshots spanning that restart to these code changes.

## Changes and retained behavior

- Aggregate visible assignment history once per dashboard query, retaining RLS,
  complete history and the existing response shape. No extra indexes were justified.
- Idle dispatch returns after its due-gate refresh when no eligible recipient can
  receive a queued lead. Cursor writes occur only when assignments change it.
- Duplicate global expiry and due-gate sweeps use transaction try-locks. Scoped
  actions keep their synchronous checks. No cron schedules or cooldowns change.
- Refresh, resume, reconnect and fallback polling share the canonical read pipeline.
  Mutation broadcasts still request a trailing read. Performance callers wait for
  the same result; a failed read cannot be reported as a successful refresh.
- Hidden pages skip fallback polls; visible cadence, Realtime, push and presence
  leases remain unchanged. Existing bounded retries and incremental rendering stay.
- Worker claim batches and per-send recipient/revision validation are retained.
  Existing bounded cron cleanup and 7/30-day retention are retained. No bulk cleanup,
  lead deletion, VACUUM FULL, extra database polling or paid services were added.

## Validation and release

433 Node regression tests; 226 PostgreSQL assertions plus idle dispatch and
Neglected Lead transaction scenarios; real concurrent scheduler lock checks;
286 UI assertions; 21 resource-sync, 21 auth-bootstrap and 18 startup-recovery
browser assertions across desktop/iPhone/Android. Syntax and diff checks pass.
Browser transport fixtures do not prove physical-phone push delivery.

Migration: `20261027075816_reduce_resource_contention`. PWA cache: v175.
Five previous function definitions, ACLs, policies and baseline measurements were
backed up privately outside Git before release, with a function rollback script.

Use `scripts/resource-health.sql` on demand for the post-release baseline and the
24-hour review. It does not reset statistics or schedule work. Its cron summary is
explicitly limited to the latest 2,000 runs; use Supabase's existing observability
charts/logs for the full 24-hour window. Compare uptime before calculating deltas.
Review CPU, memory, connection waits, query cost and scheduler failures. No claim
of permanent prevention or Nano capacity sufficiency is made from these samples.
