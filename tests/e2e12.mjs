// v1.6.4: custom climbs ("אחר"), stairs progress in floors, XP per floors, climb-equivalent badges, exports.
import { chromium } from 'playwright';
import { autoDetail, openCard } from './nav200.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:8765/70/';
const b = await chromium.launch();
let fails = 0; const step = async (l, fn) => { try { await fn(); console.log('OK  ', l); } catch (e) { fails++; console.log('FAIL', l, '-', e.message.split('\n')[0]); } };
const errors = [];
const DAY = 86400000;
const key = (o = 0) => { const d = new Date(Date.now() - o * DAY); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const T = key(0);
const p = await (await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true })).newPage();
autoDetail(p);
p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await p.goto(BASE);
const R = (n = 1) => Array.from({ length: n }, () => ({ type: 'regular', floors: 6 }));
const ROOF = (n = 1) => Array.from({ length: n }, () => ({ type: 'roof', floors: 10 }));
const C = (f, n = 1) => Array.from({ length: n }, () => ({ type: 'custom', floors: f }));
const seed = async (days = {}, settings = {}, meta = {}) => {
  await p.evaluate(([days, settings, meta, keys]) => {
    const out = {};
    for (const [o, d] of Object.entries(days)) out[keys[o]] = { rest: false, steps: null, climbs: [], rides: [], exercises: {}, food: [], sleep: null, naps: [], water: [], ...d };
    localStorage.setItem('seventy.v1', JSON.stringify({ schemaVersion: 4,
      settings: { coach: { enabled: false }, theme: 'flame', startWeight: 90, targetWeight: 80, proteinTarget: 150, stepsTarget: 10000, rideGoalKm: 45, climbsTarget: 6, floorsRegular: 6, floorsRoof: 10, sleepTarget: 8, waterTarget: 2500, ...settings },
      exercises: [], mealPresets: [], customFoods: [], foodMemory: {}, weights: [], meta: { lastSeenLevel: 99, seenBadges: [], lastBackupAt: new Date().toISOString(), ...meta }, days: out }));
  }, [days, settings, meta, Object.fromEntries(Array.from({ length: 400 }, (_, i) => [i, key(i)]))]);
  await p.goto(BASE); await p.waitForTimeout(250);
};
const state = () => p.evaluate(() => JSON.parse(localStorage.getItem('seventy.v1')));
const card = '.card:has([data-action="climb-custom"])';
const sheet = '.sheet';
const val = async () => Number((await p.textContent(`${sheet} [data-floors-val]`)).trim());
const call = (path, fn, ...args) => p.evaluate(async ([path, fn, args]) => (await import(path))[fn](...args), [path, fn, args]);

