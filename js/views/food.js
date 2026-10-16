// "אוכל" tab: protein ring + calories, meal presets grid, manual entry, day list.
import { getState, getDay, updateDay, upsertPreset, deletePreset } from '../storage.js';
import { ring } from '../charts.js';
import {
  icon, esc, num, parseNum, toast, vibrate, openSheet, confirmDialog, invalid, dateNav, handleDateNav,
} from '../ui.js';
import { foodTotals } from '../stats.js';
import { loadFoodDb, searchFoods } from '../foods.js';
import { openAmountSheet, scanFlow } from '../foodSheets.js';

// Latest search results by key, so a tap can find the food object.
let resultMap = new Map();

export function render(root, ctx) {
  const k = ctx.date;
  const st = getState().settings;
  const presets = getState().mealPresets;
  const day = getDay(k);
  const t = foodTotals(k);
  const target = st.proteinTarget || 0;

  const grid = presets.length
    ? `<div class="preset-grid">${presets
        .map(
          (p) => `<button type="button" class="preset press" data-action="preset-add" data-id="${p.id}">
            <strong>${esc(p.name)}</strong>
            <span>${num(p.kcal || 0)} קק״ל</span>
            <span class="protein-txt">${num(p.protein || 0)} ג׳ חלבון</span>
          </button>`
        )
        .join('')}</div>`
    : '<p class="muted">אין עדיין ארוחות קבועות. אפשר לשמור ארוחה מההזנה הידנית או מכאן.</p>';

  const items = day.food
    .map(
      (f, i) => `<li class="list-row swipe" data-swipe="${i}">
        <div class="grow"><strong>${esc(f.name || 'ללא שם')}</strong>
          <div class="muted small">${f.grams ? `${num(f.grams)} ג׳ · ` : ''}${num(f.kcal || 0)} קק״ל · <span class="protein-txt">${num(f.protein || 0)} ג׳ חלבון</span></div></div>
        <button type="button" class="icon-btn sm press danger-ic" data-action="food-del" data-i="${i}" aria-label="מחיקה">${icon('trash')}</button>
      </li>`
    )
    .join('');

  root.innerHTML = `
    ${dateNav(k, 'אוכל')}
    <section class="card search-card">
      <div class="search-row">
        <label class="search-field">${icon('search')}
          <input type="search" data-search placeholder="חיפוש מזון" aria-label="חיפוש מזון" autocomplete="off" enterkeyhint="search"></label>
        <button type="button" class="icon-btn scan-btn press" data-action="scan" aria-label="סריקת ברקוד">${icon('barcode')}</button>
      </div>
      <div class="search-results" data-results hidden></div>
    </section>
    <section class="card totals">
      ${ring({
        id: 'protein', size: 150, stroke: 14, frac: target ? t.protein / target : 0,
        color: target && t.protein >= target ? 'var(--success)' : 'var(--protein)',
        inner: `<div class="ring-big sm">${num(t.protein)}</div><div class="muted small">מתוך ${num(target)} ג׳</div>`,
      })}
      <div class="totals-side">
        <div class="eyebrow protein-txt">חלבון</div>
        <div class="kcal">${num(t.kcal)}</div>
        <div class="muted">קלוריות</div>
      </div>
    </section>

    <section class="card">
      <div class="card-head">${icon('bolt', 'head-ic')}<h2>ארוחות קבועות</h2>
        <button type="button" class="icon-btn sm press" data-action="presets-manage" aria-label="ניהול ארוחות קבועות">${icon('settings')}</button></div>
      ${grid}
    </section>

    <section class="card">
      <div class="card-head">${icon('plus', 'head-ic')}<h2>הזנה ידנית</h2></div>
      <label class="field"><span>שם</span><input type="text" maxlength="40" data-f="name" autocomplete="off"></label>
      <div class="field-grid">
        <label class="field"><span>קלוריות</span><input type="number" inputmode="numeric" min="0" data-f="kcal" placeholder="0"></label>
        <label class="field"><span>חלבון (ג׳)</span><input type="number" inputmode="decimal" min="0" data-f="protein" placeholder="0"></label>
      </div>
      <label class="check"><input type="checkbox" data-f="save"><span class="check-box">${icon('check')}</span><span>שמור כארוחה קבועה</span></label>
      <button type="button" class="btn primary block press" data-action="food-add">${icon('plus')}<span>הוספה</span></button>
    </section>

    <section class="card">
      <div class="card-head">${icon('list', 'head-ic')}<h2>מה אכלתי</h2><span class="muted small">${num(day.food.length)} פריטים</span></div>
      ${items ? `<ul class="list">${items}</ul><p class="hint">החלקה הצידה למחיקה</p>` : '<p class="muted">עדיין לא נוספו פריטים ביום הזה.</p>'}
    </section>`;

  root.onclick = (e) => onClick(e, ctx);
  root.onchange = null;
  root.oninput = (e) => {
    if (e.target.matches('[data-search]')) updateResults(root, e.target.value);
  };
  bindSwipe(root, ctx);
}

