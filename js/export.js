// Weekly text summary (clipboard) and JSON backup export / import.
import { getState, getDay, validateBackup, replaceState } from './storage.js';
import { lastNDays, todayKey, shortDate, weekdayName } from './dates.js';
import { computeRecords, exercisesForDay, foodTotals, floorsOf } from './stats.js';
import { fmt } from './ui.js';

/* ---------- Weekly summary ---------- */

/** Plain-text Hebrew summary of the last 7 days (oldest first). */
export function weeklySummary() {
  const keys = lastNDays(7);
  const state = getState();
  const lines = [`סיכום שבועי · ${shortDate(keys[0])}–${shortDate(keys[6])}`, ''];

  for (const k of keys) {
    const day = getDay(k);
    lines.push(`יום ${weekdayName(k)} ${shortDate(k)}${day.rest ? ' · יום מנוחה' : ''}`);
    const body = [];
    if (day.steps) body.push(`צעדים: ${fmt(day.steps)}`);
    if (day.climbs.length) body.push(`מדרגות: ${day.climbs.length} עליות · ${fmt(floorsOf(day))} קומות`);
    for (const r of day.rides) {
      body.push(`רכיבה: ${fmt(r.km)} ק״מ${r.minutes ? ` · ${fmt(r.minutes)} דק׳` : ''}${r.note ? ` (${r.note})` : ''}`);
    }
    for (const ex of exercisesForDay(k)) {
      const entry = day.exercises[ex.id];
      const t = exerciseLine(ex, entry);
      if (t) body.push(`${ex.name}: ${t}`);
    }
    const ft = foodTotals(k);
    if (day.food.length) body.push(`אוכל: ${fmt(ft.kcal)} קק״ל · ${fmt(ft.protein)} ג׳ חלבון`);
    if (!body.length) body.push('אין נתונים');
    lines.push(...body.map((b) => `• ${b}`), '');
  }

  const weekW = state.weights.filter((w) => w.date >= keys[0] && w.date <= keys[6]);
  lines.push('שקילות:');
  if (weekW.length) {
    for (const w of weekW) lines.push(`• ${shortDate(w.date)}: ${fmt(w.kg)} ק״ג`);
    const avg = weekW.reduce((s, w) => s + w.kg, 0) / weekW.length;
    lines.push(`ממוצע: ${fmt(avg)} ק״ג`);
  } else lines.push('• אין שקילות השבוע');
  lines.push('');

  const events = computeRecords().events.filter((e) => e.date >= keys[0] && e.date <= keys[6]);
  lines.push('שיאים חדשים:');
  if (events.length) {
    for (const e of events) lines.push(`• ${e.label}: ${fmt(e.value)} ${e.unit} (${shortDate(e.date)})`);
  } else lines.push('• אין שיאים חדשים השבוע');

  return lines.join('\n');
}

function exerciseLine(ex, entry) {
  if (!entry) return '';
  if (ex.type === 'setsReps') {
    const done = (entry.sets || []).filter((s) => s.done);
    if (!done.length) return '';
    const reps = done.map((s) => s.reps).join(', ');
    const w = done.find((s) => s.weight)?.weight;
    return `${done.length} סטים (${reps} חזרות)${w ? ` · ${fmt(w)} ק״ג` : ''}`;
  }
  if (ex.type === 'timed') return entry.seconds ? `${entry.seconds} שניות${entry.weight ? ` · ${fmt(entry.weight)} ק״ג` : ''}` : '';
  return entry.reps ? `${entry.reps} חזרות${entry.weight ? ` · ${fmt(entry.weight)} ק״ג` : ''}` : '';
}

/** Copy text using the async Clipboard API with a textarea fallback. */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/* ---------- Backup ---------- */

export function exportBackup() {
  const json = JSON.stringify(getState(), null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `70-backup-${todayKey()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Read and validate a backup file. Resolves { data } or { error }. */
export async function readBackupFile(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const error = validateBackup(data);
    return error ? { error } : { data };
  } catch {
    return { error: 'לא ניתן לקרוא את הקובץ' };
  }
}

export function restoreBackup(data) {
  return replaceState(data);
}

