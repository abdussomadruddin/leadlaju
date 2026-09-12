const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

function fixture(rows, agents = [{ id: 'a', eligible_project_ids: ['project-armani'] }, { id: 'b', eligible_project_ids: ['project-armani'] }], options = {}) {
  const headers = ['id', 'name', 'phone', 'project', 'status', 'notes', 'assigned_agent_id', 'assigned_agent_name', 'queue_state', 'received_at', 'expires_at', 'queued_at', 'pass_count', 'retry_after_cycle', 'assignment_revision', 'assignment_history', 'status_revision', 'status_updated_at'];
  const fields = { assignedAgentId: 'assigned_agent_id', assignedAgentEmail: 'email', assignedAgentName: 'agent_name', receivedAt: 'received_at', expiresAt: 'expires_at', queueState: 'queue_state', queuedAt: 'queued_at', passCount: 'pass_count', retryAfterCycle: 'retry_after_cycle', assignmentRevision: 'assignment_revision', assignmentHistory: 'assignment_history' };
  const values = [headers, ...rows.map(row => headers.map(key => row[key] || ''))];
  const properties = new Map();
  const NativeDate = Date;
  class FixtureDate extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [options.nowMs ?? NativeDate.now()])); }
    static now() { return options.nowMs ?? NativeDate.now(); }
  }
  const sheet = {
    getDataRange: () => ({ getDisplayValues: () => values.map(row => row.slice()) }),
    getLastRow: () => values.length,
    getRange: row => ({ setValues: ([value]) => {
      if (options.failWrites > 0) {
        options.failWrites -= 1;
        throw new Error('temporary sheet write failure');
      }
      values[row - 1] = value;
    } }),
  };
  const context = vm.createContext({
    Date: FixtureDate,
    LockService: { getScriptLock: () => ({ tryLock: () => options.lockAvailable !== false, releaseLock() {} }) },
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
    readPushSubscriptions_: () => agents.map(agent => ({
      endpoint: `https://push.example/${agent.id}`,
      p256dh: 'test-key',
      auth: 'test-auth',
      agentId: agent.id,
      agentEmail: agent.email || '',
    })),
    mapRow_: (headers, row) => {
      const mapped = Object.fromEntries(headers.map((key, i) => [key, row[i]]));
      try { mapped.assignment_history = JSON.parse(mapped.assignment_history || '[]'); } catch { mapped.assignment_history = []; }
      return mapped;
    },
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
    status: input => context.updateLeadStatus_(input),
    expire: input => context.expireLead_(input),
    reconcile: () => context.reconcileResolvedAssignmentOutcomes_(sheet, headers, new Date()),
  };
}

const lead = (id, extra = {}) => ({ id, name: id, phone: '0123456789', project: 'Armani Putrajaya', status: 'new', ...extra });

test('server clears expired cooldown values before assignment', () => {
  const source = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
  assert.match(source, /function clearExpiredAgentCooldowns_\(sheet, headers, now\)/);
  assert.match(source, /clearExpiredAgentCooldowns_\(queueAgentsSheet, queueAgentHeaders\)/);
});

