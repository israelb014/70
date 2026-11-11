// v1.9.0: stair descents — buttons + custom sheet, descents line, undo order, XP, isolation from targets,
// record, insight, exports, backup, layout, offline.
import { chromium } from 'playwright';
import { autoDetail, openCard } from './nav200.mjs';
import fs from 'fs';
const BASE = process.env.BASE || 'http://127.0.0.1:8765/70/';
const SP = process.env.TEST_OUT;
const b = await chromium.launch();
let fails = 0; const step = async (l, fn) => { try { await fn(); console.log('OK  ', l); } catch (e) { fails++; console.log('FAIL', l, '-', e.message.split('\n')[0]); } };
const errors = [];
const DAY = 86400000;
const key = (o = 0) => { const d = new Date(Date.now() - o * DAY); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const T = key(0);
const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, acceptDownloads: true });
const p = await ctx.newPage();
autoDetail(p);
p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await p.goto(BASE);
const seed = async (days = {}, meta = {}) => {
  await p.evaluate(([days, meta, keys]) => {
    const out = {};
    for (const [o, d] of Object.entries(days)) out[keys[o]] = { rest: false, steps: null, climbs: [], descents: [], rides: [], exercises: {}, food: [], sleep: null, naps: [], water: [], breathing: [], ...d };
    localStorage.setItem('seventy.v1', JSON.stringify({ schemaVersion: 4,
      settings: { coach: { enabled: false }, theme: 'flame', startWeight: 90, targetWeight: 80, proteinTarget: 150, stepsTarget: 10000, rideGoalKm: 45, climbsTarget: 6, floorsRegular: 6, floorsRoof: 10, sleepTarget: 8, waterTarget: 2500 },
      exercises: [], mealPresets: [], customFoods: [], foodMemory: {}, weights: [], meta: { lastSeenLevel: 99, seenBadges: [], lastBackupAt: new Date().toISOString(), ...meta }, days: out }));
  }, [days, meta, Object.fromEntries(Array.from({ length: 30 }, (_, i) => [i, key(i)]))]);
  await p.reload(); await p.waitForTimeout(300);
};
const state = () => p.evaluate(() => JSON.parse(localStorage.getItem('seventy.v1')));
const call = (path, fn, ...args) => p.evaluate(async ([path, fn, args]) => (await import(path))[fn](...args), [path, fn, args]);
const card = '.card:has(.descent-row)';
const D = (type, floors, time, at) => ({ type, ...(floors ? { floors } : {}), ...(time ? { time } : {}), ...(at ? { at } : {}) });
const sheetVal = async () => Number((await p.textContent('.sheet [data-floors-val]')).trim());