/* ---------- Search ---------- */

let searchSeq = 0;
async function updateResults(root, query) {
  const box = root.querySelector('[data-results]');
  if (!box) return;
  const seq = ++searchSeq;
  if (!query.trim()) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.hidden = false;
  let db;
  try {
    const pending = loadFoodDb();
    if (!box.innerHTML) box.innerHTML = '<p class="muted small">טוען מאגר מזון…</p>';
    db = await pending;
  } catch {
    db = []; // DB unavailable (first load offline) — own products still searchable
  }
  if (seq !== searchSeq) return; // a newer keystroke won
  const results = searchFoods(db, query);
  resultMap = new Map(results.map((f) => [f.key, f]));
  box.innerHTML = results.length
    ? `<ul class="list">${results
        .map(
          (f) => `<li><button type="button" class="food-result press" data-action="food-pick" data-key="${esc(f.key)}">
            <span class="grow"><strong>${esc(f.name)}</strong>
              <span class="muted small">${num(f.kcal100)} קק״ל · <span class="protein-txt">${num(f.protein100)} ג׳ חלבון</span> · ל-100 ג׳</span></span>
            ${f.source === 'custom' ? `<span class="badge">${icon(f.barcode ? 'barcode' : 'box')}<span>שלי</span></span>` : ''}
            ${icon('plus', 'add-ic')}
          </button></li>`
        )
        .join('')}</ul>`
    : `<p class="muted small">לא נמצאו תוצאות${db.length ? '' : ' (מאגר המזון ייטען כשיהיה חיבור)'}. אפשר להזין ידנית למטה.</p>`;
}

async function onClick(e, ctx) {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  const a = b.dataset.action;
  const k = ctx.date;
  if (handleDateNav(a, ctx)) return ctx.rerender();

  switch (a) {
    case 'food-pick': {
      const food = resultMap.get(b.dataset.key);
      if (food && (await openAmountSheet(k, food))) ctx.rerender();
      return;
    }
    case 'scan':
      if (await scanFlow(k)) ctx.rerender();
      return;
    case 'preset-add': {
      const p = getState().mealPresets.find((m) => m.id === b.dataset.id);
      if (!p) return;
      updateDay(k, (d) => d.food.push({ name: p.name, grams: null, kcal: p.kcal || 0, protein: p.protein || 0, source: 'preset' }));
      vibrate(20);
      toast(`${p.name} נוסף`);
      return ctx.rerender();
    }
    case 'food-add': {
      const card = b.closest('.card');
      const q = (n) => card.querySelector(`[data-f=${n}]`);
      const name = q('name').value.trim();
      const kcal = parseNum(q('kcal').value);
      const protein = parseNum(q('protein').value);
      if (!name && kcal === null && protein === null) return invalid(q('name'), 'יש להזין שם או ערכים');
      if (q('save').checked && !name) return invalid(q('name'), 'כדי לשמור ארוחה קבועה יש לתת לה שם');
      const item = { name: name || 'ללא שם', kcal: Math.max(0, kcal || 0), protein: Math.max(0, protein || 0) };
      updateDay(k, (d) => d.food.push({ ...item, grams: null, source: 'manual' }));
      if (q('save').checked) upsertPreset({ ...item });
      vibrate(20);
      toast('נוסף');
      return ctx.rerender();
    }
    case 'food-del':
      removeFood(ctx, Number(b.dataset.i));
      return;
    case 'presets-manage':
      await managePresets();
      return ctx.rerender();
  }
}

function removeFood(ctx, i) {
  const item = getDay(ctx.date).food[i];
  if (!item) return;
  updateDay(ctx.date, (d) => d.food.splice(i, 1));
  toast(`${item.name} הוסר`);
  ctx.rerender();
}

