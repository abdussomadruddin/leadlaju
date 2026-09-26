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

test('agent gate cannot be dismissed to reveal the app', () => {
  assert.match(app, /function closeNotificationReminder\(\)[\s\S]*getCurrentUser\(\)\?\.role === "agent"[\s\S]*requestLogout\(\)/);
  assert.match(css, /body\.agent-access-locked \.app-shell[\s\S]*pointer-events: none/);
  assert.match(html, /id="close-notification-reminder"[^>]*>Log keluar</);
});

test('admin remains exempt from the mandatory agent app gate', () => {
  assert.match(app, /if \(user\?\.role !== "agent"\)[\s\S]*classList\.remove\("agent-access-locked"\)/);
  assert.match(app, /const subscribed = isAdmin\(\)[\s\S]*syncPushSubscription\(true\)[\s\S]*verifyAgentPushAccess\(true\)/);
});

test('new cache version distributes the mandatory access gate', () => {
  assert.match(html, /20260926-lead-copy-v98/);
  assert.match(sw, /leadlaju-pwa-v20260926-lead-copy-v98/);
});
