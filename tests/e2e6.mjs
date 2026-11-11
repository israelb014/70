// Insights in the app + exports (browser).
import { chromium } from 'playwright';
import { autoDetail, openCard } from './nav200.mjs';
import { seedState } from './seed.mjs';
const SP = process.env.TEST_OUT || process.argv[2];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await ctx.newPage(); page.setDefaultTimeout(8000);
autoDetail(page);
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
let fails = 0; const step = async (l, fn) => { try { await fn(); console.log('OK  ', l); } catch (e) { fails++; console.log('FAIL', l, '-', e.message.split('\n')[0]); } };
const seed = seedState(); seed.meta = { lastSeenLevel: 99, seenBadges: ['first', 'streak7', 'streak14', 'streak30', 'proteinWeek', 'ride30', 'climbs100'] };
await page.goto('http://127.0.0.1:8765/70/');
await page.evaluate((s) => localStorage.setItem('seventy.v1', JSON.stringify(s)), seed);
await page.reload(); await page.waitForSelector('.hero');
const expected = await page.evaluate(async () => { const I = await import('./js/insights.js'); const D = await import('./js/dates.js'); return { day: I.dayInsights(D.todayKey()), week: I.weekInsights() }; });

await step('"היום": insight card shows the top day insight, up to 4 with dots', async () => {
  const items = await page.$$eval('[data-insights] .insight p', (e) => e.map((x) => x.textContent));
  if (items[0] !== expected.day[0].text || items.length !== Math.min(4, expected.day.length)) throw new Error(JSON.stringify(items));
  if (await page.locator('.insight-dots i').count() !== items.length) throw new Error('dots');
  const kinds = await page.$$eval('[data-insights] .insight', (e) => e.map((x) => x.className));
  if (!kinds[0].includes(`kind-${expected.day[0].kind}`)) throw new Error(kinds[0]);
});
await step('"היום": swiping moves to the next insight and updates the dots', async () => {
  await page.$eval('[data-insights]', (t) => { t.style.scrollBehavior = 'auto'; t.scrollLeft = -t.clientWidth - 12; t.dispatchEvent(new Event('scroll')); });
  await page.waitForTimeout(300);
  const on = await page.$$eval('.insight-dots i', (d) => d.findIndex((x) => x.classList.contains('on')));
  if (on !== 1) throw new Error('dot ' + on);
});
await step('"מגמות": all week insights with category icon and kind color', async () => {
  await page.click('[data-tab=trends]');
  const rows = await page.$$eval('.insight-list .insight', (e) => e.map((x) => ({ t: x.querySelector('p').textContent, c: x.className, color: getComputedStyle(x.querySelector('.insight-ic')).color, svg: !!x.querySelector('.insight-ic svg path') })));
  if (rows.length !== expected.week.length || rows.some((r, i) => r.t !== expected.week[i].text || !r.svg)) throw new Error(JSON.stringify(rows.map((r) => r.t)));
  const colorOf = { positive: 'rgb(74, 222, 128)', attention: 'rgb(255, 106, 0)', neutral: 'rgb(143, 149, 160)' };
  rows.forEach((r, i) => { if (r.color !== colorOf[expected.week[i].kind]) throw new Error(`${r.t}: ${r.color}`); });
});
await step('exports: daily "תובנות:" (≤4) before XP, weekly "תובנות השבוע:" (≤6) before level', async () => {
  await page.click('[data-action=copy-summary]'); await page.waitForTimeout(300);
  const w = await page.evaluate(() => navigator.clipboard.readText());
  const wl = w.split('\n'); const i = wl.indexOf('תובנות השבוע:'); const lvl = wl.findIndex((l) => l.startsWith('רמה נוכחית'));
  const bullets = wl.slice(i + 1, lvl - 1);
  if (i < 0 || bullets.length !== Math.min(6, expected.week.length) || bullets[0] !== `• ${expected.week[0].text}`) throw new Error(w.slice(-500));
  await page.click('[data-tab=today]'); await page.click('[data-action=copy-daily]'); await page.waitForTimeout(300);
  const d = await page.evaluate(() => navigator.clipboard.readText());
  const dl = d.split('\n'); const j = dl.indexOf('תובנות:'); const xp = dl.findIndex((l) => l.includes('XP היום'));
  if (j < 0 || xp !== j + Math.min(4, expected.day.length) + 2) throw new Error(d.slice(-400));
});
await step('empty states when no insight meets its minimum', async () => {
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('seventy.v1')); s.days = {}; s.weights = []; localStorage.setItem('seventy.v1', JSON.stringify(s)); });
  await page.reload(); await page.waitForSelector('.hero');
  if (!(await page.textContent('.insight-card')).includes('עוד כמה ימים של נתונים ונתחיל להציג תובנות')) throw new Error('today empty');
  await page.click('[data-tab=trends]');
  if (!(await page.textContent('.insights-week')).includes('עוד כמה ימים של נתונים')) throw new Error('trends empty');
  await page.click('[data-tab=today]'); await page.click('[data-action=copy-daily]'); await page.waitForTimeout(300);
  if ((await page.evaluate(() => navigator.clipboard.readText())).includes('תובנות')) throw new Error('export has empty section');
});
console.log('errors:', errors.length ? errors : 'none');
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
await b.close();
