import { chromium } from 'playwright';
import { autoDetail, openCard } from './nav200.mjs';
import fs from 'fs';
import { expand, fillSetSheet, longPressSet, addRide, pickTime } from './helpers152.mjs';
const SP = process.env.TEST_OUT || process.argv[2];
const URL = 'http://127.0.0.1:8765/70/';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
autoDetail(page);
// Regression suite: auto-dismiss level-up celebrations (tested separately in e2e3).
await context.addInitScript(() => setInterval(() => document.querySelector('.celebrate [data-c=ok]')?.click(), 300));
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const shot = (n) => page.screenshot({ path: `${SP}/${n}.png`, fullPage: true });
const step = async (label, fn) => { try { await fn(); console.log('OK  ', label); } catch (e) { console.log('FAIL', label, e.message.split('\n')[0]); } };
const next = () => page.click('[data-action=wiz-next]');

await page.goto(URL);
await page.waitForSelector('.wizard');
await shot('01-wizard');
await step('wizard step1', async () => {
  await page.fill('[name=startWeight]', '95');
  await page.fill('[name=targetWeight]', '85');
  await next();
  await page.waitForSelector('[name=proteinTarget]');
  if (await page.inputValue('[name=proteinTarget]') !== '150') throw new Error('protein default');
});
await step('wizard steps 2-5', async () => {
  await next(); await page.waitForSelector('[name=stepsTarget]');
  await next(); await page.waitForSelector('[name=rideGoalKm]');
  await next(); await page.waitForSelector('[name=floorsRoof]');
  await next(); await page.waitForSelector('[name=sleepTarget]');
  if (await page.inputValue('[name=sleepTarget]') !== '8') throw new Error('sleep default');
  await next(); await page.waitForSelector('[data-action=ex-add]');
});
await step('add exercises', async () => {
  // sets x reps
  await page.click('[data-action=ex-add]');
  await page.fill('.sheet [name=name]', 'שכיבות סמיכה');
  await page.fill('.sheet [name=sets]', '3');
  await page.fill('.sheet [name=reps]', '20');
  await page.click('.sheet .btn.primary');
  await page.waitForTimeout(400);
  // timed
  await page.click('[data-action=ex-add]');
  await page.fill('.sheet [name=name]', 'פלאנק');
  await page.click('.sheet .segmented label:nth-child(2)');
  await page.fill('.sheet [name=seconds]', '2');
  await page.click('.sheet .btn.primary');
  await page.waitForTimeout(400);
  // max reps
  await page.click('[data-action=ex-add]');
  await page.fill('.sheet [name=name]', 'מתח');
  await page.click('.sheet .segmented label:nth-child(3)');
  await page.fill('.sheet [name=weight]', '5');
  await page.click('.sheet .btn.primary');
  await page.waitForTimeout(400);
  const n = await page.locator('.ex-row').count();
  if (n !== 3) throw new Error('rows ' + n);
  await shot('02-wizard-ex');
});
await step('finish wizard (exercises → breathing step, skippable with 5 → water step → done)', async () => { await next(); await page.waitForSelector('[name=breathGoal]'); if (await page.inputValue('[name=breathGoal]') !== '5') throw new Error('breath default'); await next(); await page.waitForSelector('[name=waterTarget]'); if (await page.inputValue('[name=waterTarget]') !== '2500') throw new Error('water default'); await next(); await page.waitForSelector('.hero'); });
await page.waitForTimeout(1200);
await shot('03-today-empty');
// New users get the smart coach (e2e20.mjs); this suite covers the manual mode and its target prompts.
await step('smart coach is on after the wizard; switched off for the manual-mode steps below', async () => {
  if (!(await page.$('.plan-card, [data-sleep-banner]'))) throw new Error('coach not on');
  await page.evaluate(async () => (await import('./js/storage.js')).updateSettings({ coach: { enabled: false, weights: [] } }));
  await page.reload(); await page.waitForTimeout(400);
});

