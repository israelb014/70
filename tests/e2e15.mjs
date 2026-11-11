// v1.8.0: breathing — card, setup, phases (clock-driven), pause / background, saving rules, cues,
// reduced motion, XP, badges, chart, insights, exports, ?action=breathe, settings, backup, layout.
import { chromium } from 'playwright';
import { autoDetail, openCard } from './nav200.mjs';
import fs from 'fs';
const BASE = process.env.BASE || 'http://127.0.0.1:8765/70/';
const b = await chromium.launch();
let fails = 0; const step = async (l, fn) => { try { await fn(); console.log('OK  ', l); } catch (e) { fails++; console.log('FAIL', l, '-', e.message.split('\n')[0]); } };
const errors = [];
const NOW = new Date('2026-10-22T08:00:00');
const key = (o = 0) => { const d = new Date(NOW.getTime() - o * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const T = key(0);

async function newPage({ width = 412, reduced = false } = {}) {
  const c = await b.newContext({ viewport: { width, height: 860 }, isMobile: true, hasTouch: true, acceptDownloads: true, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await c.addInitScript(() => {
    window.__vib = []; window.__tones = 0; window.__wake = 0;
    navigator.vibrate = (p) => { window.__vib.push(p); return true; };
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { window.__wake++; return { release: async () => {} }; } } });
    const AC = window.AudioContext;
    window.AudioContext = class extends AC { createOscillator() { window.__tones++; return super.createOscillator(); } };
  });
  const p = await c.newPage();
  autoDetail(p);
  p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await p.clock.install({ time: NOW });
  await p.goto(BASE);
  // Paused clock: only runFor() advances time, so phase timing doesn't drift with real time under load.
  await p.clock.pauseAt(new Date(NOW.getTime() + 60000));
  return { c, p };
}
// days: { offset: { breathing, sleep, ... } }
const seed = async (p, days = {}, settings = {}, meta = {}) => {
  await p.evaluate(([days, settings, meta, keys]) => {
    const out = {};
    for (const [o, d] of Object.entries(days)) out[keys[o]] = { rest: false, steps: null, climbs: [], rides: [], exercises: {}, food: [], sleep: null, naps: [], water: [], breathing: [], ...d };
    localStorage.setItem('seventy.v1', JSON.stringify({ schemaVersion: 4,
      settings: { coach: { enabled: false }, theme: 'flame', startWeight: 90, targetWeight: 80, proteinTarget: 150, stepsTarget: 10000, rideGoalKm: 45, climbsTarget: 6, floorsRegular: 6, floorsRoof: 10, sleepTarget: 8, waterTarget: 2500, ...settings },
      exercises: [], mealPresets: [], customFoods: [], foodMemory: {}, weights: [], meta: { lastSeenLevel: 99, seenBadges: [], lastBackupAt: new Date().toISOString(), ...meta }, days: out }));
  }, [days, settings, meta, Object.fromEntries(Array.from({ length: 60 }, (_, i) => [i, key(i)]))]);
  await p.reload(); await p.clock.runFor(600);
};
const state = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('seventy.v1')));
const B = (minutes, technique = 'calm', time = '07:00') => ({ technique, minutes, time });
const call = (p, path, fn, ...args) => p.evaluate(async ([path, fn, args]) => (await import(path))[fn](...args), [path, fn, args]);
const view = (p) => p.evaluate(() => {
  const el = document.querySelector('.breathe');
  return el ? { phase: el.dataset.phase, word: el.querySelector('[data-br-phase]')?.textContent, sec: el.querySelector('[data-br-sec]')?.textContent,
    left: el.querySelector('[data-br-left]')?.textContent, scale: Number(el.querySelector('[data-br-circle]')?.dataset.scale), state: el.dataset.state,
    transform: el.querySelector('[data-br-circle]')?.style.transform, opacity: el.querySelector('[data-br-circle]')?.style.opacity } : null;
});
async function start(p, technique, minutes) {
  await p.click('[data-action=breath-start]'); await p.waitForSelector('.sheet .tech-card'); await p.clock.runFor(400);
  await p.click(`.tech-card:has(input[value="${technique}"])`);
  await p.click(`.dur-chips label:has(input[value="${minutes}"])`);
  await p.click('.sheet .btn.breath-btn'); // the session clock starts here: no clock advance before measuring
  await p.waitForSelector('.breathe');
}
const at = async (p, ms) => { await p.clock.runFor(ms); return view(p); };
const closeDone = async (p) => { await p.click('[data-br=close]'); await p.clock.runFor(400); };

