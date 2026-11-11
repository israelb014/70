import { chromium } from 'playwright';
import { autoDetail, openCard } from './nav200.mjs';
import fs from 'fs';
import { expand, addRide, pickTime, fillSetSheet, longPressSet } from './helpers152.mjs';
const SP = process.env.TEST_OUT || process.argv[2];
const URL = 'http://127.0.0.1:8765/70/';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
autoDetail(page);
page.setDefaultTimeout(6000);
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const shot = (n, full = false) => page.screenshot({ path: `${SP}/${n}.png`, fullPage: full });
let fails = 0;
const step = async (label, fn) => { try { await fn(); console.log('OK  ', label); } catch (e) { fails++; console.log('FAIL', label, '-', e.message.split('\n').slice(0, 14).join(' | ')); } };
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('seventy.v1')));
// Count celebrations / badge toasts as they appear
await context.addInitScript(() => {
  window.__celebrations = 0; window.__toasts = [];
  const start = () => new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) if (n.classList?.contains('celebrate')) window.__celebrations++;
    const t = document.getElementById('toast');
    if (t && t.classList.contains('show')) { const txt = t.textContent.trim(); if (window.__toasts.at(-1) !== txt) window.__toasts.push(txt); }
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  if (document.documentElement) start(); else document.addEventListener('readystatechange', start, { once: true });
});

// ---------- Seed v2 data: 20 active days ending yesterday ----------
await page.goto(URL);
const keys = await page.evaluate(() => {
  const k = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const out = []; for (let i = 0; i <= 40; i++) { const d = new Date(); d.setDate(d.getDate() - i); out.push(k(d)); } return out; // out[0] = today
});
const T = keys[0];
const v2 = {
  schemaVersion: 2,
  settings: { coach: { enabled: false }, theme: 'flame', startWeight: 95, targetWeight: 85, height: null, proteinTarget: 150, stepsTarget: 12000, rideGoalKm: 45, climbsTarget: 6, floorsRegular: 6, floorsRoof: 10 },
  exercises: [
    { id: 'p', name: 'שכיבות סמיכה', type: 'setsReps', sets: 3, reps: 20, seconds: null, weight: null, order: 0, archived: false },
    { id: 'k', name: 'פלאנק', type: 'timed', sets: null, reps: null, seconds: 60, weight: null, order: 1, archived: false },
  ],
  mealPresets: [], customFoods: [{ id: 'c1', name: 'מוצר', barcode: '123456', kcal100: 100, protein100: 10, servingGrams: null }], foodMemory: { 'db:במבה': { amount: 1, unit: 'שקית', count: 2 } },
  days: {}, weights: [{ date: keys[15], kg: 94 }, { date: keys[3], kg: 93.2 }],
};
// Each seeded day: 3 sets done (6), 12000 steps (12), 3 regular climbs (9), protein met (10) = 37 XP. Not all exercises done.
for (let i = 1; i <= 20; i++) {
  v2.days[keys[i]] = { rest: false, steps: 12000, climbs: [{ type: 'regular', floors: 6 }, { type: 'regular', floors: 6 }, { type: 'regular', floors: 6 }], rides: [],
    exercises: { p: { sets: [1, 2, 3].map(() => ({ reps: 20, weight: null, done: true })) } }, food: [{ name: 'x', kcal: 600, protein: 150 }] };
}
v2.days[keys[25]] = { rest: true, steps: null, climbs: [], rides: [], exercises: {}, food: [] }; // isolated rest day
const SEED_XP = 20 * 37 + 2 * 5; // 750 → level 4 (600..999)
await page.evaluate((d) => localStorage.setItem('seventy.v1', JSON.stringify(d)), v2);
await page.reload();
await page.waitForSelector('.hero');
await page.waitForTimeout(800);

await step('v2 → v3 migration keeps all data + adds new fields', async () => {
  const s = await state();
  if (s.schemaVersion !== 4) throw new Error('version');
  if (s.settings.sleepTarget !== 8) throw new Error('sleepTarget');
  if (Object.keys(s.days).length !== 21 || s.weights.length !== 2 || s.customFoods.length !== 1 || s.foodMemory['db:במבה'].count !== 2 || s.exercises.length !== 2) throw new Error('data lost');
  if (s.days[keys[5]].steps !== 12000 || s.days[keys[5]].sleep !== null) throw new Error('day');
  if (s.meta.lastSeenLevel !== 4) throw new Error('lastSeenLevel ' + s.meta.lastSeenLevel);
  const want = ['first', 'streak7', 'streak14', 'proteinWeek'];
  if (want.some((b) => !s.meta.seenBadges.includes(b)) || s.meta.seenBadges.length !== 4) throw new Error('seenBadges ' + s.meta.seenBadges);
});
await step('first run: one summary toast, no celebration', async () => {
  const t = await page.evaluate(() => window.__toasts);
  const c = await page.evaluate(() => window.__celebrations);
  if (!t.some((x) => x.includes('נפתחו 4 תגים ורמה 4')) || c !== 0) throw new Error(JSON.stringify(t) + ' celebrations=' + c);
  await shot('20-today-top');
});
await step('reload: nothing shown again', async () => {
  await page.reload(); await page.waitForTimeout(800);
  const t = await page.evaluate(() => window.__toasts); const c = await page.evaluate(() => window.__celebrations);
  if (t.length || c) throw new Error(JSON.stringify(t) + ' ' + c);
});

