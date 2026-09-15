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
    shouldIgnoreStaleSyncRow: () => false,
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

test('approval failure reloads canonical Supabase state before retaining a pending card', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const start = source.indexOf('async function approveAgent(');
  const body = source.slice(start, source.indexOf('\nasync function saveProject', start));
  assert.match(body, /canonicalReloaded = await loadRemoteState\(state\.currentUserId\)/);
  assert.match(body, /canonicalReloaded && !getAgent\(agentId\)/);
  assert.match(body, /authoritativelyDeletedAgentIds\.add\(agentId\)/);
});

test('approval conflicts return a readable application response instead of a non-2xx Edge Function error', () => {
  const source = fs.readFileSync('supabase/functions/admin-manage-agent/index.ts', 'utf8');
  assert.match(source, /if \(!approvedProfile\) return response\(\{ ok: false, error: "Status ejen sudah berubah\. Sila sync semula\." \}\);/);
  assert.doesNotMatch(source, /Status ejen sudah berubah\. Sila sync semula\." \}, 409/);
});

test('only canonical pending profiles render and execute the approval action', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const renderStart = source.indexOf('function renderAgents()');
  const renderBody = source.slice(renderStart, source.indexOf('\nfunction renderProjects()', renderStart));
  const approveStart = source.indexOf('async function approveAgent(');
  const approveBody = source.slice(approveStart, source.indexOf('\nasync function saveProject', approveStart));
  assert.match(renderBody, /agent\.approvalStatus === "pending"/);
  assert.doesNotMatch(renderBody, /isPendingAgent = agent\.role === "agent" && !agent\.active/);
  assert.match(approveBody, /agent\.approvalStatus !== "pending"/);
});

test('new signup state records pending approval separately from active status', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const start = source.indexOf('async function handleAgentSignup(');
  const body = source.slice(start, source.indexOf('\nfunction showSignupSuccess', start));
  assert.equal((body.match(/approvalStatus: "pending"/g) || []).length, 2);
  assert.equal((body.match(/active: false/g) || []).length, 2);
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
  assert.match(fs.readFileSync('api/agent-signup.js', 'utf8'), /\["signup_agent", "approve_agent"\]\.includes\(payload\.action\)/);
  assert.match(server, /agent\.role !== "admin" && !agent\.eligibleProjectIds\.length/);
  assert.match(server, /Pilihan projek tidak sah atau projek sudah dinyahaktifkan/);
  assert.match(server, /function sendNewAgentSignupPush_\(spreadsheet, agent\)/);
  assert.match(server, /adminOnly: true/);
});

test('agent signup stays loading until a complete persisted agent is confirmed', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const html = fs.readFileSync('index.html', 'utf8');
  const start = source.indexOf('async function handleAgentSignup(');
  const body = source.slice(start, source.indexOf('\nfunction sendAgentLogoutState', start));
  assert.match(body, /setGlobalLoading\(true, "Menyimpan pendaftaran ejen\.\.\."\)/);
  assert.match(body, /await submitAgentSignupToSheet\(signupAgent\)/);
  assert.match(body, /persistedAgent\?\.id[\s\S]*persistedAgent\?\.name[\s\S]*persistedAgent\?\.phone[\s\S]*persistedAgent\?\.email/);
  assert.ok(body.indexOf('setGlobalLoading(false)') < body.indexOf('signupSuccessModal.classList.add("open")'));
  assert.match(html, /id="signup-success-modal"/);
  assert.match(html, /Menunggu approval admin/);
  assert.doesNotMatch(html, /id="signup-call-admin"/);
  assert.doesNotMatch(html, /id="signup-whatsapp-admin"/);
  assert.match(html, /id="close-signup-success"/);
});

test('completed signup is recovered when its response is lost after the Sheet write', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const submitStart = source.indexOf('async function submitAgentSignupToSheet(');
  const submitEnd = source.indexOf('\nasync function deleteAgentFromSheet', submitStart);
  const body = source.slice(submitStart, submitEnd);
  assert.match(body, /const recoveredAgent = await confirmPersistedSignupAgent\(agent\)/);
  assert.match(body, /return \{ ok: true, recovered: true, agent: recoveredAgent \}/);
  assert.match(body, /String\(item\.id \|\| ""\) === String\(agent\.id\)/);
  assert.match(body, /normalizeAgentActive\(persistedAgent\.active \?\? persistedAgent\.status\)/);
  assert.ok(body.indexOf('if (options.approve) throw error') < body.indexOf('confirmPersistedSignupAgent(agent)'));
});

test('signup response does not wait for the admin push notification', () => {
  const server = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
  const upsertStart = server.indexOf('function upsertAgent_(');
  const upsertEnd = server.indexOf('\nfunction deleteAgent_', upsertStart);
  const upsert = server.slice(upsertStart, upsertEnd);
  assert.doesNotMatch(upsert, /sendNewAgentSignupPush_/);
  assert.match(server, /function processPendingAgentSignupNotifications_\(spreadsheet, agents\)/);
  assert.match(server, /const agentSignupNotifications = processPendingAgentSignupNotifications_\(spreadsheet, agents\)/);
  assert.match(server, /agent_signup_notifications: agentSignupNotifications/);
});

test('agent signup proxy and Apps Script reject or roll back partial agent rows', () => {
  const proxy = fs.readFileSync('api/agent-signup.js', 'utf8');
  const server = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
  assert.match(proxy, /agent\.id &&[\s\S]*agent\.name &&[\s\S]*agent\.phone &&[\s\S]*agent\.email &&[\s\S]*agent\.password/);
  assert.match(proxy, /Array\.isArray\(agent\.eligible_project_ids\)/);
  assert.match(server, /if \(!agent\.id \|\| !agent\.name \|\| !agent\.phone \|\| !agent\.email \|\| !agent\.password\)/);
  assert.match(server, /SpreadsheetApp\.flush\(\)/);
  assert.match(server, /const persistedAgent = readAgents_\(sheet, headers\)\.find/);
  assert.match(server, /if \(!complete\)[\s\S]*clearContent\(\)/);
  assert.match(server, /function agentRowHasIdentity_\(headers, row\)/);
  assert.match(server, /if \(!agentRowHasIdentity_\(headers, row\)\) return \[row\[handledIndex\]\]/);
  assert.match(server, /if \(!agentRowHasIdentity_\(headers, value\)\) return/);
  assert.match(server, /clearIdentitylessAgentDerivedValues_\(agentsSheet, agentHeaders\)/);
});

