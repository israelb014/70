// "הגדרות" tab: goals, exercise editor, backup / restore, delete all data, version.
import { getState, updateSettings, resetAll } from '../storage.js';
import { icon, toast, confirmDialog, invalid } from '../ui.js';
import { SETTINGS_FIELDS, fieldHTML, validateField } from './wizard.js';
import { exerciseEditorHTML, handleExerciseAction } from '../exerciseEditor.js';
import { exportBackup, readBackupFile, restoreBackup } from '../export.js';
import { APP_VERSION } from '../config.js';

const GROUPS = [
  { title: 'משקל וגוף', icon: 'scale', keys: ['startWeight', 'targetWeight', 'height'] },
  { title: 'יעדים יומיים', icon: 'today', keys: ['proteinTarget', 'stepsTarget', 'rideGoalKm'] },
  { title: 'מדרגות', icon: 'stairs', keys: ['climbsTarget', 'floorsRegular', 'floorsRoof'] },
];

export function render(root, ctx) {
  const st = getState().settings;
  root.innerHTML = `
    <header class="page-head"><span class="eyebrow">70</span><h1>הגדרות</h1></header>
    ${GROUPS.map(
      (g) => `<section class="card">
        <div class="card-head">${icon(g.icon, 'head-ic')}<h2>${g.title}</h2></div>
        <div class="field-grid">${g.keys.map((k) => fieldHTML(k, st[k])).join('')}</div>
      </section>`
    ).join('')}
    <section class="card">
      <div class="card-head">${icon('dumbbell', 'head-ic')}<h2>תרגילים</h2></div>
      ${exerciseEditorHTML()}
    </section>
    <section class="card">
      <div class="card-head">${icon('download', 'head-ic')}<h2>גיבוי</h2></div>
      <p class="muted small">הנתונים נשמרים רק במכשיר הזה. מומלץ לייצא גיבוי מדי פעם.</p>
      <div class="btn-col">
        <button type="button" class="btn secondary block press" data-action="export">${icon('download')}<span>ייצוא גיבוי</span></button>
        <button type="button" class="btn secondary block press" data-action="import">${icon('upload')}<span>שחזור מגיבוי</span></button>
      </div>
      <input type="file" accept="application/json,.json" data-file hidden>
    </section>
    <section class="card danger-card">
      <div class="card-head">${icon('alert', 'head-ic')}<h2>אזור מסוכן</h2></div>
      <button type="button" class="btn danger block press" data-action="wipe">${icon('trash')}<span>מחיקת כל הנתונים</span></button>
    </section>
    <p class="version">70 · גרסה <bdi class="num">${APP_VERSION}</bdi></p>`;

  root.onclick = (e) => onClick(e, ctx, root);
  root.onchange = (e) => onChange(e, ctx);
}

function onChange(e, ctx) {
  const t = e.target;
  if (t.dataset.setting) {
    const key = t.dataset.setting;
    const r = validateField(key, t.value);
    if (!r.ok) {
      invalid(t, `ערך לא תקין: ${SETTINGS_FIELDS[key].label}`);
      t.value = getState().settings[key] ?? '';
      return;
    }
    updateSettings({ [key]: r.value });
    toast('נשמר');
  } else if (t.matches('[data-file]') && t.files?.[0]) {
    importFile(t.files[0], ctx);
    t.value = '';
  }
}

async function onClick(e, ctx, root) {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  const a = b.dataset.action;
  if (a.startsWith('ex-')) {
    if (await handleExerciseAction(a, b.dataset.id)) ctx.rerender();
    return;
  }
  switch (a) {
    case 'export':
      exportBackup();
      toast('קובץ הגיבוי נוצר');
      return;
    case 'import':
      root.querySelector('[data-file]').click();
      return;
    case 'wipe': {
      const first = await confirmDialog('כל הנתונים במכשיר יימחקו: הגדרות, תרגילים, היסטוריה ושקילות.', {
        title: 'מחיקת כל הנתונים', ok: 'המשך', danger: true,
      });
      if (!first) return;
      const second = await confirmDialog('זו הפעולה האחרונה ואין דרך לבטל אותה. למחוק הכול?', {
        title: 'בטוח?', ok: 'מחיקה סופית', danger: true,
      });
      if (!second) return;
      resetAll();
      toast('כל הנתונים נמחקו');
      ctx.rerender();
    }
  }
}

async function importFile(file, ctx) {
  const { data, error } = await readBackupFile(file);
  if (error) {
    await confirmDialog(error, { title: 'שחזור נכשל', ok: 'הבנתי', cancel: 'סגירה' });
    return;
  }
  const ok = await confirmDialog('הנתונים הנוכחיים במכשיר יוחלפו בנתונים מהגיבוי. להמשיך?', {
    title: 'שחזור מגיבוי', ok: 'שחזור', danger: true,
  });
  if (!ok) return;
  if (restoreBackup(data)) toast('הגיבוי שוחזר');
  ctx.rerender();
}
