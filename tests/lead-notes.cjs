const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const context = {};
vm.createContext(context);
vm.runInContext(stripTypeScriptTypes(fs.readFileSync('supabase/functions/_shared/lead-notes.ts','utf8'), { mode: 'transform' }).replace(/export /g,''), context);
const projects = [{id:'p',name:'LG'}];
test('TikTok note field order does not affect extracted identity', () => {
  const lines=['RM3500-RM5000','Muhammad rafi','+60 11-2692 9192','Ya','Kerja Swasta','fixture@example.com','LG'];
  for (let i=0;i<lines.length;i++) {
    const notes=[...lines.slice(i),...lines.slice(0,i)].join('\n');
    const parsed=context.parseLeadNotes(notes,projects);
    assert.equal(parsed.name,'Muhammad rafi');
    assert.equal(parsed.phone,'601126929192');
    assert.equal(parsed.email,'fixture@example.com');
    assert.equal(parsed.project,'LG');
  }
});
test('All excluded form answers are not names, including slash and salary answers', () => {
  const answers=['Ya','Tidak','Kerja Kerajaan','Kerja Swasta','Berniaga/Freelance','RM2500-RM3500','RM3500-RM5000','RM5000 keatas'];
  const parsed=context.parseLeadNotes([...answers,'Muhammad rafi','+60173559147','LG'].join('\\'),projects);
  assert.equal(parsed.name,'Muhammad rafi');
  assert.equal(parsed.phone,'60173559147');
});
test('Product answers in unlabelled notes are not candidates for a name', () => {
  for (const answer of ['tv', 'AIRCOND', 'peti sejuk', 'peti_sejuk', 'WashTower', 'wash tower', 'washtower_(washer+dryer)']) {
    const notes = ['Ali Ahmad', '+60123456789', answer].join('\n');
    assert.equal(context.parseLeadNotes(notes, projects, 'LG').name, 'Ali Ahmad');
  }
});
test('Ordered Meta notes preserve the submitted display name', () => {
  const notes = ['handle123', '+60123456789', 'another@example.com', 'aircond'].join('\n');
  assert.equal(context.parseLeadNotes(notes, projects, 'LG', '', '', true).name, 'handle123');
  assert.equal(context.parseLeadNotes(notes, projects, 'LG').name, 'Nama tidak dinyatakan');
  assert.equal(context.parseLeadNotes(notes, projects, 'LG', 'Ali', '', true).name, 'Ali');
});
test('Invalid emails, missing phones and unknown products fail intake', () => {
  for (const notes of ['Ali\n01126929192\ninvalid@email\nLG','Ali\n2500\nLG','Ali\n01126929192\nUnknown Product'])
    assert.throws(()=>context.parseLeadNotes(notes,projects));
  assert.equal(context.normalizeNotesPhone('011-2692 9192'),'601126929192');
  assert.equal(context.normalizeNotesPhone('RM3500-RM5000'),'');
});
test('Locked New Lead notes mask contact details and escape HTML', () => {
  const source=fs.readFileSync('app.js','utf8');
  vm.runInContext(source.slice(source.indexOf('function canRevealLeadContact('),source.indexOf('function countsTowardLeadBadge(')),context);
  vm.runInContext(source.slice(source.indexOf('function leadDisplayNotes('),source.indexOf('function renderActiveLead(')),context);
  context.isTeamSales=()=>false;
  context.canViewLeadPhone=()=>false;
  context.escapeHtml=value=>value.replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const notes='Muhammad rafi\n+60 11-2692 9192\nfixture@example.com\n<script>alert(1)</script>';
  const locked=context.renderNewLeadNotes({notes});
  assert(!locked.includes('2692'));assert(!locked.includes('fixture@example.com'));assert(!locked.includes('<script>'));
  context.canViewLeadPhone=()=>true;
  assert(context.renderNewLeadNotes({notes}).includes('fixture@example.com'));
});

test('Team Sales New notes reveal authorized contacts immediately', () => {
  context.isTeamSales=()=>true;
  context.canViewLeadPhone=()=>true;
  const lead={status:'new',phone:'601126929192',notes:'Remark\n+60 11-2692 9192\n601126929192\nfixture@example.com'};
  const locked=context.renderNewLeadNotes(lead);
  assert(locked.includes('2692'));assert(locked.includes('601126929192'));
  assert(locked.includes('fixture@example.com'));
  assert.equal(context.canViewLeadPhone(lead),true,'Display masking does not disable contact action permission');
  lead.status='contacted';
  assert(context.renderNewLeadNotes(lead).includes('2692'));
  assert(context.renderNewLeadNotes(lead).includes('fixture@example.com'));
  context.canViewLeadPhone=()=>false;
  assert(!context.renderNewLeadNotes({...lead,status:'new'}).includes('fixture@example.com'));
});

test('Correct only extra Malaysian trunk zero, retaining valid contacts and ambiguity checks', () => {
  for (const phone of ['+6001161221544','+60 (0)11-6122 1544','+601161221544','01161221544']) {
    assert.equal(context.normalizeNotesPhone(phone),'601161221544');
    const lead=context.parseLeadNotes(`Fixture Name\n${phone}\nLG`,projects);
    assert.equal(lead.phone,'601161221544');
  }
  assert.equal(context.normalizeNotesPhone('+442079460958'),'442079460958');
  assert.equal(context.normalizeNotesPhone('+123'),'');
  assert.equal(context.parseLeadNotes('Fixture Name\n+6001161221544\n+60173559147\nLG',projects).phone,'601161221544');
});

test('Repair malformed phones inside notes without changing other content',()=>{
 const original='Jerry\n+6001136306224\nfixture@example.com\n2_unit';
 assert.equal(context.repairNotesPhoneText(original),'Jerry\n+601136306224\nfixture@example.com\n2_unit');
 assert.equal(context.repairNotesPhoneText('+60 (0)11-6122 1544'),'+601161221544');
 for(const value of ['+601161221544','RM600116','+60011612','+60001161221544']) assert.equal(context.repairNotesPhoneText(value),value);
});

test('accepts a numeric handle matching the email username in ads notes', () => {
  const notes = 'mesin_basuh_+_aircond_=_free_tv\nejumps83\n+60132775698\nejumps83@example.invalid';
  assert.equal(context.parseLeadNotes(notes, projects, 'LG').name, 'ejumps83');
  assert.equal(context.parseLeadNotes(notes.replace('ejumps83@example.invalid', 'other@example.invalid'), projects, 'LG').name,'Nama tidak dinyatakan');
});

test('Explicit contact fields take priority over note candidates', () => {
  const lead=context.parseLeadNotes('Ali\nAbu\n+60173559147\nLG',projects,'LG','Named Contact','+442079460958');
  assert.equal(lead.name,'Named Contact');
  assert.equal(lead.phone,'442079460958');
  assert.equal(context.parseLeadNotes('Ali\nAbu\n+60173559147\nLG',projects).name,'Nama tidak dinyatakan');
});
