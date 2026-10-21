// "הגדרות" tab: goals, exercise editor, backup / restore, delete all data, version.
import { getState, updateSettings, resetAll, upsertCustomFood, deleteCustomFood } from '../storage.js';
import { icon, esc, num, toast, confirmDialog, invalid } from '../ui.js';
import { productSheet } from '../foodSheets.js';
import { SETTINGS_FIELDS, fieldHTML, validateField } from './wizard.js';
import { exerciseEditorHTML, handleExerciseAction } from '../exerciseEditor.js';
import { exportBackup, readBackupFile, restoreBackup, canShareBackup, shareBackup, lastBackupDate } from '../export.js';
import { APP_VERSION } from '../config.js';
import { floorsTarget } from '../stats.js';
import { photoSettingsCard, savePhotoSetting, backupPhotos, restorePhotos } from './photos.js';
import { deleteAllPhotos } from '../photos.js';

const GROUPS = [
  { title: 'משקל וגוף', icon: 'scale', keys: ['startWeight', 'targetWeight', 'height'] },
  { title: 'יעדים יומיים', icon: 'today', keys: ['proteinTarget', 'stepsTarget', 'rideGoalKm', 'sleepTarget', 'waterTarget'] },
  { title: 'מדרגות', icon: 'stairs', keys: ['climbsTarget', 'floorsRegular', 'floorsRoof'] },
];

export function render(root, ctx) {
  const st = getState().settings;
  root.innerHTML = `
    <header class="page-head"><h1>הגדרות</h1></header>
    ${GROUPS.map(
      (g) => `<section class="card">
        <div class="card-head">${icon(g.icon, 'head-ic')}<h2>${g.title}</h2></div>
        <div class="field-grid">${g.keys.map((k) => fieldHTML(k, st[k])).join('')}</div>
        ${g.keys.includes('climbsTarget') ? `<p class="muted small" data-floors-target>${floorsTargetText(st)}</p>` : ''}
      </section>`
    ).join('')}
    <section class="card">
      <div class="card-head">${icon('dumbbell', 'head-ic')}<h2>תרגילים</h2></div>
      ${exerciseEditorHTML()}
    </section>
    ${productsCard()}
    <section class="card">
      <div class="card-head">${icon('download', 'head-ic')}<h2>גיבוי</h2></div>
      <p class="muted small">הנתונים נשמרים רק במכשיר הזה. מומלץ לייצא גיבוי מדי פעם.</p>
      <p class="backup-last" data-backup-last>${lastBackupDate() ? `גיבוי אחרון: <bdi class="num">${lastBackupDate()}</bdi>` : 'עוד לא בוצע גיבוי'}</p>
      <div class="btn-col">
        <button type="button" class="btn secondary block press" data-action="export">${icon('download')}<span>ייצוא גיבוי</span></button>
        ${canShareBackup() ? `<button type="button" class="btn secondary block press" data-action="share-backup">${icon('share')}<span>שיתוף הקובץ</span></button>` : ''}
        <button type="button" class="btn secondary block press" data-action="import">${icon('upload')}<span>שחזור מגיבוי</span></button>
      </div>
      <input type="file" accept="application/json,.json" data-file hidden>
    </section>
    ${photoSettingsCard()}
    <section class="card danger-card">
      <div class="card-head">${icon('alert', 'head-ic')}<h2>אזור מסוכן</h2></div>
      <button type="button" class="btn danger block press" data-action="wipe">${icon('trash')}<span>מחיקת כל הנתונים</span></button>
    </section>
    <p class="version">70 · גרסה <bdi class="num">${APP_VERSION}</bdi><br>
      <span data-db-about>מאגר המזון: מזונות נפוצים בישראל (תוויות מוצרים, USDA, צמרת) · ברקודים: Open Food Facts</span></p>`;
  fillDbAbout(root);

  root.onclick = (e) => onClick(e, ctx, root);
  root.onchange = (e) => onChange(e, ctx);
}

/** Fill the about line with item counts per source and the database build date. */
async function fillDbAbout(root) {
  try {
    const meta = await (await fetch('./data/foods-meta.json')).json();
    const el = root.querySelector('[data-db-about]');
    if (!el || !meta?.counts) return;
    const c = meta.counts;
    const parts = [
      c.label ? `${num(c.label)} מתוויות מוצרים` : '',
      c.curated ? `${num(c.curated)} מרשימה מובנית (USDA)` : '',
      c.tzameret ? `${num(c.tzameret)} מצמרת (משרד הבריאות)` : '',
    ].filter(Boolean);
    const built = meta.builtAt ? new Date(meta.builtAt).toLocaleDateString('he-IL') : '';
    el.innerHTML = `מאגר המזון: ${num(meta.total)} פריטים · ${parts.join(' · ')}${built ? ` · נבנה ${num(built)}` : ''}<br>ברקודים וחיפוש ברשת: Open Food Facts`;
  } catch {
    /* offline before first load — keep the static line */
  }
}

