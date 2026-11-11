// 1.5.2: ride sheet, exercise accordion, 24-hour time picker, one-line status.
import { chromium } from 'playwright';
import { autoDetail, openCard } from './nav200.mjs';
import { expand, addRide, pickTime } from './helpers152.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage(); page.setDefaultTimeout(8000);
autoDetail(page);
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
let fails = 0; const step = async (l, fn) => { try { await fn(); console.log('OK  ', l); } catch (e) { fails++; console.log('FAIL', l, '-', e.message.split('\n')[0]); } };
await page.goto('http://127.0.0.1:8765/70/');
const T = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
const EX = [
  { id: 'a', name: 'שכיבות סמיכה', type: 'setsReps', sets: 3, reps: 20, seconds: null, weight: 6, order: 0, archived: false },
  { id: 'b', name: 'פלאנק', type: 'timed', sets: null, reps: null, seconds: 60, weight: null, order: 1, archived: false },
  { id: 'c', name: 'מתח', type: 'maxReps', sets: null, reps: 10, seconds: null, weight: null, order: 2, archived: false },
  { id: 'd', name: 'כפיפות בטן', type: 'maxReps', sets: null, reps: null, seconds: null, weight: null, order: 3, archived: false },
  { id: 'e', name: 'סקוואט', type: 'setsReps', sets: 2, reps: 15, seconds: null, weight: null, order: 4, archived: false },
];
const sets = (n, w = 6) => ({ sets: Array.from({ length: n }, () => ({ reps: 20, weight: w, done: true })) });
const seed = async (day, exercises = EX) => {
  await page.evaluate(([T, day, exercises]) => localStorage.setItem('seventy.v1', JSON.stringify({ schemaVersion: 4,
    settings: { coach: { enabled: false }, theme: 'flame', startWeight: 90, targetWeight: 80, proteinTarget: 150, stepsTarget: 10000, rideGoalKm: 45, climbsTarget: 6, floorsRegular: 6, floorsRoof: 10, sleepTarget: 8, waterTarget: 2500 },
    exercises, mealPresets: [], customFoods: [], foodMemory: {}, weights: [], meta: { lastSeenLevel: 99, seenBadges: ['first'] },
    days: { [T]: { rest: false, steps: null, climbs: [], rides: [], exercises: {}, food: [], sleep: null, water: [], ...day } } })), [T, day, exercises]);
  await page.reload(); await page.waitForSelector('.hero');
};
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('seventy.v1')));
const status = () => page.textContent('.hero-status').then((t) => t.trim());

/* ---------- Status line ---------- */
const allEx = { a: sets(3), b: { seconds: 60 }, c: { reps: 10 }, d: { reps: 12 }, e: sets(2) };
const climbs = (n) => Array.from({ length: n }, () => ({ type: 'regular', floors: 6 }));
const water = (ml) => [{ ml, time: '10:00' }];
const food = (p) => [{ name: 'x', kcal: 900, protein: p }];
const cases = [
  ['exercises (plural)', {}, 'עוד 5 תרגילים'],
  ['exercises (singular)', { exercises: { ...allEx, e: sets(1) } }, 'עוד תרגיל אחד'],
  ['steps', { exercises: allEx, steps: 7400 }, 'עוד 2,600 צעדים'],
  ['steps (singular)', { exercises: allEx, steps: 9999 }, 'עוד צעד אחד'],
  ['climbs (plural, floors)', { exercises: allEx, steps: 10000, climbs: climbs(3) }, 'עוד 18 קומות'],
  ['climbs (singular, floors)', { exercises: allEx, steps: 10000, climbs: [...climbs(5), { type: 'custom', floors: 5 }] }, 'עוד קומה אחת'],
  ['protein', { exercises: allEx, steps: 10000, climbs: climbs(6), food: food(71) }, 'עוד 79 ג׳ חלבון'],
  ['water', { exercises: allEx, steps: 10000, climbs: climbs(6), food: food(150), water: water(1250) }, 'עוד 1.25 ל׳ נוזלים'],
  ['all done', { exercises: allEx, steps: 10000, climbs: climbs(6), food: food(150), water: water(2500) }, 'כל היעדים של היום הושגו'],
  ['rest day skips exercises', { rest: true, steps: 7400 }, 'עוד 2,600 צעדים'],
];
for (const [label, day, want] of cases) {
  await step(`status: ${label}`, async () => { await seed(day); const s = await status(); if (s !== want) throw new Error(`got "${s}"`); });
}
await step('status never wraps at 360px', async () => {
  await page.setViewportSize({ width: 360, height: 800 });
  await seed({ exercises: allEx, steps: 10000, climbs: climbs(6), food: food(150), water: water(2500) });
  const m = await page.$eval('.hero-status', (el) => ({ ws: getComputedStyle(el).whiteSpace, h: el.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(el).lineHeight), fits: el.scrollWidth <= el.clientWidth }));
  if (m.ws !== 'nowrap' || m.h > m.lh * 1.5 || !m.fits) throw new Error(JSON.stringify(m));
  await page.setViewportSize({ width: 412, height: 915 });
});

