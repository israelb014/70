// v3.0.0: visual parity of "היום" with v2.3.0 under "להבה" (web and app), the 7 daily themes (screenshots,
// contrast of every text pair, metric colors unchanged), weekday / midnight / fixed switching, pause mode,
// the two new foods and "גודל הכוס שלי".
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const BASE = process.env.BASE || 'http://127.0.0.1:8765/70/';
const OUT = process.env.TEST_OUT || '.';
const ROOT = process.env.REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MOCK = fs.readFileSync(new URL('./capmock.js', import.meta.url), 'utf8');
const b = await chromium.launch();
let fails = 0; const step = async (l, fn) => { try { await fn(); console.log('OK  ', l); } catch (e) { fails++; console.log('FAIL', l, '-', e.message.split('\n')[0]); } };
const errors = [];
const DAY = 86400000;
const key = (o = 0, base = Date.now()) => { const d = new Date(base - o * DAY); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const eq = (a, e, what) => { if (JSON.stringify(a) !== JSON.stringify(e)) throw new Error(`${what}: ${JSON.stringify(a)} ≠ ${JSON.stringify(e)}`); };
const THEMES = ['flame', 'ruby', 'cobalt', 'lime', 'magenta', 'silver', 'champagne'];
const METRICS = { steps: '#ffb020', protein: '#2dd4bf', water: '#38bdf8', sleep: '#a78bfa', breath: '#34d399', kcal: '#ff5a3c', weight: '#9aa4af', stairs: '#ff6a00', success: '#4ade80' };
// A fixed moment (Wednesday 10:00) so every render is the same; days are relative to it.
const NOW = new Date(2026, 10, 11, 10, 0, 0);
const K = (o) => key(o, NOW.getTime());

const SETTINGS = { coach: { enabled: false }, startWeight: 90, targetWeight: 80, proteinTarget: 140, stepsTarget: 8000, rideGoalKm: 45, climbsTarget: 6, floorsRegular: 6, floorsRoof: 10, sleepTarget: 8, waterTarget: 2500 };
function demo(settings = {}, extraDays = {}) {
  const days = {};
  for (let i = 0; i < 8; i++) {
    days[K(i)] = { rest: false, steps: [6240, 7100, 5400, 8300, 6900, 7700, 5200, 6000][i], climbs: i % 2 ? [{ type: 'regular', floors: 6 }] : [], rides: [], descents: [], breathing: [], naps: [],
      exercises: i === 0 ? { a: { sets: [{ reps: 10, done: true }, { reps: 10, done: true }] } } : {},
      food: [{ name: 'א', grams: 100, kcal: [1850, 2100, 1700, 1950, 2200, 1800, 2000, 1900][i], protein: [92, 120, 85, 140, 110, 99, 130, 100][i], source: 'db' }],
      sleep: { bed: ['23:45', '23:00', '00:30', '23:15', '22:50', '00:10', '23:30', '23:00'][i], wake: '07:00' }, water: [{ ml: [1500, 2100, 1800, 2600, 1200, 2000, 2300, 1900][i], time: '09:00' }] };
  }
  Object.assign(days, extraDays);
  const X = (id, name, o = {}) => ({ id, name, type: 'setsReps', sets: 2, reps: 10, seconds: null, weight: null, order: 0, archived: false, ...o });
  return { schemaVersion: 4, settings: { ...SETTINGS, ...settings }, exercises: [X('a', 'שכיבות סמיכה'), X('b', 'סקוואט', { order: 1 }), X('c', 'מתח', { order: 2 })],
    mealPresets: [], customFoods: [], foodMemory: {}, weights: [{ date: K(9), kg: 73.4 }, { date: K(5), kg: 73 }, { date: K(1), kg: 72.5 }], photoSessions: [],
    meta: { lastSeenLevel: 99, seenBadges: ['first', 'steps10k', 'streak3', 'streak7', 'kg5', 'protein7', 'sleep7', 'water7'], lastBackupAt: NOW.toISOString(), appBannerDismissed: true }, days };
}

async function open(url, state, { native = false, now = NOW, reduce = true, size = [412, 915], install = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: reduce ? 'reduce' : 'no-preference', serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text()) && errors.push(m.text()));
  if (install) await p.clock.install({ time: now }); else await p.clock.setFixedTime(now);
  await ctx.addInitScript(([s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('seventy.v1', s); sessionStorage.setItem('seeded', '1'); } }, [JSON.stringify(state)]);
  if (native) await ctx.addInitScript(MOCK);
  await ctx.route('https://api.github.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"tag_name":"v0.0.0","assets":[]}' }));
  await p.goto(url);
  await p.waitForTimeout(install ? 0 : 1600);
  if (install) await p.clock.runFor(1600);
  return { ctx, p };
}

