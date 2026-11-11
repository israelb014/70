// v1.8.1: drinks from "אוכל" count toward fluids — rules, manual toggle + memory, totals (today / past),
// water card breakdown, glass plurals, status line, chart stacking, insights, exports, fraction isolates.
import { chromium } from 'playwright';
import { autoDetail, openCard } from './nav200.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:8765/70/';
const SP = process.env.TEST_OUT;
const b = await chromium.launch();
let fails = 0; const step = async (l, fn) => { try { await fn(); console.log('OK  ', l); } catch (e) { fails++; console.log('FAIL', l, '-', e.message.split('\n')[0]); } };
const errors = [];
const DAY = 86400000;
const key = (o = 0) => { const d = new Date(Date.now() - o * DAY); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const T = key(0);
const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
autoDetail(p);
p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await p.goto(BASE);
const F = (name, grams, unit = 'גרם', extra = {}) => ({ name, grams, kcal: 10, protein: 1, source: 'db', time: '09:00', amount: grams, unit, ...extra });
const seed = async (days = {}, foodMemory = {}, settings = {}) => {
  await p.evaluate(([days, foodMemory, settings, keys]) => {
    const out = {};
    for (const [o, d] of Object.entries(days)) out[keys[o]] = { rest: false, steps: null, climbs: [], rides: [], exercises: {}, food: [], sleep: null, naps: [], water: [], breathing: [], ...d };
    localStorage.setItem('seventy.v1', JSON.stringify({ schemaVersion: 4,
      settings: { coach: { enabled: false }, theme: 'flame', startWeight: 90, targetWeight: 80, proteinTarget: 150, stepsTarget: 10000, rideGoalKm: 45, climbsTarget: 6, floorsRegular: 6, floorsRoof: 10, sleepTarget: 8, waterTarget: 2500, ...settings },
      exercises: [], mealPresets: [], customFoods: [], foodMemory, weights: [], meta: { lastSeenLevel: 99, seenBadges: [], lastBackupAt: new Date().toISOString() }, days: out }));
  }, [days, foodMemory, settings, Object.fromEntries(Array.from({ length: 30 }, (_, i) => [i, key(i)]))]);
  await p.reload(); await p.waitForTimeout(300);
};
const state = () => p.evaluate(() => JSON.parse(localStorage.getItem('seventy.v1')));
const call = (path, fn, ...args) => p.evaluate(async ([path, fn, args]) => (await import(path))[fn](...args), [path, fn, args]);
const W = (ml) => ({ ml, time: '08:00' });

/* ---------- Rules ---------- */
await step('rules: liquid units, drink words (whole words), exclusions (alcohol, powder, beans), "לבן" first word only', async () => {
  const cases = [
    // units
    ['יוגורט', 'מ״ל', true], ['משהו', 'ליטר', true], ['משהו', 'שוט', true], ['משהו', 'פחית', true], ['משהו', 'בקבוק', true],
    ['משהו', 'כוסית', false], ['משהו', 'כף', false], ['משהו', 'גרם', false],
    // 1.8.2: a cup / mug counts only with a drink keyword
    ['אורז מבושל', 'כוס', false], ['סלט ירקות', 'כוס', false], ['קורנפלקס', 'כוס', false], ['ענבים', 'כוס', false], ['עדשים', 'כוס', false], ['משהו', 'ספל', false],
    ['קפה', 'כוס', true], ['תה', 'כוס', true], ['מיץ תפוזים', 'כוס', true], ['חלב', 'כוס', true], ['תה', 'ספל', true],
    // food names that merely contain a drink word
    ['שוקולד חלב', 'גרם', false], ['טונה במים', 'גרם', false], ['גבינה בולגרית 5% שומן, מחלב כבשים', 'גרם', false], ['דייסת שיבולת שועל בחלב', 'כוס', false],
    ['סלט כרוב עם מיץ לימון', 'כוס', false], ['עוגיות קפה אגוז', 'יחידה', false], ['רום וקולה', 'כוס', false], ['סודה לשתייה, אבקה', 'כפית', false], ['קפה, אבקה', 'כפית', false],
    ['סחלב מוכן מאבקה, על בסיס חלב', 'כוס', true], ['FFQ-מים', 'כוס', true],
    // words
    ...['מים מינרליים', 'סודה', 'קפה שחור', 'אספרסו כפול', 'נס קפה', 'קפה הפוך', 'תה ירוק', 'חליטה', 'מיץ תפוזים', 'שוקו', 'חלב 3%', 'משקה סויה', 'קוקה קולה', 'ספרייט', 'פאנטה', 'לימונדה', 'שייק בננה', 'מילקשייק', 'לבן 3%', 'אייס קפה', 'תרכיז פטל'].map((n) => [n, 'גרם', true]),
    // no false positives from substrings
    ['אננס', 'יחידה', false], ['חטיף חלבון', 'יחידה', false], ['שוקולד מריר', 'יחידה', false], ['לחם לבן', 'פרוסה', false], ['אורז לבן', 'גרם', false], ['תהיני גולמי', 'כף', false],
    // exclusions win
    ['בירה גולדסטאר', 'בקבוק', false], ['יין אדום', 'כוס', false], ['וודקה', 'שוט', false], ['ערק', 'שוט', false], ['וויסקי', 'שוט', false], ['ליקר קפה', 'שוט', false], ['קוניאק', 'כוס', false],
    ['אבקת קקאו', 'כוס', false], ['אבקת חלב', 'כף', false], ['גרגירי קפה', 'גרם', false],
  ];
  // 330 ml of anything non-excluded is a fluid
  for (const n of ['אורז מבושל', 'סלט ירקות', 'קורנפלקס', 'ענבים', 'עדשים', 'משהו']) cases.push([n, 'מ״ל', true]);
  const r = await p.evaluate(async (cases) => { const f = await import('./js/fluids.js'); return cases.filter(([n, u, want]) => f.drinkByRules(n, u) !== want).map(([n, u]) => `${n}/${u}`); }, cases);
  if (r.length) throw new Error(r.join(', '));
});
await step('manual flag overrides the rules both ways (entry.fluid)', async () => {
  const r = await p.evaluate(async () => { const f = await import('./js/fluids.js'); return [f.isDrink({ name: 'מרק', unit: 'קערה', fluid: true }), f.isDrink({ name: 'קפה', unit: 'כוס', fluid: false }), f.isDrink({ name: 'קפה', unit: 'כוס' }),
    f.isDrink({ name: 'אורז מבושל', unit: 'כוס', fluid: true }), f.isDrink({ name: 'אורז מבושל', unit: 'כוס' }), f.drinksMl({ food: [{ name: 'קורנפלקס', unit: 'מ״ל', grams: 330 }, { name: 'אורז מבושל', unit: 'כוס', grams: 160 }] })]; });
  // an entry already logged with an explicit toggle keeps it (rice by the cup marked as fluid stays fluid)
  if (r.join() !== 'true,false,true,true,false,330') throw new Error(r.join());
});

/* ---------- Totals, card ---------- */
await step('water card: ring + total = water + drinks; breakdown line; no duplicated amount; glass count', async () => {
  await seed({ 0: { water: [W(500), W(250)], food: [F('קפה הפוך', 240, 'כוס'), F('מיץ תפוזים', 260), F('לחם', 60, 'פרוסה')] } });
  const ring = (await p.textContent('.water-card .ring-big')).trim();
  const split = (await p.textContent('[data-water-split]')).replace(/\s+/g, ' ').trim();
  const of = (await p.textContent('[data-water-of]')).replace(/\s+/g, ' ').trim();
  const frac = +(await p.getAttribute('.water-card .ring-fill', 'data-frac'));
  if (ring !== '1.25' || split !== 'מים 0.75 ל׳ · משקאות 0.50 ל׳' || of !== 'מתוך 2.5 ל׳ · 5 כוסות' || Math.abs(frac - 0.5) > 1e-9) throw new Error(`${ring} / ${split} / ${of} / ${frac}`);
  if (await p.$('.water-card .stat-num')) throw new Error('duplicated ml amount');
});
await step('glass count: one decimal, singular / plural', async () => {
  for (const [ml, want] of [[250, 'כוס אחת'], [375, '1.5 כוסות'], [500, '2 כוסות'], [0, '0 כוסות']]) {
    await seed({ 0: { food: ml ? [F('מים', ml)] : [] } });
    const t = (await p.textContent('[data-water-of]')).replace(/\s+/g, ' ').trim();
    if (!t.endsWith(want)) throw new Error(`${ml}: ${t}`);
  }
});
await step('quick-add + undo touch only the water part; drinks stay', async () => {
  await seed({ 0: { food: [F('תה', 300)] } });
  await p.click('[data-action=water-add][data-ml="250"]'); await p.waitForTimeout(200);
  if ((await p.textContent('[data-water-split]')).replace(/\s+/g, ' ').trim() !== 'מים 0.25 ל׳ · משקאות 0.30 ל׳') throw new Error('add');
  await p.click('[data-action=water-undo]'); await p.waitForTimeout(200);
  const s = await state();
  if (s.days[T].water.length !== 0 || s.days[T].food.length !== 1) throw new Error('undo');
});
await step('past day: drinks count there too (computed on the fly)', async () => {
  await seed({ 3: { water: [W(1000)], food: [F('שוקו', 250)] } });
  for (let i = 0; i < 3; i++) await p.click('[data-action=date-prev]');
  await p.waitForTimeout(200);
  if ((await p.textContent('.water-card .ring-big')).trim() !== '1.25') throw new Error('past total');
  const r = await p.evaluate(async (k) => { const s = await import('./js/stats.js'); const st = await import('./js/storage.js'); const d = st.getDay(k); return [s.waterMl(d), s.drinksMl(d), s.fluidsMl(d)]; }, key(3));
  if (r.join() !== '1000,250,1250') throw new Error(r.join());
  await p.click('[data-action=date-today]').catch(() => {});
});
await step('hero status line uses the total: "עוד 1.25 ל׳ נוזלים"', async () => {
  await seed({ 0: { steps: 10000, climbs: Array.from({ length: 6 }, () => ({ type: 'regular', floors: 6 })), food: [F('x', 100, 'גרם', { protein: 150 }), F('קפה', 500)], water: [W(750)] } });
  const t = (await p.textContent('.hero-status')).trim();
  if (t !== 'עוד 1.25 ל׳ נוזלים') throw new Error(t);
});

/* ---------- Manual toggle + memory ---------- */
async function openFood(name) {
  await p.click('[data-tab=food]'); await p.waitForTimeout(300);
  await p.fill('[data-search]', name); await p.waitForTimeout(900);
  await p.click(`.food-result:has-text("${name}")`); await p.waitForSelector('.sheet [name=fluid]'); await p.waitForTimeout(300);
}
await step('amount sheet: "נחשב לנוזלים" preset by the rules (on for a drink, off for food)', async () => {
  await seed({});
  await openFood('קפה הפוך');
  if (!(await p.isChecked('.sheet [name=fluid]'))) throw new Error('drink not preset');
  await p.click('.sheet .btn.ghost'); await p.waitForTimeout(300);
  await p.fill('[data-search]', 'במבה'); await p.waitForTimeout(900);
  await p.click('.food-result:has-text("במבה")'); await p.waitForSelector('.sheet [name=fluid]'); await p.waitForTimeout(300);
  if (await p.isChecked('.sheet [name=fluid]')) throw new Error('food preset on');
  await p.click('.sheet .btn.ghost'); await p.waitForTimeout(300);
});
await step('changing the toggle: stored on the entry (fluid: true) and remembered for the food next time', async () => {
  await p.fill('[data-search]', 'במבה'); await p.waitForTimeout(900);
  await p.click('.food-result:has-text("במבה")'); await p.waitForSelector('.sheet [name=fluid]'); await p.waitForTimeout(300);
  await p.click('.sheet label.fluid-check'); await p.click('.sheet .btn.primary'); await p.waitForTimeout(400);
  let s = await state();
  const e = s.days[T].food.at(-1);
  if (e.fluid !== true || s.foodMemory['db:במבה']?.fluid !== true) throw new Error(JSON.stringify([e, s.foodMemory['db:במבה']]));
  await p.fill('[data-search]', 'במבה'); await p.waitForTimeout(900);
  await p.click('.food-result:has-text("במבה")'); await p.waitForSelector('.sheet [name=fluid]'); await p.waitForTimeout(300);
  if (!(await p.isChecked('.sheet [name=fluid]'))) throw new Error('memory not applied');
  // switching back to the rule value clears the memory and stores no override
  await p.click('.sheet label.fluid-check'); await p.click('.sheet .btn.primary'); await p.waitForTimeout(400);
  s = await state();
  if ('fluid' in s.days[T].food.at(-1) || 'fluid' in s.foodMemory['db:במבה']) throw new Error('not cleared');
});
await step('editing an entry: tap the row → "נחשב לנוזלים" → saved on the entry + remembered; drop icon on drinks', async () => {
  await seed({ 0: { food: [F('מרק עוף', 300, 'קערה', { key: 'db:מרק עוף' }), F('קפה', 200, 'כוס', { key: 'db:קפה' })] } });
  await p.click('[data-tab=food]'); await p.waitForTimeout(300);
  const icons = await p.$$eval('.food-edit', (els) => els.map((e) => !!e.querySelector('.fluid-ic')));
  if (icons.join() !== 'false,true') throw new Error('icons ' + icons);
  await p.click('.food-edit:has-text("מרק עוף")'); await p.waitForSelector('.sheet [name=fluid]');
  if (await p.isChecked('.sheet [name=fluid]')) throw new Error('soup preset');
  await p.click('.sheet label.fluid-check'); await p.click('.sheet .btn.primary'); await p.waitForTimeout(400);
  const s = await state();
  if (s.days[T].food[0].fluid !== true || s.foodMemory['db:מרק עוף']?.fluid !== true) throw new Error(JSON.stringify(s.days[T].food[0]));
  await p.click('[data-tab=today]'); await p.waitForTimeout(300);
  if ((await p.textContent('.water-card .ring-big')).trim() !== '0.50') throw new Error('total after edit');
});

/* ---------- Chart, insights ---------- */
await step('7-day chart: stacked water + drinks, tooltip shows both; weekly average uses the total', async () => {
  await seed({ 0: { water: [W(1000)], food: [F('קפה', 500)] }, 1: { water: [W(1500)] } });
  await p.click('[data-tab=trends]'); await p.waitForTimeout(800);
  const card = '.card.role-water';
  const bars = await p.$$eval(`${card} .bar`, (gs) => gs.slice(-2).map((g) => ({ top: g.querySelector('.bar-top')?.getAttribute('fill') || null, topH: +(g.querySelector('.bar-top')?.dataset.h || 0), base: g.querySelector('.bar-base')?.getAttribute('fill') || null, total: +(g.querySelector('rect:not(.bar-hit)')?.getAttribute('height') || 0), tip: g.dataset.tip })));
  const [y, t] = bars;
  if (t.top !== 'var(--water-light)' || t.base !== 'var(--water)' || Math.abs(t.topH / t.total - 1 / 3) > 0.01) throw new Error(JSON.stringify(t));
  if (y.top || y.base) throw new Error('water-only day stacked');
  if (!t.tip.includes('מים 1.00 · משקאות 0.50 · סה״כ 1.50 ל׳')) throw new Error(t.tip);
  const stats = await p.$$eval(`${card} .hm-stats .stat-num`, (e) => e.map((x) => x.textContent.replace(/\s+/g, '')));
  if (stats.join('|') !== '1.50|2/7') throw new Error(stats.join('|'));
  if ((await p.$eval(`${card} .hm-stats bdi`, (e) => e.getAttribute('dir'))) !== 'ltr') throw new Error('fraction isolate');
});
await step('insights: daily target, week-over-week and consistency use the total', async () => {
  const days = {}; for (let i = 0; i < 5; i++) days[i] = { steps: 12000, water: [W(1500)], food: [F('תה', 1000)] };
  await seed(days);
  const wk = await call('./js/insights.js', 'weekInsights', T);
  if (!wk.some((x) => x.id === 'consistency:water' && x.kind === 'positive')) throw new Error(wk.map((x) => x.id).join());
  const d = await call('./js/insights.js', 'dayInsights', T);
  const tg = d.find((x) => x.id === 'targets' || x.id === 'allTargets');
  if (!tg || !tg.text.includes('מים')) throw new Error(JSON.stringify(d.map((x) => x.text)));
  const wow = {}; [0, 1, 2, 3].forEach((i) => { wow[i] = { water: [W(1000)], food: [F('קפה', 1000)] }; }); [7, 8, 9, 10].forEach((i) => { wow[i] = { water: [W(1000)] }; });
  await seed(wow);
  const w2 = await call('./js/insights.js', 'weekInsights', T);
  const x = w2.find((i) => i.id === 'wow:water');
  if (!x || !x.text.includes('100%')) throw new Error(JSON.stringify(x));
});
await step('heatmap, completion % and XP unaffected by fluids', async () => {
  await seed({ 0: { water: [W(500)], food: [F('קפה', 2000, 'גרם', { protein: 0 })] }, 1: { water: [W(500)] } });
  const r = await p.evaluate(async (ks) => { const pr = await import('./js/progress.js'); const st = await import('./js/stats.js'); return ks.map((k) => [pr.dayScore(k), st.completionPct(k)]); }, [key(0), key(1)]);
  if (JSON.stringify(r[0]) !== JSON.stringify(r[1])) throw new Error(JSON.stringify(r));
});

/* ---------- Exports ---------- */
await step('exports: daily "מים: 1.25 ל׳ / 2.5 ל׳ (מים 0.75 · משקאות 0.50)", no drinks unchanged; weekly "נוזלים: …"', async () => {
  await seed({ 0: { water: [W(750)], food: [F('קפה', 500)] }, 1: { water: [W(750)] } });
  const d0 = (await call('./js/export.js', 'dailySummary', T)).split('\n');
  const d1 = (await call('./js/export.js', 'dailySummary', key(1))).split('\n');
  if (!d0.includes('מים: 1.25 ל׳ / 2.5 ל׳ (מים 0.75 · משקאות 0.50)')) throw new Error(d0.filter((l) => l.includes('מים')).join(' | '));
  if (!d1.includes('מים: 0.75 ל׳ / 2.5 ל׳ (3 כוסות)')) throw new Error(d1.filter((l) => l.includes('מים')).join(' | '));
  const w = (await call('./js/export.js', 'weeklySummary')).split('\n');
  if (!w.includes('• נוזלים: 1.25 ל׳ (מים 0.75 · משקאות 0.50)') || !w.includes('• מים: 0.75 ל׳ (3 כוסות)')) throw new Error(w.filter((l) => l.includes('מים')).join(' | '));
});

/* ---------- Fractions ---------- */
await step('stairs fraction "10/36 קומות" in one LTR isolate (number left of "/36"); every fraction isolate is dir="ltr"', async () => {
  await seed({ 0: { climbs: [{ type: 'regular', floors: 6 }, { type: 'custom', floors: 4 }] } });
  const r = await p.$eval('[data-floors]', (el) => {
    const bdi = el.querySelector('bdi'); const rng = document.createRange();
    const xs = [...bdi.childNodes].map((n) => { rng.selectNode(n); return [n.textContent, Math.round(rng.getBoundingClientRect().x)]; });
    return { dir: bdi.getAttribute('dir'), text: el.textContent.replace(/\s+/g, ' ').trim(), xs };
  });
  if (r.dir !== 'ltr' || r.text !== '10/36 קומות' || !(r.xs[0][1] < r.xs[1][1])) throw new Error(JSON.stringify(r));
  const bad = await p.evaluate(() => [...document.querySelectorAll('bdi.num')].filter((e) => e.getAttribute('dir') !== 'ltr').length);
  if (bad) throw new Error(`${bad} number isolates without dir="ltr"`);
  // ...and with the stylesheet removed, the fraction still reads 10/36
  const r2 = await p.evaluate(() => {
    document.querySelectorAll('link[rel=stylesheet]').forEach((l) => l.remove());
    const bdi = document.querySelector('[data-floors] bdi'); const rng = document.createRange();
    return [...bdi.childNodes].map((n) => { rng.selectNode(n); return Math.round(rng.getBoundingClientRect().x); });
  });
  if (!(r2[0] < r2[1])) throw new Error('reversed without CSS');
  await p.reload(); await p.waitForTimeout(300);
});

/* ---------- Layout + offline ---------- */
for (const width of [412, 360]) {
  await step(`${width}px: water card, food list and amount sheet — no overflow, breakdown on one line`, async () => {
    await p.setViewportSize({ width, height: 915 });
    await seed({ 0: { water: [W(1250)], food: [F('קפה הפוך עם חלב שקדים', 1240, 'כוס')] } });
    await openCard(p, 'fluids');
    const r = await p.evaluate(() => ({ over: document.documentElement.scrollWidth > innerWidth, clip: (() => { const e = document.querySelector('[data-water-split]'); return e.scrollWidth > e.clientWidth + 1 || getComputedStyle(e).whiteSpace !== 'nowrap'; })() }));
    if (r.over || r.clip) throw new Error(JSON.stringify(r));
    await openFood('קפה הפוך');
    if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('sheet');
    await p.click('.sheet .btn.ghost'); await p.waitForTimeout(300);
    await p.click('[data-tab=today]'); await p.waitForTimeout(200);
  });
}
await p.setViewportSize({ width: 412, height: 915 });
await step('offline: totals still computed (no network needed)', async () => {
  await seed({ 0: { water: [W(500)], food: [F('תה', 250)] } });
  await p.evaluate(() => navigator.serviceWorker.ready); await p.reload(); await p.waitForTimeout(300);
  await ctx.setOffline(true); await p.reload(); await p.waitForTimeout(400);
  const t = (await p.textContent('.water-card .ring-big')).trim();
  await ctx.setOffline(false);
  if (t !== '0.75') throw new Error(t);
});
console.log('errors:', errors.length ? errors : 'none');
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
await b.close();
