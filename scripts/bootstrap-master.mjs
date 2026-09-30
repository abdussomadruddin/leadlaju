// Run once on a trusted operator host. Never place the service key in frontend.
import { execFileSync } from 'node:child_process';
let endpoint = process.env.SUPABASE_URL;
let key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (process.argv.includes('--production-cli')) {
 const ref='zvplvrtqvsfrftnjfdsh';
 const raw=execFileSync('npx',['supabase','projects','api-keys','--project-ref',ref,'--output','json'],{encoding:'utf8',maxBuffer:1024*1024});
 const keys=JSON.parse(raw.slice(raw.indexOf('[')));
 key=keys.find(k=>k.name==='service_role')?.api_key;
 endpoint=`https://${ref}.supabase.co`;
}
if (!endpoint || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
const email = 'lurbaymarketing@gmail.com';
const call = async (route,body) => {
 const r=await fetch(`${endpoint}${route}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const raw=await r.text(); const data=raw?JSON.parse(raw):null;
 if(!r.ok) throw new Error(data?.msg||data?.message||data?.error||'Bootstrap failed'); return data;
};
// Preflight before issuing an invitation; do not recreate or promote an account.
const check=await fetch(`${endpoint}/rest/v1/profiles?select=id&role=eq.master`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
if(!check.ok || (await check.json()).length) throw new Error('Master exists or preflight failed');
const user=await call('/auth/v1/invite',{email,redirect_to:'https://leadlaju.vercel.app/?setup=1'});
await call('/rest/v1/rpc/bootstrap_first_master',{p_user_id:user.id,p_email:email});
console.log('Master profile created. Password setup invitation sent to the designated email.');
