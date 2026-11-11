// v1.6.5: per-set reps + weight (sheet, chips, per-set prefill, target-prompt rule, exports, records).
import { chromium } from 'playwright';
import { autoDetail, openCard } from './nav200.mjs';
import { fillSetSheet, longPressSet } from './helpers152.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:8765/70/';
const b = await chromium.launch();
let fails = 0; const step = async (l, fn) => { try { await fn(); console.log('OK  ', l); } catch (e) { fails++; console.log('FAIL', l, '-', e.message.split('\n')[0]); } };
const errors = [];
const DAY = 86400000;
const key = (o = 0) => { const d = new Date(Date.now() - o * DAY); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const T = key(0);
const L = '⁦', R = '⁩';
const p = await (await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true })).newPage();
autoDetail(p);
p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await p.goto(BASE);
const CURL = { id: 'e1', name: 'כפיפת מרפקים', type: 'setsReps', sets: 3, reps: 10, seconds: null, weight: 6, order: 0, archived: false };
const PUSH = { id: 'e2', name: 'שכיבות סמיכה', type: 'setsReps', sets: 3, reps: 20, seconds: null, weight: null, order: 1, archived: false };
const set = (reps, weight, done = true) => ({ reps, weight, done });
const seed = async (days = {}, exercises = [CURL, PUSH], meta = {}) => {
  await p.evaluate(([days, exercises, meta, keys]) => {
    const out = {};
    for (const [o, d] of Object.entries(days)) out[keys[o]] = { rest: false, steps: null, climbs: [], rides: [], exercises: {}, food: [], sleep: null, naps: [], water: [], ...d };
    localStorage.setItem('seventy.v1', JSON.stringify({ schemaVersion: 4,
      settings: { coach: { enabled: false }, theme: 'flame', startWeight: 90, targetWeight: 80, proteinTarget: 150, stepsTarget: 10000, rideGoalKm: 45, climbsTarget: 6, floorsRegular: 6, floorsRoof: 10, sleepTarget: 8, waterTarget: 2500 },
      exercises, mealPresets: [], customFoods: [], foodMemory: {}, weights: [], meta: { lastSeenLevel: 99, seenBadges: [], lastBackupAt: new Date().toISOString(), ...meta }, days: out }));
  }, [days, exercises, meta, Object.fromEntries(Array.from({ length: 40 }, (_, i) => [i, key(i)]))]);
  await p.goto(BASE); await p.waitForTimeout(250);
};
const state = () => p.evaluate(() => JSON.parse(localStorage.getItem('seventy.v1')));
const open = async (id) => { await p.click(`.ex-card[data-exrow="${id}"] .ex-head`); await p.waitForTimeout(400); };
const chips = (id) => p.$$eval(`.ex-card[data-exrow="${id}"] .chip`, (els) => els.map((e) => `${e.querySelector('.chip-reps').textContent.trim()}|${e.querySelector('.chip-lbl').textContent.replace(/\s+/g, ' ').trim()}`));
const repsVal = async () => Number(await p.textContent('.sheet [data-reps-val]'));
const wVal = () => p.inputValue('.sheet [data-w-val]');
const dis = (sel) => p.$eval(sel, (x) => x.disabled);
const noPrompt = async () => { await p.waitForTimeout(400); if (await p.locator('.sheet-text').count()) throw new Error('unexpected target prompt'); };
const call = (path, fn, ...args) => p.evaluate(async ([path, fn, args]) => (await import(path))[fn](...args), [path, fn, args]);

