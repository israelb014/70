// v2.0.0: tile dashboards on "היום" and "מגמות" — order, quick actions + undo, detail pages + back,
// past days, 7-day math, mini visuals, empty states, edit mode, list fallback, backup, shortcuts, layout.
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
const T = key(0), Y = key(1);
const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, acceptDownloads: true });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
const p = await ctx.newPage();
const watch = (pg) => { pg.on('pageerror', (e) => errors.push(e.message)); pg.on('console', (m) => m.type() === 'error' && !/Failed to load resource|openfoodfacts|ERR_FAILED|CORS/.test(m.text()) && errors.push(m.text())); };
watch(p);
await p.goto(BASE);
const SETTINGS = { coach: { enabled: false }, theme: 'flame', startWeight: 90, targetWeight: 80, proteinTarget: 150, stepsTarget: 10000, rideGoalKm: 45, climbsTarget: 6, floorsRegular: 6, floorsRoof: 10, sleepTarget: 8, waterTarget: 2500, breathGoal: 5 };
const EX = [{ id: 'e1', name: 'שכיבות סמיכה', type: 'setsReps', sets: 2, reps: 10, seconds: null, weight: null, order: 0, archived: false }];
const seed = async (days = {}, { settings = {}, weights = [], photoSessions = [], exercises = EX } = {}, url = BASE) => {
  await p.evaluate(([days, settings, weights, photoSessions, exercises, keys]) => {
    const out = {};
    for (const [o, d] of Object.entries(days)) out[keys[o]] = { rest: false, steps: null, climbs: [], rides: [], exercises: {}, food: [], sleep: null, naps: [], water: [], breathing: [], descents: [], ...d };
    localStorage.setItem('seventy.v1', JSON.stringify({ schemaVersion: 4, settings, exercises, mealPresets: [], customFoods: [], foodMemory: {},
      weights: weights.map(([o, kg]) => ({ date: keys[o], kg })).sort((a, b) => a.date.localeCompare(b.date)),
      meta: { lastSeenLevel: 99, seenBadges: ['breath1', 'kg5', 'kg10', 'streak7', 'steps10k', 'ride30', 'climb1'], lastBackupAt: new Date().toISOString() },
      photoSessions: photoSessions.map(([o]) => ({ date: keys[o], poses: ['front'] })), days: out }));
  }, [days, { ...SETTINGS, ...settings }, weights, photoSessions, exercises, Object.fromEntries(Array.from({ length: 40 }, (_, i) => [i, key(i)]))]);
  if (url === BASE) await p.reload(); else await p.goto(url);
  await p.waitForTimeout(350);
};
const state = () => p.evaluate(() => JSON.parse(localStorage.getItem('seventy.v1')));
const tileIds = () => p.$$eval('.tile-grid .tile', (e) => e.map((x) => x.dataset.tile));
const tileVal = (id) => p.textContent(`[data-tile="${id}"] [data-tile-val]`).then((t) => t.replace(/\s+/g, ' ').trim());
const tileSub = (id) => p.textContent(`[data-tile="${id}"] [data-tile-sub]`).then((t) => t.replace(/\s+/g, ' ').trim());
const tileSub2 = (id) => p.textContent(`[data-tile="${id}"] [data-tile-sub2]`).then((t) => t.replace(/\s+/g, ' ').trim());
const open = async (id) => { await p.click(`[data-tile="${id}"] .tile-open`); await p.waitForTimeout(250); };
const back = async () => { await p.click('[data-action=detail-back]'); await p.waitForTimeout(250); };
const detail = () => p.evaluate(() => document.getElementById('app').dataset.detail);
const toastUndo = async () => { await p.click('.toast button'); await p.waitForTimeout(250); };
const HOME = ['workout', 'steps', 'protein', 'fluids', 'stairs', 'sleep', 'breath', 'rides', 'kcal', 'weight'];
const TRENDS = ['heatmap', 'weight', 'steps', 'protein', 'fluids', 'sleep', 'stairs', 'rides', 'breath', 'kcal', 'records', 'achievements', 'photos'];
const eq = (a, e, what) => { if (a !== e) throw new Error(`${what}: ${JSON.stringify(a)} ≠ ${JSON.stringify(e)}`); };

/* ---------- היום ---------- */

await step('היום: default order + all visible; אימון full width; header has date arrows, level + streak chips, "עריכה"', async () => {
  await seed({ 0: { steps: 4000 } });
  eq((await tileIds()).join(','), HOME.join(','), 'order');
  const full = await p.$$eval('.tile.full', (e) => e.map((x) => x.dataset.tile));
  eq(full.join(','), 'workout', 'full');
  const w = await p.evaluate(() => [document.querySelector('[data-tile=workout]').getBoundingClientRect().width, document.querySelector('.tile-grid').getBoundingClientRect().width]);
  if (Math.abs(w[0] - w[1]) > 1) throw new Error('workout not full ' + w);
  for (const s of ['[data-action=date-prev]', '[data-action=date-next]', '.dash-chip[data-action=achievements]', '.streak-chip', '[data-action=layout-edit][data-layout=home]']) if (!(await p.$(s))) throw new Error(s);
  // Grid → insight carousel → "העתק סיכום יומי"
  const order = await p.evaluate(() => [...document.getElementById('app').children].map((c) => c.className.split(' ')[0] || c.tagName));
  const gi = order.indexOf('tile-grid');
  if (!(order[gi + 1] === 'card' && order[gi + 2] === 'btn')) throw new Error(order.join(','));
  if (!(await p.$('.tile-grid + .insight-card + [data-action=copy-daily]'))) throw new Error('order under grid');
});

