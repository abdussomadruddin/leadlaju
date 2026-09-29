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
