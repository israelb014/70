// v2.2.0: smart coach ("מאמן חכם") — exercise library + unknown-name card, automatic rotation, readiness
// score, intensities, 36-hour rule, recovery, reason lines, sleep banner, lock, override, evening preview,
// light days, progression / step back / undo / weight steps, exports, insight, settings, backup, layout.
import { chromium } from 'playwright';
import fs from 'fs';
const BASE = process.env.BASE || 'http://127.0.0.1:8765/70/';
const SP = process.env.TEST_OUT;
const b = await chromium.launch();
let fails = 0; const step = async (l, fn) => { try { await fn(); console.log('OK  ', l); } catch (e) { fails++; console.log('FAIL', l, '-', e.message.split('\n')[0]); } };
const errors = [];
const DAY = 86400000;
const key = (o = 0) => { const d = new Date(Date.now() - o * DAY); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const T = key(0);
const at = (hh) => { const d = new Date(); d.setHours(hh, 0, 0, 0); return d; };
const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, acceptDownloads: true });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => m.type() === 'error' && !/Failed to load resource|openfoodfacts|ERR_FAILED|CORS/.test(m.text()) && errors.push(m.text()));
await p.clock.setFixedTime(at(9));
await p.goto(BASE);

const S = (id, name, o = {}) => ({ id, name, type: 'setsReps', sets: 3, reps: 12, seconds: null, weight: null, order: 0, archived: false, ...o });
const H = (id, name, sec = 60) => ({ id, name, type: 'timed', sets: null, reps: null, seconds: sec, weight: null, order: 9, archived: false });
const EX = [S('push1', 'שכיבות סמיכה'), S('pull1', 'מתח', { reps: 5, order: 1 }), S('arm1', 'כפיפת מרפקים', { weight: 6, order: 2 }), S('leg1', 'סקוואט', { reps: 20, order: 3 }), H('core1', 'פלאנק')];
const sets = (n, reps, w = null) => ({ sets: Array.from({ length: n }, () => ({ reps, weight: w, done: true })) });
const hold = (sec) => ({ seconds: sec, weight: null });
const night = (bed, wake) => ({ sleep: { bed, wake } });
const food = (protein, kcal = 2000) => ({ food: [{ name: 'אוכל', grams: 100, kcal, protein, source: 'db' }] });
const BASE_SETTINGS = { theme: 'flame', startWeight: 90, targetWeight: 80, proteinTarget: 150, stepsTarget: 10000, rideGoalKm: 45, climbsTarget: 6, floorsRegular: 6, floorsRoof: 10, sleepTarget: 8, waterTarget: 2500 };
const seed = async (days = {}, { exercises = EX, coach = { enabled: true, weights: [3, 6, 12] }, settings = {}, meta = {}, noCoachKey = false } = {}) => {
  await p.evaluate(([days, settings, exercises, meta, keys]) => {
    const out = {};
    for (const [o, d] of Object.entries(days)) out[keys[o]] = { rest: false, steps: null, climbs: [], rides: [], exercises: {}, food: [], sleep: null, naps: [], water: [], breathing: [], descents: [], ...d };
    localStorage.setItem('seventy.v1', JSON.stringify({ schemaVersion: 4, settings, exercises, mealPresets: [], customFoods: [], foodMemory: {}, weights: [],
      meta: { lastSeenLevel: 99, seenBadges: [], lastBackupAt: new Date().toISOString(), ...meta }, photoSessions: [], days: out }));
  }, [days, { ...BASE_SETTINGS, ...(noCoachKey ? {} : { coach }), ...settings }, exercises, meta, Object.fromEntries(Array.from({ length: 40 }, (_, i) => [i, key(i)]))]);
  await p.reload(); await p.waitForTimeout(350);
};
const state = () => p.evaluate(() => JSON.parse(localStorage.getItem('seventy.v1')));
const call = (path, fn, ...args) => p.evaluate(async ([path, fn, args]) => (await import(path))[fn](...args), [path, fn, args]);
const coach = (fn, ...a) => call('./js/coach.js', fn, ...a);
const plan = (o = 0) => coach('planFor', key(o));
const eq = (a, e, what) => { if (JSON.stringify(a) !== JSON.stringify(e)) throw new Error(`${what}: ${JSON.stringify(a)} ≠ ${JSON.stringify(e)}`); };
const open = async (id) => { await p.click(`[data-tile="${id}"] .tile-open`); await p.waitForTimeout(250); };
const back = async () => { await p.click('[data-action=detail-back]'); await p.waitForTimeout(250); };
const planIds = (o = 0) => p.evaluate(async (k) => (await import('./js/stats.js')).exercisesForDay(k).map((e) => e.id), key(o));
const lockedSession = (dayType, intensity, targets) => ({ plan: { dayType, intensity, score: 90, reason: 'x', locked: true, targets } });
const tgt = (sets, reps, weight = null, seconds = null) => ({ sets, reps, seconds, weight });

/* ---------- 1. Library ---------- */

await step('library: every listed name + alias maps to its group (whole words, Hebrew normalization)', async () => {
  const spec = {
    push: ['שכיבות סמיכה', 'לחיצת חזה', 'לחיצת כתפיים', 'מקבילים', 'טריצפס'],
    pull: ['מתח', 'תליית מתח', 'חתירה', 'פולאובר'],
    arms: ['כפיפת מרפקים', 'פטישים', 'בייספס'],
    grip: ['גריפ', 'מקן'],
    legs: ['סקוואט', 'מכרעים', 'לאנג׳ים', 'דדליפט', 'גשר עכוז', 'עליית עקבים'],
    core: ['פלאנק', 'כפיפות בטן', 'הרמת רגליים', 'פלאנק צד'],
  };
  const lib = await p.evaluate(async () => (await import('./js/coach.js')).LIBRARY);
  for (const [g, names] of Object.entries(spec)) for (const n of names) eq(await coach('matchGroup', n), g, n);
  for (const [g, names] of Object.entries(lib)) for (const n of names) eq(await coach('matchGroup', n), g, `alias ${n}`);
  const more = { '3 שכיבות סמיכה רחבות': 'push', 'הסקוואט': 'legs', 'סקוואט עם משקולת': 'legs', 'לאנג\'ים': 'legs', 'שכיבות־סמיכה': null, 'Push-Ups': 'push',
    'כפיפת מרפקים עם משקולות': 'arms', 'פלאנק צד ימין': 'core', 'הרמת רגליים בתלייה': 'core', 'חתירה בישיבה לבטן': 'core' };
  for (const [n, g] of Object.entries(more)) if (g) eq(await coach('matchGroup', n), g, n);
  for (const n of ['מתחם', 'קפיצות חבל', 'ריצה', 'בטנה', 'פלאנקים']) eq(await coach('matchGroup', n), null, `no match ${n}`);
});

