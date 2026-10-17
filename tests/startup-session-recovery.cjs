const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('app.js', 'utf8');
test('loading cover retry receives pointer taps',()=>{
 const css=fs.readFileSync('styles.css','utf8');
 assert.match(css,/\.lifecycle-sync-overlay\.visible #retry-dashboard-startup\s*\{\s*pointer-events: auto;/);
});
function context(auth) {
  const c=vm.createContext({window:{setTimeout,clearTimeout},REMOTE_REQUEST_TIMEOUT_MS:20,remoteDatabaseClient:{auth}});
  vm.runInContext(source.slice(source.indexOf('function isInvalidAuthSessionError('),source.indexOf('let startupRecoveryPending')),c);
  return c;
}
test('valid same-user session needs no refresh',async()=>{
 const c=context({getUser:async()=>({data:{user:{id:'a'}}})});
 assert.equal(await c.validateStartupSession('a'),'valid');
 assert.equal(await c.validateStartupSession('b'),'invalid');
});
test('expired access token refreshes once and verifies user',async()=>{
 let reads=0,refreshes=0;
 const c=context({getUser:async()=>++reads===1?{error:{status:401}}:{data:{user:{id:'a'}}},refreshSession:async()=>{refreshes++;return {data:{session:{user:{id:'a'}}}};}});
 assert.equal(await c.validateStartupSession('a'),'valid');assert.equal(refreshes,1);assert.equal(reads,2);
});
test('revoked refresh session returns invalid, not an endless retry',async()=>{
 const c=context({getUser:async()=>({error:{status:401}}),refreshSession:async()=>({error:{code:'refresh_token_not_found',status:400}})});
 assert.equal(await c.validateStartupSession('a'),'invalid');
});
test('network failure never classifies session as invalid',async()=>{
 const c=context({getUser:async()=>{throw new Error('Failed to fetch');}});
 assert.equal(await c.validateStartupSession('a'),'unavailable');
});
test('refresh outage preserves session',async()=>{
 const c=context({getUser:async()=>({error:{status:401}}),refreshSession:async()=>({error:{status:503}})});
 assert.equal(await c.validateStartupSession('a'),'unavailable');
});
test('stalled session check is bounded',async()=>{
 const c=context({getUser:()=>new Promise(()=>{})});
 assert.equal(await c.validateStartupSession('a'),'unavailable');
});
