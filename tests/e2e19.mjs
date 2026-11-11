// v2.1.0: workout rotation ("סבב אימונים") — settings, day assignment, today's type rules, tile + detail
// page, extras, past dates, exports, weekly insight, backup, layout, offline.
import { chromium } from 'playwright';
import fs from 'fs';
const BASE = process.env.BASE || 'http://127.0.0.1:8765/70/';
const SP = process.env.TEST_OUT;
const b = await chromium.launch();
const CURRENT_VERSION = fs.readFileSync(`${process.env.REPO_ROOT}/js/version.js`, 'utf8').match(/APP_VERSION = '([^']+)'/)[1];
let fails = 0; const step = async (l, fn) => { try { await fn(); console.log('OK  ', l); } catch (e) { fails++; console.log('FAIL', l, '-', e.message.split('\n')[0]); } };
const errors = [];
const DAY = 86400000;
const key = (o = 0) => { const d = new Date(Date.now() - o * DAY); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const T = key(0);
const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, acceptDownloads: true });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => m.type() === 'error' && !/Failed to load resource|openfoodfacts|ERR_FAILED|CORS/.test(m.text()) && errors.push(m.text()));
await p.goto(BASE);

const DAYS = [{ id: 'A', name: 'יום א׳', subtitle: 'ידיים וגוף עליון' }, { id: 'B', name: 'יום ב׳', subtitle: 'רגליים ובטן' }];
const ROT = (o = {}) => ({ mode: 'rotation', startDate: key(20), days: DAYS, ...o });
const X = (id, name, days, order) => ({ id, name, type: 'setsReps', sets: 2, reps: 10, seconds: null, weight: null, order, archived: false, ...(days ? { days } : {}) });
const EX = [X('a1', 'שכיבות סמיכה', ['A'], 0), X('a2', 'כפיפת מרפקים', ['A'], 1), X('b1', 'סקוואט', ['B'], 2), X('c1', 'פלאנק', ['all'], 3)];
const done = (n = 2) => ({ sets: Array.from({ length: n }, () => ({ reps: 10, weight: null, done: true })) });
const SETTINGS = { coach: { enabled: false }, theme: 'flame', startWeight: 90, targetWeight: 80, proteinTarget: 150, stepsTarget: 10000, rideGoalKm: 45, climbsTarget: 6, floorsRegular: 6, floorsRoof: 10, sleepTarget: 8, waterTarget: 2500 };
const seed = async (days = {}, { rotation = ROT(), exercises = EX, settings = {} } = {}) => {
  await p.evaluate(([days, settings, exercises, keys]) => {
    const out = {};
    for (const [o, d] of Object.entries(days)) out[keys[o]] = { rest: false, steps: null, climbs: [], rides: [], exercises: {}, food: [], sleep: null, naps: [], water: [], breathing: [], descents: [], ...d };
    localStorage.setItem('seventy.v1', JSON.stringify({ schemaVersion: 4, settings, exercises, mealPresets: [], customFoods: [], foodMemory: {}, weights: [],
      meta: { lastSeenLevel: 99, seenBadges: [], lastBackupAt: new Date().toISOString() }, photoSessions: [], days: out }));
  }, [days, { ...SETTINGS, ...(rotation ? { rotation } : {}), ...settings }, exercises, Object.fromEntries(Array.from({ length: 60 }, (_, i) => [i, key(i)]))]);
  await p.reload(); await p.waitForTimeout(350);
};
const state = () => p.evaluate(() => JSON.parse(localStorage.getItem('seventy.v1')));
const call = (path, fn, ...args) => p.evaluate(async ([path, fn, args]) => (await import(path))[fn](...args), [path, fn, args]);
const typeOf = (o) => call('./js/rotation.js', 'dayTypeOf', key(o));
const eq = (a, e, what) => { if (JSON.stringify(a) !== JSON.stringify(e)) throw new Error(`${what}: ${JSON.stringify(a)} ≠ ${JSON.stringify(e)}`); };
const open = async (id) => { await p.click(`[data-tile="${id}"] .tile-open`); await p.waitForTimeout(250); };
const back = async () => { await p.click('[data-action=detail-back]'); await p.waitForTimeout(250); };
const exNames = () => p.$$eval('.ex-list-card:not(.extras-card) .ex-name', (e) => e.map((x) => x.textContent.trim()));

