import { chromium } from 'playwright';
import { autoDetail, openCard } from './nav200.mjs';
import fs from 'fs';
import { expand, addRide, pickTime } from './helpers152.mjs';
const SP = process.env.TEST_OUT || process.argv[2];
const URL = 'http://127.0.0.1:8765/70/';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
autoDetail(page);
page.setDefaultTimeout(8000);
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
let fails = 0;
const step = async (label, fn) => { try { await fn(); console.log('OK  ', label); } catch (e) { fails++; console.log('FAIL', label, '-', e.message.split('\n').slice(0, 6).join(' | ')); } };
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('seventy.v1')));
const clip = () => page.evaluate(() => navigator.clipboard.readText());
const diff = (got, want) => {
  const g = got.split('\n'), w = want.split('\n');
  for (let i = 0; i < Math.max(g.length, w.length); i++) if (g[i] !== w[i]) return `line ${i + 1}: got ${JSON.stringify(g[i])} want ${JSON.stringify(w[i])}`;
  return null;
};

await page.goto(URL);
const keys = await page.evaluate(() => {
  const k = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const out = []; for (let i = 0; i <= 10; i++) { const d = new Date(); d.setDate(d.getDate() - i); out.push(k(d)); } return out;
});
const WD = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const header = (k) => { const [y, m, d] = k.split('-').map(Number); return `סיכום יומי · יום ${WD[new Date(y, m - 1, d).getDay()]} ${d}.${m}.${y}`; };
const T = keys[0], A = keys[2], B = keys[5];
const E = (id, name, type, o, extra) => ({ id, name, type, sets: null, reps: null, seconds: null, weight: null, order: o, archived: false, ...extra });
const v3 = {
  schemaVersion: 3,
  settings: { coach: { enabled: false }, theme: 'flame', startWeight: 99, targetWeight: 85, height: null, proteinTarget: 150, stepsTarget: 12000, rideGoalKm: 45, climbsTarget: 6, floorsRegular: 6, floorsRoof: 10, sleepTarget: 8 },
  exercises: [
    E('e1', 'כפיפת מרפקים', 'setsReps', 0, { sets: 3, reps: 20, weight: 6 }),
    E('e2', 'פלאנק', 'timed', 1, { seconds: 60 }),
    E('e3', 'סקוואטים', 'maxReps', 2, {}),
    E('e4', 'שכיבות סמיכה', 'setsReps', 3, { sets: 3, reps: 15 }),
    E('e5', 'מתח', 'maxReps', 4, { reps: 10 }),
  ],
  mealPresets: [{ id: 'm1', name: 'שייק', kcal: 250, protein: 40 }],
  customFoods: [], foodMemory: {},
  days: {
    [A]: {
      rest: false, steps: 12400,
      climbs: Array.from({ length: 6 }, () => ({ type: 'regular', floors: 6 })),
      rides: [{ km: 12, minutes: 40, note: '' }, { km: 12.5, minutes: 38, note: '' }],
      exercises: {
        e1: { sets: [{ reps: 20, weight: 6, done: true }, { reps: 20, weight: 6, done: true }, { reps: 18, weight: 6, done: true }] },
        e2: { seconds: 60, weight: null }, e3: { reps: 12, weight: null },
        e4: { sets: [{ reps: 15, weight: null, done: true }, { reps: 15, weight: null, done: true }] },
        e5: { reps: 10, weight: null },
      },
      food: [
        { name: 'חזה עוף צלוי', grams: 150, kcal: 248, protein: 46.5, source: 'db', time: '13:30', amount: 150, unit: 'גרם' },
        { name: 'ביצה קשה', grams: 110, kcal: 171, protein: 13.9, source: 'db', time: '08:10', amount: 2, unit: 'יחידה' },
        { name: 'קפה הפוך', grams: 240, kcal: 120, protein: 6.5, source: 'db', time: '08:10', amount: 1, unit: 'כוס' },
        { name: 'ארוחה ישנה', kcal: 500, protein: 30 },
      ],
      sleep: { bed: '23:30', wake: '06:50' },
    },
    [B]: {
      rest: true, steps: null, climbs: [{ type: 'roof', floors: 10 }], rides: [{ km: 30, minutes: null, note: '' }],
      exercises: { e2: { seconds: 1, weight: null }, e4: { sets: [{ reps: 1, weight: null, done: true }] } },
      food: [], sleep: null,
    },
    [T]: { rest: false, steps: null, climbs: [], rides: [], exercises: {}, food: [{ name: 'ישן בלי שעה', kcal: 100, protein: 5 }], sleep: null },
  },
  weights: [{ date: A, kg: 97.4 }],
  meta: { lastSeenLevel: 2, seenBadges: ['first', 'ride30'] },
};
const stash = (d) => page.evaluate((x) => localStorage.setItem('seventy.v1', JSON.stringify(x)), d);
// Water for day A (9 glasses) and B (1 glass) is added below as v4 data after migration check.
await stash(v3);
await page.reload();
await page.waitForSelector('.hero');

