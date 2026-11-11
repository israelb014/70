// Screenshot every screen/state at a given width. Usage: node shots-all.mjs <outdir> [width]
import { chromium } from 'playwright';
import { seedState } from './seed.mjs';
import { autoDetail, openCard } from './nav200.mjs';
const OUT = process.argv[2]; const W = Number(process.argv[3] || 412);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: W, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
autoDetail(page);
page.setDefaultTimeout(6000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('openfoodfacts') && !m.text().includes('Failed to load resource') && errors.push(m.text()));
await context.route('https://world.openfoodfacts.org/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ products: [
  { code: '7290000000011', product_name_he: 'גבינת שמנת עם זיתים', brands: 'מותג א', nutriments: { 'energy-kcal_100g': 180, proteins_100g: 7 } },
  { code: '7290000000012', product_name: 'Feta cheese', brands: 'מותג ב', nutriments: { 'energy-kcal_100g': 260, proteins_100g: 14 } }] }) }));
const APP = 'http://127.0.0.1:8765/70/';
const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name, full = false) => { await wait(900); await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); };
const overflow = [];
const checkOverflow = async (name) => { const w = await page.evaluate(() => document.documentElement.scrollWidth); if (w > W) overflow.push(`${name}:${w}`); };
const step = async (name, fn) => { try { await fn(); await checkOverflow(name); } catch (e) { console.log('skip', name, e.message.split('\n')[0]); } };

// Wizard (empty storage)
await page.goto(APP); await page.evaluate(() => localStorage.clear()); await page.reload();
await step('wizard', async () => {
  await page.waitForSelector('.wizard');
  for (let i = 1; i <= 8; i++) {
    await shot(`01-wizard-${i}`);
    if (i === 1) { await page.fill('[name=startWeight]', '95'); await page.fill('[name=targetWeight]', '85'); }
    if (i < 8) await page.click('[data-action=wiz-next]');
  }
  await page.click('[data-action=wiz-next]');
  await page.waitForSelector('.hero');
});
await step('today-empty', async () => { await shot('02-today-empty', true); });
await step('food-empty', async () => { await page.click('[data-tab=food]'); await shot('03-food-empty', true); });
await step('trends-empty', async () => { await page.click('[data-tab=trends]'); await shot('04-trends-empty', true); });

// Seeded
await page.evaluate((s) => localStorage.setItem('seventy.v1', JSON.stringify(s)), seedState());
await page.reload(); await page.waitForSelector('.hero');
await step('today-filled', async () => { await shot('05-today-top'); await shot('06-today-full', true); });
await step('toast', async () => { await page.click('[data-action=water-add][data-ml="250"]'); await wait(150); await page.screenshot({ path: `${OUT}/07-toast.png` }); });
await step('timer', async () => { await page.click('.ex-card:has(h2:text-is("פלאנק")) .ex-head'); await wait(400); await page.click('[data-action=timer]'); await wait(1200); await page.screenshot({ path: `${OUT}/08-timer.png` }); await page.click('.timer-overlay [data-t=cancel]'); await wait(400); });
await step('food', async () => { await page.click('[data-tab=food]'); await shot('09-food-filled', true); });
await step('search', async () => {
  await page.fill('[data-search]', 'גבינה'); await wait(250); await page.screenshot({ path: `${OUT}/10-search-loading.png` });
  await page.waitForSelector('[data-off-section] .food-result', { timeout: 4000 }).catch(() => {});
  await shot('11-search-results');
  await page.evaluate(() => document.querySelector('[data-off-section]')?.scrollIntoView()); await shot('12-search-web');
});
await step('amount', async () => { await page.click('.food-result >> nth=1'); await shot('13-amount-sheet'); await page.click('.sheet .btn.ghost'); await wait(400); });
await step('custom-form', async () => { await page.click('[data-action=food-new]'); await shot('14-custom-form'); await page.click('.sheet .btn.ghost'); await wait(400); });
await step('scan', async () => { await page.fill('[data-search]', ''); await page.click('[data-action=scan]'); await shot('15-scan'); await page.click('[data-s=close]'); await wait(400); });
for (const id of ['workout', 'steps', 'fluids', 'stairs', 'sleep', 'breath', 'rides', 'weight']) {
  await step('today-detail-' + id, async () => { await page.click('[data-tab=today]').catch(() => {}); await openCard(page, id); await shot('detail-today-' + id, true); });
}
await step('layout-home', async () => { await openCard(page, '@grid'); await page.click('[data-action=layout-edit]'); await shot('layout-home', true); await page.click('[data-action=back]'); await wait(300); });
await step('trends', async () => { await page.click('[data-tab=trends]'); await shot('16-trends-top'); await shot('17-trends-full', true); });
for (const id of ['heatmap', 'weight', 'steps', 'protein', 'fluids', 'sleep', 'stairs', 'rides', 'breath', 'kcal', 'records']) {
  await step('trends-detail-' + id, async () => { await openCard(page, id); await shot('detail-trends-' + id, true); });
}
await step('layout-trends', async () => { await openCard(page, '@grid'); await page.click('[data-action=layout-edit]'); await shot('layout-trends', true); await page.click('[data-action=back]'); await wait(300); });
await step('heatmap-tip', async () => { await openCard(page, 'heatmap'); await page.click('.hm-cell >> nth=-3'); await wait(300); await page.locator('.heatmap-card').screenshot({ path: `${OUT}/18-heatmap-tip.png` }); });
await step('achievements', async () => { await page.click('[data-tab=trends]'); await wait(200); await page.click('[data-tile=achievements] .tile-open'); await shot('19-achievements', true); });
await step('badge-sheet', async () => { await page.click('.badge-tile >> nth=0'); await shot('20-badge-sheet'); await page.click('.sheet .btn.ghost'); await wait(300); });
await step('settings', async () => { await page.click('[data-tab=settings]'); await shot('21-settings', true); });
await step('celebration', async () => {
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('seventy.v1')); s.meta.lastSeenLevel = 1; localStorage.setItem('seventy.v1', JSON.stringify(s)); });
  await page.reload(); await page.waitForSelector('.celebrate'); await wait(1500); await page.screenshot({ path: `${OUT}/22-celebration.png` });
});
console.log('overflow:', overflow.length ? overflow.join(' ') : 'none', '| errors:', errors.length ? errors : 'none');
await browser.close();
