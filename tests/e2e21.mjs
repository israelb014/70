// v3.0.0 Android app layer with a mocked Capacitor bridge (tests/capmock.js): platform branching, update
// banner, Health Connect rules + fallback, reminders, daily auto-backup, back button, shortcuts, native
// haptics / keep-awake / barcode / camera / backups, and the daily icon (activity-alias) setting.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = process.env.BASE || 'http://127.0.0.1:8765/70/';
const MOCK = fs.readFileSync(new URL('./capmock.js', import.meta.url), 'utf8');
const IMG = path.join(process.env.TEST_OUT || '.', 'img/small.jpg');
const b = await chromium.launch();
let fails = 0; const step = async (l, fn) => { try { await fn(); console.log('OK  ', l); } catch (e) { fails++; console.log('FAIL', l, '-', e.message.split('\n')[0]); } };
const errors = [];
const DAY = 86400000;
const key = (o = 0) => { const d = new Date(Date.now() - o * DAY); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const T = key(0);
const eq = (a, e, what) => { if (JSON.stringify(a) !== JSON.stringify(e)) throw new Error(`${what}: ${JSON.stringify(a)} ≠ ${JSON.stringify(e)}`); };
const SETTINGS = { coach: { enabled: false }, theme: 'flame', startWeight: 90, targetWeight: 80, proteinTarget: 150, stepsTarget: 10000, rideGoalKm: 45, climbsTarget: 6, floorsRegular: 6, floorsRoof: 10, sleepTarget: 8, waterTarget: 2500 };
const STATE = (days = {}, settings = {}, meta = {}) => ({
  schemaVersion: 4, settings: { ...SETTINGS, ...settings }, exercises: [{ id: 'e1', name: 'פלאנק', type: 'timed', sets: null, reps: null, seconds: 2, weight: null, order: 0, archived: false }],
  mealPresets: [], customFoods: [], foodMemory: {}, weights: [], photoSessions: [],
  meta: { lastSeenLevel: 99, seenBadges: [], lastBackupAt: new Date().toISOString(), appBannerDismissed: true, ...meta },
  days: Object.fromEntries(Object.entries(days).map(([o, d]) => [key(Number(o)), { rest: false, steps: null, climbs: [], rides: [], exercises: {}, food: [], sleep: null, naps: [], water: [], breathing: [], descents: [], ...d }])),
});

/** A page with (native) or without (web) the mocked bridge, seeded with `state`. */
async function open({ native = true, state = STATE(), init = {}, ctxOpts = {}, beforeGoto } = {}) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, ...ctxOpts });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text()) && errors.push(m.text()));
  await ctx.addInitScript(([s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('seventy.v1', s); sessionStorage.setItem('seeded', '1'); } }, [JSON.stringify(state)]);
  if (native) {
    await ctx.addInitScript((init) => { window.__capInit = init; }, init);
    await ctx.addInitScript(MOCK);
  }
  // No real GitHub calls from tests: the release check gets "no newer version" unless a test overrides it.
  await ctx.route('https://api.github.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tag_name: 'v3.0.0', assets: [] }) }));
  if (beforeGoto) await beforeGoto(ctx, p);
  await p.goto(BASE);
  await p.waitForTimeout(700);
  return { ctx, p };
}
const cap = (p, fn) => p.evaluate(fn);
const calls = (p, plugin, method) => p.evaluate(([pl, m]) => window.__cap.calls.filter((c) => c.plugin === pl && (!m || c.method === m)), [plugin, method]);
const mod = (p, file, fn, ...args) => p.evaluate(async ([file, fn, args]) => (await import(file))[fn](...args), [file, fn, args]);
const state = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('seventy.v1')));

