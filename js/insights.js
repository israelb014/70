// Automatic insights: deterministic rules over the on-device history. No AI, no network.
// Each insight: { id, text, kind: 'positive'|'attention'|'neutral', priority 0–100, scope: 'day'|'week', cat }
// cat (icon category): sleep | food | activity | strength | weight | consistency
import { getState, getDay, activeExercises, exerciseById } from './storage.js';
import { addDays, lastNDays, todayKey, weekdayName, parseKey } from './dates.js';
import { breathMinutes, sleepAfterBreathing } from './breathing.js';
import { foodTotals, dayCompletion, exercisesForDay, computeRecords, waterMl, floorsOf, floorsTarget } from './stats.js';
import { sleepMinutes, fmtDuration, walkHistory, BADGES, durText, totalSleepMinutes, hasSleep, napsMinutes } from './progress.js';
import { int, trim, plural } from './hebrew.js';

/* ---------- helpers ---------- */

const r10 = (n) => Math.round(n / 10) * 10;
const kcalText = (n) => `${int(r10(n))} קק״ל`;
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const days = () => getState().days;
const settings = () => getState().settings || {};
const hasFood = (k) => (days()[k]?.food || []).length > 0;

/** "א, ב וג" */
export function joinHe(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ו${items[items.length - 1]}`;
}

/** Hebrew prefix letter (ב / מ) on a name; a hyphen before non-Hebrew names or digits. */
const pre = (letter, name) => (/^[\u05D0-\u05EA]/.test(name) ? `${letter}${name}` : `${letter}-${name}`);

/** Natural-language text for a personal record (new: true) on a record id. */
function recordText(id, value, name) {
  const [kind] = id.split(':');
  if (kind === 'reps') return `שיא חדש ${pre('ב', name)}: ${plural(value, 'חזרה אחת', 'חזרות')} בסט`;
  if (kind === 'w') return `שיא חדש ${pre('ב', name)}: ${trim(value, 1)} ק״ג`;
  if (kind === 'sec') return `שיא חדש ${pre('ב', name)}: ${plural(value, 'שנייה אחת', 'שניות')}`;
  if (id === 'ride') return `שיא חדש ברכיבה: ${trim(value, 1)} ק״מ`;
  if (id === 'steps') return `שיא חדש בצעדים: ${int(value)} צעדים ביום`;
  if (id === 'climbs') return `שיא חדש במדרגות: ${plural(value, 'קומה אחת', 'קומות')} ביום`;
  return `שיא אישי חדש: ${trim(value, 1)}`;
}

/** "50 דקות" / "1:10 שעות" */
const mk = (scope) => (id, text, kind, priority, cat) => ({ id, text, kind, priority, scope, cat });
const day = mk('day');
const week = mk('week');

/** Best values of one exercise entry: { reps, weight, sec } (0 when absent). */
function entryBest(ex, entry) {
  if (!entry) return { reps: 0, weight: 0, sec: 0 };
  if (ex.type === 'setsReps') {
    const done = (entry.sets || []).filter((s) => s.done);
    return { reps: Math.max(0, ...done.map((s) => s.reps || 0)), weight: Math.max(0, ...done.map((s) => s.weight || 0)), sec: 0 };
  }
  if (ex.type === 'timed') return { reps: 0, weight: entry.seconds > 0 ? entry.weight || 0 : 0, sec: entry.seconds || 0 };
  return { reps: entry.reps || 0, weight: entry.reps > 0 ? entry.weight || 0 : 0, sec: 0 };
}

/** Strength score of a day for progression: reps × weight (or reps), or hold seconds. */
function strengthScore(ex, entry) {
  if (!entry) return 0;
  if (ex.type === 'timed') return entry.seconds || 0;
  const sets = ex.type === 'setsReps' ? (entry.sets || []).filter((s) => s.done) : entry.reps ? [{ reps: entry.reps, weight: entry.weight }] : [];
  return Math.max(0, ...sets.map((s) => (s.reps || 0) * (s.weight || 1)));
}

/* ---------- day scope ---------- */

export function dayInsights(k) {
  const st = settings();
  const d = getDay(k);
  const out = [];
  const food = d.food || [];
  const total = food.reduce((a, f) => a + (Number(f.kcal) || 0), 0);

  // 1. Calories vs the average of the previous 7 days with food (min 4 such days)
  if (food.length) {
    const prev = [];
    for (let i = 1; i <= 7; i++) if (hasFood(addDays(k, -i))) prev.push(foodTotals(addDays(k, -i)).kcal);
    if (prev.length >= 4) {
      const diff = total - avg(prev);
      if (Math.abs(diff) >= 300) {
        out.push(diff > 0
          ? day('kcalAvg', `היום אכלת ${kcalText(diff)} מעל הממוצע השבועי שלך`, 'attention', 70, 'food')
          : day('kcalAvg', `היום אכלת ${kcalText(-diff)} פחות מהממוצע השבועי שלך`, 'neutral', 55, 'food'));
      }
    }
  }

  // 2. Biggest calorie item (≥ 30% of the day, at least 2 items)
  if (food.length >= 2 && total > 0) {
    const by = new Map();
    for (const f of food) by.set(f.name, (by.get(f.name) || 0) + (Number(f.kcal) || 0));
    const [name, kcal] = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
    const pct = Math.round((kcal / total) * 100);
    if (by.size >= 2 && pct >= 30) out.push(day('bigItem', `${pct}% מהקלוריות של היום הגיעו ${pre('מ', name)}`, 'neutral', 50, 'food'));
  }

  // 3. Calories from low-protein foods (< 5 g protein per 100 kcal), ≥ 25% of the day
  if (total > 0) {
    const low = food.filter((f) => f.kcal > 0 && (f.protein / f.kcal) * 100 < 5).reduce((a, f) => a + f.kcal, 0);
    if (low / total >= 0.25) out.push(day('lowProtein', `${kcalText(low)} היום הגיעו ממזונות דלי חלבון`, 'attention', 60, 'food'));
  }

  // 4. Late eating: share of timed kcal after 20:00, ≥ 35%
  const timed = food.filter((f) => f.time);
  const timedKcal = timed.reduce((a, f) => a + (Number(f.kcal) || 0), 0);
  if (timedKcal > 0) {
    const late = timed.filter((f) => f.time >= '20:00').reduce((a, f) => a + (Number(f.kcal) || 0), 0);
    const pct = Math.round((late / timedKcal) * 100);
    if (pct >= 35) out.push(day('late', `${pct}% מהקלוריות היום נאכלו אחרי 20:00`, 'neutral', 45, 'food'));
  }

  // 5. Protein target met / missed
  if (food.length && st.proteinTarget) {
    const p = Math.round(foodTotals(k).protein);
    out.push(p >= st.proteinTarget
      ? day('protein', `עמדת ביעד החלבון: ${int(p)} מתוך ${int(st.proteinTarget)} גרם`, 'positive', 65, 'food')
      : day('protein', `חסרים ${int(st.proteinTarget - p)} גרם חלבון ליעד היומי`, 'attention', 62, 'food'));
  }

  // 6 + 7. Personal records: new today, or within 10% of one
  const { records, events } = computeRecords();
  for (const e of events.filter((ev) => ev.date === k)) {
    const exName = e.id.includes(':') ? exerciseById(e.id.split(':')[1])?.name || '' : '';
    out.push(day(`newRecord:${e.id}`, recordText(e.id, e.value, exName), 'positive', 90, e.id.includes(':') ? 'strength' : 'activity'));
  }
  const newIds = new Set(events.filter((ev) => ev.date === k).map((ev) => ev.id));
  for (const ex of exercisesForDay(k)) {
    const b = entryBest(ex, d.exercises[ex.id]);
    const check = (key, val, txt) => {
      const rec = records.find((r) => r.id === `${key}:${ex.id}`);
      if (!rec || !val || newIds.has(rec.id) || val >= rec.value || val < rec.value * 0.9) return;
      out.push(day(`nearRecord:${key}:${ex.id}`, txt(rec.value - val), 'positive', 58, 'strength'));
    };
    check('reps', b.reps, (n) => `עוד ${plural(n, 'חזרה אחת', 'חזרות')} לשיא שלך ${pre('ב', ex.name)}`);
    check('w', b.weight, (n) => `עוד ${trim(n, 1)} ק״ג לשיא המשקל שלך ${pre('ב', ex.name)}`);
    check('sec', b.sec, (n) => `עוד ${plural(n, 'שנייה אחת', 'שניות')} לשיא שלך ${pre('ב', ex.name)}`);
  }

  // 8. Total sleep (night + naps) vs target, and vs the previous 7 days' average (min 3 days, diff ≥ 45 min)
  if (hasSleep(d)) {
    const m = totalSleepMinutes(d);
    const target = (st.sleepTarget || 8) * 60;
    const when = napsMinutes(d) ? 'היום' : 'הלילה'; // with naps the total is not just "last night"
    out.push(m >= target
      ? day('sleep', `ישנת ${fmtDuration(m)} שעות ${when} ועמדת ביעד השינה`, 'positive', 52, 'sleep')
      : day('sleep', `ישנת ${fmtDuration(m)} שעות ${when}, ${durText(target - m)} פחות מהיעד`, 'attention', 54, 'sleep'));
    const prev = [];
    for (let i = 1; i <= 7; i++) {
      const pd = days()[addDays(k, -i)];
      if (hasSleep(pd)) prev.push(totalSleepMinutes(pd));
    }
    if (prev.length >= 3) {
      const diff = m - avg(prev);
      if (Math.abs(diff) >= 45) {
        out.push(day('sleepAvg', `ישנת ${durText(Math.abs(diff))} ${diff > 0 ? 'יותר' : 'פחות'} מהממוצע השבועי שלך`, 'neutral', 48, 'sleep'));
      }
    }
  }

  // 9. Daily targets met (all → one celebratory insight; 2+ → list them)
  const targets = [];
  const all = [];
  const add = (label, tracked, met) => { if (tracked) { all.push(label); if (met) targets.push(label); } };
  add('צעדים', st.stepsTarget, (d.steps || 0) >= st.stepsTarget);
  add('מדרגות', floorsTarget(st), floorsOf(d) >= floorsTarget(st));
  add('חלבון', st.proteinTarget, foodTotals(k).protein >= st.proteinTarget);
  add('מים', st.waterTarget, waterMl(d) >= st.waterTarget);
  const c = dayCompletion(k);
  add('תרגילים', c.total > 0, c.total > 0 && c.done === c.total);
  if (targets.length === all.length && targets.length >= 3) {
    out.push(day('allTargets', `עמדת בכל היעדים היומיים: ${joinHe(targets)}`, 'positive', 85, 'consistency'));
  } else if (targets.length >= 2) {
    out.push(day('targets', `עמדת היום ביעדים: ${joinHe(targets)}`, 'positive', 40, 'consistency'));
  }

  return sortInsights(out);
}

/* ---------- week scope ---------- */

export function weekInsights(today = todayKey()) {
  const st = settings();
  const cur = lastNDays(7, today);
  const prev = lastNDays(7, addDays(today, -7));
  const out = [];

  // 1. Week-over-week changes (both weeks ≥ 4 data days, |change| ≥ 10%)
  const metrics = [
    { id: 'steps', cat: 'activity', has: (d) => d.steps > 0, val: (k, d) => d.steps, agg: 'avg', name: 'ממוצע הצעדים היומי', good: true },
    { id: 'climbs', cat: 'activity', has: (d) => floorsOf(d) > 0, val: (k, d) => floorsOf(d), agg: 'sum', name: 'מספר הקומות במדרגות', good: true },
    { id: 'ride', cat: 'activity', has: (d) => d.rides.length > 0, val: (k, d) => d.rides.reduce((a, r) => a + (Number(r.km) || 0), 0), agg: 'sum', name: 'מרחק הרכיבה', good: true },
    { id: 'protein', cat: 'food', has: (d) => d.food.length > 0, val: (k) => foodTotals(k).protein, agg: 'avg', name: 'ממוצע החלבון היומי', good: true },
    { id: 'kcal', cat: 'food', has: (d) => d.food.length > 0, val: (k) => foodTotals(k).kcal, agg: 'avg', name: 'ממוצע הקלוריות היומי', good: null },
    { id: 'completion', cat: 'strength', has: (d, k) => !d.rest && dayCompletion(k).total > 0 && Object.keys(d.exercises || {}).length > 0, val: (k) => dayCompletion(k).fraction, agg: 'avg', name: 'אחוז השלמת האימונים', good: true },
    { id: 'sleep', cat: 'sleep', has: (d) => hasSleep(d), val: (k, d) => totalSleepMinutes(d), agg: 'avg', name: 'ממוצע השינה', good: true },
    { id: 'water', cat: 'food', has: (d) => waterMl(d) > 0, val: (k, d) => waterMl(d), agg: 'avg', name: 'ממוצע המים היומי', good: true },
    { id: 'breath', cat: 'breath', has: (d) => breathMinutes(d) > 0, val: (k, d) => breathMinutes(d), agg: 'sum', name: 'דקות הנשימה', good: true },
  ];
  for (const m of metrics) {
    const series = (keys) => keys.filter((k) => days()[k] && m.has(days()[k], k)).map((k) => m.val(k, days()[k]));
    const a = series(cur), b = series(prev);
    if (a.length < 4 || b.length < 4) continue;
    const va = m.agg === 'sum' ? a.reduce((x, y) => x + y, 0) : avg(a);
    const vb = m.agg === 'sum' ? b.reduce((x, y) => x + y, 0) : avg(b);
    if (!vb) continue;
    const raw = ((va - vb) / vb) * 100;
    const pct = Math.round(Math.abs(raw)) * Math.sign(raw); // round the magnitude (symmetric)
    if (Math.abs(pct) < 10) continue;
    const up = pct > 0;
    const kind = m.good === null ? 'neutral' : up ? 'positive' : 'attention';
    const base = kind === 'positive' ? 60 : kind === 'attention' ? 55 : 45;
    // Percent-of-a-percent and percent-of-hours read badly — show the actual values for those.
    const text = m.id === 'completion'
      ? `השלמת האימונים ${up ? 'עלתה' : 'ירדה'} מ-${Math.round(vb * 100)}% ל-${Math.round(va * 100)}% לעומת השבוע הקודם`
      : m.id === 'breath'
        ? `השבוע נשמת ${int(va)} דקות, ${Math.abs(pct)}% ${up ? 'יותר' : 'פחות'} משבוע שעבר`
      : m.id === 'climbs'
        ? `השבוע עלית ${int(va)} קומות, ${Math.abs(pct)}% ${up ? 'יותר' : 'פחות'} משבוע שעבר`
      : m.id === 'sleep'
        ? `ממוצע השינה ${up ? 'עלה' : 'ירד'} מ-${fmtDuration(vb)} ל-${fmtDuration(va)} שעות לעומת השבוע הקודם`
        : `${m.name} ${up ? 'עלה' : 'ירד'} ב-${Math.abs(pct)}% לעומת השבוע הקודם`;
    out.push(week(`wow:${m.id}`, text, kind, base + Math.min(15, Math.round(Math.abs(pct) / 10)), m.cat));
  }

  // Breathing → that night's sleep (all history, ≥ 5 nights per group, |diff| ≥ 20 min). Factual, no claims.
  const bs = sleepAfterBreathing();
  if (bs && Math.abs(bs.diff) >= 20) {
    out.push(week('breathSleep', `בלילות שאחרי יום עם נשימה ישנת בממוצע ${durText(Math.abs(bs.diff))} ${bs.diff > 0 ? 'יותר' : 'פחות'} מאשר אחרי יום בלי נשימה`, 'neutral', 52, 'breath'));
  }

  // 2 + 3. Night sleep (naps excluded) → next-day calories / same-day workout completion (all history, ≥ 3 days per group)
  const groups = { short: [], good: [] };
  for (const [k, d] of Object.entries(days())) {
    if (!d.sleep) continue;
    const m = sleepMinutes(d.sleep);
    if (m < 360) groups.short.push(k);
    else if (m >= 420) groups.good.push(k);
  }
  const kcalOf = (keys) => keys.filter(hasFood).map((k) => foodTotals(k).kcal);
  const ks = kcalOf(groups.short), kg = kcalOf(groups.good);
  if (ks.length >= 3 && kg.length >= 3) {
    const diff = avg(ks) - avg(kg);
    if (Math.abs(diff) >= 200) {
      out.push(diff > 0
        ? week('sleepKcal', `בימים שאחרי לילה של פחות מ-6 שעות שינה אכלת בממוצע ${kcalText(diff)} יותר`, 'attention', 68, 'sleep')
        : week('sleepKcal', `בימים שאחרי לילה של פחות מ-6 שעות שינה אכלת בממוצע ${kcalText(-diff)} פחות`, 'neutral', 50, 'sleep'));
    }
  }
  const compOf = (keys) => keys.filter((k) => !days()[k].rest && dayCompletion(k).total > 0).map((k) => dayCompletion(k).fraction * 100);
  const cs = compOf(groups.short), cg = compOf(groups.good);
  if (cs.length >= 3 && cg.length >= 3) {
    const a = Math.round(avg(cg)), b = Math.round(avg(cs));
    if (Math.abs(a - b) >= 15) {
      out.push(week('sleepWorkout', `אחרי 7 שעות שינה ומעלה השלמת בממוצע ${a}% מהאימון, לעומת ${b}% אחרי פחות מ-6 שעות`,
        a > b ? 'positive' : 'neutral', a > b ? 66 : 48, 'sleep'));
    }
  }

  // 4. Weakest weekday for protein (last 28 days, ≥ 2 points per weekday, ≥ 20 g below average)
  const last28 = lastNDays(28, today).filter(hasFood);
  if (last28.length) {
    const byWd = new Map();
    for (const k of last28) {
      const wd = parseKey(k).getDay();
      if (!byWd.has(wd)) byWd.set(wd, { k, vals: [] });
      byWd.get(wd).vals.push(foodTotals(k).protein);
    }
    const overall = avg(last28.map((k) => foodTotals(k).protein));
    const cands = [...byWd.values()].filter((w) => w.vals.length >= 2).map((w) => ({ k: w.k, v: avg(w.vals) }));
    if (cands.length >= 2) {
      const min = cands.sort((a, b) => a.v - b.v)[0];
      const gap = Math.round(overall - min.v);
      if (gap >= 20) out.push(week('weakDay', `ימי ${weekdayName(min.k)} הם הימים עם הכי מעט חלבון: ${int(gap)} גרם פחות מהממוצע שלך`, 'attention', 50, 'food'));
    }
  }

  // 5. Top calorie sources of the week + low-protein-density foods ≥ 10% of the week
  const weekFoodDays = cur.filter(hasFood);
  if (weekFoodDays.length >= 3) {
    const by = new Map();
    let weekKcal = 0;
    for (const k of weekFoodDays) {
      for (const f of days()[k].food) {
        const e = by.get(f.name) || { kcal: 0, protein: 0 };
        e.kcal += Number(f.kcal) || 0;
        e.protein += Number(f.protein) || 0;
        by.set(f.name, e);
        weekKcal += Number(f.kcal) || 0;
      }
    }
    const top = [...by.entries()].sort((a, b) => b[1].kcal - a[1].kcal).slice(0, 3);
    if (top.length >= 2) {
      out.push(week('topSources', `מקורות הקלוריות הגדולים השבוע: ${joinHe(top.map(([n, e]) => `${n} (${kcalText(e.kcal)})`))}`, 'neutral', 40, 'food'));
    }
    for (const [name, e] of by) {
      const share = weekKcal ? e.kcal / weekKcal : 0;
      if (e.kcal > 0 && (e.protein / e.kcal) * 100 < 5 && share >= 0.1) {
        out.push(week(`lowDensity:${name}`, `${Math.round(share * 100)}% מהקלוריות של השבוע הגיעו ${pre('מ', name)}, מזון דל חלבון`, 'attention', 52, 'food'));
      }
    }
  }

  // 6. Weight: 7-day average vs the previous 7 days (≥ 2 weigh-ins in each window), change in kg only
  const w = getState().weights;
  const wa = w.filter((x) => x.date >= cur[0] && x.date <= cur[6]).map((x) => x.kg);
  const wb = w.filter((x) => x.date >= prev[0] && x.date <= prev[6]).map((x) => x.kg);
  if (wa.length >= 2 && wb.length >= 2) {
    const diff = Math.round((avg(wa) - avg(wb)) * 10) / 10;
    if (Math.abs(diff) >= 0.1) {
      const toward = st.targetWeight && st.startWeight ? Math.sign(st.targetWeight - st.startWeight) === Math.sign(diff) : false;
      out.push(week('weight', `המשקל הממוצע ${diff < 0 ? 'ירד' : 'עלה'} ב-${trim(Math.abs(diff), 1)} ק״ג לעומת השבוע הקודם`,
        toward ? 'positive' : 'neutral', 64, 'weight'));
    }
  }

  // 7. Exercise progression: best of the last 7 days vs the best of the week 28 days ago (≥ 10%)
  const then = lastNDays(7, addDays(today, -28));
  for (const ex of activeExercises()) {
    const best = (keys) => Math.max(0, ...keys.map((k) => strengthScore(ex, days()[k]?.exercises?.[ex.id])));
    const now = best(cur), old = best(then);
    if (now > 0 && old > 0) {
      const pct = Math.round(((now - old) / old) * 100);
      if (pct >= 10) out.push(week(`progress:${ex.id}`, `שיפור של ${pct}% ${pre('ב', ex.name)} לעומת לפני 4 שבועות`, 'positive', 72, 'strength'));
    }
  }

  // 8. Consistency: days this week each daily target was met (≥ 5 positive, ≤ 2 attention)
  const trackedRecently = (fn) => lastNDays(28, today).some((k) => days()[k] && fn(days()[k], k, true));
  const checks = [
    { id: 'steps', label: 'הצעדים', t: st.stepsTarget, met: (d) => (d.steps || 0) >= st.stepsTarget, used: (d) => d.steps > 0 },
    { id: 'climbs', label: 'המדרגות', t: floorsTarget(st), met: (d) => floorsOf(d) >= floorsTarget(st), used: (d) => d.climbs.length > 0 },
    { id: 'protein', label: 'החלבון', t: st.proteinTarget, met: (d, k) => foodTotals(k).protein >= st.proteinTarget, used: (d) => d.food.length > 0 },
    { id: 'water', label: 'המים', t: st.waterTarget, met: (d) => waterMl(d) >= st.waterTarget, used: (d) => waterMl(d) > 0 },
  ];
  for (const c of checks) {
    if (!c.t || !trackedRecently((d) => c.used(d))) continue;
    const n = cur.filter((k) => days()[k] && c.met(days()[k], k)).length;
    if (n >= 5) {
      out.push(week(`consistency:${c.id}`, `עמדת ביעד ${c.label} ב-${n} מתוך 7 הימים האחרונים`, 'positive', 58, 'consistency'));
    } else if (n <= 2) {
      const txt = n === 0 ? `יעד ${c.label} לא הושג ב-7 הימים האחרונים`
        : n === 1 ? `יעד ${c.label} הושג ביום אחד מתוך 7 הימים האחרונים`
          : `יעד ${c.label} הושג ב-2 מתוך 7 הימים האחרונים`;
      out.push(week(`consistency:${c.id}`, txt, 'attention', 47, 'consistency'));
    }
  }

  // 9. Streak milestones reached this week
  const walk = walkHistory();
  for (const b of BADGES.filter((x) => x.family === 'streak')) {
    const date = walk.earned[b.id];
    if (date && date >= cur[0] && date <= cur[6]) {
      out.push(week(`streak:${b.target}`, `הגעת השבוע לרצף של ${b.target} ימים`, 'positive', 80, 'consistency'));
    }
  }

  return sortInsights(out);
}

/** Highest priority first; ties keep a stable order by id. */
export function sortInsights(list) {
  return [...list].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

