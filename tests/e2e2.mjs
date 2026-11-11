import { chromium } from 'playwright';
import { autoDetail, openCard } from './nav200.mjs';
import fs from 'fs';
const SP = process.env.TEST_OUT || process.argv[2];
const URL = 'http://127.0.0.1:8765/70/';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, acceptDownloads: true });
const page = await context.newPage();
autoDetail(page);
await context.addInitScript(() => setInterval(() => document.querySelector('.celebrate [data-c=ok]')?.click(), 300));
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const shot = (n) => page.screenshot({ path: `${SP}/${n}.png`, fullPage: false });
let fails = 0;
const step = async (label, fn) => { try { await fn(); console.log('OK  ', label); } catch (e) { fails++; console.log('FAIL', label, e.message.split('\n')[0]); } };
const today = () => page.evaluate(() => { const x = new Date(); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; });

// ---- Seed v1 data ----
await page.goto(URL);
const T = await today();
const v1 = {
  schemaVersion: 1,
  settings: { coach: { enabled: false }, theme: 'flame', startWeight: 95, targetWeight: 85, height: null, proteinTarget: 150, stepsTarget: 12000, rideGoalKm: 45, climbsTarget: 6, floorsRegular: 6, floorsRoof: 10 },
  exercises: [{ id: 'e1', name: 'שכיבות סמיכה', type: 'setsReps', sets: 3, reps: 20, seconds: null, weight: null, order: 0, archived: false }],
  mealPresets: [{ id: 'm1', name: 'שייק', kcal: 250, protein: 40 }],
  days: { [T]: { rest: false, steps: 8000, climbs: [], rides: [], exercises: { e1: { sets: [{ reps: 20, weight: null, done: true }] } }, food: [{ name: 'ארוחה ישנה', kcal: 500, protein: 30 }] } },
  weights: [{ date: T, kg: 94 }],
};
await page.evaluate((d) => localStorage.setItem('seventy.v1', JSON.stringify(d)), v1);
await page.reload();
await page.waitForSelector('.hero');

await step('v1 → v2 migration keeps data', async () => {
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem('seventy.v1')));
  if (s.schemaVersion !== 4) throw new Error('version ' + s.schemaVersion);
  if (!Array.isArray(s.customFoods) || typeof s.foodMemory !== 'object') throw new Error('new fields');
  if (s.days[T].food[0].name !== 'ארוחה ישנה' || s.days[T].steps !== 8000 || s.weights.length !== 1 || s.exercises.length !== 1 || s.mealPresets.length !== 1) throw new Error('data lost');
});

await page.click('[data-tab=food]');
await step('old food entry still shown', async () => { await page.waitForSelector('.list-row:has-text("ארוחה ישנה")'); });

const search = async (q) => {
  await page.fill('[data-search]', '');
  await page.fill('[data-search]', q);
  await page.waitForFunction(() => document.querySelector('[data-results] .food-result, [data-results] p:not(:empty)'));
  await page.waitForTimeout(150);
  return page.$$eval('[data-results] .food-result strong', (els) => els.map((e) => e.textContent));
};
for (const [q, expect] of [['חזה עוף', 'חזה עוף'], ["קוטג'", "קוטג'"], ['קוטג', "קוטג'"], ['במבה', 'במבה'], ['בַּמְבָּה', 'במבה'], ['חזה עופ', 'חזה עוף'], ['גבינה לבנה', 'גבינה לבנה']]) {
  await step(`search "${q}"`, async () => {
    const r = await search(q);
    if (!r.length || !r[0].startsWith(expect)) throw new Error(JSON.stringify(r.slice(0, 3)));
    console.log('       ', r.length, 'results:', r.slice(0, 3).join(' | '));
  });
}
await search('חזה עוף');
await shot('10-search');

