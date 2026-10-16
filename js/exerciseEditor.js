// Exercise list editor (add / edit / delete / reorder). Shared by the wizard and settings.
import { activeExercises, upsertExercise, archiveExercise, moveExercise, exerciseById } from './storage.js';
import { icon, esc, openSheet, confirmDialog, parseNum, invalid, num } from './ui.js';

export const TYPE_LABELS = {
  setsReps: 'סטים × חזרות',
  timed: 'החזקה בזמן',
  maxReps: 'סט אחד עד כשל',
};

/** Short Hebrew description of an exercise target, e.g. "3×20 · 10 ק״ג לכל יד". */
export function targetText(ex) {
  let t = '';
  if (ex.type === 'setsReps') t = `${num(`${ex.sets}×${ex.reps}`)}`;
  else if (ex.type === 'timed') t = `${num(ex.seconds)} שניות`;
  else t = ex.reps ? `יעד ${num(ex.reps)} חזרות` : 'עד כשל';
  if (ex.weight) t += ` · ${num(ex.weight)} ק״ג לכל יד`;
  return t;
}

export function exerciseEditorHTML() {
  const list = activeExercises();
  const rows = list
    .map(
      (ex, i) => `<li class="ex-row">
        <div class="ex-row-main">
          <strong>${esc(ex.name)}</strong>
          <span class="muted small">${TYPE_LABELS[ex.type]} · ${targetText(ex)}</span>
        </div>
        <div class="ex-row-actions">
          <button type="button" class="icon-btn sm press" data-action="ex-up" data-id="${ex.id}" aria-label="הזזה למעלה" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button>
          <button type="button" class="icon-btn sm press" data-action="ex-down" data-id="${ex.id}" aria-label="הזזה למטה" ${i === list.length - 1 ? 'disabled' : ''}>${icon('down')}</button>
          <button type="button" class="icon-btn sm press" data-action="ex-edit" data-id="${ex.id}" aria-label="עריכה">${icon('edit')}</button>
          <button type="button" class="icon-btn sm press danger-ic" data-action="ex-del" data-id="${ex.id}" aria-label="מחיקה">${icon('trash')}</button>
        </div>
      </li>`
    )
    .join('');
  return `<ul class="ex-list">${rows || '<li class="empty">עדיין אין תרגילים</li>'}</ul>
    <button type="button" class="btn secondary press block" data-action="ex-add">${icon('plus')}<span>הוספת תרגיל</span></button>`;
}

/** Handle an editor action. Resolves true when something changed (caller re-renders). */
export async function handleExerciseAction(action, id) {
  switch (action) {
    case 'ex-add':
      return editExercise(null);
    case 'ex-edit':
      return editExercise(exerciseById(id));
    case 'ex-up':
      moveExercise(id, -1);
      return true;
    case 'ex-down':
      moveExercise(id, 1);
      return true;
    case 'ex-del': {
      const ex = exerciseById(id);
      if (!ex) return false;
      const ok = await confirmDialog(`למחוק את "${ex.name}"? ההיסטוריה של התרגיל תישמר.`, {
        title: 'מחיקת תרגיל',
        ok: 'מחיקה',
        danger: true,
      });
      if (ok) archiveExercise(id);
      return ok;
    }
    default:
      return false;
  }
}

async function editExercise(ex) {
  const e = ex || { type: 'setsReps', sets: 3, reps: 10 };
  const field = (name, label, value, attrs = '') => `<label class="field" data-for="${name}">
      <span>${label}</span>
      <input name="${name}" type="number" inputmode="decimal" value="${value ?? ''}" ${attrs}>
    </label>`;
  const body = `
    <label class="field"><span>שם התרגיל</span>
      <input name="name" type="text" maxlength="40" value="${esc(e.name || '')}" autocomplete="off" enterkeyhint="done"></label>
    <div class="segmented" role="radiogroup" aria-label="סוג">
      ${Object.entries(TYPE_LABELS)
        .map(([t, l]) => `<label><input type="radio" name="type" value="${t}" ${e.type === t ? 'checked' : ''}><span>${l}</span></label>`)
        .join('')}
    </div>
    <div class="field-grid">
      ${field('sets', 'מספר סטים', e.sets ?? 3, 'min="1" max="20" data-types="setsReps"')}
      ${field('reps', 'חזרות בסט', e.type === 'setsReps' ? e.reps : 10, 'min="1" data-types="setsReps"')}
      ${field('seconds', 'שניות יעד', e.seconds ?? 60, 'min="1" data-types="timed"')}
      ${field('maxReps', 'יעד חזרות (רשות)', e.type === 'maxReps' ? e.reps : '', 'min="1" data-types="maxReps"')}
      ${field('weight', 'משקל לכל יד, ק״ג (רשות)', e.weight, 'min="0" step="0.5"')}
    </div>`;

  const sync = (root) => {
    const type = root.querySelector('input[name=type]:checked').value;
    root.querySelectorAll('[data-types]').forEach((inp) => {
      inp.closest('.field').hidden = !inp.dataset.types.split(',').includes(type);
    });
  };

  const result = await openSheet({
    title: ex ? 'עריכת תרגיל' : 'תרגיל חדש',
    body,
    onOpen: (root) => {
      sync(root);
      root.querySelectorAll('input[name=type]').forEach((r) => r.addEventListener('change', () => sync(root)));
      if (!ex) setTimeout(() => root.querySelector('input[name=name]').focus(), 300);
    },
    actions: [
      { label: 'ביטול', value: null, kind: 'ghost' },
      {
        label: 'שמירה',
        kind: 'primary',
        onClick: (root) => {
          const q = (n) => root.querySelector(`[name=${n}]`);
          const name = q('name').value.trim();
          if (!name) return invalid(q('name'), 'יש להזין שם');
          const type = root.querySelector('input[name=type]:checked').value;
          const weight = parseNum(q('weight').value);
          const out = { id: ex?.id, name, type, weight: weight > 0 ? weight : null, sets: null, reps: null, seconds: null };
          if (type === 'setsReps') {
            out.sets = Math.round(parseNum(q('sets').value));
            out.reps = Math.round(parseNum(q('reps').value));
            if (!(out.sets >= 1)) return invalid(q('sets'), 'מספר סטים לא תקין');
            if (!(out.reps >= 1)) return invalid(q('reps'), 'מספר חזרות לא תקין');
          } else if (type === 'timed') {
            out.seconds = Math.round(parseNum(q('seconds').value));
            if (!(out.seconds >= 1)) return invalid(q('seconds'), 'מספר שניות לא תקין');
          } else {
            const r = parseNum(q('maxReps').value);
            out.reps = r > 0 ? Math.round(r) : null;
          }
          return out;
        },
      },
    ],
  });
  if (!result) return false;
  // A changed target resets remembered values so prefills follow the new target.
  if (ex && (ex.type !== result.type || ex.sets !== result.sets || ex.reps !== result.reps ||
      ex.seconds !== result.seconds || (ex.weight ?? null) !== result.weight)) {
    result.last = null;
  }
  upsertExercise(result);
  return true;
}
