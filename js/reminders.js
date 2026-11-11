// Local notifications (Android app only), "תזכורות" in Settings. Inexact scheduling: the plan for today
// and tomorrow is rebuilt on every open / resume / change, so conditions ("sleep not logged yet", "behind
// on fluids") are checked against the latest data. settings.reminders (missing = defaults):
//   sleep { on: true, time: '08:00' } · water { on: false } · summary { on: true, time: '21:00' } · backup { on: true }
import { getState, getDay } from './storage.js';
import { keyOf, addDays } from './dates.js';
import { hasSleep } from './progress.js';
import { fluidsMl } from './stats.js';
import { backupReminder } from './export.js';
import { isPaused } from './pause.js';
import { call, tryCall, isNative, nativeStore, setNativeStore } from './native.js';

export const DEFAULTS = { sleep: { on: true, time: '08:00' }, water: { on: false }, summary: { on: true, time: '21:00' }, backup: { on: true } };
export const WATER_SLOTS = ['10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];
const BACKUP_TIME = '19:00';

export function reminderSettings() {
  const r = getState().settings?.reminders || {};
  return Object.fromEntries(Object.entries(DEFAULTS).map(([k, d]) => [k, { ...d, ...(r[k] || {}) }]));
}

const at = (k, time) => { const [y, m, d] = k.split('-').map(Number); const [h, mi] = time.split(':').map(Number); return new Date(y, m - 1, d, h, mi, 0, 0); };
const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** The day's fluid pace: share of the target expected by `time` (08:00 → 0, 22:00 → all). */
export const paceShare = (time) => Math.max(0, Math.min(1, (minutes(time) - 8 * 60) / (14 * 60)));

/**
 * Notifications to schedule from `now` (today + tomorrow): [{ id, title, body, at: Date, extra }].
 * Pure: depends only on the stored data, the settings and `now`.
 */
export function planReminders(now = new Date()) {
  if (!getState().settings) return [];
  const st = getState().settings;
  const r = reminderSettings();
  const today = keyOf(now);
  const out = [];
  const add = (id, k, time, title, body, extra = {}) => {
    const t = at(k, time);
    if (t > now) out.push({ id, title, body, at: t, extra });
  };
  [today, addDays(today, 1)].forEach((k, i) => {
    // "רישום שינה": only while last night's sleep isn't logged (Health Connect may have filled it).
    // (it exists to tune the workout, so it's off on pause days)
    if (r.sleep.on && !hasSleep(getDay(k)) && !isPaused(k)) add(100 + i, k, r.sleep.time, 'רישום שינה', 'איך ישנת הלילה? רישום קצר והאימון יותאם', { action: 'sleep' });
    // "שתייה": every 2 hours 10:00–20:00, only when fluids are behind the day's pace.
    if (r.water.on) {
      const target = st.waterTarget || 2500, ml = fluidsMl(getDay(k));
      WATER_SLOTS.forEach((time, j) => {
        if (ml < target * paceShare(time)) add(200 + i * 10 + j, k, time, 'שתייה', 'כדאי לשתות עכשיו כוס מים', { action: 'water' });
      });
    }
    if (r.summary.on) add(300 + i, k, r.summary.time, 'סיכום יום', 'הסיכום היומי מוכן', { action: 'today' });
  });
  // "גיבוי": the existing backup-reminder rule, once (today, else tomorrow).
  if (r.backup.on && backupReminder(now.getTime()).show) {
    const k = at(today, BACKUP_TIME) > now ? today : addDays(today, 1);
    add(400, k, BACKUP_TIME, 'גיבוי', 'כדאי לגבות את הנתונים', { action: 'settings' });
  }
  return out;
}

/** Replace every pending notification with the current plan. Never throws. */
export async function scheduleReminders(now = new Date()) {
  if (!isNative()) return [];
  const plan = planReminders(now);
  try {
    const pending = await call('LocalNotifications', 'getPending');
    const ids = (pending?.notifications || []).map((n) => ({ id: n.id }));
    if (ids.length) await call('LocalNotifications', 'cancel', { notifications: ids });
    if (plan.length) {
      await call('LocalNotifications', 'schedule', {
        notifications: plan.map((n) => ({ id: n.id, title: n.title, body: n.body, extra: n.extra, smallIcon: 'ic_stat_seventy',
          schedule: { at: n.at, allowWhileIdle: false } })),
      });
    }
  } catch { /* no permission / plugin missing: nothing to do */ }
  return plan;
}

/** Ask for the notification permission once (Android 13+ shows the system prompt). */
export async function ensureNotificationPermission(force = false) {
  if (!isNative() || (!force && nativeStore().notifAsked)) return;
  setNativeStore({ notifAsked: true });
  const s = await tryCall('LocalNotifications', 'checkPermissions');
  if (s?.display !== 'granted') await tryCall('LocalNotifications', 'requestPermissions');
}
