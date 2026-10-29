// "מגמות" tab: weight progress + chart, 7-day steps and protein, personal records, weekly summary.
import { getState, getDay, addWeight, deleteWeight } from '../storage.js';
import { ring, barChart, weightChart, bindChartTips } from '../charts.js';
import { icon, esc, num, frac, parseNum, toast, openSheet, confirmDialog, invalid, emptyState, vibrate, HAPTIC } from '../ui.js';
import { weekInsights } from '../insights.js';
import { lastNDays, todayKey, shortDate, addDays, parseKey } from '../dates.js';
import { computeRecords, foodTotals, waterMl, drinksMl, fluidsMl, floorsOf, floorsTarget, descentFloorsOf, isDayActive } from '../stats.js';
import { weeklySummary, copyText } from '../export.js';
import { heatmapCard, bindHeatmap, scoreColor } from '../heatmap.js';
import {
  levelInfo, weekXP, badgeStates, sleepMinutes, fmtDuration, averageBedtime, totalSleepMinutes, napsMinutes, hasSleep, walkHistory, dayScore,
} from '../progress.js';
import { breathMinutes, breathGoal } from '../breathing.js';
import { sessions as photoSessions } from '../photos.js';
import { plural, int } from '../hebrew.js';
import { tilesOn, layoutOf, tile, tileGrid, miniRing, miniBars, sparkline, deltaHTML, detailHead, bindSwipeBack, unbindSwipeBack, editButton, EMPTY } from '../tiles.js';
import { medallion } from '../badgeArt.js';
import { photosCard } from './photos.js';
import { breathTrendCard } from './breathe.js';

export function render(root, ctx) {
  const st = getState().settings;
  const weights = getState().weights;
  const keys = lastNDays(7);
  const detail = tilesOn() && DETAILS[ctx.detail?.trends] ? ctx.detail.trends : null;

  if (!tilesOn()) {
    root.innerHTML = `
    <header class="page-head"><h1>מגמות</h1></header>
    ${insightsSection()}
    ${heatmapCard()}
    ${achievementsCard()}
    ${photosCard()}
    ${weightCard(st, weights)}
    ${stepsTrendCard(st, keys)}
    ${proteinTrendCard(st, keys)}
    ${sleepTrendCard(st, keys)}
    ${breathTrendCard(keys)}
    ${waterTrendCard(st, keys)}
    ${recordsCard()}
    ${copySummaryButton()}`;
  } else if (detail) {
    root.innerHTML = detailHead(DETAILS[detail].title, DETAILS[detail].sub || '7 הימים האחרונים') + DETAILS[detail].html(st, keys, weights);
  } else {
    const tiles = trendTiles(st);
    root.innerHTML = `
    <header class="page-head dash-head"><h1>מגמות</h1>${editButton('trends')}</header>
    ${tileGrid(layoutOf('trendsLayout', TREND_TILES).filter((x) => x.visible).map((x) => tile(tiles[x.id])))}
    ${insightsSection()}
    ${copySummaryButton()}`;
  }
  if (detail) bindSwipeBack(root, () => ctx.closeDetail());
  else unbindSwipeBack(root);

  root.onclick = (e) => onClick(e, ctx);
  root.onchange = null;
  bindChartTips(root);
  bindHeatmap(root, (k) => {
    ctx.date = k;
    ctx.goTab('today');
  });
}

const copySummaryButton = () => `<button type="button" class="btn primary block press" data-action="copy-summary">${icon('copy')}<span>העתק סיכום שבועי</span></button>`;

function stepsTrendCard(st, keys) {
  return `<section class="card role-steps">
      <div class="card-head">${icon('steps', 'head-ic')}<h2>צעדים · 7 ימים</h2></div>
      ${barChart({ keys, values: keys.map((k) => getDay(k).steps || 0), target: st.stepsTarget, color: 'var(--steps)', unit: 'צעדים' })}
      <p class="legend"><span class="lg-line"></span>יעד ${num(st.stepsTarget || 0)}</p>
    </section>`;
}

function proteinTrendCard(st, keys) {
  return `<section class="card role-protein">
      <div class="card-head">${icon('food', 'head-ic')}<h2>חלבון · 7 ימים</h2></div>
      ${barChart({ keys, values: keys.map((k) => foodTotals(k).protein), target: st.proteinTarget, color: 'var(--protein)', unit: 'ג׳' })}
      <p class="legend"><span class="lg-line"></span>יעד ${num(st.proteinTarget || 0)} ג׳</p>
    </section>`;
}