/* ---------- Custom climb sheet ---------- */
await step('"אחר" is the third button; sheet prefilled with 3 (no history), large stepper + "הוספה"', async () => {
  await seed({ 0: { steps: 10000 } });
  const labels = await p.$$eval(`${card} .btn-trio .big-add strong`, (e) => e.map((x) => x.textContent.trim()));
  if (labels.join('|') !== 'עלייה רגילה|עלייה לגג|אחר') throw new Error(labels.join('|'));
  await p.click('[data-action="climb-custom"]'); await p.waitForSelector(`${sheet} [data-floors-val]`); await p.waitForTimeout(400);
  if (await val() !== 3) throw new Error('prefill ' + await val());
  const acts = await p.$$eval(`${sheet} .sheet-actions .btn`, (e) => e.map((x) => x.textContent.trim()));
  if (acts.join('|') !== 'הוספה') throw new Error(acts.join('|'));
  const box = await (await p.$(`${sheet} .stepper-btn`)).boundingBox();
  if (box.width < 56 || box.height < 56) throw new Error('stepper buttons too small');
});
await step('range 1–30: − disabled at 1, + disabled at 30, values clamp', async () => {
  for (let i = 0; i < 5; i++) await p.click(`${sheet} [data-step="-1"]`, { force: true });
  if (await val() !== 1 || !(await p.$eval(`${sheet} [data-step="-1"]`, (x) => x.disabled))) throw new Error('min ' + await val());
  for (let i = 0; i < 35; i++) await p.click(`${sheet} [data-step="1"]`, { force: true });
  if (await val() !== 30 || !(await p.$eval(`${sheet} [data-step="1"]`, (x) => x.disabled))) throw new Error('max ' + await val());
  await p.click(`${sheet} [data-step="-1"]`);
  if (await val() !== 29) throw new Error('step back ' + await val());
});
await step('"הוספה" stores { type: "custom", floors: N }; next sheet prefilled with the last custom value', async () => {
  await p.click(`${sheet} .btn.primary`); await p.waitForTimeout(350);
  const c = (await state()).days[T].climbs;
  if (JSON.stringify(c.map((x) => ({ type: x.type, floors: x.floors }))) !== '[{"type":"custom","floors":29}]' || !/^\d\d:\d\d$/.test(c[0].time)) throw new Error(JSON.stringify(c)); // 1.9.0: + time for undo order
  await p.click('[data-action="climb-custom"]'); await p.waitForSelector(`${sheet} [data-floors-val]`); await p.waitForTimeout(400);
  if (await val() !== 29) throw new Error('prefill ' + await val());
  await p.click(`${sheet} [data-step="-1"]`); await p.click(`${sheet} [data-step="-1"]`); await p.click(`${sheet} [data-step="-1"]`); await p.click(`${sheet} [data-step="-1"]`);
  await p.click(`${sheet} .btn.primary`); await p.waitForTimeout(350);
  if ((await state()).days[T].climbs[1].floors !== 25) throw new Error('second');
});
await step('cancel (Escape) adds nothing; undo-last removes custom climbs too', async () => {
  await p.click('[data-action="climb-custom"]'); await p.waitForSelector(`${sheet} [data-floors-val]`); await p.waitForTimeout(400);
  await p.keyboard.press('Escape'); await p.waitForTimeout(350);
  if ((await state()).days[T].climbs.length !== 2) throw new Error('added on cancel');
  await p.click('[data-action="climb-undo"]'); await p.waitForTimeout(200);
  const c = (await state()).days[T].climbs;
  if (c.length !== 1 || c[0].floors !== 29) throw new Error(JSON.stringify(c));
  await p.click('[data-action="climb-undo"]'); await p.waitForTimeout(200);
  if ((await state()).days[T].climbs.length !== 0 || !(await p.$eval('[data-action="climb-undo"]', (x) => x.disabled))) throw new Error('undo 2');
});

/* ---------- Floors: card, ring, status ---------- */
await step('mixed regular + roof + custom: ring = floors / (6×6), "21/36 קומות", "3 עליות", status "עוד 15 קומות"', async () => {
  await seed({ 0: { steps: 10000, climbs: [...R(1), ...ROOF(1), ...C(5)] } });
  const fl = (await p.textContent(`${card} [data-floors]`)).replace(/\s+/g, ' ').trim();
  const cnt = (await p.textContent(`${card} [data-climbs-count]`)).replace(/\s+/g, ' ').trim();
  const frac = +(await p.getAttribute(`${card} .ring-fill`, 'data-frac'));
  if (fl !== '21/36 קומות' || cnt !== '3 עליות' || Math.abs(frac - 21 / 36) > 1e-9) throw new Error(`${fl} / ${cnt} / ${frac}`);
  if ((await p.textContent('.hero-status')).trim() !== 'עוד 15 קומות') throw new Error(await p.textContent('.hero-status'));
});
await step('status singular "עוד קומה אחת"; one entry → "עלייה אחת"; target reached → toast + status moves on', async () => {
  await seed({ 0: { steps: 10000, climbs: [...R(5), ...C(5)] } });
  if ((await p.textContent('.hero-status')).trim() !== 'עוד קומה אחת') throw new Error(await p.textContent('.hero-status'));
  await p.click('[data-action="climb-custom"]'); await p.waitForSelector(`${sheet} [data-floors-val]`); await p.waitForTimeout(400);
  await p.click(`${sheet} [data-step="-1"]`); await p.click(`${sheet} [data-step="-1"]`); await p.click(`${sheet} [data-step="-1"]`); await p.click(`${sheet} [data-step="-1"]`);
  await p.click(`${sheet} .btn.primary`); await p.waitForTimeout(350);
  if (!(await p.textContent('#toast')).includes('יעד המדרגות הושג')) throw new Error('toast');
  if ((await p.textContent('.hero-status')).includes('קומ')) throw new Error(await p.textContent('.hero-status'));
  await seed({ 0: { climbs: ROOF(1) } });
  if ((await p.textContent(`${card} [data-climbs-count]`)).trim() !== 'עלייה אחת') throw new Error('singular count');
});
await step('old data (regular/roof, also entries without stored floors) resolves exactly as before', async () => {
  await seed({ 0: { steps: 10000, climbs: [{ type: 'regular' }, { type: 'roof' }, ...R(2)] } });
  if ((await p.textContent(`${card} [data-floors]`)).replace(/\s+/g, ' ').trim() !== '28/36 קומות') throw new Error('floors');
  const xp = await call('./js/progress.js', 'dayXP', T);
  if (xp !== 3 * 3 + 5 + 10) throw new Error('xp ' + xp); // 3 regular (9) + 1 roof (5) + 10k steps (10)
});