const xpShown = async () => {
  await page.click('.level-chip');
  await page.waitForSelector('.level-card');
  const txt = await page.locator('.level-stats > div').first().locator('.stat-num').innerText();
  return Number(txt.replace(/[^\d]/g, ''));
};
await step(`achievements screen: total XP = ${SEED_XP}, 30 badges (incl. 4 breathing), level 4`, async () => {
  const xp = await xpShown();
  if (xp !== SEED_XP) throw new Error('xp ' + xp);
  if (await page.locator('.badge-tile').count() !== 30) throw new Error('badges');
  if (!(await page.locator('.level-card .ring-big').innerText()).includes('4')) throw new Error('level');
  const first3 = await page.$$eval('.badge-tile strong', (e) => e.slice(0, 3).map((x) => x.textContent));
  if (!first3.includes('רצף 14')) throw new Error('earned not first ' + first3);
  await shot('21-achievements', true);
  await page.click('.badge-tile >> nth=0');
  await page.waitForSelector('.badge-detail');
  await shot('22-badge-sheet');
  await page.click('.sheet .btn.ghost'); await page.waitForTimeout(300);
  await page.click('[data-action=back]');
  await page.waitForSelector('.hero');
});

await step('sleep crossing midnight: 23:30 → 06:50 = 7:20, +2 XP', async () => {
  await pickTime(page, '[data-sleep=bed]', '23:30');
  await pickTime(page, '[data-sleep=wake]', '06:50');
  await page.click('[data-action=sleep-save]');
  await page.waitForTimeout(400);
  const s = await state();
  if (JSON.stringify(s.days[T].sleep) !== '{"bed":"23:30","wake":"06:50"}') throw new Error(JSON.stringify(s.days[T].sleep));
  const inner = await page.locator('.card:has(h2:text("שינה")) .ring-mid').innerText();
  if (inner.trim() !== '7:20') throw new Error('ring ' + inner);
  if (await xpShown() !== SEED_XP + 2) throw new Error('xp');
  await page.click('[data-action=back]'); await page.waitForSelector('.hero');
  await page.locator('.card:has(h2:text("שינה"))').screenshot({ path: `${SP}/23-sleep.png` });
});
await step('sleep same-day + prefill on another day', async () => {
  await page.click('[data-action=date-prev]');
  if (await page.getAttribute('[data-sleep=bed]', 'data-value') !== '23:30') throw new Error('prefill');
  await pickTime(page, '[data-sleep=bed]', '01:00'); await pickTime(page, '[data-sleep=wake]', '08:15');
  await page.click('[data-action=sleep-save]'); await page.waitForTimeout(300);
  const inner = await page.locator('.card:has(h2:text("שינה")) .ring-mid').innerText();
  if (inner.trim() !== '7:15') throw new Error(inner);
  await page.click('[data-action=date-next]');
});

await step('edit a past day (5 days ago, +1 roof climb) → XP +5 recalculated', async () => {
  for (let i = 0; i < 5; i++) await page.click('[data-action=date-prev]');
  await page.click('[data-action=climb][data-type=roof]');
  await page.waitForTimeout(200);
  if (await xpShown() !== SEED_XP + 2 + 2 + 5) throw new Error('xp');
  await page.click('[data-action=back]'); await page.waitForSelector('.hero');
  await page.click('[data-action=date-today]').catch(() => {});
  // undo it again → back down
  for (let i = 0; i < 5; i++) await page.click('[data-action=date-prev]');
  await page.click('[data-action=climb-undo]');
  if (await xpShown() !== SEED_XP + 4) throw new Error('xp after undo');
  await page.click('[data-action=back]'); await page.waitForSelector('.hero');
  await page.click('[data-action=date-today]');
});

