const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
test('New copy available only to authorized Team Sales; Agent gate unchanged',()=>{
 const c=vm.createContext({isTeamSales:()=>true,canViewLeadPhone:()=>true,canAccessLead:()=>true,escapeHtml:String});
 vm.runInContext(source.slice(source.indexOf('function canRevealLeadContact('),source.indexOf('function countsTowardLeadBadge(')),c);
 vm.runInContext(source.slice(source.indexOf('function renderLeadCopyButton('),source.indexOf('async function copyLeadDetails(')),c);
 const lead={id:'a',status:'new',name:'Fixture',phone:'60120000000',email:'fixture@example.invalid',notes:'60120000000 fixture@example.invalid',project:'LG'};
 c.leadDisplayNotes=l=>l.notes;
 assert.doesNotMatch(c.renderLeadCopyButton(lead),/ disabled/);
 const text=c.leadDetailsCopyText(lead);
 assert.match(text,/60120000000/);assert.match(text,/fixture@example.invalid/);assert.equal(lead.status,'new');
 c.isTeamSales=()=>false;assert.match(c.renderLeadCopyButton(lead),/ disabled/);
 c.isTeamSales=()=>true;c.canAccessLead=()=>false;assert.match(c.renderLeadCopyButton(lead),/ disabled/);
});
