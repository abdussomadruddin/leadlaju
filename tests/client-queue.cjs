const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('delayed sync cannot overwrite a completed or pending status edit', async () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const start = source.indexOf('async function addLead(');
  const end = source.indexOf('\nfunction ', start + 1);
  const lead = { id: 'local', dedupeKey: 'sheet-id', status: 'need_follow_up' };
  const pending = new Map();
  const context = vm.createContext({
    state: { leads: [lead] }, pendingLeadStatusUpdates: pending,
    leadStatusWriteTimes: new Map([['local', 200]]),
    sheetDedupeKey: () => 'sheet-id', normalizeLeadSource: () => 'Manual Lead',
    parseLeadTimestamp: () => 1, readLeadRuntimeFromSheet: () => ({}),
  });
  vm.runInContext(source.slice(start, end), context);
  const row = { name: 'Test', phone: '601234', status: 'Contacted' };
  assert.equal(await context.addLead(row, { updateExisting: true, syncStartedAt: 100 }), false);
  assert.equal(lead.status, 'need_follow_up');
  pending.set('local', { status: 'need_follow_up' });
  assert.equal(await context.addLead(row, { updateExisting: true, syncStartedAt: 300 }), false);
  assert.equal(lead.status, 'need_follow_up');
  pending.clear();
  lead.statusRevision = 5;
  assert.equal(await context.addLead({ ...row, status_revision: 4 }, { updateExisting: true, syncStartedAt: 400 }), false);
  assert.equal(lead.status, 'need_follow_up');
});

function setup(leads) {
  const source = fs.readFileSync('app.js', 'utf8');
  const context = vm.createContext({
    state: { leads }, saveState() {}, syncLeadRuntimeInSheet() {},
    isActiveLeadStatus: status => ['new', 'queued'].includes(status),
    RESPONSE_WINDOW_MS: 300000,
  });
  for (const name of ['queueLead', 'hasActiveLeadForAgent', 'enforceSingleActiveLead', 'applyLeadRuntimeFromSheet']) {
    const start = source.indexOf(`function ${name}(`);
    const end = source.indexOf('\nfunction ', start + 1);
    vm.runInContext(source.slice(start, end), context);
  }
  return context;
}

test('client detects overflow without rewriting server assignments', () => {
  const leads = Array.from({ length: 6 }, (_, i) => ({ id: String(i), status: 'new', assignedAgentId: 'a', receivedAt: i + 1, expiresAt: 999 }));
  const app = setup(leads);
  assert.equal(app.enforceSingleActiveLead().length, 5);
  assert.equal(leads.filter(lead => lead.status === 'new').length, 6);
  leads.forEach(lead => assert.equal(lead.assignedAgentId, 'a'));
  assert.equal(app.enforceSingleActiveLead().length, 5);
});

test('client accepts the latest runtime assignment from the server', () => {
  const leads = [{ id: 'one', status: 'new', assignedAgentId: 'a' }];
  const app = setup(leads);
  const lead = { id: 'two', status: 'queued' };
  for (let i = 0; i < 3; i++) {
    app.applyLeadRuntimeFromSheet(lead, { hasRuntime: true, assignedAgentId: 'a', queueState: 'active' });
    assert.equal(lead.status, 'new');
    assert.equal(lead.assignedAgentId, 'a');
  }
  leads[0].status = 'contacted';
  app.applyLeadRuntimeFromSheet(lead, { hasRuntime: true, assignedAgentId: 'a', queueState: 'active' });
  assert.equal(lead.status, 'new');
});

test('contacted lead keeps the agent recorded by the server', () => {
  const lead = { id: 'done', status: 'contacted', assignedAgentId: null, expiresAt: null };
  const app = setup([lead]);
  app.applyLeadRuntimeFromSheet(lead, {
    hasRuntime: true,
    assignedAgentId: 'agent-shakir',
    queueState: 'contacted',
    receivedAt: 100,
    expiresAt: 200,
    passCount: 0,
    assignmentRevision: 3,
  });
  assert.equal(lead.status, 'contacted');
  assert.equal(lead.assignedAgentId, 'agent-shakir');
  assert.equal(lead.receivedAt, 100);
  assert.equal(lead.expiresAt, null);
  assert.equal(lead.assignmentRevision, 3);
});

test('agent cooldown lasts 5 minutes', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  assert.match(source, /const AGENT_COOLDOWN_MS = 5 \* 60 \* 1000/);
  assert.match(source, /Number\(agent\.cooldownUntil\) > Date\.now\(\)/);
  assert.match(source, /agent\.cooldownUntil = Date\.now\(\) \+ AGENT_COOLDOWN_MS/);
  assert.match(source, /function clearExpiredLocalCooldowns\(now = Date\.now\(\)\)/);
  assert.match(source, /cooldownUntil: normalizeCooldownUntil\(input\.cooldown_until \|\| input\.cooldownUntil\)/);
});

