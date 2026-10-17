const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('app.js','utf8');
test('Due excludes four-plus even if an old cached feed contains it',()=>{
 const c=vm.createContext({state:{leads:[{id:'a',followUpCount:3},{id:'b',followUpCount:4},{id:'c',followUpCount:6}],followUpDue:[{id:'a'},{id:'b'},{id:'c'}]}});
 vm.runInContext(app.slice(app.indexOf('function followUpSectionRows('),app.indexOf('function followUpNavigationCount')),c);
 assert.deepEqual(Array.from(c.followUpSectionRows('due'),item=>item.id),['a']);
});
test('local mode threshold four is restricted to Contacted; cap remains shortcut',()=>{
 assert.match(app,/lead.followUpCount >= 4 && lead.status === "contacted"/);
 assert.doesNotMatch(app,/lead.followUpCount === 3\) applySheetStatusToLead/);
});
test('migration guards promotion and retains event/backfill provenance',()=>{
 const sql=fs.readFileSync('supabase/migrations/20261014065327_follow_up_four_due_exclusion.sql','utf8');
 assert.match(sql,/v_promote := v_next_count >= 4 and v_lead.status/);
 assert.match(sql,/where status='contacted' and follow_up_count>=4/);
 assert.match(sql,/follow_up_four_backfill/);
 assert.match(sql,/follow_up_count < 4/);
});
