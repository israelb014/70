// Hero rings, measured in PIXELS: each ring is sampled along its own circle's centerline in a real
// screenshot (412×915 @2.625 like a Galaxy S24, and 360px), and the painted arc angle must equal
// its value × 360° within 2°. Also: center number = exercise ring, every other ring on "היום".
import { chromium } from 'playwright';
import { autoDetail, openCard } from './nav200.mjs';
const b = await chromium.launch();
let fails = 0; const step = async (l, fn) => { try { await fn(); console.log('OK  ', l); } catch (e) { fails++; console.log('FAIL', l, '-', e.message.split('\n')[0]); } };
const errors = [];

const T = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// exPct: 20 exercises × 5 sets (1 set = 1%), steps target 10,000, protein target 200 → values are exact percents.
const seed = (p, exPct, stepsPct, proteinPct) => p.evaluate(([exPct, stepsPct, proteinPct, T]) => {
  const ex = Array.from({ length: 20 }, (_, i) => ({ id: 'e' + i, name: 'ת' + i, type: 'setsReps', sets: 5, reps: 10, seconds: null, weight: null, order: i, archived: false }));
  let left = exPct; const exercises = {};
  ex.forEach((e) => { const n = Math.min(5, left); left -= n; if (n) exercises[e.id] = { sets: Array.from({ length: n }, () => ({ reps: 10, weight: null, done: true })) }; });
  localStorage.setItem('seventy.v1', JSON.stringify({ schemaVersion: 4, settings: { coach: { enabled: false }, theme: 'flame', startWeight: 90, targetWeight: 80, proteinTarget: 200, stepsTarget: 10000, rideGoalKm: 45, climbsTarget: 6, floorsRegular: 6, floorsRoof: 10, sleepTarget: 8, waterTarget: 2500 },
    exercises: ex, mealPresets: [], customFoods: [], foodMemory: {}, weights: [], meta: { lastSeenLevel: 99, seenBadges: [] },
    days: { [T]: { rest: false, steps: stepsPct * 100, climbs: [{ type: 'regular', t: 1 }], rides: [{ km: 20, minutes: 60 }], exercises,
      food: proteinPct ? [{ name: 'x', kcal: 500, protein: proteinPct * 2, time: '12:00' }] : [], sleep: { bed: '23:30', wake: '05:30' }, water: [{ ml: 1000 }] } } }));
}, [exPct, stepsPct, proteinPct, T()]);

// Painted angle (degrees) of every progress arc inside `ringSel`. Geometry comes from the TRACK circles'
// own SVG attributes (r, cx, viewBox) — not from the fill element — so a fill drawn with the wrong
// length shows up as a wrong angle.
async function arcs(p, ringSel) {
  const el = await p.$(ringSel);
  await el.scrollIntoViewIfNeeded();
  const box = await el.boundingBox();
  const png = (await p.screenshot({ clip: box, animations: 'disabled' })).toString('base64');
  return p.evaluate(async ([b64, ringSel]) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, cv.width, cv.height).data;
    const svg = document.querySelector(ringSel + ' svg'); const k = cv.width / svg.viewBox.baseVal.width;
    const tracks = [...svg.querySelectorAll('circle')].filter((c) => c.getAttribute('stroke') === 'var(--track)');
    const fills = [...svg.querySelectorAll('.ring-fill')];
    const rgb = (css) => { const e = document.createElement('i'); e.style.color = css; document.body.append(e); const m = getComputedStyle(e).color.match(/\d+/g).map(Number); e.remove(); return m; };
    return tracks.map((t, i) => {
      const r = t.r.baseVal.value, cx = t.cx.baseVal.value, cy = t.cy.baseVal.value, col = rgb(fills[i].getAttribute('stroke'));
      let on = 0; const N = 2880;
      for (let j = 0; j < N; j++) {
        const a = (j / N) * 2 * Math.PI;
        const o = (Math.round((cy - r * Math.cos(a)) * k) * cv.width + Math.round((cx + r * Math.sin(a)) * k)) * 4;
        if (Math.abs(d[o] - col[0]) + Math.abs(d[o + 1] - col[1]) + Math.abs(d[o + 2] - col[2]) < 60) on++;
      }
      return { deg: (on / N) * 360, frac: fills[i].dataset.frac != null ? +fills[i].dataset.frac : null };
    });
  }, [png, ringSel]);
}
const near = (deg, pct, label) => { const want = Math.min(100, pct) * 3.6; if (Math.abs(deg - want) > 2) throw new Error(`${label}: ${deg.toFixed(1)}° ≠ ${want.toFixed(1)}°`); };