await step('platform branching: web = no native class, service worker registered; native = no service worker, dark bars, StatusBar calls', async () => {
  const web = await open({ native: false });
  await web.p.waitForTimeout(800);
  eq(await web.p.evaluate(() => document.documentElement.classList.contains('native')), false, 'web class');
  eq(await web.p.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length > 0), true, 'web SW');
  eq(await mod(web.p, './js/native.js', 'isNative'), false, 'web isNative');
  await web.ctx.close();
  const nat = await open();
  eq(await nat.p.evaluate(() => document.documentElement.classList.contains('native')), true, 'native class');
  eq(await nat.p.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0, 'no SW');
  eq((await calls(nat.p, 'StatusBar', 'setStyle'))[0]?.options, { style: 'DARK' }, 'status bar style');
  eq((await calls(nat.p, 'StatusBar', 'setBackgroundColor'))[0]?.options, { color: '#0B0D10' }, 'status bar color');
  // Web-only banner never shows in the app
  await nat.p.evaluate(async () => { (await import('./js/storage.js')).updateMeta({ appBannerDismissed: undefined }); });
  await nat.p.click('.tab[data-tab=food]'); await nat.p.click('.tab[data-tab=today]'); await nat.p.waitForTimeout(300);
  if (await nat.p.$('[data-app-banner]')) throw new Error('migration banner in the app');
  await nat.ctx.close();
});

await step('web: one-time "יש עכשיו אפליקציה" banner with both backups + release link; "סגירה" hides it for good', async () => {
  const { ctx, p } = await open({ native: false, state: STATE({}, {}, { appBannerDismissed: undefined }) });
  eq((await p.textContent('[data-app-banner] strong')).trim(), 'יש עכשיו אפליקציה', 'title');
  if (!(await p.textContent('[data-app-banner]')).includes('כדי לעבור: גיבוי, גיבוי תמונות, ואז שחזור באפליקציה')) throw new Error('text');
  eq(await p.getAttribute('[data-app-banner] a', 'href'), 'https://github.com/israelb014/70/releases/latest', 'link');
  if (!(await p.$('[data-app-banner] [data-action=backup-now]')) || !(await p.$('[data-app-banner] [data-action=app-photos-backup]'))) throw new Error('buttons');
  await p.click('[data-action=app-banner-close]'); await p.waitForTimeout(250);
  if (await p.$('[data-app-banner]')) throw new Error('still shown');
  eq((await state(p)).meta.appBannerDismissed, true, 'stored');
  await p.reload(); await p.waitForTimeout(500);
  if (await p.$('[data-app-banner]')) throw new Error('back after reload');
  // Wizard: "שחזור תמונות" next to "יש לי גיבוי — שחזור"
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(400);
  eq(await p.$$eval('.wiz-restore-row .link-btn', (e) => e.map((x) => x.textContent.trim())), ['יש לי גיבוי — שחזור', 'שחזור תמונות'], 'wizard');
  await ctx.close();
});

await step('update banner: a newer GitHub Release → "גרסה חדשה זמינה" + download opens the APK link; throttled to 6 h; older/offline → nothing', async () => {
  let hits = 0;
  const { ctx, p } = await open({
    beforeGoto: async (c) => {
      await c.unroute('https://api.github.com/**');
      await c.route('https://api.github.com/repos/israelb014/70/releases/latest', (r) => { hits++; r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ tag_name: 'v99.0.0', html_url: 'https://github.com/israelb014/70/releases/tag/v99.0.0', assets: [{ name: '70-v99.0.0.apk', browser_download_url: 'https://github.com/israelb014/70/releases/download/v99.0.0/70-v99.0.0.apk' }] }) }); });
      await c.route('https://github.com/**', (r) => r.fulfill({ status: 200, body: 'apk' }));
    },
  });
  await p.waitForTimeout(400);
  eq(hits, 1, 'one check');
  eq((await p.textContent('[data-update-banner] strong')).trim(), 'גרסה חדשה זמינה', 'banner');
  if (!(await p.textContent('[data-update-banner]')).includes('99.0.0')) throw new Error('version');
  // Resume within 6 h: no second request
  await p.evaluate(() => window.__cap.fire('App', 'appStateChange', { isActive: true })); await p.waitForTimeout(300);
  eq(hits, 1, 'throttled');
  const [req] = await Promise.all([p.waitForRequest((r) => r.url().endsWith('.apk')), p.click('[data-action=app-update]')]);
  eq(req.url(), 'https://github.com/israelb014/70/releases/download/v99.0.0/70-v99.0.0.apk', 'apk url');
  await ctx.close();
  // Same version → no banner; offline → silent
  const same = await open();
  if (await same.p.$('[data-update-banner]')) throw new Error('banner for the same version');
  await same.ctx.close();
  const off = await open({ beforeGoto: async (c) => { await c.unroute('https://api.github.com/**'); await c.route('https://api.github.com/**', (r) => r.abort()); } });
  if (await off.p.$('[data-update-banner]')) throw new Error('offline banner');
  eq(await mod(off.p, './js/updates.js', 'newer', '3.0.10', '3.0.9'), true, 'semver');
  await off.ctx.close();
});