/* ---------- Settings ---------- */

await step('settings: "תוכנית אימונים" card, default "כל התרגילים כל יום"; switching to "סבב ימים" stores startDate = today + 2 default days', async () => {
  await seed({}, { rotation: null, exercises: [X('a1', 'שכיבות סמיכה', null, 0)] });
  await p.click('.tab[data-tab=settings]'); await p.waitForTimeout(300);
  if (!(await p.$('.rot-card h2:text("תוכנית אימונים")'))) throw new Error('card');
  eq(await p.isChecked('[data-rot-mode][value=all]'), true, 'default all');
  if (await p.$('.rot-day')) throw new Error('days shown in "all" mode');
  await p.click('label:has([data-rot-mode][value=rotation])'); await p.waitForTimeout(300);
  const r = (await state()).settings.rotation;
  eq([r.mode, r.startDate, r.days.map((d) => d.name)], ['rotation', T, ['יום א׳', 'יום ב׳']], 'rotation');
  eq(await p.$$eval('.rot-day', (e) => e.length), 2, 'rows');
  // Switching back keeps the days; switching again keeps the first startDate.
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('seventy.v1')); s.settings.rotation.startDate = '2026-01-01'; localStorage.setItem('seventy.v1', JSON.stringify(s)); });
  await p.reload(); await p.waitForTimeout(300); await p.click('.tab[data-tab=settings]'); await p.waitForTimeout(300);
  await p.click('label:has([data-rot-mode][value=all])'); await p.waitForTimeout(200);
  eq((await state()).settings.rotation.mode, 'all', 'back to all');
  await p.click('label:has([data-rot-mode][value=rotation])'); await p.waitForTimeout(200);
  eq((await state()).settings.rotation.startDate, '2026-01-01', 'startDate kept');
});

await step('day editing: rename + subtitle, add up to 4 (no 5th), remove down to 2 (no 1st), reorder up/down', async () => {
  await p.fill('[data-rot-field=name][data-i="0"]', 'ידיים'); await p.press('[data-rot-field=name][data-i="0"]', 'Enter'); await p.waitForTimeout(200);
  await p.fill('[data-rot-field=subtitle][data-i="0"]', 'ידיים וגוף עליון'); await p.press('[data-rot-field=subtitle][data-i="0"]', 'Enter'); await p.waitForTimeout(200);
  let r = (await state()).settings.rotation;
  eq([r.days[0].name, r.days[0].subtitle], ['ידיים', 'ידיים וגוף עליון'], 'rename');
  // Empty name is refused
  await p.fill('[data-rot-field=name][data-i="1"]', ''); await p.press('[data-rot-field=name][data-i="1"]', 'Enter'); await p.waitForTimeout(200);
  eq((await state()).settings.rotation.days[1].name, 'יום ב׳', 'empty name refused');
  for (let i = 0; i < 3; i++) if (await p.$('[data-action=rot-add]')) { await p.click('[data-action=rot-add]'); await p.waitForTimeout(200); }
  r = (await state()).settings.rotation;
  eq(r.days.map((d) => d.name), ['ידיים', 'יום ב׳', 'יום א׳', 'יום ג׳'], 'added to 4');
  if (await p.$('[data-action=rot-add]')) throw new Error('5th day possible');
  await p.click('[data-action=rot-down][data-i="0"]'); await p.waitForTimeout(200);
  await p.click('[data-action=rot-up][data-i="3"]'); await p.waitForTimeout(200);
  eq((await state()).settings.rotation.days.map((d) => d.name), ['יום ב׳', 'ידיים', 'יום ג׳', 'יום א׳'], 'reordered');
  for (let i = 0; i < 3; i++) {
    const del = await p.$('[data-action=rot-del][data-i="3"]:not([disabled]), [data-action=rot-del][data-i="2"]:not([disabled])');
    if (!del) break;
    await del.click(); await p.waitForSelector('.sheet .btn.danger'); await p.click('.sheet .btn.danger'); await p.waitForTimeout(300);
  }
  eq((await state()).settings.rotation.days.length, 2, 'min 2');
  eq(await p.$$eval('[data-action=rot-del]', (e) => e.every((x) => x.disabled)), true, 'delete disabled at 2');
});

