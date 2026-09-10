const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

function fixture(rows, agents = [{ id: 'a', eligible_project_ids: ['project-armani'] }, { id: 'b', eligible_project_ids: ['project-armani'] }]) {
  const headers = ['id', 'name', 'phone', 'project', 'status', 'assigned_agent_id', 'queue_state', 'received_at', 'expires_at', 'queued_at', 'pass_count', 'retry_after_cycle', 'assignment_revision', 'assignment_history'];
  const fields = { assignedAgentId: 'assigned_agent_id', assignedAgentEmail: 'email', assignedAgentName: 'agent_name', receivedAt: 'received_at', expiresAt: 'expires_at', queueState: 'queue_state', queuedAt: 'queued_at', passCount: 'pass_count', retryAfterCycle: 'retry_after_cycle', assignmentRevision: 'assignment_revision', assignmentHistory: 'assignment_history' };
  const values = [headers, ...rows.map(row => headers.map(key => row[key] || ''))];
  const properties = new Map();
  const sheet = {
    getDataRange: () => ({ getDisplayValues: () => values.map(row => row.slice()) }),
    getLastRow: () => values.length,
    getRange: row => ({ setValues: ([value]) => { values[row - 1] = value; } }),
  };
  const context = vm.createContext({
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties.get(key) || null, setProperty: (key, value) => properties.set(key, String(value)) }) },
  });
  vm.runInContext(fs.readFileSync('google-apps-script/Code.gs', 'utf8'), context);
  Object.assign(context, {
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }) },
    ensureRequiredHeaders_: () => headers,
    getActiveAgentsForPush_: () => agents,
    getOrCreateSheet_: () => sheet,
    ensureRequiredHeadersBySpec_: () => headers,
    ensureProjectsFromLeads_: () => [{ id: 'project-armani', name: 'Armani Putrajaya', active: true }, { id: 'project-bbsap', name: 'BBSAP Sitiawan', active: true }],
    ensureAgentProjectEligibility_: () => {},
    readPushSubscriptions_: () => [],
    mapRow_: (headers, row) => {
      const mapped = Object.fromEntries(headers.map((key, i) => [key, row[i]]));
      try { mapped.assignment_history = JSON.parse(mapped.assignment_history || '[]'); } catch { mapped.assignment_history = []; }
      return mapped;
    },
    normalizeLeadStage_: value => value || 'new',
    canonicalLeadTimestamp_: value => new Date(value).toISOString(),
    getCell_: (headers, row, field) => row[headers.indexOf(fields[field] || field)],
    setRowValue_: (headers, row, field, value) => {
      const index = headers.indexOf(fields[field] || field);
      if (index >= 0) row[index] = value;
    },
  });
  return {
    run: () => context.notifyUnsentLeadPushes_({}, sheet, headers),
    rows: () => values.slice(1).map(row => context.mapRow_(headers, row)),
    properties,
    handled: index => { values[index + 1][4] = 'contacted'; },
    assign: input => context.updateLeadRuntime_(input),
  };
}

const lead = (id, extra = {}) => ({ id, name: id, phone: '0123456789', project: 'Armani Putrajaya', status: 'new', ...extra });

test('server clears expired cooldown values before assignment', () => {
  const source = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
  assert.match(source, /function clearExpiredAgentCooldowns_\(sheet, headers, now\)/);
  assert.match(source, /clearExpiredAgentCooldowns_\(queueAgentsSheet, queueAgentHeaders\)/);
});

test('burst assigns one per agent and holds excess without a timer', () => {
  const f = fixture(Array.from({ length: 6 }, (_, i) => lead(String(i))));
  f.run();
  const rows = f.rows();
  assert.deepEqual(rows.slice(0, 2).map(row => row.assigned_agent_id), ['a', 'b']);
  rows.slice(2).forEach(row => {
    assert.equal(row.queue_state, 'queued');
    assert.equal(row.assigned_agent_id, '');
    assert.equal(row.expires_at, '');
  });
  f.run();
  assert.equal(f.rows().filter(row => row.queue_state === 'active').length, 2);
});

test('existing assignments reserve slots even below queued rows', () => {
  const f = fixture([lead('waiting'), lead('existing', { assigned_agent_id: 'a', queue_state: 'active' })], [{ id: 'a' }]);
  f.run();
  assert.equal(f.rows()[0].queue_state, 'queued');
  assert.equal(f.rows()[1].assigned_agent_id, 'a');
  f.handled(1);
  f.run();
  assert.equal(f.rows()[0].assigned_agent_id, 'a');
  assert.ok(f.rows()[0].expires_at);
});

test('legacy duplicate assignments are held and timers cleared', () => {
  const f = fixture(['one', 'two'].map(id => lead(id, { assigned_agent_id: 'a', queue_state: 'active', expires_at: 'old' })), [{ id: 'a' }]);
  f.run();
  assert.equal(f.rows()[1].queue_state, 'queued');
  assert.equal(f.rows()[1].expires_at, '');
});