await step('new badge toast appears once (30 reps → "30 שכיבות")', async () => {
  await page.evaluate(() => { window.__toasts = []; });
  await expand(page, 'שכיבות סמיכה');
  await longPressSet(page, 0);
  await fillSetSheet(page, { reps: 30 });
  await page.click('.sheet .btn.primary');
  await page.waitForTimeout(900);
  await shot('24-badge-toast');
  const t = await page.evaluate(() => window.__toasts);
  if (t.filter((x) => x.includes('תג חדש: 30 שכיבות')).length !== 1) throw new Error(JSON.stringify(t));
  if (await page.locator('.sheet').count()) await page.click('.sheet .btn.ghost').catch(() => {}); // "update target?" → not now
  await page.waitForTimeout(400);
  await page.click('[data-tab=trends]'); await page.click('[data-tab=today]'); await page.reload(); await page.waitForTimeout(800);
  const t2 = await page.evaluate(() => window.__toasts);
  if (t2.some((x) => x.includes('30 שכיבות'))) throw new Error('shown again');
  if (!(await state()).meta.seenBadges.includes('pushups30')) throw new Error('not stored');
});

await step('level-up celebration appears once (steps 250,000 today → level 5)', async () => {
  await page.evaluate(() => { window.__celebrations = 0; });
  await page.fill('[data-change=steps]', '250000');
  await page.press('[data-change=steps]', 'Enter');
  await page.waitForSelector('.celebrate.open');
  await page.waitForTimeout(1700);
  await shot('25-celebrate');
  if (!(await page.locator('.celebrate-num').innerText()).includes('5')) throw new Error('level num');
  await page.click('.celebrate [data-c=ok]');
  await page.waitForTimeout(400);
  await page.fill('[data-change=steps]', '251000'); await page.press('[data-change=steps]', 'Enter');
  await page.click('[data-tab=food]'); await page.click('[data-tab=today]');
  await page.reload(); await page.waitForTimeout(800);
  const c = await page.evaluate(() => window.__celebrations);
  if (c !== 0) throw new Error('celebrations after reload ' + c);
  if ((await state()).meta.lastSeenLevel !== 5) throw new Error('lastSeenLevel');
  const lvl = await page.locator('.level-chip').innerText();
  if (!lvl.includes('5')) throw new Error('chip ' + lvl);
});

// ---------- Heatmap ----------
await page.click('[data-tab=trends]');
await page.waitForSelector('.hm-cell');
await step('heatmap: 365 cells, no future days, scrolled to newest', async () => {
  const n = await page.locator('.hm-cell').count();
  if (n !== 365) throw new Error('cells ' + n);
  const sc = await page.$eval('[data-hm-scroll]', (e) => ({ left: e.scrollLeft, max: e.scrollWidth - e.clientWidth }));
  if (!(sc.max > 0 && Math.abs(Math.abs(sc.left) - sc.max) < 2)) throw new Error(JSON.stringify(sc));
  // today's cell must be visible inside the scroller
  const vis = await page.$eval(`[data-day="${T}"]`, (c) => { const r = c.getBoundingClientRect(); const s = c.closest('[data-hm-scroll]').getBoundingClientRect(); return r.left >= s.left - 1 && r.right <= s.right + 1; });
  if (!vis) throw new Error('newest not visible');
  await page.locator('.heatmap-card').screenshot({ path: `${SP}/26-heatmap.png` });
});
await step('heatmap: scroll horizontally works', async () => {
  await page.$eval('[data-hm-scroll]', (e) => { e.scrollLeft = 0; });
  await page.waitForTimeout(800); // smooth scrolling
  const left = await page.$eval('[data-hm-scroll]', (e) => e.scrollLeft);
  if (left !== 0) throw new Error('scroll');
  await page.$eval('[data-hm-scroll]', (e) => { e.scrollLeft = -e.scrollWidth; });
  await page.waitForTimeout(800);
});
await step('heatmap colors match scores', async () => {
  // v3.0: cells use the theme accent (style fill); computed color under "להבה" = the orange at 75%
  const cell = (k) => page.$eval(`[data-day="${k}"]`, (c) => ({ fill: getComputedStyle(c).fill, stroke: c.getAttribute('stroke'), score: c.dataset.score }));
  // seeded day: exercises 0.5 (1 of 2), steps 1, climbs 0.5, protein 1 → 0.75 → 75% opacity
  const a = await cell(keys[10]);
  if (a.score !== '0.750' || !/255, 106, 0, 0\.75|srgb 1 0\.41\d* 0 \/ 0\.75/.test(a.fill)) throw new Error(JSON.stringify(a));
  const e = await cell(keys[30]);
  if (e.fill !== 'rgb(28, 32, 38)' || e.score !== '0.000') throw new Error(JSON.stringify(e));
  const r = await cell(keys[25]);
  if (r.fill !== 'rgb(28, 32, 38)' || r.stroke !== '#2DD4BF') throw new Error('rest ' + JSON.stringify(r));
  const td = await cell(T); // today: 250k+ steps (1) + 1 of 2 exercises done partially… just must be > 0.25
  console.log('        today score', td.score, td.fill);
  const stats = await page.$$eval('.heatmap-card .hm-stats .stat-num', (e) => e.map((x) => x.textContent));
  console.log('        active days / longest streak:', stats.join(' / '));
  if (stats[1] !== '21') throw new Error('longest streak ' + stats[1]);
});
await step('tooltip → opens that day in "היום"', async () => {
  await page.click(`[data-day="${keys[10]}"]`);
  await page.waitForSelector('[data-hm-tip]:not([hidden])');
  const t = await page.textContent('[data-hm-tip]');
  if (!t.includes('75%') || !t.includes('12,000')) throw new Error(t);
  await page.locator('.heatmap-card').screenshot({ path: `${SP}/27-tooltip.png` });
  await page.click('[data-hm-tip]');
  await page.waitForSelector('.hero');
  const h = await page.textContent('.date-nav h1');
  const expectLabel = await page.evaluate((k) => { const [y, m, d] = k.split('-').map(Number); return new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(y, m - 1, d)); }, keys[10]);
  if (h.trim() !== expectLabel) throw new Error(h + ' vs ' + expectLabel);
});