await step('exercise editor: "באילו ימים" chips (each day + "כל יום"), multi-select, default "כל יום" for existing exercises', async () => {
  await seed({}, { exercises: [X('a1', 'שכיבות סמיכה', null, 0)] });
  await p.click('.tab[data-tab=settings]'); await p.waitForTimeout(300);
  eq((await p.textContent('[data-ex-days]')).trim(), 'כל יום', 'row shows כל יום');
  await p.click('[data-action=ex-edit][data-id=a1]'); await p.waitForSelector('.sheet .days-field');
  eq(await p.$$eval('.sheet .day-chip span', (e) => e.map((x) => x.textContent)), ['כל יום', 'יום א׳', 'יום ב׳'], 'chips');
  eq(await p.$$eval('.sheet [name=days]:checked', (e) => e.map((x) => x.value)), ['all'], 'default all');
  await p.click('.sheet .day-chip:has([value=A])'); await p.click('.sheet .day-chip:has([value=B])');
  eq(await p.$$eval('.sheet [name=days]:checked', (e) => e.map((x) => x.value)), ['A', 'B'], 'multi');
  await p.click('.sheet .btn.primary'); await p.waitForTimeout(300);
  eq((await state()).exercises[0].days, ['A', 'B'], 'saved');
  eq((await p.textContent('[data-ex-days]')).trim(), 'יום א׳, יום ב׳', 'row');
  await p.click('[data-action=ex-edit][data-id=a1]'); await p.waitForSelector('.sheet .days-field');
  await p.click('.sheet .day-chip:has([value=all])');
  eq(await p.$$eval('.sheet [name=days]:checked', (e) => e.map((x) => x.value)), ['all'], '"כל יום" clears days');
  await p.click('.sheet .day-chip:has([value=all])'); // unchecking everything falls back to כל יום
  eq(await p.$$eval('.sheet [name=days]:checked', (e) => e.map((x) => x.value)), ['all'], 'never empty');
  await p.click('.sheet .btn.primary'); await p.waitForTimeout(300);
  eq((await state()).exercises[0].days, ['all'], 'saved all');
  // No chips without a rotation
  await seed({}, { rotation: { mode: 'all', days: DAYS, startDate: T } });
  await p.click('.tab[data-tab=settings]'); await p.waitForTimeout(300);
  await p.click('[data-action=ex-edit][data-id=a1]'); await p.waitForSelector('.sheet [name=name]');
  if (await p.$('.sheet .days-field')) throw new Error('chips in "all" mode');
  await p.click('.sheet .btn.ghost'); await p.waitForTimeout(300);
  // Removing a day: exercises only on that day become "כל יום"
  await seed({}, { rotation: ROT({ days: [...DAYS, { id: 'C', name: 'יום ג׳', subtitle: '' }] }), exercises: [X('a1', 'א', ['C'], 0), X('a2', 'ב', ['A', 'C'], 1)] });
  await p.click('.tab[data-tab=settings]'); await p.waitForTimeout(300);
  await p.click('[data-action=rot-del][data-i="2"]'); await p.click('.sheet .btn.danger'); await p.waitForTimeout(300);
  eq((await state()).exercises.map((e) => e.days), [['all'], ['A']], 'unassigned');
});

/* ---------- Which day is today ---------- */

