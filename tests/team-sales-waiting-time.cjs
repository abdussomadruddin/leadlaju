const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync('app.js','utf8');
const css = fs.readFileSync('styles.css','utf8');
const c=vm.createContext({Date,isTeamSales:()=>true,escapeHtml:v=>String(v)});
vm.runInContext(app.slice(app.indexOf('function salesLeadWaitingTime('),app.indexOf('function renderNewLeadNotes(')),c);
test('Waiting clock counts upward from ingestion, including days and future clock skew',()=>{
 const start=100000;
 assert.equal(c.salesLeadWaitingTime({createdAt:start},start),'0 hari 0 jam 00 minit 00 saat');
 assert.equal(c.salesLeadWaitingTime({createdAt:start},start+3661000),'0 hari 1 jam 01 minit 01 saat');
 assert.equal(c.salesLeadWaitingTime({createdAt:start},start+90061000),'1 hari 1 jam 01 minit 01 saat');
 assert.equal(c.salesLeadWaitingTime({createdAt:start,receivedAt:start+60000},start+60000),'0 hari 0 jam 01 minit 00 saat');
 assert.equal(c.salesLeadWaitingTime({createdAt:start},start-1),'0 hari 0 jam 00 minit 00 saat');
 assert.equal(c.salesLeadWaitingTime({},start),'—');
});
test('Only Team Sales New leads show red waiting clock; interval does not mutate leads',()=>{
 assert.match(c.renderSalesLeadWaitingTime({id:'lead',status:'new',createdAt:Date.now()}),/Belum contact/);
 assert.equal(c.renderSalesLeadWaitingTime({status:'contacted'}),'');
 c.isTeamSales=()=>false;assert.equal(c.renderSalesLeadWaitingTime({status:'new'}),'');
 assert.match(css,/\.sales-lead-waiting strong \{ color: #b91c1c/);
 assert.match(css,/prefers-reduced-motion: reduce\) \{ \.sales-lead-waiting strong \{ animation: none/);
 const update=app.slice(app.indexOf('function updateSalesLeadWaitingTimes('),app.indexOf('function renderNewLeadNotes('));
 assert.doesNotMatch(update,/rpc\(|expiresAt|lead\.status\s*=/);
});