await step('trends: sleep chart + averages, achievements card', async () => {
  await page.click('[data-tab=trends]');
  const txt = await page.textContent('.card:has(h2:text("שינה · 7 ימים"))');
  if (!txt.includes('7:18') || !txt.includes('00:15')) throw new Error(txt.replace(/\s+/g, ' ').slice(0, 200)); // avg(7:20,7:15)=7:17.5→7:18 ; avg bed(23:30,01:00)=00:15
  await page.locator('.card:has(h2:text("שינה · 7 ימים"))').screenshot({ path: `${SP}/28-sleep-chart.png` });
  await shot('29-trends-top');
  await page.click('[data-tile=achievements] .tile-open'); await page.waitForSelector('.level-card');
  await page.click('[data-action=back]'); await page.waitForSelector('.heatmap-card');
});

await step('weekly summary has sleep, level, XP, badges', async () => {
  await page.click('[data-action=copy-summary]'); await page.waitForTimeout(300);
  const txt = await page.evaluate(() => navigator.clipboard.readText());
  fs.writeFileSync(`${SP}/summary3.txt`, txt);
  for (const s of ['שינה: ⁦7:20⁩ שעות (⁦23:30–06:50⁩)', 'רמה נוכחית: 5', 'XP השבוע:', 'תגים חדשים השבוע:', '30 שכיבות']) if (!txt.includes(s)) throw new Error('missing ' + s);
});

// ---------- Backup ----------
await step('backup v3 round-trip identical', async () => {
  await page.click('[data-tab=settings]');
  if (await page.inputValue('[data-setting=sleepTarget]') !== '8') throw new Error('settings sleep');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-action=export]')]);
  const path = `${SP}/backup-v3.json`; await dl.saveAs(path);
  const before = await page.evaluate(() => localStorage.getItem('seventy.v1')); // includes the new meta.lastBackupAt
  if (JSON.parse(fs.readFileSync(path, 'utf8')).meta.lastSeenLevel !== 5) throw new Error('meta not exported');
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('seventy.v1')); s.days = {}; localStorage.setItem('seventy.v1', JSON.stringify(s)); });
  await page.reload(); await page.click('[data-tab=settings]');
  await page.setInputFiles('[data-file]', path);
  await page.click('.sheet .btn.danger'); await page.waitForTimeout(600);
  const after = await page.evaluate(() => localStorage.getItem('seventy.v1'));
  if (after !== before) throw new Error('mismatch');
});
await step('import v2 file → migrated, summary toast', async () => {
  fs.writeFileSync(`${SP}/backup-v2b.json`, JSON.stringify(v2));
  await page.evaluate(() => { window.__toasts = []; });
  await page.setInputFiles('[data-file]', `${SP}/backup-v2b.json`);
  await page.click('.sheet .btn.danger'); await page.waitForTimeout(900);
  const s = await state();
  if (s.schemaVersion !== 4 || Object.keys(s.days).length !== 21 || s.meta.lastSeenLevel !== 4) throw new Error('v2 import ' + s.meta.lastSeenLevel);
  const t = await page.evaluate(() => window.__toasts);
  if (!t.some((x) => x.includes('נפתחו'))) throw new Error(JSON.stringify(t));
});

await step('offline: reload + heatmap + achievements', async () => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); await page.waitForTimeout(500);
  await context.setOffline(true);
  await page.reload();
  await page.click('[data-tab=trends]'); await page.waitForSelector('.hm-cell');
  await page.click('[data-tile=achievements] .tile-open'); await page.waitForSelector('.badge-tile');
  await context.setOffline(false);
});
console.log('caches:', await page.evaluate(() => caches.keys()));
console.log('errors:', errors.length ? errors : 'none');
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
await browser.close();