test('agent presence heartbeat runs at five-minute intervals', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  assert.match(source, /const AGENT_PRESENCE_HEARTBEAT_MS = 5 \* 60 \* 1000/);
  assert.match(source, /now - lastAgentPresenceHeartbeatAt < AGENT_PRESENCE_HEARTBEAT_MS/);
});

test('force offline action revokes stale agent sessions', () => {
  const source = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
  assert.match(source, /payload\.action === "force_agent_offline"/);
  assert.match(source, /function forceAgentOffline_\(input\)/);
  assert.match(source, /!sessionStartedAt \|\| sessionStartedAt < parseLeadTimestamp_\(presenceNotBefore\)\.getTime\(\)/);
});

test('client queue activation is read-only', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const start = source.indexOf('function activateQueuedLeads(');
  const body = source.slice(start, source.indexOf('\nfunction ', start + 1));
  assert.match(body, /return \[\];/);
  assert.doesNotMatch(body, /syncLeadRuntimeInSheet|assignedAgentId\s*=/);
});

test('pending status update is protected from stale sheet sync', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  assert.match(source, /pendingLeadStatusUpdates\.get\(existingLead\.id\)\?\.status/);
  assert.match(source, /pendingLeadStatusUpdates\.set\(leadId, \{ status: normalizedStatus, token: updateToken \}\)/);
});

test('lead notes are written to the shared sheet and protected during sync', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  assert.match(source, /action: "update_lead_notes"/);
  assert.match(source, /pendingLeadNoteUpdates\.get\(existingLead\.id\)\?\.notes/);
  assert.match(source, /await updateLeadNotesInSheet\(lead, nextNotes\)/);
  assert.match(source, /shouldMigrateLocalNotes/);
  assert.match(source, /await updateLeadNotesInSheet\(existingLead, existingLead\.notes\)/);
});

test('contacted status sends the acting agent identity to the server', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  assert.match(source, /acting_agent_id: actingAgent\?\.id \|\| ""/);
  assert.match(source, /acting_agent_name: actingAgent\?\.name \|\| ""/);
  assert.match(source, /acting_agent_email: actingAgent\?\.email \|\| ""/);
  assert.match(source, /assignment_revision: Number\(lead\.assignmentRevision\) \|\| 0/);
});

test('CALL NOW starts a protected keepalive status write before opening the phone app', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const requestStart = source.indexOf('async function postGoogleSheetActionWithResponse');
  const requestBody = source.slice(requestStart, source.indexOf('\nasync function ', requestStart + 1));
  const callStart = source.indexOf('async function handleCall(');
  const callBody = source.slice(callStart, source.indexOf('\nfunction ', callStart + 1));
  assert.match(requestBody, /keepalive: true/);
  assert.match(callBody, /pendingLeadStatusUpdates\.set\(leadId, \{ status: "contacted", token: updateToken \}\)/);
  assert.ok(callBody.indexOf('renderAll()') < callBody.indexOf('dialLeadPhone(callablePhone)'));
  assert.ok(callBody.indexOf('const statusUpdatePromise = updateLeadStatusInSheet') < callBody.indexOf('dialLeadPhone(callablePhone)'));
  assert.ok(callBody.indexOf('dialLeadPhone(callablePhone)') < callBody.indexOf('await statusUpdatePromise'));
});

test('CALL NOW restores local lead state when the authoritative status write fails', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const start = source.indexOf('async function handleCall(');
  const body = source.slice(start, source.indexOf('\nfunction ', start + 1));
  assert.match(body, /const previousLead = \{ \.\.\.lead \}/);
  assert.match(body, /await statusUpdatePromise/);
  assert.match(body, /if \(!remoteDatabaseMode\) \{\s*Object\.assign\(lead, previousLead\);\s*saveState\(\);\s*renderAll\(\);/);
  assert.match(body, /showToast\("CALL NOW gagal", error\?\.message/);
});

test('lead display falls back to the server agent name', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  assert.match(source, /getAgent\(lead\.assignedAgentId\)\?\.name \|\| lead\.assignedAgentName/);
  assert.match(source, /matchedAgent\?\.id \|\| rawAssignedAgentId/);
});

test('admin log lead supports filtering by agent', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const html = fs.readFileSync('index.html', 'utf8');
  assert.match(html, /id="lead-agent-filter"/);
  assert.match(source, /agentFilter === "unassigned" \? !lead\.assignedAgentId : lead\.assignedAgentId === agentFilter/);
  assert.match(source, /leadAgentFilter\?\.addEventListener\("change", renderLeadsTable\)/);
});

test('log lead navigation badge counts all visible records', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  assert.match(source, /navLeadCount\.textContent = visibleLeads\.length/);
  assert.doesNotMatch(source, /navLeadCount\.textContent = isAdmin\(\) \? newLeadCount/);
});

