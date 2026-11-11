// v1.6.1: naps — sheet (add/edit/delete/undo/swipe), validation, prefill, night clearing, totals + ring,
// duration formats, exports (bidi isolation), chart stacking + tooltip, averages, XP, badge, insights, backup.
import { chromium } from 'playwright';
import { autoDetail, openCard } from './nav200.mjs';
import fs from 'fs';
const BASE = process.env.BASE || 'http://127.0.0.1:8765/70/';
const SP = process.env.TEST_OUT;
const b = await chromium.launch();
let fails = 0; const step = async (l, fn) => { try { await fn(); console.log('OK  ', l); } catch (e) { fails++; console.log('FAIL', l, '-', e.message.split('\n').slice(0, 14).join(' ¦ ')); } };
const errors = [];
const DAY = 86400000;
const key = (o = 0) => { const d = new Date(Date.now() - o * DAY); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const T = key(0);
const L = '⁦', R = '⁩'; // the isolates used by exports

const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, acceptDownloads: true });
const p = await ctx.newPage();
autoDetail(p);
p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await p.goto(BASE);

// days: { offset: { sleep, naps, food... } }
const seed = async (days = {}, settings = {}) => {
  await p.evaluate(([days, settings, keys]) => {
    const out = {};
    for (const [o, d] of Object.entries(days)) out[keys[o]] = { rest: false, steps: null, climbs: [], rides: [], exercises: {}, food: [], sleep: null, water: [], ...d };
    localStorage.setItem('seventy.v1', JSON.stringify({ schemaVersion: 4,
      settings: { coach: { enabled: false }, theme: 'flame', startWeight: 90, targetWeight: 80, proteinTarget: 150, stepsTarget: 10000, rideGoalKm: 45, climbsTarget: 6, floorsRegular: 6, floorsRoof: 10, sleepTarget: 8, waterTarget: 2500, ...settings },
      exercises: [], mealPresets: [], customFoods: [], foodMemory: {}, weights: [], meta: { lastSeenLevel: 99, seenBadges: [], lastBackupAt: new Date().toISOString() }, days: out }));
  }, [days, settings, Object.fromEntries(Array.from({ length: 30 }, (_, i) => [i, key(i)]))]);
  await p.goto(BASE); await p.waitForTimeout(250);
};
const state = () => p.evaluate(() => JSON.parse(localStorage.getItem('seventy.v1')));
const NIGHT = { bed: '23:30', wake: '06:30' }; // 7:00
const mod = (path, fn, ...args) => p.evaluate(async ([path, fn, args]) => { const m = await import(path); return m[fn](...args); }, [path, fn, args]);

