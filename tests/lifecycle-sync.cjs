const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('styles.css', 'utf8');

function createClassList(initial = []) {
  const values = new Set(initial);
  return {
    add: (...items) => items.forEach((item) => values.add(item)),
    remove: (...items) => items.forEach((item) => values.delete(item)),
    contains: (item) => values.has(item),
    toggle: (item, force) => force ? values.add(item) : values.delete(item),
    values,
  };
}

function createLifecycleHarness() {
  const timers = [];
  const controls = [];
  const overlay = { classList: createClassList(), setAttribute() {} };
  const body = { classList: createClassList(['authenticated']) };
  const syncResolvers = [];
  let syncCalls = 0;
  const context = vm.createContext({
    Promise,
    console: { error() {} },
    elements: { lifecycleSyncOverlay: overlay },
    document: { body, querySelectorAll: () => controls },
    window: {
      clearTimeout() {},
      setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; },
    },
    showToast() {},
    syncGoogleSheetFresh() {
      syncCalls += 1;
      return new Promise((resolve) => syncResolvers.push(resolve));
    },
  });
  const start = source.indexOf('const LIFECYCLE_INTRO_DURATION_MS');
  const end = source.indexOf('\nfunction openLeadAvailabilityConfirmation', start);
  vm.runInContext(`
    let leadLajuIntroShown = false;
    let introRevealComplete = false;
    let initialDashboardSyncState = "idle";
    let resumeSyncPending = false;
    let lifecycleIntroTimer = null;
    let lifecycleHideTimer = null;
    let lifecycleSyncPromise = null;
  `, context);
  vm.runInContext(source.slice(start, end), context);
  vm.runInContext(`globalThis.lifecycleState = () => ({
    introShown: leadLajuIntroShown,
    introComplete: introRevealComplete,
    syncState: initialDashboardSyncState,
    resumePending: resumeSyncPending
  });`, context);
  return { context, timers, overlay, body, syncResolvers, syncCalls: () => syncCalls };
}

test('true cold start begins cinematic and authoritative sync in parallel with locked copy', () => {
  const harness = createLifecycleHarness();
  harness.context.beginColdStartSync();
  assert.equal(harness.syncCalls(), 1);
  assert.equal(harness.timers[0].delay, 3000);
  assert.equal(harness.overlay.classList.contains('cinematic'), true);
  assert.equal(harness.body.classList.contains('business-mutations-locked'), false);
  assert.match(html, />Sedang sync Lead Laju…</);
});

test('faster sync commits readiness immediately but waits only for cinematic reveal', () => {
  const harness = createLifecycleHarness();
  harness.context.beginColdStartSync();
  harness.context.completeLifecycleAuthoritativeRender();
  assert.equal(harness.context.lifecycleState().syncState, 'ready');
  assert.equal(harness.overlay.classList.contains('visible'), true);
  assert.equal(harness.body.classList.contains('business-mutations-locked'), false);
  harness.timers[0].callback();
  assert.equal(harness.overlay.classList.contains('visible'), false);
});

test('slower sync indicator disappears after three seconds while sync continues', () => {
  const harness = createLifecycleHarness();
  harness.context.beginColdStartSync();
  harness.timers[0].callback();
  assert.equal(harness.context.lifecycleState().syncState, 'pending');
  assert.equal(harness.overlay.classList.contains('visible'), false);
  harness.context.completeLifecycleAuthoritativeRender();
  assert.equal(harness.overlay.classList.contains('visible'), false);
  assert.equal(harness.body.classList.contains('business-mutations-locked'), false);
});

test('background resume skips cinematic and deduplicates related foreground requests', async () => {
  const harness = createLifecycleHarness();
  harness.context.beginColdStartSync();
  harness.context.completeLifecycleAuthoritativeRender();
  harness.timers[0].callback();
  harness.syncResolvers.shift()(true);
  await Promise.resolve();
  const first = harness.context.beginResumeSync();
  const second = harness.context.beginResumeSync();
  assert.equal(first, second);
  assert.equal(harness.syncCalls(), 2);
  assert.equal(harness.overlay.classList.contains('resume'), true);
  assert.equal(harness.overlay.classList.contains('cinematic'), false);
  const resumeTimer = harness.timers.find((timer) => timer.delay === 1000);
  assert.ok(resumeTimer);
  resumeTimer.callback();
  assert.equal(harness.overlay.classList.contains('visible'), false);
});