const hcDay = (o, h, m = 0) => { const d = new Date(Date.now() - o * DAY); d.setHours(h, m, 0, 0); return d.getTime(); };
await step('Health Connect: steps fill (manual edit wins), night sleep fills only when empty, daytime sessions → naps, cycling → rides (dedupe), never overwrite manual', async () => {
  const { ctx, p } = await open({ state: STATE({ 2: { steps: 5000, stepsManual: true }, 3: { sleep: { bed: '23:00', wake: '06:00' } }, 4: { rides: [{ km: 10, minutes: 30 }] } }) });
  const data = {
    steps: [{ date: key(1), count: 8123 }, { date: key(2), count: 9999 }, { date: key(20), count: 7000 }],
    sleep: [
      { id: 's1', startTime: hcDay(2, 23, 15) - DAY, endTime: hcDay(1, 6, 45) }, // night → day 1
      { id: 's2', startTime: hcDay(1, 14), endTime: hcDay(1, 14, 40) }, // nap → day 1
      { id: 's3', startTime: hcDay(4, 0) - 3600000, endTime: hcDay(3, 7) }, // night → day 3 (manual exists)
      { id: 's4', startTime: hcDay(1, 14, 20), endTime: hcDay(1, 15) }, // overlaps s2 → skipped
    ],
    exercise: [
      { id: 'r1', type: 'biking', startTime: hcDay(1, 17), endTime: hcDay(1, 18), distanceMeters: 21500 },
      { id: 'w1', type: 'walking', startTime: hcDay(1, 9), endTime: hcDay(1, 10), distanceMeters: 4000 },
      { id: 'r2', type: 'biking_stationary', startTime: hcDay(4, 8), endTime: hcDay(4, 8, 30), distanceMeters: 0 },
    ],
  };
  const n = await mod(p, './js/health.js', 'applyHealthData', data);
  const s = await state(p);
  eq([s.days[key(1)].steps, s.days[key(1)].stepsSource], [8123, 'hc'], 'steps filled');
  eq(s.days[key(2)].steps, 5000, 'manual steps win');
  eq(s.days[key(20)], undefined, 'older than 14 days ignored');
  eq(s.days[key(1)].sleep, { bed: '23:15', wake: '06:45' }, 'night sleep');
  eq(s.days[key(1)].sleepSource, 'hc', 'sleep source');
  eq(s.days[key(1)].naps, [{ start: '14:00', end: '14:40', hcId: 's2' }], 'nap, overlap skipped');
  eq(s.days[key(3)].sleep, { bed: '23:00', wake: '06:00' }, 'manual sleep kept');
  eq(s.days[key(1)].rides, [{ km: 21.5, minutes: 60, note: 'Health Connect', hcId: 'r1' }], 'ride');
  eq(s.days[key(4)].rides, [{ km: 10, minutes: 30 }], 'manual ride kept, no-distance session skipped');
  eq(n, 4, 'changes');
  eq(await mod(p, './js/health.js', 'applyHealthData', data), 0, 'second run: deduplicated');
  // A manual steps edit after the sync wins from then on
  await p.click('[data-tile=steps] .tile-open').catch(() => {});
  await p.evaluate(async (k) => { const st = await import('./js/storage.js'); st.updateDay(k, (d) => { d.steps = 100; d.stepsManual = true; }); }, key(1));
  await mod(p, './js/health.js', 'applyHealthData', data);
  eq((await state(p)).days[key(1)].steps, 100, 'later manual edit wins');
  // Backup round-trip keeps the markers
  const norm = await p.evaluate(async () => { const st = await import('./js/storage.js'); const s = st.getState(); return JSON.stringify(st.normalize(JSON.parse(JSON.stringify(s))).days) === JSON.stringify(s.days); });
  eq(norm, true, 'normalize keeps hc fields in order');
  await ctx.close();
});