/** Share of pixels that differ by more than `tol` in any channel (images decoded in the browser). */
async function diff(page, a, c, tol = 24) {
  return page.evaluate(async ([a, c, tol]) => {
    const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = `data:image/png;base64,${src}`; });
    const [ia, ic] = await Promise.all([load(a), load(c)]);
    const w = Math.min(ia.width, ic.width), h = Math.min(ia.height, ic.height);
    const px = (img) => { const cv = new OffscreenCanvas(w, h); const x = cv.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
    const da = px(ia), dc = px(ic);
    let n = 0;
    for (let i = 0; i < da.length; i += 4) if (Math.max(Math.abs(da[i] - dc[i]), Math.abs(da[i + 1] - dc[i + 1]), Math.abs(da[i + 2] - dc[i + 2])) > tol) n++;
    return n / (w * h);
  }, [a.toString('base64'), c.toString('base64'), tol]);
}

/* ---------- Visual parity with v2.3.0 ---------- */

let v23 = null;
await step('"היום" under "להבה" is identical to v2.3.0 at 412×915 (web) — and the app renders it identically', async () => {
  const dir = path.join(OUT, 'v230');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  execSync(`git -C "${ROOT}" archive 7894feb | tar -x -C "${dir}"`);
  const rel = path.relative(ROOT, dir).split(path.sep).join('/');
  const state = demo({ theme: 'flame' });
  const old = await open(`${BASE}${rel}/`, state);
  v23 = await old.p.screenshot();
  fs.writeFileSync(path.join(OUT, 'parity-v230.png'), v23);
  await old.ctx.close();
  const web = await open(BASE, state);
  eq(await web.p.evaluate(() => document.documentElement.dataset.theme), 'flame', 'theme');
  const now = await web.p.screenshot();
  fs.writeFileSync(path.join(OUT, 'parity-v300-web.png'), now);
  const d = await diff(web.p, v23, now);
  console.log(`     web vs v2.3.0: ${(d * 100).toFixed(3)}% pixels differ`);
  if (d > 0.002) throw new Error(`web differs from v2.3.0 by ${(d * 100).toFixed(2)}%`);
  const app = await open(BASE, state, { native: true });
  const shot = await app.p.screenshot();
  fs.writeFileSync(path.join(OUT, 'parity-v300-app.png'), shot);
  const d2 = await diff(web.p, now, shot);
  console.log(`     app vs web: ${(d2 * 100).toFixed(3)}% pixels differ`);
  if (d2 > 0.002) throw new Error(`app differs from web by ${(d2 * 100).toFixed(2)}%`);
  await web.ctx.close(); await app.ctx.close();
});

/* ---------- Themes ---------- */