test('lead status and agent filter options show live counts', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  assert.match(source, /Semua status \(\$\{visibleLeads\.length\}\)/);
  assert.match(source, /\$\{status\.label\} \(\$\{statusCounts\[status\.value\] \|\| 0\}\)/);
  assert.match(source, /\$\{escapeHtml\(agent\.name\)\} \(\$\{agentCounts\.get\(agent\.id\) \|\| 0\}\)/);
  assert.match(source, /Belum \/ tiada ejen \(\$\{unassignedCount\}\)/);
});

test('agent signup requires and syncs active project choices', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const html = fs.readFileSync('index.html', 'utf8');
  const server = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
  assert.match(html, /id="signup-project-checkboxes"/);
  assert.match(source, /input\[name="signup-project"\]:checked/);
  assert.match(source, /setSignupError\("Pilih sekurang-kurangnya satu projek\."\)/);
  assert.match(source, /signupProjectSyncTimer = window\.setInterval\(syncSignupProjects/);
  assert.match(source, /eligible_project_ids: eligibleProjectIds/);
  assert.match(source, /await submitAgentSignupToSheet\(signupAgent\)/);
  assert.match(source, /fetch\("\/api\/agent-signup"/);
  assert.match(fs.readFileSync('api/agent-signup.js', 'utf8'), /payload\.action !== "add_agent"/);
  assert.match(server, /agent\.role !== "admin" && !agent\.eligibleProjectIds\.length/);
  assert.match(server, /Pilihan projek tidak sah atau projek sudah dinyahaktifkan/);
  assert.match(server, /function sendNewAgentSignupPush_\(spreadsheet, agent\)/);
  assert.match(server, /adminOnly: true/);
});

test('lead and agent deletion require two confirmations', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const helperStart = source.indexOf('function confirmPermanentDelete(');
  const helperEnd = source.indexOf('\nasync function ', helperStart + 1);
  const helper = source.slice(helperStart, helperEnd);
  assert.equal((helper.match(/window\.confirm\(/g) || []).length, 2);
  assert.match(source, /if \(!confirmPermanentDelete\("ejen", agent\.name\)\) return/);
  assert.match(source, /if \(!confirmPermanentDelete\("lead", lead\.name\)\) return/);
});

test('only admins can see or trigger lead deletion', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const html = fs.readFileSync('index.html', 'utf8');
  assert.doesNotMatch(html, /id="contact-delete-button"/);
  assert.match(source, /const deleteButton = isAdmin\(\)/);
  assert.match(source, /if \(remove && isAdmin\(\)\) deleteLeadEverywhere/);
  assert.match(source, /if \(!isAdmin\(\)\) \{\s*showToast\("Admin sahaja"/);
});

test('edit lead modal receives the server-confirmed status revision', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const html = fs.readFileSync('index.html', 'utf8');
  assert.match(html, /id="contact-status"/);
  assert.match(source, /elements\.contactStatus\.value = getLeadVisualStatus\(lead\)/);
  assert.match(source, /await updateLeadStatusFromLog\(lead\.id, nextStatus, elements\.contactStatus\)/);
  const statusWriter = source.slice(
    source.indexOf("async function updateLeadStatusInSheet"),
    source.indexOf("\nasync function ", source.indexOf("async function updateLeadStatusInSheet") + 1),
  );
  assert.match(statusWriter, /postGoogleSheetActionWithResponse/);
  assert.match(source, /fetch\("\/api\/lead-status"/);
  assert.match(statusWriter, /lead\.statusRevision = Number\(result\.status_revision\)/);
  assert.match(statusWriter, /assignment_revision: Number\(lead\.assignmentRevision\) \|\| 0/);
});

test('lead status updates use the same-origin confirmation proxy', () => {
  const proxy = fs.readFileSync('api/lead-status.js', 'utf8');
  assert.match(proxy, /payload\.action === "update_lead_status"/);
  assert.match(proxy, /payload\.action === "set_agent_lead_availability"/);
  assert.match(proxy, /"create_appointment"/);
  assert.match(proxy, /"update_appointment_status"/);
  assert.match(proxy, /"update_appointment"/);
  assert.match(proxy, /"reschedule_appointment"/);
  assert.match(proxy, /"delete_appointment"/);
  assert.match(proxy, /await fetch\(GOOGLE_SHEET_ENDPOINT/);
  assert.match(proxy, /response\.status\(result\?\.ok \? 200 : 409\)/);
});

test('agents must save a note before selecting passed, rejected, or cancelled', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  assert.match(source, /AGENT_NOTE_REQUIRED_STATUSES = new Set\(\["passed", "rejected", "cancelled"\]\)/);
  assert.match(source, /getCurrentUser\(\)\?\.role === "agent"/);
  assert.match(source, /!String\(lead\.notes \|\| ""\)\.trim\(\)/);
  assert.match(source, /"Simpan nota dahulu"/);
  assert.match(source, /acting_role: currentUser\?\.role \|\| ""/);
});

test('agents must CALL NOW before changing a New lead status', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const server = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
  const css = fs.readFileSync('styles.css', 'utf8');
  assert.match(source, /const requiresCallNow = !isAdmin\(\) && visualStatus === "new"/);
  assert.match(source, /data-lead-call="\$\{lead\.id\}"/);
  assert.match(source, /if \(callNow\) handleCall\(callNow\.dataset\.leadCall\)/);
  assert.match(source, /filter\(\(status\) => allowNew \|\| status\.value !== "new"\)/);
  assert.match(source, /Ejen tidak boleh menukar status lead kembali kepada New/);
  assert.match(server, /actingRole === "agent" && normalizeLeadStage_\(status\) === "new"/);
  assert.match(css, /\.log-call-now-button/);
});

test('notes are confirmed in Google Sheet before a modal status update', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const start = source.indexOf('async function updateContact(');
  const body = source.slice(start, source.indexOf('\nasync function ', start + 1));
  assert.ok(body.indexOf('await updateLeadNotesInSheet') < body.indexOf('await updateLeadStatusFromLog'));
  assert.doesNotMatch(body, /if \(!remoteDatabaseMode\)/);
});