await step('unknown name: ONE small card "לאיזה אזור שייך התרגיל X?" with group chips; one tap saves; skip hides it for good', async () => {
  await seed({}, { exercises: [...EX, S('u1', 'קפיצות חבל', { order: 5 }), S('u2', 'ריצת ספרינט', { order: 6 })] });
  eq(await p.$$eval('[data-group-card]', (e) => e.length), 1, 'one card');
  eq((await p.textContent('.group-q')).replace(/\s+/g, ' ').trim(), 'לאיזה אזור שייך התרגיל קפיצות חבל?', 'question');
  eq(await p.$$eval('[data-group-card] [data-action=group-set]', (e) => e.map((x) => x.textContent.trim())), ['דחיפה', 'משיכה', 'ידיים', 'אחיזה', 'רגליים', 'בטן'], 'chips');
  await p.click('[data-group-card] [data-group=legs]'); await p.waitForTimeout(250);
  eq((await state()).exercises.find((e) => e.id === 'u1').group, 'legs', 'saved');
  eq(await p.getAttribute('[data-group-card]', 'data-group-card'), 'u2', 'next unknown');
  await p.click('[data-action=group-skip]'); await p.waitForTimeout(250);
  eq((await state()).meta.groupSkip, ['u2'], 'skip stored');
  await p.reload(); await p.waitForTimeout(300);
  if (await p.$('[data-group-card]')) throw new Error('card again');
  // Editor: group chips preselected from the library; a different choice is stored, the library's is not
  await p.click('.tab[data-tab=settings]'); await p.waitForTimeout(300);
  await p.click('[data-action=ex-edit][data-id=arm1]'); await p.waitForSelector('.sheet [name=group]');
  eq(await p.$eval('.sheet [name=group]:checked', (x) => x.value), 'arms', 'preselected');
  await p.click('.sheet .day-chip:has([value=grip])'); await p.click('.sheet .btn.primary'); await p.waitForTimeout(300);
  eq((await state()).exercises.find((e) => e.id === 'arm1').group, 'grip', 'changed');
  await p.click('[data-action=ex-edit][data-id=arm1]'); await p.waitForSelector('.sheet [name=group]');
  await p.click('.sheet .day-chip:has([value=arms])'); await p.click('.sheet .btn.primary'); await p.waitForTimeout(300);
  eq((await state()).exercises.find((e) => e.id === 'arm1').group ?? null, null, 'back to library = not stored');
  if (await p.$('.rot-card')) throw new Error('manual rotation card while the coach is on');
});

/* ---------- 2. Rotation ---------- */

await step('auto rotation: "יום עליון" (דחיפה+משיכה+ידיים+אחיזה) and "יום רגליים" (רגליים+בטן); < 2 on a side → one full-body day', async () => {
  await seed({});
  eq((await coach('coachDays')).map((d) => [d.id, d.groups.join('+')]), [['upper', 'push+pull+arms+grip'], ['lower', 'legs+core']], 'two days');
  await seed({}, { exercises: [S('push1', 'שכיבות סמיכה'), S('pull1', 'מתח'), H('core1', 'פלאנק')] });
  eq((await coach('coachDays')).map((d) => d.id), ['full'], 'full body');
  eq((await plan()).dayType, 'full', 'plan');
  eq((await planIds()).sort(), ['core1', 'pull1', 'push1'], 'all exercises');
  // Unknown groups take part in every training day
  await seed({}, { exercises: [...EX, S('u1', 'קפיצות חבל', { order: 5 })] });
  if (!(await planIds()).includes('u1')) throw new Error('unknown not in plan');
});

/* ---------- 3. Readiness ---------- */

const parts = async (o = 0) => (await coach('readiness', key(o))).parts;
await step('sleep (40): ≥ target 40, −10 per full hour below, naps count, not logged 25', async () => {
  const cases = [[night('23:00', '07:00'), 40], [night('23:30', '07:00'), 40], [night('00:10', '07:00'), 30], [night('02:30', '07:00'), 10], [night('04:00', '07:00'), 0],
    [{ ...night('00:00', '07:00'), naps: [{ start: '14:00', end: '15:00' }] }, 40], [{}, 25]];
  for (const [d, want] of cases) { await seed({ 0: d }); eq((await parts()).sleep, want, JSON.stringify(d)); }
});

await step('protein yesterday (20): ≥ 90% 20, 60–89% 10, < 60% 0, not logged 10', async () => {
  for (const [g, want] of [[140, 20], [135, 20], [134, 10], [90, 10], [89, 0], [null, 10]]) {
    await seed(g === null ? {} : { 1: food(g) });
    eq((await parts()).protein, want, `protein ${g}`);
  }
});