const { c, p } = await newPage();

/* ---------- Card + setup ---------- */
await step('"נשימה" card after "מים": ring = today / goal, "3 דקות היום", green role, "להתחיל"', async () => {
  await seed(p, { 0: { breathing: [B(3)] } }, { breathGoal: 10 });
  // Tiles: "נשימה" is a tile of its own (after "שינה"); its detail page holds the card.
  const order = (await p.$$eval('.tile', (e) => e.map((x) => x.dataset.tile))).join(',').includes('sleep,breath');
  if (!order) throw new Error('breath tile not after sleep');
  await openCard(p, 'breath');
  const t = (await p.textContent('[data-breath-today]')).replace(/\s+/g, ' ').trim();
  const frac = +(await p.getAttribute('.breath-card .ring-fill', 'data-frac'));
  const color = await p.$eval('.breath-card .ring-fill', (e) => e.getAttribute('stroke'));
  if (t !== '3 דקות היום' || Math.abs(frac - 0.3) > 1e-9 || color !== 'var(--breath)') throw new Error(`${t} / ${frac} / ${color}`);
  const tok = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--breath').trim());
  if (tok !== '#34d399') throw new Error('token ' + tok);
  if ((await p.textContent('[data-action=breath-start]')).trim() !== 'להתחיל') throw new Error('button');
});
await step('setup sheet: 4 technique cards (default "נשימה רגועה"), chips 1/3/5/10/15 (default 5), "התחלה"', async () => {
  await p.click('[data-action=breath-start]'); await p.waitForSelector('.sheet .tech-card'); await p.clock.runFor(400);
  const names = await p.$$eval('.tech-card strong', (e) => e.map((x) => x.textContent));
  const chips = await p.$$eval('.dur-chips input', (e) => e.map((x) => x.value));
  if (names.join('|') !== 'נשימה רגועה|נשימת קופסה|4-7-8|נשימה חופשית' || chips.join(',') !== '1,3,5,10,15') throw new Error(names + chips);
  if (await p.$eval('[name=tech]:checked', (x) => x.value) !== 'calm' || await p.$eval('[name=dur]:checked', (x) => x.value) !== '5') throw new Error('defaults');
  if ((await p.textContent('.sheet .sheet-actions .btn')).trim() !== 'התחלה') throw new Error('primary');
  await p.keyboard.press('Escape'); await p.clock.runFor(400);
});

