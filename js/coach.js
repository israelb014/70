// Smart coach ("מאמן חכם"): muscle groups from a built-in exercise library, an automatic upper / legs
// rotation, a morning readiness score, today's plan (day type + intensity + reason) and automatic
// progression. Deterministic rules over the on-device history only.
//
// Data (no schema bump; missing = computed defaults):
//   settings.coach = { enabled, weights: [kg] }      — enabled is true unless set to false
//   exercise.group = 'push' | 'pull' | 'arms' | 'grip' | 'legs' | 'core'   (only when chosen by hand)
//   days[date].plan = { dayType, intensity, score, reason, locked, targets, progress?, override?, undo? }
//     A plan is stored (locked) once a set is logged that day; before that it is computed fresh.
import { getState, getDay, exerciseById, updateDay, stateVersion } from './storage.js';
import { normalizeHe } from './foods.js';
import { exerciseProgress, foodTotals, allForDay } from './stats.js';
import { totalSleepMinutes, hasSleep, fmtDuration } from './progress.js';
import { todayKey, addDays, lastNDays } from './dates.js';
import { coachOn } from './rotation.js';
import { int } from './hebrew.js';

export { coachOn };

/* ---------- Muscle groups ---------- */

export const GROUPS = [
  { id: 'push', name: 'דחיפה' },
  { id: 'pull', name: 'משיכה' },
  { id: 'arms', name: 'ידיים' },
  { id: 'grip', name: 'אחיזה' },
  { id: 'legs', name: 'רגליים' },
  { id: 'core', name: 'בטן' },
];
const GROUP_IDS = GROUPS.map((g) => g.id);
export const groupName = (id) => GROUPS.find((g) => g.id === id)?.name || '';

/** Exercise names and common aliases / spellings per group (matched as whole words after normalization). */
export const LIBRARY = {
  push: ['שכיבות סמיכה', 'שכיבת סמיכה', 'שכיבות שמיכה', 'שכיבה סמיכה', 'פושאפ', 'פוש אפ', 'פושאפים', 'push up', 'pushup', 'push ups', 'pushups',
    'לחיצת חזה', 'לחיצות חזה', 'לחיצה בחזה', 'פרפר', 'bench press', 'לחיצת כתפיים', 'לחיצת כתף', 'לחיצה מעל הראש', 'לחיצה צבאית',
    'הרחקת כתפיים', 'הרחקה לצדדים', 'מקבילים', 'דיפס', 'dips', 'טריצפס', 'טרייספס', 'פשיטת מרפקים', 'פשיטות מרפקים', 'triceps', 'יד אחורית'],
  pull: ['מתח', 'עליות מתח', 'עלייה למתח', 'תליית מתח', 'תלייה במתח', 'תלייה', 'פולאפ', 'פול אפ', 'pull up', 'pullup', 'pull ups', 'pullups',
    'צין אפ', 'chin up', 'חתירה', 'חתירות', 'חתירה במשקולת', 'חתירה בכפיפה', 'row', 'rows', 'פולאובר', 'פול אובר', 'pullover', 'פייס פול', 'face pull'],
  arms: ['כפיפת מרפקים', 'כפיפות מרפקים', 'כפיפת מרפק', 'כפיפות מרפק', 'פטישים', 'פטיש', 'כפיפת פטיש', 'hammer curl', 'בייספס', 'ביספס', 'בייצפס',
    'biceps', 'bicep curl', 'curl', 'curls', 'יד קדמית'],
  grip: ['גריפ', 'גריפר', 'grip', 'gripper', 'מקן', 'מכשיר אחיזה', 'אחיזה', 'מחזק אחיזה', 'מחזק כף יד', 'כף יד', 'אמות', 'אמה', 'forearm', 'forearms', 'פרק כף יד'],
  legs: ['סקוואט', 'סקווט', 'סקוואטים', 'סקווטים', 'squat', 'squats', 'כפיפות ברכיים', 'כפיפת ברכיים', 'מכרעים', 'מכרע', 'לאנגים', 'לאנג', 'לאנגס',
    'lunge', 'lunges', 'דדליפט', 'דד ליפט', 'deadlift', 'הרמה מתה', 'גשר עכוז', 'גשר ישבן', 'גשר אגן', 'glute bridge', 'היפ תראסט', 'hip thrust',
    'עליית עקבים', 'עליות עקבים', 'עלייה על עקבים', 'תאומים', 'calf raise', 'calf raises', 'בולגרי', 'סטפ אפ', 'step up', 'עלייה לספסל', 'סקוואט בולגרי'],
  core: ['פלאנק', 'פלנק', 'plank', 'פלאנק צד', 'פלאנק צידי', 'side plank', 'כפיפות בטן', 'כפיפת בטן', 'בטן', 'קראנץ', 'קראנצים', 'crunch', 'crunches',
    'סיטאפ', 'סיט אפ', 'sit up', 'situp', 'sit ups', 'הרמת רגליים', 'הרמות רגליים', 'leg raise', 'leg raises', 'טוויסט רוסי', 'russian twist',
    'מטפס הרים', 'mountain climber', 'מספריים', 'חתירה בישיבה לבטן', 'סופרמן', 'דד באג', 'dead bug', 'hollow'],
};