await step('type rules: first day; after A → B; after B → A (wrap); missed days and rest days do not advance', async () => {
  await seed({});
  eq(await typeOf(0), 'A', 'first day');
  await seed({ 3: { exercises: { a1: done() } } });
  eq(await typeOf(0), 'B', 'after A → B');
  eq(await typeOf(3), 'A', 'logged date keeps its own type');
  eq(await typeOf(1), 'B', 'missed days: still B');
  await seed({ 5: { exercises: { a1: done() } }, 2: { exercises: { b1: done() } } });
  eq(await typeOf(0), 'A', 'after B → A (wrap)');
  await seed({ 4: { exercises: { a1: done() } }, 2: { rest: true }, 1: { steps: 12000 } });
  eq(await typeOf(0), 'B', 'rest day + day without workout do not advance');
  // A logged day without a single-type exercise follows the rotation order
  await seed({ 6: { exercises: { a1: done() } }, 4: { exercises: { c1: done() } } });
  eq([await typeOf(4), await typeOf(0)], ['B', 'A'], '"כל יום" only → next in order');
  // A date's logged sets decide its type, even against the order
  await seed({ 6: { exercises: { a1: done() } }, 3: { exercises: { a1: done(1), a2: done(1) } } });
  eq([await typeOf(3), await typeOf(0)], ['A', 'B'], 'logged A again → A, then B');
  // 3-day rotation wraps after the third
  await seed({ 6: { exercises: { a1: done() } }, 4: { exercises: { b1: done() } }, 2: { exercises: { x1: done() } } }, { rotation: ROT({ days: [...DAYS, { id: 'C', name: 'יום ג׳', subtitle: '' }] }), exercises: [...EX, X('x1', 'מתח', ['C'], 4)] });
  eq(await typeOf(0), 'A', '3-day wrap');
});

await step('manual override: without logged sets (no confirm) and with logged sets (confirm); stored in days[date].workoutDay', async () => {
  await seed({ 3: { exercises: { a1: done() } } });
  await open('workout');
  eq(await p.$$eval('.rot-chip', (e) => e.map((x) => [x.textContent.trim(), x.classList.contains('on')])), [['יום א׳', false], ['יום ב׳', true]], 'chips');
  await p.click('.rot-chip[data-id=A]'); await p.waitForTimeout(300);
  if (await p.$('.sheet')) throw new Error('confirm without sets');
  eq((await state()).days[T].workoutDay, 'A', 'stored');
  eq(await exNames(), ['שכיבות סמיכה', 'כפיפת מרפקים', 'פלאנק'], 'A list');
  // Log a set, then switch → confirm; cancel keeps A, confirm switches
  await p.click('.ex-card[data-exrow=c1] .ex-head'); await p.waitForTimeout(350);
  await p.click('[data-action=set][data-ex=c1][data-i="0"]'); await p.waitForTimeout(250);
  await p.click('.rot-chip[data-id=B]'); await p.waitForSelector('.sheet');
  await p.click('.sheet .btn.ghost, .sheet .btn.secondary'); await p.waitForTimeout(350);
  eq((await state()).days[T].workoutDay, 'A', 'cancel keeps');
  await p.click('.rot-chip[data-id=B]'); await p.waitForSelector('.sheet');
  await p.click('.sheet .btn.primary'); await p.waitForTimeout(350);
  eq((await state()).days[T].workoutDay, 'B', 'switched');
  eq(await exNames(), ['סקוואט', 'פלאנק'], 'B list');
  // A manual choice beats logged sets
  await seed({ 2: { exercises: { a1: done() }, workoutDay: 'B' } });
  eq([await typeOf(2), await typeOf(0)], ['B', 'A'], 'manual beats logged; next follows it');
});

/* ---------- "היום" ---------- */

await step('"אימון" tile: label = day name + subtitle; % counts only that day (+ "כל יום")', async () => {
  await seed({ 0: { exercises: { a1: done(), b1: done() } }, 3: { exercises: { b1: done() } } });
  eq((await p.textContent('[data-tile=workout] .tile-lbl')).trim(), 'יום א׳ · ידיים וגוף עליון', 'label');
  eq((await p.textContent('[data-tile=workout] [data-tile-val]')).replace(/\s/g, ''), '33%', 'a1 of a1,a2,c1');
  eq((await p.textContent('[data-tile=workout] [data-tile-sub]')).trim(), '1 מתוך 3 תרגילים', 'sub');
  eq(await call('./js/stats.js', 'completionPct', T), 33, 'completionPct');
  // B day
  await seed({ 3: { exercises: { a1: done() } }, 0: { exercises: { b1: done(), c1: done() } } });
  eq((await p.textContent('[data-tile=workout] .tile-lbl')).trim(), 'יום ב׳ · רגליים ובטן', 'B label');
  eq((await p.textContent('[data-tile=workout] [data-tile-val]')).replace(/\s/g, ''), '100%', 'B complete');
  // Without a subtitle: name only
  await seed({}, { rotation: ROT({ days: [{ id: 'A', name: 'יום א׳', subtitle: '' }, DAYS[1]] }) });
  eq((await p.textContent('[data-tile=workout] .tile-lbl')).trim(), 'יום א׳', 'no subtitle');
});

