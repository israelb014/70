// Persistence layer. All data lives on-device in localStorage under one key.
// Every read/write is wrapped in try/catch so a full or blocked storage never crashes the app.

export const STORAGE_KEY = 'seventy.v1';
export const SCHEMA_VERSION = 4;
// Versions accepted when loading or importing (older ones are migrated).
const SUPPORTED_VERSIONS = [1, 2, 3, 4];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function blankState() {
  return {
    schemaVersion: SCHEMA_VERSION, settings: null, exercises: [], mealPresets: [], days: {}, weights: [],
    customFoods: [], foodMemory: {}, photoSessions: [],
    // lastSeenLevel === null means "not initialised yet" (fresh install or migrated data).
    meta: { lastSeenLevel: null, seenBadges: [] },
  };
}

export function blankDay() {
  return { rest: false, steps: null, climbs: [], rides: [], exercises: {}, food: [], sleep: null, naps: [], water: [] };
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Coerce any parsed object into a well-formed v2 state (missing fields get defaults).
 * Migrations are additive:
 *   v1 → v2: customFoods / foodMemory added; old food entries ({name, kcal, protein}) stay valid.
 *   v2 → v3: settings.sleepTarget (default 8), days[].sleep, meta { lastSeenLevel, seenBadges }.
 *   v3 → v4: settings.waterTarget (default 2500 ml), days[].water [{ ml, time }];
 *            food entries may carry time ("HH:MM"), amount and unit (older entries stay valid).
 */
export function normalize(d) {
  const s = blankState();
  if (!isObj(d)) return s;
  s.customFoods = Array.isArray(d.customFoods)
    ? d.customFoods.filter((f) => isObj(f) && f.id && f.name).map((f) => ({
      id: f.id,
      name: String(f.name),
      barcode: f.barcode ? String(f.barcode) : null,
      kcal100: Number(f.kcal100) || 0,
      protein100: Number(f.protein100) || 0,
      servingGrams: Number(f.servingGrams) > 0 ? Number(f.servingGrams) : null,
    }))
    : [];
  s.foodMemory = isObj(d.foodMemory) ? { ...d.foodMemory } : {};
  s.settings = isObj(d.settings) ? { ...d.settings } : null;
  if (s.settings && !(Number(s.settings.sleepTarget) > 0)) s.settings.sleepTarget = 8;
  if (s.settings && !(Number(s.settings.waterTarget) > 0)) s.settings.waterTarget = 2500;
  if (isObj(d.meta)) {
    s.meta = {
      lastSeenLevel: Number.isFinite(d.meta.lastSeenLevel) ? d.meta.lastSeenLevel : null,
      seenBadges: Array.isArray(d.meta.seenBadges) ? d.meta.seenBadges.filter((b) => typeof b === 'string') : [],
    };
    // Optional ISO timestamps (no schema bump): last completed backup, backup reminder snoozed until.
    for (const key of ['lastBackupAt', 'backupSnoozeUntil', 'photoSnoozeUntil', 'lastPhotoBackupAt']) {
      if (typeof d.meta[key] === 'string' && !Number.isNaN(Date.parse(d.meta[key]))) s.meta[key] = d.meta[key];
    }
    // "Update target" prompt shown: { exerciseId: dayKey } (at most once per exercise per day).
    if (isObj(d.meta.targetPrompts)) s.meta.targetPrompts = { ...d.meta.targetPrompts };
    if (d.meta.photoPersisted === true) s.meta.photoPersisted = true; // navigator.storage.persist() already asked
    // Keep the stored key order, so an exported backup re-imports byte-identical.
    s.meta = Object.fromEntries(Object.keys({ ...d.meta, ...s.meta }).filter((key) => key in s.meta).map((key) => [key, s.meta[key]]));
  }
  // Progress photo sessions (metadata only; the photos themselves live in IndexedDB). Missing = none.
  s.photoSessions = Array.isArray(d.photoSessions)
    ? d.photoSessions.filter((x) => isObj(x) && DAY_KEY_RE.test(x.date) && Array.isArray(x.poses))
      .map((x) => ({ date: x.date, poses: x.poses.filter((p) => ['front', 'side', 'back'].includes(p)) }))
    : [];
  s.exercises = Array.isArray(d.exercises) ? d.exercises.filter((e) => isObj(e) && e.id && e.name) : [];
  s.mealPresets = Array.isArray(d.mealPresets) ? d.mealPresets.filter((m) => isObj(m) && m.id) : [];
  s.weights = Array.isArray(d.weights)
    ? d.weights.filter((w) => isObj(w) && DAY_KEY_RE.test(w.date) && Number(w.kg) > 0)
    : [];
  if (isObj(d.days)) {
    for (const [k, day] of Object.entries(d.days)) {
      if (!DAY_KEY_RE.test(k) || !isObj(day)) continue;
      const b = blankDay();
      s.days[k] = {
        rest: !!day.rest,
        steps: Number.isFinite(day.steps) ? day.steps : null,
        climbs: Array.isArray(day.climbs) ? day.climbs.filter(isObj) : b.climbs,
        rides: Array.isArray(day.rides) ? day.rides.filter(isObj) : b.rides,
        exercises: isObj(day.exercises) ? day.exercises : b.exercises,
        food: Array.isArray(day.food) ? day.food.filter(isObj) : b.food,
        sleep: isObj(day.sleep) && TIME_RE.test(day.sleep.bed) && TIME_RE.test(day.sleep.wake)
          ? { bed: day.sleep.bed, wake: day.sleep.wake } : null,
        naps: Array.isArray(day.naps)
          ? day.naps.filter((n) => isObj(n) && TIME_RE.test(n.start) && TIME_RE.test(n.end) && n.end > n.start)
            .map((n) => ({ start: n.start, end: n.end }))
          : [],
        water: Array.isArray(day.water)
          ? day.water.filter((w) => isObj(w) && Number(w.ml) > 0)
            .map((w) => ({ ml: Number(w.ml), time: TIME_RE.test(w.time) ? w.time : null }))
          : [],
      };
    }
  }
  return s;
}

/** Returns an error message (Hebrew) or null when the backup looks valid. */
export function validateBackup(d) {
  if (!isObj(d)) return 'הקובץ אינו גיבוי תקין';
  if (!SUPPORTED_VERSIONS.includes(d.schemaVersion)) return 'גרסת הגיבוי אינה נתמכת';
  if (d.settings !== null && !isObj(d.settings)) return 'מבנה ההגדרות בקובץ שגוי';
  if (!Array.isArray(d.exercises) || !Array.isArray(d.mealPresets) || !Array.isArray(d.weights)) {
    return 'מבנה הקובץ שגוי';
  }
  if (!isObj(d.days)) return 'מבנה הימים בקובץ שגוי';
  if (Object.keys(d.days).some((k) => !DAY_KEY_RE.test(k))) return 'תאריך לא תקין בקובץ';
  if (d.schemaVersion >= 2 && (!Array.isArray(d.customFoods) || !isObj(d.foodMemory))) return 'מבנה המזון בקובץ שגוי';
  if (d.schemaVersion >= 3 && d.meta !== undefined && !isObj(d.meta)) return 'מבנה הנתונים בקובץ שגוי';
  return null;
}

let onSaveError = () => {};
export function setSaveErrorHandler(fn) {
  onSaveError = fn;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { data: blankState(), migrated: false };
    const parsed = JSON.parse(raw);
    return { data: normalize(parsed), migrated: parsed?.schemaVersion !== SCHEMA_VERSION };
  } catch (e) {
    console.warn('Failed to load data', e);
    return { data: blankState(), migrated: false };
  }
}