const sheet = '.sheet-backdrop:not(:has(.tp)) .sheet';
async function setNapTime(which, hhmm) {
  await p.click(`${sheet} [data-nap="${which}"]`);
  await p.waitForSelector('.tp-wheel'); await p.waitForTimeout(300);
  const [h, m] = hhmm.split(':').map(Number);
  await p.evaluate(([h, m]) => {
    const set = (sel, i) => { const w = document.querySelector(sel); w.style.scrollBehavior = 'auto'; w.scrollTop = i * 48; w.dispatchEvent(new Event('scroll')); };
    const mins = [...document.querySelectorAll('[data-wheel=m] .tp-item')].map((el) => Number(el.textContent));
    set('[data-wheel=h]', h); set('[data-wheel=m]', mins.indexOf(m));
  }, [h, m]);
  await p.waitForTimeout(250);
  await p.click('.sheet-backdrop:has(.tp) .btn.primary'); await p.waitForTimeout(350);
}
const msg = async () => (await p.textContent(`${sheet} [data-nap-err]`)).trim();
const saveDisabled = () => p.$eval(`${sheet} .btn.primary`, (b) => b.disabled);
const sleepCard = '.card.role-sleep';
const rows = () => p.$$eval('.nap-row', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
async function addNap(start, end) {
  await p.click('[data-action="nap-new"]'); await p.waitForSelector(`${sheet} [data-nap]`);
  await setNapTime('start', start); await setNapTime('end', end);
  await p.click(`${sheet} .btn.primary`); await p.waitForTimeout(400);
}
const closeSheet = async () => { await p.keyboard.press('Escape'); await p.waitForTimeout(350); };

/* ---------- Adding, prefill, formats ---------- */
await step('prefill without nap history: 14:00 / 15:00; "+ תנומה" under the night fields', async () => {
  await seed({ 0: { sleep: NIGHT } });
  await openCard(p, 'sleep');
  const order = await p.evaluate(() => { const c = document.querySelector('.card.role-sleep'); const f = c.querySelector('[data-sleep=wake]'), n = c.querySelector('[data-action=nap-new]'); return !!(f.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING); });
  if (!order) throw new Error('button not under the night fields');
  if ((await p.textContent('[data-action=nap-new]')).trim() !== 'תנומה' || !(await p.$('[data-action=nap-new] svg'))) throw new Error('label');
  await p.click('[data-action="nap-new"]'); await p.waitForSelector(`${sheet} [data-nap]`);
  const v = await p.$$eval(`${sheet} [data-nap]`, (els) => els.map((e) => `${e.querySelector('.time-field-lbl').textContent}=${e.dataset.value}`));
  if (v.join('|') !== 'נרדמתי=14:00|קמתי=15:00') throw new Error(v.join('|'));
  if (await p.$(`${sheet} .btn.danger`)) throw new Error('delete button on a new nap');
  const labels = await p.$$eval(`${sheet} .sheet-actions .btn`, (bs) => bs.map((x) => x.textContent.trim()));
  if (labels.join('|') !== 'שמירה') throw new Error(labels.join('|'));
  await closeSheet();
});
await step('add naps (any number), rows sorted by start, formats: שעה אחת / 1:20 שעות / 40 דקות', async () => {
  await addNap('17:10', '18:30');
  await addNap('14:00', '15:00');
  await addNap('11:00', '11:40');
  const r = await rows();
  if (r.join('|') !== 'תנומה · 11:00–11:40 · 40 דקות|תנומה · 14:00–15:00 · שעה אחת|תנומה · 17:10–18:30 · 1:20 שעות') throw new Error(r.join('|'));
  const s = await state();
  if (JSON.stringify(s.days[T].naps.map((n) => n.start)) !== '["11:00","14:00","17:10"]') throw new Error('stored order');
  if (s.schemaVersion !== 4) throw new Error('schema bumped');
});
await step('prefill uses the last nap in history (latest day, latest start)', async () => {
  await p.click('[data-action="nap-new"]'); await p.waitForSelector(`${sheet} [data-nap]`);
  const v = await p.$$eval(`${sheet} [data-nap]`, (els) => els.map((e) => e.dataset.value));
  if (v.join('-') !== '17:10-18:30') throw new Error(v.join('-'));
  await closeSheet();
});
await step('totals: night 7:00 + naps 3:00 → "תנומות: 3 שעות", "סה״כ שינה: 10 שעות", ring = total / target', async () => {
  const t = (await p.textContent(`${sleepCard} [data-naps-total]`)).replace(/\s+/g, ' ').trim();
  const tot = (await p.textContent(`${sleepCard} [data-sleep-total]`)).replace(/\s+/g, ' ').trim();
  if (t !== 'תנומות: 3 שעות' || tot !== 'סה״כ שינה: 10 שעות') throw new Error(`${t} / ${tot}`);
  if ((await p.textContent(`${sleepCard} .stat-num`)).replace(/\s+/g, ' ').trim() !== '7:00 שעות') throw new Error('night');
  const frac = +(await p.getAttribute(`${sleepCard} .ring-fill`, 'data-frac'));
  if (frac !== 1) throw new Error('ring ' + frac); // 600/480 clamps to full
  if ((await p.textContent(`${sleepCard} .ring-mid`)).trim() !== '10:00') throw new Error('ring label');
});

/* ---------- Edit / delete / undo / swipe ---------- */
await step('tap a row → same sheet prefilled + "מחיקה"; edit end time, re-sorted', async () => {
  await p.click('.nap-row:has-text("11:00")'); await p.waitForSelector(`${sheet} .btn.danger`);
  const v = await p.$$eval(`${sheet} [data-nap]`, (els) => els.map((e) => e.dataset.value));
  if (v.join('-') !== '11:00-11:40') throw new Error(v.join('-'));
  await setNapTime('start', '19:00'); await setNapTime('end', '19:20');
  if (await saveDisabled()) throw new Error(await msg());
  await p.click(`${sheet} .btn.primary`); await p.waitForTimeout(400);
  const r = await rows();
  if (r.join('|') !== 'תנומה · 14:00–15:00 · שעה אחת|תנומה · 17:10–18:30 · 1:20 שעות|תנומה · 19:00–19:20 · 20 דקות') throw new Error(r.join('|'));
});
await step('editing a nap does not conflict with itself', async () => {
  await p.click('.nap-row:has-text("14:00")'); await p.waitForSelector(`${sheet} .btn.danger`);
  await setNapTime('end', '15:30');
  if (await saveDisabled()) throw new Error(await msg());
  await p.click(`${sheet} .btn.primary`); await p.waitForTimeout(400);
  if (!(await rows())[0].includes('14:00–15:30 · 1:30 שעות')) throw new Error((await rows())[0]);
});
await step('"מחיקה" in the sheet + undo toast restores', async () => {
  await p.click('.nap-row:has-text("19:00")'); await p.waitForSelector(`${sheet} .btn.danger`);
  await p.click(`${sheet} .btn.danger`); await p.waitForTimeout(400);
  if ((await rows()).length !== 2) throw new Error('not deleted');
  if (!(await p.textContent('#toast')).includes('התנומה נמחקה')) throw new Error('toast');
  await p.click('#toast .toast-action'); await p.waitForTimeout(300);
  if ((await rows()).length !== 3 || !(await rows())[2].includes('19:00')) throw new Error('undo');
});
await step('swipe-to-delete + undo (and the swipe does not open the sheet)', async () => {
  const box = await (await p.$('.nap-row:has-text("19:00")')).boundingBox();
  await p.mouse.move(box.x + box.width - 20, box.y + box.height / 2); await p.mouse.down();
  for (let i = 1; i <= 10; i++) await p.mouse.move(box.x + box.width - 20 - i * 18, box.y + box.height / 2);
  await p.mouse.up(); await p.waitForTimeout(500);
  if (await p.$('.sheet')) throw new Error('sheet opened');
  if ((await rows()).length !== 2) throw new Error('not swiped away');
  await p.click('#toast .toast-action'); await p.waitForTimeout(300);
  if ((await rows()).length !== 3) throw new Error('undo');
});

/* ---------- Validation ---------- */
await step('validation: crossing midnight / too short / overlap / night sleep — message + save disabled', async () => {
  await seed({ 0: { sleep: NIGHT, naps: [{ start: '14:00', end: '15:00' }] } });
  await p.click('[data-action="nap-new"]'); await p.waitForSelector(`${sheet} [data-nap]`);
  const expectErr = async (s, e, want) => {
    await setNapTime('start', s); await setNapTime('end', e);
    const m = await msg();
    if (m !== want || !(await saveDisabled())) throw new Error(`${s}–${e}: "${m}" disabled=${await saveDisabled()}`);
  };
  const expectOk = async (s, e) => {
    await setNapTime('start', s); await setNapTime('end', e);
    if (await saveDisabled()) throw new Error(`${s}–${e}: ${await msg()}`);
  };
  await expectErr('23:00', '00:30', 'תנומה לא יכולה לעבור את חצות');
  await expectErr('16:00', '16:00', 'תנומה קצרה מדי');
  await expectOk('16:00', '16:05');
  await expectErr('14:30', '15:30', 'חופף לתנומה אחרת');
  await expectErr('13:00', '16:00', 'חופף לתנומה אחרת');
  await expectOk('15:00', '16:00'); // touching is fine
  await expectErr('06:00', '07:00', 'חופף לשינת הלילה'); // starts before today's wake time
  await expectOk('06:30', '07:00');
  // clicking the disabled button does nothing
  await expectErr('14:30', '15:30', 'חופף לתנומה אחרת');
  await p.click(`${sheet} .btn.primary`, { force: true }); await p.waitForTimeout(200);
  if (!(await p.$(sheet))) throw new Error('sheet closed');
  if ((await state()).days[T].naps.length !== 1) throw new Error('saved invalid nap');
  await closeSheet();
});
await step('validation: must end by the NEXT night\'s bedtime when it starts on this date', async () => {
  await seed({ 2: { sleep: NIGHT }, 1: { sleep: { bed: '22:30', wake: '06:00' } } });
  await p.click('[data-action="date-prev"]'); await p.click('[data-action="date-prev"]'); await p.waitForTimeout(150);
  await p.click('[data-action="nap-new"]'); await p.waitForSelector(`${sheet} [data-nap]`);
  await setNapTime('start', '22:00'); await setNapTime('end', '23:00');
  if (await msg() !== 'חופף לשינת הלילה' || !(await saveDisabled())) throw new Error(await msg());
  await setNapTime('start', '21:00'); await setNapTime('end', '22:30');
  if (await saveDisabled()) throw new Error(await msg());
  await p.click(`${sheet} .btn.primary`); await p.waitForTimeout(350);
  const s = await state();
  if (s.days[key(2)].naps?.[0]?.start !== '21:00' || s.days[T]) throw new Error('nap not on the selected day');
});

/* ---------- Night clearing, naps-only ---------- */
await step('night "ניקוי" removes the night entry, undo restores it', async () => {
  await seed({ 0: { sleep: NIGHT, naps: [{ start: '14:00', end: '15:00' }] } });
  await p.click(`${sleepCard} [data-action="sleep-del"]`); await p.waitForTimeout(300);
  if (await p.$(`${sleepCard} [data-action="sleep-del"]`)) throw new Error('ניקוי still shown');
  if ((await state()).days[T].sleep !== null) throw new Error('not cleared');
  if (!(await p.textContent('#toast')).includes('שינת הלילה נוקתה')) throw new Error('toast');
  if ((await state()).days[T].naps.length !== 1) throw new Error('naps touched');
  await p.click('#toast .toast-action'); await p.waitForTimeout(300);
  if ((await state()).days[T].sleep?.bed !== '23:30') throw new Error('undo');
});
await step('night only: total = night, ring = 7/8', async () => {
  await seed({ 0: { sleep: NIGHT } });
  if (await p.$(`${sleepCard} [data-naps-total]`)) throw new Error('naps total shown');
  if ((await p.textContent(`${sleepCard} [data-sleep-total]`)).replace(/\s+/g, ' ').trim() !== 'סה״כ שינה: 7 שעות') throw new Error('total');
  if (Math.abs(+(await p.getAttribute(`${sleepCard} .ring-fill`, 'data-frac')) - 420 / 480) > 1e-9) throw new Error('ring');
});
await step('line under the night duration shows only the target ("יעד 8 שעות" / "יעד שעה אחת"); no night → unchanged', async () => {
  const line = async () => (await p.textContent(`${sleepCard} [data-sleep-preview]`)).replace(/\s+/g, ' ').trim();
  await seed({ 0: { sleep: { bed: '00:00', wake: '06:00' } } });
  if (await line() !== 'יעד 8 שעות') throw new Error(await line());
  if ((await p.textContent(`${sleepCard} .stat-num`)).replace(/\s+/g, ' ').trim() !== '6:00 שעות') throw new Error('big number');
  await seed({ 0: { sleep: NIGHT } }, { sleepTarget: 1 });
  if (await line() !== 'יעד שעה אחת') throw new Error(await line());
  await seed({ 1: { sleep: NIGHT } });
  if (await line() !== 'עוד לא נרשם · משך 7:00 · יעד 8 שעות') throw new Error(await line());
});
await step('naps only: night fields empty as usual, total from naps, ring = naps / target', async () => {
  await seed({ 0: { naps: [{ start: '13:00', end: '14:20' }] } });
  if ((await p.textContent(`${sleepCard} .stat-num`)).replace(/\s+/g, ' ').trim() !== '– שעות') throw new Error('night shown');
  if (!(await p.textContent(`${sleepCard} [data-sleep-preview]`)).includes('עוד לא נרשם')) throw new Error('night fields not "empty"');
  if ((await p.textContent(`${sleepCard} [data-sleep-total]`)).replace(/\s+/g, ' ').trim() !== 'סה״כ שינה: 1:20 שעות') throw new Error('total');
  if (Math.abs(+(await p.getAttribute(`${sleepCard} .ring-fill`, 'data-frac')) - 80 / 480) > 1e-9) throw new Error('ring');
  if (await p.$(`${sleepCard} [data-action="sleep-del"]`)) throw new Error('ניקוי shown without night');
});
await step('durText: 40 דקות / שעה אחת / 2 שעות / 1:20 שעות / דקה אחת', async () => {
  const r = await p.evaluate(async () => { const m = await import('./js/progress.js'); return [40, 60, 120, 80, 1].map(m.durText); });
  if (r.join('|') !== '40 דקות|שעה אחת|2 שעות|1:20 שעות|דקה אחת') throw new Error(r.join('|'));
});

/* ---------- Exports ---------- */
await step('daily summary: night + naps + total, isolated time ranges; no night → first line omitted; no naps → unchanged', async () => {
  await seed({ 0: { sleep: NIGHT, naps: [{ start: '14:00', end: '15:00' }] }, 1: { naps: [{ start: '13:00', end: '13:40' }, { start: '16:00', end: '17:20' }] }, 2: { sleep: NIGHT } });
  const lines = (k) => mod('./js/export.js', 'dailySummary', k).then((t) => t.split('\n'));
  const a = await lines(T);
  const ia = a.findIndex((l) => l.startsWith('שינה:'));
  const want = [`שינה: ${L}7:00${R} שעות (${L}23:30–06:30${R})`, `תנומה: שעה אחת (${L}14:00–15:00${R})`, `סה״כ שינה: ${L}8:00${R} שעות`];
  if (JSON.stringify(a.slice(ia, ia + 3)) !== JSON.stringify(want)) throw new Error(JSON.stringify(a.slice(ia, ia + 3)));
  const bl = await lines(key(1));
  if (bl.some((l) => l.startsWith('שינה:'))) throw new Error('night line without night');
  const ib = bl.findIndex((l) => l.startsWith('תנומה:'));
  const wantB = [`תנומה: 40 דקות (${L}13:00–13:40${R})`, `תנומה: ${L}1:20${R} שעות (${L}16:00–17:20${R})`, `סה״כ שינה: ${L}2:00${R} שעות`];
  if (JSON.stringify(bl.slice(ib, ib + 3)) !== JSON.stringify(wantB)) throw new Error(JSON.stringify(bl.slice(ib, ib + 3)));
  const c = await lines(key(2));
  const sl = c.filter((l) => /שינה|תנומה/.test(l));
  if (JSON.stringify(sl) !== JSON.stringify([`שינה: ${L}7:00${R} שעות (${L}23:30–06:30${R})`])) throw new Error(JSON.stringify(sl));
});
await step('weekly summary per-day line: "שינה: 8:00 שעות (לילה 7:00 + תנומות 1:00)", unchanged without naps', async () => {
  const t = (await mod('./js/export.js', 'weeklySummary')).split('\n');
  if (!t.includes(`• שינה: ${L}8:00${R} שעות (לילה ${L}7:00${R} + תנומות ${L}1:00${R})`)) throw new Error(t.filter((l) => l.includes('שינה')).join(' | '));
  if (!t.includes(`• שינה: ${L}2:00${R} שעות (תנומות ${L}2:00${R})`)) throw new Error('naps-only day');
  if (!t.includes(`• שינה: ${L}7:00${R} שעות (${L}23:30–06:30${R})`)) throw new Error('night-only day changed');
});

/* ---------- Trends: chart, averages ---------- */
await step('7-day chart: total bars, naps stacked lighter on top, tooltip night/naps/total; avg total; avg bedtime night only', async () => {
  await seed({ 0: { sleep: { bed: '23:30', wake: '05:30' }, naps: [{ start: '14:00', end: '16:00' }] }, 1: { sleep: { bed: '23:30', wake: '06:30' } }, 2: { naps: [{ start: '01:00', end: '02:00' }] } });
  await p.click('[data-tab="trends"]'); await p.waitForTimeout(900);
  const bars = await p.$$eval('.card.role-sleep .bar', (gs) => gs.map((g) => ({
    top: g.querySelector('.bar-top')?.getAttribute('fill') || null, topH: +(g.querySelector('.bar-top')?.dataset.h || 0),
    base: g.querySelector('.bar-base')?.getAttribute('fill') || null, baseH: +(g.querySelector('.bar-base')?.getAttribute('height') || 0),
    total: +(g.querySelector('rect:not(.bar-hit)')?.getAttribute('height') || 0), tip: g.dataset.tip })));
  const [d2, d1, d0] = bars.slice(-3);
  if (d0.top !== 'var(--success-light)' || d0.base !== 'var(--success)') throw new Error('today colors ' + JSON.stringify(d0)); // 8:00 = target → met
  if (Math.abs(d0.topH / d0.total - 0.25) > 0.01 || Math.abs(d0.baseH / d0.total - 0.75) > 0.01) throw new Error('today split ' + JSON.stringify(d0));
  if (d1.top || d1.base) throw new Error('night-only day stacked');
  if (d2.top !== 'var(--sleep-light)' || d2.base) throw new Error('naps-only day ' + JSON.stringify(d2));
  if (Math.abs(d0.total / d1.total - 8 / 7) > 0.01) throw new Error('bar height not total');
  await p.click('.card.role-sleep .bar:last-of-type .bar-base'); await p.waitForTimeout(200);
  const tip = (await p.textContent('.chart-tip')).replace(/\s+/g, ' ').trim();
  if (!tip.includes('לילה 6:00 · תנומות 2:00 · סה״כ 8:00 שעות')) throw new Error(tip);
  const stats = await p.$$eval('.card.role-sleep .hm-stats .stat-num', (e) => e.map((x) => x.textContent.trim()));
  // average over 3 logged days: (480 + 420 + 60) / 3 = 320 → 5:20; bedtime 23:30 (nap at 01:00 ignored)
  if (stats.join('|') !== '5:20|23:30') throw new Error(stats.join('|'));
});

/* ---------- XP, badge, insights ---------- */
await step('"sleep logged" XP: night or naps, once per day', async () => {
  await seed({ 0: { sleep: NIGHT, naps: [{ start: '14:00', end: '15:00' }, { start: '16:00', end: '16:30' }] }, 1: { naps: [{ start: '14:00', end: '15:00' }] }, 2: { sleep: NIGHT }, 3: {} });
  const xp = await p.evaluate(async (ks) => { const m = await import('./js/progress.js'); return ks.map((k) => m.dayXP(k)); }, [key(0), key(1), key(2), key(3)]);
  if (xp.join(',') !== '2,2,2,0') throw new Error(xp.join(','));
});
await step('"ישן כמו שצריך" badge counts the total (6h night + 2h nap × 7 days)', async () => {
  const days = {}; for (let i = 0; i < 7; i++) days[i] = { sleep: { bed: '00:00', wake: '06:00' }, naps: [{ start: '14:00', end: '16:00' }] };
  await seed(days);
  const earned = await p.evaluate(async () => !!(await import('./js/progress.js')).walkHistory().earned.sleepWeek);
  if (!earned) throw new Error('not earned');
  const d2 = {}; for (let i = 0; i < 7; i++) d2[i] = { sleep: { bed: '00:00', wake: '06:00' } };
  await seed(d2);
  if (await p.evaluate(async () => !!(await import('./js/progress.js')).walkHistory().earned.sleepWeek)) throw new Error('earned without naps');
});
await step('day insights: sleep target and 7-day average use the total', async () => {
  const days = { 0: { sleep: { bed: '00:00', wake: '06:00' }, naps: [{ start: '14:00', end: '16:00' }] } };
  for (let i = 1; i <= 4; i++) days[i] = { sleep: { bed: '00:00', wake: '06:00' } };
  days[0].naps = [{ start: '14:00', end: '15:00' }, { start: '16:00', end: '17:00' }];
  await seed(days);
  const ins = await mod('./js/insights.js', 'dayInsights', T);
  const s = ins.find((x) => x.id === 'sleep'), a = ins.find((x) => x.id === 'sleepAvg');
  if (!s || !s.text.includes('8:00') || !s.text.includes('ועמדת ביעד השינה')) throw new Error(JSON.stringify(s));
  if (!a || a.text !== 'ישנת 2 שעות יותר מהממוצע השבועי שלך') throw new Error(JSON.stringify(a));
});
await step('week insights: sleep → calories correlation keeps NIGHT sleep only', async () => {
  const days = {};
  // 3 days: night 5h (+3h naps = 8h total), 3000 kcal; 3 days: night 8h, 2000 kcal
  for (let i = 0; i < 3; i++) days[i] = { sleep: { bed: '01:00', wake: '06:00' }, naps: [{ start: '13:00', end: '16:00' }], food: [{ name: 'x', kcal: 3000, protein: 100 }] };
  for (let i = 3; i < 6; i++) days[i] = { sleep: { bed: '23:00', wake: '07:00' }, food: [{ name: 'x', kcal: 2000, protein: 100 }] };
  await seed(days);
  const ins = await mod('./js/insights.js', 'weekInsights', T);
  const k = ins.find((x) => x.id === 'sleepKcal');
  if (!k || !k.text.includes('יותר')) throw new Error(JSON.stringify(ins.map((x) => x.id)));
});

/* ---------- Backup ---------- */
await step('backup round-trip with naps (export → wipe → import) is identical', async () => {
  await seed({ 0: { sleep: NIGHT, naps: [{ start: '14:00', end: '15:00' }] }, 3: { naps: [{ start: '12:00', end: '12:30' }] } });
  await p.click('[data-tab="settings"]');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-action=export]')]);
  const path = `${SP}/backup-naps.json`; await dl.saveAs(path);
  const before = await p.evaluate(() => localStorage.getItem('seventy.v1'));
  if (JSON.parse(fs.readFileSync(path, 'utf8')).days[key(3)].naps[0].start !== '12:00') throw new Error('naps not exported');
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('seventy.v1')); s.days = {}; localStorage.setItem('seventy.v1', JSON.stringify(s)); });
  await p.reload(); await p.click('[data-tab="settings"]');
  await p.setInputFiles('[data-file]', path); await p.click('.sheet .btn.danger'); await p.waitForTimeout(600);
  if (await p.evaluate(() => localStorage.getItem('seventy.v1')) !== before) throw new Error('mismatch');
});
await step('old backup without naps still imports (days get no naps)', async () => {
  const old = JSON.parse(fs.readFileSync(`${SP}/backup-naps.json`, 'utf8'));
  for (const d of Object.values(old.days)) delete d.naps;
  fs.writeFileSync(`${SP}/backup-nonaps.json`, JSON.stringify(old));
  await p.reload(); await p.click('[data-tab="settings"]');
  await p.setInputFiles('[data-file]', `${SP}/backup-nonaps.json`); await p.click('.sheet .btn.danger'); await p.waitForTimeout(600);
  const s = await state();
  if (s.days[T].sleep?.bed !== '23:30' || s.days[T].naps.length !== 0) throw new Error(JSON.stringify(s.days[T]));
});