function productsCard() {
  const list = getState().customFoods;
  const rows = list
    .map(
      (p) => `<li class="list-row">
        <div class="grow"><strong>${esc(p.name)}</strong>
          <div class="muted small">${num(p.kcal100)} קק״ל · ${num(p.protein100)} ג׳ חלבון ל-100 ג׳${p.barcode ? ` · <bdi class="num">${esc(p.barcode)}</bdi>` : ''}</div></div>
        <button type="button" class="icon-btn sm press" data-action="prod-edit" data-id="${p.id}" aria-label="עריכה">${icon('edit')}</button>
        <button type="button" class="icon-btn sm press danger-ic" data-action="prod-del" data-id="${p.id}" aria-label="מחיקה">${icon('trash')}</button>
      </li>`
    )
    .join('');
  return `<section class="card">
    <div class="card-head">${icon('box', 'head-ic')}<h2>המוצרים שלי</h2><span class="muted small">${num(list.length)}</span></div>
    ${rows ? `<ul class="list">${rows}</ul>` : '<p class="muted small">מוצרים שנסרקו או שהוספתם יופיעו כאן, ויעבדו גם בלי אינטרנט.</p>'}
    <button type="button" class="btn secondary block press" data-action="prod-add">${icon('plus')}<span>מוצר חדש</span></button>
  </section>`;
}

/** "יעד יומי: 36 קומות" = climbsTarget × floorsRegular. */
function floorsTargetText(st) {
  const t = floorsTarget(st);
  return `יעד יומי: ${t === 1 ? 'קומה אחת' : `${num(t)} קומות`}`;
}

function onChange(e, ctx) {
  const t = e.target;
  if (t.dataset.photoSetting) {
    savePhotoSetting(t);
  } else if (t.matches('[data-photo-file]') && t.files?.[0]) {
    restorePhotos(t.files[0], ctx);
    t.value = '';
  } else if (t.dataset.setting) {
    const key = t.dataset.setting;
    const r = validateField(key, t.value);
    if (!r.ok) {
      invalid(t, `ערך לא תקין: ${SETTINGS_FIELDS[key].label}`);
      t.value = getState().settings[key] ?? '';
      return;
    }
    updateSettings({ [key]: r.value });
    const ft = document.querySelector('[data-floors-target]');
    if (ft) ft.innerHTML = floorsTargetText(getState().settings);
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
    case 'prod-add':
    case 'prod-edit': {
      const product = a === 'prod-edit' ? getState().customFoods.find((p) => p.id === b.dataset.id) : {};
      if (!product) return;
      const res = await productSheet({ title: a === 'prod-add' ? 'מוצר חדש' : 'עריכת מוצר', product });
      if (res) {
        upsertCustomFood(res.product);
        toast('נשמר');
        ctx.rerender();
      }
      return;
    }
    case 'prod-del': {
      const p = getState().customFoods.find((x) => x.id === b.dataset.id);
      if (p && (await confirmDialog(`למחוק את "${p.name}" מהמוצרים שלי?`, { title: 'מחיקת מוצר', ok: 'מחיקה', danger: true }))) {
        deleteCustomFood(p.id);
        ctx.rerender();
      }
      return;
    }
    case 'export':
      exportBackup();
      toast('קובץ הגיבוי נוצר');
      return ctx.rerender();
    case 'share-backup':
      if (await shareBackup()) {
        toast('הגיבוי שותף');
        ctx.rerender();
      }
      return;
    case 'import':
      root.querySelector('[data-file]').click();
      return;
    case 'ph-backup':
      return backupPhotos(ctx);
    case 'ph-restore':
      return document.querySelector('[data-photo-file]')?.click();
    case 'wipe': {
      const first = await confirmDialog('כל הנתונים במכשיר יימחקו: הגדרות, תרגילים, היסטוריה, שקילות ותמונות התקדמות.', {
        title: 'מחיקת כל הנתונים', ok: 'המשך', danger: true,
      });
      if (!first) return;
      const second = await confirmDialog('זו הפעולה האחרונה ואין דרך לבטל אותה. למחוק הכול?', {
        title: 'בטוח?', ok: 'מחיקה סופית', danger: true,
      });
      if (!second) return;
      resetAll();
      await deleteAllPhotos(); // progress photos too
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
