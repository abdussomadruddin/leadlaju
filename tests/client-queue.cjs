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
  assert.doesNotMatch(statusWriter, /assignment_revision/);
});

test('lead status updates use the same-origin confirmation proxy', () => {
  const proxy = fs.readFileSync('api/lead-status.js', 'utf8');
  assert.match(proxy, /payload\.action === "update_lead_status"/);
  assert.match(proxy, /payload\.action === "set_agent_lead_availability"/);
  assert.match(proxy, /"create_appointment"/);
  assert.match(proxy, /"update_appointment_status"/);
  assert.match(proxy, /"reschedule_appointment"/);
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
  assert.match(source, /action = reschedulingAppointmentId \? "reschedule_appointment" : "create_appointment"/);
  assert.match(source, /request_id: pendingAppointmentRequestId/);
  assert.match(source, /pendingAppointmentRequestId = `appointment-/);
  assert.match(html, /data-view="appointments"/);
  assert.match(html, /id="appointment-modal"/);
});

test('appointment writes do not wait behind the lead distribution lock', () => {
  const source = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
  const start = source.indexOf('function createAppointment_(');
  const end = source.indexOf('\nfunction findAppointmentRow_', start);
  const createAppointment = source.slice(start, end);
  assert.doesNotMatch(createAppointment, /LockService|getScriptLock|tryLock/);
  assert.match(createAppointment, /findAppointmentRow_\(sheet, headers, appointment\.id\)/);
  assert.match(source, /input\.request_id \|\| input\.requestId/);
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