const tokens = (s) => normalizeHe(s).split(' ').filter(Boolean);
const LIB = Object.entries(LIBRARY).flatMap(([g, list]) => list.map((a) => ({ g, t: tokens(a), len: normalizeHe(a).length })));

/** Whole-word match of an alias inside a name; the first word may carry a one-letter prefix (ו/ה/ב/ל). */
function hasWords(nameTokens, alias) {
  for (let i = 0; i + alias.length <= nameTokens.length; i++) {
    if (alias.every((w, j) => nameTokens[i + j] === w || (j === 0 && /^[והבל]/.test(nameTokens[i]) && nameTokens[i].slice(1) === w))) return true;
  }
  return false;
}

/** Group of an exercise name from the library (the longest matching alias wins), or null. */
export function matchGroup(name) {
  const t = tokens(name);
  let best = null;
  for (const a of LIB) if (hasWords(t, a.t) && (!best || a.len > best.len)) best = a;
  return best ? best.g : null;
}

/** Group chosen by hand, else from the library, else null (unknown). */
export const groupOf = (ex) => (ex && GROUP_IDS.includes(ex.group) ? ex.group : matchGroup(ex?.name));

/** First active exercise whose group is unknown and that was not skipped (the "לאיזה אזור" card). */
export function unknownExercise() {
  if (!coachOn()) return null;
  const skipped = getState().meta.groupSkip || [];
  return getState().exercises.find((e) => !e.archived && !groupOf(e) && !skipped.includes(e.id)) || null;
}

/* ---------- Rotation ---------- */

export const DAY_TYPES = {
  upper: { id: 'upper', name: 'יום עליון', groups: ['push', 'pull', 'arms', 'grip'] },
  lower: { id: 'lower', name: 'יום רגליים', groups: ['legs', 'core'] },
  full: { id: 'full', name: 'יום גוף מלא', groups: GROUP_IDS },
  recovery: { id: 'recovery', name: 'יום התאוששות', groups: [] },
};
export const INTENSITY = { full: 'מלא', normal: 'רגיל', light: 'קל', recovery: 'התאוששות' };

/** "עליון" (push + pull + arms + grip) and "רגליים ובטן" — or one full-body day when either has fewer than 2 exercises. */
export function coachDays() {
  const active = getState().exercises.filter((e) => !e.archived);
  const count = (d) => active.filter((e) => d.groups.includes(groupOf(e))).length;
  return count(DAY_TYPES.upper) >= 2 && count(DAY_TYPES.lower) >= 2 ? [DAY_TYPES.upper, DAY_TYPES.lower] : [DAY_TYPES.full];
}

/** Logged exercises (anything recorded) on day k. */
const loggedOn = (k) => Object.entries(getDay(k).exercises || {})
  .map(([id, entry]) => ({ ex: exerciseById(id), entry }))
  .filter((x) => x.ex && exerciseProgress(x.ex, x.entry) > 0);
const trainedGroups = (k, groups) => loggedOn(k).some((x) => groups.includes(groupOf(x.ex)));

/** Latest date ≤ k (within 90 days) when any of the groups was trained, or null. */
function lastTrained(k, groups) {
  for (let i = 0; i < 90; i++) {
    const d = addDays(k, -i);
    if (trainedGroups(d, groups)) return d;
  }
  return null;
}