await step('v3 → v4 migration keeps all data, adds water fields', async () => {
  const s = await state();
  if (s.schemaVersion !== 4 || s.settings.waterTarget !== 2500) throw new Error('version/target');
  if (Object.keys(s.days).length !== 3 || s.days[A].food.length !== 4 || s.days[A].sleep.bed !== '23:30' || s.weights.length !== 1 || s.exercises.length !== 5 || s.meta.lastSeenLevel !== 2) throw new Error('data lost');
  if (!Array.isArray(s.days[A].water) || s.days[A].water.length) throw new Error('water field');
  if (JSON.stringify(s.days[A].food[1]) !== JSON.stringify(v3.days[A].food[1])) throw new Error('food entry changed');
});

// Seed water (as stored by v4) for A and B
await page.evaluate(([A, B]) => {
  const s = JSON.parse(localStorage.getItem('seventy.v1'));
  s.days[A].water = Array.from({ length: 9 }, (_, i) => ({ ml: 250, time: `0${i}:00`.slice(-5) }));
  s.days[B].water = [{ ml: 250, time: '10:00' }];
  localStorage.setItem('seventy.v1', JSON.stringify(s));
}, [A, B]);
await page.reload(); await page.waitForSelector('.hero');

const I = (s) => `⁦${s}⁩`;
const WANT_A = [
  header(A), '',
  'אימון:',
  '• כפיפת מרפקים: 3 סטים (20, 20, 18 חזרות) · 6 ק״ג',
  '• פלאנק: 60 שניות',
  '• סקוואטים: סט אחד (12 חזרות)',
  '• שכיבות סמיכה: 2 סטים (15, 15 חזרות)',
  '• מתח: סט אחד (10 חזרות)',
  'השלמה: 93% (4 מתוך 5 תרגילים)', '',
  'פעילות:',
  `• צעדים: ${I('12,400 / 12,000')}`,
  '• מדרגות: 6 עליות · 36 קומות / 36',
  '• אופניים: 2 רכיבות · 24.5 ק״מ · 78 דק׳',
  '• רכיבה: 12.0 ק״מ · 40 דק׳',
  '• רכיבה: 12.5 ק״מ · 38 דק׳', '',
  `שינה: ${I('7:20')} שעות (${I('23:30–06:50')})`, '',
  'מים: 2.49 ל׳ / 2.5 ל׳ (מים 2.25 · משקאות 0.24)', '', // the 240 ml coffee counts as fluids (1.8.1)
  'אוכל ושתייה:',
  '• — · ארוחה ישנה · 500 קק״ל · 30.0 ג׳ חלבון',
  '• 08:10 · ביצה קשה · 2 יחידות (110 ג׳) · 171 קק״ל · 13.9 ג׳ חלבון',
  '• 08:10 · קפה הפוך · כוס אחת (240 ג׳) · 120 קק״ל · 6.5 ג׳ חלבון',
  '• 13:30 · חזה עוף צלוי · 150 ג׳ · 248 קק״ל · 46.5 ג׳ חלבון',
  'סה״כ: 1,039 קק״ל · 96.9 ג׳ חלבון / 150 ג׳', '',
  'שקילה: 97.4 ק״ג', '',
  'תובנות:',
  '• שיא חדש במדרגות: 36 קומות ביום',
  '• שיא חדש בשכיבות סמיכה: 15 חזרות בסט',
  '• שיא חדש בפלאנק: 60 שניות',
  '• חסרים 53 גרם חלבון ליעד היומי', '',
  '‏XP היום: 106 · רמה 2',
  'תגים חדשים: אימון ראשון',
].join('\n');
const WANT_B = [
  header(B), '',
  'אימון:',
  '• פלאנק: שנייה אחת',
  '• שכיבות סמיכה: סט אחד (חזרה אחת)',
  '• יום מנוחה',
  'השלמה: 7% (0 מתוך 5 תרגילים)', '',
  'פעילות:',
  '• מדרגות: עלייה אחת · 10 קומות / 36',
  '• אופניים: רכיבה אחת · 30.0 ק״מ', '',
  'מים: 0.25 ל׳ / 2.5 ל׳ (כוס אחת)', '',
  'אוכל ושתייה:',
  'לא נרשם אוכל', '',
  '‏XP היום: 67 · רמה 2',
  'תגים חדשים: רכיבת 30',
].join('\n');

