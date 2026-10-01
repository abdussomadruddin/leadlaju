// Mocked registration transport: no real accounts or emails are created.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.LEADLAJU_PLAYWRIGHT_MODULE || '/Users/abdussomad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.LEADLAJU_TEST_URL || 'http://127.0.0.1:8769';
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'leadlaju-registration-ui-'));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let checks = 0;
try {
  for (const [name, device] of [['desktop', { viewport: { width: 1366, height: 900 } }], ['iphone', devices['iPhone 13']], ['android', devices['Pixel 7']], ['small-phone', { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true }]]) {
    const context = await browser.newContext({ ...device, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    // Simulate only the static-host rewrite locally; production routing is checked after release.
    if (new URL(origin).hostname === '127.0.0.1') await page.route('**/daftar/**', r => r.request().isNavigationRequest() ? r.fulfill({ contentType: 'text/html', body: fs.readFileSync('index.html', 'utf8') }) : r.continue());
    await page.route('**/api/runtime-config', r => r.fulfill({ json: { backend: 'supabase', supabaseUrl: origin, supabasePublishableKey: 'fixture' } }));
    await page.route('https://esm.sh/@supabase/supabase-js@2.116.0', r => r.fulfill({ contentType: 'application/javascript', body: 'export const createClient=()=>window.__signupClient;' }));
    await page.addInitScript(() => {
      window.__signupCalls = [];
      window.__signupClient = { auth: { getSession: async () => ({ data: { session: null } }) }, functions: { invoke: async (name, { body }) => {
        window.__signupCalls.push(body);
        if (body.brand_slug === 'unknown') return { data: { ok: false, error: 'Brand tidak ditemui atau tidak aktif.' } };
        if (body.action === 'signup_request') return { data: { ok: false, error: 'Mock rejection: duplicate email' } };
        await new Promise(resolve => setTimeout(resolve, 200));
        return { data: { ok: true, brand: { name: body.brand_slug === 'safrich' ? 'Safrich' : 'Brand B', slug: body.brand_slug, distribution_mode: body.brand_slug === 'brand-b' ? 'team_sales' : 'agent' }, projects: [{ id: 'project-' + body.brand_slug, name: body.brand_slug === 'safrich' ? 'Safrich Project' : 'Brand B Project', active: true }] } };
      } } };
    });
    await page.goto(origin);
    await page.locator('#login-form').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#signup-form').isVisible(), false); checks++;
    assert.equal(await page.locator('#signup-login-button').isVisible(), false); checks++;
    assert.equal(await page.locator('text=Agent baru? Sign up').count(), 0); checks++;
    for (const [route, slug] of [['/daftar/safrich', 'safrich'], ['/daftar/brand-b', 'brand-b'], ['/?brand=safrich', 'safrich']]) {
      await page.goto(origin + route);
      await page.locator('#signup-form').waitFor({ state: 'visible' });
      await page.waitForFunction(() => !document.querySelector('#signup-form button[type=submit]').disabled);
      assert.equal(await page.locator('#login-form').isVisible(), false); checks++;
      assert.equal(await page.locator('#signup-project-checkboxes input').getAttribute('value'), 'project-' + slug); checks++;
      assert.equal(await page.evaluate(() => window.__signupCalls[0].brand_slug), slug); checks++;
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); checks++;
      assert.equal(await page.locator('.login-card').evaluate(el => getComputedStyle(el).fontFamily.length > 0), true); checks++;
      await page.screenshot({ path: path.join(artifacts, `${name}-${slug}.png`), fullPage: true });
      if (slug === 'brand-b') {
        assert.equal(await page.locator('#login-title').innerText(),'Daftar sebagai Team Sales'); checks++;
        assert.equal(await page.locator('.login-card > .section-kicker').textContent(),'Pendaftaran Team Sales'); checks++;
        await page.locator('#signup-name').fill('Test Agent'); await page.locator('#signup-phone').fill('60120000000');
        await page.locator('#signup-email').fill('fixture@example.test'); await page.locator('#signup-password').fill('fixture-password');
        await page.locator('#signup-confirm-password').fill('fixture-password'); await page.locator('#signup-project-checkboxes input').check();
        await page.locator('#signup-form button[type=submit]').click();
        await page.waitForFunction(() => window.__signupCalls.some(c => c.action === 'signup_request'));
        assert.equal(await page.evaluate(() => window.__signupCalls.find(c => c.action === 'signup_request').brand_slug), 'brand-b'); checks++;
        await page.waitForFunction(() => document.querySelector('#signup-form button[type=submit]').getAttribute('aria-busy') !== 'true');
        assert.match(await page.locator('#signup-error').innerText(), /duplicate email/); checks++;
      }
      await page.locator('#signup-login-button').click();
      assert.equal(new URL(page.url()).pathname, '/'); checks++;
      assert.equal(await page.locator('#login-form').isVisible(), true); checks++;
    }
    await page.goto(origin + '/daftar/unknown');
    await page.waitForFunction(() => document.querySelector('#signup-error').textContent.includes('Brand tidak'));
    assert.equal(await page.locator('#signup-project-checkboxes input').count(), 0); checks++;
    assert.equal(await page.locator('#signup-form button[type=submit]').isDisabled(), true); checks++;
    assert.deepEqual(errors, []); checks++;
    await context.close();
  }
  console.log(`PASS: ${checks} registration UI assertions. Mocked transport. Screenshots: ${artifacts}`);
} finally { await browser.close(); }