await step('tile anatomy (v2.3 look): 2 columns, 10px gap, radius 20, tinted bg + border in the tile color, icon + 16px colored label, big tabular value in an LTR isolate, 7-day line beside it', async () => {
  const m = await p.evaluate(() => {
    const g = getComputedStyle(document.querySelector('.tile-grid'));
    const o = document.querySelector('[data-tile=steps] .tile-open');
    const cs = getComputedStyle(o);
    const v = document.querySelector('[data-tile=steps] [data-tile-val]');
    return { cols: g.gridTemplateColumns.split(' ').length, gap: g.columnGap, rgap: g.rowGap, r: cs.borderRadius, h: o.getBoundingClientRect().height,
      lbl: getComputedStyle(document.querySelector('[data-tile=steps] .tile-lbl')).fontSize, ic: !!document.querySelector('[data-tile=steps] .tile-head svg'),
      val: getComputedStyle(v).fontSize, tab: getComputedStyle(v).fontVariantNumeric, bdi: v.querySelector('bdi[dir=ltr]') !== null, sub: !!document.querySelector('[data-tile=steps] [data-tile-sub]'),
      lblColor: getComputedStyle(document.querySelector('[data-tile=steps] .tile-lbl')).color, bg: cs.backgroundColor, border: cs.borderTopColor, bw: cs.borderTopWidth,
      spark: document.querySelectorAll('[data-tile=steps] .tile-body > .tile-vis .spark').length };
  });
  eq(m.cols, 2, 'cols'); eq(m.gap, '10px', 'gap'); eq(m.rgap, '10px', 'row gap'); eq(m.r, '20px', 'radius'); eq(m.lbl, '16px', 'label');
  if (parseFloat(m.val) < 28) throw new Error('value size ' + m.val);
  eq(m.lblColor, 'rgb(255, 176, 32)', 'label in the steps color'); eq(m.bw, '1px', 'border');
  if (!/rgb|color/.test(m.bg) || m.bg === 'rgb(22, 26, 32)') throw new Error('not tinted ' + m.bg);
  eq(m.spark, 1, '7-day line');
  if (m.h < 96 || !m.ic || !/tabular/.test(m.tab) || !m.bdi || !m.sub) throw new Error(JSON.stringify(m));
});

await step('tile values for today: steps / protein / fluids / stairs / sleep / breath / rides / kcal / weight', async () => {
  await seed({
    0: { steps: 6500, food: [{ name: 'עוף', grams: 200, kcal: 330, protein: 62, source: 'db' }, { name: 'קפה הפוך', grams: 240, kcal: 120, protein: 6.5, source: 'db', fluid: true }],
      water: [{ ml: 750, time: '09:00' }], climbs: [{ type: 'regular', floors: 6 }, { type: 'roof', floors: 10 }], descents: [{ type: 'regular', floors: 6, time: '10:00' }],
      sleep: { bed: '23:30', wake: '06:30' }, naps: [{ start: '15:00', end: '15:30' }], breathing: [{ technique: 'calm', minutes: 3, time: '07:00' }], rides: [{ km: 12.5, minutes: 40 }] },
    3: { rides: [{ km: 30, minutes: 90 }] },
  }, { weights: [[8, 88.4], [2, 87.6]] });
  eq(await tileVal('steps'), '6,000'.replace('6,000', '6,500'), 'steps'); eq(await tileSub('steps'), 'מתוך 10,000', 'steps sub');
  eq(await tileVal('protein'), '69 ג׳', 'protein'); eq(await tileSub('protein'), 'מתוך 150', 'protein sub');
  const fl = await tileVal('fluids');
  if (!/^\d[.,]\d{1,2} ליטר$/.test(fl)) throw new Error('fluids ' + fl);
  eq(await tileSub('fluids'), 'מתוך 2.5', 'fluids sub');
  eq(await tileVal('stairs'), '16/36', 'stairs'); eq(await tileSub('stairs'), '2 עליות · ירידה אחת', 'stairs sub');
  eq(await tileVal('sleep'), '7 שע׳ 30 ד׳', 'sleep total incl. nap'); eq(await tileSub('sleep'), 'יעד 8 שעות', 'sleep sub');
  eq(await tileVal('breath'), '3 דק׳', 'breath'); eq(await tileSub('breath'), 'יעד 5', 'breath sub');
  eq(await tileVal('rides'), '12.5 ק״מ', 'rides'); eq(await tileSub('rides'), 'שיא 30 · יעד 45', 'rides sub');
  eq(await tileVal('kcal'), '450', 'kcal'); eq(await tileSub('kcal'), 'היום', 'kcal sub');
  eq(await tileVal('weight'), '87.6 ק״ג', 'weight');
  const d = await p.getAttribute('[data-tile=weight] .delta', 'data-delta');
  eq(d, '-0.8', 'weight delta vs a week ago');
  if (!(await p.$('[data-tile=weight] .delta.good'))) throw new Error('weight down = success color');
  eq(await p.getAttribute('[data-tile=weight] .spark', 'data-points'), '88.4,87.6', 'sparkline points');
  // v2.3: a 7-day line in the tile's color (oldest → today)
  eq(await p.getAttribute('[data-tile=steps] .spark', 'data-points'), '0,0,0,0,0,0,6500', 'steps 7-day line');
  eq(await p.getAttribute('[data-tile=steps] .spark', 'style'), '--c:var(--steps)', 'steps color');
  // Workout ring + status line moved into the tile
  eq(await tileVal('workout'), '0%', 'workout'); eq(await tileSub('workout'), '0 מתוך 1 תרגילים', 'workout sub');
  eq(await tileSub2('workout'), 'עוד תרגיל אחד', 'status line');
});

await step('no data → "—" + "עוד אין נתונים" (no visual)', async () => {
  await seed({}, { exercises: [] });
  for (const id of HOME) {
    eq(await tileVal(id), '—', id + ' value');
    eq(await tileSub(id), 'עוד אין נתונים', id + ' sub');
  }
  if (await p.$('[data-tile=steps] .tile-vis')) throw new Error('visual on empty tile');
  eq(await tileSub2('workout'), 'עוד 10,000 צעדים', 'status line still shown');
});

await step('quick +1,000 steps: toast + undo; the tile never opens', async () => {
  await seed({ 0: { steps: 2000 } });
  await p.click('[data-tile=steps] .tile-quick');
  await p.waitForTimeout(200);
  eq(await detail(), '', 'quick action opened the tile');
  eq((await state()).days[T].steps, 3000, 'added');
  eq((await p.textContent('.toast')).includes('נוספו 1,000 צעדים'), true, 'toast');
  await toastUndo();
  eq((await state()).days[T].steps, 2000, 'undo');
  eq(await tileVal('steps'), '2,000', 'tile after undo');
});

await step('quick +250 ml water: toast + undo; target toast when reached', async () => {
  await seed({ 0: { water: [{ ml: 2300, time: '08:00' }] } });
  await p.click('[data-tile=fluids] .tile-quick');
  await p.waitForTimeout(200);
  eq(await detail(), '', 'opened');
  eq((await state()).days[T].water.map((w) => w.ml).join(','), '2300,250', 'added');
  eq((await p.textContent('.toast')).includes('יעד המים הושג'), true, 'target toast');
  await toastUndo();
  eq((await state()).days[T].water.length, 1, 'undo');
  await p.click('[data-tile=fluids] .tile-quick');
  await p.waitForTimeout(200);
  eq((await p.textContent('.toast')).includes('יעד המים הושג') || (await p.textContent('.toast')).includes('נוספו 250'), true, 'toast');
});