test('minute queue processing expires assignments even when the agent app is closed', () => {
  const source = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
  const start = source.indexOf('function notifyUnsentLeadPushes_(');
  const body = source.slice(start, source.indexOf('\nfunction ', start + 1));
  assert.match(source, /function expireOverdueLeadAssignments_\(sheet, headers, now\)/);
  assert.match(body, /expireOverdueLeadAssignments_\(sheet, headers, new Date\(\)\)/);
  assert.ok(body.indexOf('expireOverdueLeadAssignments_') < body.indexOf('reconcileSingleActiveLead_'));
  assert.match(source, /markLatestAssignmentOutcome_\(headers, row, "missed"/);
  assert.match(source, /holdLeadRuntimeRow_\(sheet, headers, index \+ 1, row/);
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
  const futureExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const f = fixture(['one', 'two'].map(id => lead(id, { assigned_agent_id: 'a', queue_state: 'active', expires_at: futureExpiry })), [{ id: 'a' }]);
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

test('every resolved lead status closes pending assignment history', () => {
  const source = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
  const updateStart = source.indexOf('function updateLeadStatusLocked_(');
  const updateBody = source.slice(updateStart, source.indexOf('\nfunction ', updateStart + 1));
  assert.match(updateBody, /ASSIGNMENT_OUTCOME_BY_STAGE\[stage\]/);
  assert.match(source, /function reconcileResolvedAssignmentOutcomes_\(sheet, headers, now\)/);
  assert.match(source, /history\[pendingIndex\]\.outcome = assignmentOutcome/);
  assert.match(source, /reconcileResolvedAssignmentOutcomes_\(sheet, headers, new Date\(\)\)/);
});

test('agent status updates share the expiry ScriptLock and validate assignment revision', () => {
  const source = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
  const start = source.indexOf('function updateLeadStatus_(');
  const body = source.slice(start, source.indexOf('\nfunction ', start + 1));
  assert.match(body, /return updateLeadStatusLocked_\(input\)/);
  assert.match(body, /LockService\.getScriptLock\(\)/);
  assert.match(body, /lock\.tryLock\(8000\)/);
  assert.match(body, /lock\.releaseLock\(\)/);
  assert.doesNotMatch(body, /rebalanceLeadQueue_/);
  assert.match(source, /requestedAssignmentRevision !== currentAssignmentRevision/);
});

test('agent response winning the boundary race prevents expiry and requeue', () => {
  const history = JSON.stringify([{ agentId: 'a', agentName: 'A', outcome: 'pending' }]);
  const f = fixture([lead('race-response', {
    assigned_agent_id: 'a', queue_state: 'active', assignment_revision: '1',
    expires_at: new Date(Date.now() + 1000).toISOString(), assignment_history: history,
  })], [{ id: 'a' }]);
  const result = f.status({ id: 'race-response', status: 'Contacted', acting_role: 'agent', acting_agent_id: 'a', assignment_revision: 1 });
  assert.equal(result.ok, true);
  f.run();
  const row = f.rows()[0];
  assert.equal(row.status, 'Contacted');
  assert.equal(row.queue_state, 'contacted');
  assert.equal(row.assigned_agent_id, 'a');
  assert.equal(row.assignment_history.at(-1).outcome, 'contacted');
});

test('agent response strictly before expires_at is accepted', () => {
  const nowMs = Date.parse('2026-09-12T04:05:00.000Z');
  const f = fixture([lead('before-expiry', {
    assigned_agent_id: 'a', queue_state: 'active', assignment_revision: '1',
    expires_at: new Date(nowMs + 1).toISOString(),
    assignment_history: JSON.stringify([{ agentId: 'a', outcome: 'pending' }]),
  })], [{ id: 'a' }], { nowMs });
  const result = f.status({ id: 'before-expiry', status: 'Contacted', acting_role: 'agent', acting_agent_id: 'a', assignment_revision: 1 });
  assert.equal(result.ok, true);
  assert.equal(f.rows()[0].status, 'Contacted');
});

test('agent response exactly at expires_at is rejected', () => {
  const nowMs = Date.parse('2026-09-12T04:05:00.000Z');
  const f = fixture([lead('at-expiry', {
    assigned_agent_id: 'a', queue_state: 'active', assignment_revision: '1',
    expires_at: new Date(nowMs).toISOString(),
    assignment_history: JSON.stringify([{ agentId: 'a', outcome: 'pending' }]),
  })], [{ id: 'a' }], { nowMs });
  const result = f.status({ id: 'at-expiry', status: 'Need Follow Up', acting_role: 'agent', acting_agent_id: 'a', assignment_revision: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.stale, true);
  assert.equal(f.rows()[0].status, 'new');
});

test('agent response after expires_at but before sweeper is rejected and remains expiry eligible', () => {
  const nowMs = Date.parse('2026-09-12T04:05:03.000Z');
  const f = fixture([lead('after-expiry', {
    assigned_agent_id: 'a', queue_state: 'active', assignment_revision: '1',
    expires_at: new Date(nowMs - 3000).toISOString(),
    assignment_history: JSON.stringify([{ agentId: 'a', outcome: 'pending' }]),
  })], [], { nowMs });
  const result = f.status({ id: 'after-expiry', status: 'Need Follow Up', acting_role: 'agent', acting_agent_id: 'a', assignment_revision: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.stale, true);
  assert.equal(f.rows()[0].queue_state, 'active');
  f.run();
  assert.equal(f.rows()[0].queue_state, 'queued');
  assert.equal(f.rows()[0].assignment_history.at(-1).outcome, 'missed');
});

test('status lock timeout returns an explicit failure without changing the lead', () => {
  const f = fixture([lead('lock-timeout', {
    assigned_agent_id: 'a', queue_state: 'active', assignment_revision: '1',
    expires_at: new Date(Date.now() + 60000).toISOString(),
    assignment_history: JSON.stringify([{ agentId: 'a', outcome: 'pending' }]),
  })], [{ id: 'a' }], { lockAvailable: false });
  const result = f.status({ id: 'lock-timeout', status: 'Contacted', acting_role: 'agent', acting_agent_id: 'a', assignment_revision: 1 });
  assert.equal(result.ok, false);
  assert.match(result.error, /Cuba sekali lagi/);
  assert.equal(f.rows()[0].status, 'new');
  assert.equal(f.rows()[0].queue_state, 'active');
});

test('expiry winning the boundary race rejects the stale agent response', () => {
  const history = JSON.stringify([{ agentId: 'a', agentName: 'A', outcome: 'pending' }]);
  const f = fixture([lead('race-expiry', {
    assigned_agent_id: 'a', queue_state: 'active', assignment_revision: '1',
    expires_at: new Date(Date.now() - 1000).toISOString(), assignment_history: history,
  })], []);
  f.run();
  const result = f.status({ id: 'race-expiry', status: 'Contacted', acting_role: 'agent', acting_agent_id: 'a', assignment_revision: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.stale, true);
  const row = f.rows()[0];
  assert.equal(row.status, 'new');
  assert.equal(row.queue_state, 'queued');
  assert.equal(row.assigned_agent_id, '');
  assert.equal(row.assignment_history.at(-1).outcome, 'missed');
});

test('stale expiry A cannot touch a newer assignment B', () => {
  const history = JSON.stringify([
    { agentId: 'a', outcome: 'missed' },
    { agentId: 'b', outcome: 'pending' },
  ]);
  const futureExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const f = fixture([lead('new-assignment', {
    assigned_agent_id: 'b', queue_state: 'active', assignment_revision: '3',
    received_at: new Date().toISOString(), expires_at: futureExpiry, assignment_history: history,
  })], [{ id: 'b' }]);
  const result = f.expire({ id: 'new-assignment', assignment_revision: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.stale, true);
  const row = f.rows()[0];
  assert.equal(row.assigned_agent_id, 'b');
  assert.equal(row.queue_state, 'active');
  assert.equal(row.assignment_revision, '3');
  assert.equal(row.expires_at, futureExpiry);
});

test('duplicate frontend and minute expiry leave one queued state', () => {
  const history = JSON.stringify([{ agentId: 'a', outcome: 'pending' }]);
  const f = fixture([lead('duplicate-expiry', {
    assigned_agent_id: 'a', queue_state: 'active', assignment_revision: '1',
    expires_at: new Date(Date.now() - 1000).toISOString(), assignment_history: history,
  })], []);
  assert.equal(f.expire({ id: 'duplicate-expiry', assignment_revision: 1 }).ok, true);
  const duplicate = f.expire({ id: 'duplicate-expiry', assignment_revision: 1 });
  assert.equal(duplicate.ok, false);
  f.run();
  const row = f.rows()[0];
  assert.equal(row.queue_state, 'queued');
  assert.equal(row.assignment_history.filter(entry => entry.outcome === 'missed').length, 1);
});

test('status outcome matrix explicitly closes every valid non-New status', () => {
  const source = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
  const expected = ['contacted', 'passed', 'all_offer_presented', 'need_follow_up', 'potential', 'rejected', 'cancelled', 'client'];
  expected.forEach(stage => assert.match(source, new RegExp(`${stage}: "${stage}"`)));
  assert.doesNotMatch(source.slice(source.indexOf('const ASSIGNMENT_OUTCOME_BY_STAGE'), source.indexOf('};', source.indexOf('const ASSIGNMENT_OUTCOME_BY_STAGE'))), /new:/);
});

test('every valid resolved status persists its explicit assignment outcome', () => {
  const statuses = [
    ['Contacted', 'contacted'],
    ['Passed', 'passed'],
    ['All Offer Presented', 'all_offer_presented'],
    ['Need Follow Up', 'need_follow_up'],
    ['Potential', 'potential'],
    ['Rejected', 'rejected'],
    ['Cancelled', 'cancelled'],
    ['Client', 'client'],
  ];
  statuses.forEach(([status, outcome]) => {
    const f = fixture([lead(`status-${outcome}`, {
      notes: 'verified note', assigned_agent_id: 'a', queue_state: 'active', assignment_revision: '1',
      expires_at: new Date(Date.now() + 60000).toISOString(),
      assignment_history: JSON.stringify([{ agentId: 'a', outcome: 'pending' }]),
    })], [{ id: 'a' }]);
    const result = f.status({
      id: `status-${outcome}`, status, acting_role: 'agent', acting_agent_id: 'a', assignment_revision: 1,
    });
    assert.equal(result.ok, true, status);
    assert.equal(f.rows()[0].queue_state, outcome, status);
    assert.equal(f.rows()[0].assignment_history.at(-1).outcome, outcome, status);
  });
});

test('temporary expiry write failure leaves assignment retryable on the next minute run', () => {
  const options = { failWrites: 1 };
  const f = fixture([lead('retry-expiry', {
    assigned_agent_id: 'a', queue_state: 'active', assignment_revision: '1',
    expires_at: new Date(Date.now() - 1000).toISOString(),
    assignment_history: JSON.stringify([{ agentId: 'a', outcome: 'pending' }]),
  })], [], options);
  assert.throws(() => f.run(), /temporary sheet write failure/);
  assert.equal(f.rows()[0].queue_state, 'active');
  assert.equal(f.rows()[0].assignment_history.at(-1).outcome, 'pending');
  f.run();
  assert.equal(f.rows()[0].queue_state, 'queued');
  assert.equal(f.rows()[0].assignment_history.at(-1).outcome, 'missed');
});

test('reconciliation only repairs the latest matching pending history entry', () => {
  const history = JSON.stringify([
    { agentId: 'a', outcome: 'pending' },
    { agentId: 'b', outcome: 'contacted' },
  ]);
  const f = fixture([lead('history-safe', {
    status: 'Need Follow Up', assigned_agent_id: 'b', queue_state: 'need_follow_up', assignment_history: history,
  })]);
  assert.equal(f.reconcile().repaired, 0);
  assert.deepEqual(f.rows()[0].assignment_history.map(entry => entry.outcome), ['pending', 'contacted']);
});

test('reconciliation ignores active New and already closed assignments', () => {
  const f = fixture([
    lead('active-new', { assigned_agent_id: 'a', queue_state: 'active', assignment_history: JSON.stringify([{ agentId: 'a', outcome: 'pending' }]) }),
    lead('closed', { status: 'Cancelled', assigned_agent_id: 'a', queue_state: 'cancelled', assignment_history: JSON.stringify([{ agentId: 'a', outcome: 'cancelled' }]) }),
  ]);
  assert.equal(f.reconcile().repaired, 0);
  assert.equal(f.rows()[0].assignment_history[0].outcome, 'pending');
  assert.equal(f.rows()[1].assignment_history[0].outcome, 'cancelled');
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
  const start = source.indexOf('function doGet(event)');
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
