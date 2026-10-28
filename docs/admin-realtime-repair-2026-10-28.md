# Admin and Master Realtime recovery — 28 October 2026

The 09:45–10:45 Kuala Lumpur logs contained 28 `WarnSendingBroadcastMessage` warnings from the Master bulk availability action, six denied Safrich admin channel joins, and one anonymous/unauthorized `brands` read (the same incident counted as a database error and API 401).

Root cause of bulk warnings: tenant RLS includes the caller's own Master profile as well as brand profiles. The operational broadcaster iterated that global Master profile (`brand_id = NULL`) and attempted a user-topic message that the brand-scoped INSERT policy correctly rejected. Restrict recipient loops explicitly to `request_brand()`. Master continues receiving the existing selected-brand operations topic. No RLS, table grants or owner changes.

Frontend: require a matching SDK session before brand reads and use its explicit access token before private channel subscription. Recreate subscriptions after TOKEN_REFRESHED outside the Auth callback lock. Channel failures share a bounded 1/5/15-second reconnect sequence; no business write is replayed, and account/brand changes invalidate old attempts. Server authorization is unchanged. The historical denied joins do not by themselves prove the exact token state at the time; these tests cover the vulnerable lifecycle paths.

Verification: 247 real PostgreSQL assertions, including Master bulk actions for both brands using real messages INSERT; 24 browser lifecycle assertions across desktop/iPhone/Android; startup timeout/recovery and regression suites. Live rollback-only Master bulk test produced 239 messages. The live Safrich admin was allowed its own user and brand channels, and denied the other brand. All diagnostic business changes and broadcasts rolled back; no agent test notification was sent.

Backup: `/Users/abdussomad/LeadLaju-admin-realtime-backup-20261028/rollback.sql`. Production migration version `20261028032701`. Frontend cache v178. No restart, compute upgrade or business-rule change.