/* ---------- Sheet ---------- */
await step('long-press opens the per-set sheet: "חזרות" + "משקל (ק״ג)" steppers, "שמירה" + "ביטול", prefilled', async () => {
  await seed({}); await open('e1'); await longPressSet(p, 1);
  await p.waitForSelector('.sheet [data-reps-val]'); await p.waitForTimeout(350);
  const lbls = await p.$$eval('.sheet .set-stepper-lbl', (e) => e.map((x) => x.textContent.trim()));
  const acts = await p.$$eval('.sheet .sheet-actions .btn', (e) => e.map((x) => x.textContent.trim()));
  if (lbls.join('|') !== 'חזרות|משקל (ק״ג)' || acts.join('|') !== 'ביטול|שמירה') throw new Error(`${lbls} / ${acts}`);
  if (await repsVal() !== 10 || await wVal() !== '6') throw new Error(`${await repsVal()} / ${await wVal()}`);
  if (!(await p.textContent('.sheet .sheet-title')).includes('סט 2')) throw new Error('title');
  if (await p.getAttribute('.sheet [data-w-val]', 'inputmode') !== 'decimal') throw new Error('keypad');
});
await step('weight: 0.5 steps, down to 0 = "משקל גוף" (− disabled); typing incl. "12,5"; clamps at 200 (+ disabled)', async () => {
  await p.click('.sheet [data-step="w:1"]'); if (await wVal() !== '6.5') throw new Error(await wVal());
  await p.click('.sheet [data-step="w:-1"]'); await p.click('.sheet [data-step="w:-1"]'); if (await wVal() !== '5.5') throw new Error(await wVal());
  for (let i = 0; i < 15; i++) await p.click('.sheet [data-step="w:-1"]', { force: true });
  if (await wVal() !== '0' || !(await dis('.sheet [data-step="w:-1"]')) || (await p.textContent('.sheet [data-w-note]')).trim() !== 'משקל גוף') throw new Error('min');
  await p.fill('.sheet [data-w-val]', '12,5'); await p.click('.sheet [data-step="w:1"]');
  if (await wVal() !== '13') throw new Error('typed+step ' + await wVal());
  await p.fill('.sheet [data-w-val]', '250'); await p.locator('.sheet [data-w-val]').blur();
  if (await wVal() !== '200' || !(await dis('.sheet [data-step="w:1"]'))) throw new Error('max ' + await wVal());
  await p.fill('.sheet [data-w-val]', '199.5'); await p.click('.sheet [data-step="w:1"]');
  if (await wVal() !== '200') throw new Error('199.5+0.5 ' + await wVal());
});
await step('reps: 0–200, step 1 (− disabled at 0, + at 200)', async () => {
  for (let i = 0; i < 12; i++) await p.click('.sheet [data-step="reps:-1"]', { force: true });
  if (await repsVal() !== 0 || !(await dis('.sheet [data-step="reps:-1"]'))) throw new Error('min ' + await repsVal());
  await p.click('.sheet .btn.ghost'); await p.waitForTimeout(350);
  if ((await state()).days[T]) throw new Error('cancel saved something');
  await seed({}, [{ ...CURL, reps: 198 }, PUSH]); await open('e1'); await longPressSet(p, 0);
  await fillSetSheet(p, {});
  await p.click('.sheet [data-step="reps:1"]'); await p.click('.sheet [data-step="reps:1"]'); await p.click('.sheet [data-step="reps:1"]', { force: true });
  if (await repsVal() !== 200 || !(await dis('.sheet [data-step="reps:1"]'))) throw new Error('max ' + await repsVal());
  await p.click('.sheet .btn.ghost'); await p.waitForTimeout(300);
});
await step('saving an undone set marks it done with its own reps + weight; editing a done set changes only that set', async () => {
  await seed({}); await open('e1');
  await longPressSet(p, 0); await fillSetSheet(p, { reps: 8, weight: 12 }); await p.click('.sheet .btn.primary'); await noPrompt();
  let sets = (await state()).days[T].exercises.e1.sets;
  if (JSON.stringify(sets) !== JSON.stringify([set(8, 12)])) throw new Error(JSON.stringify(sets));
  await p.click('.ex-card.open [data-action=set][data-i="1"]'); await p.click('.ex-card.open [data-action=set][data-i="2"]'); await p.waitForTimeout(200);
  sets = (await state()).days[T].exercises.e1.sets;
  if (JSON.stringify(sets) !== JSON.stringify([set(8, 12), set(10, 6), set(10, 6)])) throw new Error('tap prefill ' + JSON.stringify(sets));
  await open('e1'); if (!(await p.$('.ex-card.open'))) await open('e1');
  await longPressSet(p, 2); await fillSetSheet(p, { reps: 9, weight: 7 }); await p.click('.sheet .btn.primary'); await noPrompt();
  sets = (await state()).days[T].exercises.e1.sets;
  if (JSON.stringify(sets) !== JSON.stringify([set(8, 12), set(10, 6), set(9, 7)])) throw new Error(JSON.stringify(sets));
});
await step('exercise without a target weight: weight optional (0 → none, 5 → 5); edit control opens the next set to do', async () => {
  await seed({}); await open('e2');
  await p.click('.ex-card.open [data-action="sets-edit"]'); await fillSetSheet(p, { reps: 20, weight: 0 });
  if (!(await p.textContent('.sheet .sheet-title')).includes('סט 1')) throw new Error('not set 1');
  await p.click('.sheet .btn.primary'); await p.waitForTimeout(400);
  if (!(await p.$('.ex-card.open'))) await open('e2');
  await p.click('.ex-card.open [data-action="sets-edit"]'); await fillSetSheet(p, { reps: 15, weight: 5 });
  if (!(await p.textContent('.sheet .sheet-title')).includes('סט 2')) throw new Error('not set 2');
  await p.click('.sheet .btn.primary'); await noPrompt();
  const sets = (await state()).days[T].exercises.e2.sets;
  if (JSON.stringify(sets) !== JSON.stringify([set(20, null), set(15, 5)])) throw new Error(JSON.stringify(sets));
});