await step('detail page: chips on top, "הבא בתור" line, only the day\'s exercises (+ "כל יום")', async () => {
  await seed({});
  await open('workout');
  const first = await p.evaluate(() => document.querySelector('.detail-head').nextElementSibling.classList.contains('rot-bar'));
  eq(first, true, 'chips at the top');
  eq((await p.textContent('[data-rot-next]')).trim(), 'הבא בתור: יום ב׳ · רגליים ובטן', 'next');
  eq((await p.textContent('.rot-sub')).trim(), 'ידיים וגוף עליון', 'subtitle under chips');
  eq(await exNames(), ['שכיבות סמיכה', 'כפיפת מרפקים', 'פלאנק'], 'list');
  await p.click('.rot-chip[data-id=B]'); await p.waitForTimeout(300);
  eq((await p.textContent('[data-rot-next]')).trim(), 'הבא בתור: יום א׳ · ידיים וגוף עליון', 'next after B wraps');
  // Status line + rest day logic unchanged
  await back();
  eq((await p.textContent('[data-tile=workout] [data-tile-sub2]')).trim(), 'עוד 2 תרגילים', 'status counts the day');
  await open('workout');
  await p.click('[data-action=rest]'); await p.waitForTimeout(300);
  await back();
  eq((await p.textContent('[data-tile=workout] [data-tile-sub2]')).trim(), 'עוד 10,000 צעדים', 'rest skips exercises');
});

await step('extras: collapsed "תרגילים מימים אחרים", logging saves normally (records, XP, history) but not in the day\'s %', async () => {
  await seed({});
  await open('workout');
  eq(await p.$$eval('.extras-card .ex-card', (e) => e.length), 0, 'collapsed');
  eq((await p.textContent('.extras-head h2')).trim(), 'תרגילים מימים אחרים', 'title');
  await p.click('[data-action=extras-toggle]'); await p.waitForTimeout(250);
  eq(await p.$$eval('.extras-card .ex-name', (e) => e.map((x) => x.textContent.trim())), ['סקוואט'], 'extras list');
  const xp0 = await call('./js/progress.js', 'dayXP', T);
  await p.click('.extras-card .ex-card[data-exrow=b1] .ex-head'); await p.waitForTimeout(350);
  await p.click('.extras-card [data-action=set][data-ex=b1][data-i="0"]'); await p.waitForTimeout(250);
  await p.click('.extras-card [data-action=set][data-ex=b1][data-i="1"]'); await p.waitForTimeout(250);
  const s = await state();
  eq(s.days[T].exercises.b1.sets.filter((x) => x.done).length, 2, 'saved');
  eq(s.days[T].workoutDay, 'A', 'the day stays A (pinned)');
  eq(await call('./js/stats.js', 'completionPct', T), 0, 'not in %');
  eq((await call('./js/progress.js', 'dayXP', T)) - xp0, 4, 'XP for the sets');
  const recs = await call('./js/stats.js', 'computeRecords');
  if (!recs.records.some((r) => r.id === 'reps:b1')) throw new Error('record');
  eq(await p.$$eval('.ex-list-card:not(.extras-card) .ex-card', (e) => e.length), 3, 'main list unchanged');
  await back();
  eq((await p.textContent('[data-tile=workout] [data-tile-val]')).replace(/\s/g, ''), '0%', 'tile %');
  // Without a rotation: no chips, no extras
  await seed({}, { rotation: null });
  await open('workout');
  if (await p.$('.rot-bar') || await p.$('.extras-card')) throw new Error('rotation UI without rotation');
  eq((await exNames()).length, 4, 'all exercises');
});