/** Consecutive days with strength work and no rest day, ending the day before k. */
export function trainingStreak(k) {
  let n = 0;
  for (let d = addDays(k, -1); n < 60; d = addDays(d, -1)) {
    if (getDay(d).rest || !loggedOn(d).length) break;
    n++;
  }
  return n;
}

/* ---------- Readiness (0–100) ---------- */

export function readiness(k) {
  const st = getState().settings || {};
  const day = getDay(k);
  const y = addDays(k, -1), yd = getDay(y);
  const target = (st.sleepTarget || 8) * 60;
  const sleepMin = totalSleepMinutes(day);
  const sleep = !hasSleep(day) ? 25 : sleepMin >= target ? 40 : Math.max(0, 40 - 10 * Math.floor((target - sleepMin) / 60));
  const ate = (yd.food || []).length > 0;
  const protein = foodTotals(y).protein;
  const pr = st.proteinTarget ? protein / st.proteinTarget : 0;
  const proteinPts = !ate || !st.proteinTarget ? 10 : pr >= 0.9 ? 20 : pr >= 0.6 ? 10 : 0;
  const logged = lastNDays(14, y).filter((d) => (getDay(d).food || []).length);
  const avg = logged.length ? logged.reduce((a, d) => a + foodTotals(d).kcal, 0) / logged.length : 0;
  const fuel = logged.length < 5 || !ate ? 15 : foodTotals(y).kcal >= 0.7 * avg ? 20 : 5;
  const streak = trainingStreak(k);
  const load = streak <= 2 ? 20 : streak === 3 ? 15 : streak === 4 ? 10 : 0;
  return {
    score: sleep + proteinPts + fuel + load,
    parts: { sleep, protein: proteinPts, fuel, load },
    facts: { slept: hasSleep(day), sleepMin, ate, protein, enoughFood: logged.length >= 5 && ate, streak },
  };
}

const MAX = { sleep: 40, protein: 20, fuel: 20, load: 20 };

/** The main factor, in one short neutral phrase. */
function factorText(r, intensity) {
  const { parts, facts } = r;
  if (intensity === 'full') {
    const good = [];
    if (parts.sleep === 40) good.push('ישנת טוב');
    if (parts.protein === 20) good.push('אכלת מספיק חלבון');
    return good.length ? good.join(' ו') : 'המוכנות שלך גבוהה';
  }
  const worst = Object.keys(MAX).reduce((a, b) => (MAX[b] - parts[b] > MAX[a] - parts[a] ? b : a), 'sleep');
  if (worst === 'sleep') return facts.slept ? `ישנת ${fmtDuration(facts.sleepMin)} שעות` : 'השינה עוד לא נרשמה';
  if (worst === 'protein') return facts.ate ? `אתמול אכלת ${int(facts.protein)} ג׳ חלבון` : 'אתמול לא נרשם אוכל';
  if (worst === 'fuel') return facts.enoughFood ? 'אתמול אכלת פחות מהרגיל' : 'אין עדיין מספיק נתוני אוכל';
  return `${facts.streak} ימי אימון ברצף`;
}

/* ---------- Plan ---------- */

const stored = (k) => getState().days[k]?.plan || null;
let cache = { v: -1, today: '', map: new Map() };

/**
 * Today's plan for date k, or null: without the coach, and for past dates that have no stored plan
 * (history keeps the old behavior). A stored (locked) plan is returned as it was.
 */
export function planFor(k) {
  if (!coachOn()) return null;
  const s = stored(k);
  if (s?.locked) return s;
  if (k < todayKey()) return null;
  return computePlan(k);
}

