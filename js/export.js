// Daily / weekly text summaries (clipboard) and JSON backup export / import.
import { getState, getDay, validateBackup, replaceState, updateMeta } from './storage.js';
import { lastNDays, todayKey, shortDate, weekdayName, fullDate } from './dates.js';
import { computeRecords, exercisesForDay, foodTotals, floorsOf, dayCompletion, completionPct, sortedFood, waterMl } from './stats.js';
import { fmt } from './ui.js';
import { sleepMinutes, fmtDuration, levelInfo, weekXP, walkHistory, BADGES, dayXP } from './progress.js';
import { int, dec1, dec2, trim, iso, plural, unitAmount } from './hebrew.js';
import { dayInsights, weekInsights } from './insights.js';

// Right-to-left mark: makes a line that starts with Latin text ("XP …") lay out right-to-left.
const RLM = '\u200F';

/* ---------- Shared line builders ---------- */

/** "3 סטים (20, 20, 18 חזרות) · 6 ק״ג" / "סט אחד (12 חזרות)" / "60 שניות"; '' when nothing was done. */
function exerciseLine(ex, entry) {
  if (!entry) return '';
  const kg = (w) => (w ? ` · ${trim(w, 1)} ק״ג` : '');
  if (ex.type === 'setsReps') {
    const done = (entry.sets || []).filter((s) => s.done);
    if (!done.length) return '';
    const reps = done.length === 1
      ? plural(done[0].reps, 'חזרה אחת', 'חזרות')
      : `${done.map((s) => int(s.reps)).join(', ')} חזרות`;
    return `${plural(done.length, 'סט אחד', 'סטים')} (${reps})${kg(done.find((s) => s.weight)?.weight)}`;
  }
  if (ex.type === 'timed') return entry.seconds ? `${plural(entry.seconds, 'שנייה אחת', 'שניות')}${kg(entry.weight)}` : '';
  return entry.reps ? `סט אחד (${plural(entry.reps, 'חזרה אחת', 'חזרות')})${kg(entry.weight)}` : '';
}

const climbsText = (day) =>
  `${plural(day.climbs.length, 'עלייה אחת', 'עליות')} · ${plural(floorsOf(day), 'קומה אחת', 'קומות')}`;

const sleepText = (sl) => `שינה: ${iso(fmtDuration(sleepMinutes(sl)))} שעות (${iso(`${sl.bed}–${sl.wake}`)})`;

/** "9 כוסות" / "כוס אחת" / "1.5 כוסות" — 250 ml per glass, one decimal. */
const cupsText = (ml) => plural(Math.round((ml / 250) * 10) / 10, 'כוס אחת', 'כוסות', (n) => trim(n, 1));

/* ---------- Daily summary ---------- */

