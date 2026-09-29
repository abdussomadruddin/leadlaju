const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const projectFunctions = source.slice(
  source.indexOf('async function saveProject(project)'),
  source.indexOf('async function toggleProject(projectId)'),
);

test('new Supabase projects let the server generate a UUID and retain its returned ID', async () => {
  const calls = [];
  let reset = false;
  const uuid = 'b0734a85-87e8-4d22-b9d4-48bb50aafcb7';
  const context = {
    remoteDatabaseMode: true,
    remoteDatabaseClient: {
      rpc: async (name, args) => {
        calls.push({ name, args });
        return { data: { ok: true, project: { id: uuid } }, error: null };
      },
    },
    guardLifecycleMutation: () => true,
    isAdmin: () => true,
    elements: {
      projectName: { value: 'Projek Baru' },
      projectForm: { reset: () => { reset = true; } },
    },
    state: { projects: [] },
    makeId: () => { throw new Error('A client-generated ID must not be used for a remote project'); },
    saveState: () => {},
    renderAll: () => {},
    showToast: () => {},
  };
  vm.runInNewContext(projectFunctions, context);
  await context.addProject({ preventDefault() {} });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'admin_upsert_project');
  assert.equal(calls[0].args.p_project.id, null);
  assert.equal(context.state.projects.length, 1);
  assert.equal(context.state.projects[0].id, uuid);
  assert.equal(reset, true);
});