await step('daily summary from "היום" for a past day (2 days back via arrows) matches exactly', async () => {
  await page.click('[data-action=date-prev]'); await page.click('[data-action=date-prev]');
  await page.click('[data-action=copy-daily]');
  await page.waitForSelector('#toast.show:has-text("הסיכום היומי הועתק")');
  const got = await clip();
  fs.writeFileSync(`${SP}/daily-A.txt`, got);
  const d = diff(got, WANT_A); if (d) throw new Error(d);
});
await step('daily summary from "אוכל" for a rest day with no food (3 more days back) matches exactly', async () => {
  await page.click('[data-tab=food]');
  for (let i = 0; i < 3; i++) await page.click('[data-action=date-prev]');
  await page.click('[data-action=copy-daily]');
  await page.waitForTimeout(300);
  const got = await clip();
  fs.writeFileSync(`${SP}/daily-B.txt`, got);
  const d = diff(got, WANT_B); if (d) throw new Error(d);
});
await step('food list on day A: sorted, no-time entry first, unit + grams shown', async () => {
  for (let i = 0; i < 3; i++) await page.click('[data-action=date-next]');
  const rows = await page.$$eval('[data-swipe]', (els) => els.map((e) => e.querySelector('strong').textContent + '|' + (e.querySelector('.time-chip bdi')?.textContent || '—')));
  if (rows.join(',') !== 'ארוחה ישנה|—,ביצה קשה|08:10,קפה הפוך|08:10,חזה עוף צלוי|13:30') throw new Error(rows.join(','));
  const txt = await page.textContent('[data-swipe="2"]');
  if (!txt.includes('כוס אחת') || !txt.includes('240')) throw new Error(txt);
  await page.locator('.card:has(h2:text("מה אכלתי"))').screenshot({ path: `${SP}/40-food-times.png` });
});
await step('weekly summary: correct plurals + water lines', async () => {
  await page.click('[data-tab=trends]');
  await page.click('[data-action=copy-summary]'); await page.waitForTimeout(300);
  const w = await clip();
  fs.writeFileSync(`${SP}/weekly4.txt`, w);
  for (const s of ['• מדרגות: עלייה אחת · 10 קומות / 36', '• שכיבות סמיכה: סט אחד (חזרה אחת)', '• מים: 0.25 ל׳ (כוס אחת)', '• נוזלים: 2.49 ל׳ (מים 2.25 · משקאות 0.24)',
    '• מדרגות: 6 עליות · 36 קומות / 36', '• סקוואטים: סט אחד (12 חזרות)', '• כפיפת מרפקים: 3 סטים (20, 20, 18 חזרות) · 6 ק״ג', '• פלאנק: שנייה אחת']) {
    if (!w.includes(s)) throw new Error('missing ' + s);
  }
  const bad = w.match(/(^|[^\d.,])1 (סטים|עליות|רכיבות|יחידות|כוסות|חזרות|שניות|קומות)/m);
  if (bad) throw new Error('bad plural: ' + bad[0]);
});
await step('trends water chart + weekly average', async () => {
  await openCard(page, 'fluids');
  const card = page.locator('.card:has(h2:text("מים · 7 ימים"))');
  const t = await card.textContent();
  if (!t.includes('1.37') || !t.includes('2.49')) throw new Error(t.replace(/\s+/g, ' ').slice(0, 200)); // avg(2.49 incl. coffee, 0.25) = 1.37
  await page.waitForTimeout(900);
  await card.screenshot({ path: `${SP}/41-water-chart.png` });
});