await step('Health Connect: settings card connect + sync now + last sync; steps tile shows the source icon; sync on open', async () => {
  const data = { steps: [{ date: key(0), count: 4321 }], sleep: [], exercise: [] };
  const { ctx, p } = await open({ init: { hc: { available: true, granted: ['steps', 'sleep', 'exercise'], data } } });
  await p.click('.tab[data-tab=settings]'); await p.waitForTimeout(300);
  if (!(await p.textContent('[data-hc-card]')).includes('Samsung Health')) throw new Error('explanation line');
  await p.click('[data-action=hc-connect]'); await p.waitForTimeout(500);
  eq(await p.$$eval('.hc-types li.on span', (e) => e.map((x) => x.textContent)), ['צעדים', 'שינה', 'אימונים (אופניים)'], 'types');
  if (!(await p.textContent('[data-hc-sync]')).includes('סנכרון אחרון')) throw new Error('last sync');
  eq((await state(p)).days[T].steps, 4321, 'synced');
  await p.click('.tab[data-tab=today]'); await p.waitForTimeout(300);
  if (!(await p.$('[data-tile=steps] [data-src-hc]'))) throw new Error('source icon');
  // On resume it syncs again
  await p.evaluate((n) => { window.__cap.hc.data.steps = [{ date: n, count: 5000 }]; window.__cap.fire('App', 'appStateChange', { isActive: true }); }, T);
  await p.waitForTimeout(500);
  eq((await state(p)).days[T].steps, 5000, 'resume sync');
  await ctx.close();
});

await step('Health Connect missing or denied: everything manual, no errors', async () => {
  const { ctx, p } = await open({ init: { hc: { available: false, granted: [], data: {} } } });
  await p.click('.tab[data-tab=settings]'); await p.waitForTimeout(400);
  eq(await p.isVisible('[data-hc-missing]'), true, 'not installed note');
  await p.click('[data-action=hc-connect]'); await p.waitForTimeout(400);
  eq(await mod(p, './js/health.js', 'syncHealth'), 0, 'sync no-op');
  await p.click('.tab[data-tab=today]'); await p.click('[data-tile=steps] .tile-quick'); await p.waitForTimeout(200);
  eq((await state(p)).days[T].steps, 1000, 'manual still works');
  await ctx.close();
});