/* ---------- 7-day charts that only the tile detail pages show ---------- */

function stairsTrendCard(st, keys) {
  const target = floorsTarget(st);
  const downs = keys.map((k) => descentFloorsOf(getDay(k)));
  const totalDown = downs.reduce((a, b) => a + b, 0);
  return `<section class="card role-accent">
    <div class="card-head">${icon('stairs', 'head-ic')}<h2>מדרגות · 7 ימים</h2></div>
    ${barChart({ keys, values: keys.map((k) => floorsOf(getDay(k))), target, color: 'var(--accent)', format: (v) => int(v), unit: 'קומות' })}
    <p class="legend"><span class="lg-line"></span>יעד ${num(target)} קומות</p>
    <div class="hm-stats">
      <div><span class="stat-num">${num(sum(keys.map((k) => floorsOf(getDay(k)))))}</span><span class="muted small">קומות בעלייה</span></div>
      <div><span class="stat-num">${num(totalDown)}</span><span class="muted small">קומות בירידה</span></div>
    </div>
  </section>`;
}

function ridesTrendCard(st, keys) {
  const km = keys.map((k) => rideKm(getDay(k)));
  return `<section class="card role-accent">
    <div class="card-head">${icon('bike', 'head-ic')}<h2>אופניים · 7 ימים</h2></div>
    ${barChart({ keys, values: km, color: 'var(--accent)', unit: 'ק״מ' })}
    <div class="hm-stats">
      <div><span class="stat-num">${num(sum(km))}</span><span class="muted small">ק״מ בשבוע</span></div>
      <div><span class="stat-num">${num(longestIn(keys))}</span><span class="muted small">הרכיבה הארוכה</span></div>
    </div>
  </section>`;
}

function kcalTrendCard(st, keys) {
  const kcal = keys.map((k) => Math.round(foodTotals(k).kcal));
  const logged = keys.filter((k) => (getDay(k).food || []).length);
  return `<section class="card role-accent">
    <div class="card-head">${icon('bolt', 'head-ic')}<h2>קלוריות · 7 ימים</h2></div>
    ${barChart({ keys, values: kcal, color: 'var(--accent)', format: (v) => int(v), unit: 'קק״ל' })}
    <div class="hm-stats">
      <div><span class="stat-num">${logged.length ? num(Math.round(avgOf(logged, (k) => foodTotals(k).kcal))) : '–'}</span><span class="muted small">ממוצע קק״ל ליום</span></div>
      <div><span class="stat-num">${frac(logged.length, 7)}</span><span class="muted small">ימים עם תיעוד</span></div>
    </div>
  </section>`;
}

/* ---------- Tiles ---------- */

/** Tile order of "מגמות" (default layout). */
export const TREND_TILES = [
  { id: 'heatmap', label: 'מפת פעילות', icon: 'today', full: true },
  { id: 'weight', label: 'משקל', icon: 'scale' },
  { id: 'steps', label: 'צעדים', icon: 'steps' },
  { id: 'protein', label: 'חלבון', icon: 'food' },
  { id: 'fluids', label: 'נוזלים', icon: 'drop' },
  { id: 'sleep', label: 'שינה', icon: 'bed' },
  { id: 'stairs', label: 'מדרגות', icon: 'stairs' },
  { id: 'rides', label: 'אופניים', icon: 'bike' },
  { id: 'breath', label: 'נשימה', icon: 'breath' },
  { id: 'kcal', label: 'קלוריות', icon: 'bolt' },
  { id: 'records', label: 'שיאים', icon: 'trophy' },
  { id: 'achievements', label: 'הישגים', icon: 'sparkle' },
  { id: 'photos', label: 'תמונות התקדמות', icon: 'camera' },
];