await step('descent row under the ascent row: "ירידה" + "רגילה" / "מהגג" / "אחר", lighter, down-stairs icon; ascents unchanged', async () => {
  await seed({ 0: { steps: 10000 } });
  const asc = await p.$$eval(`${card} .btn-trio .big-add strong`, (e) => e.map((x) => x.textContent.trim()));
  const desc = await p.$$eval(`${card} .descent-btns .small-add strong`, (e) => e.map((x) => x.textContent.trim()));
  if (asc.join('|') !== 'עלייה רגילה|עלייה לגג|אחר' || desc.join('|') !== 'רגילה|מהגג|אחר') throw new Error(asc + ' / ' + desc);
  if ((await p.textContent(`${card} .descent-lbl`)).trim() !== 'ירידה' || !(await p.$(`${card} .descent-lbl svg`))) throw new Error('label');
  const below = await p.evaluate(() => { const r = document.querySelector('.descent-row'), t = document.querySelector('.btn-trio'); return r.getBoundingClientRect().top >= t.getBoundingClientRect().bottom; });
  const sizes = await p.evaluate(() => [document.querySelector('.btn-trio .big-add').getBoundingClientRect().height, document.querySelector('.small-add').getBoundingClientRect().height]);
  if (!below || !(sizes[1] < sizes[0])) throw new Error(`${below} ${sizes}`);
  if (await p.$('[data-descents]')) throw new Error('descents line without descents');
});
await step('"רגילה" / "מהגג" add descents with floors from settings + time; line "ירדת 16 קומות · 2 ירידות"', async () => {
  await p.click('[data-action=descent][data-type=regular]'); await p.waitForTimeout(150);
  await p.click('[data-action=descent][data-type=roof]'); await p.waitForTimeout(150);
  const d = (await state()).days[T].descents;
  if (d.length !== 2 || d[0].type !== 'regular' || d[0].floors !== 6 || d[1].type !== 'roof' || d[1].floors !== 10 || !/^\d\d:\d\d$/.test(d[0].time)) throw new Error(JSON.stringify(d));
  const t = (await p.textContent('[data-descents]')).replace(/\s+/g, ' ').trim();
  if (t !== 'ירדת 16 קומות · 2 ירידות') throw new Error(t);
  if ((await p.textContent('[data-floors]')).replace(/\s+/g, '') !== '0/36קומות') throw new Error('ascent floors touched');
});
await step('"אחר": same stepper sheet, 1–30, prefill 3 then the last custom descent; singular "ירדת קומה אחת · ירידה אחת"', async () => {
  await seed({});
  await p.click('[data-action=descent-custom]'); await p.waitForSelector('.sheet [data-floors-val]'); await p.waitForTimeout(400);
  if (await sheetVal() !== 3 || !(await p.textContent('.sheet .sheet-title')).includes('ירידה')) throw new Error('prefill/title');
  for (let i = 0; i < 5; i++) await p.click('.sheet [data-step="-1"]', { force: true });
  if (await sheetVal() !== 1 || !(await p.$eval('.sheet [data-step="-1"]', (x) => x.disabled))) throw new Error('min');
  await p.click('.sheet .btn.primary'); await p.waitForTimeout(300);
  if ((await p.textContent('[data-descents]')).replace(/\s+/g, ' ').trim() !== 'ירדת קומה אחת · ירידה אחת') throw new Error(await p.textContent('[data-descents]'));
  await p.click('[data-action=descent-custom]'); await p.waitForSelector('.sheet [data-floors-val]'); await p.waitForTimeout(400);
  if (await sheetVal() !== 1) throw new Error('prefill last custom descent');
  for (let i = 0; i < 35; i++) await p.click('.sheet [data-step="1"]', { force: true });
  if (await sheetVal() !== 30 || !(await p.$eval('.sheet [data-step="1"]', (x) => x.disabled))) throw new Error('max');
  await p.click('.sheet .btn.primary'); await p.waitForTimeout(300);
  const d = (await state()).days[T].descents;
  if (JSON.stringify(d.map((x) => [x.type, x.floors])) !== '[["custom",1],["custom",30]]') throw new Error(JSON.stringify(d));
  // the ascent "אחר" sheet still prefills from ascents only (default 3)
  await p.click('[data-action=climb-custom]'); await p.waitForSelector('.sheet [data-floors-val]'); await p.waitForTimeout(400);
  if (await sheetVal() !== 3) throw new Error('ascent prefill mixed with descents');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
});
await step('undo removes the most recent stairs entry of either kind, by time (old untimed ascents are oldest)', async () => {
  await seed({ 0: {
    climbs: [D('regular', 6), D('roof', 10), D('regular', 6, '09:00', 2), D('custom', 4, '09:30', 4)],
    descents: [D('regular', 6, '09:10', 3), D('custom', 2, '09:30', 5), D('roof', 10, '07:00', 1)],
  } });
  const order = [];
  for (let i = 0; i < 7; i++) {
    const before = await state();
    await p.click('[data-action=climb-undo]'); await p.waitForTimeout(120);
    const after = await state();
    const bc = before.days[T].climbs, ac = after.days[T].climbs, bd = before.days[T].descents, ad = after.days[T].descents;
    if (ac.length < bc.length) order.push(`a:${bc.find((x) => !ac.includes(x) && !ac.some((y) => JSON.stringify(y) === JSON.stringify(x)))?.time || 'old'}`);
    else if (ad.length < bd.length) order.push(`d:${bd.find((x) => !ad.some((y) => JSON.stringify(y) === JSON.stringify(x))).time}`);
  }
  // 09:30 descent (ms 5) after 09:30 ascent (ms 4); untimed ascents last, newest untimed first
  if (order.join(' ') !== 'd:09:30 a:09:30 d:09:10 a:09:00 d:07:00 a:old a:old') throw new Error(order.join(' '));
  const s = await state();
  if (s.days[T].climbs.length || s.days[T].descents.length || !(await p.$eval('[data-action=climb-undo]', (x) => x.disabled))) throw new Error('not all removed');
});
await step('new ascents also get a time (+ hidden ms stamp) for the undo order', async () => {
  await seed({});
  await p.click('[data-action=climb][data-type=regular]'); await p.waitForTimeout(100);
  await p.click('[data-action=descent][data-type=regular]'); await p.waitForTimeout(100);
  await p.click('[data-action=climb][data-type=roof]'); await p.waitForTimeout(100);
  const s = (await state()).days[T];
  if (!/^\d\d:\d\d$/.test(s.climbs[0].time) || !(s.climbs[0].at > 0)) throw new Error(JSON.stringify(s.climbs[0]));
  await p.click('[data-action=climb-undo]'); await p.waitForTimeout(100);
  let t = (await state()).days[T];
  if (t.climbs.length !== 1 || t.descents.length !== 1) throw new Error('first undo (roof ascent)');
  await p.click('[data-action=climb-undo]'); await p.waitForTimeout(100);
  t = (await state()).days[T];
  if (t.climbs.length !== 1 || t.descents.length !== 0) throw new Error('second undo (descent)');
});

