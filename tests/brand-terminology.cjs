const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('app.js','utf8');
const labelSource=app.slice(app.indexOf('function isTeamSales()'),app.indexOf('// Capture authored labels only'));
function fixture(mode){const context=vm.createContext({activeBrand:{distribution_mode:mode},signupBrand:null});vm.runInContext(labelSource,context);return context;}
test('Team Sales translates authored project labels while Safrich restores the originals',()=>{
 const c=fixture('team_sales');assert.equal(c.projectLabel(),'Produk');assert.equal(c.systemWorkerText('Projek dan projek PROJEK untuk ejen'), 'Produk dan produk PRODUK untuk Team Sales');
 vm.runInContext('activeBrand.distribution_mode="agent"',c);assert.equal(c.projectLabel(),'Projek');assert.equal(c.systemWorkerText('Projek dan projek untuk ejen'),'Projek dan projek untuk ejen');
});
test('signup terminology comes from signup brand rather than signed-in brand',()=>{
 const c=fixture('agent');assert.equal(c.systemWorkerText('Pilih projek untuk ejen',true),'Pilih produk untuk Team Sales');assert.equal(c.projectLabel(),'Projek');
});
test('copy uses product/project and source in the title without translating lead data',()=>{
 const c=fixture('team_sales');vm.runInContext(app.match(/function leadDetailsCopyText\(lead\) \{[\s\S]*?\n\}/)[0],c);
 const lead={name:'Projek Ahmad',phone:'60120000000',email:'projek@example.invalid',project:'Projek Asal',source:'TikTok Ads'};
 const text=c.leadDetailsCopyText(lead);assert.match(text,/\*Inquiry For Projek Asal From Tiktok\*/);assert.match(text,/Nama: Projek Ahmad/);assert.match(text,/Email: projek@example.invalid/);assert.match(text,/Nota Lain:\n/);
});
test('generic branding and Agent role contain no property branding',()=>{
 const html=fs.readFileSync('index.html','utf8');const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
 assert.doesNotMatch(html,/Property Lead Router|Property Agent|pasukan hartanah/);assert.equal(manifest.name,'LeadLaju - Lead Management');assert.doesNotMatch(manifest.description,/hartanah|property/i);
 assert.match(app,/isTeamSales\(\) \? "Team Sales" : "Agent"/);
});
test('translation never walks dynamic user records or changes API field keys',()=>{
 assert.match(app,/Capture authored labels only, never lead names/);assert.match(app,/script,style,pre,code/);
 assert.match(app,/project: state\.projects/);assert.match(app,/data-label="\$\{projectLabel\(\)\}"/);
 assert.match(app,/summary\.addRow\(\[projectLabel\(\)/);
});