await step('dates before startDate keep the old behavior (all exercises, same %); the date nav shows them', async () => {
  const days = { 25: { exercises: { a1: done(), b1: done() } }, 22: { exercises: { c1: done() } } };
  await seed(days, { rotation: null });
  const before = [await call('./js/stats.js', 'completionPct', key(25)), await call('./js/stats.js', 'completionPct', key(22)), await call('./js/stats.js', 'currentStreak'), await call('./js/progress.js', 'totalXP')];
  await seed(days);
  const after = [await call('./js/stats.js', 'completionPct', key(25)), await call('./js/stats.js', 'completionPct', key(22)), await call('./js/stats.js', 'currentStreak'), await call('./js/progress.js', 'totalXP')];
  eq(after, before, 'unchanged');
  eq(await typeOf(25), null, 'no type before start');
  eq(await typeOf(0), 'A', 'pre-start workouts do not count');
  for (let i = 0; i < 25; i++) await p.click('[data-action=date-prev]');
  await p.waitForTimeout(200);
  eq((await p.textContent('[data-tile=workout] .tile-lbl')).trim(), 'אימון', 'plain label');
  await open('workout');
  if (await p.$('.rot-bar')) throw new Error('chips before start');
  eq((await exNames()).length, 4, 'all exercises');
});

/* ---------- Exports + insights ---------- */

await step('daily summary: "אימון — יום א׳ · ידיים וגוף עליון:" + extras under "תוספות:"', async () => {
  await seed({ 0: { exercises: { a1: done(), b1: done(1) }, workoutDay: 'A' } });
  const txt = await call('./js/export.js', 'dailySummary', T);
  const sec = txt.split('\n\n').find((x) => x.startsWith('אימון'));
  eq(sec.split('\n'), ['אימון — יום א׳ · ידיים וגוף עליון:', '• שכיבות סמיכה: 2 סטים (10, 10 חזרות)', 'תוספות:', '• סקוואט: סט אחד (10 חזרות)', 'השלמה: 33% (1 מתוך 3 תרגילים)'], 'section');
  await seed({ 0: { exercises: { a1: done() } } }, { rotation: null });
  const old = (await call('./js/export.js', 'dailySummary', T)).split('\n\n').find((x) => x.startsWith('אימון'));
  if (!old.startsWith('אימון:\n') || old.includes('תוספות')) throw new Error(old);
});

await step('weekly summary: each workout day shows its workout day name; extras listed', async () => {
  await seed({ 4: { exercises: { a1: done() } }, 2: { exercises: { b1: done(), a2: done(1) } }, 1: { rest: true } });
  const txt = await call('./js/export.js', 'weeklySummary');
  const head = (o) => txt.split('\n').find((l) => l.startsWith('יום ') && l.includes(o));
  const sd = (o) => p.evaluate(async (k) => (await import('./js/dates.js')).shortDate(k), key(o));
  if (!head(await sd(4)).endsWith('· יום א׳')) throw new Error(head(await sd(4)));
  if (!head(await sd(2)).endsWith('· יום ב׳')) throw new Error(head(await sd(2)));
  if (head(await sd(1)).includes('יום א׳') || head(await sd(1)).includes('יום ב׳')) throw new Error('rest day got a type');
  if (!txt.includes('כפיפת מרפקים: סט אחד (10 חזרות)')) throw new Error('extra missing');
});

await step('weekly insight: counts per type this week, only after 2 full rotations', async () => {
  // 3 workouts since start (< 2 × 2) → no insight
  await seed({ 10: { exercises: { a1: done() } }, 5: { exercises: { b1: done() } }, 3: { exercises: { a1: done() } } });
  let ins = await call('./js/insights.js', 'weekInsights');
  if (ins.some((x) => x.id === 'week:rotation' || x.id === 'rotation' || x.text.startsWith('השבוע: '))) throw new Error('shown below minimum');
  // 5 workouts: A B A B A → this week (last 7 days): A, B, A
  await seed({ 12: { exercises: { a1: done() } }, 9: { exercises: { b1: done() } }, 5: { exercises: { a1: done() } }, 3: { exercises: { b1: done() } }, 1: { exercises: { a1: done() } } });
  ins = await call('./js/insights.js', 'weekInsights');
  const r = ins.find((x) => x.text.startsWith('השבוע: '));
  if (!r) throw new Error('missing ' + ins.map((x) => x.text).join(' | '));
  eq(r.text, 'השבוע: 2 ימי ידיים וגוף עליון, יום רגליים ובטן אחד', 'text');
  // Not in "all" mode
  await seed({ 12: { exercises: { a1: done() } }, 9: { exercises: { b1: done() } }, 5: { exercises: { a1: done() } }, 3: { exercises: { b1: done() } }, 1: { exercises: { a1: done() } } }, { rotation: ROT({ mode: 'all' }) });
  ins = await call('./js/insights.js', 'weekInsights');
  if (ins.some((x) => x.text.startsWith('השבוע: '))) throw new Error('shown in all mode');
  eq(await call('./js/insights.js', 'rotationText', { name: 'יום א׳', subtitle: '' }, 2), 'יום א׳ 2 פעמים', 'no-subtitle wording');
});