/* ---------- Settings ---------- */
await step('settings: "יעד יומי: 36 קומות" under the stairs inputs, updates live', async () => {
  await seed({});
  await p.click('[data-tab="settings"]');
  if ((await p.textContent('[data-floors-target]')).replace(/\s+/g, ' ').trim() !== 'יעד יומי: 36 קומות') throw new Error(await p.textContent('[data-floors-target]'));
  const inStairs = await p.$eval('[data-floors-target]', (e) => !!e.closest('.card').querySelector('[data-setting="climbsTarget"]'));
  if (!inStairs) throw new Error('not in the stairs card');
  await p.fill('[data-setting="floorsRegular"]', '5'); await p.press('[data-setting="floorsRegular"]', 'Enter'); await p.waitForTimeout(200);
  if ((await p.textContent('[data-floors-target]')).replace(/\s+/g, ' ').trim() !== 'יעד יומי: 30 קומות') throw new Error('live ' + await p.textContent('[data-floors-target]'));
});

/* ---------- Heatmap ---------- */
await step('heatmap score: stairs part = floors / floors target, capped at 1', async () => {
  await seed({ 0: { climbs: C(18) }, 1: { climbs: [...C(30), ...C(20)] }, 2: { climbs: R(1) } });
  const s = await p.evaluate(async (ks) => { const m = await import('./js/progress.js'); return ks.map((k) => m.dayScore(k)); }, [key(0), key(1), key(2)]);
  const want = [0.5 / 4, 1 / 4, (6 / 36) / 4];
  if (s.some((v, i) => Math.abs(v - want[i]) > 1e-9)) throw new Error(s.join(','));
});

/* ---------- XP ---------- */
await step('XP: 1 per 2 floors, summed per day then rounded down (6=3, 10=5, 3=1, 1=0, 1+1=1, 6+3=4)', async () => {
  const cases = [[R(1), 3], [ROOF(1), 5], [C(3), 1], [C(1), 0], [C(1, 2), 1], [[...R(1), ...C(3)], 4], [[...R(3), ...ROOF(2)], 19]];
  const days = {}; cases.forEach(([c], i) => { days[i] = { climbs: c }; });
  await seed(days);
  const xp = await p.evaluate(async (ks) => { const m = await import('./js/progress.js'); return ks.map((k) => m.dayXP(k)); }, cases.map((_, i) => key(i)));
  if (xp.join(',') !== cases.map((c) => c[1]).join(',')) throw new Error(xp.join(','));
});

/* ---------- Badges ---------- */
const walk = () => p.evaluate(async () => { const m = await import('./js/progress.js'); const w = m.walkHistory(); return { eq: w.metrics.climbsTotal, e100: w.earned.climbs100 || null, e500: w.earned.climbs500 || null, desc: m.BADGES.find((x) => x.id === 'climbs100').desc }; });
await step('badges count climb-equivalents = total floors ÷ floorsRegular (60 × 10-floor customs = 100)', async () => {
  const days = {}; for (let i = 0; i < 10; i++) days[i] = { climbs: C(10, 6) }; // 600 floors, 60 entries
  await seed(days);
  const w = await walk();
  if (w.eq !== 100 || w.e100 !== T) throw new Error(JSON.stringify(w));
  if (!w.desc.includes('שווה ערך ל-100 עליות של 6 קומות')) throw new Error(w.desc);
});
await step('not earned by entry count alone (100 one-floor customs = 16 equivalents)', async () => {
  const days = {}; for (let i = 0; i < 10; i++) days[i] = { climbs: C(1, 10) };
  await seed(days);
  const w = await walk();
  if (w.eq !== 16 || w.e100) throw new Error(JSON.stringify(w));
});
await step('already-earned badges stay earned on their original date (floorsRegular raised to 10 afterwards)', async () => {
  const days = {}; for (let i = 0; i < 10; i++) days[i] = { climbs: R(10) }; // 100 regular entries × 6 floors
  await seed(days, { floorsRegular: 10 }, { seenBadges: ['climbs100'] });
  const w = await walk();
  if (w.eq !== 60 || w.e100 !== T) throw new Error(JSON.stringify(w)); // 100th entry was logged today
  await seed(days, { floorsRegular: 10 }, { seenBadges: [] });
  if ((await walk()).e100) throw new Error('earned without having been earned before');
});
await step('earned badge seen with no qualifying history still stays earned', async () => {
  await seed({ 0: { climbs: C(2) } }, {}, { seenBadges: ['climbs500'] });
  if (!(await walk()).e500) throw new Error('lost');
});

