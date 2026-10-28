// Derived progress: sleep math, heatmap day score, XP / levels and badges.
// Everything here is computed from history on demand — nothing is stored — so editing
// a past day recalculates XP, levels and badge dates automatically.
import { getState, getDay, exerciseById } from './storage.js';
import { todayKey, addDays, lastNDays } from './dates.js';
import { exerciseProgress, dayCompletion, isDayActive, foodTotals, floorsOf, floorsTarget, descentFloorsOf } from './stats.js';
import { plural } from './hebrew.js';
import { breathMinutes, breathGoal } from './breathing.js';

/* ---------- Sleep ---------- */

const toMin = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/** Sleep duration in minutes; handles crossing midnight (bed 23:30 → wake 06:50 = 440). */
export function sleepMinutes(sleep) {
  if (!sleep?.bed || !sleep?.wake) return 0;
  return (toMin(sleep.wake) - toMin(sleep.bed) + 1440) % 1440;
}

/** "7:20" */
export function fmtDuration(min) {
  const m = Math.round(min);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** Average clock time of bedtimes; times after noon count as "the evening before" so 23:00 and 01:00 average to 00:00. */
export function averageBedtime(beds) {
  if (!beds.length) return null;
  const vals = beds.map((t) => {
    const m = toMin(t);
    return m < 12 * 60 ? m + 1440 : m;
  });
  const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) % 1440;
  return `${String(Math.floor(avg / 60)).padStart(2, '0')}:${String(avg % 60).padStart(2, '0')}`;
}

/** "40 דקות" / "שעה אחת" / "2 שעות" / "1:20 שעות" */
export function durText(min) {
  const m = Math.round(min);
  if (m < 60) return plural(m, 'דקה אחת', 'דקות');
  if (m % 60 === 0) return plural(m / 60, 'שעה אחת', 'שעות');
  return `${fmtDuration(m)} שעות`;
}

/* Naps: days[k].naps = [{ start, end }] within one calendar day (end > start, no midnight crossing). */
export const napMinutes = (n) => toMin(n.end) - toMin(n.start);
export const napsMinutes = (day) => (day?.naps || []).reduce((a, n) => a + napMinutes(n), 0);
/** Night sleep + naps. */
export const totalSleepMinutes = (day) => sleepMinutes(day?.sleep) + napsMinutes(day);
/** Night sleep or at least one nap logged. */
export const hasSleep = (day) => !!day?.sleep || !!day?.naps?.length;
/** Naps with their stored index, sorted by start time. */
export const sortedNaps = (day) => (day?.naps || []).map((n, i) => ({ n, i })).sort((a, b) => a.n.start.localeCompare(b.n.start));

/** Most recent nap in history (latest day, latest start), for prefilling the nap sheet. */
export function lastNap() {
  const days = getState().days;
  const k = Object.keys(days).filter((d) => days[d].naps?.length).sort().pop();
  return k ? sortedNaps(days[k]).pop().n : null;
}

/**
 * Validation for a nap on day k (Hebrew message, or null when valid). `skip` = index being edited.
 * Night sleep of day k ends on k (wake); the next day's night starts on k when it crosses midnight.
 */
export function napError(k, nap, skip = -1) {
  const s = toMin(nap.start), e = toMin(nap.end);
  if (e < s) return 'תנומה לא יכולה לעבור את חצות';
  if (e - s < 5) return 'תנומה קצרה מדי';
  const day = getDay(k);
  if ((day.naps || []).some((n, i) => i !== skip && s < toMin(n.end) && toMin(n.start) < e)) return 'חופף לתנומה אחרת';
  if (day.sleep && s < toMin(day.sleep.wake)) return 'חופף לשינת הלילה';
  const next = getState().days[addDays(k, 1)]?.sleep;
  if (next && toMin(next.bed) > toMin(next.wake) && e > toMin(next.bed)) return 'חופף לשינת הלילה';
  return null;
}

export function sleepTargetMet(day, settings) {
  return hasSleep(day) && totalSleepMinutes(day) >= (settings.sleepTarget || 8) * 60;
}