await step('quick +1 regular climb (with time): toast + undo removes exactly that climb', async () => {
  await seed({ 0: { climbs: [{ type: 'roof', floors: 10 }] } });
  await p.click('[data-tile=stairs] .tile-quick');
  await p.waitForTimeout(200);
  const c = (await state()).days[T].climbs;
  if (c.length !== 2 || c[1].type !== 'regular' || c[1].floors !== 6 || !/^\d\d:\d\d$/.test(c[1].time) || !c[1].at) throw new Error(JSON.stringify(c));
  eq(await tileVal('stairs'), '16/36', 'tile');
  eq((await p.textContent('.toast')).includes('נוספה עלייה רגילה'), true, 'toast');
  await toastUndo();
  eq(JSON.stringify((await state()).days[T].climbs), JSON.stringify([{ type: 'roof', floors: 10 }]), 'undo');
});

await step('quick food search (חלבון / קלוריות) → "אוכל" with the search focused', async () => {
  for (const id of ['protein', 'kcal']) {
    await seed({});
    await p.click(`[data-tile=${id}] .tile-quick`);
    await p.waitForTimeout(300);
    eq(await p.getAttribute('#app', 'data-tab'), 'food', id + ' tab');
    eq(await p.evaluate(() => document.activeElement?.matches('[data-search]')), true, id + ' focus');
  }
});

await step('quick play (נשימה) → breathing setup; quick + (אופניים) → ride sheet; quick + (משקל) → weigh-in sheet', async () => {
  await seed({});
  await p.click('[data-tile=breath] .tile-quick');
  await p.waitForSelector('.sheet .tech-list');
  eq(await detail(), '', 'opened');
  await p.keyboard.press('Escape'); await p.click('.sheet-backdrop', { position: { x: 5, y: 5 } }).catch(() => {}); await p.waitForTimeout(400);
  await p.click('[data-tile=rides] .tile-quick');
  await p.waitForSelector('.sheet [name=km]');
  await p.fill('.sheet [name=km]', '18'); await p.click('.sheet .btn.primary'); await p.waitForTimeout(300);
  eq((await state()).days[T].rides[0].km, 18, 'ride');
  eq(await tileVal('rides'), '18 ק״מ', 'tile');
  await p.click('[data-tile=weight] .tile-quick');
  await p.waitForSelector('.sheet [name=kg]');
  eq(await p.inputValue('.sheet [name=date]'), T, 'date default');
  await p.fill('.sheet [name=kg]', '86.2'); await p.click('.sheet .btn.primary'); await p.waitForTimeout(300);
  eq(JSON.stringify((await state()).weights), JSON.stringify([{ date: T, kg: 86.2 }]), 'weight saved');
  eq(await tileVal('weight'), '86.2 ק״ג', 'tile');
});

await step('each tile opens its detail page (the existing card) and back returns to the grid', async () => {
  await seed({ 0: { steps: 1000 } }, { weights: [[1, 88]] });
  const cards = { workout: '.hero', steps: '[data-change=steps]', fluids: '.water-card', stairs: '.card:has(.descent-row)', sleep: '.card.role-sleep [data-action=sleep-save]', breath: '.breath-card', rides: '[data-action=ride-new]', weight: '[data-action=weight-add]' };
  for (const [id, sel] of Object.entries(cards)) {
    await open(id);
    eq(await detail(), id, id + ' detail');
    if (!(await p.$(sel))) throw new Error(id + ' card missing');
    if (await p.$('.tile-grid')) throw new Error(id + ' grid still shown');
    if (!(await p.$('.detail-head [data-action=detail-back]'))) throw new Error(id + ' back');
    await back();
    eq(await detail(), '', id + ' back');
    if (!(await p.$('.tile-grid'))) throw new Error(id + ' grid not back');
  }
  // The workout page also carries the exercise rows and "יום מנוחה".
  await open('workout');
  for (const s of ['.ex-card', '[data-action=rest]', '.hero-status']) if (!(await p.$(s))) throw new Error('workout ' + s);
  await back();
  // חלבון / קלוריות: the food totals live on "אוכל".
  await open('protein');
  eq(await p.getAttribute('#app', 'data-tab'), 'food', 'protein → food');
});

await step('back also works by browser/Android back, by tapping the active tab, and by an edge swipe', async () => {
  await seed({});
  await open('fluids');
  await p.goBack(); await p.waitForTimeout(300);
  eq(await detail(), '', 'history back');
  eq(await p.getAttribute('#app', 'data-tab'), 'today', 'still on today');
  await open('sleep');
  await p.click('.tab[data-tab=today]'); await p.waitForTimeout(300);
  eq(await detail(), '', 'tab tap');
  await open('steps');
  const swiped = await p.evaluate(async () => {
    const app = document.getElementById('app');
    const W = innerWidth;
    const t = (x) => new Touch({ identifier: 1, target: app, clientX: x, clientY: 400 });
    app.dispatchEvent(new TouchEvent('touchstart', { touches: [t(W - 10)], changedTouches: [t(W - 10)], bubbles: true }));
    app.dispatchEvent(new TouchEvent('touchmove', { touches: [t(W - 80)], changedTouches: [t(W - 80)], bubbles: true }));
    app.dispatchEvent(new TouchEvent('touchmove', { touches: [t(W - 180)], changedTouches: [t(W - 180)], bubbles: true }));
    app.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t(W - 180)], bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    return app.dataset.detail;
  });
  eq(swiped, '', 'swipe back');
  // A short swipe does not go back
  await open('steps');
  const stay = await p.evaluate(async () => {
    const app = document.getElementById('app'); const W = innerWidth;
    const t = (x) => new Touch({ identifier: 1, target: app, clientX: x, clientY: 400 });
    app.dispatchEvent(new TouchEvent('touchstart', { touches: [t(W - 10)], changedTouches: [t(W - 10)], bubbles: true }));
    app.dispatchEvent(new TouchEvent('touchmove', { touches: [t(W - 40)], changedTouches: [t(W - 40)], bubbles: true }));
    app.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t(W - 40)], bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    return app.dataset.detail;
  });
  eq(stay, 'steps', 'short swipe');
  // Another tab closes it; the detail survives a visit to "הישגים" and back
  await back();
  await open('workout');
  await p.click('.hero [data-action=achievements]'); await p.waitForTimeout(300);
  await p.click('[data-action=back]'); await p.waitForTimeout(300);
  eq(await detail(), 'workout', 'kept across a screen');
  await p.click('.tab[data-tab=food]'); await p.click('.tab[data-tab=today]'); await p.waitForTimeout(300);
  eq(await detail(), '', 'tab change closes');
});