const DETAILS = {
  heatmap: { title: 'מפת פעילות', sub: 'שנה אחרונה', html: () => heatmapCard() },
  weight: { title: 'משקל', sub: ' ', html: (st, keys, weights) => weightCard(st, weights) },
  steps: { title: 'צעדים', html: (st, keys) => stepsTrendCard(st, keys) },
  protein: { title: 'חלבון', html: (st, keys) => proteinTrendCard(st, keys) },
  fluids: { title: 'נוזלים', html: (st, keys) => waterTrendCard(st, keys) },
  sleep: { title: 'שינה', html: (st, keys) => sleepTrendCard(st, keys) },
  stairs: { title: 'מדרגות', html: (st, keys) => stairsTrendCard(st, keys) },
  rides: { title: 'אופניים', html: (st, keys) => ridesTrendCard(st, keys) },
  breath: { title: 'נשימה', html: (st, keys) => breathTrendCard(keys) },
  kcal: { title: 'קלוריות', html: (st, keys) => kcalTrendCard(st, keys) },
  records: { title: 'שיאים אישיים', sub: ' ', html: () => recordsCard() },
};
// Tiles whose details are an existing screen.
const SCREEN_TILES = { achievements: 'achievements', photos: 'photos' };

const sum = (a) => a.reduce((x, y) => x + y, 0);
const avgOf = (keys, fn) => (keys.length ? sum(keys.map(fn)) / keys.length : 0);
const rideKm = (day) => (day.rides || []).reduce((a, r) => a + (Number(r.km) || 0), 0);
const longestIn = (keys) => Math.max(0, ...keys.flatMap((k) => (getDay(k).rides || []).map((r) => Number(r.km) || 0)));
const f2 = (v) => v.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hasFood = (k) => (getDay(k).food || []).length > 0;

/**
 * The 7-day numbers behind the "מגמות" tiles, for the last 7 days (`cur`, ending today) and the
 * 7 days before (`prev`). Averages are per day with data, as in the 7-day cards.
 */
export function weekMetrics(st = getState().settings, end = todayKey()) {
  const cur = lastNDays(7, end), prev = lastNDays(7, addDays(end, -7));
  const per = (keys) => {
    const days = keys.map((k) => getDay(k));
    const stepDays = keys.filter((k) => getDay(k).steps > 0);
    const foodDays = keys.filter(hasFood);
    const fluidDays = days.filter((d) => fluidsMl(d) > 0);
    const sleepDays = days.filter(hasSleep);
    const inRange = getState().weights.filter((w) => w.date >= keys[0] && w.date <= keys.at(-1));
    return {
      keys,
      steps: avgOf(stepDays, (k) => getDay(k).steps),
      protein: avgOf(foodDays, (k) => foodTotals(k).protein),
      proteinMet: keys.filter((k) => st.proteinTarget && foodTotals(k).protein >= st.proteinTarget).length,
      fluids: fluidDays.length ? sum(fluidDays.map(fluidsMl)) / fluidDays.length / 1000 : 0,
      fluidsMet: days.filter((d) => fluidsMl(d) >= (st.waterTarget || 2500)).length,
      sleep: sleepDays.length ? sum(sleepDays.map(totalSleepMinutes)) / sleepDays.length : 0,
      bedtime: averageBedtime(days.filter((d) => d.sleep).map((d) => d.sleep.bed)),
      floors: sum(days.map(floorsOf)),
      downFloors: sum(days.map(descentFloorsOf)),
      km: sum(days.map(rideKm)),
      longest: longestIn(keys),
      breath: sum(days.map(breathMinutes)),
      breathMet: days.filter((d) => breathMinutes(d) >= breathGoal()).length,
      kcal: avgOf(foodDays, (k) => foodTotals(k).kcal),
      weight: inRange.length ? sum(inRange.map((w) => w.kg)) / inRange.length : 0,
    };
  };
  return { cur: per(cur), prev: per(prev) };
}

