// Date helpers. Days are keyed by the device's LOCAL date as "YYYY-MM-DD".

const pad = (n) => String(n).padStart(2, '0');

export function keyOf(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Current local time as "HH:MM". */
export function nowTime() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "18.10.2026" */
export function fullDate(k) {
  const d = parseKey(k);
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

export function todayKey() {
  return keyOf(new Date());
}

export function parseKey(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(k, n) {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return keyOf(d);
}

/** Keys of the last n days ending at `end` (inclusive), oldest first. */
export function lastNDays(n, end = todayKey()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(end, -i));
  return out;
}

/** Sunday of the week containing k (weeks are Sunday–Saturday). */
export function weekStart(k) {
  const d = parseKey(k);
  d.setDate(d.getDate() - d.getDay());
  return keyOf(d);
}

const longFmt = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const WEEKDAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export function longLabel(k) {
  return longFmt.format(parseKey(k));
}

/** "היום" / "אתמול" / null */
export function relativeLabel(k) {
  const t = todayKey();
  if (k === t) return 'היום';
  if (k === addDays(t, -1)) return 'אתמול';
  return null;
}

/** "16.10" */
export function shortDate(k) {
  const d = parseKey(k);
  return `${d.getDate()}.${d.getMonth() + 1}`;
}

export function weekdayShort(k) {
  return WEEKDAYS[parseKey(k).getDay()];
}

export function weekdayName(k) {
  return WEEKDAY_NAMES[parseKey(k).getDay()];
}
