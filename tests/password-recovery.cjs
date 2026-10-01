const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8');

function bootstrapFixture({ hash = '', search = '', session = { user: { id: 'test' } }, event = false } = {}) {
  const calls = [];
  const context = vm.createContext({
    URLSearchParams, window: { location: { hash, search } },
    remotePasswordRecoveryPending: event,
    remoteDatabaseClient: { auth: { getSession: async () => ({ data: { session } }) } },
    state: { integration: {} }, normalizeIntegration: x => x, saveState() {},
    showLogin: () => calls.push('login'), openRemoteRecoveryModal: () => calls.push('recovery'),
    openResetPasswordModal: () => calls.push('request'), elements: { resetRequestError: {} },
    loadRemoteState: () => { throw new Error('Recovery must not load operational data'); },
  });
  vm.runInContext(source.slice(source.indexOf('async function bootstrap()'), source.indexOf('\nfunction initializeFloatingNavigation()')), context);
  return { context, calls };
}

for (const mode of [{ hash: '#type=recovery&access_token=fixture' }, { search: '?reset=1' }, { event: true }]) {
  test(`verified recovery opens password form before dashboard: ${JSON.stringify(mode)}`, async () => {
    const { context, calls } = bootstrapFixture(mode);
    await context.bootstrap();
    assert.deepEqual(calls, ['login', 'recovery']);
  });
}
test('missing or expired recovery session requests a new link', async () => {
  for (const mode of [{ search: '?reset=1', session: null }, { hash: '#error=access_denied&error_code=otp_expired' }]) {
    const { context, calls } = bootstrapFixture(mode);
    await context.bootstrap();
    assert.deepEqual(calls, ['login', 'request']);
    assert.match(context.elements.resetRequestError.textContent, /Minta pautan baru/);
  }
});
test('reset requests carry explicit recovery destination and successful save clears auth URL', () => {
  assert.match(source, /pathname\}\?reset=1/);
  assert.match(source, /onAuthStateChange\?\.\(\(event, session\)/);
  assert.match(source, /searchParams.delete\("reset"\)/);
  assert.match(source, /cleanUrl.hash = ""/);
});