/** Plain-text Hebrew summary of one day. Sections without data are omitted (food always appears). */
export function dailySummary(k) {
  const st = getState().settings;
  const day = getDay(k);
  const sections = [[`סיכום יומי · יום ${weekdayName(k)} ${fullDate(k)}`]];

  // אימון
  const exLines = [];
  for (const ex of exercisesForDay(k)) {
    const t = exerciseLine(ex, day.exercises[ex.id]);
    if (t) exLines.push(`• ${ex.name}: ${t}`);
  }
  const hasExercise = exLines.length > 0;
  if (day.rest) exLines.push('• יום מנוחה');
  if (exLines.length) {
    const sec = ['אימון:', ...exLines];
    const c = dayCompletion(k);
    if (hasExercise && c.total) {
      sec.push(`השלמה: ${completionPct(k)}% (${c.done} מתוך ${c.total === 1 ? 'תרגיל אחד' : `${c.total} תרגילים`})`);
    }
    sections.push(sec);
  }

  // פעילות
  const act = [];
  if (day.steps) act.push(`• צעדים: ${st.stepsTarget ? iso(`${int(day.steps)} / ${int(st.stepsTarget)}`) : int(day.steps)}`);
  if (day.climbs.length) act.push(`• מדרגות: ${climbsText(day)}`);
  if (day.rides.length) {
    const km = day.rides.reduce((a, r) => a + (Number(r.km) || 0), 0);
    const min = day.rides.reduce((a, r) => a + (Number(r.minutes) || 0), 0);
    act.push(`• אופניים: ${plural(day.rides.length, 'רכיבה אחת', 'רכיבות')} · ${dec1(km)} ק״מ${min ? ` · ${int(min)} דק׳` : ''}`);
    if (day.rides.length > 1) {
      for (const r of day.rides) act.push(`• רכיבה: ${dec1(r.km)} ק״מ${r.minutes ? ` · ${int(r.minutes)} דק׳` : ''}`);
    }
  }
  if (act.length) sections.push(['פעילות:', ...act]);

  if (day.sleep) sections.push([sleepText(day.sleep)]);

  const ml = waterMl(day);
  if (ml) sections.push([`מים: ${dec2(ml / 1000)} ל׳ / ${trim((st.waterTarget || 2500) / 1000)} ל׳ (${cupsText(ml)})`]);

  // אוכל ושתייה (always present)
  const food = ['אוכל ושתייה:'];
  const items = sortedFood(day);
  if (!items.length) food.push('לא נרשם אוכל');
  for (const { f } of items) {
    const amount = f.amount && f.unit && f.unit !== 'גרם'
      ? `${unitAmount(f.amount, f.unit)} (${trim(f.grams, 1)} ג׳) · `
      : f.grams ? `${trim(f.grams, 1)} ג׳ · ` : '';
    food.push(`• ${f.time || '—'} · ${f.name || 'ללא שם'} · ${amount}${int(f.kcal)} קק״ל · ${dec1(f.protein)} ג׳ חלבון`);
  }
  if (items.length) {
    const t = foodTotals(k);
    food.push(`סה״כ: ${int(t.kcal)} קק״ל · ${dec1(t.protein)} ג׳ חלבון${st.proteinTarget ? ` / ${int(st.proteinTarget)} ג׳` : ''}`);
  }
  sections.push(food);

  const weighins = getState().weights.filter((w) => w.date === k);
  if (weighins.length) sections.push([`שקילה: ${trim(weighins.at(-1).kg, 1)} ק״ג`]);

  const ins = dayInsights(k).slice(0, 4);
  if (ins.length) sections.push(['תובנות:', ...ins.map((x) => `• ${x.text}`)]);

  const xpSec = [`${RLM}XP היום: ${int(dayXP(k) + 5 * weighins.length)} · רמה ${levelInfo().level}`];
  const walk = walkHistory();
  const badges = BADGES.filter((b) => walk.earned[b.id] === k);
  if (badges.length) xpSec.push(`תגים חדשים: ${badges.map((b) => b.name).join(', ')}`);
  sections.push(xpSec);

  return sections.map((sec) => sec.join('\n')).join('\n\n');
}

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
    if (day.climbs.length) body.push(`מדרגות: ${climbsText(day)}`);
    for (const r of day.rides) {
      body.push(`רכיבה: ${fmt(r.km)} ק״מ${r.minutes ? ` · ${fmt(r.minutes)} דק׳` : ''}${r.note ? ` (${r.note})` : ''}`);
    }
    for (const ex of exercisesForDay(k)) {
      const t = exerciseLine(ex, day.exercises[ex.id]);
      if (t) body.push(`${ex.name}: ${t}`);
    }
    if (day.sleep) body.push(sleepText(day.sleep));
    const ml = waterMl(day);
    if (ml) body.push(`מים: ${dec2(ml / 1000)} ל׳ (${cupsText(ml)})`);
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
  lines.push('');

  const wins = weekInsights().slice(0, 6);
  if (wins.length) lines.push('תובנות השבוע:', ...wins.map((x) => `• ${x.text}`), '');

  const walk = walkHistory();
  const newBadges = BADGES.filter((b) => walk.earned[b.id] >= keys[0] && walk.earned[b.id] <= keys[6]);
  lines.push(`רמה נוכחית: ${levelInfo().level}`);
  lines.push(`${RLM}XP השבוע: ${fmt(weekXP())}`);
  lines.push('תגים חדשים השבוע:');
  if (newBadges.length) for (const b of newBadges) lines.push(`• ${b.name} (${shortDate(walk.earned[b.id])})`);
  else lines.push('• אין תגים חדשים השבוע');

  return lines.join('\n');
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

/** The backup as a JSON File. lastBackupAt is stamped first so the file matches the saved state. */
function backupFile() {
  updateMeta({ lastBackupAt: new Date().toISOString() });
  const json = JSON.stringify(getState(), null, 2);
  return new File([json], `70-backup-${todayKey()}.json`, { type: 'application/json' });
}

/** Download the backup file and record meta.lastBackupAt. */
export function exportBackup() {
  const file = backupFile();
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** True when the system share sheet accepts files (Android Chrome, iOS Safari). */
export function canShareBackup() {
  try {
    return !!navigator.canShare?.({ files: [new File(['{}'], '70-backup.json', { type: 'application/json' })] });
  } catch {
    return false;
  }
}

/**
 * Share the backup file through the system share sheet (Drive, WhatsApp, …).
 * Resolves true on success; lastBackupAt is kept only when the share went through.
 */
export async function shareBackup() {
  const prev = getState().meta.lastBackupAt ?? null;
  const file = backupFile();
  try {
    await navigator.share({ files: [file], title: file.name });
    return true;
  } catch {
    updateMeta({ lastBackupAt: prev ?? undefined });
    return false;
  }
}

const DAY_MS = 86400000;

/** Days that hold any logged data. */
function dataDayCount() {
  return Object.values(getState().days).filter((d) => d && (d.steps || d.rest || d.sleep || d.climbs?.length || d.rides?.length
    || d.food?.length || d.water?.length || Object.keys(d.exercises || {}).length)).length;
}

/**
 * Backup reminder state: { show, days } — days since the last backup (null = never).
 * Shown when the last backup is 7+ days old, or never backed up with 3+ days of data; "אחר כך" snoozes for 24 h.
 */
export function backupReminder(now = Date.now()) {
  const meta = getState().meta;
  const last = meta.lastBackupAt ? Date.parse(meta.lastBackupAt) : NaN;
  const days = Number.isFinite(last) ? Math.max(0, Math.floor((now - last) / DAY_MS)) : null;
  const snoozed = meta.backupSnoozeUntil && Date.parse(meta.backupSnoozeUntil) > now;
  const due = days === null ? dataDayCount() >= 3 : days >= 7;
  return { show: due && !snoozed, days };
}

export function snoozeBackupReminder() {
  updateMeta({ backupSnoozeUntil: new Date(Date.now() + DAY_MS).toISOString() });
}

/** "DD.MM.YYYY" of the last backup, or null. */
export function lastBackupDate() {
  const t = getState().meta.lastBackupAt;
  const d = t ? new Date(t) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
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

