// "הגדרות" tab: goals, exercise editor, backup / restore, delete all data, version.
import { getState, updateSettings, resetAll, upsertCustomFood, deleteCustomFood, uid, save } from '../storage.js';
import { DAY_NAMES, MIN_DAYS, MAX_DAYS } from '../rotation.js';
import { weightsList } from '../coach.js';
import { themeCard, pauseCard, autoBackupHTML, healthCard, remindersCard, fillHealthCard, onCardsChange, onCardsClick } from './settingsCards.js';
import { todayKey } from '../dates.js';
import { icon, esc, num, toast, confirmDialog, invalid, parseNum } from '../ui.js';
import { productSheet } from '../foodSheets.js';
import { SETTINGS_FIELDS, fieldHTML, validateField } from './wizard.js';
import { exerciseEditorHTML, handleExerciseAction } from '../exerciseEditor.js';
import { exportBackup, readBackupFile, restoreBackup, canShareBackup, shareBackup, lastBackupDate } from '../export.js';
import { APP_VERSION } from '../config.js';
import { floorsTarget } from '../stats.js';
import { photoSettingsCard, savePhotoSetting, backupPhotos, restorePhotos } from './photos.js';
import { deleteAllPhotos } from '../photos.js';
import { breathSettingsCard, saveBreathSetting } from './breathe.js';