/* ---------- Phases ---------- */
await step('"מתכוננים…" 3-second countdown, then box breathing: in 4 · hold 4 · out 4 · hold 4 (exact), circle scales', async () => {
  await start(p, 'box', 1);
  let v = await view(p);
  if (v.phase !== 'prep' || v.word !== 'מתכוננים…' || v.sec !== '3') throw new Error(JSON.stringify(v));
  v = await at(p, 1050); if (v.sec !== '2') throw new Error('prep 2 ' + JSON.stringify(v));
  v = await at(p, 2050); // t = 0.1 s
  if (v.word !== 'שאיפה' || v.sec !== '4' || v.left !== '01:00') throw new Error('in ' + JSON.stringify(v));
  v = await at(p, 3800); // t = 3.9
  if (v.word !== 'שאיפה' || v.sec !== '1' || !(v.scale > 0.99)) throw new Error('in end ' + JSON.stringify(v));
  v = await at(p, 200); // 4.1
  if (v.word !== 'החזקה' || v.sec !== '4' || v.scale !== 1) throw new Error('hold ' + JSON.stringify(v));
  v = await at(p, 4000); // 8.1
  if (v.word !== 'נשיפה' || v.sec !== '4') throw new Error('out ' + JSON.stringify(v));
  v = await at(p, 3800); // 11.9
  if (!(v.scale < 0.56)) throw new Error('out end ' + JSON.stringify(v));
  v = await at(p, 200); // 12.1
  if (v.word !== 'החזקה' || v.sec !== '4' || v.scale !== 0.55) throw new Error('hold2 ' + JSON.stringify(v));
  v = await at(p, 4000); // 16.1
  if (v.word !== 'שאיפה' || v.sec !== '4') throw new Error('cycle ' + JSON.stringify(v));
  const vib = await p.evaluate(() => window.__vib.length);
  if (vib !== 5) throw new Error('vibrations at phase changes ' + vib);
  if (await p.evaluate(() => window.__wake) < 1) throw new Error('no wake lock');
  if (await p.evaluate(() => getComputedStyle(document.getElementById('tabbar')).display) !== 'none') throw new Error('tab bar visible');
  await p.click('[data-br=end]'); await p.clock.runFor(200); await closeDone(p);
});
for (const [tech, seq] of [['calm', [['שאיפה', 5], ['נשיפה', 5], ['שאיפה', 5]]], ['478', [['שאיפה', 4], ['החזקה', 7], ['נשיפה', 8], ['שאיפה', 4]]]]) {
  await step(`${tech}: phase order and exact durations (${seq.map(([w, d]) => `${w} ${d}`).join(' · ')})`, async () => {
    await start(p, tech, 1);
    await p.clock.runFor(3000);
    let t = 0;
    for (const [word, dur] of seq) {
      const a = await at(p, 100); t += 0.1;
      if (a.word !== word || a.sec !== String(dur)) throw new Error(`@${t.toFixed(1)} ${JSON.stringify(a)} want ${word} ${dur}`);
      const z = await at(p, (dur - 0.2) * 1000); t += dur - 0.2;
      if (z.word !== word || z.sec !== '1') throw new Error(`end @${t.toFixed(1)} ${JSON.stringify(z)}`);
      await p.clock.runFor(100); t += 0.1;
    }
    await p.click('[data-br=end]'); await p.clock.runFor(200); await closeDone(p);
  });
}
await step('free breathing: no phase words, silent timer, slow ambient pulse', async () => {
  await start(p, 'free', 1);
  await p.clock.runFor(3100);
  const a = await view(p);
  const z = await at(p, 3000);
  if (a.word !== 'נשימה חופשית' || a.sec !== '' || a.phase !== 'free' || a.scale === z.scale) throw new Error(JSON.stringify([a, z]));
  await p.click('[data-br=end]'); await p.clock.runFor(200); await closeDone(p);
});

