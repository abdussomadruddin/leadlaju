const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const app = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260926090000_lead_follow_up_count.sql', 'utf8');

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

test('follow-up filter only shows nonempty counts through six', () => {
  assert.match(app, /\.filter\(\(count\) => followUpCounts\.has\(count\)\)/);
  assert.match(app, /\[1, 2, 3, 4, 5, 6\]/);
  assert.match(app, /filter === "follow_up"/);
  assert.match(app, /filter\.startsWith\("follow_up_"\)/);
});

test('server increments atomically and sets All Offer Presented exactly on third follow-up', () => {
  assert.match(migration, /where id = p_lead_id for update/);
  assert.match(migration, /v_lead\.follow_up_count <> p_expected_count/);
  assert.match(migration, /v_next_count = 3 then 'all_offer_presented'/);
  assert.match(migration, /v_lead\.follow_up_count >= 6/);
  assert.match(migration, /follow_up_recorded/);
  assert.match(migration, /revoke all on function public\.record_lead_follow_up\(uuid, integer\) from public, anon/);
});