const lum = ([r, g, b2]) => { const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b2); };
const contrast = (a, c) => { const [x, y] = [lum(a), lum(c)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const over = (fg, alpha, bg) => fg.map((v, i) => v * alpha + bg[i] * (1 - alpha));

await step('7 themes: "היום" screenshot each; every text pair ≥ 4.5:1 (AA); metric colors unchanged; only tokens differ', async () => {
  const shots = [];
  for (const t of THEMES) {
    const { ctx, p } = await open(BASE, demo({ theme: t }));
    eq(await p.evaluate(() => document.documentElement.dataset.theme), t, 'theme attr');
    const shot = await p.screenshot();
    fs.writeFileSync(path.join(OUT, `theme-${t}.png`), shot);
    shots.push(shot);
    const c = await p.evaluate((names) => {
      const probe = document.createElement('i');
      document.body.appendChild(probe);
      const rgb = (v) => { probe.style.color = `var(${v})`; return getComputedStyle(probe).color.match(/[\d.]+/g).slice(0, 3).map(Number); };
      const out = Object.fromEntries(names.map((n) => [n, rgb(n)]));
      probe.remove();
      return out;
    }, ['--bg', '--card', '--raised', '--text', '--text-2', '--muted', '--accent', '--accent-fg', '--on-accent', ...Object.keys(METRICS).map((m) => `--${m}`)]);
    const pairs = [
      ['text/bg', c['--text'], c['--bg']], ['text/card', c['--text'], c['--card']], ['text-2/card', c['--text-2'], c['--card']],
      ['muted/card', c['--muted'], c['--card']], ['muted/bg', c['--muted'], c['--bg']],
      ['accent-fg/card', c['--accent-fg'], c['--card']], ['accent-fg/bg', c['--accent-fg'], c['--bg']], ['accent-fg/raised', c['--accent-fg'], c['--raised']],
      ['accent-fg/accent-tint', c['--accent-fg'], over(c['--accent'], 0.14, c['--card'])],
      ['on-accent/accent', c['--on-accent'], c['--accent']],
    ];
    for (const [name, fg, bg] of pairs) {
      const r = contrast(fg, bg);
      if (r < 4.5) throw new Error(`${t}: ${name} ${r.toFixed(2)}:1`);
    }
    for (const [m, hex] of Object.entries(METRICS)) {
      const want = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      eq(c[`--${m}`], want, `${t}: --${m} unchanged`);
    }
    // Real elements: the "התחל" button text and the active tab use the theme
    const startOk = await p.evaluate(() => { const e = document.querySelector('.hero-start'); return !!e && getComputedStyle(e).color !== ''; });
    eq(startOk, true, `${t}: start button`);
    // Stairs keep their own orange in every theme
    eq(await p.evaluate(() => getComputedStyle(document.querySelector('[data-tile=stairs] .tile-lbl')).color), 'rgb(255, 106, 0)', `${t}: stairs color`);
    await ctx.close();
  }
  // Themes look different from each other (accent / glow), "flame" is v2.3.0
  const { ctx, p } = await open(BASE, demo({ theme: 'flame' }));
  for (let i = 1; i < shots.length; i++) if ((await diff(p, shots[0], shots[i])) < 0.01) throw new Error(`${THEMES[i]} looks like flame`);
  // Layout is identical across themes: same element boxes
  const boxes = async (t) => { const o = await open(BASE, demo({ theme: t })); const r = await o.p.$$eval('.tile, .dash-rings, .today-head', (e) => e.map((x) => { const q = x.getBoundingClientRect(); return [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)]; })); await o.ctx.close(); return r; };
  const ref = await boxes('flame');
  for (const t of THEMES.slice(1)) eq(await boxes(t), ref, `${t}: layout`);
  await ctx.close();
});

await step('daily switching: Sunday להבה … Saturday שמפניה; a fixed theme stays; midnight switch; 400 ms crossfade (instant with reduced motion)', async () => {
  for (let d = 0; d < 7; d++) {
    const when = new Date(2026, 10, 8 + d, 12, 0, 0); // Sunday 8.11.2026 + d
    const { ctx, p } = await open(BASE, demo({ theme: 'auto' }), { now: when });
    eq(await p.evaluate(() => document.documentElement.dataset.theme), THEMES[d], `weekday ${d}`);
    await ctx.close();
  }
  const fixed = await open(BASE, demo({ theme: 'ruby' }), { now: new Date(2026, 10, 13, 12) });
  eq(await fixed.p.evaluate(() => document.documentElement.dataset.theme), 'ruby', 'fixed theme on a Friday');
  await fixed.ctx.close();
  const mid = await open(BASE, demo({ theme: 'auto' }), { now: new Date(2026, 10, 14, 23, 59, 50), install: true, reduce: false });
  eq(await mid.p.evaluate(() => document.documentElement.dataset.theme), 'champagne', 'Saturday night');
  await mid.p.clock.runFor(15000);
  eq(await mid.p.evaluate(() => document.documentElement.dataset.theme), 'flame', 'after midnight');
  eq(await mid.p.evaluate(() => getComputedStyle(document.documentElement).transitionDuration.split(',').map((x) => x.trim())[0]), '0.4s', 'crossfade 400 ms');
  await mid.ctx.close();
  const rm = await open(BASE, demo({ theme: 'auto' }));
  eq(parseFloat(await rm.p.evaluate(() => getComputedStyle(document.documentElement).transitionDuration)) < 0.01, true, 'reduced motion: instant');
  // meta theme-color + favicon follow the theme
  await rm.p.evaluate(async () => { (await import('./js/storage.js')).updateSettings({ theme: 'cobalt' }); (await import('./js/theme.js')).applyTheme(); });
  eq(await rm.p.getAttribute('meta[name=theme-color]', 'content'), 'rgb(10, 14, 21)', 'meta color');
  if (!decodeURIComponent(await rm.p.getAttribute('link[rel=icon][type="image/svg+xml"]', 'href')).includes('37, 99, 235')) throw new Error('favicon tint');
  await rm.ctx.close();
});

await step('settings "עיצוב": משתנה כל יום (default) / fixed picker with 7 preview cards; choosing a card fixes the theme', async () => {
  const { ctx, p } = await open(BASE, demo({}));
  await p.click('.tab[data-tab=settings]'); await p.waitForTimeout(300);
  eq(await p.isChecked('[data-theme-mode][value=auto]'), true, 'default auto');
  eq(await p.$$eval('.theme-card b', (e) => e.map((x) => x.textContent)), ['להבה', 'רובי', 'קובלט', 'ליים', 'מג׳נטה', 'כסף', 'שמפניה'], 'cards');
  eq(await p.$eval('.theme-card[data-theme=lime] small', (e) => e.textContent), 'היום', 'today marked (Wednesday)');
  const dot = await p.$eval('.theme-card[data-theme=magenta] .tc-dot', (e) => getComputedStyle(e).backgroundColor);
  eq(dot, 'rgb(217, 70, 239)', 'preview uses the theme accent');
  await p.click('.theme-card[data-theme=cobalt]'); await p.waitForTimeout(300);
  eq([(await p.evaluate(() => JSON.parse(localStorage.getItem('seventy.v1')).settings.theme)), await p.evaluate(() => document.documentElement.dataset.theme)], ['cobalt', 'cobalt'], 'fixed');
  await p.click('label:has([data-theme-mode][value=auto])'); await p.waitForTimeout(300);
  eq(await p.evaluate(() => document.documentElement.dataset.theme), 'lime', 'back to the day');
  for (const w of [412, 360]) {
    await p.setViewportSize({ width: w, height: 800 }); await p.waitForTimeout(150);
    if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`overflow ${w}`);
  }
  await ctx.close();
});

