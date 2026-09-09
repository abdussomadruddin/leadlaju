const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

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