/** Most recently logged sleep (for prefilling the pickers). */
export function lastSleep() {
  const days = getState().days;
  const k = Object.keys(days).filter((d) => days[d].sleep).sort().pop();
  return k ? days[k].sleep : null;
}

/* ---------- Heatmap score ---------- */

/** 0..1 = average of exercise completion, steps, stairs floors and protein vs targets (each capped at 1). */
export function dayScore(k) {
  const day = getState().days[k];
  if (!day) return 0;
  const st = getState().settings;
  const part = (v, t) => (t > 0 ? Math.min(1, (v || 0) / t) : 0);
  const parts = [
    dayCompletion(k).fraction,
    part(day.steps, st.stepsTarget),
    part(floorsOf(day), floorsTarget(st)),
    part(foodTotals(k).protein, st.proteinTarget),
  ];
  return parts.reduce((a, b) => a + b, 0) / 4;
}

/* ---------- XP ---------- */

export function dayXP(k) {
  const day = getState().days[k];
  if (!day) return 0;
  const st = getState().settings;
  let xp = 0;
  for (const [id, entry] of Object.entries(day.exercises || {})) {
    const ex = exerciseById(id);
    if (!ex || !entry) continue;
    if (ex.type === 'setsReps') xp += 2 * (entry.sets || []).filter((s) => s.done).length;
    else if (ex.type === 'timed') xp += exerciseProgress(ex, entry) >= 1 ? 5 : 0;
    else xp += entry.reps > 0 ? 3 : 0;
  }
  xp += Math.floor((day.steps || 0) / 1000);
  xp += Math.floor(floorsOf(day) / 2); // 1 XP per 2 floors per day (regular 6 = 3, roof 10 = 5)
  xp += Math.floor(descentFloorsOf(day) / 6); // descents: 1 XP per 6 floors per day
  for (const r of day.rides || []) xp += 2 * Math.floor(Number(r.km) || 0);
  if (st.proteinTarget && foodTotals(k).protein >= st.proteinTarget) xp += 10;
  const comp = dayCompletion(k);
  if (comp.total > 0 && comp.done === comp.total) xp += 20;
  if (hasSleep(day)) xp += 2; // once per day, night or naps
  xp += Math.min(15, breathMinutes(day)); // breathing: 1 XP per minute, max 15 a day
  return xp;
}

/** XP for a date range [from, to] (inclusive), including weigh-ins (5 XP each). */
export function xpBetween(from, to) {
  let xp = 0;
  for (const k of Object.keys(getState().days)) if (k >= from && k <= to) xp += dayXP(k);
  xp += 5 * getState().weights.filter((w) => w.date >= from && w.date <= to).length;
  return xp;
}

export function totalXP() {
  return xpBetween('0000-00-00', '9999-12-31');
}

export function weekXP() {
  const keys = lastNDays(7);
  return xpBetween(keys[0], keys[6]);
}

/** Level n needs 50·n·(n+1) total XP to reach level n+1 (level 1 starts at 0). */
export const xpForLevel = (n) => 50 * (n - 1) * n;

export function levelInfo(xp = totalXP()) {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, xp, base, next, toNext: next - xp, frac: (xp - base) / (next - base) };
}

/* ---------- Badges ---------- */