/* ---------- Pause ---------- */

await step('pause: chip "הקפאה עד DD.MM" + "סיום הקפאה"; streak frozen; coach shows "הקפאה", no plan, no sleep reminder; no "behind target" insights', async () => {
  // Active on days 3..10 before NOW, pause from yesterday for 3 days (today included); nothing logged since.
  const days = {};
  for (let i = 3; i <= 10; i++) days[K(i)] = { rest: false, steps: 9000, climbs: [], rides: [], descents: [], breathing: [], naps: [], exercises: {}, food: [], sleep: null, water: [] };
  const st = demo({ theme: 'flame', coach: { enabled: true }, stepsTarget: 8000 });
  st.days = days;
  const { ctx, p } = await open(BASE, st);
  const streakBefore = await p.evaluate(async () => (await import('./js/stats.js')).currentStreak());
  eq(streakBefore, 0, 'broken without a pause (2 empty days)');
  // A pause "עד שאבטל" that started 2 days ago (the two empty days)
  await p.evaluate(async (k) => (await import('./js/storage.js')).updateSettings({ pauses: [{ start: k, end: null }] }), K(2));
  await p.click('.tab[data-tab=food]'); await p.click('.tab[data-tab=today]'); await p.waitForTimeout(300);
  eq((await p.textContent('[data-pause-chip] span')).replace(/\s+/g, ' ').trim(), 'הקפאה עד שתבטל', 'open-ended chip');
  eq(await p.evaluate(async () => (await import('./js/stats.js')).currentStreak()), 8, 'streak frozen across the pause');
  eq((await p.textContent('[data-tile=workout] .tile-lbl')).trim(), 'הקפאה', 'coach label');
  eq(await p.evaluate(async (k) => (await import('./js/stats.js')).exercisesForDay(k).length, K(0)), 0, 'no plan exercises');
  if (await p.$('[data-sleep-banner]')) throw new Error('sleep banner during a pause');
  const rem = await p.evaluate(async (iso) => (await import('./js/reminders.js')).planReminders(new Date(iso)).map((n) => n.title), new Date(2026, 10, 11, 6).toISOString());
  if (rem.filter((x) => x === 'רישום שינה').length !== 0) throw new Error('sleep reminder during the pause: ' + rem);
  const ins = await p.evaluate(async (k) => (await import('./js/insights.js')).dayInsights(k).map((x) => x.kind), K(0));
  if (ins.includes('attention')) throw new Error('attention insight during a pause');
  // Logging still works
  await p.click('[data-tile=fluids] .tile-quick'); await p.waitForTimeout(200);
  eq((await p.evaluate((k) => JSON.parse(localStorage.getItem('seventy.v1')).days[k].water.length, K(0))), 1, 'water logged');
  await p.click('[data-action=pause-end]'); await p.waitForTimeout(300);
  if (await p.$('[data-pause-chip]')) throw new Error('chip after ending');
  eq((await p.evaluate(() => JSON.parse(localStorage.getItem('seventy.v1')).settings.pauses)), [{ start: K(2), end: K(0) }], 'ended today');
  eq(await p.evaluate(async () => (await import('./js/stats.js')).currentStreak()), 8, 'past pause days stay frozen');
  // Settings: a new pause from today for 3 days → "הקפאה עד" its last day
  await p.click('.tab[data-tab=settings]'); await p.waitForTimeout(300);
  await p.fill('[data-pause-days]', '3');
  await p.click('[data-action=pause-start]'); await p.waitForTimeout(300);
  eq((await p.evaluate(() => JSON.parse(localStorage.getItem('seventy.v1')).settings.pauses)).at(-1), { start: K(0), end: K(-3) }, 'stored');
  await p.click('.tab[data-tab=today]'); await p.waitForTimeout(300);
  const [, m, d] = K(-2).split('-');
  eq((await p.textContent('[data-pause-chip] span')).replace(/\s+/g, ' ').trim(), `הקפאה עד ${d}.${m}`, 'chip with the last day');
  await ctx.close();
});

