// Workout rotation ("סבב אימונים"): 2–4 workout days in order; each date gets a day type.
// settings.rotation = { mode: 'all' | 'rotation', startDate, days: [{ id, name, subtitle }] }
// exercise.days = ['all'] | [dayId, …] (missing = all); days[date].workoutDay = dayId (optional manual choice).
import { getState, getDay, stateVersion } from './storage.js';
import { exerciseProgress } from './stats.js';
import { exerciseById } from './storage.js';
import { isPaused } from './pause.js';

export const DAY_NAMES = ['יום א׳', 'יום ב׳', 'יום ג׳', 'יום ד׳'];
export const MIN_DAYS = 2, MAX_DAYS = 4;

/** Smart coach ("מאמן חכם"): on unless turned off (it replaces the manual rotation while on). */
export const coachOn = () => !!getState().settings && getState().settings.coach?.enabled !== false;

/** The active rotation, or null in "כל התרגילים כל יום" mode (and while the smart coach is on). */
export function rotation() {
  if (coachOn()) return null;
  const r = getState().settings?.rotation;
  return r && r.mode === 'rotation' && Array.isArray(r.days) && r.days.length >= MIN_DAYS && r.startDate ? r : null;
}

export const exDays = (ex) => (Array.isArray(ex?.days) && ex.days.length ? ex.days : ['all']);
/** Does an exercise belong to a day type (null type = old behavior: every exercise)? */
export const belongs = (ex, type) => !type || exDays(ex).includes('all') || exDays(ex).includes(type);

export const rotationDay = (id) => rotation()?.days.find((d) => d.id === id) || null;
/** "יום א׳ · ידיים וגוף עליון" */
export const dayLabel = (d) => (d ? (d.subtitle ? `${d.name} · ${d.subtitle}` : d.name) : '');

/** Exercises with anything logged on day k. */
function loggedIds(k) {
  const day = getDay(k);
  return Object.entries(day.exercises || {})
    .filter(([id, entry]) => { const ex = exerciseById(id); return ex && exerciseProgress(ex, entry) > 0; })
    .map(([id]) => id);
}
export const hasWorkout = (k) => loggedIds(k).length > 0;

/**
 * Type implied by what was logged: only exercises of exactly one day type count ("כל יום" and
 * multi-day exercises say nothing). The type with the most such exercises wins; a tie decides nothing.
 */
function loggedType(k, r) {
  const counts = new Map();
  for (const id of loggedIds(k)) {
    const d = exDays(exerciseById(id));
    if (d.length === 1 && d[0] !== 'all' && r.days.some((x) => x.id === d[0])) counts.set(d[0], (counts.get(d[0]) || 0) + 1);
  }
  const sorted = [...counts].sort((a, b) => b[1] - a[1]);
  if (!sorted.length || (sorted[1] && sorted[1][1] === sorted[0][1])) return null;
  return sorted[0][0];
}

const manualType = (k, r) => {
  const id = getState().days[k]?.workoutDay;
  return id && r.days.some((d) => d.id === id) ? id : null;
};

const nextOf = (r, type) => {
  const i = r.days.findIndex((d) => d.id === type);
  return i < 0 ? r.days[0].id : r.days[(i + 1) % r.days.length].id;
};

// Timeline of workout dates since startDate with their types, rebuilt when the data changes.
let cache = { v: -1, dates: [], types: [] };
function timeline(r) {
  if (cache.v === stateVersion() && cache.r === r) return cache;
  const dates = [], types = [];
  let last = null;
  for (const k of Object.keys(getState().days).filter((x) => x >= r.startDate).sort()) {
    if (!hasWorkout(k) || isPaused(k)) continue; // rest, pause and no-workout days don't advance the rotation
    const t = manualType(k, r) || loggedType(k, r) || (last ? nextOf(r, last) : r.days[0].id);
    dates.push(k);
    types.push(t);
    last = t;
  }
  cache = { v: stateVersion(), r, dates, types };
  return cache;
}

/** Type of the most recent workout date before k (null when none since startDate). */
function lastTypeBefore(k, r) {
  const { dates, types } = timeline(r);
  let lo = 0, hi = dates.length; // first index with date >= k
  while (lo < hi) { const m = (lo + hi) >> 1; if (dates[m] < k) lo = m + 1; else hi = m; }
  return lo ? types[lo - 1] : null;
}

/**
 * Day type of date k: manual choice → what was logged → the day after the last workout's type
 * (wrapping; the first day when there is none). null before startDate or without a rotation.
 */
export function dayTypeOf(k) {
  const r = rotation();
  if (!r || k < r.startDate) return null;
  const m = manualType(k, r);
  if (m) return m;
  if (hasWorkout(k)) {
    const { dates, types } = timeline(r);
    const i = dates.indexOf(k);
    if (i >= 0) return types[i];
  }
  const last = lastTypeBefore(k, r);
  return last ? nextOf(r, last) : r.days[0].id;
}

/** The type after day k's type ("הבא בתור"). */
export function nextTypeAfter(k) {
  const r = rotation();
  const t = dayTypeOf(k);
  return r && t ? nextOf(r, t) : null;
}

/** Workout dates per type in [from, to], and how many workout days there are since startDate. */
export function typeCounts(from, to) {
  const r = rotation();
  if (!r) return null;
  const { dates, types } = timeline(r);
  const counts = new Map(r.days.map((d) => [d.id, 0]));
  dates.forEach((k, i) => { if (k >= from && k <= to && counts.has(types[i])) counts.set(types[i], counts.get(types[i]) + 1); });
  return { counts, total: dates.length, rotation: r };
}