/* ---------- Pause, background, saving ---------- */
await step('tap anywhere pauses ("הפסקה"), time frozen; tap again resumes', async () => {
  await start(p, 'calm', 1);
  await p.clock.runFor(3000 + 10000);
  await p.mouse.click(200, 200); await p.clock.runFor(100);
  let v = await view(p);
  if (v.state !== 'paused' || await p.isHidden('[data-br-paused]')) throw new Error('not paused');
  const left = v.left;
  await p.clock.runFor(20000);
  if ((await view(p)).left !== left) throw new Error('time ran while paused');
  await p.mouse.click(200, 200); await p.clock.runFor(2000);
  v = await view(p);
  if (v.state !== 'run' || v.left === left) throw new Error('not resumed ' + JSON.stringify(v));
});
await step('going to the background pauses automatically', async () => {
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); delete document.visibilityState; });
  await p.clock.runFor(100);
  if ((await view(p)).state !== 'paused') throw new Error('not paused');
  await p.click('[data-br=end]'); await p.clock.runFor(200);
  // ended after ~12 s → nothing saved
  if (!(await p.textContent('[data-br-result]')).includes('פחות מדקה')) throw new Error('saved < 1 min');
  await closeDone(p);
});
await step('early end: 59 s = not saved; 2:40 = 2 minutes saved', async () => {
  await seed(p, {});
  await start(p, 'calm', 5); await p.clock.runFor(3000 + 59000);
  await p.click('[data-br=end]'); await p.clock.runFor(200);
  if ((await state(p)).days[T]?.breathing?.length) throw new Error('59 s saved');
  await closeDone(p);
  await start(p, 'box', 15); await p.clock.runFor(3000 + 160000);
  await p.click('[data-br=end]'); await p.clock.runFor(200);
  const s = await state(p);
  if (JSON.stringify(s.days[T].breathing.map((x) => [x.technique, x.minutes])) !== '[["box",2]]') throw new Error(JSON.stringify(s.days[T].breathing));
  if ((await p.textContent('[data-br-result]')).replace(/\s+/g, ' ').trim() !== '2 דקות של נשימה') throw new Error(await p.textContent('[data-br-result]'));
  await closeDone(p);
});
await step('completed session saves the full duration; end screen with today total; card ring updates', async () => {
  await start(p, 'calm', 3); await p.clock.runFor(3000 + 180000 + 200);
  const s = await state(p);
  if (s.days[T].breathing.at(-1).minutes !== 3 || !/^\d\d:\d\d$/.test(s.days[T].breathing.at(-1).time)) throw new Error(JSON.stringify(s.days[T].breathing));
  if ((await p.textContent('[data-br-result]')).replace(/\s+/g, ' ').trim() !== '3 דקות של נשימה') throw new Error('result');
  if ((await p.textContent('[data-br-total]')).replace(/\s+/g, ' ').trim() !== 'היום: 5 דקות') throw new Error(await p.textContent('[data-br-total]'));
  await closeDone(p);
  if ((await p.textContent('[data-breath-today]')).replace(/\s+/g, ' ').trim() !== '5 דקות היום') throw new Error('card');
  if (Math.abs(+(await p.getAttribute('.breath-card .ring-fill', 'data-frac')) - 1) > 1e-9) throw new Error('ring (goal 5)');
  const last = (await state(p)).meta.breathLast;
  if (last.technique !== 'calm' || last.minutes !== 3) throw new Error('last choice ' + JSON.stringify(last));
  await p.click('[data-action=breath-start]'); await p.waitForSelector('.sheet .tech-card'); await p.clock.runFor(400);
  if (await p.$eval('[name=dur]:checked', (x) => x.value) !== '3') throw new Error('remembered duration');
  await p.keyboard.press('Escape'); await p.clock.runFor(400);
});

/* ---------- Settings + cues ---------- */
await step('settings: goal (prefilled 5), vibration off = no vibration, sound on = soft tone', async () => {
  await seed(p, {});
  await p.click('[data-tab=settings]'); await p.clock.runFor(300);
  if (await p.inputValue('[data-setting=breathGoal]') !== '5') throw new Error('goal prefill');
  if (!(await p.isChecked('[data-breath-setting=breathVibrate]')) || await p.isChecked('[data-breath-setting=breathSound]')) throw new Error('defaults');
  await p.fill('[data-setting=breathGoal]', '12'); await p.press('[data-setting=breathGoal]', 'Enter'); await p.clock.runFor(200);
  await p.click('label.check:has([data-breath-setting=breathVibrate])'); await p.click('label.check:has([data-breath-setting=breathSound])'); await p.clock.runFor(200);
  const st = (await state(p)).settings;
  if (st.breathGoal !== 12 || st.breathVibrate !== false || st.breathSound !== true) throw new Error(JSON.stringify(st));
  await p.click('[data-tab=today]'); await p.clock.runFor(300);
  await p.evaluate(() => { window.__vib = []; window.__tones = 0; });
  await start(p, 'calm', 1); await p.clock.runFor(3000 + 11000);
  const r = await p.evaluate(() => ({ vib: window.__vib.length, tones: window.__tones }));
  if (r.vib !== 0 || r.tones !== 3) throw new Error(JSON.stringify(r));
  await p.click('[data-br=end]'); await p.clock.runFor(200); await closeDone(p);
});