await step('pause: rotation does not advance; back from a pause the coach starts with "יום קל"', async () => {
  const DAYS = [{ id: 'A', name: 'יום א׳', subtitle: '' }, { id: 'B', name: 'יום ב׳', subtitle: '' }];
  const st = demo({ coach: { enabled: false }, rotation: { mode: 'rotation', startDate: K(20), days: DAYS }, pauses: [{ start: K(3), end: K(1) }] });
  st.exercises = [{ id: 'a1', name: 'שכיבות סמיכה', type: 'setsReps', sets: 2, reps: 10, seconds: null, weight: null, order: 0, archived: false, days: ['A'] },
    { id: 'b1', name: 'סקוואט', type: 'setsReps', sets: 2, reps: 10, seconds: null, weight: null, order: 1, archived: false, days: ['B'] }];
  const done = { sets: [{ reps: 10, done: true }, { reps: 10, done: true }] };
  st.days = { [K(5)]: { ...st.days[K(5)], exercises: { a1: done } }, [K(2)]: { ...st.days[K(2)], exercises: { b1: done } } };
  const { ctx, p } = await open(BASE, st);
  // A on day 5; B logged on day 2 (inside the pause) doesn't count → today is B
  eq(await p.evaluate(async (k) => (await import('./js/rotation.js')).dayTypeOf(k), K(0)), 'B', 'rotation frozen');
  await ctx.close();
  // Coach: full readiness, pause ended yesterday → light, "חוזרים מהקפאה"
  const st2 = demo({ coach: { enabled: true }, pauses: [{ start: K(4), end: K(0) }] });
  st2.days[K(0)] = { ...st2.days[K(0)], exercises: {}, sleep: { bed: '23:00', wake: '07:00' } };
  st2.days[K(1)] = { ...st2.days[K(1)], food: [{ name: 'א', grams: 100, kcal: 2000, protein: 140, source: 'db' }] };
  for (let i = 1; i <= 4; i++) st2.days[K(i)].exercises = {};
  const c = await open(BASE, st2);
  const plan = await c.p.evaluate(async (k) => (await import('./js/coach.js')).planFor(k), K(0));
  eq([plan.intensity, plan.reason], ['light', 'חוזרים מהקפאה'], 'light after a pause');
  await c.ctx.close();
});

/* ---------- Foods + cup ---------- */

