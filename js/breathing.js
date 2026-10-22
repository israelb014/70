// Breathing / meditation: techniques, phase timing (pure, time-driven), saved minutes and goal.
import { getState, getDay, updateDay, updateMeta } from './storage.js';
import { todayKey, nowTime, addDays } from './dates.js';

/** Phases in seconds. "free" has no pattern (a silent timer with a slow ambient pulse). */
export const TECHNIQUES = [
  { id: 'calm', name: 'נשימה רגועה', desc: 'שאיפה 5 שניות, נשיפה 5 שניות', phases: [['in', 5], ['out', 5]] },
  { id: 'box', name: 'נשימת קופסה', desc: 'שאיפה 4, החזקה 4, נשיפה 4, החזקה 4', phases: [['in', 4], ['hold', 4], ['out', 4], ['hold', 4]] },
  { id: '478', name: '4-7-8', desc: 'שאיפה 4, החזקה 7, נשיפה 8', phases: [['in', 4], ['hold', 7], ['out', 8]] },
  { id: 'free', name: 'נשימה חופשית', desc: 'בלי קצב: טיימר שקט עם פעימה איטית', phases: [] },
];
export const DURATIONS = [1, 3, 5, 10, 15];
export const PHASE_WORD = { in: 'שאיפה', hold: 'החזקה', out: 'נשיפה' };
export const PREP_SECONDS = 3;
export const techniqueById = (id) => TECHNIQUES.find((t) => t.id === id) || TECHNIQUES[0];

/**
 * Phase at `t` seconds into the session: { kind, index, duration, left (whole seconds, counting down),
 * cycle } — or null for the free technique.
 */
export function phaseAt(tech, t) {
  const phases = techniqueById(tech).phases;
  if (!phases.length) return null;
  const cycle = phases.reduce((a, [, d]) => a + d, 0);
  let pos = ((t % cycle) + cycle) % cycle;
  let index = 0;
  for (; index < phases.length; index++) {
    if (pos < phases[index][1]) break;
    pos -= phases[index][1];
  }
  const [kind, duration] = phases[index];
  return { kind, index, duration, left: Math.max(1, Math.ceil(duration - pos - 1e-9)), cycle };
}

/* ---------- Data: days[date].breathing = [{ technique, minutes, time }] ---------- */

export const breathMinutes = (day) => (day?.breathing || []).reduce((a, b) => a + (Number(b.minutes) || 0), 0);
export const breathGoal = (st = getState().settings || {}) => Number(st.breathGoal) || 5;
export const breathSessions = (day) => (day?.breathing || []).length;

/** Minutes that count for an ended session: whole minutes, at least 1 to count (else 0 = not saved). */
export const minutesToSave = (seconds) => Math.floor(Math.max(0, seconds) / 60);

/** Save a finished (or ended-early) session to today. Returns the saved minutes (0 = nothing saved). */
export function saveBreathing(technique, seconds, date = todayKey()) {
  const minutes = minutesToSave(seconds);
  if (minutes < 1) return 0;
  updateDay(date, (d) => {
    d.breathing ||= [];
    d.breathing.push({ technique, minutes, time: nowTime() });
  });
  return minutes;
}

/** Last used technique + duration (setup prefill). */
export function lastChoice() {
  const m = getState().meta.breathLast || {};
  return { technique: techniqueById(m.technique).id, minutes: DURATIONS.includes(m.minutes) ? m.minutes : 5 };
}
export const rememberChoice = (technique, minutes) => updateMeta({ breathLast: { technique, minutes } });

/** Night sleep duration in minutes (crosses midnight). Kept local to avoid an import cycle with progress.js. */
const nightMinutes = (sl) => {
  const m = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return sl?.bed && sl?.wake ? (m(sl.wake) - m(sl.bed) + 1440) % 1440 : 0;
};

/**
 * Night sleep after days with breathing vs without (all history; the night after day d is the sleep
 * logged on d+1). Returns { with, without, diff } in minutes, or null when either group has < 5 nights.
 */
export function sleepAfterBreathing() {
  const days = getState().days;
  const withB = [], without = [];
  for (const k of Object.keys(days)) {
    const night = days[addDays(k, 1)]?.sleep;
    if (!night) continue;
    (breathSessions(days[k]) ? withB : without).push(nightMinutes(night));
  }
  if (withB.length < 5 || without.length < 5) return null;
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  return { with: avg(withB), without: avg(without), diff: avg(withB) - avg(without) };
}

export const todayBreathMinutes = (k = todayKey()) => breathMinutes(getDay(k));
