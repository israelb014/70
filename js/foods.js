// Food knowledge: built-in DB (lazy-loaded JSON), Hebrew-aware search, barcode lookup.
import { getState, upsertCustomFood, customFoodByBarcode } from './storage.js';

/* ---------- Built-in database ---------- */

let dbPromise = null;

/** Load data/foods.json once (cached by the service worker afterwards). */
export function loadFoodDb() {
  if (!dbPromise) {
    dbPromise = fetch('./data/foods.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((list) => list.map((f) => ({ ...f, norm: normalizeHe(f.n), anorm: (f.a || []).map(normalizeHe) })))
      .catch((e) => {
        dbPromise = null; // allow retry later
        throw e;
      });
  }
  return dbPromise;
}

/* ---------- Hebrew normalization ---------- */

const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

/**
 * Strip niqqud/cantillation, unify final letters, drop quotes & geresh, treat "וו"/"ו" and
 * "יי"/"י" as equal (full/defective spelling), collapse spaces. Mirrored in tools/build_foods.py.
 */
export function normalizeHe(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '')
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .replace(/["'`׳״‘’“”]/g, '')
    .replace(/[-–_,.()/]/g, ' ')
    .replace(/וו/g, 'ו')
    .replace(/יי/g, 'י')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---------- Unified food shape ---------- */
// { key, name, kcal100, protein100, units: [{l, g}], source: 'db' | 'custom', barcode? }

export function fromDb(f) {
  return { key: `db:${f.n}`, name: f.n, kcal100: f.k, protein100: f.p, units: f.u || [], source: 'db' };
}

export function fromCustom(c) {
  return {
    key: `c:${c.id}`,
    id: c.id,
    name: c.name,
    kcal100: c.kcal100,
    protein100: c.protein100,
    units: c.servingGrams ? [{ l: 'מנה', g: c.servingGrams }] : [],
    source: 'custom',
    barcode: c.barcode,
  };
}

/* ---------- Matching ---------- */

/** True when a and b differ by at most one insertion, deletion or substitution. */
function withinOneEdit(a, b) {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (la > lb) i++;
    else if (lb > la) j++;
    else { i++; j++; }
  }
  return edits + (la - i) + (lb - j) <= 1;
}

/**
 * How a single query word matches a normalized text: 2 = substring, 1 = typo match
 * (words of 4+ letters, one edit against a word or word-prefix of the text), 0 = no match.
 */
function wordMatch(text, word) {
  if (text.includes(word)) return 2;
  if (word.length < 4) return 0;
  for (const t of text.split(' ')) {
    if (withinOneEdit(t, word)) return 1;
    // allow the query word to be a (typo'd) prefix of a longer word
    for (const len of [word.length - 1, word.length, word.length + 1]) {
      if (len < t.length && len >= 3 && withinOneEdit(t.slice(0, len), word)) return 1;
    }
  }
  return 0;
}

/** Match all query words against name (+ aliases). Returns null or { tier, fuzzy }. */
function matchItem(q, words, norm, anorm) {
  let viaAlias = false, fuzzy = false;
  for (const w of words) {
    const m = wordMatch(norm, w);
    if (m === 2) continue;
    const am = anorm.reduce((best, a) => Math.max(best, wordMatch(a, w)), 0);
    if (am === 2 && m < 2) { viaAlias = true; continue; }
    if (m === 1 || am === 1) { fuzzy = true; if (m !== 1) viaAlias = true; continue; }
    return null;
  }
  // tier: 0 exact name · 1 name starts with query · 2 alias · 3 contains · 4 typo
  let tier;
  if (norm === q || anorm.includes(q)) tier = 0;
  else if (fuzzy) tier = 4;
  else if (norm.startsWith(q)) tier = 1;
  else if (viaAlias) tier = 2;
  else tier = 3;
  return { tier, fuzzy };
}

/**
 * Search the user's own products and the built-in DB. Every query word must appear in the
 * name or an alias (typo tolerant for 4+ letters).
 * Returns { own, db } — each ranked: most eaten → exact → starts with → alias → contains → typo.
 */
export function searchFoods(db, query, limit = 30) {
  const q = normalizeHe(query);
  if (!q) return { own: [], db: [] };
  const memory = getState().foodMemory;
  const words = q.split(' ');
  const rank = (cands) => {
    const out = [];
    for (const c of cands) {
      const m = matchItem(q, words, c.norm, c.anorm);
      if (m) out.push({ food: c.food, count: memory[c.food.key]?.count || 0, tier: m.tier, len: c.norm.length });
    }
    // Typo matches only help when nothing matches exactly ("שווארמע"); otherwise they're noise.
    const exact = out.filter((r) => r.tier < 4);
    const list = exact.length ? exact : out;
    list.sort((a, b) => b.count - a.count || a.tier - b.tier || a.len - b.len);
    return list.slice(0, limit).map((r) => r.food);
  };
  return {
    own: rank(getState().customFoods.map((c) => ({ food: fromCustom(c), norm: normalizeHe(c.name), anorm: [] }))),
    db: rank(db.map((f) => ({ food: fromDb(f), norm: f.norm, anorm: f.anorm || [] }))),
  };
}

/* ---------- Open Food Facts name search (online) ---------- */

const OFF_SEARCH = (q, israel) =>
  'https://world.openfoodfacts.org/cgi/search.pl?search_terms=' + encodeURIComponent(q) +
  '&search_simple=1&action=process&json=1&page_size=20' +
  '&fields=code,product_name,product_name_he,brands,nutriments,serving_quantity' +
  (israel ? '&tagtype_0=countries&tag_contains_0=contains&tag_0=israel' : '');

/** Map an OFF product to the unified food shape; null when it has no usable kcal. */
export function fromOff(p) {
  const n = p.nutriments || {};
  let kcal = num(n['energy-kcal_100g']);
  if (kcal === null && num(n.energy_100g) !== null) kcal = num(n.energy_100g) / 4.184;
  const name = (p.product_name_he || p.product_name || '').trim();
  if (kcal === null || !name) return null;
  const serving = num(p.serving_quantity);
  return {
    key: `off:${p.code}`,
    name,
    brand: (p.brands || '').split(',')[0].trim(),
    kcal100: Math.round(kcal),
    protein100: Math.round((num(n.proteins_100g) || 0) * 10) / 10,
    units: serving > 0 ? [{ l: 'מנה', g: serving }] : [],
    source: 'off',
    barcode: p.code ? String(p.code) : null,
    servingGrams: serving > 0 ? serving : null,
  };
}

/**
 * Search Open Food Facts by name (Israel first; if fewer than 5 hits, also worldwide).
 * Throws on network errors / abort — the caller hides the section.
 */
export async function searchOff(query, signal) {
  const get = async (israel) => {
    const res = await fetch(OFF_SEARCH(query, israel), { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return (json.products || []).map(fromOff).filter(Boolean);
  };
  let list = await get(true);
  if (list.length < 5) {
    const seen = new Set(list.map((f) => f.key));
    list = list.concat((await get(false)).filter((f) => !seen.has(f.key)));
  }
  return list;
}

/** Selecting an OFF result saves it to the user's own products (reusing one with the same barcode). */
export function saveOffFood(f) {
  const existing = f.barcode ? customFoodByBarcode(f.barcode) : null;
  const saved = existing || upsertCustomFood({
    name: f.brand && !f.name.includes(f.brand) ? `${f.name} · ${f.brand}` : f.name,
    barcode: f.barcode,
    kcal100: f.kcal100,
    protein100: f.protein100,
    servingGrams: f.servingGrams,
  });
  return fromCustom(saved);
}

/* ---------- Barcode lookup ---------- */

const OFF_URL = (code) =>
  `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json` +
  '?fields=product_name,product_name_he,brands,nutriments,serving_size,serving_quantity';

/**
 * Look up a barcode: the user's own products first, then Open Food Facts.
 * Resolves one of:
 *   { food }                      — complete product (online hits are saved locally)
 *   { partial: {...}, reason }    — not found / missing values (reason: 'notfound' | 'incomplete' | 'network')
 */
export async function lookupBarcode(code) {
  const own = customFoodByBarcode(code);
  if (own) return { food: fromCustom(own) };

  let json;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(OFF_URL(code), { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.status === 404) return { partial: { barcode: code }, reason: 'notfound' };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    json = await res.json();
  } catch {
    return { partial: { barcode: code }, reason: 'network' };
  }

  const p = json?.product;
  if (!p || json.status === 0) return { partial: { barcode: code }, reason: 'notfound' };
  const n = p.nutriments || {};
  let kcal = num(n['energy-kcal_100g']);
  if (kcal === null && num(n.energy_100g) !== null) kcal = num(n.energy_100g) / 4.184; // kJ → kcal
  const protein = num(n.proteins_100g);
  const baseName = (p.product_name_he || p.product_name || '').trim();
  const name = baseName && p.brands && !baseName.includes(p.brands.split(',')[0])
    ? `${baseName} · ${p.brands.split(',')[0].trim()}`
    : baseName;
  const serving = num(p.serving_quantity);
  const info = {
    barcode: code,
    name,
    kcal100: kcal !== null ? Math.round(kcal) : null,
    protein100: protein !== null ? Math.round(protein * 10) / 10 : null,
    servingGrams: serving > 0 ? serving : null,
  };
  if (!info.name || info.kcal100 === null || info.protein100 === null) {
    return { partial: info, reason: 'incomplete' };
  }
  // Save online hits so the next scan works offline.
  const saved = upsertCustomFood(info);
  return { food: fromCustom(saved) };
}

function num(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}