// ---------- Today: water ----------
await page.click('[data-tab=today]');
await page.click('[data-action=date-today]').catch(() => {});
const ringL = () => page.locator('.water-card .ring-big').innerText();
await step('water: +כוס, +בקבוק, אחר 330 → 1.08 ל׳, entries with time', async () => {
  await page.click('[data-action=water-add][data-ml="250"]');
  await page.click('[data-action=water-add][data-ml="500"]');
  await page.click('[data-action=water-other]');
  await page.fill('.sheet [name=ml]', '330');
  await page.click('.sheet .btn.primary'); await page.waitForTimeout(400);
  if ((await ringL()).trim() !== '1.08') throw new Error('ring ' + (await ringL()));
  const w = (await state()).days[T].water;
  if (w.map((x) => x.ml).join(',') !== '250,500,330' || !w.every((x) => /^\d{2}:\d{2}$/.test(x.time))) throw new Error(JSON.stringify(w));
  await page.locator('.water-card').screenshot({ path: `${SP}/42-water-card.png` });
});
await step('water: invalid custom amount rejected, undo removes last', async () => {
  await page.click('[data-action=water-other]');
  await page.fill('.sheet [name=ml]', '0');
  await page.click('.sheet .btn.primary'); await page.waitForTimeout(200);
  if (!(await page.locator('.sheet').count())) throw new Error('accepted 0');
  await page.click('.sheet .btn.ghost'); await page.waitForTimeout(300);
  await page.click('[data-action=water-undo]'); await page.waitForTimeout(200);
  if ((await ringL()).trim() !== '0.75') throw new Error('after undo ' + (await ringL()));
});
await step('water not in XP / completion / heatmap score (same with and without water)', async () => {
  const r = await page.evaluate(async (T) => {
    const P = await import('./js/progress.js'); const S = await import('./js/stats.js'); const st = await import('./js/storage.js');
    const day = st.getState().days[T];
    const m = () => [P.dayXP(T), P.dayScore(T), S.dayCompletion(T).fraction];
    const withW = m(); const saved = day.water; day.water = []; const without = m(); day.water = saved;
    return { withW, without, ml: S.waterMl(day) };
  }, T);
  if (!r.ml || JSON.stringify(r.withW) !== JSON.stringify(r.without)) throw new Error(JSON.stringify(r));
});

// ---------- Food times ----------
await step('food: new entries get time; edit time re-sorts; old entry stays first', async () => {
  await page.click('[data-tab=food]');
  await page.click('[data-action=preset-add]'); await page.waitForTimeout(250);
  await page.fill('[data-search]', 'ביצה קשה');
  await page.click('.food-result:has-text("ביצה קשה")');
  await page.click('.sheet .unit-chip:has-text("יחידה")');
  await page.fill('.sheet [name=amount]', '2');
  await page.click('.sheet .btn.primary'); await page.waitForTimeout(400);
  let s = await state();
  const egg = s.days[T].food.find((f) => f.name === 'ביצה קשה');
  if (!(egg && egg.amount === 2 && egg.unit === 'יחידה' && egg.grams === 110 && /^\d{2}:\d{2}$/.test(egg.time))) throw new Error(JSON.stringify(egg));
  if (!/^\d{2}:\d{2}$/.test(s.days[T].food.find((f) => f.name === 'שייק').time)) throw new Error('preset time');
  // edit the shake's time to 00:05 → becomes first timed entry
  const idx = s.days[T].food.findIndex((f) => f.name === 'שייק');
  await pickTime(page, `[data-action=food-time][data-i="${idx}"]`, '00:05');
  s = await state();
  if (s.days[T].food[idx].time !== '00:05') throw new Error('not saved');
  const order = await page.$$eval('[data-swipe] strong', (e) => e.map((x) => x.textContent));
  if (order.join(',') !== 'ישן בלי שעה,שייק,ביצה קשה') throw new Error(order.join(','));
  // set a time on the old entry → it moves into the timed order
  const oldIdx = s.days[T].food.findIndex((f) => f.name === 'ישן בלי שעה');
  await pickTime(page, `[data-action=food-time][data-i="${oldIdx}"]`, '23:59');
  const order2 = await page.$$eval('[data-swipe] strong', (e) => e.map((x) => x.textContent));
  if (order2.join(',') !== 'שייק,ביצה קשה,ישן בלי שעה') throw new Error(order2.join(','));
  await page.locator('.card:has(h2:text("מה אכלתי"))').screenshot({ path: `${SP}/43-food-times-today.png` });
  // daily summary for today shows the unit with singular/plural
  await page.click('[data-action=copy-daily]'); await page.waitForTimeout(300);
  const d = await clip(); fs.writeFileSync(`${SP}/daily-T.txt`, d);
  if (!d.includes('· ביצה קשה · 2 יחידות (110 ג׳) ·') || !d.includes('• 00:05 · שייק · 250 קק״ל · 40.0 ג׳ חלבון') || !d.includes('מים: 0.75 ל׳ / 2.5 ל׳ (3 כוסות)')) throw new Error(d);
});