/* ---------- Chips ---------- */
await step('chips: weight shown only when it differs from the target (or no target weight)', async () => {
  await seed({ 0: { exercises: { e1: { sets: [set(8, 12), set(10, 6)] }, e2: { sets: [set(20, null), set(15, 5)] } } } });
  await open('e1');
  const a = await chips('e1');
  if (a.join(' / ') !== '8|12 ק״ג / 10|סט 2 / 10|סט 3') throw new Error(a.join(' / '));
  await open('e2');
  const c = await chips('e2');
  if (c.join(' / ') !== '20|סט 1 / 15|5 ק״ג / 20|סט 3') throw new Error(c.join(' / '));
  if (!(await p.getAttribute('.ex-card[data-exrow="e1"] .chip[data-i="0"]', 'aria-label')).includes('8 חזרות · 12 ק״ג')) throw new Error('aria');
  if (!(await p.textContent('.ex-card[data-exrow="e1"] .ex-meta .muted')).includes('3×10')) throw new Error('target line');
});

/* ---------- Per-set prefill ---------- */
await step('next day: each set prefills from the same set of the last session (12 / 6 / 6), tap stores it', async () => {
  await seed({}); await p.click('[data-action="date-prev"]'); await p.waitForTimeout(200); await open('e1');
  await longPressSet(p, 0); await fillSetSheet(p, { reps: 8, weight: 12 }); await p.click('.sheet .btn.primary'); await p.waitForTimeout(400);
  if (!(await p.$('.ex-card.open'))) await open('e1');
  await p.click('.ex-card.open [data-action=set][data-i="1"]'); await p.click('.ex-card.open [data-action=set][data-i="2"]'); await p.waitForTimeout(300);
  await p.click('[data-action="date-next"]'); await p.waitForTimeout(300); await open('e1');
  const c = await chips('e1');
  if (c.join(' / ') !== '8|12 ק״ג / 10|סט 2 / 10|סט 3') throw new Error(c.join(' / '));
  for (const i of [0, 1, 2]) { if (!(await p.$('.ex-card.open'))) await open('e1'); await p.click(`.ex-card.open [data-action=set][data-i="${i}"]`); await p.waitForTimeout(150); }
  const sets = (await state()).days[T].exercises.e1.sets;
  if (JSON.stringify(sets) !== JSON.stringify([set(8, 12), set(10, 6), set(10, 6)])) throw new Error(JSON.stringify(sets));
});
await step('old data (ex.last without per-set weights) prefills the last weight / target as before', async () => {
  await seed({}, [{ ...CURL, last: { reps: [11, 11, 11], weight: 7 } }, { ...PUSH, last: { reps: [18, 18, 18], weight: null } }]);
  await open('e1'); await p.click('.ex-card.open [data-action=set][data-i="0"]'); await p.waitForTimeout(200);
  await open('e2'); await p.click('.ex-card.open [data-action=set][data-i="0"]'); await p.waitForTimeout(200);
  const ex = (await state()).days[T].exercises;
  if (JSON.stringify(ex.e1.sets[0]) !== JSON.stringify(set(11, 7)) || JSON.stringify(ex.e2.sets[0]) !== JSON.stringify(set(18, null))) throw new Error(JSON.stringify(ex));
});

