// Mocked Auth transport only; never changes a real user's password or sends mail.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.LEADLAJU_PLAYWRIGHT_MODULE || '/Users/abdussomad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.LEADLAJU_TEST_URL || 'http://127.0.0.1:8769';
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'leadlaju-recovery-ui-'));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let checks = 0;
try {
  for (const [name, device] of [['desktop', { viewport: { width: 1366, height: 900 } }], ['iphone', devices['iPhone 13']], ['android', devices['Pixel 7']]]) {
    for (const mode of ['recovery', 'expired', 'request']) {
      const context = await browser.newContext({ ...device, serviceWorkers: 'block', reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.route('**/api/runtime-config', r => r.fulfill({ json: { backend: 'supabase', supabaseUrl: origin, supabasePublishableKey: 'fixture' } }));
      await page.route('https://esm.sh/@supabase/supabase-js@2.116.0', r => r.fulfill({ contentType: 'application/javascript', body: 'export const createClient=()=>window.__recoveryClient;' }));
      await page.addInitScript(({ mode }) => {
        window.__updates = 0; window.__requests = []; window.__failUpdate = true;
        window.__recoveryClient = { auth: {
          onAuthStateChange() {},
          getSession: async () => ({ data: { session: mode === 'recovery' && !window.__resetComplete ? { user: { id: 'fixture' } } : null } }),
          updateUser: async () => { window.__updates++; if (!window.__failUpdate) window.__resetComplete = true; return { error: window.__failUpdate ? { message: 'Mock failure' } : null }; },
          resetPasswordForEmail: async (email, options) => { window.__requests.push({ email, ...options }); return { error: null }; },
        } };
      }, { mode });
      await page.goto(`${origin}/${mode === 'request' ? '' : '?reset=1'}`);
      if (mode === 'request') {
        await page.locator('#forgot-password-button').click();
        await page.locator('#reset-email').fill('fixture@example.test');
        await page.locator('#reset-request-form button[type=submit]').click();
        await page.waitForFunction(() => window.__requests.length === 1);
        assert.equal(await page.evaluate(() => window.__requests[0].redirectTo), `${origin}/?reset=1`); checks++;
      } else {
        await page.locator('#reset-password-modal.open').waitFor();
        assert.equal(await page.locator('#app-shell').getAttribute('aria-hidden'), 'true'); checks++;
        if (mode === 'expired') {
          assert.match(await page.locator('#reset-request-error').innerText(), /Minta pautan baru/); checks++;
          assert.equal(await page.locator('#reset-verify-form').isVisible(), false); checks++;
        } else {
          assert.equal(await page.locator('#reset-verify-form').isVisible(), true); checks++;
          assert.equal(await page.locator('#reset-code-fields').isVisible(), false); checks++;
          await page.locator('#reset-new-password').fill('fixture-password');
          await page.locator('#reset-confirm-password').fill('fixture-mismatch');
          await page.locator('#reset-verify-form button[type=submit]').click();
          assert.equal(await page.evaluate(() => window.__updates), 0); checks++;
          await page.locator('#reset-confirm-password').fill('fixture-password');
          await page.locator('#reset-verify-form button[type=submit]').click();
          await page.waitForFunction(() => window.__updates === 1);
          assert.match(await page.locator('#reset-verify-error').innerText(), /tidak dapat/); checks++;
          await page.screenshot({ path: path.join(artifacts, `${name}-recovery.png`), fullPage: true });
          await page.evaluate(() => { window.__failUpdate = false; });
          await page.locator('#reset-verify-form button[type=submit]').click();
          await page.waitForFunction(() => window.__resetComplete && location.search === '');
          assert.equal(await page.locator('#reset-password-modal').getAttribute('aria-hidden'), 'true'); checks++;
          assert.equal(await page.evaluate(() => window.__updates), 2); checks++;
        }
      }
      assert.deepEqual(errors, []); checks++;
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); checks++;
      await context.close();
    }
  }
  console.log(`PASS: ${checks} recovery UI assertions; mocked Auth, desktop/iPhone/Android. Screenshots: ${artifacts}`);
} finally { await browser.close(); }