/** The plan as the coach computes it now (ignoring a lock), with the date's override / undo applied. */
export function computePlan(k) {
  if (cache.v !== stateVersion() || cache.today !== todayKey()) cache = { v: stateVersion(), today: todayKey(), map: new Map() };
  if (cache.map.has(k)) return cache.map.get(k);
  const r = readiness(k);
  const s = stored(k);
  let dayType, intensity, reason;
  if (r.facts.streak >= 5) {
    dayType = 'recovery'; intensity = 'recovery'; reason = `${r.facts.streak} ימי אימון ברצף`;
  } else {
    // The day whose groups were trained least recently; never one trained in the last 36 hours
    // (dates have no clock time: today or yesterday).
    const fresh = coachDays().filter((d) => !trainedGroups(k, d.groups) && !trainedGroups(addDays(k, -1), d.groups));
    if (!fresh.length) {
      dayType = 'recovery'; intensity = 'recovery'; reason = 'כל הקבוצות אומנו ב-36 השעות האחרונות';
    } else {
      const last = (d) => lastTrained(k, d.groups) || '';
      dayType = fresh.reduce((a, b) => (last(b) < last(a) ? b : a)).id;
      intensity = r.score >= 75 ? 'full' : r.score >= 50 ? 'normal' : r.score >= 30 ? 'light' : 'recovery';
      if (intensity === 'recovery') dayType = 'recovery';
      reason = factorText(r, intensity);
    }
  }
  if (s?.override) {
    dayType = s.override.dayType || dayType;
    intensity = dayType === 'recovery' ? 'recovery' : s.override.intensity && s.override.intensity !== 'recovery' ? s.override.intensity : intensity === 'recovery' ? 'normal' : intensity;
    reason = 'נבחר ידנית';
  }
  const plan = { dayType, intensity, score: r.score, reason, ...(s?.override ? { override: s.override } : {}), ...(s?.undo ? { undo: s.undo } : {}) };
  cache.map.set(k, plan);
  return plan;
}

export const dayTypeName = (id) => DAY_TYPES[id]?.name || '';
/** "יום עליון · מלא" / "יום התאוששות" */
export const planLabel = (p) => (p.dayType === 'recovery' ? DAY_TYPES.recovery.name : `${dayTypeName(p.dayType)} · ${INTENSITY[p.intensity]}`);
/** "יום רגליים, קל — ישנת 4:30 שעות" / "יום התאוששות — 5 ימי אימון ברצף" */
export const reasonLine = (p) => `${p.dayType === 'recovery' ? DAY_TYPES.recovery.name : `${dayTypeName(p.dayType)}, ${INTENSITY[p.intensity]}`} — ${p.reason}`;

/* ---------- Targets, light days, progression ---------- */

export const weightsList = () => [...new Set((getState().settings?.coach?.weights || []).map(Number).filter((w) => w > 0))].sort((a, b) => a - b);
const targetOf = (ex) => ({ sets: ex.sets ?? null, reps: ex.reps ?? null, seconds: ex.seconds ?? null, weight: ex.weight ?? null });
const same = (a, b) => ['sets', 'reps', 'seconds', 'weight'].every((f) => (a?.[f] ?? null) === (b?.[f] ?? null));

/** "יום קל": one set fewer (min 1), one weight step lighter (or −20% reps for bodyweight; −20% for holds). */
export function lighten(ex, t = targetOf(ex)) {
  const out = { ...t };
  if (ex.type === 'setsReps') {
    out.sets = Math.max(1, (t.sets || 1) - 1);
    if (t.weight > 0) out.weight = [...weightsList()].reverse().find((w) => w < t.weight) ?? t.weight;
    else out.reps = Math.max(1, Math.round((t.reps || 1) * 0.8));
  } else if (ex.type === 'timed') out.seconds = Math.max(5, Math.round((t.seconds || 5) * 0.8));
  else if (t.reps) out.reps = Math.max(1, Math.round(t.reps * 0.8));
  return out;
}

/** One level up: weighted reps +2 to 15, then the next weight at 8 reps; bodyweight reps +2 to 25, then +1 set (max 5); holds +5 s to 120. */
export function stepUp(ex, t = targetOf(ex)) {
  if (ex.type === 'setsReps' && t.weight > 0) {
    if (t.reps < 15) return { ...t, reps: Math.min(15, t.reps + 2) };
    const next = weightsList().find((w) => w > t.weight);
    return next ? { ...t, weight: next, reps: 8 } : null;
  }
  if (ex.type === 'setsReps') {
    if (t.reps < 25) return { ...t, reps: Math.min(25, t.reps + 2) };
    return t.sets < 5 ? { ...t, sets: t.sets + 1 } : null;
  }
  if (ex.type === 'timed') return t.seconds < 120 ? { ...t, seconds: Math.min(120, t.seconds + 5) } : null;
  return null;
}