await step('foods: "שוקו פרו" (שוקו חלבון) 1 בקבוק = 250 ml, 140 kcal, 25 g protein, a drink; "פטל דיאט" (פטל לייט) כוס 240 ml, a drink', async () => {
  const { ctx, p } = await open(BASE, demo({ theme: 'flame' }), { reduce: true });
  const add = async (q, name, unitName) => {
    await p.click('.tab[data-tab=food]'); await p.waitForTimeout(300);
    await p.fill('[data-search]', q); await p.waitForTimeout(900);
    await p.click(`.food-result:has-text("${name}")`); await p.waitForSelector('.sheet [name=fluid]'); await p.waitForTimeout(300);
    await p.click(`.sheet .unit-chip:has-text("${unitName}")`); await p.waitForTimeout(150);
    const unit = await p.$eval('.sheet [name=unit]:checked', (e) => e.closest('label').textContent.trim()).catch(() => '');
    const fluid = await p.isChecked('.sheet [name=fluid]');
    await p.fill('.sheet [name=amount]', '1'); await p.waitForTimeout(150);
    await p.click('.sheet .btn.primary'); await p.waitForTimeout(400);
    return { unit, fluid };
  };
  const a = await add('שוקו חלבון', 'שוקו פרו', 'בקבוק');
  eq(a.fluid, true, 'שוקו פרו is a drink');
  if (!a.unit.includes('בקבוק')) throw new Error('unit ' + a.unit);
  const b2 = await add('פטל לייט', 'פטל דיאט', 'כוס');
  eq(b2.fluid, true, 'פטל דיאט is a drink (with a cup)');
  if (!b2.unit.includes('כוס')) throw new Error('unit ' + b2.unit);
  const food = await p.evaluate((k) => JSON.parse(localStorage.getItem('seventy.v1')).days[k].food.slice(-2).map((f) => [f.name, f.grams, f.kcal, f.protein]), K(0));
  eq(food, [['שוקו פרו', 250, 140, 25], ['פטל דיאט', 240, 2, 0]], 'entries');
  eq(await p.evaluate(async (k) => { const s = await import('./js/stats.js'); const st = await import('./js/storage.js'); return s.drinksMl(st.getDay(k)); }, K(0)), 490, 'fluids');
  // The fruit "פטל" stays food
  eq(await p.evaluate(async () => (await import('./js/fluids.js')).drinkByRules('פטל אדום, טרי', 'כוס')), false, 'raspberries are food');
  await ctx.close();
});

await step('"גודל הכוס שלי": 100–500 ml (default 250) for "+ כוס", the נוזלים quick action and glass counts; past entries keep their ml', async () => {
  const st = demo({ theme: 'flame' });
  const { ctx, p } = await open(BASE, st);
  await p.click('.tab[data-tab=settings]'); await p.waitForTimeout(300);
  eq(await p.inputValue('[data-setting=cupMl]'), '', 'missing = default');
  await p.fill('[data-setting=cupMl]', '600'); await p.dispatchEvent('[data-setting=cupMl]', 'change'); await p.waitForTimeout(200);
  eq((await p.evaluate(() => JSON.parse(localStorage.getItem('seventy.v1')).settings.cupMl)), undefined, '600 rejected');
  await p.fill('[data-setting=cupMl]', '300'); await p.dispatchEvent('[data-setting=cupMl]', 'change'); await p.waitForTimeout(200);
  eq((await p.evaluate(() => JSON.parse(localStorage.getItem('seventy.v1')).settings.cupMl)), 300, 'saved');
  await p.click('.tab[data-tab=today]'); await p.waitForTimeout(300);
  await p.click('[data-tile=fluids] .tile-quick'); await p.waitForTimeout(300);
  eq(await p.getAttribute('[data-tile=fluids] .tile-quick', 'aria-label'), 'הוספת 300 מ״ל מים', 'quick action label');
  await p.click('[data-tile=fluids] .tile-open'); await p.waitForTimeout(250);
  eq(await p.getAttribute('[data-action=water-add]', 'data-ml'), '300', '+ כוס');
  if (!(await p.textContent('[data-action=water-add]')).includes('300')) throw new Error('label');
  const w = await p.evaluate((k) => JSON.parse(localStorage.getItem('seventy.v1')).days[k].water.map((x) => x.ml), K(0));
  eq(w, [1500, 300], 'past entry kept, new one 300');
  const txt = await p.evaluate(async (k) => (await import('./js/export.js')).dailySummary(k), K(0));
  if (!txt.includes('6 כוסות')) throw new Error('glass count by 300 ml: ' + txt.split('\n').find((l) => l.startsWith('מים')));
  await ctx.close();
});

console.log(errors.length ? 'errors: ' + errors.join(' | ') : 'errors: none');
await b.close();
if (errors.length) fails++;
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