test('no active agents holds all incoming leads', () => {
  const f = fixture([lead('one')], []);
  f.run();
  assert.equal(f.rows()[0].queue_state, 'queued');
});

test('agents only receive leads from their eligible project', () => {
  const f = fixture([
    lead('armani', { project: 'Armani Putrajaya' }),
    lead('bbsap', { project: 'BBSAP Sitiawan' }),
  ], [
    { id: 'a', eligible_project_ids: ['project-armani'] },
    { id: 'b', eligible_project_ids: ['project-bbsap'] },
  ]);
  f.run();
  assert.equal(f.rows()[0].assigned_agent_id, 'a');
  assert.equal(f.rows()[1].assigned_agent_id, 'b');
});

test('lead stays queued when no eligible agent exists for its project', () => {
  const f = fixture([lead('bbsap', { project: 'BBSAP Sitiawan' })], [
    { id: 'a', eligible_project_ids: ['project-armani'] },
  ]);
  f.run();
  assert.equal(f.rows()[0].queue_state, 'queued');
  assert.equal(f.rows()[0].assigned_agent_id, '');
});

test('fresh queued leads are assigned before missed retry leads', () => {
  const f = fixture([
    lead('retry', { queue_state: 'queued', queued_at: '2026-09-08 10:00:00', pass_count: '1', retry_after_cycle: '99' }),
    lead('fresh', { queue_state: 'queued' }),
  ], [{ id: 'a', eligible_project_ids: ['project-armani'] }]);
  f.run();
  assert.equal(f.rows()[1].assigned_agent_id, 'a');
  assert.equal(f.rows()[0].queue_state, 'queued');
});

test('missed retry lead prefers an online agent who has not tried it', () => {
  const f = fixture([
    lead('retry', {
      queue_state: 'queued',
      queued_at: '2026-09-08 10:00:00',
      pass_count: '1',
      retry_after_cycle: '8',
      assignment_history: JSON.stringify([{ agentId: 'a', outcome: 'missed', retryCycle: 7 }]),
    }),
  ], [{ id: 'a', eligible_project_ids: ['project-armani'] }, { id: 'b', eligible_project_ids: ['project-armani'] }]);
  f.properties.set('leadlaju_queue_cycle', '7');
  f.run();
  assert.equal(f.rows()[0].assigned_agent_id, 'b');
});

test('competing browser assignment cannot occupy a busy slot', () => {
  const f = fixture([lead('one'), lead('two')], [{ id: 'a' }]);
  f.assign({ id: 'one', assigned_agent_id: 'a', queue_state: 'active', assignment_revision: 0 });
  f.assign({ id: 'two', assigned_agent_id: 'a', queue_state: 'active', assignment_revision: 0 });
  assert.equal(f.rows()[0].assigned_agent_id, 'a');
  assert.equal(f.rows()[1].queue_state, 'queued');
  assert.equal(f.rows()[1].assigned_agent_id, '');
});

test('a stale phone cannot overwrite a newer assignment revision', () => {
  const f = fixture([lead('one', { assigned_agent_id: 'a', queue_state: 'active', assignment_revision: '4' })], [{ id: 'a' }]);
  const result = f.assign({ id: 'one', assigned_agent_id: 'a', queue_state: 'queued', assignment_revision: 3 });
  assert.equal(result.stale, true);
  assert.equal(f.rows()[0].queue_state, 'active');
  assert.equal(f.rows()[0].assignment_revision, '4');
});

test('ordinary status changes do not advance the assignment revision', () => {
  const source = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
  const start = source.indexOf('function updateLeadStatusLocked_(');
  const body = source.slice(start, source.indexOf('\nfunction ', start + 1));
  assert.doesNotMatch(body, /assignmentRevision[^\n]*currentRevision \+ 1/);
});

test('status updates are not blocked by queue push delivery', () => {
  const source = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
  const start = source.indexOf('function updateLeadStatus_(');
  const body = source.slice(start, source.indexOf('\nfunction ', start + 1));
  assert.match(body, /return updateLeadStatusLocked_\(input\)/);
  assert.doesNotMatch(body, /LockService/);
  assert.doesNotMatch(body, /rebalanceLeadQueue_/);
});

test('new status updates return the new status revision before queue handling', () => {
  const source = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
  const start = source.indexOf('function updateLeadStatusLocked_(');
  const body = source.slice(start, source.indexOf('\nfunction ', start + 1));
  assert.ok(body.indexOf('latestStatusRevision = statusRevision') < body.indexOf('if (normalizeLeadStage_(status) === "new")'));
  assert.match(body, /status_revision: latestStatusRevision/);
});

