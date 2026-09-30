// Trusted operator backup. CLI credentials stay in child-process memory; neither
// credentials nor lead details are printed. Keep this artifact outside Git.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const target=process.argv[2];
const pgDump=process.env.LEADLAJU_PG_DUMP;
if(!target || !pgDump) throw new Error('Provide a private backup directory and LEADLAJU_PG_DUMP');
const ref='zvplvrtqvsfrftnjfdsh';
const dry=execFileSync('npx',['supabase','db','dump','--project-ref',ref,'--dry-run','--agent','no','--output-format','text'],{encoding:'utf8',maxBuffer:1024*1024});
const env={...process.env};
for(const [,key,value] of dry.matchAll(/^export (PG[A-Z]+)="([^"\n]*)"$/gm)) env[key]=value;
if(!env.PGUSER?.includes(ref)||!env.PGPASSWORD) throw new Error('Wrong project or missing temporary CLI credentials');
fs.mkdirSync(target,{recursive:true,mode:0o700});
const dumpFile=path.join(target,'database-before-brands.dump');
execFileSync(pgDump,['--format=custom','--role=postgres','--schema=public','--schema=leadlaju_private','--schema=auth','--schema=supabase_migrations','--file',dumpFile],{env,stdio:['ignore','pipe','pipe']});
fs.chmodSync(dumpFile,0o600);
const query=execFileSync('npx',['supabase','db','query','--linked','--project-ref',ref,`select table_name,(xpath('/row/c/text()',query_to_xml(format('select count(*) c from public.%I',table_name),false,true,'')))[1]::text::bigint count from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name`,'--output','json'],{encoding:'utf8',maxBuffer:1024*1024});
const counts=JSON.parse(query.slice(query.indexOf('{'))).rows;
fs.writeFileSync(path.join(target,'counts-before.json'),JSON.stringify(counts,null,2),{mode:0o600});
const platform=execFileSync('npx',['supabase','db','query','--linked','--project-ref',ref,`select jsonb_build_object('cron', (select jsonb_agg(to_jsonb(j)) from cron.job j),'realtime_policies',(select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname='realtime')) as metadata`,'--output','json'],{encoding:'utf8',maxBuffer:1024*1024});
fs.writeFileSync(path.join(target,'platform-metadata-before.json'),platform,{mode:0o600});
execFileSync(pgDump.replace(/pg_dump$/,'pg_restore'),['--list',dumpFile],{encoding:'utf8'});
console.log(`Verified readable custom-format backup: ${dumpFile} (${fs.statSync(dumpFile).size} bytes), ${counts.length} public table counts recorded.`);
