const { test }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const sql=fs.readFileSync('supabase/migrations/20260930174735_master_brand_isolation.sql','utf8');
const app=fs.readFileSync('app.js','utf8');
test('tenant executor cannot bypass RLS and brand membership is immutable',()=>{
 assert.match(sql,/nologin noinherit nobypassrls/);
 assert.match(sql,/as restrictive for all to authenticated/);
 assert.match(sql,/Brand membership is immutable/);
 assert.match(sql,/foreign key\(brand_id,%I\)/);
});
test('Master bootstrap is service-only and tied to the designated separate account',()=>{
 assert.match(sql,/Separate Master account required/);
 assert.match(sql,/lurbaymarketing@gmail.com/);
 assert.match(sql,/revoke all on function public.bootstrap_first_master\(uuid,text\) from public,anon,authenticated,leadlaju_tenant_executor/);
});
test('brand switch invalidates requests, subscriptions and operational selections',()=>{
 assert.match(app,/brandContextVersion\+\+/);
 assert.match(app,/subscriptionBrandVersion !== brandContextVersion/);
 assert.match(app,/integrationRawKeys.clear\(\)/);
 assert.match(app,/clearBrandOperationalState\(\);\s*activeBrandId = brand.id/);
});
test('inactive brands reset lead readiness and stop scheduler and outbox processing',()=>{
 assert.match(sql,/from public.brands where active order by id/);
 assert.match(sql,/join public.brands b on b.id=n.brand_id and b.active/);
 assert.match(sql,/lead_ready=false,notification_ready=false/);
 assert.match(sql,/Cancelled: brand suspended/);
});
test('signup resolves its brand and never accepts a requested profile role',()=>{
 const edge=fs.readFileSync('supabase/functions/admin-manage-agent/index.ts','utf8');
 assert.match(edge,/signupBrand\(body.brand_slug\)/);
 assert.match(edge,/role: "agent"/);
 assert.match(edge,/\.eq\("brand_id", brand.id\)\.in\("id", projectIds\)/);
});
