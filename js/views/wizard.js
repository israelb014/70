// First-run setup wizard: one step per screen. Values are editable later in "הגדרות".
import { getState, updateSettings } from '../storage.js';
import { icon, esc, parseNum, invalid, confirmDialog, toast } from '../ui.js';
import { readBackupFile, restoreBackup } from '../export.js';
import { exerciseEditorHTML, handleExerciseAction } from '../exerciseEditor.js';

/** All numeric settings with labels and defaults (shared with the settings screen). */
export const SETTINGS_FIELDS = {
  startWeight: { label: 'משקל התחלתי', unit: 'ק״ג', required: true, step: 0.1, min: 20, max: 400 },
  targetWeight: { label: 'משקל יעד', unit: 'ק״ג', required: true, step: 0.1, min: 20, max: 400 },
  height: { label: 'גובה (רשות)', unit: 'ס״מ', step: 1, min: 50, max: 260 },
  proteinTarget: { label: 'יעד חלבון יומי', unit: 'גרם', def: 150, required: true, step: 1, min: 1 },
  stepsTarget: { label: 'יעד צעדים יומי', unit: 'צעדים', def: 12000, required: true, step: 100, min: 1 },
  rideGoalKm: { label: 'יעד לרכיבה בודדת', unit: 'ק״מ', def: 45, required: true, step: 1, min: 1 },
  climbsTarget: { label: 'יעד עליות יומי', unit: 'עליות', def: 6, required: true, step: 1, min: 1 },
  floorsRegular: { label: 'קומות בעלייה רגילה', unit: 'קומות', def: 6, required: true, step: 1, min: 1 },
  floorsRoof: { label: 'קומות בעלייה לגג', unit: 'קומות', def: 10, required: true, step: 1, min: 1 },
  sleepTarget: { label: 'יעד שינה', unit: 'שעות', def: 8, step: 0.5, min: 3, max: 14 },
};

export function fieldHTML(key, value) {
  const f = SETTINGS_FIELDS[key];
  return `<label class="field big-field"><span>${esc(f.label)} <em>${esc(f.unit)}</em></span>
    <input type="number" inputmode="decimal" name="${key}" data-setting="${key}" step="${f.step}" min="${f.min ?? 0}"
      ${f.max ? `max="${f.max}"` : ''} value="${value ?? ''}" enterkeyhint="next"></label>`;
}

/** Validate a single settings value. Returns { ok, value } — value null when empty & optional. */
export function validateField(key, raw) {
  const f = SETTINGS_FIELDS[key];
  const v = parseNum(raw);
  if (v === null) return { ok: !f.required, value: null };
  if (v < (f.min ?? 0) || (f.max && v > f.max)) return { ok: false };
  return { ok: true, value: f.step < 1 ? Math.round(v * 10) / 10 : Math.round(v) };
}

const STEPS = [
  { title: 'נתוני פתיחה', text: 'מאיפה מתחילים ולאן רוצים להגיע.', fields: ['startWeight', 'targetWeight', 'height'] },
  { title: 'חלבון', text: 'כמה גרם חלבון ביום?', fields: ['proteinTarget'] },
  { title: 'צעדים', text: 'יעד הצעדים היומי.', fields: ['stepsTarget'] },
  { title: 'רכיבה', text: 'מרחק היעד לרכיבה אחת.', fields: ['rideGoalKm'] },
  { title: 'מדרגות', text: 'כמה עליות ביום, וכמה קומות בכל סוג עלייה.', fields: ['climbsTarget', 'floorsRegular', 'floorsRoof'] },
  { title: 'שינה', text: 'כמה שעות שינה בלילה? אפשר להשאיר 8 ולהמשיך.', fields: ['sleepTarget'] },
  { title: 'תרגילים', text: 'הוסיפו את התרגילים הקבועים. אפשר גם לדלג ולהוסיף בהמשך בהגדרות.', exercises: true },
];

const wiz = { step: 0, draft: {} };