// metric: key of a running maximum computed day by day in walkHistory()
export const BADGES = [
  { id: 'first', family: 'first', tier: '1', name: 'אימון ראשון', desc: 'היום הראשון עם תרגיל שהושלם.', metric: 'workoutDays', target: 1 },
  ...[7, 14, 30, 60, 100].map((n) => ({
    id: `streak${n}`, family: 'streak', tier: String(n), name: `רצף ${n}`, desc: `${n} ימי פעילות ברצף (ימי מנוחה נספרים).`, metric: 'streak', target: n,
  })),
  ...[5, 10, 15, 20, 25, 30].map((n) => ({
    id: `kg${n}`, family: 'weight', tier: String(n), name: `${n} ק״ג ירדו`, desc: `ירידה של ${n} ק״ג מהמשקל ההתחלתי (לפי השקילה הנמוכה ביותר).`, metric: 'kgLost', target: n, unit: 'ק״ג',
  })),
  ...[30, 45, 60].map((n) => ({
    id: `ride${n}`, family: 'ride', tier: String(n), name: `רכיבת ${n}`, desc: `רכיבה אחת של לפחות ${n} ק״מ.`, metric: 'rideMax', target: n, unit: 'ק״מ',
  })),
  ...[100, 500, 1000].map((n) => ({
    id: `climbs${n}`, family: 'climbs', tier: n >= 1000 ? '1K' : String(n), name: `${n.toLocaleString('he-IL')} עליות`, desc: `שווה ערך ל-${n.toLocaleString('he-IL')} עליות של ${getState().settings?.floorsRegular || 6} קומות (סך הקומות ÷ קומות בעלייה רגילה).`, metric: 'climbsTotal', target: n,
  })),
  { id: 'steps1m', family: 'steps', tier: '1M', name: 'מיליון צעדים', desc: 'מיליון צעדים בסך הכול.', metric: 'stepsTotal', target: 1000000 },
  ...[30, 40, 50].map((n) => ({
    id: `pushups${n}`, family: 'pushups', tier: String(n), name: `${n} שכיבות`, desc: `${n} חזרות בסט אחד של תרגיל ששמו כולל "שכיבות".`, metric: 'pushupMax', target: n,
  })),
  ...[90, 120].map((n) => ({
    id: `plank${n}`, family: 'plank', tier: String(n), name: `פלאנק ${n}`, desc: `החזקה של ${n} שניות בתרגיל ששמו כולל "פלאנק".`, metric: 'plankMax', target: n, unit: 'שנ׳',
  })),
  { id: 'proteinWeek', family: 'protein', tier: '7', name: 'שבוע חלבון', desc: 'עמידה ביעד החלבון 7 ימים ברצף.', metric: 'proteinStreak', target: 7 },
  { id: 'breath1', family: 'breathFirst', tier: '1', name: 'נשימה ראשונה', desc: 'סשן נשימה ראשון.', metric: 'breathSessions', target: 1 },
  { id: 'breathStreak7', family: 'breathStreak', tier: '7', name: 'רצף נשימה 7', desc: '7 ימים ברצף עם לפחות סשן נשימה אחד.', metric: 'breathStreak', target: 7 },
  { id: 'breath100', family: 'breathTotal', tier: '100', name: '100 דקות נשימה', desc: '100 דקות נשימה בסך הכול.', metric: 'breathTotal', target: 100 },
  { id: 'breathGoal7', family: 'breathGoal', tier: '7', name: 'יעד נשימה שבוע', desc: 'עמידה ביעד הנשימה היומי 7 ימים ברצף.', metric: 'breathGoalStreak', target: 7 },
  { id: 'sleepWeek', family: 'sleep', tier: '7', name: 'ישן כמו שצריך', desc: 'עמידה ביעד השינה 7 לילות ברצף.', metric: 'sleepStreak', target: 7 },
];

/**
 * Walk every calendar day from the first record to today, tracking running maxima.
 * Returns the final metrics, the earned date of each badge, and the longest activity streak.
 */