// ---------- Settings / wizard field ----------
await step('settings has water target', async () => {
  await page.click('[data-tab=settings]');
  if (await page.inputValue('[data-setting=waterTarget]') !== '2500') throw new Error('value');
  await page.fill('[data-setting=waterTarget]', '3000'); await page.press('[data-setting=waterTarget]', 'Enter'); await page.waitForTimeout(200);
  if ((await state()).settings.waterTarget !== 3000) throw new Error('not saved');
});

// ---------- Overflow ----------
await step('no horizontal overflow at 412px on any screen', async () => {
  const out = [];
  for (const t of ['today', 'food', 'trends', 'settings']) {
    await page.click(`[data-tab=${t}]`); await page.waitForTimeout(250);
    out.push(`${t}:${await page.evaluate(() => document.documentElement.scrollWidth)}`);
  }
  await page.click('[data-tab=today]'); await page.click('.level-chip'); await page.waitForTimeout(250);
  out.push(`achievements:${await page.evaluate(() => document.documentElement.scrollWidth)}`);
  await page.click('[data-action=back]');
  console.log('        ', out.join(' '));
  if (out.some((o) => !o.endsWith(':412'))) throw new Error(out.join(' '));
});

// ---------- Backup ----------
await step('backup v4 round-trip identical', async () => {
  await page.click('[data-tab=settings]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-action=export]')]);
  const path = `${SP}/backup-v4.json`; await dl.saveAs(path);
  const before = await page.evaluate(() => localStorage.getItem('seventy.v1')); // includes the new meta.lastBackupAt
  const j = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (j.schemaVersion !== 4 || !j.days[T].water.length || !j.days[T].food[0].time) throw new Error('fields missing');
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('seventy.v1')); s.days = {}; localStorage.setItem('seventy.v1', JSON.stringify(s)); });
  await page.reload(); await page.click('[data-tab=settings]');
  await page.setInputFiles('[data-file]', path);
  await page.click('.sheet .btn.danger'); await page.waitForTimeout(600);
  if (await page.evaluate(() => localStorage.getItem('seventy.v1')) !== before) throw new Error('mismatch');
});
await step('import v3 file → migrated to v4', async () => {
  fs.writeFileSync(`${SP}/backup-v3b.json`, JSON.stringify(v3));
  await page.setInputFiles('[data-file]', `${SP}/backup-v3b.json`);
  await page.click('.sheet .btn.danger'); await page.waitForTimeout(600);
  const s = await state();
  if (s.schemaVersion !== 4 || s.settings.waterTarget !== 2500 || s.days[A].food.length !== 4) throw new Error('v3 import');
});
await step('offline reload works', async () => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); await page.waitForTimeout(500);
  await context.setOffline(true);
  await page.reload(); await page.waitForSelector('.water-card');
  await page.click('[data-tab=food]'); await page.waitForSelector('[data-action=copy-daily]');
  await context.setOffline(false);
});
await page.click('[data-tab=today]'); await page.waitForTimeout(1200);
await page.screenshot({ path: `${SP}/44-today.png`, fullPage: true });
console.log('caches:', await page.evaluate(() => caches.keys()));
console.log('errors:', errors.length ? errors : 'none');
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
await browser.close();