await step('amount sheet calc: 150 g חזה עוף צלוי → 248 kcal / 46.5 g', async () => {
  await page.click('.food-result:has-text("חזה עוף צלוי")');
  await page.waitForSelector('.sheet [name=amount]');
  await page.fill('.sheet [name=amount]', '150');
  const kcal = await page.textContent('[data-calc=kcal]');
  const prot = await page.textContent('[data-calc=protein]');
  if (kcal !== '248' || prot !== '46.5') throw new Error(`${kcal} / ${prot}`);
  // unit chip: "חזה שלם" 170 g, amount 1 → 281 kcal
  await page.click('.unit-chip:has-text("חזה שלם")');
  const k2 = await page.textContent('[data-calc=kcal]');
  if (await page.inputValue('.sheet [name=amount]') !== '1' || k2 !== '281') throw new Error('unit ' + k2);
  await page.fill('.sheet [name=amount]', '1.5');
  await shot('11-amount');
  await page.check('.sheet [name=preset]', { force: true });
  await page.click('.sheet .btn.primary');
  await page.waitForTimeout(500);
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem('seventy.v1')));
  const T2 = Object.keys(s.days)[0];
  const item = s.days[T2].food.at(-1);
  if (item.grams !== 255 || item.kcal !== 421 || item.protein !== 79.1 || item.source !== 'db') throw new Error(JSON.stringify(item));
  const mem = s.foodMemory['db:חזה עוף צלוי'];
  if (!mem || mem.amount !== 1.5 || mem.unit !== 'חזה שלם' || mem.count !== 1) throw new Error('memory ' + JSON.stringify(mem));
  if (!s.mealPresets.find((p) => p.name === 'חזה עוף צלוי' && p.kcal === 421)) throw new Error('preset');
});
await step('memory prefill + "most eaten" ranking', async () => {
  const r = await search('חזה');
  if (r[0] !== 'חזה עוף צלוי') throw new Error('rank ' + r[0]);
  await page.click('.food-result:has-text("חזה עוף צלוי")');
  await page.waitForSelector('.sheet [name=amount]');
  if (await page.inputValue('.sheet [name=amount]') !== '1.5') throw new Error('prefill');
  await page.click('.sheet .btn.ghost'); await page.waitForTimeout(350);
});

// ---- Barcode: real network (blocked here) → graceful fallback ----
await step('barcode 7290000066318 (live network) → found or graceful fallback', async () => {
  await page.click('[data-action=scan]');
  await page.waitForSelector('.scan-overlay');
  await page.waitForTimeout(400);
  await shot('12-scan');
  if (await page.isHidden('.scan-manual')) await page.click('[data-s=manual]');
  await page.fill('.scan-overlay [name=barcode]', '7290000066318');
  await page.click('[data-s=submit]');
  await page.waitForSelector('.sheet', { timeout: 15000 });
  const title = await page.textContent('.sheet-title');
  const notice = await page.$eval('.sheet', (e) => e.querySelector('.notice')?.textContent || '');
  console.log('        result:', title, '|', notice.trim().slice(0, 60));
  await shot('13-fallback');
  if (title === 'מוצר חדש') {
    if (await page.inputValue('.sheet [name=barcode]') !== '7290000066318') throw new Error('barcode not prefilled');
    await page.fill('.sheet [name=name]', 'מוצר בדיקה');
    await page.fill('.sheet [name=kcal100]', '200');
    await page.fill('.sheet [name=protein100]', '10');
    await page.fill('.sheet [name=amount]', '50');
    await page.click('.sheet .btn.primary');
  } else {
    await page.click('.sheet .btn.primary');
  }
  await page.waitForTimeout(500);
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem('seventy.v1')));
  if (!s.customFoods.find((c) => c.barcode === '7290000066318')) throw new Error('not saved to own products');
  const last = Object.values(s.days)[0].food.at(-1);
  if (last.source !== 'barcode') throw new Error('not added ' + JSON.stringify(last));
});
await step('second scan of same barcode → own product (no network)', async () => {
  await context.setOffline(true);
  await page.click('[data-action=scan]');
  if (await page.isHidden('.scan-manual')) await page.click('[data-s=manual]');
  await page.fill('.scan-overlay [name=barcode]', '7290000066318');
  await page.click('[data-s=submit]');
  await page.waitForSelector('.sheet [name=amount]');
  await page.click('.sheet .btn.ghost'); await page.waitForTimeout(350);
  await context.setOffline(false);
});

