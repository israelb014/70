// Fluids: drinks logged in "אוכל" count toward the daily water total, computed on the fly (past days too).
import { normalizeHe } from './foods.js';

const norm = (list) => list.map(normalizeHe);
/** Liquid units (the entry's unit word). */
const LIQUID_UNITS = norm(['מ״ל', 'ליטר', 'כוס', 'שוט', 'פחית', 'בקבוק', 'ספל']);
/** Drink words, matched as whole words (so "נס" doesn't hit "אננס" and "חלב" doesn't hit "חלבון"). */
const DRINK_WORDS = norm(['מים', 'סודה', 'קפה', 'אספרסו', 'נס', 'הפוך', 'תה', 'חליטה', 'מיץ', 'שוקו', 'חלב', 'משקה', 'קולה',
  'ספרייט', 'פאנטה', 'לימונדה', 'שייק', 'מילקשייק', 'אייס', 'תרכיז']);
/** "לבן" (the dairy drink) only as the first word — "לחם לבן" / "אורז לבן" are not drinks. */
const FIRST_WORD_ONLY = norm(['לבן']);
const ALCOHOL = norm(['בירה', 'יין', 'וודקה', 'ערק', 'וויסקי', 'ליקר', 'קוניאק']);
const NOT_LIQUID = norm(['אבקת', 'גרגירי']); // powder, beans / grounds: substring
const PREFIXES = ['', 'ו', 'ה', 'ב', 'ל', 'מ', 'ש', 'כ'];

const words = (s) => normalizeHe(s).split(' ').filter(Boolean);
const hasWord = (ws, list) => ws.some((w) => list.some((k) => PREFIXES.some((p) => w === p + k)));

/** Rule-based: is a food (name + unit) a drink? */
export function drinkByRules(name, unit) {
  const n = normalizeHe(name);
  const ws = words(name);
  if (hasWord(ws, ALCOHOL) || NOT_LIQUID.some((x) => n.includes(x))) return false;
  const u = words(unit)[0];
  if (u && LIQUID_UNITS.includes(u)) return true;
  if (hasWord(ws, DRINK_WORDS)) return true;
  return FIRST_WORD_ONLY.includes(ws[0]);
}

/** An entry counts as a drink: its manual "נחשב לנוזלים" choice wins, otherwise the rules. */
export const isDrink = (entry) => (typeof entry?.fluid === 'boolean' ? entry.fluid : drinkByRules(entry?.name, entry?.unit));

/** ml from drinks (1 g = 1 ml). */
export const drinksMl = (day) => (day?.food || []).reduce((s, f) => s + (isDrink(f) ? Number(f.grams) || 0 : 0), 0);
