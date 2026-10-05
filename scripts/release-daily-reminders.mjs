// Trusted operator release. Sensitive snapshots stay outside Git, mode 0600.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const ref='zvplvrtqvsfrftnjfdsh';
if(fs.readFileSync(path.join(root,'supabase/.temp/project-ref'),'utf8').trim()!==ref)throw new Error('Wrong linked project');
const query=sql=>JSON.parse(execFileSync('npx',['supabase','db','query','--linked','--project-ref',ref,sql,'--output','json'],{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024})).rows;
const file=fs.readdirSync(path.join(root,'supabase/migrations')).find(name=>name.endsWith('_team_sales_daily_follow_up_rules.sql'));
const version=file.split('_')[0];
if(process.argv.includes('--prepare')) {
 const directory=fs.mkdtempSync('/Users/abdussomad/.codex/private-backups/leadlaju-daily-reminders-');fs.chmodSync(directory,0o700);
 const snapshot=query(`do $$ declare r record;begin
 create temporary table release_snapshot(schema_name text,table_name text,data jsonb);
 for r in select table_schema,table_name from information_schema.tables where table_schema in ('public','leadlaju_private') and table_type='BASE TABLE' order by table_schema,table_name loop
 execute format('insert into release_snapshot select %L,%L,coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from %I.%I t',r.table_schema,r.table_name,r.table_schema,r.table_name);
 end loop;end $$;
 select jsonb_build_object('tables',(select jsonb_agg(to_jsonb(t)) from release_snapshot t),
 'functions',(select jsonb_agg(jsonb_build_object('identity',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','leadlaju_private') and p.prokind='f'),
 'cron',(select jsonb_agg(to_jsonb(j)) from cron.job j)) snapshot;`)[0].snapshot;
 const target=path.join(directory,'operational-data-and-functions.json');fs.writeFileSync(target,JSON.stringify(snapshot),{mode:0o600});
 const stored=JSON.parse(fs.readFileSync(target,'utf8'));
 console.log(JSON.stringify({backup:directory,bytes:fs.statSync(target).size,tables:stored.tables.length,leads:stored.tables.find(t=>t.schema_name==='public'&&t.table_name==='leads').data.length}));
} else {
 const directory=process.argv.find(arg=>arg.startsWith('--backup='))?.slice(9);
 if(!process.argv.includes('--apply')||!directory||!fs.statSync(path.join(directory,'operational-data-and-functions.json')).size)throw new Error('Require --apply and a verified --backup');
 const source=fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8');
 const sql=`begin;set local lock_timeout='15s';set local statement_timeout='120s';
 do $$begin if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then raise exception 'Already applied';end if;end $$;
 lock table public.leads,public.lead_assignments,public.lead_events,public.notification_outbox in share row exclusive mode;
 create temporary table preserved_daily_records as
 select 'leads' name,count(*) n,md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by id),'')) fingerprint from public.leads t union all
 select 'lead_assignments',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by id),'')) from public.lead_assignments t union all
 select 'lead_events',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by id),'')) from public.lead_events t;
 ${source}
 do $$ declare r record; n bigint; fingerprint text;begin
 for r in select * from preserved_daily_records loop
 execute format('select count(*),md5(coalesce(string_agg(to_jsonb(t)::text,''|'' order by id),'''')) from public.%I t',r.name) into n,fingerprint;
 if n<>r.n or fingerprint<>r.fingerprint then raise exception 'Unexpected record change in %',r.name;end if;end loop;end $$;
 insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','team_sales_daily_follow_up_rules',array[$source$${source}$source$]);
 commit;select 'Daily reminder migration committed; all lead and assignment/history records preserved' result;`;
 console.log(JSON.stringify(query(sql)));
}
