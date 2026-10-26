/* Agent recovery queue: independent paginated admin feed, never dashboard cache. */
window.NeglectedLead = (() => {
  const el = id => document.getElementById(`neglected-${id}`);
  let context = '', generation = 0, rows = [], selected = new Set(), after = null;
  let loadedAt = 0, busy = false, exporting = false, pendingAction = null, searchTimer, queuedLoad = false;
  const allowed = () => remoteDatabaseMode && isAdmin() && !isTeamSales() && Boolean(activeBrandId);
  const key = () => `${brandContextVersion}:${state.currentUserId}:${activeBrandId}`;
  const message = text => { el('message').textContent = text; };
  const date = value => value ? formatDateTime(new Date(value).getTime()) : '—';
  function reset() {
    context = key(); generation++; rows = []; selected.clear(); after = null; loadedAt = 0; pendingAction = null;
    el('rows').replaceChildren(); el('count').hidden = true; message('');
    el('all').checked = false;
    for (const id of ['search','project','owner','target']) el(id).value = '';
    for (const id of ['project','owner','target']) el(id).innerHTML = '<option value="">Pilih / semua</option>';
  }
  function sync() {
    document.querySelectorAll('.neglected-admin-only').forEach(node => { node.hidden = !allowed(); });
    if (context !== key()) reset();
    if (!allowed()) { el('rows').replaceChildren(); if(activeView==='neglected')switchView('dashboard'); return; }
    if (Date.now() - loadedAt > 30000 && !busy) void load(activeView !== 'neglected');
  }
  function filters() {
    const project = el('project').value, owner = el('owner').value, target = el('target').value;
    el('project').innerHTML = '<option value="">Semua projek</option>' + state.projects.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('');
    const agents = state.agents.filter(a => a.role === 'agent');
    el('owner').innerHTML = '<option value="">Semua ejen terdahulu</option>' + agents.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`).join('');
    el('target').innerHTML = '<option value="">Pilih ejen penerima</option>' + agents.filter(a => a.active && a.approvalStatus === 'approved').map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`).join('');
    el('project').value = project; el('owner').value = owner; el('target').value = target;
  }
  function draw() {
    el('rows').innerHTML = rows.length ? rows.map(r => `<article class="neglected-row"><label><input type="checkbox" data-neglected-id="${escapeHtml(r.id)}" ${selected.has(r.id) ? 'checked' : ''}><strong>${escapeHtml(r.name)}</strong></label><span class="neglected-badge">Neglected Lead</span><p>${escapeHtml(r.project)} · Ejen terdahulu: ${escapeHtml(r.previous_owner)}</p><small>Kemas kini terakhir: ${date(r.last_activity_at)}<br>Ditarik balik: ${date(r.neglected_at)}</small><p class="neglected-note">${escapeHtml(r.notes || 'Tiada nota')}</p></article>`).join('') : '<p>Tiada Neglected Lead yang sepadan.</p>';
    el('all').checked = rows.length > 0 && rows.every(r => selected.has(r.id));
  }
  function args(exportingAll = false, cursor = after) {
    return { p_after: cursor, p_search: exportingAll ? '' : el('search').value.trim(), p_project: exportingAll ? null : el('project').value || null, p_agent: exportingAll ? null : el('owner').value || null, p_export: exportingAll };
  }
  async function load(badgeOnly = false) {
    if (!allowed()) return;
    if (busy) { queuedLoad = true; return; }
    if (context !== key()) reset();
    const captured = context, seq = ++generation;
    busy = true; el('refresh').classList.add('is-loading');
    if (!badgeOnly) { message('Memuatkan Neglected Lead…'); filters(); }
    try {
      const { data, error } = await remoteDatabaseClient.rpc('get_neglected_leads_page', badgeOnly ? {...args(),p_after:null,p_search:'',p_project:null,p_agent:null,p_count_only:true} : args());
      if (captured !== key() || seq !== generation) return;
      if (error) throw error;
      if (data?.brand_id !== activeBrandId || !Array.isArray(data.rows)) throw new Error('Respons tidak sah');
      el('count').textContent = data.total; el('count').hidden = !data.total; loadedAt = Date.now();
      if (!badgeOnly) { rows = data.rows; selected.clear(); el('next').disabled = !data.has_more; draw(); message(`${data.total} lead dalam simpanan Neglected. ${rows.length} dipaparkan.`); }
    } catch (error) { if (captured === key()) { loadedAt=Date.now(); message(`Gagal memuatkan: ${error.message}. Tekan Muat semula.`); } }
    finally { busy = false; el('refresh').classList.remove('is-loading'); if(queuedLoad){queuedLoad=false;void load(activeView!=='neglected');} }
  }
  async function resolve(mode) {
    if (!allowed() || busy) return;
    const items = rows.filter(r => selected.has(r.id)).map(r => ({id:r.id,revision:Number(r.assignment_revision)}));
    const agent = mode === 'assign' ? el('target').value : null;
    if (!items.length || (mode === 'assign' && !agent)) { message('Pilih lead dan ejen penerima jika assign.'); return; }
    const request = {p_items:items,p_mode:mode,p_agent:agent};
    const signature = JSON.stringify(request);
    if (pendingAction?.signature !== signature) pendingAction = {signature,actionId:crypto.randomUUID()};
    const captured = key(); busy = true;
    const button = el(mode); button.disabled = true; button.classList.add('is-loading'); message('Memproses — menunggu pengesahan server…');
    try {
      const {data,error} = await remoteDatabaseClient.rpc('admin_resolve_neglected',{p_action_id:pendingAction.actionId,...request});
      if (captured !== key()) return;
      if (error) throw error;
      if (!data?.ok || !Array.isArray(data.results)) throw new Error('Respons tidak sah');
      const failed = data.results.filter(r => !r.ok);
      pendingAction = null;
      busy = false; await load();
      if(captured !== key() || !allowed()) return;
      message(`${data.results.length-failed.length} berjaya. ${failed.length} gagal.${failed.map(r=>` ${rows.find(l=>l.id===r.id)?.name || r.id}: ${r.error}`).join('')}`);
      void loadRemoteState(state.currentUserId).then(() => renderAll()).catch(() => {});
    } catch(error) { if(captured === key()) message(`Belum disahkan: ${error.message}. Pilihan dikekalkan; tekan tindakan sama untuk retry selamat.`); }
    finally { busy = false; button.disabled = false; button.classList.remove('is-loading'); if(queuedLoad){queuedLoad=false;void load(activeView!=='neglected');} }
  }
  async function exportExcel() {
    if (!allowed() || exporting) return;
    const captured = key(); exporting = true; el('export').disabled = true; el('export').classList.add('is-loading');
    try {
      if (!window.ExcelJS) throw new Error('Excel belum tersedia');
      const book = new window.ExcelJS.Workbook(), sheet = book.addWorksheet('Neglected Lead');
      sheet.addRow(['ID Lead','Nama','Telefon','Emel','Projek','Sumber','Status terdahulu','Ejen terdahulu','Follow Up terdahulu','Nota/Remark','Tarikh masuk (KL)','Kemas kini aktiviti (KL)','Ditarik balik (KL)']);
      let cursor = null, total, count = 0; const seen = new Set();
      do {
        const {data,error} = await remoteDatabaseClient.rpc('get_neglected_leads_page',args(true,cursor));
        if (captured !== key() || !allowed()) return;
        if (error) throw error;
        if (data?.brand_id !== activeBrandId || !Array.isArray(data.rows)) throw new Error('Respons eksport tidak sah');
        if (total === undefined) total = Number(data.total);
        if (Number(data.total) !== total) throw new Error('Data berubah semasa eksport');
        for (const r of data.rows) {
          if (seen.has(r.id)) throw new Error('Rekod berulang'); seen.add(r.id);
          const text = value => String(value ?? '');
          const row = sheet.addRow([text(r.id),text(r.name),text(r.phone),text(r.email),text(r.project),text(r.source),LEAD_STATUS_LABELS[r.previous_status] || text(r.previous_status),text(r.previous_owner),Number(r.previous_follow_up)||0,text(r.notes),exportLeadDate(r.created_at),exportLeadDate(r.last_activity_at),exportLeadDate(r.neglected_at)]);
          row.getCell(3).numFmt = '@'; row.getCell(10).alignment = {wrapText:true,vertical:'top'};
          for (const col of [11,12,13]) row.getCell(col).numFmt = 'dd/mm/yyyy hh:mm:ss'; count++;
        }
        message(`Eksport ${count} daripada ${total} lead…`);
        if (!data.has_more) break;
        const next = data.rows.at(-1)?.id;
        if (!next || next === cursor) throw new Error('Pagination gagal'); cursor = next;
      } while(true);
      if (count !== total) throw new Error('Jumlah rekod berubah');
      sheet.views = [{state:'frozen',ySplit:1}]; sheet.autoFilter = {from:'A1',to:`M${count+1}`};
      [38,28,20,30,25,20,24,28,15,65,26,26,26].forEach((width,i)=>{sheet.getColumn(i+1).width=width;});
      sheet.getRow(1).font = {bold:true};
      const buffer = await book.xlsx.writeBuffer();
      if (captured !== key() || !allowed()) return;
      const brand = String(activeBrand?.name || 'brand').replace(/[^a-z0-9]+/gi,'-');
      const day = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      downloadFile(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`neglected-lead-${brand}-${day}.xlsx`);
      message(`${count} Neglected Lead dieksport.`);
    } catch(error) { if (captured === key()) message(`Eksport gagal: ${error.message}. Tiada fail separa dimuat turun. Cuba semula.`); }
    finally { exporting = false; el('export').disabled = false; el('export').classList.remove('is-loading'); }
  }
  el('rows').addEventListener('change',event=>{const id=event.target.dataset.neglectedId;if(!id)return;event.target.checked?selected.add(id):selected.delete(id);});
  el('all').addEventListener('change',()=>{selected=el('all').checked?new Set(rows.map(r=>r.id)):new Set();draw();});
  el('refresh').addEventListener('click',()=>load());
  el('first').addEventListener('click',()=>{after=null;void load();});
  el('next').addEventListener('click',()=>{after=rows.at(-1)?.id || null;void load();});
  for (const id of ['project','owner']) el(id).addEventListener('change',()=>{after=null;void load();});
  el('search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{after=null;void load();},300);});
  el('assign').addEventListener('click',()=>resolve('assign')); el('rotate').addEventListener('click',()=>resolve('rotate'));
  el('export').addEventListener('click',exportExcel);
  document.querySelector('#active-lead-container')?.addEventListener('click', event => {
    const button = event.target.closest('[data-neglected-call]');
    if (button) void handleCall(button.dataset.neglectedCall);
  });
  return {sync,open:()=>{after=null;void load();},invalidate:()=>{loadedAt=0;if(allowed())void load(activeView!=='neglected');}};
})();
