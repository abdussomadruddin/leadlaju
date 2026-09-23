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
const manageAgent = fs.readFileSync(path.join(root, 'supabase', 'functions', 'admin-manage-agent', 'index.ts'), 'utf8');
const notificationWorker = fs.readFileSync(path.join(root, 'supabase', 'functions', 'process-notification-outbox', 'index.ts'), 'utf8');
const notificationClaims = fs.readFileSync(path.join(migrations, fs.readdirSync(migrations).find((name) => name.endsWith('_notification_worker_claims.sql'))), 'utf8');
const expirySchedule = fs.readFileSync(path.join(migrations, fs.readdirSync(migrations).find((name) => name.endsWith('_schedule_assignment_expiry.sql'))), 'utf8');
const pendingReconciliation = fs.readFileSync(path.join(migrations, fs.readdirSync(migrations).find((name) => name.endsWith('_reconcile_stale_pending_assignments.sql'))), 'utf8');
const safeAgentRetirement = fs.readFileSync(path.join(migrations, fs.readdirSync(migrations).find((name) => name.endsWith('_retire_agent_safely.sql'))), 'utf8');
const backgroundNotifications = fs.readFileSync(path.join(migrations, fs.readdirSync(migrations).find((name) => name.endsWith('_operational_background_notifications.sql'))), 'utf8');
const realtimeReloadSignals = fs.readFileSync(path.join(migrations, fs.readdirSync(migrations).find((name) => name.endsWith('_realtime_state_reload_signals.sql'))), 'utf8');
const notificationReadiness = fs.readFileSync(path.join(migrations, fs.readdirSync(migrations).find((name) => name.endsWith('_canonical_notification_readiness.sql'))), 'utf8');
const realtimeAssignmentSnapshots = fs.readFileSync(path.join(migrations, fs.readdirSync(migrations).find((name) => name.endsWith('_realtime_assignment_snapshot_and_sheet_reporting.sql'))), 'utf8');
const removeGoogleIntegrations = fs.readFileSync(path.join(migrations, fs.readdirSync(migrations).find((name) => name.endsWith('_remove_google_sheet_integrations.sql'))), 'utf8');
const retryOnlyDispatch = fs.readFileSync(path.join(migrations, fs.readdirSync(migrations).find((name) => name.endsWith('_unblock_retry_only_dispatch.sql'))), 'utf8');
const adminLeadReadiness = fs.readFileSync(path.join(migrations, fs.readdirSync(migrations).find((name) => name.endsWith('_admin_agent_lead_readiness.sql'))), 'utf8');
const adminAllLeadReadiness = fs.readFileSync(path.join(migrations, fs.readdirSync(migrations).find((name) => name.endsWith('_admin_all_agent_lead_readiness.sql'))), 'utf8');
const pushReadyBulkQueue = fs.readFileSync(path.join(migrations, fs.readdirSync(migrations).find((name) => name.endsWith('_allow_push_ready_agents_in_bulk_queue.sql'))), 'utf8');
const phoneOnlyEligibility = fs.readFileSync(path.join(migrations, fs.readdirSync(migrations).find((name) => name.endsWith('_phone_only_lead_eligibility.sql'))), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const runtimeConfig = fs.readFileSync(path.join(root, 'api', 'runtime-config.js'), 'utf8');
const appsScript = fs.readFileSync(path.join(root, 'tests', 'fixtures', 'legacy-google-apps-script.txt'), 'utf8');

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

test('retry-only dispatcher advances only after the current retry round is exhausted', () => {
  assert.match(retryOnlyDispatch, /not exists \([\s\S]*fresh\.pass_count = 0/);
  assert.match(retryOnlyDispatch, /retry\.retry_after_cycle <= v_state\.queue_cycle/);
  assert.match(retryOnlyDispatch, /previous\.retry_cycle = v_state\.queue_cycle/);
  assert.match(retryOnlyDispatch, /greatest\([\s\S]*v_state\.queue_cycle \+ 1[\s\S]*v_next_retry_cycle/);
  assert.match(retryOnlyDispatch, /dispatch_available_leads_current_cycle\(p_now\)/);
});

test('Supabase ingestion is idempotent by source identity and payload fingerprint', () => {
  assert.match(sql, /leads_source_identity_unique/);
  assert.match(sql, /constraint leads_source_identity_unique[\s\S]*unique \(source_system, source_lead_id\)/);
  assert.match(sql, /leads_ingestion_fingerprint_unique/);
  assert.match(sql, /leads_ingestion_fingerprint_unique[\s\S]*where source_lead_id is null/);
  assert.match(sql, /on conflict do nothing returning id into v_lead_id/);
  assert.doesNotMatch(ingest, /X-Ingestion-Key/);
  assert.match(ingest, /const ingestionKey = `\$\{canonical\.source_system\}:\$\{canonical\.source_lead_id\}`/);
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

test('agent notification readiness is derived from active server subscriptions', () => {
  assert.match(notificationReadiness, /select exists \([\s\S]*public\.push_subscriptions[\s\S]*user_id = v_user and active/);
  assert.match(notificationReadiness, /if p_ready and not v_notification_ready/);
  assert.match(notificationReadiness, /An active push subscription is required/);
  assert.match(notificationReadiness, /lead_ready = lead_ready and v_notification_ready/);
  assert.match(notificationReadiness, /v_previous_user <> v_user/);
  assert.match(notificationReadiness, /where user_id = v_previous_user and active/);
  assert.doesNotMatch(notificationReadiness, /notification_ready = p_notification_ready/);
});

test('admins can control only an online, push-ready agent distribution queue without forcing logout', () => {
  assert.match(adminLeadReadiness, /function public\.admin_set_agent_lead_readiness/);
  assert.match(adminLeadReadiness, /leadlaju_private\.is_admin\(auth\.uid\(\)\)/);
  assert.match(adminLeadReadiness, /presence_lease_until > now\(\)/);
  assert.match(adminLeadReadiness, /public\.push_subscriptions[\s\S]*user_id = p_agent_id and active/);
  assert.match(adminLeadReadiness, /Agent is not online/);
  assert.match(adminLeadReadiness, /Agent notifications are not ready/);
  assert.match(adminLeadReadiness, /perform leadlaju_private\.dispatch_available_leads\(now\(\)\)/);
  assert.match(adminLeadReadiness, /grant execute on function public\.admin_set_agent_lead_readiness\(uuid, boolean\) to authenticated/);
  assert.match(app, /data-agent-lead-availability="stop"/);
  assert.match(app, /data-agent-lead-availability="get"/);
  assert.match(app, /rpc\("admin_set_agent_lead_readiness"/);
});

test('admins can start or stop the distribution queue for all eligible agents safely', () => {
  assert.match(adminAllLeadReadiness, /function public\.admin_set_all_agent_lead_readiness/);
  assert.match(adminAllLeadReadiness, /leadlaju_private\.is_admin\(auth\.uid\(\)\)/);
  assert.match(adminAllLeadReadiness, /av\.presence_lease_until > now\(\)/);
  assert.match(adminAllLeadReadiness, /public\.push_subscriptions ps/);
  assert.match(adminAllLeadReadiness, /not av\.lead_ready/);
  assert.match(adminAllLeadReadiness, /set lead_ready = false/);
  assert.match(adminAllLeadReadiness, /perform leadlaju_private\.dispatch_available_leads\(now\(\)\)/);
  assert.match(adminAllLeadReadiness, /grant execute on function public\.admin_set_all_agent_lead_readiness\(boolean\) to authenticated/);
  assert.match(html, /id="get-lead-all-agents-button"/);
  assert.match(html, /id="stop-lead-all-agents-button"/);
  assert.match(app, /rpc\("admin_set_all_agent_lead_readiness"/);
});

test('bulk GET LEAD accepts push-ready agents without an already-open app session', () => {
  assert.match(pushReadyBulkQueue, /function public\.admin_set_all_agent_lead_readiness/);
  assert.match(pushReadyBulkQueue, /now\(\) \+ interval '60 minutes'/);
  assert.doesNotMatch(pushReadyBulkQueue, /av\.presence_lease_until > now\(\)/);
  assert.match(pushReadyBulkQueue, /public\.push_subscriptions ps/);
  assert.match(pushReadyBulkQueue, /av\.forced_offline_at is null or av\.last_seen_at > av\.forced_offline_at/);
  assert.match(pushReadyBulkQueue, /perform leadlaju_private\.dispatch_available_leads\(now\(\)\)/);
  assert.match(app, /ejen dengan notifikasi aktif dimasukkan ke giliran/);
});

test('only active phone push subscriptions can make an agent eligible for a lead', () => {
  assert.match(phoneOnlyEligibility, /function leadlaju_private\.has_phone_push_subscription/);
  assert.match(phoneOnlyEligibility, /like '%iphone%'/);
  assert.match(phoneOnlyEligibility, /like '%android%'/);
  assert.match(phoneOnlyEligibility, /like '%mobile%'/);
  assert.match(phoneOnlyEligibility, /An active phone push subscription is required/);
  assert.match(phoneOnlyEligibility, /Agent phone notifications are not ready/);
  assert.match(phoneOnlyEligibility, /lead_ready = av\.lead_ready and readiness\.phone_ready/);
  assert.match(phoneOnlyEligibility, /leadlaju_private\.has_phone_push_subscription\(av\.agent_id\)/);
  assert.match(app, /function isPhonePushDevice\(\)/);
  assert.match(app, /GET LEAD hanya di telefon/);
});

test('legacy Sheet snapshot migrator is removed after cutover', () => {
  assert.equal(fs.existsSync(path.join(root, 'supabase', 'functions', 'migrate-sheet-snapshot', 'index.ts')), false);
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
  const addAgentBody = app.slice(app.indexOf('async function addAgent('), app.indexOf('\nasync function approveAgent('));
  assert.doesNotMatch(addAgentBody, /body: \{ action: "approve", userId: signup\.data\.userId \}/);
  assert.match(manageAgent, /select\("id"\)\.maybeSingle\(\)/);
  assert.match(manageAgent, /Status ejen sudah berubah/);
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
  assert.match(app, /\.on\("broadcast", \{ event: "\*" \}, handleRemoteBroadcast\)/);
});

test('an assigned lead is delivered as a canonical private snapshot before background reconciliation', () => {
  assert.match(realtimeAssignmentSnapshots, /function leadlaju_private\.broadcast_assignment_snapshot/);
  assert.match(realtimeAssignmentSnapshots, /new\.status <> 'new' or new\.queue_state <> 'active'/);
  assert.match(realtimeAssignmentSnapshots, /'leadSnapshot', to_jsonb\(new\)/);
  assert.match(realtimeAssignmentSnapshots, /'assignment_snapshot'/);
  assert.match(realtimeAssignmentSnapshots, /'user:' \|\| new\.assigned_agent_id::text/);
  assert.match(realtimeAssignmentSnapshots, /leads_assignment_snapshot_broadcast/);
  const start = app.indexOf('function handleRemoteBroadcast');
  const end = app.indexOf('\nfunction queueRemoteReload', start);
  const body = app.slice(start, end);
  assert.match(body, /message\?\.event !== "assignment_snapshot"/);
  assert.match(body, /message\?\.payload\?\.leadSnapshot/);
  assert.match(body, /acceptAssignmentSnapshot\(leadSnapshot\)/);
  assert.match(body, /\.finally\(queueRemoteReload\)/);
});

test('a pre-snapshot remote dashboard response cannot erase a locally committed assignment', () => {
  const start = app.indexOf('async function loadRemoteState');
  const end = app.indexOf('\nasync function subscribeToRemoteDatabase', start);
  const body = app.slice(start, end);
  assert.match(body, /const remoteLoadGeneration = authoritativeStateGeneration/);
  assert.match(body, /const locallyCommittedLeads = state\.leads\.slice\(\)/);
  assert.match(body, /wasLeadCommittedAfterSyncStarted\(localLead, remoteLoadGeneration\)/);
  assert.match(body, /remoteLeads\.push\(localLead\)/);
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
  assert.match(notificationWorker, /\.eq\("status", "new"\)/);
  assert.match(notificationWorker, /\.eq\("queue_state", "active"\)/);
  assert.match(notificationWorker, /\.gt\("expires_at", new Date\(\)\.toISOString\(\)\)/);
  assert.match(notificationWorker, /p_success: !leadError/);
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
  assert.match(app, /remoteDatabaseClient\.rpc\("admin_delete_appointment"/);
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

test('production runtime config enables Supabase without requiring a query flag', () => {
  assert.doesNotMatch(app, /get\("backend"\) === "sheet"/);
  assert.doesNotMatch(app, /get\("backend"\) !== "supabase"/);
  assert.match(app, /config\.backend !== "supabase"/);
});

test('all production devices invalidate the old app shell for Follow Up Due', () => {
  const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.match(worker, /leadlaju-pwa-v20260923-follow-up-due-v91/);
  assert.match(worker, /existingClient\.navigate\(targetUrl\)/);
  assert.match(html, /app\.js\?v=20260923-follow-up-due-v91/);
  assert.match(html, /vendor\/exceljs\.min\.js\?v=4\.4\.0/);
  assert.match(app, /register\("\/sw\.js\?v=20260923-follow-up-due-v91"\)/);
  assert.doesNotMatch(app, /get\("backend"\) === "sheet"/);
  assert.match(app, /remoteDatabaseRequired = window\.location\.protocol !== "file:"/);
  assert.match(app, /if \(remoteDatabaseRequired\)[\s\S]*Operasi server lama tidak akan digunakan/);
  assert.match(app, /Supabase dashboard request timed out/);
  assert.match(app, /Supabase client initialization timed out/);
});

test('admin bulletin reminder targets only canonical unread recipients', () => {
  const reminder = fs.readFileSync(path.join(root, 'supabase/migrations/20260920123120_remind_unread_bulletin_recipients.sql'), 'utf8');
  assert.match(reminder, /create or replace function public\.remind_bulletin_unread/);
  assert.match(reminder, /r\.read_at is null/);
  assert.match(reminder, /where id = p_bulletin_id and status = 'published'/);
  assert.match(reminder, /'bulletin_reminder:' \|\| v_reminder_id::text \|\| ':' \|\| r\.agent_id::text/);
  assert.match(reminder, /leadlaju_private\.assert_bulletin_admin\(\)/);
  assert.match(app, /data-bulletin-remind/);
  assert.match(app, /rpc\("remind_bulletin_unread"/);
});

test('bulletins use recipient-scoped RLS, canonical RPCs, generic push, and dedicated realtime reloads', () => {
  const bulletin = fs.readFileSync(path.join(root, 'supabase/migrations/20260920052133_bulletin_news.sql'), 'utf8');
  const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.match(bulletin, /create table public\.bulletins/);
  assert.match(bulletin, /create table public\.bulletin_recipients/);
  assert.match(bulletin, /primary key \(bulletin_id, agent_id\)/);
  assert.match(bulletin, /alter table public\.bulletins enable row level security/);
  assert.match(bulletin, /create or replace function public\.publish_bulletin/);
  assert.match(bulletin, /create or replace function public\.mark_bulletin_read/);
  assert.match(bulletin, /select r\.agent_id,'bulletin'/);
  assert.match(bulletin, /'bulletin_changed'/);
  assert.match(app, /message\?\.event === "bulletin_changed"/);
  assert.match(app, /rpc\("get_bulletin_feed"\)/);
  assert.match(html, /data-view="bulletins"/);
  assert.match(worker, /OPEN_BULLETIN/);
  assert.match(notificationWorker, /first\.notification_type === "bulletin" \? 86400/);
});

test('unrelated dashboard realtime reloads preserve the current user bulletin feed', () => {
  const start = app.indexOf('async function loadRemoteState');
  const end = app.indexOf('\nasync function subscribeToRemoteDatabase', start);
  const body = app.slice(start, end);
  assert.match(body, /const preserveBulletinState = state\.currentUserId === userId/);
  assert.match(body, /bulletins: locallyLoadedBulletins/);
  assert.match(body, /bulletinUnreadCount: locallyLoadedBulletinUnreadCount/);
});

test('phone resume and realtime reconnect perform canonical bulletin catch-up', () => {
  const lifecycleBody = app.match(/function runLifecycleAuthoritativeSync\(\)[\s\S]*?\n}\n\nfunction beginColdStartSync/)?.[0] || '';
  const subscriptionBody = app.match(/async function subscribeToRemoteDatabase\(\)[\s\S]*?\n}\n\nfunction handleRemoteBroadcast/)?.[0] || '';
  const focusBody = app.match(/window\.addEventListener\("focus"[\s\S]*?\n}\);/)?.[0] || '';
  assert.match(lifecycleBody, /await loadBulletinFeed\(\)/);
  assert.match(subscriptionBody, /Realtime bulletin catch-up failed/);
  assert.match(focusBody, /beginResumeSync\(\)/);
});

test('admin lead deletion clears blocking action references and retains ingestion audit safely', () => {
  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260919052200_fix_admin_lead_delete.sql'), 'utf8');
  assert.match(migration, /action_requests_lead_id_fkey[\s\S]*on delete cascade/);
  assert.match(migration, /ingestion_events_lead_id_fkey[\s\S]*on delete set null/);
  assert.match(migration, /'ok', v_deleted = 1/);
  assert.match(app, /Number\(data\?\.deleted\) === 1/);
  assert.doesNotMatch(app, /dashboard dan Google Sheet/);
});

test('admin appointment deletion handles rescheduled appointment chains safely', () => {
  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260919061000_fix_admin_appointment_delete.sql'), 'utf8');
  assert.match(migration, /appointments_parent_appointment_id_fkey[\s\S]*on delete set null/);
  assert.match(migration, /create or replace function public\.admin_delete_appointment/);
  assert.match(migration, /'ok', v_deleted = 1/);
  assert.match(app, /remoteDatabaseClient\.rpc\("admin_delete_appointment"/);
  assert.match(app, /Number\(data\?\.deleted\) !== 1/);
});

test('admin can canonically reset a resolved lead to New for redistribution', () => {
  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260919070000_admin_reset_lead_to_new.sql'), 'utf8');
  assert.match(migration, /leadlaju_private\.is_admin\(v_user\)/);
  assert.match(migration, /v_lead\.assignment_revision <> p_expected_assignment_revision/);
  assert.match(migration, /v_lead\.status_revision <> p_expected_status_revision/);
  assert.match(migration, /status = 'new',[\s\S]*queue_state = 'queued'/);
  assert.match(migration, /assigned_agent_id = null[\s\S]*expires_at = null/);
  assert.match(migration, /assignment_revision = assignment_revision \+ 1/);
  assert.match(migration, /perform leadlaju_private\.dispatch_available_leads\(now\(\)\)/);
  assert.match(app, /isAdmin\(\) && normalizedStatus === "new"[\s\S]*admin_reset_lead_to_new/);
});

test('production UI exposes Supabase realtime and no Google Sheet integration surface', () => {
  assert.match(html, /Supabase realtime/);
  assert.match(html, /Import Lead/);
  assert.doesNotMatch(html, /Google Sheets Input|Google Apps Script|script\.google\.com/);
  assert.equal(fs.existsSync(path.join(root, 'google-apps-script')), false);
  assert.equal(fs.existsSync(path.join(root, 'supabase', 'functions', 'export-sheet-report')), false);
  assert.equal(fs.existsSync(path.join(root, 'supabase', 'functions', 'sweep-sheet-input')), false);
  assert.doesNotMatch(runtimeConfig, /google_sheet|script\.google\.com/);
});

test('Google Sheet sweep and reporting schedules are removed from Supabase', () => {
  assert.match(removeGoogleIntegrations, /leadlaju-sweep-sheet-input/);
  assert.match(removeGoogleIntegrations, /leadlaju-export-sheet-report/);
  assert.match(removeGoogleIntegrations, /cron\.unschedule/);
  assert.match(removeGoogleIntegrations, /drop function if exists public\.get_sheet_reporting_snapshot/);
  assert.match(removeGoogleIntegrations, /drop table if exists public\.report_export_runs/);
});