await step('actions inside a detail page work as before (water card +כוס, undo button; stairs buttons)', async () => {
  await seed({});
  await open('fluids');
  await p.click('[data-action=water-add][data-ml="500"]'); await p.waitForTimeout(200);
  eq((await state()).days[T].water.length, 1, 'added');
  eq(await detail(), 'fluids', 'stays on the page');
  await p.click('[data-action=water-undo]'); await p.waitForTimeout(200);
  eq((await state()).days[T].water.length, 0, 'undo');
  await back();
  await open('stairs');
  await p.click('[data-action=climb][data-type=roof]'); await p.waitForTimeout(200);
  await p.click('[data-action=descent][data-type=regular]'); await p.waitForTimeout(200);
  await back();
  eq(await tileVal('stairs'), '10/36', 'tile');
  eq(await tileSub('stairs'), 'עלייה אחת · ירידה אחת', 'sub');
});

await step('past days: tiles reflect the selected day; quick actions and detail pages apply to it', async () => {
  await seed({ 1: { steps: 7777, water: [{ ml: 500, time: '10:00' }], climbs: [{ type: 'regular', floors: 6 }] }, 0: { steps: 100 } }, { weights: [[3, 89], [1, 88.5]] });
  await p.click('[data-action=date-prev]'); await p.waitForTimeout(250);
  eq(await tileVal('steps'), '7,777', 'steps');
  eq(await tileVal('stairs'), '6/36', 'stairs');
  eq(await tileSub('kcal'), 'עוד אין נתונים', 'kcal');
  await p.click('[data-tile=fluids] .tile-quick'); await p.waitForTimeout(200);
  await p.click('[data-tile=steps] .tile-quick'); await p.waitForTimeout(200);
  await p.click('[data-tile=stairs] .tile-quick'); await p.waitForTimeout(200);
  const s = await state();
  eq(s.days[Y].water.length, 2, 'water on yesterday'); eq(s.days[Y].steps, 8777, 'steps on yesterday'); eq(s.days[Y].climbs.length, 2, 'climb on yesterday');
  eq(s.days[T].steps, 100, 'today untouched');
  await p.click('[data-tile=weight] .tile-quick');
  await p.waitForSelector('.sheet [name=date]');
  eq(await p.inputValue('.sheet [name=date]'), Y, 'weigh-in date = selected day');
  await p.click('.sheet .btn.ghost'); await p.waitForTimeout(400);
  await open('steps');
  eq(await p.inputValue('[data-change=steps]'), '8777', 'detail shows yesterday');
  if (!(await p.textContent('.detail-head')).includes('אתמול')) throw new Error('detail date');
  await back();
  // Weight tile: latest weigh-in up to that day
  await p.click('[data-action=date-prev]'); await p.click('[data-action=date-prev]'); await p.waitForTimeout(250);
  eq(await tileVal('weight'), '89 ק״ג', 'weight 3 days ago');
});

// v2.3: the big rings (image 1) sit above the tiles, so the grid scrolls; the header, rings and the
// "אימון היום" card are on the first screen.
await step('first screen at 412×915: header, rings, legend and the "אימון היום" card above the bottom navigation', async () => {
  await seed({ 0: { steps: 5000, water: [{ ml: 500, time: '09:00' }] } });
  await p.evaluate(() => window.scrollTo(0, 0));
  const r = await p.evaluate(() => {
    const last = document.querySelector('[data-tile=workout]').getBoundingClientRect().bottom;
    const nav = document.getElementById('tabbar').getBoundingClientRect().top;
    return { last, nav, rings: !!document.querySelector('.dash-rings .rings3'), legend: document.querySelectorAll('.rings-legend li').length };
  });
  console.log('     workout card bottom', Math.round(r.last), 'nav top', Math.round(r.nav));
  if (r.last > r.nav || !r.rings || r.legend !== 3) throw new Error(JSON.stringify(r));
});

/* ---------- מגמות ---------- */

// 14-day history: this week (0–6) vs the previous week (7–13).
const HIST = {};
for (let i = 0; i < 14; i++) {
  const cur = i < 7;
  HIST[i] = {
    steps: cur ? 8000 : 6000,
    food: [{ name: 'עוף', grams: 200, kcal: cur ? 2000 : 1800, protein: cur ? (i < 5 ? 160 : 100) : 120, source: 'db' }],
    water: [{ ml: cur ? 2000 : 1500, time: '09:00' }],
    sleep: cur ? { bed: '23:00', wake: '06:00' } : { bed: '23:00', wake: '05:00' },
    naps: cur && i === 0 ? [{ start: '15:00', end: '15:30' }] : [],
    climbs: cur ? [{ type: 'regular', floors: 6 }, { type: 'regular', floors: 6 }] : [{ type: 'regular', floors: 6 }],
    descents: cur && i === 1 ? [{ type: 'roof', floors: 10, time: '08:00' }] : [],
    rides: i === 2 ? [{ km: 20 }] : i === 9 ? [{ km: 10 }] : [],
    breathing: cur && i % 2 === 0 ? [{ technique: 'calm', minutes: 5, time: '07:00' }] : i === 8 ? [{ technique: 'calm', minutes: 4, time: '07:00' }] : [],
  };
}
const HW = [[12, 90], [9, 89.6], [5, 89], [1, 88.6]];

await step('מגמות: default order + all visible; heatmap full width; "עריכה" in the header; insights list under the grid', async () => {
  await seed(HIST, { weights: HW });
  await p.click('.tab[data-tab=trends]'); await p.waitForTimeout(300);
  eq((await tileIds()).join(','), TRENDS.join(','), 'order');
  eq((await p.$$eval('.tile.full', (e) => e.map((x) => x.dataset.tile))).join(','), 'heatmap', 'full');
  if (!(await p.$('.dash-head [data-action=layout-edit][data-layout=trends]'))) throw new Error('edit');
  if (!(await p.$('.tile-grid + .insights-week'))) throw new Error('insights under grid');
  if (await p.$('.tile-quick')) throw new Error('quick action on trends');
});

