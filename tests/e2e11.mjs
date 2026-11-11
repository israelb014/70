// Update mechanism: install version A, deploy version B, open the app once → B runs, no manual action.
// Served by a GitHub-Pages-like server (Cache-Control: max-age=600) from a scratch copy of the app.
import { chromium } from 'playwright';
import { autoDetail, openCard } from './nav200.mjs';
import { execSync, spawn } from 'child_process';
import fs from 'fs';
const SRC = process.env.SRC || process.env.REPO_ROOT;
const DIR = `${process.env.TEST_OUT}/pages`;
const SITE = `${DIR}/70`;
const BASE = 'http://127.0.0.1:8766/70/';
let fails = 0; const step = async (l, fn) => { try { await fn(); console.log('OK  ', l); } catch (e) { fails++; console.log('FAIL', l, '-', e.message.split('\n')[0]); } };

const OLD = process.env.OLD === '1'; // run against the pre-1.6.3 mechanism (version in config.js + sw.js)
function deploy(v) {
  if (OLD) {
    execSync(`sed -i "s/APP_VERSION = '[^']*'/APP_VERSION = '${v}'/" ${SITE}/js/config.js`);
    execSync(`sed -i "s/CACHE_VERSION = '[^']*'/CACHE_VERSION = '${v}'/" ${SITE}/sw.js`);
  } else {
    fs.writeFileSync(`${SITE}/js/version.js`, fs.readFileSync(`${SITE}/js/version.js`, 'utf8').replace(/APP_VERSION = '[^']*'/, `APP_VERSION = '${v}'`));
  }
  // a visible code change too, so "new code runs" is checked, not just the constant
  execSync(`sed -i "s/data-deploy=\\"[^\\"]*\\"//; s/<body/<body data-deploy=\\"${v}\\"/" ${SITE}/index.html`);
}
fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });
fs.mkdirSync(SITE, { recursive: true });
for (const f of ["index.html", "sw.js", "manifest.json", "privacy.html", "css", "js", "icons", "data"]) execSync(`cp -r ${SRC}/${f} ${SITE}/`);
deploy('7.0.0');
const server = spawn('python3', [new URL('./pages_server.py', import.meta.url).pathname, DIR], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
const errors = [];
const watch = (p) => { p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && errors.push(m.text())); };
// The automatic reload can land mid-evaluate: retry until the page is settled.
const settledEval = async (p, fn) => {
  for (let i = 0; i < 20; i++) {
    try { await p.waitForLoadState('load'); return await p.evaluate(fn); } catch (e) { if (!/context was destroyed|navigat/i.test(e.message)) throw e; await p.waitForTimeout(300); }
  }
  throw new Error('page never settled');
};
const shown = async (p) => {
  await p.waitForSelector('#tabbar [data-tab="settings"]');
  await p.click('#tabbar [data-tab="settings"]');
  return (await p.textContent('.version bdi')).trim();
};
const waitVersion = async (p, v, ms = 15000) => {
  const t0 = Date.now(); let last = '';
  while (Date.now() - t0 < ms) {
    try { last = await shown(p); if (last === v && (await p.getAttribute('body', 'data-deploy')) === v) return; } catch { /* reloading */ }
    await p.waitForTimeout(300);
  }
  throw new Error(`still ${last} (body ${await p.getAttribute('body', 'data-deploy').catch(() => '?')})`);
};

let p = await ctx.newPage(); watch(p);
autoDetail(p);
await step('install version A (7.0.0): service worker controls the page, Settings shows 7.0.0', async () => {
  await p.goto(BASE);
  await p.evaluate(() => localStorage.setItem('seventy.v1', JSON.stringify({ schemaVersion: 4, settings: { coach: { enabled: false }, theme: 'flame', startWeight: 90, targetWeight: 80, proteinTarget: 150, stepsTarget: 10000, rideGoalKm: 45, climbsTarget: 6, floorsRegular: 6, floorsRoof: 10, sleepTarget: 8, waterTarget: 2500 }, exercises: [], mealPresets: [], customFoods: [], foodMemory: {}, weights: [], meta: { lastSeenLevel: 99, seenBadges: [], lastBackupAt: new Date().toISOString() }, days: {} })));
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload(); await p.waitForFunction(() => !!navigator.serviceWorker.controller);
  await waitVersion(p, '7.0.0');
  const keys = await p.evaluate(() => caches.keys());
  if (!keys.includes('seventy-7.0.0')) throw new Error(keys.join());
});
await p.close();

await step('deploy B (7.0.1) right after A (HTTP cache still fresh), open the app ONCE → 7.0.1, no manual action', async () => {
  deploy('7.0.1');
  p = await ctx.newPage(); watch(p);
  autoDetail(p);
  await p.goto(BASE);
  await waitVersion(p, '7.0.1');
  await p.waitForTimeout(1500);
  const keys = await settledEval(p, () => caches.keys());
  if (!keys.includes('seventy-7.0.1') || keys.includes('seventy-7.0.0')) throw new Error(keys.join());
  const cfg = await settledEval(p, async () => (await (await caches.open('seventy-7.0.1')).match('./js/' + (self.APP_VERSION ? 'version.js' : 'config.js'))).text());
  if (!cfg.includes('7.0.1')) throw new Error('new cache holds the old version file: ' + cfg);
});

await step('app kept open in the background, deploy C (7.0.2), back to the foreground → reloads once into 7.0.2', async () => {
  await p.waitForTimeout(10500); // past the 10 s loop guard of the previous automatic reload
  deploy('7.0.2');
  let loads = 0; p.on('load', () => loads++);
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); // returning to the foreground
  await waitVersion(p, '7.0.2');
  await p.waitForTimeout(2500);
  if (loads !== 1) throw new Error(`${loads} reloads`);
});

await step('loop guard: two activations within 10 s → no second automatic reload', async () => {
  let loads = 0; p.on('load', () => loads++);
  deploy('7.0.3');
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await p.waitForTimeout(5000);
  if (loads !== 0) throw new Error(`${loads} reloads within the guard window`);
  await p.reload(); await waitVersion(p, '7.0.3'); // the next open runs it anyway (network first)
});

await step('offline after the update: the app opens from the cache and still shows 7.0.3', async () => {
  await p.waitForTimeout(500);
  await ctx.setOffline(true);
  await p.reload(); await waitVersion(p, '7.0.3', 8000);
  const p2 = await ctx.newPage(); await p2.goto(BASE + '?action=water'); await waitVersion(p2, '7.0.3', 8000); await p2.close();
  autoDetail(p2);
  await ctx.setOffline(false);
});

console.log('errors:', errors.length ? errors : 'none');
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
await b.close();
server.kill();