/* ---------- Target prompt ---------- */
await step('target prompt: not before the sets are done; all 3 at 8 kg → prompt once; once per exercise per day', async () => {
  await seed({}); await open('e1');
  for (const i of [0, 1]) {
    if (!(await p.$('.ex-card.open'))) await open('e1');
    await longPressSet(p, i); await fillSetSheet(p, { reps: 10, weight: 8 }); await p.click('.sheet .btn.primary'); await noPrompt();
  }
  if (!(await p.$('.ex-card.open'))) await open('e1');
  await longPressSet(p, 2); await fillSetSheet(p, { reps: 10, weight: 8 }); await p.click('.sheet .btn.primary');
  await p.waitForSelector('.sheet-text');
  if (!(await p.textContent('.sheet-text')).includes('8')) throw new Error(await p.textContent('.sheet-text'));
  await p.click('.sheet .btn.ghost'); await p.waitForTimeout(400);
  if ((await state()).meta.targetPrompts.e1 !== T) throw new Error('not recorded');
  await p.reload(); await open('e1');
  await longPressSet(p, 1); await fillSetSheet(p, { reps: 10, weight: 8 }); await p.click('.sheet .btn.primary'); await noPrompt();
});
await step('target prompt: another day can ask again', async () => {
  await seed({ 0: { exercises: { e1: { sets: [set(10, 8), set(10, 8)] } } } }, [CURL, PUSH], { targetPrompts: { e1: key(1) } }); await open('e1');
  await longPressSet(p, 2); await fillSetSheet(p, { reps: 10, weight: 8 }); await p.click('.sheet .btn.primary');
  await p.waitForSelector('.sheet-text'); await p.click('.sheet .btn.ghost'); await p.waitForTimeout(300);
});
await step('target prompt: mixed weights → none; shared reps ≠ target → prompt; accepting updates the target', async () => {
  await seed({ 0: { exercises: { e1: { sets: [set(8, 12), set(10, 6)] } } } }); await open('e1');
  await longPressSet(p, 2); await fillSetSheet(p, { reps: 10, weight: 6 }); await p.click('.sheet .btn.primary'); await noPrompt();
  await seed({ 0: { exercises: { e1: { sets: [set(12, 6), set(12, 6)] } } } }); await open('e1');
  await longPressSet(p, 2); await fillSetSheet(p, { reps: 12, weight: 6 }); await p.click('.sheet .btn.primary');
  await p.waitForSelector('.sheet-text');
  await p.click('.sheet .btn.primary'); await p.waitForTimeout(400);
  const ex = (await state()).exercises.find((x) => x.id === 'e1');
  if (ex.reps !== 12 || ex.weight !== 6) throw new Error(JSON.stringify(ex));
  await seed({ 0: { exercises: { e1: { sets: [set(10, 6), set(10, 6)] } } } }); await open('e1');
  await longPressSet(p, 2); await fillSetSheet(p, { reps: 10, weight: 6 }); await p.click('.sheet .btn.primary'); await noPrompt();
});