await step('7-day values + change vs the previous 7 days (seeded 14-day history)', async () => {
  eq(await tileVal('steps'), '8,000', 'steps avg'); eq(await p.getAttribute('[data-tile=steps] .delta', 'data-delta'), '33', 'steps +33%');
  if (!(await p.$('[data-tile=steps] .delta.good'))) throw new Error('up = success');
  eq(await tileVal('protein'), '143 ג׳', 'protein avg (5×160+2×100)/7');
  eq(await p.getAttribute('[data-tile=protein] .delta', 'data-delta'), '19', 'protein +19%');
  eq(await tileSub2('protein'), 'יעד הושג 5/7', 'protein days met');
  eq(await tileVal('fluids'), '2.00 ל׳', 'fluids avg'); eq(await p.getAttribute('[data-tile=fluids] .delta', 'data-delta'), '33', 'fluids +33%');
  eq(await tileSub2('fluids'), 'יעד הושג 0/7', 'fluids days met');
  eq(await tileVal('sleep'), '7:04', 'sleep avg incl. naps (7×7h + 30m)/7');
  eq(await p.getAttribute('[data-tile=sleep] .delta', 'data-delta'), '18', 'sleep +18%');
  eq(await tileSub2('sleep'), 'שעת שינה ממוצעת 23:00', 'bedtime');
  eq(await tileVal('stairs'), '84 קומות', 'floors total'); eq(await p.getAttribute('[data-tile=stairs] .delta', 'data-delta'), '100', 'stairs +100%');
  eq(await tileSub2('stairs'), 'ירידות: 10 קומות', 'descents');
  eq(await tileVal('rides'), '20 ק״מ', 'km'); eq(await p.getAttribute('[data-tile=rides] .delta', 'data-delta'), '100', 'rides +100%');
  eq(await tileSub2('rides'), 'הארוכה: 20 ק״מ', 'longest');
  eq(await tileVal('breath'), '20 דק׳', 'breath total'); eq(await p.getAttribute('[data-tile=breath] .delta', 'data-delta'), '400', 'breath +400%');
  eq(await tileSub2('breath'), 'יעד הושג 4/7', 'breath days');
  eq(await tileVal('kcal'), '2,000', 'kcal avg'); eq(await p.getAttribute('[data-tile=kcal] .delta', 'data-delta'), '11', 'kcal +11%');
  if (!(await p.$('[data-tile=kcal] .delta.neutral'))) throw new Error('kcal neutral');
  eq(await tileVal('weight'), '88.8 ק״ג', 'weight 7-day avg (89+88.6)/2');
  eq(await p.getAttribute('[data-tile=weight] .delta', 'data-delta'), '-1', 'weight −1.0 vs (90+89.6)/2 = 89.8');
  if (!(await p.$('[data-tile=weight] .delta.good'))) throw new Error('weight down = success');
  eq(await tileSub2('weight'), 'ירדו 1.4 ק״ג מההתחלה', 'lost since start');
  // ▲/▼ inside an LTR isolate
  const iso = await p.$eval('[data-tile=steps] .delta bdi', (e) => [e.getAttribute('dir'), e.textContent]);
  eq(iso.join('|'), 'ltr|▲ 33%', 'isolate');
  const act = await tileVal('heatmap');
  if (!/^\d+ ימים פעילים מתוך 30$/.test(act)) throw new Error('heatmap ' + act);
  if (!(await tileSub('heatmap')).startsWith('הרצף הארוך ביותר')) throw new Error('streak sub');
  eq(await p.$$eval('[data-tile=heatmap] .mh-cell', (e) => e.length) > 49, true, '8 weeks of cells');
});

await step('mini bars + sparkline points (newest on the left), target line, stacked drinks', async () => {
  const v = (id) => p.$$eval(`[data-tile=${id}] .mb`, (e) => e.map((x) => Number(x.dataset.v)));
  eq((await v('steps')).join(','), '8000,8000,8000,8000,8000,8000,8000', 'steps bars');
  eq((await v('protein')).join(','), '100,100,160,160,160,160,160', 'protein bars (oldest first)');
  eq((await v('rides')).join(','), '0,0,0,0,20,0,0', 'ride bars');
  const xs = await p.$$eval('[data-tile=rides] .mb', (e) => e.map((x) => Number(x.getAttribute('x'))));
  if (!(xs[0] > xs[6])) throw new Error('oldest should be on the right (RTL) ' + xs);
  if (!(await p.$('[data-tile=steps] .mb-target'))) throw new Error('target line');
  if (await p.$('[data-tile=rides] .mb-target')) throw new Error('rides target');
  // Protein bars at/over target use the success color
  const fills = await p.$$eval('[data-tile=protein] .mb', (e) => e.map((x) => x.getAttribute('fill')));
  eq(fills.at(-1), 'var(--success)', 'met'); eq(fills[0], 'var(--protein)', 'not met');
  eq(await p.getAttribute('[data-tile=weight] .spark', 'data-points'), '90,89.6,89,88.6', 'sparkline');
  // Stacked drinks segment
  await seed({ 0: { water: [{ ml: 500, time: '08:00' }], food: [{ name: 'קפה הפוך', grams: 240, kcal: 120, protein: 6, source: 'db', fluid: true }] } });
  await p.click('.tab[data-tab=trends]'); await p.waitForTimeout(300);
  eq(await p.$$eval('[data-tile=fluids] .mb-top', (e) => e.map((x) => Number(x.dataset.v)).join(',')), '0.24', 'drinks stacked');
});

await step('empty states on מגמות: "—" + "עוד אין נתונים"', async () => {
  await seed({}, { exercises: [] });
  await p.click('.tab[data-tab=trends]'); await p.waitForTimeout(300);
  for (const id of ['weight', 'steps', 'protein', 'fluids', 'sleep', 'stairs', 'rides', 'breath', 'kcal', 'records', 'photos']) {
    eq(await tileVal(id), '—', id); eq(await tileSub(id), 'עוד אין נתונים', id + ' sub');
  }
  eq(await tileVal('heatmap'), '0 ימים פעילים מתוך 30', 'heatmap');
  // Previous week empty → no comparison
  await seed({ 0: { steps: 5000 } });
  await p.click('.tab[data-tab=trends]'); await p.waitForTimeout(300);
  eq(await tileSub('steps'), 'אין השוואה לשבוע הקודם', 'no prev');
});