const GROUPS = [
  { title: 'משקל וגוף', icon: 'scale', keys: ['startWeight', 'targetWeight', 'height'] },
  { title: 'יעדים יומיים', icon: 'today', keys: ['proteinTarget', 'stepsTarget', 'rideGoalKm', 'sleepTarget', 'waterTarget', 'cupMl'] },
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
    ${screenModeCard(st)}
    ${themeCard(st)}
    ${coachCard(st)}
    ${st.coach?.enabled === false ? rotationCard(st) : ''}
    ${pauseCard()}
    <section class="card">
      <div class="card-head">${icon('dumbbell', 'head-ic')}<h2>תרגילים</h2></div>
      ${exerciseEditorHTML()}
    </section>
    ${productsCard()}
    <section class="card">
      <div class="card-head">${icon('download', 'head-ic')}<h2>גיבוי</h2></div>
      <p class="muted small">הנתונים נשמרים רק במכשיר הזה. מומלץ לייצא גיבוי מדי פעם.</p>
      <p class="backup-last" data-backup-last>${lastBackupDate() ? `גיבוי אחרון: <bdi class="num" dir="ltr">${lastBackupDate()}</bdi>` : 'עוד לא בוצע גיבוי'}</p>
      <div class="btn-col">
        <button type="button" class="btn secondary block press" data-action="export">${icon('download')}<span>ייצוא גיבוי</span></button>
        ${canShareBackup() ? `<button type="button" class="btn secondary block press" data-action="share-backup">${icon('share')}<span>שיתוף הקובץ</span></button>` : ''}
        <button type="button" class="btn secondary block press" data-action="import">${icon('upload')}<span>שחזור מגיבוי</span></button>
      </div>
      ${autoBackupHTML()}
      <input type="file" accept="application/json,.json" data-file hidden>
    </section>
    ${healthCard()}
    ${remindersCard()}
    ${breathSettingsCard()}
    ${photoSettingsCard()}
    <section class="card danger-card">
      <div class="card-head">${icon('alert', 'head-ic')}<h2>אזור מסוכן</h2></div>
      <button type="button" class="btn danger block press" data-action="wipe">${icon('trash')}<span>מחיקת כל הנתונים</span></button>
    </section>
    <p class="version">70 · גרסה <bdi class="num" dir="ltr">${APP_VERSION}</bdi><br>
      <span data-db-about>מאגר המזון: מזונות נפוצים בישראל (תוויות מוצרים, USDA, צמרת) · ברקודים: Open Food Facts</span></p>`;
  fillDbAbout(root);
  fillHealthCard(root);

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
          <div class="muted small">${num(p.kcal100)} קק״ל · ${num(p.protein100)} ג׳ חלבון ל-100 ג׳${p.barcode ? ` · <bdi class="num" dir="ltr">${esc(p.barcode)}</bdi>` : ''}</div></div>
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

/** "מאמן חכם": on (default) / off, and "המשקולות שלי" (weight steps for light days and progression). */
function coachCard(st) {
  const on = st.coach?.enabled !== false;
  const ws = weightsList();
  return `<section class="card coach-card">
    <div class="card-head">${icon('sparkle', 'head-ic')}<h2>מאמן חכם</h2></div>
    <div class="segmented two" role="radiogroup" aria-label="מאמן חכם">
      <label><input type="radio" name="coachOn" value="on" data-coach-on ${on ? 'checked' : ''}><span>פעיל</span></label>
      <label><input type="radio" name="coachOn" value="off" data-coach-on ${on ? '' : 'checked'}><span>כבוי</span></label>
    </div>
    <p class="muted small">${on ? 'בוחר כל בוקר את אימון היום לפי השינה, האוכל והעומס, ומעלה יעדים בהדרגה.' : 'האימון נקבע לפי תוכנית האימונים הידנית.'}</p>
    <div class="sub-head"><span>המשקולות שלי</span></div>
    <div class="weight-chips" data-weights>${ws.map((w) => `<span class="weight-chip"><bdi class="num" dir="ltr">${num(w)}</bdi> ק״ג
      <button type="button" class="weight-del press" data-action="weight-remove" data-kg="${w}" aria-label="הסרת ${w} ק״ג">${icon('x')}</button></span>`).join('') || '<span class="muted small">עוד לא נוספו משקולות</span>'}</div>
    <div class="inline-form">
      <label class="field grow"><span>משקל (ק״ג)</span><input type="number" inputmode="decimal" min="0.5" max="200" step="0.5" data-weight-new placeholder="12" enterkeyhint="done"></label>
      <button type="button" class="btn secondary press" data-action="weight-add-kg">${icon('plus')}<span>הוספה</span></button>
    </div>
  </section>`;
}

const saveCoach = (patch) => updateSettings({ coach: { enabled: true, weights: [], ...(getState().settings.coach || {}), ...patch } });

/** "תוכנית אימונים": every exercise every day (default), or a rotation of 2–4 workout days. */
function rotationCard(st) {
  const r = st.rotation || {};
  const on = r.mode === 'rotation';
  const days = Array.isArray(r.days) ? r.days : [];
  return `<section class="card rot-card">
    <div class="card-head">${icon('dumbbell', 'head-ic')}<h2>תוכנית אימונים</h2></div>
    <div class="segmented two" role="radiogroup" aria-label="תוכנית אימונים">
      <label><input type="radio" name="rotMode" value="all" data-rot-mode ${on ? '' : 'checked'}><span>כל התרגילים כל יום</span></label>
      <label><input type="radio" name="rotMode" value="rotation" data-rot-mode ${on ? 'checked' : ''}><span>סבב ימים</span></label>
    </div>
    ${on ? `<ol class="rot-days">${days.map((d, i) => `<li class="rot-day" data-rot-i="${i}">
        <div class="rot-fields">
          <label class="field"><span>שם</span><input type="text" maxlength="20" data-rot-field="name" data-i="${i}" value="${esc(d.name)}" autocomplete="off" enterkeyhint="done"></label>
          <label class="field"><span>תיאור (רשות)</span><input type="text" maxlength="40" data-rot-field="subtitle" data-i="${i}" value="${esc(d.subtitle || '')}" placeholder="למשל ידיים וגוף עליון" autocomplete="off" enterkeyhint="done"></label>
        </div>
        <div class="rot-actions">
          <button type="button" class="icon-btn sm press" data-action="rot-up" data-i="${i}" aria-label="הזזה למעלה" ${i ? '' : 'disabled'}>${icon('up')}</button>
          <button type="button" class="icon-btn sm press" data-action="rot-down" data-i="${i}" aria-label="הזזה למטה" ${i < days.length - 1 ? '' : 'disabled'}>${icon('down')}</button>
          <button type="button" class="icon-btn sm press danger-ic" data-action="rot-del" data-i="${i}" aria-label="הסרת יום" ${days.length > MIN_DAYS ? '' : 'disabled'}>${icon('trash')}</button>
        </div>
      </li>`).join('')}</ol>
      ${days.length < MAX_DAYS ? `<button type="button" class="btn secondary block press" data-action="rot-add">${icon('plus')}<span>הוספת יום</span></button>` : ''}
      <p class="muted small">בכל תרגיל אפשר לבחור באילו ימים הוא מופיע. ימי מנוחה וימים בלי אימון לא מקדמים את הסבב.</p>` : ''}
  </section>`;
}

/** Save the rotation (a copy) and re-render. */
function saveRotation(ctx, fn) {
  const r = structuredClone(getState().settings.rotation || { mode: 'all', days: [] });
  fn(r);
  updateSettings({ rotation: r });
  ctx.rerender();
}

const newDay = (days) => ({ id: `d${uid()}`, name: DAY_NAMES.find((n) => !days.some((d) => d.name === n)) || DAY_NAMES[days.length] || 'יום', subtitle: '' });

/** "תצוגת המסכים": tiles (default) or the full card lists on "היום" and "מגמות". */
function screenModeCard(st) {
  const list = st.screenMode === 'list';
  return `<section class="card">
    <div class="card-head">${icon('today', 'head-ic')}<h2>תצוגת המסכים</h2></div>
    <div class="segmented two" role="radiogroup" aria-label="תצוגת המסכים">
      <label><input type="radio" name="screenMode" value="tiles" data-screen-mode ${list ? '' : 'checked'}><span>אריחים</span></label>
      <label><input type="radio" name="screenMode" value="list" data-screen-mode ${list ? 'checked' : ''}><span>רשימה מלאה</span></label>
    </div>
    <p class="muted small">חל על המסכים ״היום״ ו״מגמות״</p>
  </section>`;
}

/** "יעד יומי: 36 קומות" = climbsTarget × floorsRegular. */
function floorsTargetText(st) {
  const t = floorsTarget(st);
  return `יעד יומי: ${t === 1 ? 'קומה אחת' : `${num(t)} קומות`}`;
}

function onChange(e, ctx) {
  const t = e.target;
  if (onCardsChange(t, ctx)) return;
  if (t.matches('[data-coach-on]')) {
    saveCoach({ enabled: t.value === 'on' });
    toast('נשמר');
    ctx.rerender();
  } else if (t.matches('[data-rot-mode]')) {
    saveRotation(ctx, (r) => {
      r.mode = t.value;
      if (t.value === 'rotation') {
        if (!r.startDate) r.startDate = todayKey(); // first switch: the rotation starts today
        r.days = Array.isArray(r.days) ? r.days : [];
        while (r.days.length < MIN_DAYS) r.days.push(newDay(r.days));
      }
    });
    toast('נשמר');
  } else if (t.dataset.rotField) {
    const i = Number(t.dataset.i), field = t.dataset.rotField;
    const v = t.value.trim();
    if (field === 'name' && !v) {
      invalid(t, 'יש להזין שם');
      t.value = getState().settings.rotation.days[i].name;
      return;
    }
    saveRotation(ctx, (r) => { r.days[i][field] = v; });
    toast('נשמר');
  } else if (t.matches('[data-screen-mode]')) {
    updateSettings({ screenMode: t.value });
    toast('נשמר');
  } else if (t.dataset.breathSetting) {
    saveBreathSetting(t);
  } else if (t.dataset.photoSetting) {
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
  if (await onCardsClick(a, b, ctx, root)) return;
  if (a.startsWith('ex-')) {
    if (await handleExerciseAction(a, b.dataset.id)) ctx.rerender();
    return;
  }
  switch (a) {
    case 'weight-add-kg': {
      const inp = root.querySelector('[data-weight-new]');
      const kg = Math.round(parseNum(inp.value) * 2) / 2;
      if (!(kg > 0 && kg <= 200)) return invalid(inp, 'משקל לא תקין');
      saveCoach({ weights: [...weightsList(), kg].filter((w, i, a) => a.indexOf(w) === i).sort((x, y) => x - y) });
      toast('נשמר');
      return ctx.rerender();
    }
    case 'weight-remove':
      saveCoach({ weights: weightsList().filter((w) => w !== Number(b.dataset.kg)) });
      return ctx.rerender();
    case 'rot-up':
    case 'rot-down': {
      const i = Number(b.dataset.i), j = a === 'rot-up' ? i - 1 : i + 1;
      return saveRotation(ctx, (r) => { [r.days[i], r.days[j]] = [r.days[j], r.days[i]]; });
    }
    case 'rot-add':
      return saveRotation(ctx, (r) => { if (r.days.length < MAX_DAYS) r.days.push(newDay(r.days)); });
    case 'rot-del': {
      const d = getState().settings.rotation.days[Number(b.dataset.i)];
      if (!d || !(await confirmDialog(`להסיר את "${d.name}" מהסבב? תרגילים שהיו רק ביום הזה יופיעו בכל יום.`, { title: 'הסרת יום', ok: 'הסרה', danger: true }))) return;
      unassignDay(d.id);
      return saveRotation(ctx, (r) => { if (r.days.length > MIN_DAYS) r.days = r.days.filter((x) => x.id !== d.id); });
    }
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

/** A removed workout day leaves every exercise's day list; an exercise left with none shows every day. */
function unassignDay(id) {
  for (const ex of getState().exercises) {
    if (!Array.isArray(ex.days) || !ex.days.includes(id)) continue;
    ex.days = ex.days.filter((x) => x !== id);
    if (!ex.days.length) ex.days = ['all'];
  }
  save();
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