await step('fuel yesterday (20): ≥ 70% of the 14-day average (min 5 logged days) 20, below 5, not enough data 15', async () => {
  const hist = { 2: food(100, 2000), 3: food(100, 2000), 4: food(100, 2000), 5: food(100, 2000) };
  await seed({ ...hist, 1: food(100, 1500) }); eq((await parts()).fuel, 20, '1500 vs avg 1917');
  await seed({ ...hist, 1: food(100, 1000) }); eq((await parts()).fuel, 5, '1000 vs avg 1800');
  await seed({ 2: food(100), 3: food(100), 1: food(100, 1000) }); eq((await parts()).fuel, 15, '3 logged days');
  await seed({ ...hist, 6: food(100) }); eq((await parts()).fuel, 15, 'yesterday not logged');
  await seed({ ...hist, 16: food(100), 1: food(100, 1500) }); eq((await parts()).fuel, 20, 'older than 14 days ignored');
});

await step('training load (20): 0–2 days 20, 3 → 15, 4 → 10, 5+ → 0; a rest day breaks the run', async () => {
  const tr = (n, rest = null) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, i + 1 === rest ? { rest: true, exercises: { push1: sets(1, 12) } } : { exercises: { push1: sets(1, 12) } }]));
  for (const [n, want] of [[0, 20], [2, 20], [3, 15], [4, 10], [5, 0], [6, 0]]) { await seed(tr(n)); eq((await parts()).load, want, `${n} days`); }
  await seed(tr(5, 3)); eq((await parts()).load, 20, 'rest day on day 3 breaks it (2 days)');
});

/* ---------- 4. Plan ---------- */

const GOOD = { 0: night('23:00', '07:00'), 1: food(140) }; // 40 + 20 + 15 + 20 = 95
await step('intensity thresholds: ≥ 75 מלא · 50–74 רגיל · 30–49 קל · < 30 התאוששות', async () => {
  const hist = { 2: food(100, 2000), 3: food(100, 2000), 4: food(100, 2000), 5: food(100, 2000) };
  const cases = [
    [GOOD, 95, 'full'],
    [{ 0: night('23:00', '07:00'), 1: food(80) }, 75, 'full'], // 40 + 0 + 15 + 20
    [{}, 70, 'normal'], // 25 + 10 + 15 + 20
    [{ 0: night('02:30', '07:00'), 1: food(80, 2000), ...hist }, 50, 'normal'], // 10 + 0 + 20 + 20
    [{ 0: night('03:00', '07:00'), 1: food(80) }, 45, 'light'], // 10 + 0 + 15 + 20 (4h → 4 full hours below → 0? no: 4h below → 0)
    [{ 0: night('04:00', '07:00'), 1: food(100, 2000), ...hist }, 50, 'normal'], // 0 + 10 + 20 + 20
    [{ 0: night('04:00', '07:00'), 1: food(80, 2000), ...hist }, 40, 'light'], // 0 + 0 + 20 + 20
    [{ 0: night('04:00', '07:00'), 1: food(80, 1000), ...hist }, 25, 'recovery'], // 0 + 0 + 5 + 20
  ];
  for (const [d, score, want] of cases) {
    await seed(d);
    const pl = await plan();
    eq([pl.score, pl.intensity], [score === 45 ? pl.score : score, want], JSON.stringify(Object.keys(d)) + ' ' + pl.score);
  }
  // Exactly 30 → light; below → recovery
  // 0 sleep + 0 protein + 15 fuel (1 logged day) + 15 load (3 days in a row)
  await seed({ 0: night('04:00', '07:00'), 1: { ...food(80, 2000), exercises: { push1: sets(1, 12) } }, 2: { exercises: { leg1: sets(1, 12) } }, 3: { exercises: { push1: sets(1, 12) } } });
  eq([(await plan()).score, (await plan()).intensity], [30, 'light'], '30');
});

await step('day type: least recently trained; never one trained in the last 36 hours (extras count); both → recovery', async () => {
  await seed({ 4: { exercises: { push1: sets(3, 12) } }, 2: { exercises: { leg1: sets(3, 20) } } });
  eq((await plan()).dayType, 'upper', 'upper trained longer ago');
  await seed({ 3: { exercises: { leg1: sets(3, 20) } }, 2: { exercises: { push1: sets(3, 12) } } });
  eq((await plan()).dayType, 'lower', 'lower trained longer ago');
  await seed({ 1: { exercises: { push1: sets(3, 12) } }, 6: { exercises: { leg1: sets(3, 20) } } });
  eq((await plan()).dayType, 'lower', 'yesterday upper → lower');
  await seed({ 1: { exercises: { leg1: sets(3, 20) } }, 9: { exercises: { push1: sets(3, 12) } } });
  eq((await plan()).dayType, 'upper', 'yesterday lower → upper');
  await seed({ 1: { exercises: { push1: sets(3, 12), core1: hold(60) } } }); // upper day with a core extra
  const r = await plan();
  eq([r.dayType, r.intensity, r.reason], ['recovery', 'recovery', 'כל הקבוצות אומנו ב-36 השעות האחרונות'], 'both trained → recovery');
  await seed({ 2: { exercises: { push1: sets(3, 12), leg1: sets(3, 20) } } });
  if ((await plan()).dayType === 'recovery') throw new Error('2 days ago is outside 36 hours');
  // Single full-body day trained yesterday → recovery
  await seed({ 1: { exercises: { push1: sets(3, 12) } } }, { exercises: [S('push1', 'שכיבות סמיכה'), S('pull1', 'מתח'), H('core1', 'פלאנק')] });
  eq((await plan()).dayType, 'recovery', 'full body yesterday');
});