await step('מגמות detail pages: full heatmap, weight chart, 7-day charts with tooltips, records; הישגים + photos open their screens', async () => {
  await seed(HIST, { weights: HW, photoSessions: [[3]] });
  await p.click('.tab[data-tab=trends]'); await p.waitForTimeout(300);
  const pages = { heatmap: '.heatmap-card .hm-svg', weight: '.weight-chart, svg.chart, [data-action=weight-add]', steps: '.card.role-steps .chart', protein: '.card.role-protein .chart', fluids: '.card.role-water .chart', sleep: '.card.role-sleep .chart', stairs: 'h2:text("מדרגות · 7 ימים")', rides: 'h2:text("אופניים · 7 ימים")', breath: '.card.role-breath .chart', kcal: 'h2:text("קלוריות · 7 ימים")', records: '.rec-val' };
  for (const [id, sel] of Object.entries(pages)) {
    await open(id);
    eq(await detail(), id, id);
    if (!(await p.$(sel))) throw new Error(id + ' content');
    await back();
  }
  // Tooltip on a 7-day chart
  await open('stairs');
  await p.click('.chart .bar:last-of-type .bar-hit'); await p.waitForTimeout(150);
  if (!(await p.$('.chart-tip'))) throw new Error('tooltip');
  if (!(await p.textContent('.chart-tip')).includes('12 קומות')) throw new Error(await p.textContent('.chart-tip'));
  await back();
  // Heatmap detail: a day opens "היום" on that day
  await open('heatmap');
  await p.click(`.hm-cell[data-day="${key(2)}"]`); await p.waitForTimeout(150);
  await p.click('[data-hm-tip] button, [data-hm-tip] [data-action]').catch(() => {});
  await p.waitForTimeout(300);
  await p.click('.tab[data-tab=trends]'); await p.waitForTimeout(300);
  if (await detail()) await back();
  await open('achievements');
  eq(await p.getAttribute('#app', 'data-tab'), 'achievements', 'achievements screen');
  await p.click('[data-action=back]'); await p.waitForTimeout(300);
  eq(await p.getAttribute('#app', 'data-tab'), 'trends', 'back to trends');
  await open('photos');
  eq(await p.getAttribute('#app', 'data-tab'), 'photos', 'photos screen');
  if (!(await p.$('.ph-veil, [data-veil], .veiled'))) {
    const blurred = await p.evaluate(() => /blur/.test(getComputedStyle(document.querySelector('#app')).filter + [...document.querySelectorAll('#app *')].map((e) => getComputedStyle(e).filter).join('')));
    if (!blurred) throw new Error('photos not blurred on open');
  }
});

await step('photos tile: count + last date, camera icon only — never an image', async () => {
  await p.click('.tab[data-tab=trends]'); await p.waitForTimeout(300);
  eq(await tileVal('photos'), '1', 'count');
  if (!(await tileSub('photos')).startsWith('אחרון')) throw new Error('last');
  const imgs = await p.$$eval('[data-tile=photos] img, [data-tile=photos] canvas, [data-tile=photos] image, [data-tile=photos] [style*="url("]', (e) => e.length);
  eq(imgs, 0, 'image in tile');
  if (!(await p.$('[data-tile=photos] .tile-art svg'))) throw new Error('camera icon');
  eq(await p.$$eval('.tile-grid img', (e) => e.length), 0, 'no image anywhere on the grid');
});

await step('records + achievements tiles', async () => {
  eq(Number(await tileVal('records')) >= 1, true, 'new records this week');
  if (!(await tileSub2('records'))) throw new Error('latest record name');
  if (!(await tileVal('achievements')).startsWith('רמה')) throw new Error('level');
  if (!(await tileSub('achievements')).startsWith('עוד')) throw new Error('to next');
  if (!(await p.$('[data-tile=achievements] .mini-ring path'))) throw new Error('ring');
});

/* ---------- Edit mode ---------- */

const layIds = () => p.$$eval('.lay-row', (e) => e.map((x) => x.dataset.id + (x.classList.contains('off') ? '-' : '')));
await step('edit mode (היום): up/down, hide, drag, "סיום" saves + persists; back discards', async () => {
  await seed({});
  await p.click('[data-action=layout-edit]'); await p.waitForTimeout(300);
  eq(await p.getAttribute('#app', 'data-tab'), 'layout', 'screen');
  eq((await p.textContent('.page-head h1')).trim(), 'סידור המסך', 'title');
  eq((await layIds()).join(','), HOME.join(','), 'rows');
  if (!(await p.$('.lay-row[data-id=workout] .lay-name small'))) throw new Error('full-width tag');
  await p.click('.lay-row[data-id=weight] [data-action=lay-up]'); await p.waitForTimeout(150);
  await p.click('.lay-row[data-id=steps] [data-action=lay-down]'); await p.waitForTimeout(150);
  await p.click('.lay-row[data-id=kcal] [data-action=lay-eye]'); await p.waitForTimeout(150);
  eq((await layIds()).join(','), 'workout,protein,steps,fluids,stairs,sleep,breath,rides,weight,kcal-', 'after buttons');
  // Drag "sleep" (index 5) to the top
  const g = await p.$('.lay-row[data-id=sleep] [data-grip]');
  const box = await g.boundingBox();
  const top = await (await p.$('.lay-row[data-id=workout]')).boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  for (let y = box.y + box.height / 2; y > top.y - 10; y -= 12) await p.mouse.move(box.x + box.width / 2, y);
  await p.mouse.up(); await p.waitForTimeout(250);
  eq((await layIds()).join(','), 'sleep,workout,protein,steps,fluids,stairs,breath,rides,weight,kcal-', 'after drag');
  // Back without "סיום" discards
  await p.click('[data-action=back]'); await p.waitForTimeout(300);
  eq((await tileIds()).join(','), HOME.join(','), 'discarded');
  eq((await state()).settings.homeLayout, undefined, 'nothing saved');
  // Again, then "סיום"
  await p.click('[data-action=layout-edit]'); await p.waitForTimeout(300);
  await p.click('.lay-row[data-id=weight] [data-action=lay-up]'); await p.waitForTimeout(100);
  await p.click('.lay-row[data-id=breath] [data-action=lay-eye]'); await p.waitForTimeout(100);
  await p.click('[data-action=lay-done]'); await p.waitForTimeout(300);
  eq(await p.getAttribute('#app', 'data-tab'), 'today', 'back on today');
  const want = 'workout,steps,protein,fluids,stairs,sleep,rides,weight,kcal';
  eq((await tileIds()).join(','), want, 'grid');
  const saved = (await state()).settings.homeLayout;
  eq(saved.map((x) => x.id + (x.visible ? '' : '-')).join(','), 'workout,steps,protein,fluids,stairs,sleep,breath-,rides,weight,kcal', 'saved');
  await p.reload(); await p.waitForTimeout(400);
  eq((await tileIds()).join(','), want, 'persists after reload');
  // Workout keeps its full width wherever it goes
  await p.click('[data-action=layout-edit]'); await p.waitForTimeout(300);
  for (let i = 0; i < 3; i++) { await p.click('.lay-row[data-id=workout] [data-action=lay-down]'); await p.waitForTimeout(80); }
  await p.click('[data-action=lay-done]'); await p.waitForTimeout(300);
  eq((await tileIds())[3], 'workout', 'moved');
  const w = await p.evaluate(() => [document.querySelector('[data-tile=workout]').getBoundingClientRect().width, document.querySelector('.tile-grid').getBoundingClientRect().width]);
  if (Math.abs(w[0] - w[1]) > 1) throw new Error('full width lost');
  // Reset
  await p.click('[data-action=layout-edit]'); await p.waitForTimeout(300);
  await p.click('[data-action=lay-reset]'); await p.waitForTimeout(150);
  eq((await layIds()).join(','), HOME.join(','), 'reset rows');
  await p.click('[data-action=lay-done]'); await p.waitForTimeout(300);
  eq((await tileIds()).join(','), HOME.join(','), 'reset grid');
});

