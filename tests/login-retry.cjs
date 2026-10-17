const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
test('only temporary failures qualify for dashboard retry',()=>{
 const context={};vm.runInNewContext(source.slice(source.indexOf('function isTransientRemoteLoadError'),source.indexOf('async function loadRemoteState')),context);
 for(const e of [{code:'57014'},{status:503},{name:'AbortError'},{message:'Failed to fetch'}])assert.equal(context.isTransientRemoteLoadError(e),true);
 for(const e of [{code:'42501',message:'Brand access denied'},{message:'Account is not active'},{message:'Profil pengguna belum tersedia.'}])assert.equal(context.isTransientRemoteLoadError(e),false);
});
test('retry is bounded, brand-aware, and transient login failure preserves session',()=>{
 assert.match(source,/isTransientRemoteLoadError\(error\) && attempt < 2/);
 assert.match(source,/return performLoadRemoteState\(userId, attempt \+ 1\)/);
 assert.match(source,/if \(isInvalidAuthSessionError\(lastRemoteLoadError\)\) await remoteDatabaseClient.auth.signOut\(\{ scope: 'local' \}\)/);
 assert.match(source,/if \(brandResult.error\) throw brandResult.error/);
 assert.match(source,/window.clearTimeout\(timeout\)/);
});
test('dashboard failures preserve login; only invalid authentication signs out locally',async()=>{
 const start=source.indexOf('async function performLogin('),end=source.indexOf('\nfunction ',start);
 for(const [transient,invalid] of [[true,false],[false,false],[false,true]]){
  let signOuts=0,message='';
  const context={elements:{loginEmail:{value:'test@example.invalid'},loginPassword:{value:'fixture'}},remoteDatabaseClient:{auth:{signInWithPassword:async()=>({data:{user:{id:'fixture'}}}),signOut:async()=>signOuts++}},loadRemoteState:async()=>false,lastRemoteLoadError:{},isTransientRemoteLoadError:()=>transient,setLoginError:text=>message=text};
  context.restoreTrustedDashboardCache=async()=>false;
  context.isInvalidAuthSessionError=()=>invalid;
  vm.runInNewContext(source.slice(start,end),context);
  await context.performLogin({preventDefault(){}});
  assert.equal(signOuts,invalid?1:0);
  assert.match(message,transient?/Sesi anda masih aktif/:/data sistem tidak/);
 }
});