test('sheet queue-state validation accepts every final lead status', () => {
  const source = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
  const states = [
    'active', 'queued', 'contacted', 'passed', 'all_offer_presented',
    'need_follow_up', 'potential', 'rejected', 'cancelled', 'client',
  ];
  states.forEach((state) => assert.match(source, new RegExp(`"${state}"`)));
  assert.match(source, /function syncLeadQueueStateValidation_\(sheet, headers\)/);
  assert.match(source, /requireValueInList\(LEAD_QUEUE_STATE_VALUES, true\)/);
  assert.match(source, /LEAD_VALIDATION_VERSION = "lead-status-queue-v2"/);
  assert.match(source, /function ensureLeadValidations_\(sheet, headers\)/);
});

test('server persists and returns lead notes through the sheet', () => {
  const source = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
  assert.match(source, /notes: \["nota", "notes", "catatan"\]/);
  assert.match(source, /payload\.action === "update_lead_notes"/);
  assert.match(source, /function updateLeadNotes_\(input\)/);
  assert.match(source, /notes: getCell_\(headers, row, "notes"\)/);
});

test('server counts every assigned non-new lead for each agent', () => {
  const source = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
  const start = source.indexOf('function countHandledLeadsByAgent_(');
  const body = source.slice(start, source.indexOf('\nfunction ', start + 1));
  assert.match(body, /lead\.assigned_agent_id/);
  assert.match(body, /normalizeLeadStage_\(lead\.status\) === "new"/);
  assert.match(body, /counts\.set\(agentId, \(counts\.get\(agentId\) \|\| 0\) \+ 1\)/);
  assert.match(source, /syncAgentHandledCounts_\(leads, agentsSheet, agentHeaders\)/);

  const context = vm.createContext({});
  vm.runInContext(source, context);
  const counts = context.countHandledLeadsByAgent_([
    { assigned_agent_id: 'a', status: 'New' },
    { assigned_agent_id: 'a', status: 'Contacted' },
    { assigned_agent_id: 'a', status: 'Rejected' },
    { assigned_agent_id: 'b', status: 'Client' },
    { assigned_agent_id: '', status: 'Passed' },
  ]);
  assert.equal(counts.get('a'), 2);
  assert.equal(counts.get('b'), 1);
  assert.equal(counts.has(''), false);
});

test('dashboard GET is read-only while maintenance runs through the trigger refresh', () => {
  const source = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
  const start = source.indexOf('function doGet()');
  const body = source.slice(start, source.indexOf('\nfunction ', start + 1));
  assert.match(body, /readExistingHeaders_\(sheet\)/);
  assert.doesNotMatch(body, /ensureLeadIds_|ensureLeadTimestamps_|notifyUnsentLeadPushes_|syncAgentHandledCounts_/);
  assert.match(source, /function refreshSheetTemplate_\(\)/);
  assert.match(source, /syncAgentHandledCounts_\(leads, agentsSheet, agentHeaders\)/);
});

test('server rejects protected agent statuses when the shared note is empty', () => {
  const source = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
  const start = source.indexOf('function updateLeadStatusLocked_(');
  const body = source.slice(start, source.indexOf('\nfunction ', start + 1));
  assert.match(body, /\["passed", "rejected", "cancelled"\]\.includes\(stage\)/);
  assert.match(body, /actingRole === "agent" \|\| Boolean\(actingAgentId\)/);
  assert.match(body, /!getCell_\(headers, row, "notes"\)\.trim\(\)/);
  assert.match(body, /note_required: true/);
});

test('contacted status records an acting agent when assignment fields are empty', () => {
  const source = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
  const start = source.indexOf('function updateLeadStatusLocked_(');
  const body = source.slice(start, source.indexOf('\nfunction ', start + 1));
  assert.match(body, /actingAgentId/);
  assert.match(body, /setRowValue_\(headers, nextRow, "assignedAgentId", actingAgentId\)/);
  assert.match(body, /actingAgentId !== currentAgentId/);
});

test('server reconciles obsolete lead agent IDs by email or name', () => {
  const source = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
  assert.match(source, /function reconcileLeadAgentReferences_\(sheet, headers, agents\)/);
  assert.match(source, /agentsByEmail\.get\(assignedEmail\) \|\| agentsByName\.get\(assignedName\)/);
  assert.match(source, /setRowValue_\(headers, nextRow, "assignedAgentId", matchedAgent\.id\)/);
  assert.match(source, /entry\.agentId = matchedAgent\.id/);
});

test('server only treats agents who selected GET LEAD as online for distribution', () => {
  const source = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
  assert.match(source, /leadReady: \["lead ready", "lead_ready"/);
  assert.match(source, /\{ field: "leadReady", label: "Lead Ready" \}/);
  assert.match(source, /payload\.action === "set_agent_lead_availability"/);
  assert.match(source, /function setAgentLeadAvailability_\(input\)/);
  assert.match(source, /setRowValueBySpec_\(headers, row, AGENT_FIELD_ALIASES, "leadReady", ready \? "yes" : "no"\)/);
  assert.match(source, /"leadReady"\) === "yes" &&\s*\n?\s*getCellBySpec_\(headers, row, AGENT_FIELD_ALIASES, "notificationEnabled"\) === "yes"/);
});
