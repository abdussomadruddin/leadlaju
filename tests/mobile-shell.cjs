const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

test('phone navigation has four primary views and a separate More drawer', () => {
  const nav = html.slice(html.indexOf('<nav class="mobile-bottom-nav"'), html.indexOf('</nav>', html.indexOf('<nav class="mobile-bottom-nav"')));
  assert.deepEqual([...nav.matchAll(/class="mobile-tab(?: active)?" data-view="([^"]+)"/g)].map((match) => match[1]), [
    'dashboard', 'leads', 'follow-up-due', 'appointments',
  ]);
  assert.match(nav, /id="mobile-more-tab"/);
  assert.match(app, /elements\.mobileMoreTab\.addEventListener\("click"/);
  assert.match(css, /\.mobile-bottom-nav \{[^}]*position: fixed/);
});

test('More drawer lists primary views again in compact non-stretching rows', () => {
  const sidebar = html.slice(html.indexOf('<aside class="sidebar"'), html.indexOf('</aside>', html.indexOf('<aside class="sidebar"')));
  for (const view of ['dashboard', 'leads', 'follow-up-due', 'appointments']) {
    assert.match(sidebar, new RegExp(`class="nav-item(?: active)?" data-view="${view}"`));
  }
  assert.match(sidebar, /class="mobile-more-heading">Menu<\/p>/);
  assert.match(css, /\.sidebar \.main-nav \{[^}]*display: flex;[^}]*flex-direction: column;[^}]*align-items: stretch;/);
  assert.match(css, /\.sidebar \.nav-item \{[^}]*min-height: 42px;[^}]*flex: none;/);
  assert.doesNotMatch(css, /\.sidebar \.nav-item\[data-view="dashboard"\][^}]*display: none/);
});

test('view history uses same-document entries and Back restores the prior view', () => {
  assert.match(app, /window\.history\[historyMode === "replace" \? "replaceState" : "pushState"\]/);
  assert.match(app, /window\.addEventListener\("popstate", \(event\) => \{/);
  assert.match(app, /switchView\(event\.state\?\.leadLajuView \|\| getRequestedStartView\(\), \{ historyMode: "none" \}\)/);
  assert.match(app, /if \(!changed && historyMode !== "replace"\)/);
  assert.match(app, /Date\.now\(\) - state\.followUpLoadedAt > 30000/);
  assert.match(app, /Date\.now\(\) - ownPerformanceLoadedAt > 300000/);
});

test('zoom is browser-friendly and only restricted for installed phone webapps', () => {
  assert.match(html, /content="width=device-width, initial-scale=1\.0, viewport-fit=cover"/);
  assert.match(app, /const installedPhone = isInstalledApp\(\) && isPhonePushDevice\(\)/);
  assert.match(app, /installedPhone \? "maximum-scale=1\.0, user-scalable=no, " : ""/);
  assert.match(css, /html\.installed-phone-app[\s\S]*touch-action: manipulation/);
  assert.doesNotMatch(css.match(/\nbody \{([^}]*)\}/)?.[1] || '', /touch-action: manipulation/);
});

test('phone shell respects safe area and reduced motion', () => {
  assert.match(css, /\.mobile-bottom-nav \{[^}]*env\(safe-area-inset-bottom/);
  assert.match(css, /\.lead-import-table-wrap \{ overflow: auto; \}/);
  assert.match(css, /\.lead-log-table \.lead-log-summary \.log-call-now-button \{ min-height: 46px; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.view\.active \{ animation: none/);
  assert.match(css, /@media \(prefers-reduced-transparency: reduce\)/);
});

test('agent phone dashboard keeps lead controls and personal performance prominent', () => {
  assert.match(html, /class="agent-dashboard-intro">Lead milik anda sahaja/);
  assert.match(html, /class="agent-lead-control-icon"/);
  assert.match(app, /class="mobile-dashboard-brand"/);
  assert.match(app, /classList\.toggle\("agent-dashboard", user\.role === "agent"\)/);
  assert.match(app, /classList\.toggle\("has-active-lead", Boolean\(lead\)\)/);
  assert.match(css, /\.agent-dashboard \.agent-lead-controls\.is-stopped \.stop-lead-button/);
  assert.match(css, /\.agent-dashboard \.agent-lead-controls\.is-ready \.get-lead-button/);
  assert.match(css, /\.agent-dashboard \.performance-metric:last-child \{ grid-column: 1 \/ -1/);
});