function trendTiles(st) {
  const { cur, prev } = weekMetrics(st);
  const keys = cur.keys;
  const days = keys.map((k) => getDay(k));
  const def = Object.fromEntries(TREND_TILES.map((t) => [t.id, t]));
  const mk = (id, role, data) => ({ ...def[id], id, role, ...data });
  const t = {};

  // Activity map: active days in the last 30, longest streak, 8 weeks of cells.
  const active30 = lastNDays(30).filter(isDayActive).length;
  const walk = walkHistory();
  t.heatmap = mk('heatmap', 'accent', {
    value: `${num(active30)}<small> ימים פעילים מתוך 30</small>`,
    sub: `הרצף הארוך ביותר: ${esc(plural(walk.longestStreak, 'יום אחד', 'ימים', int)).replace(/[\d,]+/, (d) => `<bdi class="num" dir="ltr">${d}</bdi>`)}`,
    visual: miniHeatmap(),
  });

  const weights = getState().weights;
  const lost = st.startWeight - (weights.at(-1)?.kg ?? st.startWeight);
  t.weight = mk('weight', 'accent', weights.length ? {
    value: cur.weight ? `${num(Math.round(cur.weight * 10) / 10)}<small> ק״ג</small>` : '—',
    sub: cur.weight ? deltaHTML(cur.weight, prev.weight, { dir: -1, mode: 'abs', unit: 'ק״ג' }) : 'אין שקילה ב-7 הימים',
    sub2: `${lost >= 0 ? 'ירדו' : 'עלו'} ${num(Math.round(Math.abs(lost) * 10) / 10)} ק״ג מההתחלה`,
    visual: sparkline(weights.slice(-10).map((w) => w.kg), 'var(--accent)'),
  } : EMPTY);

  const bars = (vals, opts) => miniBars(vals, opts);
  t.steps = mk('steps', 'steps', cur.steps ? {
    value: num(Math.round(cur.steps)), sub: deltaHTML(cur.steps, prev.steps), sub2: 'ממוצע יומי',
    visual: bars(days.map((d) => d.steps || 0), { target: st.stepsTarget, color: 'var(--steps)' }),
  } : EMPTY);

  t.protein = mk('protein', 'protein', cur.protein ? {
    value: `${num(Math.round(cur.protein))}<small> ג׳</small>`, sub: deltaHTML(cur.protein, prev.protein),
    sub2: `יעד הושג ${frac(cur.proteinMet, 7)}`,
    visual: bars(keys.map((k) => Math.round(foodTotals(k).protein)), { target: st.proteinTarget, color: 'var(--protein)' }),
  } : EMPTY);

  t.fluids = mk('fluids', 'water', cur.fluids ? {
    value: `${num(f2(cur.fluids))}<small> ל׳</small>`, sub: deltaHTML(cur.fluids, prev.fluids),
    sub2: `יעד הושג ${frac(cur.fluidsMet, 7)}`,
    visual: bars(days.map((d) => fluidsMl(d) / 1000), { target: (st.waterTarget || 2500) / 1000, color: 'var(--water)', stack: days.map((d) => drinksMl(d) / 1000), stackColor: 'var(--water-light)' }),
  } : EMPTY);

  t.sleep = mk('sleep', 'sleep', cur.sleep ? {
    value: num(fmtDuration(cur.sleep)), sub: deltaHTML(cur.sleep, prev.sleep),
    sub2: cur.bedtime ? `שעת שינה ממוצעת ${num(cur.bedtime)}` : 'ממוצע כולל תנומות',
    visual: bars(days.map((d) => totalSleepMinutes(d) / 60), { target: st.sleepTarget || 8, color: 'var(--sleep)', stack: days.map((d) => napsMinutes(d) / 60), stackColor: 'var(--sleep-light)' }),
  } : EMPTY);

  t.stairs = mk('stairs', 'accent', cur.floors || cur.downFloors ? {
    value: `${num(cur.floors)}<small> קומות</small>`, sub: deltaHTML(cur.floors, prev.floors),
    sub2: cur.downFloors ? `ירידות: ${num(cur.downFloors)} קומות` : 'סה״כ בעלייה',
    visual: bars(days.map(floorsOf), { target: floorsTarget(st), color: 'var(--accent)' }),
  } : EMPTY);

  t.rides = mk('rides', 'accent', cur.km ? {
    value: `${num(Math.round(cur.km * 10) / 10)}<small> ק״מ</small>`, sub: deltaHTML(cur.km, prev.km),
    sub2: `הארוכה: ${num(cur.longest)} ק״מ`,
    visual: bars(days.map(rideKm), { color: 'var(--accent)' }),
  } : EMPTY);

  t.breath = mk('breath', 'breath', cur.breath ? {
    value: `${num(cur.breath)}<small> דק׳</small>`, sub: deltaHTML(cur.breath, prev.breath),
    sub2: `יעד הושג ${frac(cur.breathMet, 7)}`,
    visual: bars(days.map(breathMinutes), { target: breathGoal(), color: 'var(--breath)' }),
  } : EMPTY);

  t.kcal = mk('kcal', 'accent', cur.kcal ? {
    value: num(Math.round(cur.kcal)), sub: deltaHTML(cur.kcal, prev.kcal, { dir: 0 }), sub2: 'ממוצע קק״ל ליום',
    visual: bars(keys.map((k) => Math.round(foodTotals(k).kcal)), { color: 'var(--accent)' }),
  } : EMPTY);

  // Records: new this week + the latest record's name.
  const { records, events } = computeRecords();
  const fresh = events.filter((e) => e.date >= keys[0]);
  const latest = [...events].sort((a, b) => a.date.localeCompare(b.date)).at(-1)
    || [...records].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  t.records = mk('records', 'accent', records.length ? {
    value: num(fresh.length), sub: fresh.length === 1 ? 'שיא חדש השבוע' : 'שיאים חדשים השבוע', sub2: esc(latest.label),
    visual: `<span class="tile-art">${icon('trophy')}</span>`,
  } : EMPTY);

  const L = levelInfo();
  t.achievements = mk('achievements', 'accent', {
    value: `<small>רמה </small>${num(L.level)}`, sub: `עוד ${num(L.toNext)} לרמה הבאה`,
    visual: miniRing('tile-level', L.frac, 'var(--accent)', 44, 5),
  });

  // Photos: count + last date only. Never a thumbnail.
  const list = photoSessions();
  t.photos = mk('photos', 'accent', list.length ? {
    value: num(list.length), sub: `אחרון ${num(shortDate(list.at(-1).date))}`,
    visual: `<span class="tile-art">${icon('camera')}</span>`,
  } : EMPTY);
  return t;
}

