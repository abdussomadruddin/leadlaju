const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const app = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260926090000_lead_follow_up_count.sql', 'utf8');

test('lead badge counts only actionable statuses and closed outcomes sort last', () => {
  const start = app.indexOf('function countsTowardLeadBadge(');
  const end = app.indexOf('\nfunction renderActiveLead()', start);
  const context = vm.createContext({ getLeadVisualStatus: lead => lead.status });
  vm.runInContext(app.slice(start, end), context);
  const statuses = ['new', 'queued', 'contacted', 'all_offer_presented', 'need_follow_up', 'potential', 'client', 'passed', 'rejected', 'cancelled'];
  assert.deepEqual(statuses.filter(status => context.countsTowardLeadBadge({ status })), ['contacted', 'all_offer_presented', 'need_follow_up', 'potential']);
  const leads = [{ status: 'rejected', receivedAt: 900 }, { status: 'contacted', receivedAt: 100 }, { status: 'cancelled', receivedAt: 800 }, { status: 'potential', receivedAt: 200 }, { status: 'passed', receivedAt: 700 }];
  assert.deepEqual(leads.sort(context.compareLeadLogOrder).map(lead => lead.status), ['potential', 'contacted', 'rejected', 'cancelled', 'passed']);
});

test('compact lead log keeps Call, Follow Up, status and expandable details without separate WhatsApp', () => {
  assert.match(html, /<th>Nama<\/th>[\s\S]*<th>Projek<\/th>[\s\S]*<th>Status<\/th>[\s\S]*<th>Call<\/th>[\s\S]*<th>Follow Up<\/th>[\s\S]*<th>Copy<\/th>[\s\S]*<th>Butiran<\/th>/);
  assert.doesNotMatch(html, /<th>WhatsApp<\/th>/);
  assert.match(app, /data-lead-follow-up/);
  assert.match(app, /lead-follow-up-icon/);
  assert.match(app, /follow-up-stage-\$\{followUpCount\}/);
  assert.doesNotMatch(app, /<td data-label="WhatsApp">/);
  assert.match(app, /data-lead-expand/);
  assert.match(app, /class="lead-log-detail"[\s\S]*\$\{expanded \? "" : "hidden"\}/);
});

test('copy button uses the requested inquiry text and stays locked before CALL NOW', () => {
  const source = app.match(/function leadDetailsCopyText\(lead\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(source);
  const format = vm.runInNewContext(`(${source})`);
  assert.equal(format({ name: 'Aina', phone: '60123456789', email: 'aina@example.com', project: 'Armani' }),
    '*Inquiry For House*\n\nNama: Aina\nNo Phone: 60123456789\nEmail: aina@example.com\nProjek: Armani');
  assert.match(app, /const available = lead && canAccessLead\(lead\) && canViewLeadPhone\(lead\)/);
  assert.match(app, /navigator\.clipboard\.writeText\(leadDetailsCopyText\(lead\)\)/);
  assert.match(app, /data-lead-copy/);
});

test('follow-up has its own filter with all six counts including zero', () => {
  assert.match(html, /id="lead-follow-up-filter"/);
  assert.match(app, /\[1, 2, 3, 4, 5, 6\]/);
  assert.match(app, /followUpCounts\.get\(count\) \|\| 0/);
  assert.match(app, /followUpFilter === "follow_up"/);
  assert.match(app, /followUpFilter\.startsWith\("follow_up_"\)/);
  assert.match(app, /\(filter === "all" \|\| visualStatus === filter\) &&/);
  assert.match(app, /leadFollowUpFilter\.addEventListener\("change", resetLeadLogPage\)/);
});

test('Log Lead filters avoid rebuilding unchanged dropdowns and render a bounded page', () => {
  assert.match(html, /id="lead-log-more-wrap"/);
  assert.match(app, /const LEAD_LOG_PAGE_SIZE = 30/);
  assert.match(app, /const shownRows = rows\.slice\(0, leadLogVisibleLimit\)/);
  assert.match(app, /leadLogVisibleLimit \+= LEAD_LOG_PAGE_SIZE/);
  assert.match(app, /leadFilter\.addEventListener\("change", resetLeadLogPage\)/);
  assert.match(app, /if \(select\.innerHTML !== markup\) select\.innerHTML = markup/);
  const source = app.match(/function updateSelectOptions\(select, markup, selectedValue\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(source);
  const update = vm.runInNewContext(`(${source})`);
  let writes = 0;
  const select = { options: [{ value: 'all' }, { value: 'contacted' }], value: 'all', get innerHTML() { return '<option value="all">All</option>'; }, set innerHTML(_) { writes += 1; } };
  update(select, '<option value="all">All</option>', 'contacted');
  assert.equal(writes, 0);
  assert.equal(select.value, 'contacted');
});

test('server increments atomically and sets All Offer Presented exactly on third follow-up', () => {
  assert.match(migration, /where id = p_lead_id for update/);
  assert.match(migration, /v_lead\.follow_up_count <> p_expected_count/);
  assert.match(migration, /v_next_count = 3 then 'all_offer_presented'/);
  assert.match(migration, /v_lead\.follow_up_count >= 6/);
  assert.match(migration, /follow_up_recorded/);
  assert.match(migration, /revoke all on function public\.record_lead_follow_up\(uuid, integer\) from public, anon/);
});