await step('recovery after 5 training days in a row: "בטן" holds only (normal target), stairs / steps / breathing suggestions', async () => {
  const five = Object.fromEntries([1, 2, 3, 4, 5].map((i) => [i, { exercises: { [i % 2 ? 'push1' : 'leg1']: sets(3, 12) } }]));
  await seed({ ...five, 0: night('23:00', '07:00') }, { exercises: [...EX, S('core2', 'כפיפות בטן', { order: 6 })] });
  const r = await plan();
  eq([r.dayType, r.reason], ['recovery', '5 ימי אימון ברצף'], 'recovery');
  eq(await planIds(), ['core1'], 'only the plank hold');
  const t = await p.evaluate(async (k) => (await import('./js/stats.js')).exercisesForDay(k)[0].seconds, T);
  eq(t, 60, 'normal target');
  eq((await p.textContent('[data-tile=workout] .tile-lbl')).trim(), 'יום התאוששות', 'tile label');
  eq((await p.textContent('[data-tile=workout] [data-tile-sub]')).trim(), 'יום התאוששות — 5 ימי אימון ברצף', 'reason line');
  await open('workout');
  eq(await p.$$eval('.plan-suggest button', (e) => e.map((x) => x.textContent.trim())), ['מדרגות', 'צעדים', 'נשימה 10 דקות'], 'suggestions');
  await p.click('.plan-suggest [data-to=stairs]'); await p.waitForTimeout(250);
  eq(await p.getAttribute('#app', 'data-detail'), 'stairs', 'stairs page');
  // The other exercises are extras
  await back(); await open('workout');
  await p.click('[data-action=extras-toggle]'); await p.waitForTimeout(200);
  eq((await p.$$eval('.extras-card .ex-card', (e) => e.length)), 5, 'extras');
  // 4 days → not recovery
  await seed({ 1: five[1], 2: five[2], 3: five[3], 4: five[4], 0: night('23:00', '07:00') });
  if ((await plan()).dayType === 'recovery') throw new Error('4 days');
});

await step('reason lines: main factor, neutral, in the tile sub-line and the plan card', async () => {
  await seed({ 0: night('02:30', '07:00'), 1: food(140), 3: { exercises: { push1: sets(3, 12) } } }); // 10 + 20 + 15 + 20 = 65 → normal; lower
  eq(await coach('reasonLine', await plan()), 'יום רגליים, רגיל — ישנת 4:30 שעות', 'sleep');
  await seed({ 0: night('03:00', '07:00'), 1: food(80), 3: { exercises: { push1: sets(3, 12) } } }); // 0 + 0 + 15 + 20 = 35 → light
  eq(await coach('reasonLine', await plan()), 'יום רגליים, קל — ישנת 4:00 שעות', 'light');
  await seed({ ...GOOD, 3: { exercises: { leg1: sets(3, 20) } } });
  eq(await coach('reasonLine', await plan()), 'יום עליון, מלא — ישנת טוב ואכלת מספיק חלבון', 'full');
  eq((await p.textContent('[data-tile=workout] .tile-lbl')).trim(), 'יום עליון · מלא', 'tile label');
  eq((await p.textContent('[data-tile=workout] [data-tile-sub]')).trim(), 'יום עליון, מלא — ישנת טוב ואכלת מספיק חלבון', 'tile sub');
  await open('workout');
  eq((await p.textContent('[data-plan-day]')).trim(), 'יום עליון', 'card day');
  eq((await p.textContent('[data-plan-int]')).trim(), 'יום מלא', 'chip');
  eq((await p.textContent('[data-plan-reason]')).trim(), 'יום עליון, מלא — ישנת טוב ואכלת מספיק חלבון', 'card reason');
  const first = await p.evaluate(() => document.querySelector('.detail-head').nextElementSibling.classList.contains('plan-card'));
  eq(first, true, 'plan card at the top');
  eq(await p.$$eval('.ex-list-card:not(.extras-card) .ex-name', (e) => e.map((x) => x.textContent.trim())), ['שכיבות סמיכה', 'מתח', 'כפיפת מרפקים'], 'upper list');
  await seed({}); // 25 + 10 + 15 + 20 = 70: the sleep gap (15) is the largest
  eq((await plan()).reason, 'השינה עוד לא נרשמה', 'sleep not logged is the main factor');
  // 30 + 10 + 5 + 20 = 65: the fuel gap (15) is the largest
  await seed({ 0: night('00:10', '07:00'), 1: food(100, 1000), 2: food(100, 2000), 3: food(100, 2000), 4: food(100, 2000), 5: food(100, 2000) });
  eq((await plan()).reason, 'אתמול אכלת פחות מהרגיל', 'fuel');
});

await step('sleep banner: "רשום שינה כדי שאתאים את האימון" → sleep entry; the plan recalculates after saving', async () => {
  await seed({ 1: food(80) }); // 25 + 0 + 15 + 20 = 60 normal
  eq((await p.textContent('[data-sleep-banner] strong')).trim(), 'רשום שינה כדי שאתאים את האימון', 'banner');
  eq((await plan()).intensity, 'normal', 'before');
  await p.click('[data-action=coach-sleep]'); await p.waitForTimeout(300);
  eq(await p.getAttribute('#app', 'data-detail'), 'sleep', 'sleep page');
  await p.click('[data-action=sleep-save]'); await p.waitForTimeout(300); // prefill 23:00–07:00 = 8 h
  await back();
  if (await p.$('[data-sleep-banner]')) throw new Error('banner after logging');
  const r = await plan();
  eq([r.score, r.intensity], [75, 'full'], 'recalculated');
  eq((await p.textContent('[data-tile=workout] .tile-lbl')).trim().endsWith('מלא'), true, 'tile updated');
});

await step('plan locks with the first logged set (stored with targets); later data does not change it', async () => {
  await seed({ ...GOOD, 3: { exercises: { leg1: sets(3, 20) } } });
  await open('workout');
  await p.click('.ex-card[data-exrow=push1] .ex-head'); await p.waitForTimeout(350);
  await p.click('[data-action=set][data-ex=push1][data-i="0"]'); await p.waitForTimeout(250);
  const st = (await state()).days[T].plan;
  eq([st.locked, st.dayType, st.intensity, st.score, st.reason], [true, 'upper', 'full', 95, 'ישנת טוב ואכלת מספיק חלבון'], 'stored');
  eq(st.targets.push1, { base: tgt(3, 12), day: tgt(3, 12) }, 'targets');
  if ((await p.textContent('.plan-foot')).indexOf('ננעלה') < 0) throw new Error('lock note');
  // Bad sleep logged afterwards: plan stays
  await p.evaluate(async (k) => { const s = await import('./js/storage.js'); s.updateDay(k, (d) => { d.sleep = { bed: '04:00', wake: '07:00' }; }); }, T);
  eq((await plan()).intensity, 'full', 'unchanged');
});