/** 8 weeks of activity cells (RTL: newest week on the left), colored like the year map. */
function miniHeatmap() {
  const today = todayKey();
  const sunday = addDays(today, -parseKey(today).getDay()); // first day of this week
  const C = 9, G = 2, S = C + G, W = 8 * S - G, H = 7 * S - G;
  let cells = '';
  for (let c = 0; c < 8; c++) {
    for (let r = 0; r < 7; r++) {
      const k = addDays(sunday, (c - 7) * 7 + r); // column 0 = 7 weeks ago, column 7 = this week
      if (k > today) continue;
      const rest = getState().days[k]?.rest;
      cells += `<rect class="mh-cell" data-day="${k}" x="${W - C - c * S}" y="${r * S}" width="${C}" height="${C}" rx="2" fill="${rest ? '#1C2026' : scoreColor(dayScore(k))}"${rest ? ' stroke="#2DD4BF" stroke-width="1"' : ''}/>`;
    }
  }
  return `<svg class="mini-heat" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">${cells}</svg>`;
}

/* ---------- Insights ---------- */

function insightsSection() {
  const list = weekInsights();
  return `<section class="card insights-week role-accent">
    <div class="card-head">${icon('sparkle', 'head-ic')}<h2>תובנות</h2><span class="muted small">7 הימים האחרונים</span></div>
    ${list.length
      ? `<ul class="insight-list">${list.map((x) => `<li class="insight kind-${x.kind}">
          <span class="insight-ic">${icon(`cat-${x.cat}`)}</span><p>${esc(x.text)}</p></li>`).join('')}</ul>`
      : emptyState('insights', 'עוד כמה ימים של נתונים ונתחיל להציג תובנות')}
  </section>`;
}

function achievementsCard() {
  const L = levelInfo();
  const badges = badgeStates();
  const earned = badges.filter((b) => b.earned).sort((a, b) => b.earned.localeCompare(a.earned));
  return `<button type="button" class="card ach-card press" data-action="achievements">
    ${ring({ id: 'level-trends', size: 76, stroke: 8, frac: L.frac, inner: `<div class="ring-mid">${num(L.level)}</div>` })}
    <div class="grow">
      <h2>הישגים · רמה ${num(L.level)}</h2>
      <div class="muted small"><span class="nw">${num(L.xp)} נקודות</span> · <span class="nw">עוד ${num(L.toNext)} לרמה הבאה</span></div>
      <div class="ach-medals">${earned.slice(0, 5).map((b) => medallion(b, true, 30)).join('') || '<span class="muted small">עוד אין תגים</span>'}
        <span class="muted small">${num(`${earned.length}/${badges.length}`)}</span></div>
    </div>
    ${icon('chevL')}
  </button>`;
}

