# Realtime broadcast repair — 28 October 2026

The restricted `leadlaju_tenant_executor` producer used invoker-mode `realtime.send`. The messages table had only the authenticated SELECT policy. Internal INSERT attempts were rejected by RLS and swallowed as `WarnSendingBroadcastMessage`; lead writes could still succeed while their broadcast was lost.

Added an INSERT policy for the internal role only: private broadcast messages to the current brand operations topic or a user in that brand. Existing client receive policy, table grants, function ownership, and Supabase-managed functions remain unchanged. Authenticated/anonymous clients gain no publishing policy.

Before repair, a rollback-only server send produced zero messages. After repair, the same-brand send produced one and cross-brand send zero. All diagnostic transactions were rolled back; no test push was sent to agents. Production migration version: `20261027170343`.

Validation: 241 real PostgreSQL assertions, including internal sends for both brands, cross-brand/public/non-broadcast rejection and direct client rejection; 433 Node regression checks. Live dashboard and performance queries for all 18 active agents passed in the preceding investigation. User confirmed Safrich login recovered after reopening.

Private backup and rollback: `/Users/abdussomad/LeadLaju-realtime-backup-20261028/`. No frontend change or cache bump needed for this database-only repair. Existing frontend clipboard fallback is deployed at `0641d10` / PWA v177. Physical Nisa Android verification remains outside automated coverage.