await step('edit mode (מגמות) is independent of היום', async () => {
  await seed({}, { settings: { homeLayout: [{ id: 'steps', visible: true }, { id: 'workout', visible: false }] } });
  eq((await tileIds()).slice(0, 2).join(','), 'steps,protein', 'home custom (workout hidden, rest in default order)');
  await p.click('.tab[data-tab=trends]'); await p.waitForTimeout(300);
  eq((await tileIds()).join(','), TRENDS.join(','), 'trends default');
  await p.click('[data-action=layout-edit]'); await p.waitForTimeout(300);
  eq((await layIds()).join(','), TRENDS.join(','), 'trends rows');
  await p.click('.lay-row[data-id=photos] [data-action=lay-eye]');
  await p.click('.lay-row[data-id=heatmap] [data-action=lay-down]');
  await p.click('[data-action=lay-done]'); await p.waitForTimeout(300);
  eq(await p.getAttribute('#app', 'data-tab'), 'trends', 'back on trends');
  eq((await tileIds()).join(','), 'weight,heatmap,steps,protein,fluids,sleep,stairs,rides,breath,kcal,records,achievements', 'trends saved');
  const s = (await state()).settings;
  eq(s.homeLayout.length, 2, 'home layout untouched');
  eq(s.trendsLayout.length, 13, 'trends layout');
  // Unknown ids are ignored, new ids appear in their default place
  await seed({}, { settings: { trendsLayout: [{ id: 'bogus', visible: true }, { id: 'kcal', visible: true }] } });
  await p.click('.tab[data-tab=trends]'); await p.waitForTimeout(300);
  const ids = await tileIds();
  eq(ids.length, 13, 'all tiles, unknown id dropped');
  eq(ids.indexOf('kcal') < ids.indexOf('records'), true, 'saved tile placed, the rest in default order');
});

/* ---------- Settings, backup, shortcuts ---------- */

await step('"תצוגת המסכים": אריחים by default; "רשימה מלאה" shows both tabs as before; missing setting → tiles', async () => {
  await seed({ 0: { steps: 3000 } });
  await p.click('.tab[data-tab=settings]'); await p.waitForTimeout(300);
  eq(await p.isChecked('[data-screen-mode][value=tiles]'), true, 'default tiles');
  await p.click('label:has([data-screen-mode][value=list])'); await p.waitForTimeout(200);
  eq((await state()).settings.screenMode, 'list', 'saved');
  await p.click('.tab[data-tab=today]'); await p.waitForTimeout(300);
  if (await p.$('.tile-grid')) throw new Error('grid in list mode');
  for (const s of ['.hero', '.water-card', '.card:has(.descent-row)', '.breath-card', '[data-action=rest]', '[data-change=steps]']) if (!(await p.$(s))) throw new Error('list ' + s);
  if (await p.$('[data-action=layout-edit]')) throw new Error('edit in list mode');
  await p.click('.tab[data-tab=trends]'); await p.waitForTimeout(300);
  if (await p.$('.tile-grid')) throw new Error('trends grid in list');
  const first = await p.evaluate(() => [...document.getElementById('app').children].slice(0, 3).map((c) => c.className));
  if (!first[1].includes('insights-week') || !first[2].includes('heatmap-card')) throw new Error(first);
  await p.click('.tab[data-tab=settings]'); await p.waitForTimeout(300);
  await p.click('label:has([data-screen-mode][value=tiles])'); await p.waitForTimeout(200);
  await p.click('.tab[data-tab=today]'); await p.waitForTimeout(300);
  if (!(await p.$('.tile-grid'))) throw new Error('tiles back');
  // Unknown value → tiles
  await seed({}, { settings: { screenMode: 'weird' } });
  if (!(await p.$('.tile-grid'))) throw new Error('fallback');
});

await step('backup export → import keeps homeLayout, trendsLayout and screenMode (round-trip identical)', async () => {
  const L1 = [{ id: 'weight', visible: true }, { id: 'steps', visible: false }];
  const L2 = [{ id: 'photos', visible: false }, { id: 'heatmap', visible: true }];
  await seed({ 0: { steps: 10 } }, { settings: { homeLayout: L1, trendsLayout: L2, screenMode: 'list' } });
  const before = await p.evaluate(() => localStorage.getItem('seventy.v1'));
  await p.click('.tab[data-tab=settings]'); await p.waitForTimeout(300);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-action=export]')]);
  const file = `${SP}/backup200.json`;
  await dl.saveAs(file);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  eq(JSON.stringify(data.settings.homeLayout), JSON.stringify(L1), 'file home');
  eq(JSON.stringify(data.settings.trendsLayout), JSON.stringify(L2), 'file trends');
  eq(data.settings.screenMode, 'list', 'file mode');
  await seed({});
  await p.click('.tab[data-tab=settings]'); await p.waitForTimeout(300);
  await p.setInputFiles('[data-file]', file); await p.waitForSelector('.sheet .btn.danger, .sheet .btn.primary');
  await p.click('.sheet .btn.danger, .sheet .btn.primary'); await p.waitForTimeout(400);
  const s = await state();
  eq(JSON.stringify(s.settings.homeLayout), JSON.stringify(L1), 'restored home');
  eq(JSON.stringify(s.settings.trendsLayout), JSON.stringify(L2), 'restored trends');
  eq(s.settings.screenMode, 'list', 'restored mode');
  const after = JSON.parse(await p.evaluate(() => localStorage.getItem('seventy.v1')));
  const b0 = JSON.parse(before);
  eq(JSON.stringify(after.settings), JSON.stringify({ ...b0.settings }), 'settings identical');
  eq(JSON.stringify(after.days), JSON.stringify(b0.days), 'days identical');
});

