const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const ingest = fs.readFileSync(path.join(root, 'supabase/functions/ingest-lead/index.ts'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'supabase/functions/admin-manage-integration/index.ts'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260919150035_pabbly_provider_integrations.sql'), 'utf8');

test('Pabbly ingestion accepts one provider key and derives stable server idempotency', () => {
  assert.match(ingest, /request\.headers\.get\("X-LeadLaju-Key"\)/);
  assert.doesNotMatch(ingest, /X-Ingestion-Key|google_sheet/);
  assert.match(ingest, /sourceSystem !== keyRecord\.provider/);
  assert.match(ingest, /const ingestionKey = `\$\{canonical\.source_system\}:\$\{canonical\.source_lead_id\}`/);
  assert.match(ingest, /source_lead_id, name, phone and project are required/);
  assert.match(ingest, /created_at must be a valid date/);
});

test('provider keys are hashed, provider-scoped, atomically rotated and revocable', () => {
  assert.match(migration, /ingestion_api_keys_one_active_provider/);
  assert.match(migration, /provider in \('meta_ads', 'tiktok_ads'\)/);
  assert.match(migration, /function public\.rotate_ingestion_api_key/);
  assert.match(migration, /update public\.ingestion_api_keys[\s\S]*active = false[\s\S]*insert into public\.ingestion_api_keys/);
  assert.match(migration, /function public\.revoke_ingestion_api_key/);
  assert.match(migration, /grant execute on function public\.rotate_ingestion_api_key[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /raw_key|api_key text/);
});

test('integration administration requires an approved active admin and returns a raw key once', () => {
  assert.match(admin, /admin\.auth\.getUser\(token\)/);
  assert.match(admin, /actor\.role !== "admin" \|\| !actor\.active \|\| actor\.approval_status !== "approved"/);
  assert.match(admin, /createRawKey\(provider\)/);
  assert.match(admin, /await sha256\(rawKey\)/);
  assert.match(admin, /apiKey: rawKey/);
  assert.doesNotMatch(admin, /localStorage|sessionStorage/);
});

test('admin Integration tab exposes exact Pabbly configuration without persisting secrets', () => {
  assert.match(html, /data-view="integrations"/);
  assert.match(html, /id="integrations-view"/);
  assert.match(html, /X-LeadLaju-Key/);
  assert.match(html, /Execute API Request/);
  assert.match(app, /admin-manage-integration/);
  assert.match(app, /integrationRawKeys = new Map\(\)/);
  assert.match(app, /integrationRawKeys\.delete\(provider\)/);
  assert.match(app, /60000/);
  assert.doesNotMatch(app, /localStorage\.setItem\([^\n]*integrationRawKeys/);
});

test('ingestion result metadata records inserted duplicate and failed delivery status', () => {
  assert.match(migration, /last_result in \('inserted', 'duplicate', 'failed'\)/);
  assert.match(ingest, /markAttempt\("failed"/);
  assert.match(ingest, /data\?\.result === "duplicate" \? "duplicate" : "inserted"/);
  assert.match(admin, /last_used_at,last_result,last_error,last_result_at/);
});