await step('reminders: sleep 08:00 only if not logged, water by pace 10–20 (off by default), summary 21:00, backup by the rule; replaced on schedule', async () => {
  const { ctx, p } = await open({ state: STATE({ 0: { water: [{ ml: 600, time: '09:00' }] } }) });
  const at = (h, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const plan = (iso) => p.evaluate(async (iso) => (await import('./js/reminders.js')).planReminders(new Date(iso)).map((n) => [n.id, n.title, new Date(n.at).getHours() + ':' + String(new Date(n.at).getMinutes()).padStart(2, '0')]), iso);
  let r = await plan(at(7));
  eq(r.filter((x) => x[1] === 'רישום שינה').map((x) => x[0]), [100, 101], 'sleep today + tomorrow');
  eq(r.find((x) => x[0] === 300), [300, 'סיכום יום', '21:00'], 'summary');
  eq(r.filter((x) => x[1] === 'שתייה').length, 0, 'water off by default');
  eq(r.some((x) => x[1] === 'גיבוי'), false, 'backup not due');
  // Logged sleep → no sleep reminder today
  await p.evaluate(async (k) => (await import('./js/storage.js')).updateDay(k, (d) => { d.sleep = { bed: '23:00', wake: '07:00' }; }), T);
  r = await plan(at(7));
  eq(r.filter((x) => x[1] === 'רישום שינה').map((x) => x[0]), [101], 'only tomorrow');
  // Water on: behind pace slots only (600 ml: 10:00 needs 357, 12:00 needs 714)
  await p.evaluate(async () => (await import('./js/storage.js')).updateSettings({ reminders: { water: { on: true } } }));
  r = await plan(at(9));
  eq(r.filter((x) => x[1] === 'שתייה' && x[0] < 210).map((x) => x[2]), ['12:00', '14:00', '16:00', '18:00', '20:00'], 'water today (10:00 is on pace)');
  eq(r.filter((x) => x[1] === 'שתייה' && x[0] >= 210).length, 6, 'tomorrow all slots');
  // Backup due → once
  await p.evaluate(async () => (await import('./js/storage.js')).updateMeta({ lastBackupAt: new Date(Date.now() - 9 * 864e5).toISOString() }));
  r = await plan(at(9));
  eq(r.filter((x) => x[1] === 'גיבוי').map((x) => x[2]), ['19:00'], 'backup');
  // Off switches
  await p.evaluate(async () => (await import('./js/storage.js')).updateSettings({ reminders: { sleep: { on: false }, summary: { on: false }, water: { on: false }, backup: { on: false } } }));
  eq((await plan(at(7))).length, 0, 'all off');
  // Scheduling replaces the pending set; inexact; app icon
  await p.evaluate(async () => (await import('./js/storage.js')).updateSettings({ reminders: {} }));
  await mod(p, './js/reminders.js', 'scheduleReminders');
  await mod(p, './js/reminders.js', 'scheduleReminders');
  const pend = await p.evaluate(() => window.__cap.pending.map((n) => ({ id: n.id, idle: n.schedule.allowWhileIdle, icon: n.smallIcon, body: n.body })));
  eq(new Set(pend.map((n) => n.id)).size, pend.length, 'no duplicates after rescheduling');
  if (!pend.every((n) => n.idle === false && n.icon === 'ic_stat_seventy')) throw new Error('inexact + icon');
  if (!pend.some((n) => n.body === 'הסיכום היומי מוכן')) throw new Error('summary text');
  // Settings card
  await p.click('.tab[data-tab=settings]'); await p.waitForTimeout(300);
  eq(await p.$$eval('.rem-card .check b', (e) => e.map((x) => x.textContent)), ['רישום שינה', 'שתייה', 'סיכום יום', 'גיבוי'], 'card rows');
  eq([await p.isChecked('[data-rem=sleep]'), await p.isChecked('[data-rem=water]'), await p.isChecked('[data-rem=summary]'), await p.isChecked('[data-rem=backup]')], [true, false, true, true], 'defaults');
  eq(await p.inputValue('[data-rem-time=sleep]'), '08:00', 'sleep time');
  await p.fill('[data-rem-time=summary]', '20:30'); await p.dispatchEvent('[data-rem-time=summary]', 'change'); await p.waitForTimeout(200);
  eq((await state(p)).settings.reminders.summary.time, '20:30', 'time saved');
  eq((await calls(p, 'LocalNotifications', 'checkPermissions')).length >= 1, true, 'permission asked');
  await ctx.close();
});

await step('daily auto-backup: once a day, last 7 kept; settings line "גיבוי אוטומטי אחרון: DD.MM.YYYY" + share the latest', async () => {
  const { ctx, p } = await open();
  const files = () => p.evaluate(() => [...window.__cap.fs.keys()].filter((k) => k.startsWith('DATA/backups/')).map((k) => k.split('/').pop()).sort());
  eq((await files()).length, 1, 'first open wrote one');
  eq(await mod(p, './js/autobackup.js', 'dailyAutoBackup'), false, 'not twice a day');
  for (let i = 1; i <= 9; i++) {
    const d = new Date(Date.now() + i * DAY); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    eq(await mod(p, './js/autobackup.js', 'dailyAutoBackup', k), true, `day +${i}`);
  }
  const f = await files();
  eq(f.length, 7, 'kept 7');
  const last = new Date(Date.now() + 9 * DAY);
  eq(f.at(-1), `70-auto-${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}.json`, 'newest kept');
  await p.click('.tab[data-tab=settings]'); await p.waitForTimeout(300);
  eq((await p.textContent('[data-auto-backup]')).trim(), `גיבוי אוטומטי אחרון: ${String(last.getDate()).padStart(2, '0')}.${String(last.getMonth() + 1).padStart(2, '0')}.${last.getFullYear()}`, 'line');
  await p.click('[data-action=auto-backup-share]'); await p.waitForTimeout(300);
  eq((await calls(p, 'Share', 'share')).length, 1, 'shared');
  // JSON export → Filesystem + share sheet
  await p.click('[data-action=export]'); await p.waitForTimeout(300);
  const w = (await calls(p, 'Filesystem', 'writeFile')).filter((c) => c.options.directory === 'CACHE');
  if (!w.length || !/^70-backup-\d{4}-\d{2}-\d{2}\.json$/.test(w.at(-1).options.path)) throw new Error('export write');
  eq((await calls(p, 'Share', 'share')).length, 2, 'export shared');
  await ctx.close();
});

await step('Android back: sheet → overlay → detail page → "היום" → exit', async () => {
  const { ctx, p } = await open();
  const back = () => p.evaluate(() => window.__cap.fire('App', 'backButton', {}));
  await p.click('[data-tile=fluids] .tile-open'); await p.waitForTimeout(250);
  await p.click('[data-action=water-other]'); await p.waitForSelector('.sheet');
  await back(); await p.waitForTimeout(400);
  if (await p.$('.sheet-backdrop')) throw new Error('sheet not closed');
  eq(await p.getAttribute('#app', 'data-detail'), 'fluids', 'still on the detail page');
  await back(); await p.waitForTimeout(300);
  eq(await p.getAttribute('#app', 'data-detail'), '', 'detail closed');
  await p.click('.tab[data-tab=trends]'); await p.waitForTimeout(200);
  await back(); await p.waitForTimeout(300);
  eq(await p.getAttribute('#app', 'data-tab'), 'today', 'to today');
  eq((await calls(p, 'App', 'exitApp')).length, 0, 'not exited yet');
  await back(); await p.waitForTimeout(200);
  eq((await calls(p, 'App', 'exitApp')).length, 1, 'exit');
  // Timer overlay closes first
  await p.click('[data-tile=workout] .tile-open'); await p.waitForTimeout(250);
  await p.click('.ex-card[data-exrow=e1] .ex-head'); await p.waitForTimeout(350);
  await p.click('[data-action=timer]'); await p.waitForSelector('.timer-overlay');
  eq((await calls(p, 'KeepAwake', 'keepAwake')).length >= 1, true, 'keep awake on');
  await back(); await p.waitForTimeout(400);
  if (await p.$('.timer-overlay')) throw new Error('timer still open');
  eq((await calls(p, 'KeepAwake', 'allowSleep')).length >= 1, true, 'keep awake off');
  eq(await p.getAttribute('#app', 'data-detail'), 'workout', 'detail stays');
  await ctx.close();
});

await step('app shortcuts: launch URL and appUrlOpen route to the ?action= actions (water → נוזלים page, food → search, scan → scanner)', async () => {
  const { ctx, p } = await open({ init: { launchUrl: 'seventy://action/water' } });
  await p.waitForTimeout(300);
  eq(await p.getAttribute('#app', 'data-detail'), 'fluids', 'water');
  await p.evaluate(() => window.__cap.fire('App', 'appUrlOpen', { url: 'seventy://action/food' })); await p.waitForTimeout(300);
  eq(await p.getAttribute('#app', 'data-tab'), 'food', 'food');
  eq(await p.evaluate(() => document.activeElement?.matches('[data-search]')), true, 'search focused');
  eq(await mod(p, './js/nativeApp.js', 'actionFromUrl', 'seventy://action/breathe'), 'breathe', 'breathe');
  eq(await mod(p, './js/nativeApp.js', 'actionFromUrl', 'https://evil.example/action/water'), null, 'other urls ignored');
  // Scan: ML Kit result goes straight to the product lookup
  await p.evaluate(() => window.__cap.fire('App', 'appUrlOpen', { url: 'seventy://action/scan' })); await p.waitForTimeout(600);
  eq((await calls(p, 'BarcodeScanner', 'scan')).length, 1, 'ML Kit scanner');
  await ctx.close();
});

await step('native haptics (3 presets), barcode fallback to typing, camera photos never saved to the gallery', async () => {
  const photo = fs.readFileSync(IMG).toString('base64');
  const { ctx, p } = await open({ init: { photo, barcode: '' } });
  await p.click('[data-tile=fluids] .tile-quick'); await p.waitForTimeout(200);
  const h = await calls(p, 'Haptics');
  if (!h.some((c) => c.method === 'impact' && c.options.style === 'LIGHT')) throw new Error('item haptic');
  await p.evaluate(async () => { const u = await import('./js/ui.js'); u.vibrate(u.HAPTIC.target); u.vibrate(u.HAPTIC.record); });
  const h2 = await calls(p, 'Haptics');
  if (!h2.some((c) => c.options.style === 'MEDIUM') || !h2.some((c) => c.method === 'notification')) throw new Error('target / record haptic');
  // Scanner cancelled → manual entry shown
  p.evaluate(async () => { window.__scan = await (await import('./js/scanner.js')).openScanner(); });
  await p.waitForSelector('.scan-overlay.manual, .scan-manual:not([hidden])');
  await p.fill('.scan-overlay [name=barcode]', '7290000000011'); await p.click('.scan-overlay [data-s=submit]'); await p.waitForTimeout(400);
  eq(await p.evaluate(() => window.__scan), '7290000000011', 'typed fallback');
  // Camera: base64 → File; saveToGallery false
  const f = await p.evaluate(async () => { const file = await (await import('./js/native.js')).getPhoto('camera'); return [file?.type, file?.size > 100]; });
  eq(f, ['image/jpeg', true], 'photo file');
  eq((await calls(p, 'Camera', 'getPhoto'))[0].options.saveToGallery, false, 'never to the gallery');
  await ctx.close();
});

await step('daily icon: off by default; when on, switches to the day\'s theme only on background and once a day; off → restores "להבה"', async () => {
  const { ctx, p } = await open({ state: STATE({}, { theme: 'auto' }) });
  const bg = () => p.evaluate(() => window.__cap.fire('App', 'appStateChange', { isActive: false }));
  await bg(); await p.waitForTimeout(200);
  eq((await calls(p, 'AppIcon', 'setActive')).length, 0, 'off: nothing to do');
  await p.click('.tab[data-tab=settings]'); await p.waitForTimeout(300);
  if (!(await p.textContent('.theme-card-wrap')).includes('בחלק מהטלפונים, כולל Samsung')) throw new Error('warning');
  await p.click('label:has([data-icon-daily])'); await p.waitForTimeout(200);
  eq((await state(p)).settings.iconDaily, true, 'saved');
  eq((await calls(p, 'AppIcon', 'setActive')).length, 0, 'never while in use');
  await bg(); await p.waitForTimeout(200);
  const want = await p.evaluate(async () => (await import('./js/theme.js')).themeFor(new Date()));
  const s1 = await calls(p, 'AppIcon', 'setActive');
  eq(s1.map((c) => c.options.name), want === 'flame' ? [] : [want], 'switched on background');
  await bg(); await p.waitForTimeout(200);
  eq((await calls(p, 'AppIcon', 'setActive')).length, s1.length, 'once a day');
  // Next day (new theme) after a switch today: waits for tomorrow
  await p.evaluate(async () => (await import('./js/storage.js')).updateSettings({ theme: 'cobalt' }));
  await bg(); await p.waitForTimeout(200);
  eq((await calls(p, 'AppIcon', 'setActive')).length, s1.length + (s1.length ? 0 : 1), 'max once a day');
  await p.click('label:has([data-icon-daily])'); await p.waitForTimeout(200);
  await bg(); await p.waitForTimeout(200);
  eq(await p.evaluate(() => window.__cap.icon), 'flame', 'restored default');
  await ctx.close();
});

console.log(errors.length ? 'errors: ' + errors.join(' | ') : 'errors: none');
await b.close();
if (errors.length) fails++;
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