/* ---------- Layout ---------- */
for (const w of [412, 360]) {
  await step(`${w}px: sleep card + nap sheet — no overflow, rows not truncated`, async () => {
    await p.setViewportSize({ width: w, height: 915 });
    await seed({ 0: { sleep: NIGHT, naps: [{ start: '14:00', end: '15:00' }, { start: '17:10', end: '18:30' }] } });
    const r = await p.evaluate(() => ({ over: document.documentElement.scrollWidth > innerWidth,
      cut: [...document.querySelectorAll('.nap-row .grow, .sleep-tot b')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent) }));
    if (r.over || r.cut.length) throw new Error(JSON.stringify(r));
    await p.click('[data-action="nap-new"]'); await p.waitForSelector(`${sheet} [data-nap]`); await p.waitForTimeout(300);
    if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('sheet overflow');
    await closeSheet();
  });
}
await p.setViewportSize({ width: 412, height: 915 });
await step('offline: reload with naps works', async () => {
  await seed({ 0: { sleep: NIGHT, naps: [{ start: '14:00', end: '15:00' }] } });
  await p.evaluate(() => navigator.serviceWorker.ready); await p.reload(); await p.waitForTimeout(400);
  await ctx.setOffline(true);
  await p.reload(); await p.waitForTimeout(500);
  const r = await rows();
  await ctx.setOffline(false);
  if (r.join() !== 'תנומה · 14:00–15:00 · שעה אחת') throw new Error(r.join());
});
console.log('errors:', errors.length ? errors : 'none');
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
await b.close();
