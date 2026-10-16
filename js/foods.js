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
      .then((list) => list.map((f) => ({ ...f, norm: normalizeHe(f.n) })))
      .catch((e) => {
        dbPromise = null; // allow retry later
        throw e;
      });
  }
  return dbPromise;
}

/* ---------- Hebrew normalization ---------- */

const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

/** Strip niqqud/cantillation, unify final letters, drop quotes & geresh, collapse spaces. */
export function normalizeHe(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '')
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .replace(/["'`׳״‘’“”]/g, '')
    .replace(/[-–_,.()]/g, ' ')
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

/**
 * Search the user's own products and the built-in DB.
 * Ranking: own products → most eaten → name starts with query → word starts with query → contains.
 */
export function searchFoods(db, query, limit = 30) {
  const q = normalizeHe(query);
  if (!q) return [];
  const memory = getState().foodMemory;
  const terms = q.split(' ');
  const candidates = [
    ...getState().customFoods.map((c) => ({ food: fromCustom(c), norm: normalizeHe(c.name) })),
    ...db.map((f) => ({ food: fromDb(f), norm: f.norm })),
  ];
  const results = [];
  for (const c of candidates) {
    // Every query word must appear in the name.
    if (!terms.every((t) => c.norm.includes(t))) continue;
    const starts = c.norm.startsWith(q);
    const wordStart = !starts && (` ${c.norm}`).includes(` ${terms[0]}`);
    results.push({
      food: c.food,
      own: c.food.source === 'custom' ? 0 : 1,
      count: memory[c.food.key]?.count || 0,
      match: starts ? 0 : wordStart ? 1 : 2,
      len: c.norm.length,
    });
  }
  results.sort((a, b) => a.own - b.own || b.count - a.count || a.match - b.match || a.len - b.len);
  return results.slice(0, limit).map((r) => r.food);
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
