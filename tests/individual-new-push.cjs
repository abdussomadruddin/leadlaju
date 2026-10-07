const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('individual New push opens New section and worker wake has no collection timer',()=>{
 const worker=fs.readFileSync('supabase/functions/process-notification-outbox/index.ts','utf8');
 assert.match(worker,/tag: `leadlaju-new-/);
 assert.match(worker,/url: "\/\?view=follow-up-due&section=new"/);
 assert.match(worker,/reminderType: "new-lead"/);
 const file=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_immediate_individual_new_lead_push.sql'));
 const sql=fs.readFileSync(`supabase/migrations/${file}`,'utf8');
 assert.match(sql,/after insert on public.notification_outbox/);
 assert.match(sql,/perform net.http_post/);
 assert.match(sql,/not in \('new_lead','sales_new_lead'\)/);
 assert.match(sql,/revoke all.*from public,anon,authenticated,service_role/);
 assert.doesNotMatch(sql,/interval '5 seconds'|pg_sleep/);
 const app=fs.readFileSync('app.js','utf8');
 assert.match(app,/if \(realtimeReloadRunning/);
 assert.match(app,/while \(realtimeReloadRequested/);
});
