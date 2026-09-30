const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('styles.css', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

test('agent access requires a phone, installed web app, permission and push subscription', () => {
  assert.match(app, /function getAgentAppAccessState\(\)[\s\S]*!isPhonePushDevice\(\)[\s\S]*!isInstalledApp\(\)[\s\S]*Notification\.permission !== "granted"[\s\S]*!agentPushAccessReady/);
  assert.match(app, /agentPushAccessReady = await syncPushSubscription\(force\)/);
});

test('agent gate has no logout control and cannot be dismissed to reveal the app', () => {
  assert.match(css, /body\.agent-access-locked \.app-shell[\s\S]*pointer-events: none/);
  const gate = html.slice(html.indexOf('id="notification-required-modal"'), html.indexOf('id="potential-reminder-modal"'));
  assert.doesNotMatch(gate, /Log keluar|close-notification-reminder/);
  assert.doesNotMatch(app, /function closeNotificationReminder\(/);
  assert.match(gate, /id="enable-required-notifications"/);
});

test('admin remains exempt from the mandatory agent app gate', () => {
  assert.match(app, /if \(user\?\.role !== "agent"\)[\s\S]*classList\.remove\("agent-access-locked"\)/);
  assert.match(app, /const subscribed = isAdmin\(\)[\s\S]*syncPushSubscription\(true\)[\s\S]*verifyAgentPushAccess\(true\)/);
});

test('new cache version distributes the mandatory access gate', () => {
  assert.match(html, /20260930-liquid-tabs-v115/);
  assert.match(sw, /leadlaju-pwa-v20260930-liquid-tabs-v115/);
});

test('manual refresh syncs in place without a page reload or icon flash', () => {
  const handler = app.slice(app.indexOf('elements.refreshButton?.addEventListener("click"'), app.indexOf('if ("serviceWorker" in navigator)', app.indexOf('elements.refreshButton?.addEventListener("click"')));
  assert.match(handler, /if \(button\.disabled\) return/);
  assert.match(handler, /await syncGoogleSheetFresh\(\{ silent: true \}\)/);
  assert.doesNotMatch(handler, /location\.reload/);
  assert.match(handler, /button\.classList\.remove\("is-syncing"\)/);
  assert.match(css, /\.refresh-button:disabled\s*\{[^}]*opacity: 1/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*\.refresh-button\.is-syncing svg\s*\{ animation: none/);
});