/* ---------- XP, badges ---------- */
await step('XP: 1 per breathing minute, max 15 a day', async () => {
  await seed(p, { 0: { breathing: [B(10), B(10)] }, 1: { breathing: [B(7)] }, 2: {} });
  const xp = await p.evaluate(async (ks) => { const m = await import('./js/progress.js'); return ks.map((k) => m.dayXP(k)); }, [key(0), key(1), key(2)]);
  if (xp.join(',') !== '15,7,0') throw new Error(xp.join(','));
});
const earned = (p) => p.evaluate(async () => { const w = (await import('./js/progress.js')).walkHistory(); return { e: w.earned, m: w.metrics }; });
await step('badges: "נשימה ראשונה", "רצף נשימה 7", "100 דקות נשימה", "יעד נשימה שבוע" (and not one day short)', async () => {
  await seed(p, { 0: { breathing: [B(1)] } });
  let r = await earned(p);
  if (!r.e.breath1 || r.e.breathStreak7 || r.e.breath100 || r.e.breathGoal7) throw new Error(JSON.stringify(r.e));
  const six = {}; for (let i = 0; i < 6; i++) six[i] = { breathing: [B(5)] };
  await seed(p, six); r = await earned(p);
  if (r.e.breathStreak7 || r.e.breathGoal7) throw new Error('6 days earned');
  const seven = {}; for (let i = 0; i < 7; i++) seven[i] = { breathing: [B(i === 3 ? 2 : 5)] };
  await seed(p, seven); r = await earned(p);
  if (!r.e.breathStreak7 || r.e.breathGoal7) throw new Error('streak / goal with one short day ' + JSON.stringify(r.e));
  const goal = {}; for (let i = 0; i < 7; i++) goal[i] = { breathing: [B(15), B(0.5 * 0 + 1)] };
  await seed(p, goal); r = await earned(p);
  if (!r.e.breathGoal7 || !r.e.breath100 || r.m.breathTotal !== 112) throw new Error(JSON.stringify(r));
  const icons = await p.evaluate(async () => { const a = await import('./js/badgeArt.js'); const m = await import('./js/progress.js'); return m.BADGES.filter((x) => x.id.startsWith('breath')).map((x) => a.medallion(x, true, 40).includes('<path') || a.medallion(x, true, 40).includes('<circle cx="12"')); });
  if (icons.length !== 4 || icons.includes(false)) throw new Error('icons');
});

/* ---------- Chart ---------- */
await step('"מגמות": 7-day breathing chart with goal line and weekly total', async () => {
  await seed(p, { 0: { breathing: [B(5), B(3, 'box')] }, 2: { breathing: [B(10)] }, 9: { breathing: [B(30)] } }, { breathGoal: 6 });
  await p.click('[data-tab=trends]'); await p.clock.runFor(800);
  const card = '.card.role-breath:has(.chart)';
  const vals = await p.$$eval(`${card} .chart-val`, (e) => e.map((x) => x.textContent));
  if (vals.join(',') !== '10,8' || !(await p.$(`${card} .target-line`))) throw new Error(vals.join(','));
  if ((await p.textContent(`${card} [data-breath-week]`)).trim() !== '18') throw new Error('total');
  await p.click('[data-tab=today]'); await p.clock.runFor(300);
});

/* ---------- Insights ---------- */
await step('insight: week-over-week breathing minutes (≥ 4 days each week, ≥ 10%)', async () => {
  const days = {}; [0, 1, 2, 3].forEach((i) => { days[i] = { breathing: [B(15)] }; }); [7, 8, 9, 10].forEach((i) => { days[i] = { breathing: [B(10)] }; });
  await seed(p, days);
  const ins = await call(p, './js/insights.js', 'weekInsights', T);
  const w = ins.find((x) => x.id === 'wow:breath');
  if (!w || w.text !== 'השבוע נשמת 60 דקות, 50% יותר משבוע שעבר') throw new Error(JSON.stringify(w));
  delete days[10]; await seed(p, days);
  if ((await call(p, './js/insights.js', 'weekInsights', T)).some((x) => x.id === 'wow:breath')) throw new Error('shown with 3 days');
});
const sleepDays = (withN, withoutN, withSleep, withoutSleep) => {
  const d = {}; let o = 1;
  for (let i = 0; i < withN; i++, o += 2) { d[o + 1] = { breathing: [B(5)] }; d[o] = { sleep: withSleep }; }
  for (let i = 0; i < withoutN; i++, o += 2) { d[o + 1] = {}; d[o] = { sleep: withoutSleep }; }
  return d;
};
await step('insight: night sleep after days with vs without breathing (≥ 5 each, |diff| ≥ 20 min), neutral wording', async () => {
  await seed(p, sleepDays(5, 5, { bed: '23:00', wake: '06:40' }, { bed: '23:00', wake: '06:10' }));
  let ins = await call(p, './js/insights.js', 'weekInsights', T);
  const s = ins.find((x) => x.id === 'breathSleep');
  if (!s || s.kind !== 'neutral' || s.text !== 'בלילות שאחרי יום עם נשימה ישנת בממוצע 30 דקות יותר מאשר אחרי יום בלי נשימה') throw new Error(JSON.stringify(s));
  await seed(p, sleepDays(4, 6, { bed: '23:00', wake: '06:40' }, { bed: '23:00', wake: '06:10' }));
  if ((await call(p, './js/insights.js', 'weekInsights', T)).some((x) => x.id === 'breathSleep')) throw new Error('shown with 4 nights');
  await seed(p, sleepDays(5, 5, { bed: '23:00', wake: '06:25' }, { bed: '23:00', wake: '06:10' }));
  if ((await call(p, './js/insights.js', 'weekInsights', T)).some((x) => x.id === 'breathSleep')) throw new Error('shown at 15 min');
});

