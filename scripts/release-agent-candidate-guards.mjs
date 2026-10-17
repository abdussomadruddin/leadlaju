import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const ref='zvplvrtqvsfrftnjfdsh';
const file='20261010163042_agent_dispatch_candidate_guards.sql';
const source=fs.readFileSync(`supabase/migrations/${file}`,'utf8');
const query=sql=>JSON.parse(execFileSync('npx',['supabase','db','query','--linked','--project-ref',ref,'--output','json','--',sql],{encoding:'utf8',maxBuffer:4*1024*1024})).rows;
const fixture=fs.readFileSync('scripts/test-agent-queue-production.sql','utf8').replace('begin;',`begin;\n${source}`);
console.log(JSON.stringify(query(fixture)));
if(process.argv.includes('--apply')) {
 const old=query(`select pg_get_functiondef('leadlaju_private.dispatch_available_leads_current_cycle(timestamptz)'::regprocedure) definition`);
 const backup=fs.mkdtempSync('/tmp/leadlaju-candidate-backup-');
 fs.writeFileSync(`${backup}/function.json`,JSON.stringify(old),{mode:0o600});
 console.log(JSON.stringify({backup,result:query(`begin;set local lock_timeout='10s';${source}\ninsert into supabase_migrations.schema_migrations(version,name,statements) values('20261010163042','agent_dispatch_candidate_guards',array[$source$${source}$source$]) on conflict(version) do nothing;commit;select 'Candidate guards deployed' result;`)}));
 console.log(JSON.stringify(query(fs.readFileSync('scripts/test-agent-queue-production.sql','utf8'))));
}