/* ---------- Accordion ---------- */
await step('rows: compact by default with status per type', async () => {
  await seed({ exercises: { a: sets(2), b: { seconds: 45 }, c: { reps: 8 } } });
  if (await page.locator('.ex-card.open').count()) throw new Error('something open');
  const rows = await page.$$eval('.ex-card', (els) => els.map((e) => `${e.querySelector('.ex-name').textContent}|${e.querySelector('.ex-status').textContent.replace(/\s+/g, ' ').trim()}|${e.querySelector('.ex-meta .muted').textContent.trim()}`));
  const want = ['שכיבות סמיכה|2/3 סטים|3×20 · 6 ק״ג', 'פלאנק|45/60 שנ׳|60 שניות', 'מתח|8/10 חזרות|סט אחד עד כשל · יעד 10', 'כפיפות בטן|טרם בוצע|סט אחד עד כשל', 'סקוואט|0/2 סטים|2×15'];
  if (rows.join('\n') !== want.join('\n')) throw new Error(JSON.stringify(rows));
  if (await page.isVisible('[data-action=set]')) throw new Error('controls visible while collapsed');
});
await step('expand / collapse, one open at a time, hint once', async () => {
  await expand(page, 'שכיבות סמיכה');
  if (!(await page.isVisible('.ex-card[data-exrow=a] [data-action=set]'))) throw new Error('not expanded');
  if (!(await page.isVisible('.ex-card[data-exrow=a] .set-hint'))) throw new Error('hint missing on first expanded');
  await expand(page, 'סקוואט');
  const open = await page.$$eval('.ex-card.open', (e) => e.map((x) => x.dataset.exrow));
  if (open.join() !== 'e') throw new Error('open: ' + open);
  if (await page.isVisible('.ex-card[data-exrow=e] .set-hint')) throw new Error('hint shown twice');
  await page.click('.ex-card[data-exrow=e] .ex-head'); await page.waitForTimeout(350);
  if (await page.locator('.ex-card.open').count()) throw new Error('did not collapse');
});
await step('completing an exercise: check animation, auto-collapse after 600 ms, order unchanged', async () => {
  await expand(page, 'שכיבות סמיכה');
  const before = await page.$$eval('.ex-card', (e) => e.map((x) => x.dataset.exrow).join());
  await page.click('.ex-card[data-exrow=a] [data-action=set][data-i="2"]');
  await page.waitForTimeout(150);
  const mid = await page.$eval('.ex-card[data-exrow=a]', (e) => ({ open: e.classList.contains('open'), complete: e.classList.contains('complete'), draw: !!e.querySelector('.checkmark.draw'), status: e.querySelector('.ex-status').textContent.trim() }));
  if (!mid.open || !mid.complete || !mid.draw || mid.status !== 'הושלם') throw new Error(JSON.stringify(mid));
  await page.waitForTimeout(800);
  if (await page.$eval('.ex-card[data-exrow=a]', (e) => e.classList.contains('open'))) throw new Error('still open');
  const after = await page.$$eval('.ex-card', (e) => e.map((x) => x.dataset.exrow).join());
  if (before !== after) throw new Error('order changed');
});
await step('timed + max-reps rows complete from their controls', async () => {
  await expand(page, 'מתח');
  await page.fill('.ex-card[data-exrow=c] [data-manual]', '10');
  await page.click('.ex-card[data-exrow=c] [data-action=manual-save]'); await page.waitForTimeout(300);
  if (await page.locator('.sheet').count()) await page.click('.sheet .btn.ghost');
  await page.waitForTimeout(900);
  const c = await page.$eval('.ex-card[data-exrow=c]', (e) => ({ open: e.classList.contains('open'), st: e.querySelector('.ex-status').textContent.trim() }));
  if (c.open || c.st !== 'הושלם') throw new Error(JSON.stringify(c));
});