const loaded = load();
let state = loaded.data;
if (loaded.migrated) save(); // persist the migrated v2 shape once

export function getState() {
  return state;
}

export function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.error('Failed to save data', e);
    onSaveError(e);
    return false;
  }
}

export function replaceState(data) {
  state = normalize(data);
  return save();
}

export function resetAll() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear data', e);
  }
  state = blankState();
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ---------- Days ---------- */

/** Read-only view of a day; returns a blank (unstored) day when missing. */
export function getDay(k) {
  return state.days[k] || blankDay();
}

/** Mutate a day (created on demand) and persist. */
export function updateDay(k, fn) {
  if (!state.days[k]) state.days[k] = blankDay();
  fn(state.days[k]);
  save();
}

/* ---------- Settings ---------- */

export function updateSettings(patch) {
  state.settings = { ...(state.settings || {}), ...patch };
  save();
}

/* ---------- Exercises ---------- */

export function activeExercises() {
  return state.exercises.filter((e) => !e.archived).sort((a, b) => a.order - b.order);
}

export function exerciseById(id) {
  return state.exercises.find((e) => e.id === id) || null;
}

export function upsertExercise(ex) {
  const i = state.exercises.findIndex((e) => e.id === ex.id);
  if (i >= 0) {
    state.exercises[i] = { ...state.exercises[i], ...ex };
  } else {
    const maxOrder = state.exercises.reduce((m, e) => Math.max(m, e.order ?? 0), -1);
    state.exercises.push({ archived: false, order: maxOrder + 1, ...ex, id: ex.id || uid() });
  }
  save();
}