for (const [w, h, dsf] of [[412, 915, 2.625], [360, 800, 3]]) {
  const p = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, isMobile: true, hasTouch: true })).newPage();
  autoDetail(p);
  p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await p.goto((process.env.BASE || 'http://127.0.0.1:8765/70/'));
  const cases = [[25, 25, 25], [40, 40, 40], [47, 47, 47], [100, 100, 100], [40, 25, 47], [47, 100, 25], [100, 40, 0]];
  for (const [ex, st, pr] of cases) {
    await step(`${w}px: hero arcs ex ${ex}% · steps ${st}% · protein ${pr}%`, async () => {
      await seed(p, ex, st, pr); await p.reload(); await openCard(p, 'workout'); await p.waitForTimeout(1200);
      const shown = Number((await p.textContent('.hero .ring-big bdi')).replace(/[^\d]/g, ''));
      if (shown !== ex) throw new Error(`center ${shown} ≠ ${ex}`);
      const [a, s, q] = await arcs(p, '.rings3');
      near(a.deg, ex, 'exercise (outer)'); near(s.deg, st, 'steps (middle)'); near(q.deg, pr, 'protein (inner)');
    });
  }
  // The phone bug: outer rings drawn with another ring's dash length. Simulate a renderer resolving every
  // ring's animation values identically (the inner ring's) — arcs must not depend on that.
  await step(`${w}px: arcs independent of shared CSS animation values`, async () => {
    await seed(p, 40, 25, 47); await p.reload(); await openCard(p, 'workout'); await p.waitForTimeout(300);
    await p.evaluate(() => {
      const inner = [...document.querySelectorAll('.rings3 .ring-fill')].pop();
      const cs = inner.style;
      const st = document.createElement('style');
      st.textContent = `.rings3 .ring-fill { --from: ${cs.getPropertyValue('--to') || 0} !important; --to: ${cs.getPropertyValue('--to') || 0} !important; }`;
      document.head.append(st);
    });
    await p.waitForTimeout(1200);
    const [a, s, q] = await arcs(p, '.rings3');
    near(a.deg, 40, 'exercise (outer)'); near(s.deg, 25, 'steps (middle)'); near(q.deg, 47, 'protein (inner)');
  });
  await step(`${w}px: every other ring on "היום" matches its value`, async () => {
    await seed(p, 40, 25, 47); await p.reload(); await p.waitForTimeout(300);
    // Tiles: the cards (and their rings) are on the detail pages.
    let n = 0;
    for (const id of ['workout', 'steps', 'fluids', 'stairs', 'sleep', 'breath', 'rides']) {
      await openCard(p, id);
      if (id === 'workout') await p.click('.ex-head'); // exercise row ring + open row
      await p.waitForTimeout(1200);
      await p.evaluate(() => window.scrollTo(0, 0));
      const sels = await p.$$eval('.ring:not(.rings3)', (els) => els.map((e, i) => { e.dataset.t = i; return `.ring[data-t="${i}"]`; }));
      n += sels.length;
      for (const sel of sels) for (const r of await arcs(p, sel)) near(r.deg, r.frac * 100, `${id} ${sel}`);
    }
    if (n < 6) throw new Error(`only ${n} rings`);
  });
  await step(`${w}px: hero arcs correct after in-place re-render (animated from previous value)`, async () => {
    await seed(p, 40, 25, 47); await p.reload(); await openCard(p, 'workout'); await p.waitForTimeout(1200);
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.click('[data-action="rest"]'); await p.waitForTimeout(300); // in-place re-renders
    await p.click('[data-action="rest"]'); await p.waitForTimeout(1200);
    await p.evaluate(() => window.scrollTo(0, 0));
    const [a, s, q] = await arcs(p, '.rings3');
    near(a.deg, 40, 'exercise'); near(s.deg, 25, 'steps'); near(q.deg, 47, 'protein');
  });
}
await step('level chip: number in the ring, progress next to it', async () => {
  const p = await (await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true })).newPage();
  autoDetail(p);
  await p.goto((process.env.BASE || 'http://127.0.0.1:8765/70/')); await seed(p, 40, 25, 47); await p.reload(); await p.waitForTimeout(500);
  const t = await p.textContent('.level-chip');
  const inner = await p.textContent('.level-chip .level-chip-num');
  if (!/^\d+$/.test(inner.trim()) || !/רמה\s*[\d,]+\/[\d,]+ נק׳/.test(t.replace(/\s+/g, ' ')) || t.includes(`רמה ${inner.trim()}`)) throw new Error(t);
  await p.click('.level-chip'); await p.waitForSelector('.level-card');
});
console.log('errors:', errors.length ? errors : 'none');
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
await b.close();