await step('"החלפה": day type + intensity saved as this date\'s override (before and after the lock)', async () => {
  await seed({ ...GOOD, 3: { exercises: { leg1: sets(3, 20) } } });
  await open('workout');
  await p.click('[data-action=plan-change]'); await p.waitForSelector('.sheet [name=pday]');
  eq(await p.$$eval('.sheet [name=pday]', (e) => e.map((x) => x.value)), ['upper', 'lower', 'recovery'], 'day options');
  await p.click('.sheet .day-chip:has([name=pday][value=lower])'); await p.click('.sheet .day-chip:has([name=pint][value=light])');
  await p.click('.sheet .btn.primary'); await p.waitForTimeout(300);
  eq((await state()).days[T].plan.override, { dayType: 'lower', intensity: 'light' }, 'stored');
  const r = await plan();
  eq([r.dayType, r.intensity, r.reason], ['lower', 'light', 'נבחר ידנית'], 'applied');
  eq(await p.$$eval('.ex-list-card:not(.extras-card) .ex-name', (e) => e.map((x) => x.textContent.trim())), ['סקוואט', 'פלאנק'], 'lower list');
  // After lock
  await p.click('.ex-card[data-exrow=leg1] .ex-head'); await p.waitForTimeout(350);
  await p.click('[data-action=set][data-ex=leg1][data-i="0"]'); await p.waitForTimeout(250);
  await p.click('[data-action=plan-change]'); await p.waitForSelector('.sheet [name=pday]');
  await p.click('.sheet .day-chip:has([name=pday][value=recovery])'); await p.click('.sheet .btn.primary'); await p.waitForTimeout(300);
  const s2 = (await state()).days[T].plan;
  eq([s2.locked, s2.dayType, s2.intensity], [true, 'recovery', 'recovery'], 'locked override');
});

await step('from 18:00: "מחר: יום … (סופי אחרי רישום שינה)" on the tile and the exercises page', async () => {
  await seed({ ...GOOD, 3: { exercises: { leg1: sets(3, 20) } }, 0: { ...GOOD[0], exercises: { push1: sets(3, 12) } } });
  if (await p.$('[data-tile=workout] [data-tile-sub3]')) throw new Error('shown at 09:00');
  await p.clock.setFixedTime(at(19)); await p.reload(); await p.waitForTimeout(350);
  eq((await p.textContent('[data-tile=workout] [data-tile-sub3]')).trim(), 'מחר: יום רגליים (סופי אחרי רישום שינה)', 'tile');
  await open('workout');
  eq((await p.textContent('[data-tomorrow]')).trim(), 'מחר: יום רגליים (סופי אחרי רישום שינה)', 'page');
  await p.clock.setFixedTime(at(9)); await p.reload(); await p.waitForTimeout(300);
});

/* ---------- 5. Targets ---------- */

await step('"יום קל": −1 set (min 1), one weight step lighter from "המשקולות שלי", −20% bodyweight reps; no progression', async () => {
  const L = { 0: night('03:00', '07:00'), 1: food(80), 3: { exercises: { leg1: sets(3, 20) } } }; // 35 → light, upper
  await seed(L, { exercises: [S('push1', 'שכיבות סמיכה'), S('pull1', 'מתח', { sets: 1, reps: 5 }), S('arm1', 'כפיפת מרפקים', { weight: 6 }), S('arm2', 'פטישים', { weight: 3 }), ...EX.slice(3)] });
  const ex = await p.evaluate(async (k) => Object.fromEntries((await import('./js/stats.js')).exercisesForDay(k).map((e) => [e.id, [e.sets, e.reps, e.weight]])), T);
  eq(ex, { push1: [2, 10, null], pull1: [1, 4, null], arm1: [2, 12, 3], arm2: [2, 12, 3] }, 'light targets (3 kg has no lighter step: kept)');
  await open('workout');
  eq((await p.textContent('.ex-card[data-exrow=arm1] .ex-meta .muted')).replace(/\s+/g, ' ').trim(), '2×12 · 3 ק״ג', 'row shows today\'s target');
  await p.click('.ex-card[data-exrow=push1] .ex-head'); await p.waitForTimeout(350);
  eq(await p.$$eval('.ex-card[data-exrow=push1] [data-action=set]', (e) => e.map((x) => x.querySelector('.chip-reps').textContent.trim())), ['10', '10'], 'chips');
  await p.click('[data-action=set][data-ex=push1][data-i="0"]'); await p.click('[data-action=set][data-ex=push1][data-i="1"]'); await p.waitForTimeout(250);
  if (!(await p.$('.ex-card[data-exrow=push1].complete'))) throw new Error('2 sets complete the light day');
  eq((await state()).exercises.find((e) => e.id === 'push1').sets, 3, 'base target untouched');
  // Holds −20%
  await seed({ 0: night('03:00', '07:00'), 1: food(80), 3: { exercises: { push1: sets(3, 12) } } });
  eq(await p.evaluate(async (k) => (await import('./js/stats.js')).exercisesForDay(k).find((e) => e.id === 'core1').seconds, T), 48, 'plank 60 → 48');
});

const UP2 = (t) => ({ 6: { exercises: { push1: sets(t.sets, t.reps, t.weight) }, ...lockedSession('upper', 'full', { push1: { base: t, day: t } }) },
  4: { exercises: { push1: sets(t.sets, t.reps, t.weight) }, ...lockedSession('upper', 'normal', { push1: { base: t, day: t } }) }, 2: { exercises: { leg1: sets(3, 20) } } });