test('completed resume sync keeps its indicator visible until the one-second presentation ends', () => {
  const harness = createLifecycleHarness();
  harness.context.beginColdStartSync();
  harness.context.completeLifecycleAuthoritativeRender();
  harness.timers[0].callback();
  harness.syncResolvers.shift()(true);
  harness.context.beginResumeSync();
  harness.context.completeLifecycleAuthoritativeRender();
  assert.equal(harness.overlay.classList.contains('visible'), true);
  const resumeTimer = harness.timers.find((timer) => timer.delay === 1000);
  assert.ok(resumeTimer);
  resumeTimer.callback();
  assert.equal(harness.overlay.classList.contains('visible'), false);
  assert.equal(harness.overlay.classList.contains('resume'), true);
  const fadeTimer = harness.timers.at(-1);
  assert.equal(fadeTimer.delay, 180);
  fadeTimer.callback();
  assert.equal(harness.overlay.classList.contains('resume'), false);
});

test('sync indicator retains its compact mode throughout fade-out to prevent a fullscreen flicker', () => {
  const start = source.indexOf('function hideLifecycleSyncOverlay()');
  const end = source.indexOf('\nfunction settleLifecyclePresentation', start);
  const body = source.slice(start, end);
  assert.match(body, /classList\.remove\("visible"\)/);
  assert.match(body, /setTimeout\(\(\) =>/);
  assert.match(body, /classList\.remove\("cinematic", "waiting", "resume"\)/);
  assert.ok(body.indexOf('classList.remove("visible")') < body.indexOf('classList.remove("cinematic", "waiting", "resume")'));
  assert.match(css, /transition: opacity 180ms ease, visibility 0s linear 180ms/);
});

test('restored authenticated sessions skip the fullscreen cinematic on PWA reopen', () => {
  const start = source.indexOf('function startAuthenticatedApp(user, options = {})');
  const end = source.indexOf('\nfunction ', start + 1);
  const body = source.slice(start, end);
  assert.match(body, /if \(options\.restoredSession\) leadLajuIntroShown = true/);
  assert.match(source, /startAuthenticatedApp\(sessionUser, \{ restoredSession: true \}\)/);
  assert.match(source, /startAuthenticatedApp\(user, \{ freshLogin: true \}\)/);
  assert.match(source, /startAuthenticatedApp\(signedInUser, \{ freshLogin: true \}\)/);
});

test('multiple resumes keep the cinematic execution count at one', () => {
  const start = source.indexOf('function beginColdStartSync()');
  const end = source.indexOf('\nfunction openLeadAvailabilityConfirmation', start);
  const lifecycle = source.slice(start, end);
  assert.match(lifecycle, /leadLajuIntroShown = true/);
  assert.doesNotMatch(source.slice(source.indexOf('function beginResumeSync()'), end), /showLifecycleSyncOverlay\("cinematic"\)/);
  assert.match(source, /runtimeWasHidden[\s\S]*beginResumeSync\(\)/);
});

test('normal one-second polling stays silent and does not invoke lifecycle loading', () => {
  const start = source.indexOf('function scheduleSync()');
  const end = source.indexOf('\nfunction waitForCurrentSync', start);
  const body = source.slice(start, end);
  assert.match(source, /const DEFAULT_SYNC_INTERVAL_SECONDS = 1/);
  assert.match(body, /syncGoogleSheet\(\{ silent: true \}\)/);
  assert.doesNotMatch(body, /beginColdStartSync|beginResumeSync|showLifecycleSyncOverlay/);
});

test('push remains immediate during lifecycle loading and retains stale generation guards', () => {
  const messageStart = source.indexOf('navigator.serviceWorker.addEventListener("message"');
  const messageEnd = source.indexOf('\nwindow.addEventListener("beforeinstallprompt"', messageStart);
  const messageBody = source.slice(messageStart, messageEnd);
  assert.match(messageBody, /consumeAssignmentHandoff\(event\.data, timing\)/);
  assert.doesNotMatch(messageBody, /initialDashboardSyncState|introRevealComplete|await lifecycleSyncPromise/);
  assert.match(source, /authoritativeStateGeneration/);
  assert.match(source, /authoritativeLeadGenerations/);
  assert.match(source, /shouldIgnoreStaleSyncRow/);
  assert.match(source, /getLeadsRemovedBySync\(sheetKeys, syncStateGeneration\)/);
});

test('push around resume does not replay cinematic or change CALL NOW and Log Lead rendering', () => {
  const resumeStart = source.indexOf('function beginResumeSync()');
  const resumeEnd = source.indexOf('\nfunction openLeadAvailabilityConfirmation', resumeStart);
  const snapshotStart = source.indexOf('async function acceptAssignmentSnapshot');
  const snapshotEnd = source.indexOf('\nasync function showNotificationLeadImmediately', snapshotStart);
  assert.doesNotMatch(source.slice(resumeStart, resumeEnd), /cinematic/);
  assert.match(source.slice(snapshotStart, snapshotEnd), /renderAll\(\)/);
  assert.match(source.slice(snapshotStart, snapshotEnd), /APP_CALL_NOW_VISIBLE/);
  assert.match(source.slice(snapshotStart, snapshotEnd), /APP_LOG_LEAD_VISIBLE/);
});

test('initial failure ends presentation without disabling available buttons', () => {
  const harness = createLifecycleHarness();
  harness.context.beginColdStartSync();
  harness.context.failLifecycleSync();
  harness.timers[0].callback();
  assert.equal(harness.context.lifecycleState().syncState, 'failed');
  assert.equal(harness.overlay.classList.contains('visible'), false);
  assert.equal(harness.body.classList.contains('business-mutations-locked'), false);
  harness.context.completeLifecycleAuthoritativeRender();
  assert.equal(harness.context.lifecycleState().syncState, 'ready');
  assert.equal(harness.body.classList.contains('business-mutations-locked'), false);
});

test('real GET LEAD handler remains executable while authoritative sync is pending', async () => {
  const lifecycle = createLifecycleHarness();
  const start = source.indexOf('async function setAgentLeadAvailability(ready)');
  const end = source.indexOf('\nfunction enforceAgentNotificationAccess', start);
  vm.runInContext(source.slice(start, end), lifecycle.context);
  let userReads = 0;
  let mutationRequests = 0;
  const user = { id: 'agent-a', email: 'agent@example.com', role: 'agent', leadReady: true, online: true };
  const actionButton = { disabled: false, classList: createClassList(), setAttribute() {}, removeAttribute() {} };
  lifecycle.context.elements.getLeadButton = actionButton;
  lifecycle.context.elements.stopLeadButton = actionButton;
  lifecycle.context.Notification = { permission: 'granted' };
  lifecycle.context.getCurrentUser = () => { userReads += 1; return user; };
  lifecycle.context.setGlobalLoading = () => {};
  lifecycle.context.postGoogleSheetActionWithResponse = async () => { mutationRequests += 1; return { lead_ready: false }; };
  lifecycle.context.saveState = () => {};
  lifecycle.context.renderAll = () => {};
  lifecycle.context.openLeadAvailabilityConfirmation = () => {};
  lifecycle.context.syncGoogleSheet = () => Promise.resolve(true);
  lifecycle.context.beginColdStartSync();
  assert.equal(await lifecycle.context.setAgentLeadAvailability(false), true);
  assert.equal(userReads, 1);
  assert.equal(mutationRequests, 1);
  lifecycle.context.completeLifecycleAuthoritativeRender();
  assert.equal(await lifecycle.context.setAgentLeadAvailability(false), true);
  assert.equal(userReads, 2);
  assert.equal(mutationRequests, 2);
});

test('passive dashboard interaction is not globally disabled', () => {
  assert.doesNotMatch(css, /body\.business-mutations-locked\s*\{[^}]*pointer-events\s*:\s*none/s);
  assert.doesNotMatch(css, /body\.business-mutations-locked\s*\{[^}]*overflow\s*:\s*hidden/s);
  assert.doesNotMatch(css, /\.lifecycle-mutation-control/);
});

test('reduced motion preserves brand and copy while suppressing heavy animation', () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /animation: none !important/);
  assert.match(html, /<span>LEAD<\/span><span>LAJU<\/span>/);
  assert.match(html, />Sedang sync Lead Laju…</);
  assert.match(source, /beginColdStartSync\(\)[\s\S]*runLifecycleAuthoritativeSync\(\)/);
});

test('authoritative readiness is marked only after reconciliation cleanup commit and render', () => {
  const start = source.indexOf('async function syncGoogleSheet(options = {})');
  const end = source.indexOf('\nfunction scheduleSync()', start);
  const body = source.slice(start, end);
  const cleanup = body.indexOf('cleanupLocallyExpiredAssignments();');
  const committed = body.indexOf('saveState();', cleanup);
  const rendered = body.indexOf('renderAll();', committed);
  const ready = body.indexOf('completeLifecycleAuthoritativeRender();', rendered);
  assert.ok(body.indexOf('await addLead(row') < cleanup);
  assert.ok(cleanup < committed);
  assert.ok(committed < rendered);
  assert.ok(rendered < ready);
});