/* ---------- Rules ---------- */
await step('XP: 1 per 6 descended floors per day (summed, then rounded down)', async () => {
  const cases = [[[D('regular')], 1], [[D('roof')], 1], [[D('custom', 5)], 0], [[D('custom', 3), D('custom', 3)], 1], [[D('roof'), D('regular'), D('custom', 2)], 3], [[D('custom', 11)], 1]];
  const days = {}; cases.forEach(([d], i) => { days[i] = { descents: d }; });
  await seed(days);
  const xp = await p.evaluate(async (ks) => { const m = await import('./js/progress.js'); return ks.map((k) => m.dayXP(k)); }, cases.map((_, i) => key(i)));
  if (xp.join(',') !== cases.map((c) => c[1]).join(',')) throw new Error(xp.join(','));
});
await step('descents do not touch the stairs ring / target / status / completion / heatmap / climb badges', async () => {
  const many = Array.from({ length: 20 }, () => D('roof'));
  await seed({ 0: { steps: 10000, descents: many }, 1: { steps: 10000 } });
  const frac = +(await p.getAttribute(`${card} .ring-fill`, 'data-frac'));
  if (frac !== 0 || !(await p.textContent('.hero-status')).includes('קומות')) throw new Error(`${frac} / ${await p.textContent('.hero-status')}`);
  const r2 = await p.evaluate(async (ks) => { const pr = await import('./js/progress.js'); const st = await import('./js/stats.js'); return ks.map((k) => [pr.dayScore(k), st.completionPct(k)]); }, [key(0), key(1)]);
  if (JSON.stringify(r2[0]) !== JSON.stringify(r2[1])) throw new Error(JSON.stringify(r2));
  const w = await p.evaluate(async () => { const m = (await import('./js/progress.js')).walkHistory(); return [m.metrics.climbsTotal, !!m.earned.climbs100]; });
  if (w[0] !== 0 || w[1]) throw new Error('badges ' + w);
});
await step('record "הכי הרבה קומות בירידה ביום" + record insight text', async () => {
  await seed({ 1: { descents: [D('regular')] }, 0: { descents: [D('roof'), D('custom', 4)] } });
  const r = await call('./js/stats.js', 'computeRecords');
  const rec = r.records.find((x) => x.id === 'descents');
  if (!rec || rec.label !== 'הכי הרבה קומות בירידה ביום' || rec.value !== 14 || rec.unit !== 'קומות') throw new Error(JSON.stringify(rec));
  const ins = await call('./js/insights.js', 'dayInsights', T);
  if (!ins.some((x) => x.text === 'שיא חדש בירידה במדרגות: 14 קומות ביום')) throw new Error(ins.map((x) => x.text).join(' | '));
});
await step('insight: week-over-week descended floors (≥ 4 days each week, ≥ 10%)', async () => {
  const days = {}; [0, 1, 2, 3].forEach((i) => { days[i] = { descents: [D('roof'), D('regular')] }; }); [7, 8, 9, 10].forEach((i) => { days[i] = { descents: [D('regular'), D('custom', 2)] }; });
  await seed(days);
  const w = (await call('./js/insights.js', 'weekInsights', T)).find((x) => x.id === 'wow:descents');
  if (!w || w.text !== 'השבוע ירדת 64 קומות במדרגות, 100% יותר משבוע שעבר') throw new Error(JSON.stringify(w));
  delete days[10]; await seed(days);
  if ((await call('./js/insights.js', 'weekInsights', T)).some((x) => x.id === 'wow:descents')) throw new Error('shown with 3 days');
});