await step('backup export → import keeps settings.rotation, exercise days and workoutDay (identical)', async () => {
  await seed({ 2: { exercises: { a1: done() }, workoutDay: 'B' } });
  const before = await p.evaluate(() => localStorage.getItem('seventy.v1'));
  await p.click('.tab[data-tab=settings]'); await p.waitForTimeout(300);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-action=export]')]);
  const file = `${SP}/backup210.json`; await dl.saveAs(file);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  eq(data.settings.rotation, ROT(), 'file rotation'); eq(data.exercises.map((e) => e.days), [['A'], ['A'], ['B'], ['all']], 'file days');
  eq(data.days[key(2)].workoutDay, 'B', 'file workoutDay');
  await seed({}, { rotation: null });
  await p.click('.tab[data-tab=settings]'); await p.waitForTimeout(300);
  await p.setInputFiles('[data-file]', file); await p.waitForSelector('.sheet .btn.danger');
  await p.click('.sheet .btn.danger'); await p.waitForTimeout(400);
  const a = JSON.parse(await p.evaluate(() => localStorage.getItem('seventy.v1'))), b0 = JSON.parse(before);
  eq(a.settings, b0.settings, 'settings'); eq(a.exercises, b0.exercises, 'exercises'); eq(a.days, b0.days, 'days');
});

await step('no overflow at 412 and 360 (settings card with 4 days, editor sheet, detail page with chips + extras); offline', async () => {
  for (const w of [412, 360]) {
    await p.setViewportSize({ width: w, height: w === 412 ? 915 : 800 });
    await seed({ 0: { exercises: { a1: done(1) } } }, { rotation: ROT({ days: [...DAYS, { id: 'C', name: 'יום ג׳', subtitle: 'גב וכתפיים' }, { id: 'D', name: 'יום ד׳', subtitle: 'אירובי ארוך מאוד' }] }) });
    const chk = async (what) => { const o = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (o > 0) throw new Error(`${w} ${what} overflow ${o}`); };
    await open('workout'); await p.click('[data-action=extras-toggle]'); await p.waitForTimeout(250); await chk('detail');
    const clip = await p.evaluate(() => [...document.querySelectorAll('.rot-chip')].some((c) => c.getBoundingClientRect().right > innerWidth || c.getBoundingClientRect().left < 0));
    if (clip) throw new Error(`${w} chips clipped`);
    await back(); await chk('grid');
    await p.click('.tab[data-tab=settings]'); await p.waitForTimeout(300); await chk('settings');
    await p.click('[data-action=ex-edit][data-id=a1]'); await p.waitForSelector('.sheet .days-field'); await chk('editor');
    await p.click('.sheet .btn.ghost'); await p.waitForTimeout(350);
    await p.screenshot({ path: `${SP}/rot-${w}-settings.png`, fullPage: true });
  }
  await p.setViewportSize({ width: 412, height: 915 });
  await p.click('.tab[data-tab=today]'); await p.waitForTimeout(300);
  await open('workout'); await p.screenshot({ path: `${SP}/rot-412-detail.png` }); await back();
  await p.evaluate(() => navigator.serviceWorker.ready); await p.reload(); await p.waitForTimeout(800);
  await ctx.setOffline(true);
  await p.reload(); await p.waitForTimeout(800);
  await open('workout');
  if (!(await p.$('.rot-bar'))) throw new Error('offline');
  await ctx.setOffline(false);
  eq(await p.evaluate(() => self.APP_VERSION), CURRENT_VERSION, 'version');
});

console.log(errors.length ? 'errors: ' + errors.join(' | ') : 'errors: none');
await b.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
