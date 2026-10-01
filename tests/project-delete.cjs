const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20260929064907_admin_delete_empty_project.sql'), 'utf8');
const source = app.slice(app.indexOf('async function deleteProject(projectId, button)'), app.indexOf('async function rejectAgent(agentId)'));

test('project deletion stays inside the expanded project details and advanced menu', () => {
  const render = app.slice(app.indexOf('function renderProjects()'), app.indexOf('function escapeHtml(value)'));
  assert.match(render, /<details class="project-status-dropdown"[\s\S]*<details class="project-danger-menu">[\s\S]*data-project-delete/);
  assert.match(app, /if \(!confirmPermanentDelete\(systemWorkerText\("projek"\), project\.name\)\) return/);
  assert.match(app, /const firstConfirmed = window\.confirm\([\s\S]*return window\.confirm\(/);
});

test('server authorizes admins and refuses projects with linked business records', () => {
  assert.match(sql, /leadlaju_private\.is_admin\(auth\.uid\(\)\)/);
  assert.match(sql, /from public\.projects[\s\S]*for update/);
  assert.match(sql, /from public\.leads where project_id = p_project_id/);
  assert.match(sql, /from public\.bulletins where project_id = p_project_id/);
  assert.match(sql, /from public\.agent_project_eligibility where project_id = p_project_id/);
  assert.match(sql, /revoke all on function public\.admin_delete_project\(uuid\) from public, anon/);
  assert.match(sql, /grant execute on function public\.admin_delete_project\(uuid\) to authenticated/);
});

test('cancelled deletion never calls Supabase; confirmed deletion removes only the saved project', async () => {
  const calls = [];
  const project = { id: 'project-uuid', name: 'Projek Kosong' };
  const state = { projects: [project, { id: 'other-uuid', name: 'Lain' }] };
  const button = { disabled: false };
  let confirmed = false;
  const context = {
    guardLifecycleMutation: () => true,
    isAdmin: () => true,
    systemWorkerText: text => text,
    remoteDatabaseMode: true,
    state,
    confirmPermanentDelete: () => confirmed,
    remoteDatabaseClient: { rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: { ok: true }, error: null };
    } },
    expandedProjectStatusIds: new Set(),
    saveState: () => {},
    renderAll: () => {},
    showToast: () => {},
    console,
  };
  vm.runInNewContext(source, context);
  await context.deleteProject(project.id, button);
  assert.equal(calls.length, 0);
  assert.equal(state.projects.length, 2);

  confirmed = true;
  await context.deleteProject(project.id, button);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'admin_delete_project');
  assert.equal(calls[0].args.p_project_id, project.id);
  assert.equal(state.projects.length, 1);
  assert.equal(state.projects[0].id, 'other-uuid');
  assert.equal(button.disabled, false);
});