function waterTrendCard(st, keys) {
  const target = (st.waterTarget || 2500) / 1000;
  // Bars = total fluids; drinks from "אוכל" are a lighter segment on top of the water card part.
  const liters = keys.map((k) => fluidsMl(getDay(k)) / 1000);
  const drinks = keys.map((k) => drinksMl(getDay(k)) / 1000);
  const logged = liters.filter((l) => l > 0);
  const avg = logged.length ? logged.reduce((a, b) => a + b, 0) / logged.length : 0;
  const f2 = (v) => v.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const tips = keys.map((k, i) => (drinks[i] > 0
    ? `${shortDate(k)} · מים ${f2(waterMl(getDay(k)) / 1000)} · משקאות ${f2(drinks[i])} · סה״כ ${f2(liters[i])} ל׳`
    : null));
  return `<section class="card role-water">
    <div class="card-head">${icon('drop', 'head-ic')}<h2>מים · 7 ימים</h2></div>
    ${barChart({ keys, values: liters, target, color: 'var(--water)', format: (v) => f2(v), unit: 'ל׳', stack: drinks, stackColor: 'var(--water-light)', tips })}
    <p class="legend"><span class="lg-line"></span>יעד ${num(target, 2)} ל׳</p>
    <div class="hm-stats">
      <div><span class="stat-num">${logged.length ? num(f2(avg)) : '–'}</span><span class="muted small">ממוצע ליטרים ליום</span></div>
      <div><span class="stat-num">${frac(logged.length, 7)}</span><span class="muted small">ימים עם תיעוד</span></div>
    </div>
  </section>`;
}

function sleepTrendCard(st, keys) {
  const target = st.sleepTarget || 8;
  const days = keys.map((k) => getDay(k));
  // Bars and the average use the TOTAL (night + naps); naps are a lighter segment on top.
  const logged = days.filter(hasSleep);
  const hours = days.map((d) => totalSleepMinutes(d) / 60);
  const napHours = days.map((d) => napsMinutes(d) / 60);
  const tips = days.map((d, i) => (napsMinutes(d)
    ? `${shortDate(keys[i])} · לילה ${fmtDuration(sleepMinutes(d.sleep))} · תנומות ${fmtDuration(napsMinutes(d))} · סה״כ ${fmtDuration(totalSleepMinutes(d))} שעות`
    : null));
  const avgMin = logged.length ? logged.reduce((a, d) => a + totalSleepMinutes(d), 0) / logged.length : 0;
  // Average bedtime: night sleep only.
  const avgBed = averageBedtime(days.filter((d) => d.sleep).map((d) => d.sleep.bed));
  return `<section class="card role-sleep">
    <div class="card-head">${icon('bed', 'head-ic')}<h2>שינה · 7 ימים</h2></div>
    ${barChart({ keys, values: hours, target, color: 'var(--sleep)', format: (v) => fmtDuration(v * 60), unit: 'שעות', stack: napHours, stackColor: 'var(--sleep-light)', tips })}
    <p class="legend"><span class="lg-line"></span>יעד ${num(target)} שעות</p>
    <div class="hm-stats">
      <div><span class="stat-num">${logged.length ? num(fmtDuration(avgMin)) : '–'}</span><span class="muted small">ממוצע שעות שינה</span></div>
      <div><span class="stat-num">${avgBed ? num(avgBed) : '–'}</span><span class="muted small">שעת שינה ממוצעת</span></div>
    </div>
  </section>`;
}

export function weightCard(st, weights) {
  const start = st.startWeight;
  const target = st.targetWeight;
  const current = weights.length ? weights[weights.length - 1].kg : start;
  const span = target - start;
  const frac = span ? (current - start) / span : 0;
  const diff = start - current; // positive = lost
  const recent = weights
    .map((w, i) => ({ ...w, i }))
    .slice(-6)
    .reverse()
    .map(
      (w) => `<li class="list-row"><div class="grow"><strong>${num(w.kg)} ק״ג</strong>
        <span class="muted small"> · ${num(shortDate(w.date))}</span></div>
        <button type="button" class="icon-btn sm press danger-ic" data-action="weight-del" data-i="${w.i}" aria-label="מחיקת שקילה">${icon('trash')}</button></li>`
    )
    .join('');
  return `<section class="card role-accent">
    <div class="card-head">${icon('scale', 'head-ic')}<h2>משקל</h2></div>
    <div class="row">
      ${ring({
        id: 'weight', size: 150, stroke: 14, frac,
        color: frac >= 1 ? 'var(--success)' : 'var(--accent)',
        inner: `<div class="ring-big sm">${num(current)}</div><div class="muted small">ק״ג</div>`,
      })}
      <div class="grow">
        <div class="stat-num">${num(Math.abs(diff))}<small> ק״ג</small></div>
        <div class="muted">${diff >= 0 ? 'ירדו מההתחלה' : 'עלו מההתחלה'}</div>
        <div class="muted small">התחלה ${num(start)} · יעד ${num(target)}</div>
      </div>
    </div>
    <button type="button" class="btn secondary block press" data-action="weight-add">${icon('plus')}<span>הוספת שקילה</span></button>
    ${weights.length ? `${weightChart(weights, target)}
      <p class="legend"><span class="lg-dot"></span>שקילה <span class="lg-avg"></span>ממוצע שבועי <span class="lg-line"></span>יעד</p>
      <ul class="list">${recent}</ul>` : emptyState('weight', 'עוד אין שקילות. הוסיפו שקילה ראשונה כדי לראות גרף.')}
  </section>`;
}

