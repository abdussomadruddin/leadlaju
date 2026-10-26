const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ExcelJS=require('exceljs');
const source=fs.readFileSync('neglected.js','utf8');
const row=(id='lead')=>({id,name:'=Nama Melayu',phone:'0123456789',email:'a@example.invalid',project:'Projek',source:'Meta',previous_status:'contacted',previous_owner:'Ejen lama',previous_follow_up:3,notes:'Baris 1\nBaris 2',created_at:'2026-10-01T00:00:00Z',last_activity_at:'2026-10-20T00:00:00Z',neglected_at:'2026-10-26T00:00:00Z',assignment_revision:2});
class Workbook extends ExcelJS.Workbook {addWorksheet(...a){const sheet=super.addWorksheet(...a),add=sheet.addRow.bind(sheet);sheet.addRow=v=>add(Array.from(v));return sheet;}}
function setup(rpc){
 const nodes={},downloads=[];const node=id=>nodes[id] ||= {value:'',textContent:'',innerHTML:'',checked:false,hidden:false,disabled:false,handlers:{},classList:{add(){},remove(){}},replaceChildren(){this.innerHTML='';},addEventListener(name,fn){this.handlers[name]=fn;}};
 const c=vm.createContext({window:{ExcelJS:{Workbook}},document:{getElementById:node,querySelector:node,querySelectorAll:()=>[]},remoteDatabaseMode:true,isAdmin:()=>true,isTeamSales:()=>false,activeBrandId:'brand',activeBrand:{name:'Safrich'},brandContextVersion:1,state:{currentUserId:'admin',agents:[],projects:[]},activeView:'neglected',Date,Intl,Blob,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout,escapeHtml:v=>String(v),formatDateTime:String,exportLeadDate:v=>new Date(v),LEAD_STATUS_LABELS:{contacted:'Contacted'},downloadFile:(blob,name)=>downloads.push({blob,name}),remoteDatabaseClient:{rpc},loadRemoteState:async()=>{},renderAll(){},switchView(){}});
 vm.runInContext(source,c);return {c,nodes,node,downloads};
}
test('Neglected export pages preserve text and full notes in real Excel',async()=>{
 let calls=0;const s=setup(async(name,args)=>{assert.equal(name,'get_neglected_leads_page');assert.equal(args.p_export,true);return {data:{brand_id:'brand',total:2,has_more:++calls===1,rows:[row(String(calls))]}};});
 await s.node('neglected-export').handlers.click();assert.equal(s.downloads.length,1);
 const book=new ExcelJS.Workbook();await book.xlsx.load(await s.downloads[0].blob.arrayBuffer());const sheet=book.getWorksheet('Neglected Lead');
 assert.equal(sheet.rowCount,3);assert.equal(sheet.getCell('B2').type,ExcelJS.ValueType.String);assert.equal(sheet.getCell('C2').value,'0123456789');assert.equal(sheet.getCell('J2').value,row().notes);assert.equal(sheet.getCell('H2').value,'Ejen lama');assert.equal(sheet.views[0].ySplit,1);
});
test('Failed page, changed total or foreign brand never downloads partial export',async()=>{
 for(const failure of [{error:Error('timeout')},{data:{brand_id:'brand',total:3,rows:[],has_more:false}},{data:{brand_id:'foreign',rows:[],total:2,has_more:false}}]){
  let calls=0;const s=setup(async()=>++calls===1?{data:{brand_id:'brand',total:2,rows:[row()],has_more:true}}:failure);
  await s.node('neglected-export').handlers.click();assert.equal(s.downloads.length,0);assert.match(s.node('neglected-message').textContent,/Tiada fail separa/);
 }
});
test('Brand switch cancels pending export; Team Sales and agent cannot export',async()=>{
 let s;s=setup(async()=>{s.c.brandContextVersion++;return {data:{brand_id:'brand',total:1,rows:[row()],has_more:false}};});
 await s.node('neglected-export').handlers.click();assert.equal(s.downloads.length,0);
 for(const guard of ['isAdmin','isTeamSales']){let calls=0;const a=setup(async()=>{calls++;return {};});a.c[guard]=()=>guard==='isTeamSales';await a.node('neglected-export').handlers.click();assert.equal(calls,0);}
});
test('Bulk retry preserves action ID after uncertain response',async()=>{
 const requests=[];let calls=0;
 const s=setup(async(name,args)=>{if(name==='get_neglected_leads_page')return {data:{brand_id:'brand',total:1,rows:[row()],has_more:false}};requests.push(args);return ++calls===1?{error:Error('network timeout')}:{data:{ok:true,results:[{id:'lead',ok:true}]}};});
 await s.c.window.NeglectedLead.open(); // open starts asynchronous read
 await new Promise(r=>setImmediate(r));
 s.node('neglected-rows').handlers.change({target:{dataset:{neglectedId:'lead'},checked:true}});s.node('neglected-target').value='agent';
 await s.node('neglected-assign').handlers.click();await s.node('neglected-assign').handlers.click();
 assert.equal(requests.length,2);assert.equal(requests[0].p_action_id,requests[1].p_action_id);assert.equal(requests[0].p_items[0].revision,2);
});
test('Migration retains Agent boundaries, finite batches, exclusions and scheduler reuse',()=>{
 const sql=fs.readFileSync('supabase/migrations/20261026142609_agent_neglected_leads.sql','utf8');
 for(const text of ["interval '120 hours'",'limit 200 for update skip locked',"assignment_mode='agent' and not admin_assigned",'ne.lead_id=v_lead.id','ne.lead_id=fresh.id','pg_advisory_xact_lock','Action ID reused','assignment_revoked','neglected_held','enable row level security'])assert(sql.includes(text),text);
 assert(!sql.includes('cron.schedule'));assert(!sql.includes('delete from public.leads'));
 const app=fs.readFileSync('app.js','utf8');assert(app.includes('filter(row => !row.neglected_held)'));assert(app.includes('renderNewLeadNotes(item)'));
});