await step('steps input', async () => {
  await page.fill('[data-change=steps]', '13000');
  await page.press('[data-change=steps]', 'Enter');
  await page.waitForTimeout(300);
});
await step('stairs', async () => {
  await page.click('[data-action=climb][data-type=regular]');
  await page.click('[data-action=climb][data-type=roof]');
  await page.click('[data-action=climb][data-type=regular]');
  await page.click('[data-action=climb-undo]');
  const t = await page.locator('.card:has(h2:text("מדרגות")) .stat-num').innerText();
  if (!t.includes('16')) throw new Error('floors ' + t);
});
await step('ride', async () => {
  await addRide(page, '32.5', '80', 'סיבוב בוקר');
  await page.waitForSelector('[data-action=ride-del]');
});
await step('sets tap', async () => {
  await expand(page, 'שכיבות סמיכה');
  for (let i = 0; i < 3; i++) await page.click(`[data-action=set][data-i="${i}"]`);
  await page.waitForSelector('.ex-card.complete');
});
await step('long press set -> edit 22 reps + weight -> update target', async () => {
  await page.waitForTimeout(700); // completed row auto-collapses
  await expand(page, 'שכיבות סמיכה');
  // Per-set sheet: each set gets 22 reps × 4 kg; the target prompt appears once all done sets agree.
  for (const i of [0, 1, 2]) {
    await longPressSet(page, i);
    await fillSetSheet(page, { reps: 22, weight: 4 });
    await page.click('.sheet .btn.primary');
    await page.waitForTimeout(500);
    if (i < 2 && await page.locator('.sheet-text').count()) throw new Error('target prompt before all sets agree');
  }
  await page.waitForSelector('.sheet-text');
  await shot('04-update-target');
  await page.click('.sheet .btn.primary');
  await page.waitForTimeout(500);
});
await step('timer', async () => {
  await expand(page, 'פלאנק');
  await page.click('[data-action=timer]');
  await page.waitForSelector('.timer-overlay');
  await page.waitForTimeout(500);
  await shot('05-timer');
  await page.waitForSelector('.timer-overlay', { state: 'detached', timeout: 6000 });
  await page.waitForTimeout(300);
});
await step('maxreps manual', async () => {
  await expand(page, 'מתח');
  const inp = page.locator('.ex-card:has(h2:text("מתח")) [data-manual]');
  await inp.fill('12');
  await page.click('.ex-card:has(h2:text("מתח")) [data-action=manual-save]');
  await page.waitForTimeout(400);
  const c = await page.locator('.ex-card.complete').count();
  if (c !== 3) throw new Error('complete ' + c);
  const pct = await page.locator('.hero .ring-big').innerText();
  if (!pct.includes('100')) throw new Error('pct ' + pct);
});
await page.waitForTimeout(1200);
await shot('06-today-full');

await step('previous day + rest + streak', async () => {
  await page.click('[data-action=date-prev]');
  await page.click('[data-action=rest]');
  await page.click('[data-action=date-next]');
  const s = await page.locator('.streak-num').innerText();
  if (s.trim() !== '2') throw new Error('streak ' + s);
  if (!(await page.locator('[data-action=date-next]').isDisabled())) throw new Error('future allowed');
});

await step('food', async () => {
  await page.click('[data-tab=food]');
  await page.fill('[data-f=name]', 'שייק חלבון');
  await page.fill('[data-f=kcal]', '250');
  await page.fill('[data-f=protein]', '40');
  await page.check('[data-f=save]', { force: true });
  await page.click('[data-action=food-add]');
  await page.waitForSelector('[data-action=preset-add]');
  await page.click('[data-action=preset-add]');
  const kc = await page.locator('.kcal').innerText();
  if (!kc.includes('500')) throw new Error('kcal ' + kc);
  await page.click('[data-action=food-del][data-i="1"]');
  await page.waitForTimeout(300);
  await shot('07-food');
});
await step('manage presets', async () => {
  await page.click('[data-action=presets-manage]');
  await page.waitForSelector('.sheet [data-pm=edit]');
  await page.click('.sheet [data-pm=edit]');
  await page.waitForSelector('.sheet [name=kcal]');
  await page.fill('.sheet [name=kcal]', '260');
  await page.click('.sheet .btn.primary');
  await page.waitForTimeout(500);
  await page.click('.sheet .btn.ghost');
  await page.waitForTimeout(400);
  if (!(await page.locator('.preset').innerText()).includes('260')) throw new Error('preset not updated');
});