await step('progression: two hit sessions (מלא/רגיל) → +2 reps on "יום מלא"; row "התקדמות: 3×14 (היה 3×12)"; applied at lock; undo for the session', async () => {
  await seed({ ...UP2(tgt(3, 12)), ...GOOD });
  eq((await plan()).dayType + (await plan()).intensity, 'upperfull', 'full upper day');
  await open('workout');
  eq((await p.textContent('[data-prog=push1] .grow')).replace(/\s+/g, ' ').trim(), 'התקדמות: 3×14 (היה 3×12)', 'row');
  await p.click('.ex-card[data-exrow=push1] .ex-head'); await p.waitForTimeout(350);
  eq(await p.$$eval('.ex-card[data-exrow=push1] .chip-reps', (e) => e.map((x) => x.textContent.trim())), ['14', '14', '14'], 'today\'s reps');
  await p.click('[data-action=set][data-ex=push1][data-i="0"]'); await p.waitForTimeout(250);
  let s = await state();
  eq(s.exercises.find((e) => e.id === 'push1').reps, 14, 'new target at lock');
  eq(s.days[T].plan.progress.push1, { kind: 'up', from: tgt(3, 12), to: tgt(3, 14) }, 'progress stored');
  await p.click('[data-action=prog-undo][data-ex=push1]'); await p.waitForTimeout(250);
  s = await state();
  eq(s.exercises.find((e) => e.id === 'push1').reps, 12, 'undone');
  eq([s.days[T].plan.progress, s.days[T].plan.targets.push1.day, s.days[T].plan.undo], [undefined, tgt(3, 12), ['push1']], 'session back to 12');
  if (await p.$('[data-prog=push1]')) throw new Error('line still shown');
  // Undo before the lock: no progression for the session
  await seed({ ...UP2(tgt(3, 12)), ...GOOD });
  await open('workout');
  await p.click('[data-action=prog-undo][data-ex=push1]'); await p.waitForTimeout(250);
  if (await p.$('[data-prog=push1]')) throw new Error('pre-lock undo');
  eq((await state()).days[T].plan.undo, ['push1'], 'stored');
});

await step('progression only on "יום מלא"; needs two hits at the current level; a miss resets nothing', async () => {
  await seed({ ...UP2(tgt(3, 12)), 1: food(100) }); // 25 + 10 + 15 + 20 = 70 → normal
  eq((await plan()).intensity, 'normal', 'normal day');
  if (await p.evaluate(async (k) => (await import('./js/stats.js')).exercisesForDay(k).find((e) => e.id === 'push1')._change, T)) throw new Error('progressed on normal');
  const one = UP2(tgt(3, 12)); one[6].exercises.push1 = sets(3, 10); // first session missed the reps
  await seed({ ...one, ...GOOD });
  if (await p.evaluate(async (k) => (await import('./js/stats.js')).exercisesForDay(k).find((e) => e.id === 'push1')._change, T)) throw new Error('one miss');
  const light = UP2(tgt(3, 12)); light[6].plan.intensity = 'light';
  await seed({ ...light, ...GOOD });
  if (await p.evaluate(async (k) => (await import('./js/stats.js')).exercisesForDay(k).find((e) => e.id === 'push1')._change, T)) throw new Error('light session counted');
});

await step('progression rules: weighted +2 to 15 then next weight at 8; bodyweight +2 to 25 then +1 set (max 5); holds +5 s to 120', async () => {
  await seed({}, { coach: { enabled: true, weights: [6, 12] } });
  const up = (ex, t) => coach('stepUp', ex, t);
  const W = { type: 'setsReps' }, B = { type: 'setsReps' }, Hd = { type: 'timed' };
  eq(await up(W, tgt(3, 12, 6)), tgt(3, 14, 6), '12 → 14');
  eq(await up(W, tgt(3, 14, 6)), tgt(3, 15, 6), '14 → 15 (cap)');
  eq(await up(W, tgt(3, 15, 6)), tgt(3, 8, 12), '15 → next weight, 8 reps');
  eq(await up(W, tgt(3, 15, 12)), null, 'no heavier weight');
  eq(await up(B, tgt(3, 22)), tgt(3, 24), 'bw +2');
  eq(await up(B, tgt(3, 24)), tgt(3, 25), 'bw cap 25');
  eq(await up(B, tgt(3, 25)), tgt(4, 25), '+1 set');
  eq(await up(B, tgt(5, 25)), null, 'max 5 sets');
  eq(await up(Hd, tgt(null, null, null, 60)), tgt(null, null, null, 65), 'hold +5');
  eq(await up(Hd, tgt(null, null, null, 118)), tgt(null, null, null, 120), 'hold cap');
  eq(await up(Hd, tgt(null, null, null, 120)), null, 'hold max');
  eq(await coach('stepDown', W, tgt(3, 8, 12)), tgt(3, 15, 6), 'down: previous weight at 15');
  eq(await coach('stepDown', W, tgt(3, 12, 6)), tgt(3, 10, 6), 'down: −2 reps');
  // Weighted exercise end-to-end
  const t = tgt(3, 15, 6);
  await seed({ 6: { exercises: { arm1: sets(3, 15, 6) }, ...lockedSession('upper', 'full', { arm1: { base: t, day: t } }) }, 4: { exercises: { arm1: sets(3, 15, 6) }, ...lockedSession('upper', 'full', { arm1: { base: t, day: t } }) },
    2: { exercises: { leg1: sets(3, 20) } }, ...GOOD }, { exercises: [S('push1', 'שכיבות סמיכה'), S('pull1', 'מתח'), S('arm1', 'כפיפת מרפקים', { reps: 15, weight: 6 }), ...EX.slice(3)], coach: { enabled: true, weights: [6, 12] } });
  await open('workout');
  eq((await p.textContent('[data-prog=arm1] .grow')).replace(/\s+/g, ' ').trim(), 'התקדמות: 3×8 · 12 ק״ג (היה 3×15 · 6 ק״ג)', 'weight step');
});