/** One level down (the reverse steps). */
export function stepDown(ex, t = targetOf(ex)) {
  if (ex.type === 'setsReps' && t.weight > 0) {
    if (t.reps > 8) return { ...t, reps: Math.max(8, t.reps - 2) };
    const prev = [...weightsList()].reverse().find((w) => w < t.weight);
    return prev ? { ...t, weight: prev, reps: 15 } : null;
  }
  if (ex.type === 'setsReps') return t.reps > 1 ? { ...t, reps: Math.max(1, t.reps - 2) } : null;
  if (ex.type === 'timed') return t.seconds > 5 ? { ...t, seconds: Math.max(5, t.seconds - 5) } : null;
  return null;
}

/** All target sets reached the target reps (holds: the target time). */
function hit(ex, entry, t) {
  if (ex.type === 'setsReps') return (entry?.sets || []).filter((s) => s.done && s.reps >= t.reps).length >= t.sets;
  if (ex.type === 'timed') return (entry?.seconds || 0) >= t.seconds;
  return false;
}
/** Missed the target by more than 20% (total reps / time). */
function missed(ex, entry, t) {
  if (ex.type === 'setsReps') return (entry?.sets || []).filter((s) => s.done).reduce((a, s) => a + (s.reps || 0), 0) < 0.8 * t.sets * t.reps;
  if (ex.type === 'timed') return (entry?.seconds || 0) < 0.8 * t.seconds;
  return false;
}

/** The exercise's last two coached sessions before k at its current level: [{ intensity, entry, day }]. */
function lastSessions(ex, k) {
  const base = targetOf(ex);
  const out = [];
  for (const d of Object.keys(getState().days).filter((x) => x < k).sort().reverse()) {
    const p = getState().days[d].plan, entry = getState().days[d].exercises?.[ex.id];
    const t = p?.locked && p.targets?.[ex.id];
    if (!t || !entry || exerciseProgress(ex, entry) <= 0) continue;
    if (!same(t.base, base)) break; // an earlier level: stop
    out.push({ intensity: p.intensity, entry, day: t.day });
    if (out.length === 2) break;
  }
  return out;
}

/** Change to apply on day k: { kind: 'up' | 'down', from, to } or null. Progression only on "יום מלא". */
export function changeFor(ex, k, plan) {
  if (plan.dayType === 'recovery' || (plan.undo || []).includes(ex.id)) return null;
  const s = lastSessions(ex, k);
  if (s.length < 2) return null;
  const from = targetOf(ex);
  if (s.every((x) => missed(ex, x.entry, x.day))) {
    const to = stepDown(ex, from);
    return to ? { kind: 'down', from, to } : null;
  }
  if (plan.intensity === 'full' && s.every((x) => ['full', 'normal'].includes(x.intensity) && hit(ex, x.entry, x.day))) {
    const to = stepUp(ex, from);
    return to ? { kind: 'up', from, to } : null;
  }
  return null;
}

/** Plan exercises of day k (adjusted copies: today's targets, `_base` = the stored exercise, `_change`). */
export function planExercises(k, given) {
  if (!given) {
    if (cache.v !== stateVersion() || cache.today !== todayKey()) cache = { v: stateVersion(), today: todayKey(), map: new Map() };
    const key = `ex:${k}`;
    if (!cache.map.has(key)) cache.map.set(key, buildPlanExercises(k, planFor(k)));
    return cache.map.get(key);
  }
  return buildPlanExercises(k, given);
}

function buildPlanExercises(k, plan) {
  if (!plan) return null;
  const all = allForDay(k);
  const groups = DAY_TYPES[plan.dayType]?.groups || [];
  const list = plan.dayType === 'recovery'
    ? all.filter((ex) => groupOf(ex) === 'core' && ex.type === 'timed') // "בטן" holds only
    : all.filter((ex) => !groupOf(ex) || groups.includes(groupOf(ex))); // unknown groups: every training day
  return list.map((ex) => {
    let day, change = null;
    const t = plan.locked && plan.targets?.[ex.id];
    if (t) {
      day = t.day;
      const pr = plan.progress?.[ex.id];
      if (pr) change = pr;
    } else {
      change = changeFor(ex, k, plan);
      const base = change ? change.to : targetOf(ex);
      day = plan.intensity === 'light' ? lighten(ex, base) : base;
    }
    const copy = { ...ex, ...day, _base: ex, _change: change };
    if (!same(day, targetOf(ex))) copy.last = null; // prefills follow today's target
    return copy;
  });
}