/** Deleting archives the exercise so its history stays intact. */
export function archiveExercise(id) {
  const ex = exerciseById(id);
  if (ex) {
    ex.archived = true;
    save();
  }
}

export function moveExercise(id, dir) {
  const list = activeExercises();
  const i = list.findIndex((e) => e.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  list.forEach((e, idx) => (e.order = idx));
  save();
}

/* ---------- Meal presets ---------- */

export function upsertPreset(p) {
  const i = state.mealPresets.findIndex((m) => m.id === p.id);
  if (i >= 0) state.mealPresets[i] = { ...state.mealPresets[i], ...p };
  else state.mealPresets.push({ ...p, id: p.id || uid() });
  save();
}

export function deletePreset(id) {
  state.mealPresets = state.mealPresets.filter((m) => m.id !== id);
  save();
}

/* ---------- Weights ---------- */

export function addWeight(date, kg) {
  state.weights.push({ date, kg });
  state.weights.sort((a, b) => a.date.localeCompare(b.date));
  save();
}

export function deleteWeight(index) {
  state.weights.splice(index, 1);
  save();
}

/* ---------- Custom foods (user's own products) & food memory ---------- */

export function upsertCustomFood(f) {
  const i = state.customFoods.findIndex((c) => c.id === f.id);
  const m = { ...(i >= 0 ? state.customFoods[i] : {}), ...f };
  // Fixed key order, matching normalize(), so backups round-trip byte-identically.
  const out = {
    id: m.id || uid(), name: m.name, barcode: m.barcode || null,
    kcal100: m.kcal100, protein100: m.protein100, servingGrams: m.servingGrams || null,
  };
  if (i >= 0) state.customFoods[i] = out;
  else state.customFoods.push(out);
  save();
  return out;
}

export function deleteCustomFood(id) {
  state.customFoods = state.customFoods.filter((c) => c.id !== id);
  save();
}

export function customFoodByBarcode(code) {
  return state.customFoods.find((c) => c.barcode && c.barcode === code) || null;
}

/** Remember the last amount/unit for a food and count how often it was eaten. */
export function rememberFood(key, amount, unit) {
  const prev = state.foodMemory[key];
  state.foodMemory[key] = { amount, unit, count: (prev?.count || 0) + 1 };
  save();
}

/* ---------- Progress photo sessions ---------- */

export function setPhotoSessions(list) {
  state.photoSessions = [...list].sort((a, b) => a.date.localeCompare(b.date));
  save();
}

/* ---------- Meta (what the user has already been shown) ---------- */

export function updateMeta(patch) {
  state.meta = { ...state.meta, ...patch };
  save();
}
