const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
function setup(auth){
 const calls={login:0,retries:0,messages:[]};
 const c=vm.createContext({window:{setTimeout:(fn,ms)=>setTimeout(fn,ms===1000?5:ms),clearTimeout,leadLajuStartupWaiting:msg=>{calls.messages.push(msg);return true;}},REMOTE_REQUEST_TIMEOUT_MS:20,remoteDatabaseClient:{auth},bootstrap:()=>calls.retries++,showLogin:()=>calls.login++,setLoginError:msg=>calls.messages.push(msg)});
 vm.runInContext(source.slice(source.indexOf('function isTransientRemoteLoadError('),source.indexOf('let startupRecoveryPending')),c);
 return {c,calls};
}
test('getSession hang is bounded and simultaneous retries share the SDK read',async()=>{
 let calls=0,release;const s=setup({getSession:()=>{calls++;return new Promise(r=>{release=r;});}});
 const a=s.c.readStartupSession(),b=s.c.readStartupSession();
 await Promise.all([assert.rejects(a,/timed out/),assert.rejects(b,/timed out/)]);assert.equal(calls,1);
 release({data:{session:null}});await new Promise(r=>setImmediate(r));
});
test('SDK returned transient auth error is not treated as an absent session',async()=>{
 const error={name:'AuthRetryableFetchError',status:503,message:'temporary'};const s=setup({getSession:async()=>({data:{session:null},error})});
 await assert.rejects(s.c.readStartupSession(),e=>e===error);assert.equal(s.c.isTransientRemoteLoadError(error),true);
});
test('recovery retains session and performs only one automatic retry while offline',async()=>{
 let signs=0;const s=setup({signOut:()=>signs++});s.c.recoverStartupAuth(Error('network'));
 await new Promise(r=>setTimeout(r,15));s.c.recoverStartupAuth(Error('network'));
 await new Promise(r=>setTimeout(r,15));assert.equal(s.calls.retries,1);assert.equal(signs,0);assert.equal(s.calls.login,0);
});
test('late SDK completion schedules recovery instead of permanently stranding the cover',async()=>{
 let release;const s=setup({getSession:()=>new Promise(r=>release=r)});
 await assert.rejects(s.c.readStartupSession(),/timed out/);
 vm.runInContext('startupSessionWaiting=true; authStartupRetryAttempts=1;',s.c);
 release({data:{session:{user:{id:'a'}}}});await new Promise(r=>setTimeout(r,15));assert.equal(s.calls.retries,1);
});
test('only actual credential errors display wrong-password text',()=>{
 const {c}=setup({});
 assert.match(c.loginAuthErrorMessage({code:'invalid_credentials',status:400}),/kata laluan tidak betul/);
 for(const error of [{name:'AuthRetryableFetchError',message:'signal is aborted without reason'},{status:503},{status:500},{message:'Failed to fetch'}])assert(!c.loginAuthErrorMessage(error).includes('kata laluan tidak betul'));
 assert.match(c.loginAuthErrorMessage({status:429}),/Terlalu banyak/);
});
test('bootstrap retries preserve recovery checks and do not reload/delete local data',()=>{
 const html=fs.readFileSync('index.html','utf8');assert(html.includes('window.retryLeadLajuStartup'));
 assert(html.includes('revealTimer = setTimeout(finish, 500)'));
 const body=source.slice(source.indexOf('async function bootstrap()'),source.indexOf('function initializeFloatingNavigation('));
 assert(body.includes('await readStartupSession()'));assert(!body.includes('auth.getSession()'));assert(!body.includes('localStorage.clear'));
});
