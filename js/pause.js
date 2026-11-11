// Pause mode ("הקפאה"): days off training. settings.pauses = [{ start, end }] — end is exclusive, null =
// "עד שאבטל". Pause days neither break nor extend the streak, don't advance the rotation, show
// "הקפאה" instead of a workout plan and hide "behind target" insights. Logging works as usual.
import { getState, updateSettings } from './storage.js';
import { addDays, todayKey } from './dates.js';

export const pauses = () => (Array.isArray(getState().settings?.pauses) ? getState().settings.pauses : [])
  .filter((p) => p && /^\d{4}-\d{2}-\d{2}$/.test(p.start) && (p.end === null || /^\d{4}-\d{2}-\d{2}$/.test(p.end)));

const inside = (p, k) => k >= p.start && (p.end === null || k < p.end);
export const isPaused = (k) => pauses().some((p) => inside(p, k));
/** The pause covering day k (or the next one that starts later), else null. */
export const currentPause = (k = todayKey()) => pauses().find((p) => inside(p, k)) || pauses().find((p) => p.start > k) || null;

/** Start a pause on `start` for `days` days (1–30), or until it is ended (`days` null). */
export function startPause(start, days) {
  const end = days ? addDays(start, Math.max(1, Math.min(30, Math.round(days)))) : null;
  const list = pauses().filter((p) => !(p.start >= start)); // a new pause replaces later ones
  updateSettings({ pauses: [...list, { start, end }] });
}

/** "סיום הקפאה": the pause ends today (today is a normal day); a pause that hadn't started is removed. */
export function endPause(today = todayKey()) {
  const list = pauses().map((p) => (inside(p, today) ? { ...p, end: today } : p)).filter((p) => p.start < (p.end ?? '9999') && !(p.start >= today && p.end === today));
  updateSettings({ pauses: list.filter((p) => !(p.start > today)) });
}

/** Was there a pause day after `from` and before `to` (exclusive)? */
export function pausedBetween(from, to) {
  for (let k = addDays(from, 1); k < to; k = addDays(k, 1)) if (isPaused(k)) return true;
  return false;
}

/** Last paused day of the pause covering k ("עד DD.MM"), or null when it runs until cancelled. */
export const pauseLastDay = (p) => (p.end ? addDays(p.end, -1) : null);
