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
test('Notes with ambiguous identities or invalid contacts fail rather than guessing', () => {
  for (const notes of ['Ali\nAbu\n+60173559147\nLG','Ali\n+60173559147\n+60123456789\nLG','Ali\n01126929192\ninvalid@email\nLG','Ali\n2500\nLG','Ali\n01126929192\nUnknown Product'])
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

test('Team Sales New notes stay masked until confirmed Contacted, while actions remain authorized', () => {
  context.isTeamSales=()=>true;
  context.canViewLeadPhone=()=>true;
  const lead={status:'new',phone:'601126929192',notes:'Remark\n+60 11-2692 9192\n601126929192\nfixture@example.com'};
  const locked=context.renderNewLeadNotes(lead);
  assert(!locked.includes('2692'));assert(!locked.includes('601126929192'));
  assert(!locked.includes('fixture@example.com'));assert(locked.includes('Call atau WhatsApp'));
  assert.equal(context.canViewLeadPhone(lead),true,'Display masking does not disable contact action permission');
  lead.status='contacted';
  assert(context.renderNewLeadNotes(lead).includes('2692'));
  assert(context.renderNewLeadNotes(lead).includes('fixture@example.com'));
});