/* ---------- Exports ---------- */
await step('exports: uniform weight keeps the old format; mixed lists each set; bodyweight sets show only reps', async () => {
  await seed({ 0: { exercises: { e1: { sets: [set(8, 12), set(10, 6), set(10, 6)] }, e2: { sets: [set(20, null), set(15, 5)] } } },
    1: { exercises: { e1: { sets: [set(20, 6), set(20, 6), set(20, 6)] }, e2: { sets: [set(20, null), set(15, null)] } } } });
  const d0 = (await call('./js/export.js', 'dailySummary', T)).split('\n');
  const d1 = (await call('./js/export.js', 'dailySummary', key(1))).split('\n');
  const mixed = `• כפיפת מרפקים: 3 סטים (${L}8 × 12${R} ק״ג, ${L}10 × 6${R} ק״ג, ${L}10 × 6${R} ק״ג)`;
  const bw = `• שכיבות סמיכה: 2 סטים (20, ${L}15 × 5${R} ק״ג)`;
  if (!d0.includes(mixed) || !d0.includes(bw)) throw new Error(d0.filter((l) => l.includes('סט')).join(' | '));
  if (!d1.includes('• כפיפת מרפקים: 3 סטים (20, 20, 20 חזרות) · 6 ק״ג') || !d1.includes('• שכיבות סמיכה: 2 סטים (20, 15 חזרות)')) throw new Error(d1.filter((l) => l.includes('סט')).join(' | '));
  const w = (await call('./js/export.js', 'weeklySummary')).split('\n');
  for (const l of [mixed, bw, '• כפיפת מרפקים: 3 סטים (20, 20, 20 חזרות) · 6 ק״ג']) if (!w.includes(l)) throw new Error('weekly missing ' + l);
});

/* ---------- Records, insights, XP ---------- */
await step('records: heaviest single set and most reps in a single set (any weight)', async () => {
  await seed({ 1: { exercises: { e1: { sets: [set(10, 6), set(10, 6)] } } }, 0: { exercises: { e1: { sets: [set(8, 12), set(14, 4), set(10, 6)] } } } });
  const r = await call('./js/stats.js', 'computeRecords');
  const w = r.records.find((x) => x.id === 'w:e1'), reps = r.records.find((x) => x.id === 'reps:e1');
  if (w.value !== 12 || reps.value !== 14) throw new Error(JSON.stringify({ w, reps }));
  const ins = await call('./js/insights.js', 'dayInsights', T);
  const texts = ins.map((x) => x.text);
  if (!texts.includes('שיא חדש בכפיפת מרפקים: 12 ק״ג') || !texts.includes('שיא חדש בכפיפת מרפקים: 14 חזרות בסט')) throw new Error(texts.join(' | '));
});
await step('progression insight uses the per-set weight (8×12 now vs 10×6 four weeks ago → +60%)', async () => {
  await seed({ 0: { exercises: { e1: { sets: [set(8, 12), set(10, 6), set(10, 6)] } } }, 28: { exercises: { e1: { sets: [set(10, 6), set(10, 6), set(10, 6)] } } } });
  const ins = await call('./js/insights.js', 'weekInsights', T);
  const pr = ins.find((x) => x.id === 'progress:e1');
  if (!pr || !pr.text.includes('60%')) throw new Error(JSON.stringify(ins.map((x) => x.id)));
});
await step('XP and completion unchanged (count sets, not weight)', async () => {
  await seed({ 0: { exercises: { e1: { sets: [set(8, 12), set(10, 6)] } } }, 1: { exercises: { e1: { sets: [set(10, 6), set(10, 6)] } } } });
  const r = await p.evaluate(async (ks) => { const pr = await import('./js/progress.js'); const st = await import('./js/stats.js'); return ks.map((k) => [pr.dayXP(k), st.completionPct(k)]); }, [key(0), key(1)]);
  if (JSON.stringify(r[0]) !== JSON.stringify(r[1]) || r[0][0] !== 4) throw new Error(JSON.stringify(r));
});

/* ---------- Layout ---------- */
for (const w of [412, 360]) {
  await step(`${w}px: chips with weights + per-set sheet — no overflow`, async () => {
    await p.setViewportSize({ width: w, height: 915 });
    await seed({ 0: { exercises: { e1: { sets: [set(188, 112.5), set(10, 6)] } } } }); await open('e1');
    const r = await p.evaluate(() => ({ over: document.documentElement.scrollWidth > innerWidth, cut: [...document.querySelectorAll('.ex-card.open .chip')].filter((c) => c.scrollWidth > c.clientWidth + 1).length }));
    if (r.over || r.cut) throw new Error(JSON.stringify(r));
    await longPressSet(p, 0); await fillSetSheet(p, {});
    if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('sheet overflow');
    await p.click('.sheet .btn.ghost'); await p.waitForTimeout(300);
  });
}
console.log('errors:', errors.length ? errors : 'none');
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
await b.close();