export function walkHistory() {
  const state = getState();
  const st = state.settings;
  const dayKeys = Object.keys(state.days).sort();
  const weights = [...state.weights].sort((a, b) => a.date.localeCompare(b.date));
  const first = [dayKeys[0], weights[0]?.date].filter(Boolean).sort()[0];
  const m = {
    workoutDays: 0, streak: 0, kgLost: 0, rideMax: 0, climbsTotal: 0, stepsTotal: 0,
    pushupMax: 0, plankMax: 0, proteinStreak: 0, sleepStreak: 0,
    breathSessions: 0, breathStreak: 0, breathTotal: 0, breathGoalStreak: 0,
  };
  const earned = {};
  if (!first) return { metrics: m, earned, longestStreak: 0 };

  let breathRun = 0, breathGoalRun = 0;
  let run = 0, proteinRun = 0, sleepRun = 0, wi = 0, minKg = Infinity, floorsTotal = 0, legacyClimbs = 0;
  const seen = new Set(state.meta?.seenBadges || []);
  const end = todayKey();
  for (let k = first; k <= end; k = addDays(k, 1)) {
    const day = state.days[k];
    // Streak (today not yet active doesn't break it, but it can't extend it either)
    run = isDayActive(k) ? run + 1 : 0;
    m.streak = Math.max(m.streak, run);
    if (day) {
      const anyDone = Object.entries(day.exercises || {}).some(([id, e]) => {
        const ex = exerciseById(id);
        return ex && exerciseProgress(ex, e) >= 1;
      });
      if (anyDone) m.workoutDays++;
      for (const r of day.rides || []) m.rideMax = Math.max(m.rideMax, Number(r.km) || 0);
      // Climb-equivalents: total floors ÷ floorsRegular (rounded down); legacy entry count kept so
      // badges earned under the old rule stay earned.
      floorsTotal += floorsOf(day);
      m.climbsTotal = Math.floor(floorsTotal / (Number(state.settings?.floorsRegular) || 6));
      legacyClimbs += (day.climbs || []).filter((c) => c.type !== 'custom').length;
      m.stepsTotal += day.steps || 0;
      for (const [id, e] of Object.entries(day.exercises || {})) {
        const ex = exerciseById(id);
        if (!ex || !e) continue;
        if (ex.name.includes('שכיבות')) {
          const reps = ex.type === 'setsReps'
            ? Math.max(0, ...(e.sets || []).filter((s) => s.done).map((s) => s.reps || 0))
            : ex.type === 'maxReps' ? e.reps || 0 : 0;
          m.pushupMax = Math.max(m.pushupMax, reps);
        }
        if (ex.type === 'timed' && ex.name.includes('פלאנק')) m.plankMax = Math.max(m.plankMax, e.seconds || 0);
      }
    }
    proteinRun = st.proteinTarget && day && foodTotals(k).protein >= st.proteinTarget ? proteinRun + 1 : 0;
    m.proteinStreak = Math.max(m.proteinStreak, proteinRun);
    const bm = breathMinutes(day);
    m.breathSessions += (day?.breathing || []).length;
    m.breathTotal += bm;
    breathRun = bm > 0 ? breathRun + 1 : 0;
    m.breathStreak = Math.max(m.breathStreak, breathRun);
    breathGoalRun = bm >= breathGoal(st) ? breathGoalRun + 1 : 0;
    m.breathGoalStreak = Math.max(m.breathGoalStreak, breathGoalRun);
    sleepRun = sleepTargetMet(day, st) ? sleepRun + 1 : 0;
    m.sleepStreak = Math.max(m.sleepStreak, sleepRun);
    while (wi < weights.length && weights[wi].date <= k) minKg = Math.min(minKg, weights[wi++].kg);
    if (minKg < Infinity && st.startWeight) m.kgLost = Math.max(m.kgLost, Math.round((st.startWeight - minKg) * 10) / 10);

    for (const b of BADGES) {
      if (earned[b.id]) continue;
      // Climb badges already shown under the old rule (entry count) stay earned on their original date.
      if (m[b.metric] >= b.target || (b.family === 'climbs' && seen.has(b.id) && legacyClimbs >= b.target)) earned[b.id] = k;
    }
  }
  for (const b of BADGES) if (b.family === 'climbs' && seen.has(b.id) && !earned[b.id]) earned[b.id] = end;
  return { metrics: m, earned, longestStreak: m.streak };
}

/** All badges with state: { ...badge, earned (date|null), value, frac }. */
export function badgeStates(walk = walkHistory()) {
  return BADGES.map((b) => {
    const value = walk.metrics[b.metric];
    return { ...b, earned: walk.earned[b.id] || null, value, frac: Math.min(1, value / b.target) };
  });
}