await step('?action=water opens the "נוזלים" detail page; food / scan / breathe unchanged', async () => {
  await seed({ 0: { water: [{ ml: 300, time: '08:00' }] } }, {}, BASE + '?action=water');
  await p.waitForTimeout(300);
  eq(await p.getAttribute('#app', 'data-tab'), 'today', 'tab'); eq(await detail(), 'fluids', 'fluids detail');
  if (!(await p.$('.water-card'))) throw new Error('water card');
  if (p.url().includes('action=')) throw new Error('action kept in URL');
  await back();
  if (!(await p.$('.tile-grid'))) throw new Error('back to grid');
  await p.goto(BASE + '?action=food'); await p.waitForTimeout(500);
  eq(await p.getAttribute('#app', 'data-tab'), 'food', 'food');
  eq(await p.evaluate(() => document.activeElement?.matches('[data-search]')), true, 'search focused');
  await p.goto(BASE + '?action=breathe'); await p.waitForTimeout(500);
  if (!(await p.$('.sheet .tech-list'))) throw new Error('breathing setup');
  await p.goto(BASE + '?action=scan'); await p.waitForTimeout(800);
  eq(await p.getAttribute('#app', 'data-tab'), 'food', 'scan → food');
  // list mode: the old scroll-to-card behavior
  await seed({}, { settings: { screenMode: 'list' } }, BASE + '?action=water');
  await p.waitForTimeout(400);
  eq(await detail(), '', 'no detail in list mode');
  if (!(await p.$('.water-card'))) throw new Error('list water card');
});

await step('celebrations still fire from a quick action (steps target toast + record)', async () => {
  await seed({ 1: { steps: 9500 }, 0: { steps: 9500 } });
  await p.click('[data-tile=steps] .tile-quick'); await p.waitForTimeout(300);
  const txt = await p.$$eval('.toast', (e) => e.map((x) => x.textContent).join('|'));
  if (!txt.includes('יעד הצעדים הושג') && !txt.includes('שיא אישי חדש')) throw new Error(txt);
  eq((await state()).days[T].steps, 10500, 'added');
});

await step('reduced motion: tiles and detail pages render without animation', async () => {
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await seed({ 0: { steps: 100 } });
  await open('steps');
  const d = await p.evaluate(() => getComputedStyle(document.querySelector('#app > *')).animationDuration);
  if (!(parseFloat(d) < 0.001)) throw new Error(d);
  await p.emulateMedia({ reducedMotion: 'no-preference' });
});

await step('no horizontal overflow at 412 and 360: grids, every detail page, edit screen, list mode', async () => {
  for (const w of [412, 360]) {
    await p.setViewportSize({ width: w, height: w === 412 ? 915 : 800 });
    await seed(HIST, { weights: HW, photoSessions: [[2]] });
    const chk = async (what) => { const o = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (o > 0) throw new Error(`${w} ${what} overflow ${o}`); };
    await chk('today grid');
    // Text inside tiles never spills out of the tile
    const spill = await p.evaluate(() => [...document.querySelectorAll('.tile-val, .tile-sub, .tile-lbl')].filter((e) => {
      const t = e.closest('.tile-open').getBoundingClientRect(), r = e.getBoundingClientRect();
      return r.left < t.left - 0.5 || r.right > t.right + 0.5;
    }).map((e) => e.closest('.tile').dataset.tile + ':' + e.className));
    if (spill.length) throw new Error(`${w} spill ${spill}`);
    for (const id of ['workout', 'steps', 'fluids', 'stairs', 'sleep', 'breath', 'rides', 'weight']) { await open(id); await chk('today ' + id); await back(); }
    await p.click('[data-action=layout-edit]'); await p.waitForTimeout(300); await chk('edit'); await p.click('[data-action=back]'); await p.waitForTimeout(300);
    await p.click('.tab[data-tab=trends]'); await p.waitForTimeout(300); await chk('trends grid');
    const spill2 = await p.evaluate(() => [...document.querySelectorAll('.tile-val, .tile-sub, .tile-lbl')].filter((e) => {
      const t = e.closest('.tile-open').getBoundingClientRect(), r = e.getBoundingClientRect();
      return r.left < t.left - 0.5 || r.right > t.right + 0.5;
    }).map((e) => e.closest('.tile').dataset.tile + ':' + e.className));
    if (spill2.length) throw new Error(`${w} trends spill ${spill2}`);
    for (const id of ['heatmap', 'weight', 'steps', 'protein', 'fluids', 'sleep', 'stairs', 'rides', 'breath', 'kcal', 'records']) { await open(id); await chk('trends ' + id); await back(); }
    await p.click('[data-action=layout-edit]'); await p.waitForTimeout(300); await chk('trends edit'); await p.click('[data-action=back]'); await p.waitForTimeout(300);
  }
  await p.setViewportSize({ width: 412, height: 915 });
});

await step('offline: tiles, detail pages and the edit screen work from the cache', async () => {
  await p.reload(); await p.waitForTimeout(1500);
  await p.evaluate(() => navigator.serviceWorker.ready);
  await ctx.setOffline(true);
  await p.reload(); await p.waitForTimeout(800);
  if (!(await p.$('.tile-grid'))) throw new Error('grid offline');
  await open('fluids'); if (!(await p.$('.water-card'))) throw new Error('detail offline');
  await back();
  await p.click('[data-action=layout-edit]'); await p.waitForTimeout(300);
  if (!(await p.$('.lay-row'))) throw new Error('edit offline');
  await ctx.setOffline(false);
});

await step('version is the current release (≥ 2.0.0)', async () => {
  eq(await p.evaluate(() => self.APP_VERSION), CURRENT_VERSION, 'version');
});

console.log(errors.length ? 'errors: ' + errors.join(' | ') : 'errors: none');
await b.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
