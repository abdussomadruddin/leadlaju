const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const migrations = path.join(root, 'supabase', 'migrations');
const migrationName = fs.readdirSync(migrations).find((name) => name.endsWith('_leadlaju_foundation.sql'));
const sql = fs.readFileSync(path.join(migrations, migrationName), 'utf8');
const indexMigrationName = fs.readdirSync(migrations).find((name) => name.endsWith('_leadlaju_foundation_indexes.sql'));
const indexes = fs.readFileSync(path.join(migrations, indexMigrationName), 'utf8');
const operationsMigrationName = fs.readdirSync(migrations).find((name) => name.endsWith('_operational_rpcs.sql'));
const operations = fs.readFileSync(path.join(migrations, operationsMigrationName), 'utf8');
const realtimeMigrationName = fs.readdirSync(migrations).find((name) => name.endsWith('_realtime_operational_channels.sql'));
const realtime = fs.readFileSync(path.join(migrations, realtimeMigrationName), 'utf8');
const ingest = fs.readFileSync(path.join(root, 'supabase', 'functions', 'ingest-lead', 'index.ts'), 'utf8');
const migrate = fs.readFileSync(path.join(root, 'supabase', 'functions', 'migrate-sheet-snapshot', 'index.ts'), 'utf8');
const manageAgent = fs.readFileSync(path.join(root, 'supabase', 'functions', 'admin-manage-agent', 'index.ts'), 'utf8');
const notificationWorker = fs.readFileSync(path.join(root, 'supabase', 'functions', 'process-notification-outbox', 'index.ts'), 'utf8');
const sheetSweep = fs.readFileSync(path.join(root, 'supabase', 'functions', 'sweep-sheet-input', 'index.ts'), 'utf8');
const notificationClaims = fs.readFileSync(path.join(migrations, fs.readdirSync(migrations).find((name) => name.endsWith('_notification_worker_claims.sql'))), 'utf8');
const expirySchedule = fs.readFileSync(path.join(migrations, fs.readdirSync(migrations).find((name) => name.endsWith('_schedule_assignment_expiry.sql'))), 'utf8');
const pendingReconciliation = fs.readFileSync(path.join(migrations, fs.readdirSync(migrations).find((name) => name.endsWith('_reconcile_stale_pending_assignments.sql'))), 'utf8');
const safeAgentRetirement = fs.readFileSync(path.join(migrations, fs.readdirSync(migrations).find((name) => name.endsWith('_retire_agent_safely.sql'))), 'utf8');
const backgroundNotifications = fs.readFileSync(path.join(migrations, fs.readdirSync(migrations).find((name) => name.endsWith('_operational_background_notifications.sql'))), 'utf8');
const realtimeReloadSignals = fs.readFileSync(path.join(migrations, fs.readdirSync(migrations).find((name) => name.endsWith('_realtime_state_reload_signals.sql'))), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

test('Supabase foundation keeps one active lead and assignment per agent', () => {
  assert.match(sql, /create unique index one_active_lead_per_agent[\s\S]*queue_state = 'active'/);
  assert.match(sql, /create unique index one_pending_assignment_per_agent[\s\S]*outcome = 'pending'/);
  assert.match(sql, /create unique index one_pending_assignment_per_lead[\s\S]*outcome = 'pending'/);
  assert.match(sql, /queued_at timestamptz default now\(\)/);
  assert.doesNotMatch(sql, /queued_at timestamptz not null/);
});

test('Supabase dispatcher preserves eligibility, readiness, expiry and five-minute duration', () => {
  assert.match(sql, /agent_project_eligibility ape/);
  assert.match(sql, /av\.lead_ready and av\.notification_ready/);
  assert.match(sql, /av\.presence_lease_until > p_now/);
  assert.match(sql, /p_now \+ interval '5 minutes'/);
  assert.match(sql, /edge_position/);
  assert.match(sql, /ascending_position \* 2 - 1/);
  assert.match(sql, /pick_latest_next := not v_state\.pick_latest_next/);
  assert.match(sql, /project_dispatch_state/);
});

test('Supabase ingestion is idempotent by source identity and payload fingerprint', () => {
  assert.match(sql, /leads_source_identity_unique/);
  assert.match(sql, /constraint leads_source_identity_unique[\s\S]*unique \(source_system, source_lead_id\)/);
  assert.match(sql, /leads_ingestion_fingerprint_unique/);
  assert.match(sql, /leads_ingestion_fingerprint_unique[\s\S]*where source_lead_id is null/);
  assert.match(sql, /on conflict do nothing returning id into v_lead_id/);
  assert.match(ingest, /X-Ingestion-Key/);
  assert.match(ingest, /payloadHash/);
});

test('CALL NOW requires owner, revision, active state and canonical expiry', () => {
  assert.match(sql, /v_lead\.assigned_agent_id <> v_user/);
  assert.match(sql, /v_lead\.assignment_revision <> p_assignment_revision/);
  assert.match(sql, /v_lead\.queue_state <> 'active'/);
  assert.match(sql, /v_lead\.expires_at <= now\(\)/);
  assert.match(sql, /unique \(lead_id, assignment_revision, action_type\)/);
});

test('expired assignments are missed, revisioned, queued and dispatched transactionally', () => {
  assert.match(sql, /outcome = 'missed'/);
  assert.match(sql, /pass_count = pass_count \+ 1/);
  assert.match(sql, /retry_after_cycle = v_cycle \+ 1/);
  assert.match(sql, /assignment_revision = assignment_revision \+ 1/);
  assert.match(sql, /perform leadlaju_private\.dispatch_available_leads\(p_now\)/);
});

test('stale imported pending assignments cannot block a later canonical assignment', () => {
  assert.match(pendingReconciliation, /before insert on public\.lead_assignments/);
  assert.match(pendingReconciliation, /la\.agent_id = new\.agent_id or la\.lead_id = new\.lead_id/);
  assert.match(pendingReconciliation, /l\.status = 'new'/);
  assert.match(pendingReconciliation, /l\.queue_state = 'active'/);
  assert.match(pendingReconciliation, /l\.assignment_revision = la\.assignment_revision/);
  assert.match(pendingReconciliation, /set outcome = 'missed'/);
});

test('RLS is enabled and mutable canonical tables are not directly writable by clients', () => {
  for (const table of ['profiles', 'leads', 'lead_assignments', 'push_subscriptions', 'action_requests']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /revoke all on all tables in schema public from anon, authenticated/);
  assert.doesNotMatch(sql, /grant (insert|update|delete|all)[^;]* to authenticated/i);
  assert.match(sql, /realtime\.topic\(\) = 'user:'/);
  assert.match(sql, /realtime\.topic\(\) = 'admin:operations'/);
});

test('Pabbly ingestion stores no API secret and does not expose service role to clients', () => {
  assert.match(sql, /key_digest text not null unique/);
  assert.doesNotMatch(sql, /api_key text/);
  assert.match(ingest, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(ingest, /service_role[^\n]*Response/);
});

test('notification outbox is created in the same dispatcher transaction as assignment', () => {
  const assignmentAt = sql.indexOf('insert into public.lead_assignments');
  const notificationAt = sql.indexOf('insert into public.notification_outbox', assignmentAt);
  assert.ok(assignmentAt > 0 && notificationAt > assignmentAt);
  assert.match(sql, /unique \(user_id, lead_id, assignment_revision, notification_type\)/);
});

test('Supabase operational foreign keys and worker queues have supporting indexes', () => {
  for (const index of [
    'action_requests_actor_id_idx', 'agent_project_eligibility_project_id_idx',
    'appointments_assigned_agent_id_idx', 'appointments_lead_id_idx',
    'lead_events_lead_id_idx', 'leads_project_id_idx',
    'notification_outbox_pending_idx', 'push_subscriptions_user_id_idx',
  ]) assert.match(indexes, new RegExp(`create index ${index}`));
});

test('operational RPCs enforce auth, ownership and canonical revisions', () => {
  assert.match(operations, /function public\.update_lead_status/);
  assert.match(operations, /v_lead\.assigned_agent_id <> v_user/);
  assert.match(operations, /v_lead\.assignment_revision <> p_expected_assignment_revision/);
  assert.match(operations, /v_lead\.status_revision <> p_expected_status_revision/);
  assert.match(operations, /Press CALL NOW before changing status/);
  assert.match(operations, /Notes are required for this status/);
});

test('push subscription identity is endpoint-unique and safely rebound to the authenticated user', () => {
  assert.match(operations, /function public\.register_push_subscription/);
  assert.match(operations, /on conflict\(endpoint\) do update set user_id=excluded\.user_id/);
  assert.match(operations, /where endpoint=trim\(p_endpoint\) and user_id=v_user/);
});

test('Sheet migration preserves passwords only through Supabase Auth and never profiles', () => {
  assert.match(migrate, /auth\.admin\.createUser/);
  assert.match(migrate, /password: text\(item\.password\)/);
  assert.doesNotMatch(migrate, /from\("profiles"\)[\s\S]{0,500}password/);
  assert.match(migrate, /source_agent_id/);
  assert.equal((migrate.match(/auth\.admin\.listUsers/g) || []).length, 1);
  assert.match(migrate, /assignmentRows\.slice\(offset, offset \+ 200\)/);
  assert.match(migrate, /Math\.max\(Number\(item\.assignment_revision\) \|\| 0, history\.length\)/);
  assert.match(migrate, /if \(!isLatest\) return "missed"/);
  assert.match(migrate, /leadStatus === "new" && runtimeState === "active"/);
  assert.match(migrate, /malaysiaLocal[\s\S]*\+08:00/);
});

test('Supabase agent signup remains pending until an authenticated admin approves it', () => {
  assert.match(manageAgent, /action === "list_projects"/);
  assert.match(manageAgent, /action === "signup_request"/);
  assert.match(manageAgent, /approval_status: "pending"/);
  assert.match(manageAgent, /active: false/);
  assert.match(manageAgent, /actor\.role !== "admin"/);
  assert.match(manageAgent, /action === "approve"/);
  assert.match(manageAgent, /approval_status: "approved"/);
  assert.match(manageAgent, /active: true/);
  assert.match(manageAgent, /action === "update_details"/);
  assert.match(manageAgent, /admin\.auth\.admin\.updateUserById\(userId, \{ email \}\)/);
  assert.match(manageAgent, /admin_update_agent/);
  assert.match(manageAgent, /updateUserById\(userId, \{ email: target\.email \}\)/);
  assert.match(app, /action: "update_details"/);
});

test('Supabase agent rejection deletes the Auth user and cascades canonical profile state', () => {
  assert.match(manageAgent, /action === "delete"/);
  assert.match(manageAgent, /auth\.admin\.deleteUser\(userId\)/);
  assert.doesNotMatch(manageAgent, /password[^\n]*profiles/);
  assert.match(manageAgent, /admin_retire_agent/);
  assert.match(manageAgent, /tombstone_email/);
});

test('deleting an experienced agent preserves history and safely requeues an active lead', () => {
  assert.match(safeAgentRetirement, /function public\.admin_retire_agent/);
  assert.match(safeAgentRetirement, /outcome = 'missed'/);
  assert.match(safeAgentRetirement, /queue_state = 'queued'/);
  assert.match(safeAgentRetirement, /assignment_revision = assignment_revision \+ 1/);
  assert.match(safeAgentRetirement, /approval_status = 'rejected'/);
  assert.match(safeAgentRetirement, /perform leadlaju_private\.dispatch_available_leads\(now\(\)\)/);
  assert.match(app, /filter\(\(agent\) => agent\.approvalStatus !== "rejected"\)/);
});

test('Supabase CALL NOW starts durable agent-scoped capture before preserving the tel user gesture', () => {
  assert.match(app, /CONTACT_OUTBOX_DB = "leadlaju-contact-outbox-v1"/);
  assert.match(app, /agentId: state\.currentUserId/);
  assert.match(app, /assignmentRevision: Number\(lead\.assignmentRevision\)/);
  assert.match(app, /remoteCapturePromise = writeContactOutbox\(remoteContactAction\)/);
  assert.ok(app.indexOf('remoteCapturePromise = writeContactOutbox(remoteContactAction)') < app.indexOf('dialLeadPhone(callablePhone)'));
  assert.match(app, /window\.addEventListener\("online", flushContactOutbox\)/);
  assert.match(app, /p_action_id: action\.actionId/);
  assert.match(app, /state: "conflict"/);
  assert.match(app, /\.filter\(\(action\) => !action\.state \|\| action\.state === "pending"\)/);
  assert.match(app, /remoteCapturePromise\.then\(\(\) => submitContactAction\(remoteContactAction\)\)/);
  assert.match(app, /CALL NOW belum disimpan/);
});

test('Supabase Realtime broadcasts canonical operational changes to private user and admin channels', () => {
  assert.match(realtime, /function leadlaju_private\.broadcast_operational_change/);
  for (const table of ['profiles', 'agent_availability', 'appointments', 'reminders', 'projects']) {
    assert.match(realtime, new RegExp(`on public\\.${table}`));
  }
  assert.match(realtime, /'user:'\|\|v_user_id/);
  assert.match(realtime, /'admin:operations'/);
  assert.match(app, /channel\(topic, \{ config: \{ private: true \} \}\)/);
  assert.match(app, /\.on\("broadcast", \{ event: "\*" \}, queueRemoteReload\)/);
});

test('Supabase Realtime refreshes shared team and project state without broadcasting profile PII', () => {
  assert.match(realtimeReloadSignals, /tg_table_name in \('profiles', 'agent_availability', 'projects'\)/);
  assert.match(realtimeReloadSignals, /realtime\.send\(/);
  assert.match(realtimeReloadSignals, /jsonb_build_object\('table', tg_table_name, 'operation', tg_op\)/);
  assert.match(realtimeReloadSignals, /'state_changed'/);
  assert.match(realtimeReloadSignals, /eligibility_realtime_broadcast/);
  assert.doesNotMatch(realtimeReloadSignals, /realtime\.send\([\s\S]*?v_new/);
});

test('Supabase expiry is server scheduled and never depends on a browser timer', () => {
  assert.match(expirySchedule, /'5 seconds'/);
  assert.match(expirySchedule, /leadlaju_private\.expire_assignments\(clock_timestamp\(\)\)/);
});

test('notification worker claims outbox rows atomically and fans out to every active device', () => {
  assert.match(notificationClaims, /for update skip locked/);
  assert.match(notificationClaims, /left join public\.push_subscriptions s on s\.user_id=m\.user_id and s\.active/);
  assert.match(notificationWorker, /for \(const row of rows\)/);
  assert.match(notificationWorker, /leadSnapshot/);
  assert.match(notificationWorker, /statusCode === 404 \|\| statusCode === 410/);
  assert.doesNotMatch(notificationWorker, /VAPID_PRIVATE_KEY\) \|\| ["'][^"']+["']/);
});

test('Supabase replaces Apps Script background reminder and signup push operations', () => {
  assert.match(backgroundNotifications, /select p\.id,'admin_follow_up'/);
  assert.match(backgroundNotifications, /appointment_reminder/);
  assert.match(backgroundNotifications, /potential_reminder/);
  assert.match(backgroundNotifications, /'leadlaju-operational-reminders','\* \* \* \* \*'/);
  assert.match(backgroundNotifications, /notification_outbox_dedupe_key_unique/);
  assert.match(notificationWorker, /first\.notification_type !== "new_lead"/);
  assert.match(notificationWorker, /reminderType: first\.payload\?\.reminderType/);
  assert.match(manageAgent, /notification_type: "agent_signup"/);
  assert.match(manageAgent, /dedupe_key: `agent_signup:/);
});

test('Supabase operational UI mutations branch away from Google Sheet writes', () => {
  assert.match(app, /remoteDatabaseClient\.rpc\("manage_appointment"/);
  assert.match(app, /remoteDatabaseClient\.rpc\("broadcast_follow_up_reminder"/);
  assert.match(app, /remoteDatabaseClient\.rpc\("admin_upsert_project"/);
  assert.match(app, /remoteDatabaseClient\.rpc\("admin_update_agent"/);
  assert.match(app, /remoteDatabaseClient\.rpc\("admin_update_lead_details"/);
  assert.match(app, /remoteDatabaseClient\.rpc\("admin_delete_lead"/);
  assert.match(app, /remoteDatabaseClient\.rpc\("admin_ingest_manual_lead"/);
  assert.match(app, /lead_id: remoteDatabaseMode \? lead\.id : \(lead\.dedupeKey \|\| lead\.id\)/);
});

test('all refresh entry points use Supabase state while remote mode is active', () => {
  const syncStart = app.indexOf('async function syncGoogleSheet(options = {})');
  const sheetRead = app.indexOf('const syncStartedAt = Date.now();', syncStart);
  const remoteBranch = app.slice(syncStart, sheetRead);
  assert.match(remoteBranch, /if \(remoteDatabaseMode\)/);
  assert.match(remoteBranch, /await loadRemoteState\(state\.currentUserId\)/);
  assert.match(remoteBranch, /renderAll\(\)/);
  assert.doesNotMatch(remoteBranch, /getSheetEndpoint|fetch\(/);
  assert.match(app, /const wasRemoteDatabaseMode = remoteDatabaseMode/);
  assert.match(app, /remoteDatabaseMode = wasRemoteDatabaseMode/);
});

test('Sheet recovery sweep ingests missing leads only and never imports operational state', () => {
  assert.match(sheetSweep, /\.in\("source_lead_id", sourceIds\.slice/);
  assert.match(sheetSweep, /if \(!sourceId \|\| existing\.has\(sourceId\)\) continue/);
  assert.match(sheetSweep, /admin\.rpc\("ingest_lead"/);
  assert.doesNotMatch(sheetSweep, /assigned_agent|assignment_revision|status_revision|queue_state|lead_ready/);
  assert.match(sheetSweep, /malaysiaTimestamp/);
});
