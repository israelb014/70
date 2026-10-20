// Food sheets shared by the "אוכל" tab and settings:
// amount picker (DB / own products / barcode hits), product form, and the scan → lookup flow.
import { getState, updateDay, upsertPreset, upsertCustomFood, rememberFood } from './storage.js';
import { icon, esc, num, parseNum, toast, vibrate, openSheet, invalid } from './ui.js';
import { fromCustom, lookupBarcode } from './foods.js';
import { nowTime } from './dates.js';
import { openScanner } from './scanner.js';

const round1 = (v) => Math.round(v * 10) / 10;

/** kcal / protein for a given number of grams. */
export function calcFood(food, grams) {
  return {
    kcal: Math.round((grams * (food.kcal100 || 0)) / 100),
    protein: round1((grams * (food.protein100 || 0)) / 100),
  };
}

/**
 * Amount sheet: amount + unit selector (grams by default plus the food's units), live totals,
 * optional editable name and "save as preset". Adds the item to the given day.
 * Resolves true when something was added.
 */
export async function openAmountSheet(dayKey, food, { editableName = false, source = food.source } = {}) {
  const units = [{ l: 'גרם', g: 1 }, ...(food.units || [])];
  const mem = getState().foodMemory[food.key];
  let unitIdx = Math.max(0, mem ? units.findIndex((u) => u.l === mem.unit) : 0);
  const startAmount = mem && units[unitIdx].l === mem.unit ? mem.amount : unitIdx === 0 ? 100 : 1;

  const unitChips = units
    .map(
      (u, i) => `<label class="unit-chip"><input type="radio" name="unit" value="${i}" ${i === unitIdx ? 'checked' : ''}>
        <span>${esc(u.l)}${i ? ` <bdi class="num">${num(u.g)}</bdi> ג׳` : ''}</span></label>`
    )
    .join('');

  const body = `
    ${editableName
      ? `<label class="field"><span>שם המוצר</span><input type="text" name="name" maxlength="60" value="${esc(food.name)}" autocomplete="off"></label>`
      : ''}
    <p class="muted small">ל-100 ג׳: ${num(food.kcal100)} קק״ל · <span class="protein-txt">${num(food.protein100)} ג׳ חלבון</span></p>
    <div class="amount-row">
      <label class="field grow"><span>כמות</span>
        <input type="number" inputmode="decimal" min="0" step="any" name="amount" value="${startAmount}"></label>
    </div>
    ${units.length > 1 ? `<div class="unit-chips" role="radiogroup" aria-label="יחידה">${unitChips}</div>` : ''}
    <div class="calc" aria-live="polite">
      <div><span class="calc-num" data-calc="kcal">0</span><span class="muted small">קק״ל</span></div>
      <div><span class="calc-num protein-txt" data-calc="protein">0</span><span class="muted small">ג׳ חלבון</span></div>
      <div><span class="calc-num sm" data-calc="grams">0</span><span class="muted small">גרם</span></div>
    </div>
    <label class="check"><input type="checkbox" name="preset"><span class="check-box">${icon('check')}</span><span>שמור כארוחה קבועה</span></label>`;

  const gramsOf = (root) => {
    const a = parseNum(root.querySelector('[name=amount]').value);
    return a > 0 ? a * units[unitIdx].g : 0;
  };
  const update = (root) => {
    const g = gramsOf(root);
    const c = calcFood(food, g);
    root.querySelector('[data-calc=kcal]').textContent = c.kcal.toLocaleString('he-IL');
    root.querySelector('[data-calc=protein]').textContent = c.protein.toLocaleString('he-IL');
    root.querySelector('[data-calc=grams]').textContent = Math.round(g).toLocaleString('he-IL');
  };

  const res = await openSheet({
    title: editableName ? 'מוצר' : food.name,
    body,
    onOpen: (root) => {
      update(root);
      const amountIn = root.querySelector('[name=amount]');
      amountIn.addEventListener('input', () => update(root));
      root.querySelectorAll('[name=unit]').forEach((r) =>
        r.addEventListener('change', () => {
          const grams = gramsOf(root);
          unitIdx = Number(r.value);
          // Switching unit: grams keep the current weight, other units start at 1.
          amountIn.value = unitIdx === 0 ? String(Math.round(grams) || 100) : '1';
          update(root);
        })
      );
      setTimeout(() => {
        amountIn.focus();
        amountIn.select();
      }, 300);
    },
    actions: [
      { label: 'ביטול', value: null, kind: 'ghost' },
      {
        label: 'הוספה',
        kind: 'primary',
        onClick: (root) => {
          const amountIn = root.querySelector('[name=amount]');
          const amount = parseNum(amountIn.value);
          if (!(amount > 0)) return invalid(amountIn, 'יש להזין כמות');
          const nameIn = root.querySelector('[name=name]');
          const name = nameIn ? nameIn.value.trim() : food.name;
          if (!name) return invalid(nameIn, 'יש להזין שם');
          return { amount, name, grams: gramsOf(root), preset: root.querySelector('[name=preset]').checked };
        },
      },
    ],
  });
  if (!res) return false;

  const grams = Math.round(res.grams * 10) / 10;
  const { kcal, protein } = calcFood(food, grams);
  updateDay(dayKey, (d) =>
    d.food.push({ name: res.name, grams, kcal, protein, source, time: nowTime(), amount: res.amount, unit: units[unitIdx].l })
  );
  rememberFood(food.key, res.amount, units[unitIdx].l);
  if (food.id && res.name !== food.name) upsertCustomFood({ id: food.id, name: res.name });
  if (res.preset) upsertPreset({ name: res.name, kcal, protein });
  vibrate(20);
  toast(`${res.name} נוסף`);
  return true;
}

