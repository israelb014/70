// Fluids: drinks logged in "אוכל" count toward the daily water total, computed on the fly (past days too).
import { normalizeHe } from './foods.js';

const norm = (list) => list.map(normalizeHe);
/** Units that always mean liquid (the entry's unit word). */
const LIQUID_UNITS = norm(['מ״ל', 'ליטר', 'שוט', 'פחית', 'בקבוק']);
/* "כוס" / "ספל" are also used for rice, salads, cereals, fruit and legumes, so a cup counts only when the
   name matches a drink keyword — i.e. exactly the keyword rule below, with no unit shortcut. */
/** Drink words, matched as whole words (so "נס" doesn't hit "אננס" and "חלב" doesn't hit "חלבון"). */
const DRINK_WORDS = norm(['מים', 'סודה', 'קפה', 'אספרסו', 'נס', 'הפוך', 'תה', 'חליטה', 'מיץ', 'שוקו', 'חלב', 'משקה', 'קולה',
  'ספרייט', 'פאנטה', 'לימונדה', 'שייק', 'מילקשייק', 'אייס', 'תרכיז']);
/** "לבן" (the dairy drink) only as the first word — "לחם לבן" / "אורז לבן" are not drinks. */
const FIRST_WORD_ONLY = norm(['לבן']);
const ALCOHOL = norm(['בירה', 'יין', 'וודקה', 'ערק', 'וויסקי', 'ליקר', 'קוניאק', 'רום', 'אלכוהולי']);
const NOT_LIQUID = norm(['אבקת', 'גרגירי', 'סודה לשתייה']); // powder, beans / grounds, baking soda: substring
const NOT_LIQUID_WORDS = norm(['אבקה']); // "קפה, אבקה" (but "מוכן מאבקה" is a prepared drink)
/* A drink word inside a food's name ("שוקולד חלב", "סלט … מיץ לימון", "עוגיות … קפה") doesn't make it a
   drink: when the name starts with one of these food words, it is not a drink. */
const FOOD_HEADS = norm(['שוקולד', 'ריבת', 'ריבה', 'מעדן', 'גבינה', 'גבינת', 'יוגורט', 'לאבנה', 'דג', 'סלט', 'עוגה', 'עוגת',
  'עוגיות', 'עוגייה', 'דייסה', 'דייסת', 'ביצה', 'פירה', 'תפוחי', 'גלידה', 'גלידת', 'שלגון', 'קרחון', 'חטיף', 'ופל', 'ביסקוויט',
  'ממרח', 'סוכריות', 'סוכר', 'פולי', 'שקדים', 'טונה', 'נקניק', 'פודינג', 'ציר', 'רוטב', 'עמילן', 'פולנטה', 'כוסמת', 'מצה',
  'חרוסת', 'מרק', 'טפיוקה', 'פריכיות', 'צדפות', 'בשר', 'ירקות', 'ערמוני', 'סירופ', 'גזר', 'מלבין', 'תחליף', 'טבעות', 'שומן', 'מלבי', 'קלמנטינה', 'חבוש',
  'ג׳לי', 'דבש']);
// "in water" / "from milk" ("טונה במים", "גבינה מחלב כבשים") describe foods, so no ב / מ prefixes.
const PREFIXES = ['', 'ו', 'ה', 'ל', 'ש', 'כ'];

// Questionnaire items are named "FFQ-…": the real head word comes after the prefix.
const words = (s) => normalizeHe(s).split(' ').filter(Boolean).filter((w, i) => !(i === 0 && w === 'ffq'));
const hasWord = (ws, list) => ws.some((w) => list.some((k) => PREFIXES.some((p) => w === p + k)));

/** Rule-based: is a food (name + unit) a drink? */
export function drinkByRules(name, unit) {
  const n = normalizeHe(name);
  const ws = words(name);
  if (hasWord(ws, ALCOHOL) || NOT_LIQUID.some((x) => n.includes(x)) || ws.some((w) => NOT_LIQUID_WORDS.includes(w))) return false;
  const u = words(unit)[0];
  if (u && LIQUID_UNITS.includes(u)) return true;
  if (FOOD_HEADS.includes(ws[0])) return false;
  if (hasWord(ws, DRINK_WORDS)) return true;
  return FIRST_WORD_ONLY.includes(ws[0]);
}

/** An entry counts as a drink: its manual "נחשב לנוזלים" choice wins, otherwise the rules. */
export const isDrink = (entry) => (typeof entry?.fluid === 'boolean' ? entry.fluid : drinkByRules(entry?.name, entry?.unit));

/** ml from drinks (1 g = 1 ml). */
export const drinksMl = (day) => (day?.food || []).reduce((s, f) => s + (isDrink(f) ? Number(f.grams) || 0 : 0), 0);