// ---- Barcode: mocked Open Food Facts response (network blocked in this sandbox) ----
await page.route('https://world.openfoodfacts.org/**', (route) => {
  const code = route.request().url().match(/product\/(\d+)/)[1];
  if (code === '111111111111') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 1, product: { product_name: 'Test Yogurt', product_name_he: 'יוגורט בדיקה', brands: 'מותג', nutriments: { energy_100g: 418.4, proteins_100g: 10 }, serving_quantity: 200 } }) });
  if (code === '222222222222') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 1, product: { product_name: 'Partial', nutriments: {} } }) });
  return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ status: 0 }) });
});
const scanCode = async (code) => {
  await page.click('[data-action=scan]');
  if (await page.isHidden('.scan-manual')) await page.click('[data-s=manual]');
  await page.fill('.scan-overlay [name=barcode]', code);
  await page.click('[data-s=submit]');
  await page.waitForSelector('.sheet', { timeout: 15000 });
};
await step('mocked OFF hit: he name, kJ→kcal, serving unit, editable name, auto-saved', async () => {
  await scanCode('111111111111');
  const name = await page.inputValue('.sheet [name=name]');
  if (!name.startsWith('יוגורט בדיקה')) throw new Error(name);
  await page.click('.unit-chip:has-text("מנה")');
  const k = await page.textContent('[data-calc=kcal]');
  if (k !== '200') throw new Error('kcal ' + k); // 418.4 kJ = 100 kcal/100g × 200 g
  await page.fill('.sheet [name=name]', 'יוגורט חלבון שלי');
  await page.click('.sheet .btn.primary'); await page.waitForTimeout(400);
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem('seventy.v1')));
  const c = s.customFoods.find((x) => x.barcode === '111111111111');
  if (!c || c.kcal100 !== 100 || c.servingGrams !== 200 || c.name !== 'יוגורט חלבון שלי') throw new Error(JSON.stringify(c));
});
await step('mocked OFF incomplete → prefilled manual form', async () => {
  await scanCode('222222222222');
  if (await page.textContent('.sheet-title') !== 'מוצר חדש') throw new Error('no form');
  if (await page.inputValue('.sheet [name=name]') !== 'Partial') throw new Error('name not prefilled');
  await page.click('.sheet .btn.ghost'); await page.waitForTimeout(350);
});
await step('mocked OFF not found → manual form', async () => {
  await scanCode('333333333333');
  const n = await page.textContent('.sheet .notice');
  if (!n.includes('לא נמצא')) throw new Error(n);
  await page.click('.sheet .btn.ghost'); await page.waitForTimeout(350);
});
await page.unroute('https://world.openfoodfacts.org/**');
await step('own products rank first in search', async () => {
  const r = await search('יוגורט');
  if (r[0] !== 'יוגורט חלבון שלי') throw new Error(r.slice(0, 2).join('|'));
  await page.fill('[data-search]', '');
});
await page.waitForTimeout(300);
await shot('14-food');

// ---- Settings: my products ----
await step('settings: edit + delete own product', async () => {
  await page.click('[data-tab=settings]');
  await page.click('.card:has(h2:text("המוצרים שלי")) [data-action=prod-edit] >> nth=0');
  await page.fill('.sheet [name=kcal100]', '123');
  await page.click('.sheet .btn.primary'); await page.waitForTimeout(400);
  if (!(await page.textContent('.card:has(h2:text("המוצרים שלי"))')).includes('123')) throw new Error('edit');
  const before = await page.locator('[data-action=prod-del]').count();
  await page.click('[data-action=prod-del] >> nth=-1');
  await page.click('.sheet .btn.danger'); await page.waitForTimeout(400);
  if (await page.locator('[data-action=prod-del]').count() !== before - 1) throw new Error('delete');
  await shot('15-settings');
});

// ---- Backup round-trip (v2) + v1 import ----
await step('backup v2 round-trip', async () => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-action=export]')]);
  const path = `${SP}/backup-v2.json`; await dl.saveAs(path);
  const before = await page.evaluate(() => localStorage.getItem('seventy.v1')); // includes the new meta.lastBackupAt
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('seventy.v1')); s.customFoods = []; localStorage.setItem('seventy.v1', JSON.stringify(s)); });
  await page.reload(); await page.click('[data-tab=settings]');
  await page.setInputFiles('[data-file]', path);
  await page.click('.sheet .btn.danger'); await page.waitForTimeout(500);
  const after = await page.evaluate(() => localStorage.getItem('seventy.v1'));
  const canon = (v) => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v;
  if (after !== before) { fs.writeFileSync(SP+'/a.json', after); fs.writeFileSync(SP+'/b.json', before); throw new Error('mismatch'); }
});
await step('import v1 backup file', async () => {
  fs.writeFileSync(`${SP}/backup-v1.json`, JSON.stringify(v1));
  await page.setInputFiles('[data-file]', `${SP}/backup-v1.json`);
  await page.click('.sheet .btn.danger'); await page.waitForTimeout(500);
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem('seventy.v1')));
  if (s.schemaVersion !== 4 || s.days[T].food[0].name !== 'ארוחה ישנה' || !Array.isArray(s.customFoods)) throw new Error('v1 import');
});

// ---- Offline ----
await step('offline: reload + food search works', async () => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); await page.waitForTimeout(500);
  await context.setOffline(true);
  await page.reload();
  await page.click('[data-tab=food]');
  const r = await search('במבה');
  if (!r.length) throw new Error('no results offline');
  await context.setOffline(false);
});
const cacheNames = await page.evaluate(() => caches.keys());
console.log('caches:', cacheNames);
console.log('manifest:', await page.evaluate(async () => { const m = await (await fetch('./manifest.json')).json(); return JSON.stringify({ id: m.id, start: m.start_url, scope: m.scope, icons: m.icons.map((i) => i.purpose + ':' + i.sizes) }); }));
console.log('errors:', errors.length ? errors : 'none');
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
await browser.close();
