const test=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const {stripTypeScriptTypes}=require('node:module');
const source=fs.readFileSync('supabase/functions/master-manage-account/index.ts','utf8');
const code=stripTypeScriptTypes(source.replace(/^import .*;\n/gm,''),{mode:'strip'});
async function run(options={}){
 let handler;const passwords=[],audits=[],completed=[],brands=[];const target={id:'admin',role:'admin',brand_id:'brand',email:'test@example.invalid',...options.target};
 const db={auth:{admin:{updateUserById:async(id,data)=>{passwords.push({id,...data});return {error:options.authError?{message:'provider failure'}:null}}}},from(table){
  const filters=[];let operation='read',row;const q={select(){return q},eq(k,v){filters.push([k,v]);return q},insert(v){operation='insert';row=v;audits.push(v);return q},update(v){operation='update';row=v;completed.push(v);return q},
   async maybeSingle(){return {data:filters.every(([k,v])=>target[k]===v)?target:null}},async single(){return options.auditError?{error:{message:'audit unavailable'}}:{data:{id:1}}},then(resolve,reject){return Promise.resolve({error:operation==='update'&&options.completionError?{message:'audit completion failed'}:null}).then(resolve,reject)}};return q;
 }};
 vm.runInNewContext(code,{Request,Response,console:{warn(){}},Deno:{serve(fn){handler=fn}},requestActor:async()=>{if(options.unauthenticated)throw Error('Authentication required');return {id:'master',role:options.role||'master'}},actorBrand:async(req,actor,id)=>{brands.push(id);if(options.inactiveBrand)throw Error('Brand tidak aktif.');return {id}},serviceClient:()=>db});
 const response=await handler(new Request('https://test.invalid/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'update_admin_password',userId:'admin',brand_id:'brand',password:'New-Fixture-Password',...options.body})}));
 return {status:response.status,data:await response.json(),passwords,audits,completed,brands};
}
for(const role of ['agent','admin'])test(`${role} cannot change Admin password`,async()=>{const r=await run({role});assert.equal(r.status,403);assert.equal(r.passwords.length,0)});
test('unauthenticated request denied',async()=>{const r=await run({unauthenticated:true});assert.equal(r.status,403);assert.equal(r.passwords.length,0)});
for(const role of ['master','agent'])test(`target ${role} cannot be changed`,async()=>{const r=await run({target:{role}});assert.equal(r.status,403);assert.equal(r.passwords.length,0)});
test('brand mismatch rejected before Auth',async()=>{const r=await run({body:{brand_id:'other'}});assert.equal(r.status,403);assert.equal(r.passwords.length,0)});
test('inactive brand rejected',async()=>{const r=await run({inactiveBrand:true});assert.equal(r.status,403);assert.equal(r.passwords.length,0)});
test('short password rejected',async()=>{const r=await run({body:{password:'short'}});assert.equal(r.status,400);assert.equal(r.passwords.length,0)});
test('Master updates correct Admin and audit never contains password',async()=>{const r=await run({body:{password:'  Fixture-Password  '}});assert.equal(r.status,200);assert.equal(r.data.password_updated,true);assert.deepEqual(r.passwords,[{id:'admin',password:'  Fixture-Password  '}]);assert.deepEqual(r.brands,['brand']);assert.equal(r.audits[0].brand_id,'brand');assert(!JSON.stringify(r.audits).includes('Fixture-Password'));assert.equal(r.completed[0].details.result,'accepted')});
test('audit outage prevents password change',async()=>{const r=await run({auditError:true});assert.equal(r.status,403);assert.equal(r.passwords.length,0)});
test('Auth failure never reports success',async()=>{const r=await run({authError:true});assert.equal(r.status,400);assert.equal(r.data.ok,false);assert.equal(r.completed[0].details.result,'failed')});
test('completed Auth update stays successful if audit completion fails',async()=>{const r=await run({completionError:true});assert.equal(r.status,200);assert.equal(r.data.password_updated,true);assert.equal(r.audits.length,1)});
