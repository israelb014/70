import { chromium } from 'playwright';
import { autoDetail, openCard } from './nav200.mjs';
const SP = process.env.TEST_OUT || process.argv[2];
const APP = 'http://127.0.0.1:8765/70/';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await context.newPage();
autoDetail(page);
page.setDefaultTimeout(8000);
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
let fails = 0;
const step = async (label, fn) => { try { await fn(); console.log('OK  ', label); } catch (e) { fails++; console.log('FAIL', label, '-', e.message.split('\n').slice(0, 4).join(' | ')); } };
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('seventy.v1')));

// ---- Mock Open Food Facts search (the sandbox blocks the real API) ----
const offRequests = [];
let offMode = 'ok';
const P = (code, he, en, brand, kcal, prot, extra = {}) => ({ code, product_name_he: he, product_name: en, brands: brand, nutriments: { 'energy-kcal_100g': kcal, proteins_100g: prot }, ...extra });
await context.route('https://world.openfoodfacts.org/**', (route) => {
  const u = new URL(route.request().url());
  const israel = u.searchParams.get('tag_0') === 'israel';
  offRequests.push({ q: u.searchParams.get('search_terms'), israel });
  if (offMode === 'error') return route.fulfill({ status: 500, body: 'err' });
  const products = israel
    ? [P('7290000000011', 'גבינת שמנת עם זיתים', 'Cream cheese olives', 'מותג א', 180, 7, { serving_quantity: 30 }),
       P('7290000000012', '', 'Feta cheese', 'מותג ב', 260, 14),
       { code: '7290000000013', product_name: 'No kcal cheese', nutriments: { proteins_100g: 10 } }]
    : [P('7290000000012', '', 'Feta cheese', 'מותג ב', 260, 14),
       { code: '3000000000014', product_name: 'Gouda', brands: 'X', nutriments: { energy_100g: 1464, proteins_100g: 25 } },
       P('3000000000015', '', 'Cheddar', 'Y', 400, 25)];
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: products.length, products }) });
});

await page.goto(APP);
await page.evaluate(() => localStorage.setItem('seventy.v1', JSON.stringify({
  schemaVersion: 4,
  settings: { coach: { enabled: false }, theme: 'flame', startWeight: 90, targetWeight: 80, proteinTarget: 150, stepsTarget: 10000, rideGoalKm: 45, climbsTarget: 6, floorsRegular: 6, floorsRoof: 10, sleepTarget: 8, waterTarget: 2500 },
  exercises: [], mealPresets: [], days: {}, weights: [],
  customFoods: [{ id: 'c1', name: 'גבינה של סבתא', barcode: null, kcal100: 200, protein100: 12, servingGrams: null }],
  foodMemory: {}, meta: { lastSeenLevel: 1, seenBadges: [] },
})));
await page.reload();
await page.click('[data-tab=food]');

const dbNames = async (q) => {
  await page.fill('[data-search]', q);
  await page.waitForSelector('[data-results] .add-row');
  return page.$$eval('[data-results] .res-section', (secs) => {
    const out = {};
    for (const s of secs) out[s.querySelector('.res-title').childNodes[0].textContent.trim()] = [...s.querySelectorAll('.food-result strong')].map((e) => e.textContent);
    return out;
  });
};
const expectIn = (list, pred, label) => { if (!list || !list.some(pred)) throw new Error(`${label}: ${JSON.stringify(list?.slice(0, 8))}`); };

