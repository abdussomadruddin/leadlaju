const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const { webcrypto } = require('node:crypto');

async function request(provider, payload, options = {}) {
  let handler;
  const calls = [];
  const db = {
    from(table) {
      const query = {
        select() { return query; }, eq() { return query; },
        update() { return query; },
        maybeSingle: async () => ({ data: table === 'brands'
          ? (options.inactive ? null : { id: 'brand' })
          : { id: 'key', provider, brand_id: 'brand' } }),
        then(resolve) { return Promise.resolve({ data: [{ id: 'samsung', name: 'Samsung' }] }).then(resolve); },
      };
      return query;
    },
    async rpc(name, args) { calls.push({ name, args }); return { data: { ok: true, result: 'inserted' } }; },
  };
  const context = { Request, Response, TextEncoder, crypto: webcrypto,
    createClient: () => db, serviceClient: () => db,
    Deno: { env: { get: () => 'fixture' }, serve: fn => { handler = fn; } } };
  vm.createContext(context);
  const parser = fs.readFileSync('supabase/functions/_shared/lead-notes.ts', 'utf8');
  const edge = fs.readFileSync('supabase/functions/ingest-lead/index.ts', 'utf8').replace(/^import .*;\n/gm, '');
  vm.runInContext(stripTypeScriptTypes(parser.replace(/export /g, '') + '\n' + edge, { mode: 'transform' }), context);
  const response = await handler(new Request('https://fixture.invalid', { method: 'POST',
    headers: { 'X-LeadLaju-Key': 'fixture', 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }));
  return { status: response.status, body: await response.json(), calls };
}
const notes = 'Nama Contoh\n+60 11-2345 6789\ncontoh@example.com\n1_unit\nsecepat_mungkin\nhari_ini';
for (const provider of ['meta_ads', 'tiktok_ads']) {
  test(`${provider} notes-only Samsung payload auto detects identity without source ID`, async () => {
    const result = await request(provider, { source_system: provider, produk: 'Samsung', notes });
    assert.equal(result.status, 200);
    assert.equal(result.calls.length, 1);
    assert.equal(result.calls[0].name, 'ingest_notes_lead');
    const args = result.calls[0].args;
    assert.equal(args.p_source_system, provider);
    assert.equal(args.p_name, 'Nama Contoh');
    assert.equal(args.p_phone, '601123456789');
    assert.equal(args.p_email, 'contoh@example.com');
    assert.equal(args.p_project_name, 'Samsung');
    assert.equal(args.p_notes, notes);
  });
  test(`${provider} structured legacy payload retains legacy RPC`, async () => {
    const result = await request(provider, { source_system: provider, source_lead_id: 'fixture-id',
      name: 'Nama Contoh', phone: '601123456789', project: 'Samsung', notes });
    assert.equal(result.status, 200);
    assert.equal(result.calls[0].name, 'ingest_lead');
  });
}
test('Provider mismatch, inactive brand and ambiguous notes cannot ingest', async () => {
  for (const result of [
    await request('tiktok_ads', { source_system: 'meta_ads', produk: 'Samsung', notes }),
    await request('meta_ads', { source_system: 'meta_ads', produk: 'Samsung', notes }, { inactive: true }),
    await request('meta_ads', { source_system: 'meta_ads', produk: 'Samsung', notes: notes + '\nNama Kedua' }),
  ]) { assert(result.status >= 400); assert.equal(result.calls.length, 0); }
});
test('Notes SQL keeps tenant boundaries, cross-provider duplicate locking and source attribution', () => {
  const sql = fs.readFileSync('supabase/migrations/20261024033820_meta_notes_ingestion.sql', 'utf8');
  assert(sql.includes("v_provider not in ('tiktok_ads','meta_ads')"));
  assert(sql.includes('v_provider||\':\'||v_occurrence,v_provider,v_occurrence'));
  assert(sql.includes('brand_id=v_brand and project_id=v_project and phone=v_phone'));
  assert(sql.includes("interval '10 minutes'"));
  assert(sql.includes('pg_advisory_xact_lock'));
  assert(sql.includes('from public,anon,authenticated'));
});