/* ---------- Exports ---------- */
await step('exports: daily line after water (two techniques / one technique / none), weekly per day + total', async () => {
  await seed(p, { 0: { water: [{ ml: 500, time: '08:00' }], breathing: [B(5), B(5, 'box')] }, 1: { breathing: [B(5)] }, 2: { steps: 3000 } });
  const d0 = (await call(p, './js/export.js', 'dailySummary', T)).split('\n');
  const wi = d0.findIndex((l) => l.startsWith('מים:')), bi = d0.indexOf('נשימה: 10 דקות (נשימה רגועה 5, נשימת קופסה 5)');
  if (bi < 0 || !(bi > wi)) throw new Error(d0.join(' | '));
  const d1 = (await call(p, './js/export.js', 'dailySummary', key(1))).split('\n');
  if (!d1.includes('נשימה: 5 דקות (נשימה רגועה)')) throw new Error(d1.join(' | '));
  const d2 = await call(p, './js/export.js', 'dailySummary', key(2));
  if (d2.includes('נשימה')) throw new Error('shown without breathing');
  const w = (await call(p, './js/export.js', 'weeklySummary')).split('\n');
  if (!w.includes('• נשימה: 10 דקות') || !w.includes('• נשימה: 5 דקות') || w.at(-1) !== 'נשימה השבוע: 15 דקות') throw new Error(w.slice(-4).join(' | '));
});

/* ---------- Backup ---------- */
await step('backup round-trip keeps breathing (and old backups without it import)', async () => {
  await seed(p, { 0: { breathing: [B(5), B(3, '478')] } });
  await p.click('[data-tab=settings]'); await p.clock.runFor(300);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-action=export]')]);
  const path = `${process.env.TEST_OUT}/backup-breath.json`; await dl.saveAs(path);
  const before = await p.evaluate(() => localStorage.getItem('seventy.v1'));
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('seventy.v1')); s.days = {}; localStorage.setItem('seventy.v1', JSON.stringify(s)); });
  await p.reload(); await p.clock.runFor(300); await p.click('[data-tab=settings]'); await p.clock.runFor(200);
  await p.setInputFiles('[data-file]', path); await p.clock.runFor(400); await p.click('.sheet .btn.danger'); await p.clock.runFor(800);
  if (await p.evaluate(() => localStorage.getItem('seventy.v1')) !== before) throw new Error('mismatch');
  const old = JSON.parse(fs.readFileSync(path, 'utf8')); for (const d of Object.values(old.days)) delete d.breathing;
  fs.writeFileSync(path.replace('.json', '-old.json'), JSON.stringify(old));
  await p.setInputFiles('[data-file]', path.replace('.json', '-old.json')); await p.clock.runFor(400); await p.click('.sheet .btn.danger'); await p.clock.runFor(800);
  if (JSON.stringify((await state(p)).days[T].breathing) !== '[]') throw new Error('old backup');
});