/* ---------- Rides ---------- */
await step('rides: empty state, add via sheet, delete', async () => {
  await seed({});
  await openCard(page, 'rides');
  if (!(await page.textContent('.card:has(h2:text("רכיבה"))')).includes('עוד לא רכבת היום')) throw new Error('empty state');
  if (await page.locator('.card:has(h2:text("רכיבה")) input').count()) throw new Error('inline form still there');
  await addRide(page, '12.5', '40', 'בוקר');
  await addRide(page, '20');
  const rows = await page.$$eval('.ride-row .grow', (e) => e.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  if (rows.join('|') !== '12.5 ק״מ · 40 דק׳ · בוקר|20 ק״מ') throw new Error(JSON.stringify(rows));
  if (!(await page.textContent('.card:has(h2:text("רכיבה")) .stat-num')).includes('32.5')) throw new Error('total');
  await page.click('[data-action=ride-new]'); await page.click('.sheet .btn.primary'); await page.waitForTimeout(200);
  if (!(await page.locator('.sheet').count())) throw new Error('accepted empty km');
  await page.click('.sheet .btn.ghost'); await page.waitForTimeout(350);
  await page.click('[data-action=ride-del][data-i="0"]'); await page.click('.sheet .btn.danger'); await page.waitForTimeout(350);
  const s = await state();
  if (s.days[T].rides.length !== 1 || s.days[T].rides[0].km !== 20) throw new Error(JSON.stringify(s.days[T].rides));
});

/* ---------- Time picker ---------- */
await step('sleep picker: prefill, 5-minute wheel, crossing midnight 23:30 → 06:50 = 7:20', async () => {
  await seed({});
  await page.click('[data-sleep=bed]'); await page.waitForSelector('.tp-wheel'); await page.waitForTimeout(350);
  const pre = await page.$$eval('.tp-item.sel', (e) => e.map((x) => x.textContent).join(':'));
  const mins = await page.locator('[data-wheel=m] .tp-item').count();
  const dir = await page.$eval('.tp', (e) => getComputedStyle(e).direction);
  if (pre !== '23:00' || mins !== 12 || dir !== 'ltr') throw new Error(`${pre} ${mins} ${dir}`);
  await page.click('.sheet .btn.ghost'); await page.waitForTimeout(350);
  await pickTime(page, '[data-sleep=bed]', '23:30');
  await pickTime(page, '[data-sleep=wake]', '06:50');
  if ((await page.textContent('[data-sleep=bed] .time-field-val')) !== '23:30') throw new Error('field not updated');
  await page.click('[data-action=sleep-save]'); await page.waitForTimeout(300);
  const s = await state();
  if (JSON.stringify(s.days[T].sleep) !== '{"bed":"23:30","wake":"06:50"}') throw new Error(JSON.stringify(s.days[T].sleep));
  const ringTxt = (await page.textContent('.card:has(h2:text("שינה")) .ring-mid')).trim();
  if (ringTxt !== '7:20') throw new Error(ringTxt);
});
await step('sleep picker: cancel keeps the value; arrow keys move the wheel', async () => {
  await page.click('[data-sleep=wake]'); await page.waitForSelector('.tp-wheel'); await page.waitForTimeout(350);
  await page.focus('[data-wheel=h]'); await page.keyboard.press('ArrowDown'); await page.waitForTimeout(600);
  const v = await page.textContent('.tp-preview');
  if (v !== '07:50') throw new Error('arrow ' + v);
  await page.click('.sheet .btn.ghost'); await page.waitForTimeout(350);
  if ((await page.textContent('[data-sleep=wake] .time-field-val')) !== '06:50') throw new Error('cancel changed value');
});
await step('food time picker: 1-minute wheel, sets 13:07 and re-sorts', async () => {
  await seed({ food: [{ name: 'א', kcal: 100, protein: 5, time: '08:00' }, { name: 'ב', kcal: 100, protein: 5, time: '12:00' }] });
  await page.click('[data-tab=food]');
  await page.click('[data-action=food-time][data-i="0"]'); await page.waitForSelector('.tp-wheel'); await page.waitForTimeout(350);
  const mins = await page.locator('[data-wheel=m] .tp-item').count();
  const pre = await page.$$eval('.tp-item.sel', (e) => e.map((x) => x.textContent).join(':'));
  if (mins !== 60 || pre !== '08:00') throw new Error(`${mins} ${pre}`);
  await page.click('.sheet .btn.ghost'); await page.waitForTimeout(350);
  await pickTime(page, '[data-action=food-time][data-i="0"]', '13:07');
  const s = await state();
  if (s.days[T].food[0].time !== '13:07') throw new Error(s.days[T].food[0].time);
  const order = await page.$$eval('[data-swipe] strong', (e) => e.map((x) => x.textContent).join());
  if (order !== 'ב,א') throw new Error(order);
});
await step('headers: no "70" label on any screen', async () => {
  for (const t of ['today', 'food', 'trends', 'settings']) {
    await page.click(`[data-tab=${t}]`); await page.waitForTimeout(250);
    if (await page.$$eval('.eyebrow', (e) => e.some((x) => x.textContent.trim() === '70'))) throw new Error(t);
  }
});
console.log('errors:', errors.length ? errors : 'none');
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
await b.close();