/**
 * Product form (own products). With `withAmount`, also asks how much was eaten.
 * Resolves { product, amount } or null.
 */
export async function productSheet({ title, product = {}, message = '', withAmount = false }) {
  const f = (name, label, value, attrs = '') => `<label class="field"><span>${label}</span>
    <input name="${name}" type="number" inputmode="decimal" min="0" step="any" value="${value ?? ''}" ${attrs}></label>`;
  const body = `
    ${message ? `<p class="notice">${icon('alert')}<span>${esc(message)}</span></p>` : ''}
    <label class="field"><span>שם המוצר</span><input name="name" type="text" maxlength="60" value="${esc(product.name || '')}" autocomplete="off"></label>
    <label class="field"><span>ברקוד (רשות)</span><input name="barcode" type="text" inputmode="numeric" maxlength="14" value="${esc(product.barcode || '')}" autocomplete="off"></label>
    <div class="field-grid">
      ${f('kcal100', 'קלוריות ל-100 ג׳', product.kcal100)}
      ${f('protein100', 'חלבון ל-100 ג׳', product.protein100)}
      ${f('servingGrams', 'גרם במנה (רשות)', product.servingGrams)}
      ${withAmount ? f('amount', 'כמה גרם אכלתי', product.servingGrams || 100) : ''}
    </div>`;
  return openSheet({
    title,
    body,
    onOpen: (root) => {
      const first = [...root.querySelectorAll('input')].find((i) => !i.value);
      if (first) setTimeout(() => first.focus(), 300);
    },
    actions: [
      { label: 'ביטול', value: null, kind: 'ghost' },
      {
        label: withAmount ? 'שמירה והוספה' : 'שמירה',
        kind: 'primary',
        onClick: (root) => {
          const q = (n) => root.querySelector(`[name=${n}]`);
          const name = q('name').value.trim();
          if (!name) return invalid(q('name'), 'יש להזין שם');
          const kcal100 = parseNum(q('kcal100').value);
          if (kcal100 === null || kcal100 < 0 || kcal100 > 900) return invalid(q('kcal100'), 'קלוריות לא תקינות');
          const protein100 = parseNum(q('protein100').value);
          if (protein100 === null || protein100 < 0 || protein100 > 100) return invalid(q('protein100'), 'חלבון לא תקין');
          const barcode = q('barcode').value.replace(/\D/g, '');
          if (barcode && !/^\d{6,14}$/.test(barcode)) return invalid(q('barcode'), 'ברקוד לא תקין');
          const serving = parseNum(q('servingGrams').value);
          let amount = null;
          if (withAmount) {
            amount = parseNum(q('amount').value);
            if (!(amount > 0)) return invalid(q('amount'), 'יש להזין כמות');
          }
          return {
            product: {
              id: product.id,
              name,
              barcode: barcode || null,
              kcal100: Math.round(kcal100 * 10) / 10,
              protein100: round1(protein100),
              servingGrams: serving > 0 ? serving : null,
            },
            amount,
          };
        },
      },
    ],
  });
}

const LOOKUP_MESSAGES = {
  network: 'אין חיבור לאינטרנט או שמאגר Open Food Facts לא זמין כרגע. אפשר להזין את פרטי המוצר ידנית.',
  notfound: 'המוצר לא נמצא במאגר. הזינו את הפרטים מהאריזה — בפעם הבאה הוא יזוהה גם בלי אינטרנט.',
  incomplete: 'במאגר חסרים ערכים למוצר הזה. השלימו את החסר מהאריזה.',
};

/** Scan (or type) a barcode → own products → Open Food Facts → amount sheet or manual form. */
export async function scanFlow(dayKey) {
  const code = await openScanner();
  if (!code) return false;
  toast('מחפש מוצר…');
  const r = await lookupBarcode(code);
  if (r.food) return openAmountSheet(dayKey, r.food, { editableName: true, source: 'barcode' });

  return addCustomFlow(dayKey, r.partial, LOOKUP_MESSAGES[r.reason]);
}

/**
 * New own product form (optionally prefilled) → saved to "המוצרים שלי" and added to the day.
 * Used after a failed barcode lookup and by the search's "לא מצאת? הוסף מאכל" row.
 */
export async function addCustomFlow(dayKey, partial = {}, message = '') {
  const res = await productSheet({ title: 'מוצר חדש', product: partial, message, withAmount: true });
  if (!res) return false;
  const saved = upsertCustomFood(res.product);
  const food = fromCustom(saved);
  const { kcal, protein } = calcFood(food, res.amount);
  updateDay(dayKey, (d) =>
    d.food.push({ name: saved.name, grams: res.amount, kcal, protein, source: partial.barcode ? 'barcode' : 'custom', time: nowTime(), amount: res.amount, unit: 'גרם' })
  );
  rememberFood(food.key, res.amount, 'גרם');
  vibrate(20);
  toast(`${saved.name} נשמר ונוסף`);
  return true;
}