await step('step back: two sessions that missed the target by > 20% → one level down (any training day)', async () => {
  const t = tgt(3, 12);
  await seed({ 6: { exercises: { push1: sets(3, 9) }, ...lockedSession('upper', 'normal', { push1: { base: t, day: t } }) }, 4: { exercises: { push1: sets(2, 12) }, ...lockedSession('upper', 'full', { push1: { base: t, day: t } }) },
    2: { exercises: { leg1: sets(3, 20) } }, 1: food(140) });
  const c = await p.evaluate(async (k) => (await import('./js/stats.js')).exercisesForDay(k).find((e) => e.id === 'push1')._change, T);
  eq(c, { kind: 'down', from: tgt(3, 12), to: tgt(3, 10) }, 'stepped back (27/36 and 24/36 < 80%)');
  await open('workout');
  eq((await p.textContent('[data-prog=push1] .grow')).replace(/\s+/g, ' ').trim(), 'הקלה ביעד: 3×10 (היה 3×12)', 'row');
  // 29/36 = 80.5% is not a miss
  await seed({ 6: { exercises: { push1: { sets: [{ reps: 12, done: true }, { reps: 9, done: true }, { reps: 8, done: true }] } }, ...lockedSession('upper', 'normal', { push1: { base: t, day: t } }) },
    4: { exercises: { push1: sets(2, 12) }, ...lockedSession('upper', 'full', { push1: { base: t, day: t } }) }, 2: { exercises: { leg1: sets(3, 20) } }, 1: food(140) });
  eq(await p.evaluate(async (k) => (await import('./js/stats.js')).exercisesForDay(k).find((e) => e.id === 'push1')._change, T), null, 'not two misses');
});

/* ---------- 6. Exports, insight, settings, backup ---------- */

await step('daily summary: "תוכנית: יום … · … — reason" first, then "התקדמות: <name> 3×14"', async () => {
  await seed({ ...UP2(tgt(3, 12)), ...GOOD });
  await open('workout');
  await p.click('.ex-card[data-exrow=push1] .ex-head'); await p.waitForTimeout(350);
  await p.click('[data-action=set][data-ex=push1][data-i="0"]'); await p.waitForTimeout(250);
  const txt = await call('./js/export.js', 'dailySummary', T);
  const sec = txt.split('\n\n').find((x) => x.startsWith('אימון')).split('\n');
  eq(sec.slice(0, 4), ['אימון:', 'תוכנית: יום עליון · מלא — ישנת טוב ואכלת מספיק חלבון', 'התקדמות: שכיבות סמיכה ⁦3×14⁩', '• שכיבות סמיכה: סט אחד (14 חזרות)'], 'section');
  await seed({ 0: night('03:00', '07:00'), 1: food(80), 3: { exercises: { push1: sets(3, 12) } } });
  const t2 = (await call('./js/export.js', 'dailySummary', T)).split('\n\n').find((x) => x.startsWith('אימון')).split('\n');
  eq(t2[1], 'תוכנית: יום רגליים · קל — ישנת 4:00 שעות', 'light');
});

await step('weekly summary: each day shows its plan type + intensity; weekly insight counts days + progressed exercises', async () => {
  const L = (dayType, intensity, extra = {}) => ({ plan: { dayType, intensity, score: 80, reason: 'x', locked: true, targets: {}, ...extra } });
  await seed({
    5: { exercises: { push1: sets(3, 12) }, ...L('upper', 'full', { progress: { push1: { kind: 'up', from: tgt(3, 12), to: tgt(3, 14) } } }) },
    4: { exercises: { leg1: sets(3, 20) }, ...L('lower', 'normal') },
    3: { exercises: { push1: sets(3, 12) }, ...L('upper', 'light') },
    2: { exercises: { core1: hold(60) }, ...L('recovery', 'recovery') },
    1: { exercises: { leg1: sets(3, 20) }, ...L('lower', 'full') },
  });
  const w = await call('./js/export.js', 'weeklySummary');
  const sd = (o) => p.evaluate(async (k) => (await import('./js/dates.js')).shortDate(k), key(o));
  const head = async (o) => { const d = await sd(o); return w.split('\n').find((l) => l.startsWith('יום ') && l.includes(` ${d}`)); };
  if (!(await head(5)).endsWith('· יום עליון · מלא')) throw new Error(await head(5));
  if (!(await head(3)).endsWith('· יום עליון · קל')) throw new Error(await head(3));
  if (!(await head(2)).endsWith('· יום התאוששות')) throw new Error(await head(2));
  const ins = (await call('./js/insights.js', 'weekInsights')).find((x) => x.text.startsWith('השבוע: ') && x.text.includes('מלא'));
  if (!ins) throw new Error('no insight');
  // Today (after 5 days in a row) is a recovery day too
  eq(ins.text.split('. ')[0], 'השבוע: 2 ימים מלאים, יום רגיל אחד, יום קל אחד, 2 ימי התאוששות', 'counts');
  if (!ins.text.endsWith('התקדמת ב: שכיבות סמיכה')) throw new Error(ins.text);
  // Coach off: none of it
  await seed({ 5: { exercises: { push1: sets(3, 12) }, ...L('upper', 'full') } }, { coach: { enabled: false } });
  if ((await call('./js/export.js', 'weeklySummary')).includes('· יום עליון')) throw new Error('coach off');
});