/** Today's target copy of an exercise (when it is in the plan), else null. */
export function planExercise(id, k) {
  return planExercises(k)?.find((e) => e.id === id) || null;
}

/**
 * The first logged set of the day locks the plan: it is stored with today's targets, and any
 * progression / step back becomes the exercise's new target.
 */
export function lockPlan(k) {
  if (!coachOn() || stored(k)?.locked) return;
  const plan = planFor(k);
  if (!plan) return;
  const exs = planExercises(k, plan);
  const targets = {}, progress = {};
  for (const c of exs) {
    targets[c.id] = { base: c._change ? c._change.to : targetOf(c._base), day: targetOf(c) };
    if (c._change) {
      progress[c.id] = c._change;
      Object.assign(c._base, c._change.to);
      c._base.last = null;
    }
  }
  updateDay(k, (d) => {
    d.plan = { dayType: plan.dayType, intensity: plan.intensity, score: plan.score, reason: plan.reason,
      ...(plan.override ? { override: plan.override } : {}), ...(plan.undo ? { undo: plan.undo } : {}),
      locked: true, targets, ...(Object.keys(progress).length ? { progress } : {}) };
  });
}

/** Undo a progression / step back for day k only. */
export function undoChange(k, id) {
  const s = stored(k);
  const undo = [...new Set([...(s?.undo || []), id])];
  if (s?.locked) {
    const pr = s.progress?.[id], ex = exerciseById(id);
    if (pr && ex) {
      Object.assign(ex, pr.from);
      ex.last = null;
      const day = s.intensity === 'light' ? lighten(ex, pr.from) : pr.from;
      updateDay(k, (d) => {
        delete d.plan.progress[id];
        if (!Object.keys(d.plan.progress).length) delete d.plan.progress;
        d.plan.targets[id] = { base: pr.from, day };
        d.plan.undo = undo;
      });
      return;
    }
  }
  updateDay(k, (d) => { d.plan = { ...(d.plan || {}), undo }; });
}

/** Manual day type / intensity for day k ("החלפה"). */
export function setOverride(k, override) {
  updateDay(k, (d) => {
    const p = d.plan || {};
    d.plan = { ...p, override };
    if (p.locked) {
      d.plan.dayType = override.dayType;
      d.plan.intensity = override.dayType === 'recovery' ? 'recovery' : override.intensity;
      d.plan.reason = 'נבחר ידנית';
    }
  });
}

/** Rotation days for "החלפה" (+ recovery). */
export const overrideDays = () => [...coachDays(), DAY_TYPES.recovery];

/** From 18:00: tomorrow's day type ("סופי אחרי רישום שינה"). */
export function tomorrowPreview(k, now) {
  if (!coachOn() || k !== todayKey() || now < '18:00') return null;
  const p = computePlan(addDays(k, 1));
  return `מחר: ${p.dayType === 'recovery' ? DAY_TYPES.recovery.name : dayTypeName(p.dayType)} (סופי אחרי רישום שינה)`;
}

/** Plan shown for a past or present day in summaries: stored, today's, or a past recovery day. */
export function summaryPlan(k) {
  if (!coachOn()) return null;
  const s = stored(k);
  if (s?.locked) return s;
  if (k === todayKey()) return computePlan(k);
  if (k < todayKey()) {
    const p = computePlan(k);
    return p.dayType === 'recovery' ? p : null;
  }
  return null;
}

/** "3×14" / "3×8 · 12 ק״ג" / "65 שניות" (plain text). */
export function targetText(ex, t) {
  if (ex.type === 'timed') return `${t.seconds} שניות`;
  if (ex.type === 'maxReps') return `${t.reps || ''} חזרות`;
  return `${t.sets}×${t.reps}${t.weight > 0 ? ` · ${t.weight} ק״ג` : ''}`;
}