test('agent approval waits for authoritative confirmation and protects the pending card from stale sync', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const start = source.indexOf('async function approveAgent(');
  const body = source.slice(start, source.indexOf('\nasync function ', start + 1));
  assert.match(source, /const pendingAgentApprovals = new Set\(\)/);
  assert.match(source, /pendingAgentApprovals\.has\(existingAgent\.id\)[\s\S]*existingAgent\.active/);
  assert.match(source, /!pendingAgentApprovals\.has\(agent\.id\)/);
  assert.match(body, /pendingAgentApprovals\.add\(agentId\)/);
  assert.match(body, /setGlobalLoading\(true, `Sedang approve/);
  assert.match(body, /await waitForCurrentSync\(\)/);
  assert.match(body, /await submitAgentSignupToSheet\(\{ \.\.\.agent, active: true \}, \{ approve: true \}\)/);
  assert.match(body, /isAgentExplicitlyActive\(result\.agent\?\.active\)/);
  assert.match(body, /await syncGoogleSheetFresh\(\{ silent: true, agentsOnly: true \}\)/);
  assert.ok(body.indexOf('renderAll();') < body.indexOf('showToast("Ejen approved"'));
  assert.match(body, /finally[\s\S]*pendingAgentApprovals\.delete\(agentId\)[\s\S]*setGlobalLoading\(false\)/);
});

test('Supabase-created agent remains pending and a stale noncanonical approval card is removed', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const addStart = source.indexOf('async function addAgent(');
  const addBody = source.slice(addStart, source.indexOf('\nasync function approveAgent(', addStart));
  const approveStart = source.indexOf('async function approveAgent(');
  const approveBody = source.slice(approveStart, source.indexOf('\nasync function saveProject(', approveStart));
  assert.match(addBody, /action: "signup_request"/);
  assert.doesNotMatch(addBody, /body: \{ action: "approve", userId: signup\.data\.userId \}/);
  assert.match(addBody, /sedang menunggu approval admin/);
  assert.match(approveBody, /const isMissingCanonicalAgent = remoteDatabaseMode/);
  assert.match(approveBody, /state\.agents = state\.agents\.filter\(\(item\) => item\.id !== agentId\)/);
});

test('successful agent sync removes an absent rejected agent on every device immediately', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const start = source.indexOf('async function syncAgentsFromSheet(');
  const body = source.slice(start, source.indexOf('\nasync function ', start + 1));

  assert.ok(start >= 0);
  assert.doesNotMatch(body, /if \(!sheetAgents\.length\)/);
  assert.doesNotMatch(body, /missingSheetAgentCounts|return misses >= 3/);
  assert.match(
    body,
    /!pendingAgentApprovals\.has\(agent\.id\)[\s\S]*!pendingAgentDeletions\.has\(agent\.id\)[\s\S]*!sheetEmails\.has\(String\(agent\.email \|\| ""\)\.toLowerCase\(\)\)/,
  );
  assert.match(body, /state\.agents = state\.agents\.filter\(\(item\) => item\.id !== agent\.id\)/);
});

test('new agent status is pending unless the server explicitly confirms active', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const server = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
  const proxy = fs.readFileSync('api/agent-signup.js', 'utf8');
  const start = source.indexOf('function normalizeAgentActive(');
  const end = source.indexOf('\nfunction normalizeAgentRole', start);
  const context = vm.createContext({});
  vm.runInContext(source.slice(start, end), context);
  assert.equal(context.normalizeAgentActive(undefined), false);
  assert.equal(context.normalizeAgentActive(''), false);
  assert.equal(context.normalizeAgentActive('pending'), false);
  assert.equal(context.normalizeAgentActive('inactive'), false);
  assert.equal(context.normalizeAgentActive('active'), true);
  assert.match(proxy, /active: payload\.action === "approve_agent" \? "active" : "inactive"/);
  assert.match(server, /payload\.action === "signup_agent"[\s\S]*active: "inactive"/);
  assert.match(server, /payload\.action === "approve_agent"[\s\S]*active: "active"/);
});

test('reject and delete wait for authoritative removal before hiding the agent card', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const proxy = fs.readFileSync('api/agent-signup.js', 'utf8');
  const start = source.indexOf('async function deleteAgentWithLoading(');
  const end = source.indexOf('\nasync function toggleAgent', start);
  const body = source.slice(start, end);
  assert.match(source, /const pendingAgentDeletions = new Set\(\)/);
  assert.match(source, /const authoritativelyDeletedAgentIds = new Set\(\)/);
  assert.match(source, /authoritativelyDeletedAgentIds\.has\(sheetAgent\.id\)/);
  assert.match(source, /pendingAgentDeletions\.has\(existingAgent\?\.id \|\| sheetAgent\.id\)/);
  assert.match(body, /setGlobalLoading\(true,/);
  assert.doesNotMatch(body, /await waitForCurrentSync\(\)/);
  assert.match(body, /const result = await deleteAgentFromSheet\(agent\)/);
  assert.ok(body.indexOf('const result = await deleteAgentFromSheet(agent)') < body.indexOf('state.agents = state.agents.filter'));
  assert.doesNotMatch(body, /Number\(result\.deleted\) < 1/);
  assert.match(body, /authoritativelyDeletedAgentIds\.add\(agent\.id\)/);
  assert.doesNotMatch(body, /syncGoogleSheetFresh/);
  assert.match(body, /finally[\s\S]*pendingAgentDeletions\.delete\(agent\.id\)[\s\S]*setGlobalLoading\(false\)/);
  assert.match(proxy, /const deletingAgent = payload\.action === "delete_agent"/);
});

test('agent deletion is idempotent and avoids slow structural Sheet row deletion', () => {
  const server = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
  const start = server.indexOf('function deleteAgent_(');
  const end = server.indexOf('\nfunction buildAgentRow_', start);
  const body = server.slice(start, end);
  assert.doesNotMatch(body, /deleteRow\(/);
  assert.match(body, /matchedRows\.forEach\(\(rowNumber\) => sheet\.getRange\(rowNumber, 1, 1, headers\.length\)\.clearContent\(\)\)/);
  assert.match(body, /already_absent: matchedRows\.length === 0/);
});

test('rejected email can register again while existing server email remains protected', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const server = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
  const signupStart = source.indexOf('async function handleAgentSignup(');
  const signupEnd = source.indexOf('\nfunction sendAgentLogoutState', signupStart);
  const signup = source.slice(signupStart, signupEnd);
  assert.doesNotMatch(signup, /state\.agents\.some\(\(agent\) => agent\.email/);
  assert.match(server, /signupRequest: true/);
  assert.match(server, /if \(input\.signupRequest && rowNumber && matchedRowId !== agent\.id\)/);
  assert.match(server, /Emel ini sudah didaftarkan\./);
  const deleteStart = server.indexOf('if (payload.action === "delete_agent")');
  const deleteEnd = server.indexOf('\n    if (payload.action === "replace_agents")', deleteStart);
  assert.doesNotMatch(server.slice(deleteStart, deleteEnd), /rebalanceLeadQueue_/);
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
  assert.match(proxy, /payload\.action === "expire_lead"/);
  assert.match(proxy, /"create_appointment"/);
  assert.match(proxy, /"update_appointment_status"/);
  assert.match(proxy, /"update_appointment"/);
  assert.match(proxy, /"reschedule_appointment"/);
  assert.match(proxy, /"delete_appointment"/);
  assert.match(proxy, /await fetch\(GOOGLE_SHEET_ENDPOINT/);
  assert.match(proxy, /response\.status\(result\?\.ok \? 200 : 409\)/);
});

test('expiry requests reach the Google Apps Script proxy with their canonical assignment revision', async () => {
  const handler = require('../api/lead-status.js');
  const originalFetch = global.fetch;
  const calls = [];
  const response = {
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return { json: async () => ({ ok: true, expired: 1 }) };
  };
  try {
    await handler(
      {
        method: 'POST',
        body: { action: 'expire_lead', lead: { id: 'lead-123', assignment_revision: 7 } },
      },
      response,
    );
  } finally {
    global.fetch = originalFetch;
  }
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.payload, { ok: true, expired: 1 });
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    action: 'expire_lead',
    lead: { id: 'lead-123', assignment_revision: 7 },
  });
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

test('a pre-push sync cannot remove a newer service-worker assignment', async () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const helperStart = source.indexOf('function authoritativeLeadKey(');
  const helperEnd = source.indexOf('\nasync function addLead(', helperStart);
  const syncStart = source.indexOf('async function syncGoogleSheet(');
  const syncEnd = source.indexOf('\nfunction scheduleSync(', syncStart);
  let resolveOldResponse;
  let fetchMode = 'old';
  const renders = [];
  const errors = [];
  const context = vm.createContext({
    state: {
      leads: [], activities: [], agents: [], projects: [], appointments: [],
      integration: { endpoint: 'https://sheet.test', interval: 1, connected: true, lastSyncAt: 1 },
    },
    authoritativeStateGeneration: 0,
    authoritativeLeadGenerations: new Map(),
    syncInProgress: false,
    syncCompletionWaiters: [],
    DEFAULT_SYNC_INTERVAL_SECONDS: 1,
    remoteDatabaseMode: false,
    Date, Number, Set, URL,
    getSheetEndpoint: () => 'https://sheet.test',
    fetch: () => fetchMode === 'old'
      ? new Promise((resolve) => { resolveOldResponse = resolve; })
      : Promise.resolve({
        ok: true,
        json: async () => fetchMode === 'confirmed' ? [{ id: 'lead-x' }] : [],
      }),
    elements: { connectionResult: { classList: { add() {}, remove() {} }, innerHTML: '' } },
    syncAgentsFromSheet: async () => ({ added: 0, updated: 0, removed: 0 }),
    sheetDedupeKey: (row) => row.id,
    addLead: async () => false,
    deleteLeads: async (ids) => {
      context.state.leads = context.state.leads.filter((lead) => !ids.includes(lead.id));
      return ids.length;
    },
    cleanupLocallyExpiredAssignments() {}, saveState() {}, scheduleSync() {},
    renderAll: () => renders.push(context.state.leads.map((lead) => lead.id)),
    enforceAgentNotificationAccess() {}, processAdminReminderFromSheet: async () => {},
    getCurrentUser: () => null, isAdmin: () => false, showToast() {},
    console: { error: (...args) => errors.push(args.map(String).join(' ')) },
  });
  vm.runInContext(source.slice(helperStart, helperEnd), context);
  vm.runInContext(source.slice(syncStart, syncEnd), context);

  const oldSync = context.syncGoogleSheet({ silent: true });
  await Promise.resolve();
  const pushedLead = {
    id: 'local-17', dedupeKey: 'lead-x', status: 'new', queueState: 'active',
    assignmentRevision: 17, statusRevision: 0,
  };
  context.state.leads.push(pushedLead);
  context.markAuthoritativeLeadCommit(pushedLead);
  context.renderAll();
  assert.deepEqual(context.state.leads.map((lead) => lead.assignmentRevision), [17]);

  resolveOldResponse({ ok: true, json: async () => [] });
  assert.equal(await oldSync, true, errors.join('\n'));
  assert.deepEqual(context.state.leads.map((lead) => lead.assignmentRevision), [17]);
  assert.deepEqual(renders, [['local-17'], ['local-17']]);

  fetchMode = 'confirmed';
  assert.equal(await context.syncGoogleSheet({ silent: true }), true);
  assert.equal(context.state.leads.length, 1);
  assert.equal(context.state.leads[0].assignmentRevision, 17);

  fetchMode = 'ended';
  assert.equal(await context.syncGoogleSheet({ silent: true }), true);
  assert.deepEqual(context.state.leads, []);
  assert.deepEqual(renders.at(-1), []);
});

test('newer assignment and status revisions reject stale rows but accept newer authority', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const helperStart = source.indexOf('function authoritativeLeadKey(');
  const helperEnd = source.indexOf('\nasync function addLead(', helperStart);
  const lead = {
    id: 'local-18', dedupeKey: 'lead-x', assignmentRevision: 18, statusRevision: 4,
  };
  const context = vm.createContext({
    state: { leads: [lead] },
    authoritativeStateGeneration: 0,
    authoritativeLeadGenerations: new Map(),
    Number, String,
  });
  vm.runInContext(source.slice(helperStart, helperEnd), context);
  const syncGeneration = context.authoritativeStateGeneration;
  context.markAuthoritativeLeadCommit(lead);

  assert.equal(context.shouldIgnoreStaleSyncRow(
    lead, { assignment_revision: 17, status_revision: 4 }, syncGeneration), true);
  assert.equal(context.shouldIgnoreStaleSyncRow(
    lead, { assignment_revision: 18, status_revision: 3 }, syncGeneration), true);
  assert.equal(context.shouldIgnoreStaleSyncRow(
    lead, { assignment_revision: 19, status_revision: 0 }, syncGeneration), false);
  assert.equal(context.shouldIgnoreStaleSyncRow(
    lead, { assignment_revision: 18, status_revision: 5 }, syncGeneration), false);
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
  const css = fs.readFileSync('styles.css', 'utf8');
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
  const availabilityStart = source.indexOf('async function setAgentLeadAvailability(');
  const availabilityBody = source.slice(availabilityStart, source.indexOf('\nfunction enforceAgentNotificationAccess', availabilityStart));
  assert.ok(availabilityBody.indexOf('await postGoogleSheetActionWithResponse') < availabilityBody.indexOf('user.leadReady ='));
  assert.ok(availabilityBody.indexOf('user.leadReady =') < availabilityBody.indexOf('renderAll();'));
  assert.ok(availabilityBody.indexOf('renderAll();') < availabilityBody.indexOf('finishLoading();'));
  assert.ok(availabilityBody.indexOf('finishLoading();') < availabilityBody.indexOf('openLeadAvailabilityConfirmation'));
  assert.match(availabilityBody, /button\.classList\.add\("is-loading"\)/);
  assert.match(availabilityBody, /button\.setAttribute\("aria-busy", "true"\)/);
  assert.match(css, /\.agent-lead-control-buttons button\.is-loading::after/);
  assert.match(html, /id="lead-availability-modal"/);
});

test('dashboard polling uses a one-second interval while unrelated timers remain unchanged', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const html = fs.readFileSync('index.html', 'utf8');
  const css = fs.readFileSync('styles.css', 'utf8');
  assert.match(source, /const DEFAULT_SYNC_INTERVAL_SECONDS = 1/);
  assert.match(source, /const SIGNUP_PROJECT_SYNC_INTERVAL_SECONDS = 2/);
  assert.match(source, /const EXPIRY_WATCHDOG_INTERVAL_MS = 2500/);
  assert.match(source, /window\.setInterval\(syncSignupProjects, SIGNUP_PROJECT_SYNC_INTERVAL_SECONDS \* 1000\)/);
  assert.match(source, /DEFAULT_SYNC_INTERVAL_SECONDS \* 1000/);
  assert.match(source, /function setGlobalLoading\(active/);
  assert.match(html, /id="global-loading-overlay"/);
  assert.match(css, /\.netflix-loader/);
});

test('Sheet controls are fixed at one second and always show manual sync feedback', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const html = fs.readFileSync('index.html', 'utf8');
  const css = fs.readFileSync('styles.css', 'utf8');
  assert.match(html, /<option value="1">1 saat<\/option>/);
  assert.doesNotMatch(html, /<option value="2">2 saat<\/option>/);
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
  assert.match(source, /consumeAssignmentHandoff\(event\.data/);
  assert.match(worker, /leadId: notificationData\.leadId/);
  assert.match(worker, /leadSnapshot: notificationData\.leadSnapshot/);
  assert.match(server, /event\?\.parameter\?\.lead_id/);
  assert.match(source, /showCachedNotificationLead\(pendingNotificationLeadId\)/);
  assert.match(source, /showLatestCachedNotificationLead\(\)/);
  assert.match(source, /parseLeadTimestamp\(lead\.expires_at \|\| lead\.expiresAt, 0\) > now/);
  const instantStart = source.indexOf('async function acceptAssignmentSnapshot');
  const instantBody = source.slice(instantStart, source.indexOf('\nasync function showNotificationLeadImmediately', instantStart));
  assert.ok(instantBody.indexOf('renderAll();') < instantBody.indexOf('Promise.resolve(savePromise)'));
  assert.doesNotMatch(instantBody, /await savePromise/);
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

test('notification timing instrumentation leaves the immediate snapshot render path unchanged', async () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const helperStart = source.indexOf('function leadTimingKey(');
  const helperEnd = source.indexOf('\nfunction shouldNotifyForLead(', helperStart);
  const instantStart = source.indexOf('function assignmentSnapshotDisposition');
  const instantEnd = source.indexOf('\nfunction postAssignmentServiceWorkerMessage', instantStart);
  const snapshot = {
    id: 'lead-timing', assignment_revision: 9, status_revision: 1,
    assigned_agent_id: 'agent-a', status: 'New', queue_state: 'active',
    expires_at: Date.now() + 60000,
  };
  const logs = [];
  let releaseSave;
  const context = vm.createContext({
    state: { leads: [] },
    Date, Number, String, Boolean, console: { log: (...args) => logs.push(args) },
    performance: { now: () => 42 },
    document: { visibilityState: 'visible', hasFocus: () => true },
    navigator: { serviceWorker: { controller: {} } },
    getCurrentUser: () => ({ role: 'agent' }),
    markAuthoritativeLeadCommit() {},
    currentAgentMatches: () => true,
    parseLeadTimestamp: value => new Date(value).getTime(),
    normalizeSheetStatus: value => String(value || '').toLowerCase(),
    syncGoogleSheetFresh() {},
    switchView() {},
    canAccessLead: () => true,
    isVisuallyExpiredAssignment: () => false,
    getVisibleActiveLead: () => context.state.leads[0] || null,
    renderAll: () => logs.push(['render']),
    saveState() {},
    addLead: (input, options) => {
      const lead = { id: 'local-id', dedupeKey: input.id, assignmentRevision: input.assignment_revision };
      context.state.leads.unshift(lead);
      options.onStateCommit(lead);
      return new Promise(resolve => { releaseSave = () => resolve('added'); });
    },
  });
  vm.runInContext(source.slice(helperStart, helperEnd), context);
  vm.runInContext(source.slice(instantStart, instantEnd), context);

  const before = structuredClone(snapshot);
  const pending = context.showNotificationLeadImmediately(snapshot);
  assert.deepEqual(snapshot, before);
  assert.deepEqual(context.state.leads[0], { id: 'local-id', dedupeKey: 'lead-timing', assignmentRevision: 9 });
  assert.ok(logs.some(([event]) => event === 'render'));
  assert.ok(logs.some(([event]) => String(event).includes('APP_STATE_COMMIT')));
  assert.ok(logs.every(([event]) => event === 'render' || (!String(event).includes('phone') && !String(event).includes('email') && !String(event).includes('notes'))));
  releaseSave();
  assert.equal(await pending, true);
});

test('service worker timing logs only correlation and timing metadata', () => {
  const worker = fs.readFileSync('sw.js', 'utf8');
  const timingStart = worker.indexOf('function logLeadTiming(');
  const timingEnd = worker.indexOf('\nself.addEventListener("install"', timingStart);
  const timingBody = worker.slice(timingStart, timingEnd);
  assert.match(worker, /logLeadTiming\("SW_PUSH", timing\)/);
  assert.match(worker, /logLeadTiming\("SW_NOTIFICATION_START", timing\)/);
  assert.match(worker, /logLeadTiming\("SW_BROADCAST_START", timing\)/);
  assert.match(worker, /logLeadTiming\("SW_BROADCAST_COMPLETE", timing\)/);
  assert.match(timingBody, /JSON\.stringify/);
  assert.match(timingBody, /swPushEpoch/);
  assert.match(timingBody, /swBroadcastStartEpoch/);
  assert.match(timingBody, /swBroadcastCompleteEpoch/);
  assert.doesNotMatch(timingBody, /payload\.(leadSnapshot|phone|email|name|notes)/);
});

test('service worker sends timing metadata separately from the canonical lead snapshot', () => {
  const worker = fs.readFileSync('sw.js', 'utf8');
  const start = worker.indexOf('async function broadcastLeadSnapshot');
  const end = worker.indexOf('\nself.addEventListener("message"', start);
  const body = worker.slice(start, end);
  assert.match(body, /leadSnapshot: payload\.leadSnapshot/);
  assert.match(body, /timing: \{/);
  assert.match(body, /swPushEpoch:/);
  assert.match(body, /swBroadcastStartEpoch:/);
  assert.match(body, /swBroadcastCompleteEpoch:/);
  assert.match(body, /type: "LEAD_SNAPSHOT_TIMING"/);
  assert.doesNotMatch(body, /payload\.leadSnapshot\.(timing|swPushEpoch|swBroadcastStartEpoch|swBroadcastCompleteEpoch)/);
});

test('open agent renders the pushed CALL NOW before the device notification is shown', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const worker = fs.readFileSync('sw.js', 'utf8');
  const deliveryStart = worker.indexOf('async function deliverLeadNotification');
  const deliveryEnd = worker.indexOf('\nself.addEventListener("message"', deliveryStart);
  const delivery = worker.slice(deliveryStart, deliveryEnd);
  assert.ok(delivery.indexOf('await cacheLeadSnapshot(payload)') < delivery.indexOf('await broadcastLeadSnapshot(payload, timing)'));
  assert.ok(delivery.indexOf('await broadcastLeadSnapshot(payload, timing)') < delivery.indexOf('await showLeadNotification(payload, timing'));
  assert.match(worker, /client\.postMessage\(message\)/);
  const messageStart = source.indexOf('if (event.data?.type === "LEAD_SNAPSHOT")');
  const messageEnd = source.indexOf('\n    if (event.data?.type === "LEAD_ASSIGNMENT_HANDOFF")', messageStart);
  const messageBody = source.slice(messageStart, messageEnd);
  assert.match(messageBody, /consumeAssignmentHandoff\(event\.data, timing\)\.then\(\(ready\) =>/);
  assert.match(messageBody, /event\.ports\?\.\[0\]\?\.postMessage\(\{ ready \}\)/);
});

test('notification still proceeds when no app client is open or an old client does not acknowledge', () => {
  const worker = fs.readFileSync('sw.js', 'utf8');
  const broadcastStart = worker.indexOf('async function broadcastLeadSnapshot');
  const broadcastEnd = worker.indexOf('\nasync function deliverLeadNotification', broadcastStart);
  const broadcast = worker.slice(broadcastStart, broadcastEnd);
  assert.match(broadcast, /clients\.map\(\(client\) => deliverLeadSnapshotToClient/);
  assert.match(broadcast, /clientCount: clients\.length/);
  assert.match(broadcast, /deliveredClientCount: deliveredResults\.filter\(Boolean\)\.length/);
  assert.doesNotMatch(broadcast, /if \(!clients\.length\).*return/);
});

test('phone polling consumes the locally cached push snapshot without waiting for Sheet sync', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const checkStart = source.indexOf('async function checkCachedAssignmentSnapshot');
  const checkEnd = source.indexOf('\nasync function registerServiceWorker', checkStart);
  const checkBody = source.slice(checkStart, checkEnd);
  const scheduleStart = source.indexOf('function scheduleSync()');
  const scheduleEnd = source.indexOf('\nfunction waitForCurrentSync', scheduleStart);
  const scheduleBody = source.slice(scheduleStart, scheduleEnd);
  assert.match(checkBody, /cachedAssignmentCheckInProgress/);
  assert.match(checkBody, /await showLatestCachedNotificationLead\(\)/);
  assert.match(checkBody, /finally \{/);
  assert.match(scheduleBody, /checkCachedAssignmentSnapshot\(\)/);
  assert.match(scheduleBody, /syncGoogleSheet\(\{ silent: true \}\)/);
  assert.ok(scheduleBody.indexOf('checkCachedAssignmentSnapshot()') < scheduleBody.indexOf('syncGoogleSheet({ silent: true })'));
  assert.match(scheduleBody, /DEFAULT_SYNC_INTERVAL_SECONDS \* 1000/);
});

test('every new lead notification is held for seven seconds without exceeding the mobile push lifetime', () => {
  const worker = fs.readFileSync('sw.js', 'utf8');
  const deliveryStart = worker.indexOf('async function deliverLeadNotification');
  const deliveryEnd = worker.indexOf('\nself.addEventListener("message"', deliveryStart);
  const delivery = worker.slice(deliveryStart, deliveryEnd);
  assert.match(worker, /const LEAD_NOTIFICATION_HOLD_MS = 7000/);
  assert.ok(delivery.indexOf('await cacheLeadSnapshot(payload)') < delivery.indexOf('await broadcastLeadSnapshot(payload, timing)'));
  assert.ok(delivery.indexOf('await broadcastLeadSnapshot(payload, timing)') < delivery.indexOf('setTimeout(resolve, LEAD_NOTIFICATION_HOLD_MS)'));
  assert.ok(delivery.indexOf('setTimeout(resolve, LEAD_NOTIFICATION_HOLD_MS)') < delivery.indexOf('await showLeadNotification(payload, timing'));
});

test('app writes a readable single-line delivery trace without lead business data', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const start = source.indexOf('function logLeadTiming(');
  const end = source.indexOf('\nfunction timingSnapshotLead', start);
  const body = source.slice(start, end);
  assert.match(body, /eventName === "DELIVERY_TRACE"/);
  assert.match(body, /pushToBroadcastStartMs/);
  assert.match(body, /broadcastDurationMs/);
  assert.match(body, /broadcastCompleteToAppMs/);
  assert.match(body, /pushToAppMs/);
  assert.match(body, /JSON\.stringify\(entry\)/);
  assert.doesNotMatch(body, /(phone|email|name|notes|project|source):/);
  const logs = [];
  const context = vm.createContext({
    Date: { now: () => 160 }, Number, String,
    console: { log: (line) => logs.push(line) },
    document: { visibilityState: 'visible', hasFocus: () => true },
    navigator: { serviceWorker: { controller: {} } },
    getCurrentUser: () => ({ role: 'agent' }),
  });
  vm.runInContext(source.slice(source.indexOf('function leadTimingKey('), end), context);
  context.logLeadTiming('DELIVERY_TRACE', { id: 'lead-123', assignment_revision: 7, phone: 'not-logged' }, {
    key: 'lead-123:7', swPushEpoch: 100, swBroadcastStartEpoch: 110,
    swBroadcastCompleteEpoch: 120, appMessageReceivedEpoch: 150,
  }, 160);
  const entry = JSON.parse(logs[0].replace('[LeadLajuTiming] ', ''));
  assert.equal(entry.key, 'lead-123:7');
  assert.equal(entry.pushToBroadcastStartMs, 10);
  assert.equal(entry.broadcastDurationMs, 10);
  assert.equal(entry.broadcastCompleteToAppMs, 30);
  assert.equal(entry.pushToAppMs, 50);
  assert.equal(Object.hasOwn(entry, 'phone'), false);
});

test('snapshot timing is passed only to diagnostics and not to canonical lead state', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const messageStart = source.indexOf('navigator.serviceWorker.addEventListener("message"');
  const messageBody = source.slice(messageStart, source.indexOf('\nwindow.addEventListener("beforeinstallprompt"', messageStart));
  assert.match(messageBody, /const timing = \{ \.\.\.\(event\.data\.timing \|\| \{\}\), appMessageReceivedEpoch \}/);
  assert.match(messageBody, /consumeAssignmentHandoff\(event\.data, timing\)/);
  assert.match(messageBody, /leadTimingDeliveries\.set/);
  assert.match(messageBody, /event\.data\?\.type === "LEAD_SNAPSHOT_TIMING"/);
  assert.match(messageBody, /logLeadTiming\("DELIVERY_TRACE"/);
  assert.doesNotMatch(messageBody, /leadSnapshot\.timing/);
  const addLeadStart = source.indexOf('async function addLead(');
  const addLeadBody = source.slice(addLeadStart, source.indexOf('\nfunction openManualLeadModal', addLeadStart));
  assert.doesNotMatch(addLeadBody, /timing/);
});

test('notification handoffs use agent lead and assignment revision without overwriting another lead', () => {
  const worker = fs.readFileSync('sw.js', 'utf8');
  const start = worker.indexOf('function leadHandoffIdentity(');
  const end = worker.indexOf('\nasync function cacheLeadSnapshot', start);
  const context = vm.createContext({ String, Number, encodeURIComponent, LEAD_HANDOFF_SCHEMA_VERSION: 1 });
  vm.runInContext(worker.slice(start, end), context);
  const first = context.leadHandoffIdentity({
    leadId: 'lead-a', leadSnapshot: { assigned_agent_id: 'agent-1', assignment_revision: 7 },
  });
  const second = context.leadHandoffIdentity({
    leadId: 'lead-b', leadSnapshot: { assigned_agent_id: 'agent-1', assignment_revision: 3 },
  });
  assert.equal(first.key, 'agent-1:lead-a:7');
  assert.equal(second.key, 'agent-1:lead-b:3');
  assert.notEqual(first.path, second.path);
  assert.doesNotMatch(worker, /let pendingLead\s*=/);
});

test('cold-start notification handoff waits for authenticated app readiness and acknowledgement', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const worker = fs.readFileSync('sw.js', 'utf8');
  const startApp = source.slice(source.indexOf('function startAuthenticatedApp('), source.indexOf('\nfunction ', source.indexOf('function startAuthenticatedApp(') + 1));
  const click = worker.slice(worker.indexOf('self.addEventListener("notificationclick"'), worker.length);
  assert.match(startApp, /registerServiceWorker\(\)\.then\(\(\) => announceAssignmentReceiverReady\(\)\)/);
  assert.match(source, /type: "APP_READY_FOR_LEAD_ASSIGNMENT"/);
  assert.match(worker, /replayLeadHandoffs\(event\.source/);
  assert.match(worker, /type: "LEAD_ASSIGNMENT_HANDOFF"/);
  assert.match(source, /type: "LEAD_ASSIGNMENT_HANDOFF_ACK"/);
  assert.match(worker, /acknowledgeLeadHandoff\(event\.data\)/);
  assert.ok(click.indexOf('await cacheLeadSnapshot(notificationData)') < click.indexOf('await self.clients.openWindow(targetUrl)'));
  assert.match(worker, /\[CACHE_NAME, LEAD_HANDOFF_CACHE\]\.includes\(key\)/);
});

test('snapshot acceptance rejects wrong owner expiry old revision and unrelated stale notification', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const start = source.indexOf('function assignmentSnapshotDisposition(');
  const end = source.indexOf('\nasync function acceptAssignmentSnapshot', start);
  const state = { leads: [] };
  let ownerMatches = true;
  let visibleLead = null;
  const context = vm.createContext({
    state, Number, String,
    Date: { now: () => 1000 },
    currentAgentMatches: () => ownerMatches,
    parseLeadTimestamp: value => Number(value) || 0,
    normalizeSheetStatus: value => String(value || '').toLowerCase(),
    getVisibleActiveLead: () => visibleLead,
  });
  vm.runInContext(source.slice(start, end), context);
  const base = {
    id: 'lead-a', assigned_agent_id: 'agent-1', assignment_revision: 4,
    status_revision: 1, status: 'New', queue_state: 'active', expires_at: 2000,
  };
  assert.equal(context.assignmentSnapshotDisposition(base).accepted, true);
  ownerMatches = false;
  assert.deepEqual({ ...context.assignmentSnapshotDisposition(base) }, { accepted: false, terminal: false });
  ownerMatches = true;
  assert.equal(context.assignmentSnapshotDisposition({ ...base, expires_at: 999 }).terminal, true);
  state.leads.push({ id: 'local-a', dedupeKey: 'lead-a', assignmentRevision: 5, statusRevision: 1, status: 'new' });
  assert.equal(context.assignmentSnapshotDisposition(base).terminal, true);
  state.leads.length = 0;
  visibleLead = { id: 'lead-b', dedupeKey: 'lead-b' };
  assert.deepEqual({ ...context.assignmentSnapshotDisposition(base) }, { accepted: false, terminal: true, reconcile: true });
  visibleLead.receivedAt = 1200;
  const newer = context.assignmentSnapshotDisposition({ ...base, received_at: 1500 });
  assert.equal(newer.accepted, true);
  assert.equal(newer.supersededLead, visibleLead);
});

test('same assignment is idempotent while a contacted local revision cannot be reverted to New', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const start = source.indexOf('function assignmentSnapshotDisposition(');
  const end = source.indexOf('\nasync function acceptAssignmentSnapshot', start);
  const local = { id: 'local', dedupeKey: 'lead-a', assignmentRevision: 8, statusRevision: 3, status: 'new' };
  const context = vm.createContext({
    state: { leads: [local] }, Number, String,
    Date: { now: () => 1000 }, currentAgentMatches: () => true,
    parseLeadTimestamp: value => Number(value) || 0,
    normalizeSheetStatus: value => String(value || '').toLowerCase(),
    getVisibleActiveLead: () => local.status === 'new' ? local : null,
  });
  vm.runInContext(source.slice(start, end), context);
  const snapshot = {
    id: 'lead-a', assigned_agent_id: 'agent-1', assignment_revision: 8,
    status_revision: 3, status: 'New', queue_state: 'active', expires_at: 2000,
  };
  assert.equal(context.assignmentSnapshotDisposition(snapshot).accepted, true);
  local.status = 'contacted';
  assert.deepEqual({ ...context.assignmentSnapshotDisposition(snapshot) }, { accepted: false, terminal: true });
});

test('new and immediately previous service worker handoff formats remain compatible', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const worker = fs.readFileSync('sw.js', 'utf8');
  assert.match(worker, /schemaVersion: LEAD_HANDOFF_SCHEMA_VERSION/);
  assert.match(worker, /leadSnapshot: payload\.leadSnapshot/);
  assert.match(worker, /\/__lead_snapshot__\//);
  assert.match(source, /cached\.leadSnapshot \|\| cached/);
  assert.match(source, /event\.data\?\.type === "LEAD_SNAPSHOT"/);
  assert.match(source, /event\.data\?\.type === "LEAD_ASSIGNMENT_HANDOFF"/);
  assert.match(source, /data\.schemaVersion != null && data\.schemaVersion !== LEAD_HANDOFF_SCHEMA_VERSION/);
  assert.match(source, /if \(!matching\[0\]\.handoffKey\) await cache\.delete/);
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
  assert.match(source, /lead_id: remoteDatabaseMode \? lead\.id : \(lead\.dedupeKey \|\| lead\.id\)/);
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
  assert.match(body, /await syncGoogleSheetFresh\(\{ silent: true, notifyNewLeads: true \}\)/);
  assert.doesNotMatch(body, /queueLead|lead\.status\s*=|lead\.queueState\s*=/);
});

test('local expiry hides CALL NOW and Log Lead together before the server response', async () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const lead = {
    id: 'lead-a', status: 'new', queueState: 'active', assignedAgentId: 'agent-a',
    expiresAt: Date.now() - 1, assignmentRevision: 5,
    assignmentHistory: [{ agentId: 'agent-a', outcome: 'pending' }],
  };
  const before = structuredClone(lead);
  let releaseServer;
  const serverResponse = new Promise(resolve => { releaseServer = resolve; });
  const renderSnapshots = [];
  const context = vm.createContext({
    state: { leads: [lead] }, Date, Number, Map, Set, console,
    window: { setTimeout, clearTimeout },
    expiryAssignmentTimer: null, expiryAssignmentTimerKey: '',
    expiryRequestStates: new Map(), locallyExpiredAssignments: new Set(),
    EXPIRY_RETRY_DELAY_MS: 3000,
    currentAgentOwnsLead: () => true,
    expireLeadInSheet: () => serverResponse,
    syncGoogleSheetFresh: async () => true,
    renderAll: () => renderSnapshots.push(context.locallyExpiredAssignments.has('lead-a:5')),
  });
  const start = source.indexOf('function expiryAssignmentKey(');
  const end = source.indexOf('\nfunction processExpiredLeads(', start);
  vm.runInContext(source.slice(start, end), context);

  const request = context.requestExpiredAssignment('lead-a:5');
  assert.deepEqual(renderSnapshots, [true]);
  assert.equal(context.isLocallyExpiredAssignment(lead), true);
  assert.deepEqual(lead, before);
  releaseServer({ ok: true });
  assert.equal(await request, true);
});

test('CALL NOW and Log Lead consume the same revision-specific visual expiry view', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const activeStart = source.indexOf('function getVisibleActiveLead(');
  const activeBody = source.slice(activeStart, source.indexOf('\nfunction ', activeStart + 1));
  const logStart = source.indexOf('function renderLeadsTable(');
  const logBody = source.slice(logStart, source.indexOf('\nfunction ', logStart + 1));
  assert.match(activeBody, /!isVisuallyExpiredAssignment\(lead\)/);
  assert.match(logBody, /if \(isVisuallyExpiredAssignment\(lead\)\) return false/);
  assert.match(logBody, /canAccessLead\(lead\) && !isVisuallyExpiredAssignment\(lead\)/);
  assert.match(source, /function expiryAssignmentKey\(lead\) \{\s*return lead \? `\$\{lead\.id\}:\$\{Number\(lead\.assignmentRevision\) \|\| 0\}`/);
});

test('admin dashboard renders every active assigned lead as a compact name agent timer list', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const styles = fs.readFileSync('styles.css', 'utf8');
  const activeStart = source.indexOf('function renderActiveLead(');
  const activeBody = source.slice(activeStart, source.indexOf('\nfunction renderAgentLeadControls(', activeStart));

  assert.match(activeBody, /if \(isAdmin\(\)\) \{\s*renderAdminActiveLeads\(\);\s*return;/);
  assert.match(activeBody, /function getAdminActiveLeads\(\)/);
  assert.match(activeBody, /Boolean\(lead\.assignedAgentId\)/);
  assert.match(activeBody, /Number\(lead\.expiresAt\) > Date\.now\(\)/);
  assert.match(activeBody, /leads\.map\(\(lead\) =>/);
  assert.match(activeBody, /admin-active-lead-name/);
  assert.match(activeBody, /admin-active-lead-agent/);
  assert.match(activeBody, /admin-active-lead-timer/);
  assert.match(styles, /\.admin-active-lead-list/);
  assert.match(styles, /@media \(max-width: 850px\)[\s\S]*\.admin-active-lead/);
});

test('transport failure keeps the UI-only expiry hidden and retryable without canonical mutation', async () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const lead = {
    id: 'transport', status: 'new', queueState: 'active', assignedAgentId: 'agent-a',
    expiresAt: Date.now() - 1, assignmentRevision: 2, assignmentHistory: [],
  };
  const before = structuredClone(lead);
  const context = vm.createContext({
    state: { leads: [lead] }, Date, Number, Map, Set,
    console: { warn() {} }, window: { setTimeout, clearTimeout },
    expiryAssignmentTimer: null, expiryAssignmentTimerKey: '',
    expiryRequestStates: new Map(), locallyExpiredAssignments: new Set(),
    EXPIRY_RETRY_DELAY_MS: 3000,
    currentAgentOwnsLead: () => true,
    expireLeadInSheet: async () => { throw new Error('Network unavailable'); },
    syncGoogleSheetFresh: async () => true,
    renderAll() {},
  });
  const start = source.indexOf('function expiryAssignmentKey(');
  const end = source.indexOf('\nfunction processExpiredLeads(', start);
  vm.runInContext(source.slice(start, end), context);

  assert.equal(await context.requestExpiredAssignment('transport:2'), false);
  assert.equal(context.locallyExpiredAssignments.has('transport:2'), true);
  assert.equal(context.expiryRequestStates.get('transport:2').completed, false);
  assert.ok(context.expiryRequestStates.get('transport:2').retryAfter > Date.now());
  assert.deepEqual(lead, before);
});

test('a stale local expiry marker cannot hide a newer assignment revision', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const leadB = { id: 'same-lead', status: 'new', queueState: 'active', assignmentRevision: 6 };
  const context = vm.createContext({
    state: { leads: [leadB] }, Number, Set,
    locallyExpiredAssignments: new Set(['same-lead:5']),
    expiryRequestStates: new Map(),
  });
  const start = source.indexOf('function expiryAssignmentKey(');
  const end = source.indexOf('\nfunction isAuthoritativeNotExpiredError(', start);
  vm.runInContext(source.slice(start, end), context);
  assert.equal(context.isLocallyExpiredAssignment(leadB), false);
  context.cleanupLocallyExpiredAssignments();
  assert.equal(context.locallyExpiredAssignments.size, 0);
});

test('clock-skew recovery commits future expiry before cleanup and locally hides the second expiry', async () => {
  const source = fs.readFileSync('app.js', 'utf8');
  let now = 10_000;
  const lead = {
    id: 'clock-skew', status: 'new', queueState: 'active', assignmentRevision: 4,
    assignedAgentId: 'agent-a', expiresAt: 9_000, assignmentHistory: [],
  };
  const before = structuredClone(lead);
  const renders = [];
  let expiryCalls = 0;
  let releaseSecondExpiry;
  const context = vm.createContext({
    state: { leads: [lead] }, Date: { now: () => now }, Number, Set, Map,
    locallyExpiredAssignments: new Set(),
    expiryRequestStates: new Map(), EXPIRY_RETRY_DELAY_MS: 3000,
    expiryAssignmentTimer: null, expiryAssignmentTimerKey: '',
    window: { setTimeout: () => 1, clearTimeout() {} },
    currentAgentOwnsLead: () => true,
    renderAll: () => renders.push(context.locallyExpiredAssignments.has('clock-skew:4')),
    expireLeadInSheet: async () => {
      expiryCalls += 1;
      if (expiryCalls === 1) throw new Error('Masa assignment lead belum tamat.');
      return new Promise(resolve => { releaseSecondExpiry = resolve; });
    },
    syncGoogleSheetFresh: async () => {
      lead.expiresAt = 20_000;
      context.cleanupLocallyExpiredAssignments();
      return true;
    },
    console: { warn() {} },
  });
  const start = source.indexOf('function expiryAssignmentKey(');
  const end = source.indexOf('\nfunction processExpiredLeads(', start);
  vm.runInContext(source.slice(start, end), context);

  assert.equal(await context.requestExpiredAssignment('clock-skew:4'), false);
  assert.deepEqual(renders, [true, false]);
  assert.equal(lead.expiresAt, 20_000);
  assert.equal(context.expiryRequestStates.has('clock-skew:4'), false);
  assert.deepEqual({ ...lead, expiresAt: before.expiresAt }, before);

  now = 20_000;
  const secondRequest = context.requestExpiredAssignment('clock-skew:4');
  assert.equal(expiryCalls, 2);
  assert.equal(context.locallyExpiredAssignments.has('clock-skew:4'), true);
  assert.deepEqual(renders, [true, false, true]);
  releaseSecondExpiry({ ok: true });
  assert.equal(await secondRequest, true);
});

test('admin visually expires another agent lead without becoming its expiry worker', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const lead = {
    id: 'agent-b-lead', status: 'new', queueState: 'active', assignedAgentId: 'agent-b',
    expiresAt: 9_000, assignmentRevision: 3,
  };
  const context = vm.createContext({
    state: { leads: [lead] }, Date: { now: () => 10_000 }, Number, Set,
    locallyExpiredAssignments: new Set(), currentAgentOwnsLead: () => false,
  });
  const predicateStart = source.indexOf('function expiryAssignmentKey(');
  const predicateEnd = source.indexOf('\nfunction cleanupLocallyExpiredAssignments(', predicateStart);
  vm.runInContext(source.slice(predicateStart, predicateEnd), context);
  assert.equal(context.isVisuallyExpiredAssignment(lead), true);

  const workerStart = source.indexOf('function getCurrentExpiryAssignment(');
  const workerEnd = source.indexOf('\nfunction ', workerStart + 1);
  vm.runInContext(source.slice(workerStart, workerEnd), context);
  assert.equal(context.getCurrentExpiryAssignment(), null);
});

test('post-mutation fresh sync waits for an older in-flight sync before reading again', async () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const start = source.indexOf('async function syncGoogleSheetFresh(');
  const end = source.indexOf('\nfunction ', start + 1);
  const calls = [];
  let releaseOldSync;
  const context = vm.createContext({
    syncInProgress: true,
    waitForCurrentSync: () => new Promise(resolve => { releaseOldSync = () => { calls.push('old-finished'); resolve(); }; }),
    syncGoogleSheet: async () => { calls.push('fresh-read'); return true; },
  });
  vm.runInContext(source.slice(start, end), context);
  const fresh = context.syncGoogleSheetFresh({ silent: true });
  assert.deepEqual(calls, []);
  releaseOldSync();
  assert.equal(await fresh, true);
  assert.deepEqual(calls, ['old-finished', 'fresh-read']);
});

test('post-mutation fresh sync starts immediately when no sync is active', async () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const start = source.indexOf('async function syncGoogleSheetFresh(');
  const end = source.indexOf('\nfunction ', start + 1);
  const calls = [];
  const context = vm.createContext({
    syncInProgress: false,
    waitForCurrentSync: () => { calls.push('unexpected-wait'); return Promise.resolve(); },
    syncGoogleSheet: async () => { calls.push('fresh-read'); return true; },
  });
  vm.runInContext(source.slice(start, end), context);
  assert.equal(await context.syncGoogleSheetFresh({ silent: true }), true);
  assert.deepEqual(calls, ['fresh-read']);
});

test('a failed current sync releases the waiter and permits exactly one fresh read', async () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const freshStart = source.indexOf('async function syncGoogleSheetFresh(');
  const freshEnd = source.indexOf('\nfunction ', freshStart + 1);
  const calls = [];
  let releaseFailedSync;
  const context = vm.createContext({
    syncInProgress: true,
    waitForCurrentSync: () => new Promise(resolve => {
      releaseFailedSync = () => { calls.push('failed-old-sync-finished'); context.syncInProgress = false; resolve(); };
    }),
    syncGoogleSheet: async () => { calls.push('fresh-read'); return true; },
  });
  vm.runInContext(source.slice(freshStart, freshEnd), context);
  const fresh = context.syncGoogleSheetFresh({ silent: true });
  assert.deepEqual(calls, []);
  releaseFailedSync();
  assert.equal(await fresh, true);
  assert.deepEqual(calls, ['failed-old-sync-finished', 'fresh-read']);
});

test('actual fresh-sync helpers serialize a post-mutation read after the pre-mutation sync', async () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const calls = [];
  let releaseOldResponse;
  const oldResponse = new Promise(resolve => { releaseOldResponse = resolve; });
  let requestCount = 0;
  const context = vm.createContext({
    syncInProgress: false,
    syncCompletionWaiters: [],
    syncGoogleSheet: async () => {
      assert.equal(context.syncInProgress, false);
      context.syncInProgress = true;
      requestCount += 1;
      try {
        if (requestCount === 1) {
          calls.push('A-start');
          await oldResponse;
          calls.push('A-commit-old');
        } else {
          calls.push('B-start-after-mutation');
          calls.push('B-commit-new');
        }
        return true;
      } finally {
        context.syncInProgress = false;
        const waiters = context.syncCompletionWaiters;
        context.syncCompletionWaiters = [];
        waiters.forEach(resolve => resolve());
      }
    },
  });
  const waitStart = source.indexOf('function waitForCurrentSync(');
  const freshEnd = source.indexOf('\nfunction ', source.indexOf('async function syncGoogleSheetFresh(', waitStart) + 1);
  vm.runInContext(source.slice(waitStart, freshEnd), context);

  const oldSync = context.syncGoogleSheet();
  const freshSync = context.syncGoogleSheetFresh({ silent: true });
  assert.deepEqual(calls, ['A-start']);
  releaseOldResponse();
  assert.equal(await oldSync, true);
  assert.equal(await freshSync, true);
  assert.deepEqual(calls, ['A-start', 'A-commit-old', 'B-start-after-mutation', 'B-commit-new']);
  assert.equal(requestCount, 2);
});

test('authoritative lead processing and removals finish before marker cleanup and the single render', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const syncStart = source.indexOf('async function syncGoogleSheet(');
  const syncEnd = source.indexOf('\nfunction scheduleSync(', syncStart);
  const body = source.slice(source.indexOf('const syncStartedAt = Date.now();', syncStart), syncEnd);
  const rowCommit = body.indexOf('await addLead(row');
  const removalCommit = body.indexOf('await deleteLeads(');
  const cleanup = body.indexOf('cleanupLocallyExpiredAssignments()');
  const render = body.indexOf('renderAll()');
  assert.ok(rowCommit >= 0 && rowCommit < cleanup);
  assert.ok(removalCommit >= 0 && removalCommit < cleanup);
  assert.ok(cleanup < render);
  assert.equal((body.match(/cleanupLocallyExpiredAssignments\(\)/g) || []).length, 1);
  assert.equal((body.match(/renderAll\(\)/g) || []).length, 1);
});

test('fresh authoritative assignment renders CALL NOW and Log Lead in one render cycle', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const syncStart = source.indexOf('async function syncGoogleSheet(');
  const syncBody = source.slice(
    source.indexOf('const syncStartedAt = Date.now();', syncStart),
    source.indexOf('\nfunction scheduleSync(', syncStart),
  );
  const renderStart = source.indexOf('function renderAll(');
  const renderBody = source.slice(renderStart, source.indexOf('\nconst viewTitles', renderStart));
  assert.equal((syncBody.match(/renderAll\(\)/g) || []).length, 1);
  assert.ok(renderBody.indexOf('renderActiveLead()') < renderBody.indexOf('renderLeadsTable()'));
  assert.match(syncBody, /cleanupLocallyExpiredAssignments\(\)/);
  assert.match(source, /await syncGoogleSheetFresh\(\{ silent: true, notifyNewLeads: true \}\)/);
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
  assert.match(source, /expiryRequestStates\.set\(expectedKey, \{\s*inFlight: true/);
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
  assert.match(source, /document\.addEventListener\("visibilitychange", \(\) => \{[\s\S]*?if \(document\.hidden\)[\s\S]*?else \{\s*processExpiredLeads\(\)/);
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

test('watchdog performs second and third expiry retries after retryAfter', async () => {
  const source = fs.readFileSync('app.js', 'utf8');
  let now = 10_000;
  let expiryCalls = 0;
  const lead = {
    id: 'retry-three-times', status: 'new', queueState: 'active', assignedAgentId: 'agent-a',
    expiresAt: 9_000, assignmentRevision: 8, assignmentHistory: [],
  };
  let watchdogCallback;
  const context = vm.createContext({
    state: { leads: [lead] }, Date: { now: () => now }, Number, Map, Set,
    document: { hidden: false },
    window: {
      setTimeout: () => 1,
      clearTimeout() {},
      setInterval: callback => { watchdogCallback = callback; return 2; },
      clearInterval() {},
    },
    expiryAssignmentTimer: null, expiryAssignmentTimerKey: '', expiryWatchdogTimer: null,
    expiryRequestStates: new Map(), locallyExpiredAssignments: new Set(),
    EXPIRY_RETRY_DELAY_MS: 3000, EXPIRY_WATCHDOG_INTERVAL_MS: 2500,
    currentAgentOwnsLead: () => true,
    expireLeadInSheet: async () => {
      expiryCalls += 1;
      if (expiryCalls < 3) throw new Error('Temporary upstream failure');
      return { ok: true, expired: 1 };
    },
    syncGoogleSheetFresh: async () => true,
    renderAll() {}, console: { warn() {} },
  });
  const start = source.indexOf('function expiryAssignmentKey(');
  const end = source.indexOf('\nfunction setCallButtonLoading(', start);
  vm.runInContext(source.slice(start, end), context);

  context.scheduleExpiryWatchdog();
  await context.requestExpiredAssignment('retry-three-times:8');
  assert.equal(expiryCalls, 1);
  assert.equal(context.expiryRequestStates.get('retry-three-times:8').completed, false);

  now += 3001;
  watchdogCallback();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(expiryCalls, 2);
  assert.equal(context.expiryRequestStates.get('retry-three-times:8').completed, false);

  now += 3001;
  watchdogCallback();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(expiryCalls, 3);
  assert.equal(context.expiryRequestStates.get('retry-three-times:8').completed, true);
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
    expiryRequestStates: new Map(), locallyExpiredAssignments: new Set(), EXPIRY_RETRY_DELAY_MS: 3000,
    currentAgentOwnsLead: () => true,
    getSheetEndpoint: () => 'https://example.test/exec',
    fetch: async () => ({
      ok: true,
      json: async () => {
        responseReads += 1;
        return { ok: false, error: 'Masa assignment lead belum tamat.' };
      },
    }),
    syncGoogleSheetFresh: async () => true,
    renderAll: () => {},
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
  assert.equal(context.expiryRequestStates.get(key).authoritativeNotExpired, true);
  assert.equal(context.locallyExpiredAssignments.has(key), false);

  context.expiryRequestStates.get(key).retryAfter = 0;
  assert.equal(await context.requestExpiredAssignment(key), false);
  assert.equal(responseReads, 2);
  assert.equal(context.expiryRequestStates.get(key).authoritativeNotExpired, true);
  assert.equal(context.locallyExpiredAssignments.has(key), false);
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