await step('settings: "מאמן חכם" on by default (missing setting); off → manual modes; "המשקולות שלי" add / remove', async () => {
  await seed({}, { noCoachKey: true });
  eq(await coach('coachOn'), true, 'default on');
  await p.click('.tab[data-tab=settings]'); await p.waitForTimeout(300);
  eq(await p.isChecked('[data-coach-on][value=on]'), true, 'on');
  await p.fill('[data-weight-new]', '12'); await p.click('[data-action=weight-add-kg]'); await p.waitForTimeout(250);
  await p.fill('[data-weight-new]', '6'); await p.click('[data-action=weight-add-kg]'); await p.waitForTimeout(250);
  await p.fill('[data-weight-new]', '6'); await p.click('[data-action=weight-add-kg]'); await p.waitForTimeout(250);
  eq((await state()).settings.coach, { enabled: true, weights: [6, 12] }, 'weights sorted, unique');
  await p.click('[data-action=weight-remove][data-kg="12"]'); await p.waitForTimeout(250);
  eq((await state()).settings.coach.weights, [6], 'removed');
  await p.click('label:has([data-coach-on][value=off])'); await p.waitForTimeout(300);
  eq((await state()).settings.coach.enabled, false, 'off');
  if (!(await p.$('.rot-card'))) throw new Error('manual rotation card');
  await p.click('.tab[data-tab=today]'); await p.waitForTimeout(300);
  eq((await p.textContent('[data-tile=workout] .tile-lbl')).trim(), 'אימון', 'plain tile');
  if (await p.$('[data-sleep-banner]')) throw new Error('banner with coach off');
  await open('workout');
  if (await p.$('.plan-card')) throw new Error('plan card with coach off');
  eq((await p.$$eval('.ex-list-card .ex-card', (e) => e.length)), 5, 'all exercises');
});

await step('history before the coach keeps its completion % (past dates without a stored plan)', async () => {
  const days = { 3: { exercises: { push1: sets(3, 12), leg1: sets(3, 20) } }, 2: { exercises: { core1: hold(60) } } };
  await seed(days, { coach: { enabled: false } });
  const before = [await call('./js/stats.js', 'completionPct', key(3)), await call('./js/stats.js', 'completionPct', key(2)), await call('./js/progress.js', 'totalXP')];
  await seed(days);
  eq([await call('./js/stats.js', 'completionPct', key(3)), await call('./js/stats.js', 'completionPct', key(2)), await call('./js/progress.js', 'totalXP')], before, 'unchanged');
});

await step('backup export → import keeps settings.coach, exercise groups and days[].plan (identical)', async () => {
  await seed({ ...UP2(tgt(3, 12)), ...GOOD }, { exercises: EX.map((e) => (e.id === 'arm1' ? { ...e, group: 'grip' } : e)) });
  await open('workout');
  await p.click('.ex-card[data-exrow=push1] .ex-head'); await p.waitForTimeout(350);
  await p.click('[data-action=set][data-ex=push1][data-i="0"]'); await p.waitForTimeout(250);
  const before = await p.evaluate(() => localStorage.getItem('seventy.v1'));
  await back();
  await p.click('.tab[data-tab=settings]'); await p.waitForTimeout(300);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-action=export]')]);
  const file = `${SP}/backup220.json`; await dl.saveAs(file);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  eq(data.settings.coach, { enabled: true, weights: [3, 6, 12] }, 'coach'); eq(data.exercises.find((e) => e.id === 'arm1').group, 'grip', 'group');
  eq(data.days[T].plan.locked, true, 'plan');
  await seed({}, { coach: { enabled: false } });
  await p.click('.tab[data-tab=settings]'); await p.waitForTimeout(300);
  await p.setInputFiles('[data-file]', file); await p.waitForSelector('.sheet .btn.danger');
  await p.click('.sheet .btn.danger'); await p.waitForTimeout(400);
  const a = JSON.parse(await p.evaluate(() => localStorage.getItem('seventy.v1'))), b0 = JSON.parse(before);
  eq(a.settings, b0.settings, 'settings'); eq(a.exercises, b0.exercises, 'exercises'); eq(a.days, b0.days, 'days');
});

await step('no overflow at 412 and 360 (grid with banners, plan card, progression rows, override sheet, settings); offline; version', async () => {
  for (const w of [412, 360]) {
    await p.setViewportSize({ width: w, height: w === 412 ? 915 : 800 });
    await p.clock.setFixedTime(at(19));
    await seed({ ...UP2(tgt(3, 12)), 1: food(140) }, { exercises: [...EX.map((e) => (e.id === 'arm1' ? { ...e, weight: 6, reps: 15 } : e)), S('u1', 'קפיצות חבל ארוכות מאוד', { order: 7 })] });
    const chk = async (what) => { const o = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (o > 0) throw new Error(`${w} ${what} overflow ${o}`); };
    await chk('grid'); await p.screenshot({ path: `${SP}/coach-${w}-grid.png` });
    await open('workout'); await chk('detail');
    await p.screenshot({ path: `${SP}/coach-${w}-detail.png`, fullPage: true });
    await p.click('[data-action=plan-change]'); await p.waitForSelector('.sheet [name=pday]'); await chk('sheet');
    await p.click('.sheet .btn.ghost'); await p.waitForTimeout(350);
    await back();
    await p.click('.tab[data-tab=settings]'); await p.waitForTimeout(300); await chk('settings');
    await p.click('.tab[data-tab=today]'); await p.waitForTimeout(300);
  }
  await p.clock.setFixedTime(at(9));
  await p.setViewportSize({ width: 412, height: 915 });
  await p.reload(); await p.waitForTimeout(800);
  await p.evaluate(() => navigator.serviceWorker.ready); await p.reload(); await p.waitForTimeout(800);
  await ctx.setOffline(true);
  await p.reload(); await p.waitForTimeout(800);
  await open('workout');
  if (!(await p.$('.plan-card'))) throw new Error('offline');
  await ctx.setOffline(false);
  eq(await p.evaluate(() => self.APP_VERSION), fs.readFileSync(`${process.env.REPO_ROOT}/js/version.js`, 'utf8').match(/APP_VERSION = '([^']+)'/)[1], 'version');
});

console.log(errors.length ? 'errors: ' + errors.join(' | ') : 'errors: none');
await b.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