test('scheduled sheet sync does not write derived agent totals', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const start = source.indexOf('async function syncGoogleSheet(');
  const body = source.slice(start, source.indexOf('\nfunction ', start + 1));
  assert.doesNotMatch(body, /await syncLeadHandledCountsToSheet\(\)/);
});

test('dashboard sync skips overlapping requests while a prior sync is running', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const start = source.indexOf('async function syncGoogleSheet(');
  const body = source.slice(start, source.indexOf('\nfunction ', start + 1));
  assert.match(source, /let syncInProgress = false/);
  assert.match(body, /if \(syncInProgress\) return false/);
  assert.match(body, /syncInProgress = true/);
  assert.match(body, /finally \{\s*syncInProgress = false/);
});

test('every device blocks agent access until its own notification permission is granted', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const html = fs.readFileSync('index.html', 'utf8');
  const accessStart = source.indexOf('function enforceAgentNotificationAccess(');
  const accessBody = source.slice(accessStart, source.indexOf('\nasync function ', accessStart + 1));
  const syncStart = source.indexOf('async function syncGoogleSheet(');
  const syncBody = source.slice(syncStart, source.indexOf('\nfunction ', syncStart + 1));
  assert.match(accessBody, /Notification\.permission === "granted"/);
  assert.match(accessBody, /const showReminder = !granted && !notificationReminderDismissedForSession/);
  assert.match(accessBody, /notificationRequiredModal\.classList\.toggle\("open", showReminder\)/);
  assert.match(syncBody, /enforceAgentNotificationAccess\(\)/);
  assert.match(html, /Tambah LeadLaju ke skrin utama/);
  assert.match(html, /id="enable-required-notifications"/);
  assert.match(html, /id="add-to-home-screen"/);
  assert.match(html, /id="close-notification-reminder"/);
  assert.match(source, /enableRequiredNotifications\.addEventListener\("click", requestNotifications\)/);
  assert.match(source, /function addToHomeScreen\(\)/);
  assert.match(source, /beforeinstallprompt/);
  assert.match(source, /function closeNotificationReminder\(\)/);
});

test('dashboard and Google Sheet use one official lead status list', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const script = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
  const expected = [
    'New', 'Contacted', 'Passed', 'All Offer Presented',
    'Need Follow Up', 'Potential', 'Rejected', 'Cancelled', 'Client',
  ];
  expected.forEach((status) => {
    assert.match(source, new RegExp(`label: "${status}"`));
    assert.match(script, new RegExp(`"${status}"`));
  });
  assert.match(script, /function normalizeLegacyLeadStatuses_\(sheet, headers\)/);
  assert.match(script, /if \(\["potential", "potensi", "prospect", "prospek", "hot lead"\]/);
});

test('daily pickup stats exclude pending assignments from the completed lead total', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const html = fs.readFileSync('index.html', 'utf8');
  const start = source.indexOf('function renderStats(');
  const body = source.slice(start, source.indexOf('\nfunction ', start + 1));
  assert.match(body, /const resolvedAssignments = assignments\.filter/);
  assert.match(body, /elements\.statToday\.textContent = resolvedAssignments\.length/);
  assert.match(body, /contacted\.length \/ resolvedAssignments\.length/);
  assert.match(body, /elements\.pickupDetails\.textContent/);
  assert.match(html, /Pickup rate hari ini/);
  assert.match(html, /id="pickup-details"/);
});

