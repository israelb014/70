// Hebrew text helpers for plain-text exports: number formatting and singular/plural agreement.

const he = (n, min, max) => Number(n).toLocaleString('he-IL', { minimumFractionDigits: min, maximumFractionDigits: max });

/** Whole number with thousands separators: 1,983 */
export const int = (n) => he(Math.round(Number(n) || 0), 0, 0);
/** Exactly one decimal: 118.3 / 40.0 */
export const dec1 = (n) => he(Number(n) || 0, 1, 1);
/** Exactly two decimals: 2.25 */
export const dec2 = (n) => he(Number(n) || 0, 2, 2);
/** Up to `max` decimals, no trailing zeros: 2.5 / 9 */
export const trim = (n, max = 2) => he(Number(n) || 0, 0, max);

/** Unicode isolate so numbers/ranges keep their order inside RTL lines (invisible). */
export const iso = (s) => `⁦${s}⁩`;

/**
 * Count + noun with correct agreement: exactly 1 → the singular phrase ("סט אחד"),
 * otherwise "<n> <plural>" ("2 סטים", "1.5 כוסות").
 */
export function plural(n, singularPhrase, pluralNoun, fmtN = trim) {
  return Number(n) === 1 ? singularPhrase : `${fmtN(n)} ${pluralNoun}`;
}

// Unit labels used by the food database / amount sheet: [plural, gender]
const UNITS = {
  'ביצה': ['ביצים', 'f'],
  'בקבוק': ['בקבוקים', 'm'],
  'גביע': ['גביעים', 'm'],
  'גבעול': ['גבעולים', 'm'],
  'חביתה מ-2 ביצים': ['חביתות מ-2 ביצים', 'f'],
  'חופן': ['חופנים', 'm'],
  'חזה שלם': ['חזות שלמים', 'm'],
  'חצי': ['חצאים', 'm'],
  'חתיכה': ['חתיכות', 'f'],
  'טבלה': ['טבלאות', 'f'],
  'יחידה': ['יחידות', 'f'],
  'כדור': ['כדורים', 'm'],
  'כוס': ['כוסות', 'f'],
  'כוסית': ['כוסיות', 'f'],
  'כף': ['כפות', 'f'],
  'כפית': ['כפיות', 'f'],
  'מנה': ['מנות', 'f'],
  'משולש': ['משולשים', 'm'],
  'נתח': ['נתחים', 'm'],
  'סטייק': ['סטייקים', 'm'],
  'סקופ': ['סקופים', 'm'],
  'עלה': ['עלים', 'm'],
  'פחית': ['פחיות', 'f'],
  'פילה': ['פילות', 'm'],
  'פלח': ['פלחים', 'm'],
  'פרוסה': ['פרוסות', 'f'],
  'קובייה': ['קוביות', 'f'],
  'קופסה': ['קופסאות', 'f'],
  'קופסה מסוננת': ['קופסאות מסוננות', 'f'],
  'קלח': ['קלחים', 'm'],
  'קציצה': ['קציצות', 'f'],
  'רבע באגט': ['רבעי באגט', 'm'],
  'שוט': ['שוטים', 'm'],
  'שן': ['שיניים', 'f'],
  'שקית': ['שקיות', 'f'],
  'שקית קטנה': ['שקיות קטנות', 'f'],
};

/** "יחידה אחת" / "2 יחידות" / "1.5 כוסות"; unknown labels fall back to "<n> <label>". */
export function unitAmount(amount, label) {
  const u = UNITS[label];
  if (!u) return `${trim(amount)} ${label}`;
  return plural(amount, `${label} ${u[1] === 'f' ? 'אחת' : 'אחד'}`, u[0]);
}