function recordsCard() {
  const { records, events } = computeRecords();
  const recent = new Set(events.filter((e) => e.date >= lastNDays(7)[0]).map((e) => e.id));
  const rows = records
    .map(
      (r) => `<li class="list-row">
        <div class="grow"><strong>${esc(r.label)}</strong><div class="muted small">${num(shortDate(r.date))}</div></div>
        ${recent.has(r.id) ? `<span class="badge">${icon('trophy')}<span>חדש</span></span>` : ''}
        <div class="rec-val">${num(r.value)} <span class="muted small">${esc(r.unit)}</span></div>
      </li>`
    )
    .join('');
  return `<section class="card role-accent">
    <div class="card-head">${icon('trophy', 'head-ic')}<h2>שיאים אישיים</h2></div>
    ${rows ? `<ul class="list">${rows}</ul>` : emptyState('trophy', 'השיאים יופיעו כאן אוטומטית אחרי שתתחילו לתעד.')}
  </section>`;
}

async function onClick(e, ctx) {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  switch (b.dataset.action) {
    case 'tile-open': {
      const id = b.dataset.tileId;
      if (SCREEN_TILES[id]) return ctx.goTab(SCREEN_TILES[id]);
      return ctx.openDetail(id);
    }
    case 'detail-back':
      return ctx.closeDetail();
    case 'layout-edit':
      ctx.layoutFor = b.dataset.layout;
      ctx.layoutDraft = null;
      return ctx.goTab('layout');
    case 'achievements':
      return ctx.goTab('achievements');
    case 'photos':
      return ctx.goTab('photos');
    case 'weight-add':
    case 'weight-del':
      return weightAction(b.dataset.action, b, ctx, todayKey());
    case 'copy-summary': {
      const ok = await copyText(weeklySummary());
      toast(ok ? 'הסיכום השבועי הועתק' : 'ההעתקה נכשלה');
    }
  }
}

/** Weigh-in sheet (date defaults to `date`) and delete; shared with the "משקל" tile on "היום". */
export async function weightAction(action, b, ctx, date = todayKey()) {
  if (action === 'weight-del') {
    if (await confirmDialog('למחוק את השקילה?', { title: 'מחיקת שקילה', ok: 'מחיקה', danger: true })) {
      deleteWeight(Number(b.dataset.i));
      ctx.rerender();
    }
    return;
  }
  const last = getState().weights.at(-1)?.kg ?? getState().settings.startWeight;
  const res = await openSheet({
    title: 'הוספת שקילה',
    body: `<div class="field-grid">
      <label class="field"><span>משקל (ק״ג)</span><input name="kg" type="number" inputmode="decimal" step="0.1" min="0" placeholder="${last ?? ''}"></label>
      <label class="field"><span>תאריך</span><input name="date" type="date" value="${date}" max="${todayKey()}"></label>
    </div>`,
    onOpen: (root) => setTimeout(() => root.querySelector('[name=kg]').focus(), 300),
    actions: [
      { label: 'ביטול', value: null, kind: 'ghost' },
      {
        label: 'שמירה',
        kind: 'primary',
        onClick: (root) => {
          const kgIn = root.querySelector('[name=kg]');
          const kg = parseNum(kgIn.value);
          const d = root.querySelector('[name=date]').value;
          if (!(kg > 20 && kg < 400)) return invalid(kgIn, 'משקל לא תקין');
          if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > todayKey()) return invalid(root.querySelector('[name=date]'), 'תאריך לא תקין');
          return { kg, date: d };
        },
      },
    ],
  });
  if (res) {
    addWeight(res.date, res.kg);
    vibrate(HAPTIC.item);
    toast('השקילה נשמרה');
    ctx.rerender();
  }
}
