const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

const source = fs.readFileSync('supabase/functions/process-notification-outbox/index.ts', 'utf8');
const executable = stripTypeScriptTypes(source.replace(/^import .*;\n/gm, ''), { mode: 'strip' });

async function runWorker({ mode = 'team_sales', allowed = true, leadExists = true, queryError = false } = {}) {
  const filters = [], selections = [], delivered = [], finished = [];
  let handler;
  const admin = {
    async rpc(name, args) {
      if (name === 'claim_notification_outbox') return { data: [{
        outbox_id: 1, user_id: 'owner', notification_type: mode === 'team_sales' ? 'sales_new_lead' : 'new_lead',
        payload: { brandId: 'brand', lead_id: 'lead', assignment_revision: 2 },
        endpoint: 'https://fixture.invalid/push', p256dh: 'fixture', auth_secret: 'fixture', subscription_id: 'subscription',
      }] };
      if (name === 'finish_notification_outbox') finished.push(args);
      return { data: null };
    },
    from(table) {
      const query = {
        select(value) { selections.push({ table, value }); return query; },
        eq(key, value) { filters.push({ table, key, value }); return query; },
        gt(key, value) { filters.push({ table, key, value, operator: 'gt' }); return query; },
        update() { return query; },
        async maybeSingle() {
          if (table !== 'leads') return { data: allowed ? { id: 'fixture' } : null };
          if (queryError) return { error: { message: 'Simulated query failure' } };
          // Reproduce the production ambiguity if the explicit FK hint regresses.
          if (!selections.find(item => item.table === 'leads')?.value.includes('projects!leads_project_id_fkey_brand(name)')) {
            return { error: { message: 'Could not embed because more than one relationship was found' } };
          }
          return { data: leadExists ? {
            id: 'lead', brand_id: 'brand', name: 'Fixture Lead', assigned_agent_id: 'owner', assignment_revision: 2,
            status: 'new', queue_state: mode === 'team_sales' ? 'sales_assigned' : 'active', projects: { name: 'Fixture Product' },
          } : null };
        },
      };
      return query;
    },
  };
  const context = vm.createContext({
    Request, Response, Date, Map,
    createClient: () => admin,
    webpush: { setVapidDetails() {}, async sendNotification(subscription, payload, options) { delivered.push({ subscription, payload: JSON.parse(payload), options }); } },
    Deno: { env: { get: () => 'fixture' }, serve(fn) { handler = fn; } },
  });
  vm.runInContext(executable, context);
  const response = await handler(new Request('https://fixture.invalid/worker', { method: 'POST', headers: { 'X-LeadLaju-Worker': 'fixture' } }));
  return { filters, selections, delivered, finished, result: await response.json() };
}

for (const mode of ['team_sales', 'agent']) test(`new lead push uses explicit brand-safe product relation for ${mode}`, async () => {
  const r = await runWorker({ mode });
  assert.equal(r.result.sent, 1); assert.equal(r.result.failed, 0); assert.equal(r.delivered.length, 1);
  assert.equal(r.delivered[0].payload.title, 'Lead baru: Fixture Product');
  assert.equal(r.delivered[0].payload.leadSnapshot.project, 'Fixture Product');
  for (const [key, value] of [['brand_id', 'brand'], ['assigned_agent_id', 'owner'], ['assignment_revision', 2], ['status', 'new'], ['queue_state', mode === 'team_sales' ? 'sales_assigned' : 'active']]) {
    assert.ok(r.filters.some(item => item.table === 'leads' && item.key === key && item.value === value));
  }
  assert.equal(r.filters.some(item => item.table === 'leads' && item.key === 'expires_at'), mode === 'agent');
  assert.equal(r.delivered[0].options.TTL, mode === 'team_sales' ? 86400 : 300);
  assert.equal(r.finished[0].p_success, true);
});

test('inactive or wrong-brand recipient never receives a lead push', async () => {
  const r = await runWorker({ allowed: false });
  assert.equal(r.delivered.length, 0); assert.equal(r.selections.some(item => item.table === 'leads'), false);
});
test('removed, contacted or superseded assignment is skipped without push', async () => {
  const r = await runWorker({ leadExists: false });
  assert.equal(r.delivered.length, 0); assert.equal(r.finished[0].p_success, true);
});
test('failed lead query remains retryable instead of claiming delivery', async () => {
  const r = await runWorker({ queryError: true });
  assert.equal(r.delivered.length, 0); assert.equal(r.result.failed, 1); assert.equal(r.finished[0].p_success, false);
  assert.equal(r.finished[0].p_error, 'Simulated query failure');
});