await step('trends weight', async () => {
  await page.click('[data-tab=trends]');
  for (const [d, kg] of [[-10, 95], [-6, 94.4], [-3, 94.8], [0, 93.9]]) {
    await page.click('[data-action=weight-add]');
    await page.fill('.sheet [name=kg]', String(kg));
    const date = await page.evaluate((d) => { const x = new Date(); x.setDate(x.getDate() + d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; }, d);
    await page.fill('.sheet [name=date]', date);
    await page.click('.sheet .btn.primary');
    await page.waitForTimeout(350);
  }
  await page.waitForTimeout(1200);
  await shot('08-trends');
});
await step('copy summary', async () => {
  await page.click('[data-action=copy-summary]');
  await page.waitForTimeout(300);
  const txt = await page.evaluate(() => navigator.clipboard.readText());
  fs.writeFileSync(`${SP}/summary.txt`, txt);
  if (!txt.includes('סיכום שבועי')) throw new Error('clipboard');
});

let backupPath;
await step('settings export', async () => {
  await page.click('[data-tab=settings]');
  await page.waitForTimeout(500);
  await shot('09-settings');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-action=export]')]);
  backupPath = `${SP}/${dl.suggestedFilename()}`;
  await dl.saveAs(backupPath);
  console.log('     file', dl.suggestedFilename());
});
const before = await page.evaluate(() => localStorage.getItem('seventy.v1'));
await step('wipe (double confirm)', async () => {
  await page.click('[data-action=wipe]');
  await page.click('.sheet .btn.danger'); await page.waitForTimeout(400);
  await page.click('.sheet .btn.danger'); await page.waitForTimeout(400);
  await page.waitForSelector('.wizard');
});
await step('import after wipe (via wizard? no – settings hidden) -> set minimal settings first', async () => {
  // Wizard is shown after wipe; restore is in settings. Complete wizard quickly, then restore.
  await page.fill('[name=startWeight]', '80'); await page.fill('[name=targetWeight]', '70');
  for (let i = 0; i < 9; i++) { await next(); await page.waitForTimeout(150); }
  await page.click('[data-tab=settings]');
  await page.setInputFiles('[data-file]', backupPath);
  await page.waitForSelector('.sheet .btn.danger');
  await page.click('.sheet .btn.danger');
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => localStorage.getItem('seventy.v1'));
  if (JSON.stringify(JSON.parse(after)) !== JSON.stringify(JSON.parse(before))) {
    const diff = []; const walk = (x, y, path) => { if (JSON.stringify(x) === JSON.stringify(y)) return; if (x && y && typeof x === 'object' && typeof y === 'object') { for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], `${path}.${k}`); } else diff.push(`${path}: ${JSON.stringify(x)} → ${JSON.stringify(y)}`); };
    walk(JSON.parse(before), JSON.parse(after), '');
    throw new Error('round-trip mismatch ' + diff.slice(0, 5).join(' ; '));
  }
});
await step('invalid import rejected', async () => {
  fs.writeFileSync(`${SP}/bad.json`, '{"foo":1}');
  await page.setInputFiles('[data-file]', `${SP}/bad.json`);
  await page.waitForSelector('.sheet-title:text("שחזור נכשל")');
  await page.click('.sheet .btn.primary'); await page.waitForTimeout(400);
});

// Offline
await step('service worker + offline reload', async () => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); await page.waitForTimeout(800);
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.tabbar .tab');
  await page.click('[data-tab=today]');
  await page.waitForSelector('.hero');
  await context.setOffline(false);
});
const manifestOk = await page.evaluate(async () => { const r = await fetch('./manifest.json'); const m = await r.json(); return m.start_url === './' && m.scope === './'; });
console.log('manifest relative:', manifestOk);
console.log('dir:', await page.evaluate(() => getComputedStyle(document.body).direction));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