test('agents explicitly start and stop lead availability from the dashboard', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const html = fs.readFileSync('index.html', 'utf8');
  assert.match(html, /id="get-lead-button"/);
  assert.match(html, /id="stop-lead-button"/);
  assert.match(html, /id="agent-lead-status"/);
  assert.match(source, /async function setAgentLeadAvailability\(ready\)/);
  assert.match(source, /action: "set_agent_lead_availability"/);
  assert.match(source, /postGoogleSheetActionWithResponse\(\{/);
  assert.match(source, /syncPushSubscription\(true\)/);
  assert.match(source, /elements\.getLeadButton\?\.addEventListener/);
  assert.match(source, /elements\.stopLeadButton\?\.addEventListener/);
  assert.match(source, /elements\.getLeadButton\.disabled = ready/);
  assert.match(source, /elements\.stopLeadButton\.disabled = !ready/);
  assert.match(source, /openLeadAvailabilityConfirmation\(user\.leadReady\)/);
  assert.match(html, /id="lead-availability-modal"/);
});

test('dashboard polling uses a two-second interval and shows global action loading', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const html = fs.readFileSync('index.html', 'utf8');
  const css = fs.readFileSync('styles.css', 'utf8');
  assert.match(source, /const DEFAULT_SYNC_INTERVAL_SECONDS = 2/);
  assert.match(source, /function setGlobalLoading\(active/);
  assert.match(html, /id="global-loading-overlay"/);
  assert.match(css, /\.netflix-loader/);
});

test('Sheet controls are fixed at two seconds and always show manual sync feedback', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const html = fs.readFileSync('index.html', 'utf8');
  const css = fs.readFileSync('styles.css', 'utf8');
  assert.match(html, /<option value="2">2 saat<\/option>/);
  assert.doesNotMatch(html, /<option value="5">5 saat<\/option>/);
  assert.match(html, /id="save-integration-button"/);
  assert.match(source, /function waitForCurrentSync\(\)/);
  assert.match(source, /await waitForCurrentSync\(\)/);
  assert.match(source, /runIntegrationSync\(elements\.saveIntegrationButton/);
  assert.match(source, /elements\.syncNowButton\.addEventListener\("click", syncNow\)/);
  assert.match(source, /Disambungkan\. Sync baru sahaja\./);
  assert.match(css, /\.form-actions button\.is-loading::before/);
});

test('notification click fetches the assigned lead directly for an instant dashboard card', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const worker = fs.readFileSync('sw.js', 'utf8');
  const server = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
  const pushApi = fs.readFileSync('api/push.js', 'utf8');
  assert.match(source, /async function syncNotificationLead\(leadId\)/);
  assert.match(source, /url\.searchParams\.set\("lead_id", requestedId\)/);
  assert.match(source, /if \(event\.data\.leadId\) syncNotificationLead/);
  assert.match(source, /showNotificationLeadImmediately\(event\.data\.leadSnapshot\)/);
  assert.match(worker, /leadId: notificationData\.leadId/);
  assert.match(worker, /leadSnapshot: notificationData\.leadSnapshot/);
  assert.match(server, /event\?\.parameter\?\.lead_id/);
  assert.match(source, /showCachedNotificationLead\(pendingNotificationLeadId\)/);
  assert.match(source, /showLatestCachedNotificationLead\(\)/);
  assert.match(source, /parseLeadTimestamp\(lead\.expires_at \|\| lead\.expiresAt, 0\) > now/);
  const instantStart = source.indexOf('async function showNotificationLeadImmediately');
  const instantBody = source.slice(instantStart, source.indexOf('\nasync function ', instantStart + 1));
  assert.ok(instantBody.indexOf('renderAll();') < instantBody.indexOf('await savePromise'));
  assert.match(worker, /notificationData\.leadId \? "OPEN_DASHBOARD"/);
  assert.match(worker, /leadlaju-notification-snapshots/);
  assert.match(worker, /async function cacheLeadSnapshot\(payload/);
  assert.match(worker, /await cacheLeadSnapshot\(payload\)/);
  assert.match(worker, /async function broadcastLeadSnapshot\(payload/);
  assert.match(worker, /type: "LEAD_SNAPSHOT"/);
  assert.match(source, /event\.data\?\.type === "LEAD_SNAPSHOT"/);
  assert.match(worker, /new URL\(`\/__lead_snapshot__/);
  assert.match(pushApi, /leadSnapshot: input\.leadSnapshot/);
  assert.match(pushApi, /hasLeadSnapshot: Boolean\(notification\.leadSnapshot\)/);
  assert.match(server, /leadSnapshot: \{/);
  assert.match(server, /queue_state: "active"/);
  assert.match(server, /view: "dashboard"/);
});

test('login UI is not blocked by the initial Google Sheet agent sync', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const start = source.indexOf('async function bootstrap()');
  const body = source.slice(start, source.indexOf('\nlockViewportZoom()', start));
  assert.ok(body.indexOf('showLogin()') < body.indexOf('initialAgentSyncPromise = syncGoogleSheet'));
  assert.doesNotMatch(body, /await syncGoogleSheet\(\{ silent: true, agentsOnly: true \}\)/);
  assert.match(source, /if \(!user && initialAgentSyncPromise\)/);
});

test('logout reaches the login screen before network cleanup completes', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const start = source.indexOf('function logout()');
  const body = source.slice(start, source.indexOf('\nfunction ', start + 1));
  assert.match(source, /function sendAgentLogoutState\(user\)/);
  assert.match(source, /function cleanUpPushAfterLogout\(\)/);
  assert.doesNotMatch(body, /await setAgentLeadAvailability/);
  assert.doesNotMatch(body, /await updateAgentPresence/);
  assert.ok(body.indexOf('showLogin()') < body.indexOf('cleanUpPushAfterLogout()'));
  assert.match(body, /localStorage\.removeItem\(AUTH_KEY\)/);
});

test('agent sidebar hides the Google Sheet connection card', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const html = fs.readFileSync('index.html', 'utf8');
  const css = fs.readFileSync('styles.css', 'utf8');
  assert.match(html, /class="sync-card admin-only-sync-card" hidden/);
  assert.match(source, /document\.querySelectorAll\("\.admin-only-sync-card"\)/);
  assert.match(source, /item\.hidden = !isAdmin\(\)/);
  assert.match(css, /\.sync-card\[hidden\] \+ \.sidebar-user/);
});

test('mobile sidebar closes on content tap or left swipe and opens on right swipe', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const html = fs.readFileSync('index.html', 'utf8');
  assert.match(source, /function setMobileSidebarOpen\(open\)/);
  assert.match(source, /elements\.sidebar\.contains\(event\.target\)/);
  assert.match(source, /deltaX < 0 && elements\.sidebar\.classList\.contains\("open"\)/);
  assert.match(source, /deltaX > 0 && !elements\.sidebar\.classList\.contains\("open"\)/);
  assert.match(source, /Math\.abs\(deltaX\) < 64/);
  assert.match(html, /aria-controls="sidebar"/);
});

test('project dropdown shows live lead totals for every official status', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const css = fs.readFileSync('styles.css', 'utf8');
  const start = source.indexOf('function renderProjects()');
  const body = source.slice(start, source.indexOf('\nfunction ', start + 1));
  assert.match(body, /project-status-dropdown/);
  assert.match(body, /projectLeads\.length/);
  assert.match(body, /LEAD_STATUS_OPTIONS\.map/);
  assert.match(body, /getLeadVisualStatus\(lead\)/);
  assert.match(source, /expandedProjectStatusIds/);
  assert.match(css, /\.project-status-list/);
});

test('appointment tracker is synced from the server and scoped to assigned leads', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const html = fs.readFileSync('index.html', 'utf8');
  assert.match(source, /const APPOINTMENT_STATUS_OPTIONS/);
  assert.match(source, /state\.appointments = normalizeAppointments\(payload\.appointments\)/);
  assert.match(source, /lead\.assignedAgentId === state\.currentUserId/);
  assert.match(source, /editingAppointmentId \? "update_appointment" : reschedulingAppointmentId \? "reschedule_appointment" : "create_appointment"/);
  assert.match(source, /request_id: pendingAppointmentRequestId/);
  assert.match(source, /lead_id: lead\.dedupeKey \|\| lead\.id/);
  assert.match(source, /pendingAppointmentRequestId = `appointment-/);
  assert.match(html, /data-view="appointments"/);
  assert.match(html, /id="appointment-modal"/);
});

test('appointments follow the current Log Lead owner and support edit and delete', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const server = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
  assert.match(source, /\[lead\.id, lead\.dedupeKey\]/);
  assert.match(source, /data-appointment-edit=/);
  assert.match(source, /data-appointment-delete=/);
  assert.match(source, /confirmPermanentDelete\("appointment"/);
  assert.match(server, /function findAppointmentLeadForRecord_/);
  assert.match(server, /function updateAppointment_/);
  assert.match(server, /function deleteAppointment_/);
  assert.match(server, /filterSubscriptionsForAgent_\(subscriptions, agent\)/);
  assert.match(source, /currentAgentMatches\(appointment\.assignedAgentId/);
});

test('appointment navigation badge counts appointments visible to the current user', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const html = fs.readFileSync('index.html', 'utf8');
  assert.match(html, /id="nav-appointment-count"/);
  assert.match(source, /navAppointmentCount: document\.querySelector\("#nav-appointment-count"\)/);
  assert.match(source, /elements\.navAppointmentCount\.textContent = visible\.length/);
});

test('appointment writes do not wait behind the lead distribution lock', () => {
  const source = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
  const start = source.indexOf('function createAppointment_(');
  const end = source.indexOf('\nfunction findAppointmentRow_', start);
  const createAppointment = source.slice(start, end);
  assert.doesNotMatch(createAppointment, /LockService|getScriptLock|tryLock/);
  assert.match(createAppointment, /findAppointmentRow_\(sheet, headers, appointment\.id\)/);
  assert.match(source, /input\.request_id \|\| input\.requestId/);
  assert.match(source, /function findAppointmentLeadInSheet_\(sheet, leadId\)/);
  assert.match(source, /createTextFinder\(normalizedId\)\.matchEntireCell\(true\)\.findNext\(\)/);
  assert.doesNotMatch(createAppointment, /readLeads_/);
});

test('expired CALL NOW uses the authoritative server action without a local queue mutation', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const start = source.indexOf('async function requestExpiredAssignment(');
  const body = source.slice(start, source.indexOf('\nfunction ', start + 1));
  assert.match(body, /Date\.now\(\) < Number\(lead\.expiresAt\)/);
  assert.match(body, /await expireLeadInSheet\(\{ \.\.\.lead \}\)/);
  assert.match(body, /await syncGoogleSheet\(\{ silent: true, notifyNewLeads: true \}\)/);
  assert.doesNotMatch(body, /queueLead|lead\.status\s*=|lead\.queueState\s*=/);
});

test('foreground expiry has one assignment timer and a 2.5 second local watchdog', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  assert.match(source, /const EXPIRY_WATCHDOG_INTERVAL_MS = 2500/);
  assert.match(source, /Math\.max\(0, Number\(lead\.expiresAt\) - Date\.now\(\)\)/);
  assert.match(source, /window\.setTimeout\(\s*\(\) => requestExpiredAssignment\(key\)/);
  assert.match(source, /if \(!document\.hidden\) processExpiredLeads\(\)/);
});

test('expiry requests are deduplicated by lead id and assignment revision', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  assert.match(source, /`\$\{lead\.id\}:\$\{Number\(lead\.assignmentRevision\) \|\| 0\}`/);
  assert.doesNotMatch(source, /function expiryAssignmentKey\(lead\) \{[^}]*dedupeKey/);
  assert.match(source, /requestState\?\.inFlight/);
  assert.match(source, /requestState\?\.completed/);
  assert.match(source, /expiryRequestStates\.set\(expectedKey, \{ inFlight: true/);
});

test('leads sharing a dedupe key retain distinct expiry request identities', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const start = source.indexOf('function expiryAssignmentKey(');
  const end = source.indexOf('\nfunction ', start + 1);
  const context = vm.createContext({ Number });
  vm.runInContext(source.slice(start, end), context);
  const first = context.expiryAssignmentKey({ id: 'lead-a', dedupeKey: 'shared', assignmentRevision: 3 });
  const second = context.expiryAssignmentKey({ id: 'lead-b', dedupeKey: 'shared', assignmentRevision: 3 });
  assert.equal(first, 'lead-a:3');
  assert.equal(second, 'lead-b:3');
  assert.notEqual(first, second);
});

test('admin dashboard does not expire active assignments owned by unrelated agents', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const start = source.indexOf('function getCurrentExpiryAssignment(');
  const end = source.indexOf('\nfunction ', start + 1);
  const context = vm.createContext({
    state: { leads: [{
      id: 'other-agent-lead', status: 'new', queueState: 'active', assignedAgentId: 'agent-b',
      expiresAt: Date.now() - 1, assignmentRevision: 2,
    }] },
    currentAgentOwnsLead: () => false,
  });
  vm.runInContext(source.slice(start, end), context);
  assert.equal(context.getCurrentExpiryAssignment(), null);
  assert.doesNotMatch(source.slice(start, end), /isAdmin\(/);
});

test('a stale assignment timer revalidates the exact assignment before expiry', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const start = source.indexOf('async function requestExpiredAssignment(');
  const body = source.slice(start, source.indexOf('\nfunction ', start + 1));
  assert.match(body, /state\.leads\.find\(\(item\) => expiryAssignmentKey\(item\) === expectedKey\)/);
  assert.match(body, /lead\.queueState !== "active"/);
  assert.match(body, /!lead\.assignedAgentId/);
});

test('focus and visibility immediately recheck an overdue assignment', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  assert.match(source, /window\.addEventListener\("focus", \(\) => \{\s*processExpiredLeads\(\)/);
  assert.match(source, /document\.addEventListener\("visibilitychange", \(\) => \{\s*if \(!document\.hidden\) \{\s*processExpiredLeads\(\)/);
});

test('failed expiry stays authoritative locally and becomes retryable', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const start = source.indexOf('async function requestExpiredAssignment(');
  const body = source.slice(start, source.indexOf('\nfunction ', start + 1));
  assert.match(body, /retryAfter: Date\.now\(\) \+ EXPIRY_RETRY_DELAY_MS/);
  assert.match(body, /completed: false/);
  assert.doesNotMatch(body, /queueLead|missed/);
  assert.match(source, /return postGoogleSheetActionWithResponse\(/);
});

test('actual response handling keeps a clock-skew server rejection retryable and unchanged', async () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const lead = {
    id: 'clock-skew', dedupeKey: 'clock-skew', status: 'new', queueState: 'active',
    assignedAgentId: 'agent-a', expiresAt: Date.now() - 1, assignmentRevision: 4,
    assignmentHistory: [{ agentId: 'agent-a', outcome: 'pending' }],
  };
  let responseReads = 0;
  const context = vm.createContext({
    state: { leads: [lead] },
    window: { setTimeout, clearTimeout },
    Date, Number, Map, console,
    expiryAssignmentTimer: null, expiryAssignmentTimerKey: '',
    expiryRequestStates: new Map(), EXPIRY_RETRY_DELAY_MS: 3000,
    currentAgentOwnsLead: () => true,
    getSheetEndpoint: () => 'https://example.test/exec',
    fetch: async () => ({
      ok: true,
      json: async () => {
        responseReads += 1;
        return { ok: false, error: 'Masa assignment lead belum tamat.' };
      },
    }),
    syncGoogleSheet: async () => true,
    saveState: () => {},
  });
  const responseStart = source.indexOf('async function postGoogleSheetActionWithResponse(');
  const responseEnd = source.indexOf('\nasync function updateLeadStatusInSheet(', responseStart);
  const expiryPostStart = source.indexOf('async function expireLeadInSheet(');
  const expiryPostEnd = source.indexOf('\nfunction syncLeadRuntimeInSheet(', expiryPostStart);
  const expiryStart = source.indexOf('function expiryAssignmentKey(');
  const expiryEnd = source.indexOf('\nfunction processExpiredLeads(', expiryStart);
  vm.runInContext(source.slice(responseStart, responseEnd), context);
  vm.runInContext(source.slice(expiryPostStart, expiryPostEnd), context);
  vm.runInContext(source.slice(expiryStart, expiryEnd), context);

  const before = structuredClone(lead);
  const key = context.expiryAssignmentKey(lead);
  assert.equal(await context.requestExpiredAssignment(key), false);
  assert.deepEqual(lead, before);
  assert.equal(responseReads, 1);
  assert.equal(context.expiryRequestStates.get(key).completed, false);
  assert.ok(context.expiryRequestStates.get(key).retryAfter > Date.now());

  context.expiryRequestStates.get(key).retryAfter = 0;
  assert.equal(await context.requestExpiredAssignment(key), false);
  assert.equal(responseReads, 2);
  assert.deepEqual(lead, before);
});

test('actual response handler rejects HTTP and application failures but returns ok responses', async () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const start = source.indexOf('async function postGoogleSheetActionWithResponse(');
  const end = source.indexOf('\nasync function updateLeadStatusInSheet(', start);
  const context = vm.createContext({
    state: { integration: {} },
    getSheetEndpoint: () => 'https://example.test/exec',
    saveState: () => {},
    console,
    fetch: async () => ({ ok: false, status: 503, json: async () => ({ error: 'Unavailable' }) }),
  });
  vm.runInContext(source.slice(start, end), context);

  await assert.rejects(context.postGoogleSheetActionWithResponse({}, 'test'), /Unavailable/);
  context.fetch = async () => ({ ok: true, json: async () => ({ ok: false, error: 'Belum tamat' }) });
  await assert.rejects(context.postGoogleSheetActionWithResponse({}, 'test'), /Belum tamat/);
  context.fetch = async () => ({ ok: true, json: async () => ({ ok: true, updated: 1 }) });
  assert.deepEqual(
    await context.postGoogleSheetActionWithResponse({}, 'test'),
    { ok: true, updated: 1 },
  );
});

test('appointment reminders are server-side, deduplicated, and target the correct roles', () => {
  const source = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
  assert.match(source, /const APPOINTMENTS_SHEET_NAME = "Appointments"/);
  assert.match(source, /agent_3_days/);
  assert.match(source, /agent_1_day/);
  assert.match(source, /admin_1_day/);
  assert.match(source, /agent_4_hours/);
  assert.match(source, /agent_30_minutes/);
  assert.match(source, /function processAppointmentReminders_/);
  assert.match(source, /state\[slot\.key\] = canonicalLeadTimestamp_/);
  assert.match(source, /url: `\/\?view=appointments&appointment=/);
});

test('an older server response cannot reset an agent GET LEAD choice', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const start = source.indexOf('function normalizeSheetAgent(input)');
  const body = source.slice(start, source.indexOf('\nfunction sheetDedupeKey', start));
  assert.match(body, /const hasLeadReady = Object\.prototype\.hasOwnProperty\.call\(input, "lead_ready"\)/);
  assert.match(body, /const leadReady = hasLeadReady \? Boolean\(input\.lead_ready \?\? input\.leadReady\) : undefined/);
  assert.match(source, /if \(sheetAgent\.leadReady !== undefined\) updates\.leadReady = sheetAgent\.leadReady/);
});

test('admin lead monitor exposes live assignment diagnostics and agent filters', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const html = fs.readFileSync('index.html', 'utf8');
  assert.match(html, /class="nav-item admin-only" data-view="lead-monitor"/);
  assert.match(html, /id="lead-monitor-view"/);
  assert.match(html, /id="monitor-agent-filter"/);
  assert.match(source, /function inspectLeadMovement\(now = Date\.now\(\)\)/);
  assert.match(source, /"expired-active"/);
  assert.match(source, /"called-still-new"/);
  assert.match(source, /"multiple-active"/);
  assert.match(source, /"unknown-agent"/);
  assert.match(source, /"missing-runtime"/);
  assert.match(source, /"queued-assigned"/);
  assert.match(source, /elements\.navMonitorCount\.textContent = issues\.length/);
  assert.match(source, /renderLeadMonitor\(\);\s*renderIntegration\(\)/);
});
