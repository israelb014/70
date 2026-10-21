// Derived values: exercise completion, streak and personal records.
import { getState, getDay, exerciseById, activeExercises } from './storage.js';
import { todayKey, addDays } from './dates.js';

/** Fraction (0..1) of an exercise's target achieved for a day entry. */
export function exerciseProgress(ex, entry) {
  if (!entry) return 0;
  if (ex.type === 'setsReps') {
    const done = (entry.sets || []).filter((s) => s.done).length;
    return Math.min(1, done / Math.max(1, ex.sets || 1));
  }
  if (ex.type === 'timed') {
    const sec = entry.seconds || 0;
    if (!ex.seconds) return sec > 0 ? 1 : 0;
    return Math.min(1, sec / ex.seconds);
  }
  // maxReps: any recorded reps count; with a target, partial credit
  const reps = entry.reps || 0;
  if (reps <= 0) return 0;
  return ex.reps ? Math.min(1, reps / ex.reps) : 1;
}

/** Exercises to show on a given day: active ones, plus archived ones that have data that day. */
export function exercisesForDay(k) {
  const day = getDay(k);
  const list = activeExercises();
  const ids = new Set(list.map((e) => e.id));
  for (const id of Object.keys(day.exercises || {})) {
    const ex = exerciseById(id);
    if (ex && !ids.has(id) && exerciseProgress(ex, day.exercises[id]) > 0) list.push(ex);
  }
  return list;
}

export function dayCompletion(k) {
  const day = getDay(k);
  const list = exercisesForDay(k);
  if (!list.length) return { fraction: 0, done: 0, total: 0 };
  let sum = 0;
  let done = 0;
  for (const ex of list) {
    const p = exerciseProgress(ex, day.exercises[ex.id]);
    sum += p;
    if (p >= 1) done++;
  }
  return { fraction: sum / list.length, done, total: list.length };
}

/**
 * The one completion percentage (partial credit, rounded) shown everywhere:
 * hero ring + number, daily summary.
 */
export function completionPct(k) {
  return Math.round(dayCompletion(k).fraction * 100);
}

/** A day counts for the streak if: rest day, a completed exercise, a ride, or steps target met. */
export function isDayActive(k) {
  const day = getState().days[k];
  if (!day) return false;
  if (day.rest) return true;
  if ((day.rides || []).length) return true;
  const target = getState().settings?.stepsTarget;
  if (target && day.steps >= target) return true;
  return Object.entries(day.exercises || {}).some(([id, entry]) => {
    const ex = exerciseById(id);
    return ex && exerciseProgress(ex, entry) >= 1;
  });
}

/** Consecutive active days ending today (if active) or yesterday. */
export function currentStreak() {
  let k = todayKey();
  if (!isDayActive(k)) k = addDays(k, -1);
  let n = 0;
  while (isDayActive(k) && n < 10000) {
    n++;
    k = addDays(k, -1);
  }
  return n;
}

export function longestRideKm() {
  let max = 0;
  for (const day of Object.values(getState().days)) {
    for (const r of day.rides || []) max = Math.max(max, Number(r.km) || 0);
  }
  return max;
}

/**
 * Walk all days chronologically and track personal records.
 * Returns current records and "events" — days where a previous best was beaten.
 */
export function computeRecords() {
  const state = getState();
  const best = new Map();
  const events = [];
  const consider = (id, label, unit, value, date) => {
    if (!(value > 0)) return;
    const cur = best.get(id);
    if (!cur) {
      best.set(id, { id, label, unit, value, date });
    } else if (value > cur.value) {
      events.push({ id, label, unit, value, date, prev: cur.value });
      best.set(id, { id, label, unit, value, date });
    }
  };

  for (const k of Object.keys(state.days).sort()) {
    const day = state.days[k];
    consider('steps', 'הכי הרבה צעדים ביום', 'צעדים', day.steps || 0, k);
    consider('climbs', 'הכי הרבה קומות ביום', 'קומות', floorsOf(day), k);
    const ride = Math.max(0, ...(day.rides || []).map((r) => Number(r.km) || 0));
    consider('ride', 'הרכיבה הארוכה ביותר', 'ק״מ', ride, k);

    for (const [id, entry] of Object.entries(day.exercises || {})) {
      const ex = exerciseById(id);
      if (!ex || !entry) continue;
      if (ex.type === 'setsReps') {
        const done = (entry.sets || []).filter((s) => s.done);
        consider(`reps:${id}`, `${ex.name} · חזרות בסט`, 'חזרות', Math.max(0, ...done.map((s) => s.reps || 0)), k);
        consider(`w:${id}`, `${ex.name} · משקל`, 'ק״ג', Math.max(0, ...done.map((s) => s.weight || 0)), k);
      } else if (ex.type === 'timed') {
        consider(`sec:${id}`, `${ex.name} · החזקה`, 'שניות', entry.seconds || 0, k);
        if (entry.seconds > 0) consider(`w:${id}`, `${ex.name} · משקל`, 'ק״ג', entry.weight || 0, k);
      } else {
        consider(`reps:${id}`, `${ex.name} · חזרות בסט`, 'חזרות', entry.reps || 0, k);
        if (entry.reps > 0) consider(`w:${id}`, `${ex.name} · משקל`, 'ק״ג', entry.weight || 0, k);
      }
    }
  }
  return { records: [...best.values()], events };
}

/** Set of record ids that were newly set on day k. */
export function recordIdsOn(k, events = computeRecords().events) {
  return new Set(events.filter((e) => e.date === k).map((e) => e.id));
}

export function foodTotals(k) {
  const food = getDay(k).food || [];
  return {
    kcal: food.reduce((s, f) => s + (Number(f.kcal) || 0), 0),
    protein: food.reduce((s, f) => s + (Number(f.protein) || 0), 0),
  };
}

/**
 * Floors of one climb entry: custom → its own floors; regular / roof → the floors stored when it was
 * logged (as before), falling back to the current settings for entries without them.
 */
export function climbFloors(c, st = getState().settings || {}) {
  if (Number(c?.floors) > 0) return Number(c.floors);
  if (c?.type === 'custom') return 0;
  return Number(c?.type === 'roof' ? st.floorsRoof : st.floorsRegular) || 0;
}

export function floorsOf(day) {
  return (day.climbs || []).reduce((s, c) => s + climbFloors(c), 0);
}

/** Daily stairs target in floors = climbsTarget × floorsRegular (e.g. 6 × 6 = 36). */
export function floorsTarget(st = getState().settings || {}) {
  return (Number(st.climbsTarget) || 0) * (Number(st.floorsRegular) || 0);
}

/**
 * Food entries in display order with their original index: entries without a time first
 * (in insertion order), then chronologically by "HH:MM".
 */
export function sortedFood(day) {
  return (day.food || [])
    .map((f, i) => ({ f, i }))
    .sort((a, b) => (a.f.time ? 1 : 0) - (b.f.time ? 1 : 0) || (a.f.time || '').localeCompare(b.f.time || '') || a.i - b.i);
}

export function waterMl(day) {
  return (day?.water || []).reduce((s, w) => s + (Number(w.ml) || 0), 0);
}
