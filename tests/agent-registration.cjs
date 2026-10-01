const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const context = vm.createContext({ URL, URLSearchParams, window: { location: { origin: 'https://leadlaju.vercel.app' } } });
vm.runInContext(source.slice(source.indexOf('function registrationBrandSlug('), source.indexOf('\nconst signupBrandSlug')), context);
test('registration paths and legacy links select a brand, ordinary login does not', () => {
  for (const [pathname, search, expected] of [
    ['/', '', null], ['/daftar/safrich', '', 'safrich'], ['/daftar/brand-b/', '', 'brand-b'],
    ['/', '?brand=safrich', 'safrich'], ['/daftar', '', ''], ['/daftar/%E0', '', ''],
    ['/daftar/../../evil', '', ''], ['/daftar/unknown', '?brand=safrich', 'unknown'],
    ['/', '?brand=', ''], ['/daftar/Safrich', '', ''],
  ]) assert.equal(context.registrationBrandSlug({ pathname, search }), expected);
});
test('copy links use the brand slug and never default a missing brand to Safrich', () => {
  assert.equal(context.agentRegistrationUrl({ slug: 'safrich' }), 'https://leadlaju.vercel.app/daftar/safrich');
  assert.equal(context.agentRegistrationUrl({ slug: 'brand-b' }), 'https://leadlaju.vercel.app/daftar/brand-b');
  assert.equal(context.agentRegistrationUrl(null), '');
});
test('normal login has no signup CTA and management has the requested copy button', () => {
  assert.doesNotMatch(html, /Agent baru\? Sign up|id="signup-toggle"/);
  assert.match(html, /id="signup-login-button"[^>]*hidden/);
  assert.match(html, /id="copy-agent-registration-link"[^>]*>Link daftar agent/);
  const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  assert.ok(config.rewrites.some(r => r.source === '/daftar/:slug' && r.destination === '/index.html'));
});
test('signup project choices are isolated from cached operational projects', () => {
  const signup = source.slice(source.indexOf('function renderSignupProjectOptions('), source.indexOf('\nasync function handleLogin('));
  assert.match(signup, /signupProjects.filter/);
  assert.doesNotMatch(signup, /state.projects\s*=/);
  assert.match(signup, /signupBrandReady = false/);
  assert.match(signup, /submit.*disabled = true/);
  assert.match(source, /if \(!signupBrandSlug \|\| !signupBrandReady\)/);
});