/* ---------- Not part of completion / heatmap / status ---------- */
await step('breathing is not in completion %, heatmap score or the hero status line', async () => {
  await seed(p, { 0: { steps: 10000, breathing: [B(15)] }, 1: { steps: 10000 } });
  const r = await p.evaluate(async (ks) => { const pr = await import('./js/progress.js'); const st = await import('./js/stats.js'); return ks.map((k) => [pr.dayScore(k), st.completionPct(k)]); }, [key(0), key(1)]);
  if (JSON.stringify(r[0]) !== JSON.stringify(r[1])) throw new Error(JSON.stringify(r));
  if ((await p.textContent('.hero-status')).includes('נשימ')) throw new Error('status');
});
await p.close(); await c.close();

/* ---------- Shortcut + reduced motion + layout ---------- */
{
  const { c: c2, p: p2 } = await newPage();
  await seed(p2, {});
  await step('?action=breathe opens the breathing setup on "היום" and is removed from the URL; manifest + SW', async () => {
    await p2.goto(BASE + '?action=breathe'); await p2.clock.runFor(600);
    if (!(await p2.$('.sheet .tech-card')) || await p2.getAttribute('#app', 'data-tab') !== 'today' || p2.url().includes('action')) throw new Error('not opened');
    const m = await (await fetch(BASE + 'manifest.json')).json();
    const s = m.shortcuts[3];
    if (s.name !== 'נשימה' || s.url !== './?action=breathe' || s.icons[0].sizes !== '96x96') throw new Error(JSON.stringify(s));
    const png = Buffer.from(await (await fetch(BASE + s.icons[0].src)).arrayBuffer());
    if (png.readUInt32BE(16) !== 96) throw new Error('icon');
    const sw = await (await fetch(BASE + 'sw.js')).text();
    if (!sw.includes('./icons/shortcut-breathe.png') || !sw.includes('./js/breathing.js')) throw new Error('sw');
    await p2.keyboard.press('Escape'); await p2.clock.runFor(400);
  });
  for (const width of [412, 360]) {
    await step(`${width}px: card, setup sheet, session and end screen — no overflow`, async () => {
      await p2.setViewportSize({ width, height: 860 });
      const over = () => p2.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      if (await over()) throw new Error('today');
      await p2.click('[data-action=breath-start]'); await p2.waitForSelector('.sheet .tech-card'); await p2.clock.runFor(400);
      const chipWrap = await p2.$$eval('.dur-chips span', (e) => e.filter((x) => x.getClientRects().length > 1 || x.scrollWidth > x.clientWidth + 1).length);
      if (await over() || chipWrap) throw new Error('sheet');
      await p2.click(`.dur-chips label:has(input[value="1"])`); await p2.click('.sheet .btn.breath-btn'); await p2.clock.runFor(4000);
      if (await over()) throw new Error('session');
      await p2.clock.runFor(60000);
      if (await over() || !(await p2.$('[data-br-result]'))) throw new Error('end');
      await closeDone(p2);
    });
  }
  await p2.close(); await c2.close();
}
{
  const { c: c3, p: p3 } = await newPage({ reduced: true });
  await seed(p3, {});
  await step('reduced motion: no scaling — circle changes opacity only, phase words still shown', async () => {
    await start(p3, 'calm', 1); await p3.clock.runFor(3000 + 4800);
    const a = await view(p3);
    const z = await at(p3, 4900);
    if (a.transform !== 'none' || z.transform !== 'none' || a.word !== 'שאיפה' || z.word !== 'נשיפה' || !(Number(a.opacity) > 0.9) || !(Number(z.opacity) < 0.45)) throw new Error(JSON.stringify([a, z]));
    await p3.click('[data-br=end]'); await p3.clock.runFor(200); await closeDone(p3);
  });
  await p3.close(); await c3.close();
}
{
  const { c: c4, p: p4 } = await newPage();
  await step('offline: breathing session works with no network', async () => {
    await seed(p4, {});
    await p4.evaluate(() => navigator.serviceWorker.ready); await p4.reload(); await p4.clock.runFor(500);
    await c4.setOffline(true); await p4.reload(); await p4.clock.runFor(500);
    await start(p4, 'calm', 1); await p4.clock.runFor(63500);
    const ok = await p4.$('[data-br-result]');
    await c4.setOffline(false);
    if (!ok) throw new Error('no end screen offline');
  });
  await p4.close(); await c4.close();
}
console.log('errors:', errors.length ? errors : 'none');
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
await b.close();