for (const [q, want] of [
  ['פתי בר', (n) => n.startsWith('פתי בר')],
  ['ביסקוויט', (n) => n.startsWith('ביסקוויט')],
  ['סקי', (n) => n.includes('סקי')],
  ['סמבוסק בשר', (n) => n === 'סמבוסק בוכרי עם בשר'],
  ['סמבוסה', (n) => n.startsWith('סמבוסק')],
  ['מלאווח', (n) => n === 'מלאווח'],
  ['שווארמה', (n) => n.startsWith('שווארמה')],
  ['שווארמע', (n) => n.startsWith('שווארמה')],
  ['במבה', (n) => n === 'במבה'],
]) {
  await step(`search "${q}" → built-in result`, async () => {
    const r = await dbNames(q);
    expectIn(r['מהמאגר'], want, q);
    console.log('       ', (r['מהמאגר'] || []).slice(0, 4).join(' · '));
  });
}
await step('search "גבינה": own product first, סקי + many cheeses, web section from mocked OFF', async () => {
  offRequests.length = 0;
  const r = await dbNames('גבינה');
  const titles = await page.$$eval('[data-results] .res-title', (e) => e.map((x) => x.childNodes[0].textContent.trim()));
  if (titles[0] !== 'המוצרים שלי' || r['המוצרים שלי'][0] !== 'גבינה של סבתא') throw new Error('own first ' + titles);
  expectIn(r['מהמאגר'], (n) => n.includes('סקי'), 'ski');
  if (r['מהמאגר'].length < 15) throw new Error('few cheeses ' + r['מהמאגר'].length);
  await page.waitForSelector('[data-off-section] .food-result');
  const web = await page.$$eval('[data-off-section] .food-result', (e) => e.map((x) => x.querySelector('strong').textContent + '|' + (x.querySelector('.xs')?.textContent || '')));
  // israel: 2 valid (1 w/o kcal skipped) → <5 → worldwide appended, duplicate skipped → 4
  if (web.join(',') !== 'גבינת שמנת עם זיתים|מותג א,Feta cheese|מותג ב,Gouda|X,Cheddar|Y') throw new Error(web.join(','));
  const order = await page.$$eval('[data-results] > *', (e) => e.map((x) => x.dataset.offSection !== undefined ? 'web' : x.classList.contains('add-row') ? 'add' : x.querySelector('.res-title')?.childNodes[0].textContent.trim()).filter(Boolean));
  if (order.join(',') !== 'המוצרים שלי,מהמאגר,web,add') throw new Error(order.join(','));
  if (offRequests.length !== 2 || !offRequests[0].israel || offRequests[1].israel) throw new Error(JSON.stringify(offRequests));
  await page.screenshot({ path: `${SP}/50-search.png` });
  await page.locator('[data-off-section]').screenshot({ path: `${SP}/51-web-section.png` });
});
await step('debounce + cancel: fast typing → only final query hits OFF', async () => {
  offRequests.length = 0;
  for (const q of ['ק', 'קו', 'קוט', 'קוטג']) await page.fill('[data-search]', q);
  await page.waitForTimeout(900);
  const qs = [...new Set(offRequests.map((r) => r.q))];
  if (qs.join(',') !== 'קוטג') throw new Error(JSON.stringify(qs));
});
await step('1-char query does not call OFF', async () => {
  offRequests.length = 0;
  await page.fill('[data-search]', 'ג'); await page.waitForTimeout(700);
  if (offRequests.length) throw new Error('called');
});
await step('selecting a web result saves it to "המוצרים שלי" and adds via amount sheet (kJ→kcal)', async () => {
  await dbNames('גבינה');
  await page.waitForSelector('[data-off-section] .food-result');
  await page.click('[data-off-section] .food-result:has-text("Gouda")');
  await page.waitForSelector('.sheet [name=amount]');
  await page.fill('.sheet [name=amount]', '50');
  const kcal = await page.textContent('[data-calc=kcal]');
  if (kcal !== '175') throw new Error('kcal ' + kcal); // 1464 kJ/4.184 = 350/100 g
  await page.click('.sheet .btn.primary'); await page.waitForTimeout(400);
  const s = await state();
  const c = s.customFoods.find((x) => x.barcode === '3000000000014');
  if (!c || c.name !== 'Gouda · X' || c.kcal100 !== 350) throw new Error(JSON.stringify(c));
  const entry = Object.values(s.days)[0].food.at(-1);
  if (entry.name !== 'Gouda · X' || entry.kcal !== 175 || entry.source !== 'barcode') throw new Error(JSON.stringify(entry));
});
await step('web result with serving_quantity offers a "מנה" unit', async () => {
  await dbNames('גבינה');
  await page.waitForSelector('[data-off-section] .food-result');
  await page.click('[data-off-section] .food-result:has-text("גבינת שמנת עם זיתים")');
  await page.waitForSelector('.sheet .unit-chip:has-text("מנה")');
  await page.click('.sheet .btn.ghost'); await page.waitForTimeout(300);
  if (!(await state()).customFoods.some((x) => x.barcode === '7290000000011')) throw new Error('not saved on select');
});
await step('"לא מצאת? הוסף מאכל" prefills the name and saves to own products + day', async () => {
  await dbNames('קציצות של אמא');
  await page.click('[data-action=food-new]');
  await page.waitForSelector('.sheet [name=name]');
  if (await page.inputValue('.sheet [name=name]') !== 'קציצות של אמא') throw new Error('not prefilled');
  await page.fill('.sheet [name=kcal100]', '210'); await page.fill('.sheet [name=protein100]', '14'); await page.fill('.sheet [name=amount]', '150');
  await page.click('.sheet .btn.primary'); await page.waitForTimeout(400);
  const s = await state();
  if (!s.customFoods.some((c) => c.name === 'קציצות של אמא')) throw new Error('not in own');
  const e = Object.values(s.days)[0].food.at(-1);
  if (e.name !== 'קציצות של אמא' || e.kcal !== 315 || e.source !== 'custom') throw new Error(JSON.stringify(e));
  const r = await dbNames('קציצות של');
  if (r['המוצרים שלי']?.[0] !== 'קציצות של אמא') throw new Error('not first');
});
await step('OFF error → web section hidden silently', async () => {
  offMode = 'error';
  await dbNames('חלב');
  await page.waitForTimeout(800);
  if (await page.isVisible('[data-off-section]')) throw new Error('visible');
  offMode = 'ok';
});
await step('settings about line: counts per source + build date', async () => {
  await page.click('[data-tab=settings]');
  await page.waitForFunction(() => document.querySelector('[data-db-about]')?.textContent.includes('פריטים'));
  const t = await page.textContent('[data-db-about]');
  console.log('        ', t.trim());
  if (!/6,092 פריטים/.test(t) || !t.includes("מצמרת") || !t.includes("מתוויות מוצרים") || !t.includes("נבנה")) throw new Error(t);
});
await step('food DB cached (stale-while-revalidate) → offline search works, web hidden, no OFF call', async () => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); await page.waitForTimeout(600);
  // First search in a session controlled by the service worker → foods.json goes through it.
  await page.click('[data-tab=food]'); await dbNames('במבה'); await page.waitForTimeout(800);
  const cached = await page.evaluate(async () => !!(await (await caches.open('seventy-data')).match('./data/foods.json')));
  if (!cached) throw new Error('not in data cache');
  await context.setOffline(true);
  offRequests.length = 0;
  await page.reload();
  await page.click('[data-tab=food]');
  const r = await dbNames('פתי בר');
  expectIn(r['מהמאגר'], (n) => n === 'פתי בר', 'offline');
  await page.waitForTimeout(700);
  if (await page.isVisible('[data-off-section]')) throw new Error('web visible offline');
  if (offRequests.length) throw new Error('OFF called offline');
  await context.setOffline(false);
});
await step('no horizontal overflow at 412px', async () => {
  const out = [];
  for (const t of ['today', 'food', 'trends', 'settings']) {
    await page.click(`[data-tab=${t}]`); await page.waitForTimeout(250);
    if (t === 'food') { await dbNames('גבינה'); await page.waitForTimeout(700); }
    out.push(`${t}:${await page.evaluate(() => document.documentElement.scrollWidth)}`);
  }
  console.log('        ', out.join(' '));
  if (out.some((o) => !o.endsWith(':412'))) throw new Error(out.join(' '));
});
console.log('errors:', errors.length ? errors : 'none');
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
await browser.close();
