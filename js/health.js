// Health Connect (Android app only): read-only steps, sleep sessions and cycling sessions for the last 14
// days, through the app's own "HealthConnect" Capacitor plugin (android/…/HealthConnectPlugin.kt).
// Rules (applyHealthData):
//   steps — the day's total fills steps (stepsSource "hc"), unless the day was edited by hand (stepsManual);
//   sleep — the main overnight session fills that day's night sleep only when empty (or filled earlier by
//           Health Connect); other daytime sessions become naps when they don't overlap; manual sleep is never
//           overwritten;
//   rides — cycling sessions become rides (km, minutes), deduplicated by session id; manual rides stay.
// Missing Health Connect or denied permissions: nothing happens and everything stays manual.
import { getState, getDay, updateDay } from './storage.js';
import { keyOf, todayKey, addDays } from './dates.js';
import { call, tryCall, nativeStore, setNativeStore, isNative } from './native.js';

export const DAYS = 14;
export const TYPES = [
  { id: 'steps', name: 'צעדים' },
  { id: 'sleep', name: 'שינה' },
  { id: 'exercise', name: 'אימונים (אופניים)' },
];

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** A sleep session that ends in the morning (03:00–13:00) and lasts 3 h+ is that day's night sleep. */
const isNight = (s) => {
  const end = new Date(s.endTime), dur = (s.endTime - s.startTime) / 60000;
  return dur >= 180 && end.getHours() >= 3 && end.getHours() < 13;
};
const CYCLING = new Set(['biking', 'biking_stationary', 'cycling']);

/**
 * Apply Health Connect data. data = { steps: [{ date, count }], sleep: [{ id, startTime, endTime }],
 * exercise: [{ id, type, startTime, endTime, distanceMeters }] } (times in epoch ms). Returns the number of changes.
 */
export function applyHealthData(data, today = todayKey()) {
  const from = addDays(today, -(DAYS - 1));
  let changes = 0;

  for (const s of data.steps || []) {
    if (!(s.date >= from && s.date <= today) || !(s.count > 0)) continue;
    const day = getDay(s.date);
    if (day.stepsManual || day.steps === Math.round(s.count)) continue;
    updateDay(s.date, (d) => { d.steps = Math.round(s.count); d.stepsSource = 'hc'; });
    changes++;
  }

  // Night sleep: the longest overnight session per wake-up day.
  const nights = new Map();
  for (const s of data.sleep || []) {
    if (!isNight(s)) continue;
    const k = keyOf(new Date(s.endTime));
    if (!(k >= from && k <= today)) continue;
    if (!nights.has(k) || s.endTime - s.startTime > nights.get(k).endTime - nights.get(k).startTime) nights.set(k, s);
  }
  for (const [k, s] of nights) {
    const day = getDay(k);
    const v = { bed: hhmm(new Date(s.startTime)), wake: hhmm(new Date(s.endTime)) };
    if (day.sleep && day.sleepSource !== 'hc') continue; // manual sleep is never overwritten
    if (day.sleep && day.sleep.bed === v.bed && day.sleep.wake === v.wake) continue;
    updateDay(k, (d) => { d.sleep = v; d.sleepSource = 'hc'; });
    changes++;
  }
  // Daytime sessions → naps (same day, no overlap, not already added).
  for (const s of data.sleep || []) {
    if (isNight(s)) continue;
    const a = new Date(s.startTime), b = new Date(s.endTime);
    const k = keyOf(a);
    if (k !== keyOf(b) || !(k >= from && k <= today) || b - a < 10 * 60000) continue;
    const nap = { start: hhmm(a), end: hhmm(b), hcId: String(s.id) };
    const day = getDay(k);
    if ((day.naps || []).some((n) => n.hcId === nap.hcId)) continue;
    const overlaps = (day.naps || []).some((n) => toMin(n.start) < toMin(nap.end) && toMin(nap.start) < toMin(n.end));
    const inNight = day.sleep && (() => { const bed = toMin(day.sleep.bed), wake = toMin(day.sleep.wake);
      return bed > wake ? toMin(nap.start) < wake : toMin(nap.start) < wake && toMin(nap.end) > bed; })();
    if (overlaps || inNight) continue;
    updateDay(k, (d) => { (d.naps ||= []).push(nap); d.naps.sort((x, y) => x.start.localeCompare(y.start)); });
    changes++;
  }

  // Cycling sessions → rides, once per session id (across all days).
  const known = new Set(Object.values(getState().days).flatMap((d) => (d.rides || []).map((r) => r.hcId).filter(Boolean)));
  for (const e of data.exercise || []) {
    if (!CYCLING.has(String(e.type)) || known.has(String(e.id))) continue;
    const km = Math.round((Number(e.distanceMeters) || 0) / 100) / 10;
    if (!(km > 0)) continue;
    const k = keyOf(new Date(e.startTime));
    if (!(k >= from && k <= today)) continue;
    const minutes = Math.round((e.endTime - e.startTime) / 60000);
    updateDay(k, (d) => d.rides.push({ km, minutes: minutes > 0 ? minutes : null, note: 'Health Connect', hcId: String(e.id) }));
    known.add(String(e.id));
    changes++;
  }
  return changes;
}

/* ---------- Plugin calls ---------- */

/** { available, installed, granted: [types] } — never throws. */
export async function healthStatus() {
  if (!isNative()) return { available: false, installed: false, granted: [] };
  const r = await tryCall('HealthConnect', 'getStatus');
  return { available: !!r?.available, installed: !!r?.available, granted: r?.granted || [] };
}

/** Ask for read access (Health Connect's own permission screen). Resolves the granted types. */
export async function connectHealth() {
  const r = await tryCall('HealthConnect', 'connect');
  const granted = r?.granted || [];
  setNativeStore({ hc: { ...(nativeStore().hc || {}), connected: granted.length > 0, granted } });
  return granted;
}

/** Read the last 14 days and apply them. Resolves the number of changes (0 when unavailable). */
export async function syncHealth(today = todayKey()) {
  const st = nativeStore().hc;
  if (!isNative() || !st?.connected) return 0;
  try {
    const start = new Date(`${addDays(today, -(DAYS - 1))}T00:00:00`).getTime();
    const data = await call('HealthConnect', 'readData', { startTime: start, endTime: Date.now() });
    const n = applyHealthData(data || {}, today);
    setNativeStore({ hc: { ...nativeStore().hc, lastSync: Date.now(), granted: data?.granted || st.granted } });
    return n;
  } catch {
    return 0; // not installed / permission revoked: stay manual
  }
}

/** "DD.MM HH:MM" of the last sync, or null. */
export function lastHealthSync() {
  const t = nativeStore().hc?.lastSync;
  if (!t) return null;
  const d = new Date(t);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${hhmm(d)}`;
}
