import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const ref='zvplvrtqvsfrftnjfdsh',version='20261014065327';
const source=fs.readFileSync(`supabase/migrations/${version}_follow_up_four_due_exclusion.sql`,'utf8');
const query=sql=>JSON.parse(execFileSync('npx',['supabase','db','query','--linked','--project-ref',ref,'--output','json','--',sql],{encoding:'utf8',maxBuffer:64*1024*1024})).rows;
if(process.argv.includes('--test')) {
 const fixture=fs.readFileSync('scripts/test-follow-up-four-production.sql','utf8').replace('-- INSTALL MIGRATION HERE',source);
 console.log(JSON.stringify(query(fixture)));
 const salesFixture=fixture.replace('insert into public.brands(id,name,slug)', 'insert into public.brands(id,name,slug,distribution_mode)').replace("'follow-four-fixture');", "'follow-four-fixture','team_sales');");
 console.log(JSON.stringify(query(salesFixture)));
} else if(process.argv.includes('--apply')) {
 const snapshot=query(`select jsonb_build_object('leads',(select coalesce(jsonb_agg(to_jsonb(l)),'[]') from public.leads l where status='contacted' and follow_up_count>=4),'functions',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind='f' and n.nspname in ('public','leadlaju_private') and (p.prosrc like '%follow_up_activity_at%' or p.proname='record_lead_follow_up'))) snapshot;`)[0].snapshot;
 const backup=fs.mkdtempSync('/tmp/leadlaju-follow-four-backup-');fs.chmodSync(backup,0o700);
 fs.writeFileSync(`${backup}/snapshot.json`,JSON.stringify(snapshot),{mode:0o600});
 console.log(JSON.stringify({backup,expectedBackfill:snapshot.leads.length}));
 console.log(JSON.stringify(query(`begin;set local lock_timeout='10s';set local statement_timeout='60s';
 lock table public.leads in share row exclusive mode;
 create temporary table expected_backfill as select id from public.leads where status='contacted' and follow_up_count>=4;
 ${source}
 do $$begin if exists(select 1 from public.leads l join expected_backfill e on e.id=l.id where l.status<>'all_offer_presented') then raise exception 'Backfill mismatch';end if;end$$;
 insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','follow_up_four_due_exclusion',array[$source$${source}$source$]);
 commit;select count(*) backfilled from expected_backfill;`)));
} else throw new Error('Use --test for rollback integration tests or --apply only for approved release');