/* ---------- Exports ---------- */
await step('exports: daily line right after the stairs line, singular forms, omitted when none; weekly per day', async () => {
  await seed({ 0: { climbs: [D('regular', 6)], descents: [D('regular'), D('roof'), D('custom', 2)] }, 1: { descents: [D('custom', 1)] }, 2: { climbs: [D('regular', 6)] } });
  const d0 = (await call('./js/export.js', 'dailySummary', T)).split('\n');
  const i = d0.findIndex((l) => l.startsWith('• מדרגות:'));
  if (d0[i + 1] !== '• ירידה במדרגות: 3 ירידות · 18 קומות') throw new Error(d0.slice(i, i + 2).join(' | '));
  const d1 = (await call('./js/export.js', 'dailySummary', key(1))).split('\n');
  if (!d1.includes('• ירידה במדרגות: ירידה אחת · קומה אחת')) throw new Error(d1.join(' | '));
  if ((await call('./js/export.js', 'dailySummary', key(2))).includes('ירידה')) throw new Error('shown without descents');
  const w = (await call('./js/export.js', 'weeklySummary')).split('\n');
  if (!w.includes('• ירידה במדרגות: 3 ירידות · 18 קומות') || !w.includes('• ירידה במדרגות: ירידה אחת · קומה אחת')) throw new Error(w.filter((l) => l.includes('ירידה')).join(' | '));
});
await step('backup round-trip keeps descents; old backups without them import', async () => {
  await seed({ 0: { climbs: [D('regular', 6, '08:00', 1)], descents: [D('roof', null, '08:10', 2), D('custom', 3, '08:20', 3)] } });
  await p.click('[data-tab=settings]');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-action=export]')]);
  const path = `${SP}/backup-desc.json`; await dl.saveAs(path);
  const before = await p.evaluate(() => localStorage.getItem('seventy.v1'));
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('seventy.v1')); s.days = {}; localStorage.setItem('seventy.v1', JSON.stringify(s)); });
  await p.reload(); await p.click('[data-tab=settings]');
  await p.setInputFiles('[data-file]', path); await p.click('.sheet .btn.danger'); await p.waitForTimeout(600);
  if (await p.evaluate(() => localStorage.getItem('seventy.v1')) !== before) throw new Error('mismatch');
  const old = JSON.parse(fs.readFileSync(path, 'utf8')); for (const d of Object.values(old.days)) delete d.descents;
  fs.writeFileSync(path.replace('.json', '-old.json'), JSON.stringify(old));
  await p.setInputFiles('[data-file]', path.replace('.json', '-old.json')); await p.click('.sheet .btn.danger'); await p.waitForTimeout(600);
  if (JSON.stringify((await state()).days[T].descents) !== '[]') throw new Error('old backup');
  await p.click('[data-tab=today]');
});

/* ---------- Layout + offline ---------- */
for (const width of [412, 360]) {
  await step(`${width}px: stairs card with descents — no overflow, no wrapping`, async () => {
    await p.setViewportSize({ width, height: 915 });
    await seed({ 0: { climbs: [D('regular', 6)], descents: Array.from({ length: 13 }, () => D('roof')) } });
    const r = await p.evaluate(() => {
      const els = [...document.querySelectorAll('.small-add strong, .small-add span, .descent-lbl, [data-descents]')];
      return { over: document.documentElement.scrollWidth > innerWidth,
        wrap: els.filter((e) => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().height > parseFloat(getComputedStyle(e).lineHeight) * 1.5 + 2).map((e) => e.textContent.trim()) };
    });
    if (r.over || r.wrap.length) throw new Error(JSON.stringify(r));
    if ((await p.textContent('[data-descents]')).replace(/\s+/g, ' ').trim() !== 'ירדת 130 קומות · 13 ירידות') throw new Error('line');
  });
}
await p.setViewportSize({ width: 412, height: 915 });
await step('offline: descents can be added and undone', async () => {
  await seed({});
  await p.evaluate(() => navigator.serviceWorker.ready); await p.reload(); await p.waitForTimeout(300);
  await ctx.setOffline(true); await p.reload(); await p.waitForTimeout(400);
  await p.click('[data-action=descent][data-type=roof]'); await p.waitForTimeout(150);
  const n1 = (await state()).days[T].descents.length;
  await p.click('[data-action=climb-undo]'); await p.waitForTimeout(150);
  const n2 = (await state()).days[T].descents.length;
  await ctx.setOffline(false);
  if (n1 !== 1 || n2 !== 0) throw new Error(`${n1} ${n2}`);
});
console.log('errors:', errors.length ? errors : 'none');
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
await b.close();