/* ---------- Exports ---------- */
await step('daily + weekly summary: "• מדרגות: 3 עליות · 21 קומות / 36"', async () => {
  await seed({ 0: { climbs: [...R(1), ...ROOF(1), ...C(5)] }, 1: { climbs: C(1) } });
  const d = (await call('./js/export.js', 'dailySummary', T)).split('\n');
  if (!d.includes('• מדרגות: 3 עליות · 21 קומות / 36')) throw new Error(d.filter((l) => l.includes('מדרגות')).join(' | '));
  const w = (await call('./js/export.js', 'weeklySummary')).split('\n');
  if (!w.includes('• מדרגות: 3 עליות · 21 קומות / 36') || !w.includes('• מדרגות: עלייה אחת · קומה אחת / 36')) throw new Error(w.filter((l) => l.includes('מדרגות')).join(' | '));
});

/* ---------- Insights ---------- */
await step('week-over-week in floors: "השבוע עלית 180 קומות, 20% יותר משבוע שעבר"', async () => {
  const days = {};
  [0, 1, 2, 3].forEach((i) => { days[i] = { climbs: C(30, 1).concat(C(15)) }; }); // 4 × 45 = 180
  [7, 8, 9, 10].forEach((i, j) => { days[i] = { climbs: C(j === 0 ? 30 : 40) }; }); // 30 + 40 × 3 = 150
  await seed(days);
  const ins = await call('./js/insights.js', 'weekInsights', T);
  const t = ins.find((x) => x.id === 'wow:climbs');
  if (!t || t.text !== 'השבוע עלית 180 קומות, 20% יותר משבוע שעבר') throw new Error(JSON.stringify(t));
});
await step('consistency + daily targets use the floors target (36)', async () => {
  const days = {}; for (let i = 0; i < 5; i++) days[i] = { climbs: [...R(4), ...C(12)] }; // 36 floors, only 5 entries
  await seed(days);
  const ins = await call('./js/insights.js', 'weekInsights', T);
  if (!ins.find((x) => x.id === 'consistency:climbs' && x.kind === 'positive')) throw new Error(JSON.stringify(ins.map((x) => x.id)));
  const di = await call('./js/insights.js', 'dayInsights', T);
  const tg = di.find((x) => x.id === 'targets' || x.id === 'allTargets');
  if (tg && !tg.text.includes('מדרגות')) throw new Error(tg.text);
  const rec = await call('./js/stats.js', 'computeRecords');
  const best = rec.best?.climbs || rec.records?.find?.((r) => r.id === 'climbs');
  if (best && best.unit !== 'קומות') throw new Error(JSON.stringify(best));
});

/* ---------- Layout ---------- */
for (const w of [412, 360]) {
  await step(`${w}px: stairs card + custom sheet — no overflow, button labels on one line`, async () => {
    await p.setViewportSize({ width: w, height: 915 });
    await seed({ 0: { climbs: [...R(1), ...C(5)] } });
    const r = await p.evaluate(() => ({ over: document.documentElement.scrollWidth > innerWidth,
      wrap: [...document.querySelectorAll('.btn-trio .big-add strong, .btn-trio .big-add span')].filter((e) => e.getClientRects().length > 1 || e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent) }));
    if (r.over || r.wrap.length) throw new Error(JSON.stringify(r));
    await p.click('[data-action="climb-custom"]'); await p.waitForSelector(`${sheet} [data-floors-val]`); await p.waitForTimeout(400); await p.waitForTimeout(300);
    if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('sheet overflow');
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  });
}
console.log('errors:', errors.length ? errors : 'none');
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
await b.close();