export function render(root, onDone) {
  if (!Object.keys(wiz.draft).length) {
    for (const [k, f] of Object.entries(SETTINGS_FIELDS)) wiz.draft[k] = f.def ?? null;
  }
  const s = STEPS[wiz.step];
  const last = wiz.step === STEPS.length - 1;
  const dots = STEPS.map((_, i) => `<span class="dot ${i === wiz.step ? 'on' : i < wiz.step ? 'past' : ''}"></span>`).join('');
  const hasEx = getState().exercises.some((e) => !e.archived);

  root.innerHTML = `<div class="wizard">
    ${wiz.step === 0 ? `<div class="wiz-brand"><span>70</span></div>` : ''}
    <div class="wiz-dots" aria-label="שלב ${wiz.step + 1} מתוך ${STEPS.length}">${dots}</div>
    <span class="eyebrow">שלב ${wiz.step + 1} מתוך ${STEPS.length}</span>
    <h1>${esc(s.title)}</h1>
    <p class="muted lead">${esc(s.text)}</p>
    <section class="card wiz-card">
      ${s.exercises ? exerciseEditorHTML() : s.fields.map((k) => fieldHTML(k, wiz.draft[k])).join('')}
    </section>
    <div class="wiz-nav">
      ${wiz.step > 0 ? `<button type="button" class="btn ghost press" data-action="wiz-back">${icon('chevR')}<span>חזרה</span></button>` : '<span></span>'}
      <button type="button" class="btn primary press" data-action="wiz-next">
        <span>${last ? (hasEx ? 'סיום' : 'דלג וסיים') : 'המשך'}</span>${last ? icon('check') : icon('chevL')}</button>
    </div>
    ${wiz.step === 0 ? `<button type="button" class="link-btn" data-action="wiz-restore">${icon('upload')} יש לי גיבוי — שחזור</button>
      <input type="file" accept="application/json,.json" data-wiz-file hidden>` : ''}
  </div>`;

  if (!s.exercises) setTimeout(() => root.querySelector('input')?.focus({ preventScroll: true }), 50);

  const rerender = () => render(root, onDone);

  // Restore a backup straight from the first screen (e.g. on a new phone).
  root.onchange = async (e) => {
    const file = e.target.matches('[data-wiz-file]') && e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const { data, error } = await readBackupFile(file);
    if (error) return void (await confirmDialog(error, { title: 'שחזור נכשל', ok: 'הבנתי', cancel: 'סגירה' }));
    if (!(await confirmDialog('הנתונים מהגיבוי ייטענו למכשיר. להמשיך?', { title: 'שחזור מגיבוי', ok: 'שחזור' }))) return;
    if (restoreBackup(data)) toast('הגיבוי שוחזר');
    wiz.step = 0;
    wiz.draft = {};
    onDone();
  };
  root.onkeydown = (e) => {
    if (e.key === 'Enter' && e.target.matches('input')) {
      e.preventDefault();
      const inputs = [...root.querySelectorAll('input')];
      const next = inputs[inputs.indexOf(e.target) + 1];
      if (next) next.focus();
      else root.querySelector('[data-action=wiz-next]').click();
    }
  };
  root.onclick = async (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const a = b.dataset.action;
    if (a.startsWith('ex-')) {
      if (await handleExerciseAction(a, b.dataset.id)) rerender();
      return;
    }
    if (a === 'wiz-restore') return root.querySelector('[data-wiz-file]').click();
    if (a === 'wiz-back') {
      collect(root);
      wiz.step--;
      return rerender();
    }
    if (a === 'wiz-next') {
      if (!s.exercises && !collect(root, true)) return;
      if (s.fields?.includes('targetWeight') && wiz.draft.startWeight === wiz.draft.targetWeight) {
        return invalid(root.querySelector('[name=targetWeight]'), 'משקל היעד צריך להיות שונה מהמשקל ההתחלתי');
      }
      if (last) {
        updateSettings({ ...wiz.draft, sleepTarget: wiz.draft.sleepTarget || 8 });
        wiz.step = 0;
        wiz.draft = {};
        return onDone();
      }
      wiz.step++;
      rerender();
      window.scrollTo(0, 0);
    }
  };
}

/** Read the step's inputs into the draft; with `strict`, block on invalid values. */
function collect(root, strict = false) {
  for (const input of root.querySelectorAll('[data-setting]')) {
    const key = input.dataset.setting;
    const r = validateField(key, input.value);
    if (!r.ok) {
      if (strict) return invalid(input, `ערך לא תקין: ${SETTINGS_FIELDS[key].label}`);
      continue;
    }
    wiz.draft[key] = r.value;
  }
  return true;
}