/** Horizontal swipe (either direction) past a threshold deletes a food row. */
function bindSwipe(root, ctx) {
  root.querySelectorAll('[data-swipe]').forEach((row) => {
    let x0 = null, y0 = 0, dx = 0, horizontal = false;
    row.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      x0 = e.clientX; y0 = e.clientY; dx = 0; horizontal = false;
    });
    row.addEventListener('pointermove', (e) => {
      if (x0 === null) return;
      dx = e.clientX - x0;
      if (!horizontal && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(e.clientY - y0)) {
        horizontal = true;
        row.setPointerCapture?.(e.pointerId);
      }
      if (horizontal) {
        row.style.transform = `translateX(${dx}px)`;
        row.style.opacity = String(Math.max(0.2, 1 - Math.abs(dx) / 220));
      }
    });
    const end = () => {
      if (x0 === null) return;
      x0 = null;
      if (horizontal && Math.abs(dx) > 110) {
        row.classList.add('swiped');
        vibrate(20);
        setTimeout(() => removeFood(ctx, Number(row.dataset.swipe)), 160);
      } else {
        row.style.transform = '';
        row.style.opacity = '';
      }
    };
    row.addEventListener('pointerup', end);
    row.addEventListener('pointercancel', end);
  });
}

/* ---------- Preset management ---------- */

async function managePresets() {
  for (;;) {
    const presets = getState().mealPresets;
    const rows = presets
      .map(
        (p) => `<li class="list-row">
          <div class="grow"><strong>${esc(p.name)}</strong>
            <div class="muted small">${num(p.kcal || 0)} קק״ל · ${num(p.protein || 0)} ג׳ חלבון</div></div>
          <button type="button" class="icon-btn sm press" data-pm="edit" data-id="${p.id}" aria-label="עריכה">${icon('edit')}</button>
          <button type="button" class="icon-btn sm press danger-ic" data-pm="del" data-id="${p.id}" aria-label="מחיקה">${icon('trash')}</button>
        </li>`
      )
      .join('');
    let picked = null;
    const res = await openSheet({
      title: 'ארוחות קבועות',
      body: `<ul class="list">${rows || '<li class="empty">אין ארוחות קבועות</li>'}</ul>`,
      onOpen: (root) =>
        root.querySelector('.sheet-body').addEventListener('click', (e) => {
          const b = e.target.closest('[data-pm]');
          if (!b) return;
          picked = { op: b.dataset.pm, id: b.dataset.id };
          root.querySelector('[data-sheet-i="0"]').click(); // close the list sheet
        }),
      actions: [
        { label: 'סגירה', value: 'close', kind: 'ghost', onClick: () => (picked ? 'pick' : 'close') },
        { label: 'ארוחה חדשה', value: 'new', kind: 'primary' },
      ],
    });
    if (res === 'new') await editPreset(null);
    else if (res === 'pick' && picked.op === 'edit') await editPreset(presets.find((p) => p.id === picked.id));
    else if (res === 'pick' && picked.op === 'del') {
      const p = presets.find((x) => x.id === picked.id);
      if (p && (await confirmDialog(`למחוק את "${p.name}"?`, { title: 'מחיקת ארוחה', ok: 'מחיקה', danger: true }))) {
        deletePreset(p.id);
      }
    } else return;
  }
}

async function editPreset(p) {
  const res = await openSheet({
    title: p ? 'עריכת ארוחה' : 'ארוחה חדשה',
    body: `<label class="field"><span>שם</span><input name="name" type="text" maxlength="40" value="${esc(p?.name || '')}" autocomplete="off"></label>
      <div class="field-grid">
        <label class="field"><span>קלוריות</span><input name="kcal" type="number" inputmode="numeric" min="0" value="${p?.kcal ?? ''}"></label>
        <label class="field"><span>חלבון (ג׳)</span><input name="protein" type="number" inputmode="decimal" min="0" value="${p?.protein ?? ''}"></label>
      </div>`,
    actions: [
      { label: 'ביטול', value: null, kind: 'ghost' },
      {
        label: 'שמירה',
        kind: 'primary',
        onClick: (root) => {
          const name = root.querySelector('[name=name]').value.trim();
          if (!name) return invalid(root.querySelector('[name=name]'), 'יש להזין שם');
          return {
            id: p?.id,
            name,
            kcal: Math.max(0, parseNum(root.querySelector('[name=kcal]').value) || 0),
            protein: Math.max(0, parseNum(root.querySelector('[name=protein]').value) || 0),
          };
        },
      },
    ],
  });
  if (res) {
    upsertPreset(res);
    toast('נשמר');
  }
}
