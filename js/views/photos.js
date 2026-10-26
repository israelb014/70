// "תמונות התקדמות": sessions list, guided new-session flow (camera / gallery, alignment overlay),
// session editing, full-screen viewer (pinch-zoom, swipe), compare screen (side by side / wipe) and
// the photo zip backup. Photos never leave the device unless the user exports the zip.
import { getState, updateSettings } from '../storage.js';
import { icon, esc, num, fmt, toast, openSheet, confirmDialog, invalid, emptyState, vibrate, HAPTIC, reducedMotion } from '../ui.js';
import { todayKey, longLabel, shortDate, fullDate } from '../dates.js';
import { plural, trim } from '../hebrew.js';
import { photoId } from '../photodb.js';
import {
  POSES, poseLabel, sessions, sessionOn, processImage, savePhoto, previousPhoto, deletePose, deleteSession,
  restoreRecords, changeSessionDate, photoUrl, sessionWeight, daysBetween, photoReminder, snoozePhotoReminder,
  buildPhotoZip, markPhotoBackup, lastPhotoBackupDate, importPhotoZip,
} from '../photos.js';

const TIP = 'אותו מקום, אותה תאורה, אותו מרחק, בבוקר';
const PHOTO_SCREENS = ['photos', 'compare'];

/* ---------- Privacy veil ----------
 * Photo screens open blurred ("הקש להצגה"); the blur returns whenever the app goes to the background. */
let revealed = false;
const applyVeil = () => document.body.classList.toggle('ph-blur', !revealed);
export function reveal() { revealed = true; applyVeil(); }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { revealed = false; applyVeil(); }
});
const veilHTML = () => `<button type="button" class="ph-veil press" data-veil aria-label="הקש להצגת התמונות">
    ${icon('eye')}<span>הקש להצגה</span></button>`;
/** Any tap while veiled reveals instead of acting. Returns true when it consumed the tap. */
function veilTap(e) {
  if (revealed) return false;
  if (e.target.closest('[data-veil], .ph-img, .ph-thumb')) { e.preventDefault(); reveal(); return true; }
  return false;
}

/** Fill every <img data-photo="id"> from IndexedDB. */
async function hydrate(root) {
  for (const img of root.querySelectorAll('img[data-photo]')) {
    const url = await photoUrl(img.dataset.photo);
    if (url) img.src = url;
    else img.closest('.ph-thumb, .ph-mini, figure, .ph-strip-item')?.classList.add('missing');
  }
}

const weightText = (date) => {
  const w = sessionWeight(date);
  if (!w) return 'אין שקילה';
  return w.exact ? `${num(fmt(w.kg))} ק״ג` : `${num(fmt(w.kg))} ק״ג · שקילה אחרונה מ-${num(shortDate(w.date))}`;
};

/* ---------- Photos screen ---------- */

export function render(root, ctx) {
  if (!PHOTO_SCREENS.includes(ctx.fromTab)) revealed = false; // entering from elsewhere: veiled
  applyVeil();
  const list = sessions().reverse();
  root.innerHTML = `
    <header class="page-head with-back">
      <button type="button" class="icon-btn press" data-action="back" aria-label="חזרה">${icon('chevR')}</button>
      <div><h1>תמונות התקדמות</h1></div>
    </header>
    ${list.length ? veilHTML() : ''}
    <section class="card ph-top">
      <div class="btn-pair">
        <button type="button" class="btn primary press" data-action="ph-new">${icon('camera')}<span>סשן חדש</span></button>
        <button type="button" class="btn secondary press" data-action="ph-compare" ${list.length < 2 ? 'disabled' : ''}>${icon('compare')}<span>השוואה</span></button>
      </div>
      <p class="muted small">התמונות נשמרות רק במכשיר הזה.</p>
    </section>
    ${list.length ? list.map(sessionCard).join('') : `<section class="card empty-card">${emptyState('photos', 'עוד אין תמונות. הסשן הראשון הוא נקודת ההתחלה שלך.')}</section>`}
    ${backupCard()}`;
  hydrate(root);
  root.onclick = (e) => onClick(e, ctx, root);
  root.onchange = (e) => {
    if (e.target.matches('[data-photo-file]') && e.target.files?.[0]) {
      restorePhotos(e.target.files[0], ctx);
      e.target.value = '';
    }
  };
}

function sessionCard(s) {
  return `<section class="card ph-session" data-session="${s.date}">
    <div class="card-head"><h2>${esc(longLabel(s.date))}</h2>
      <button type="button" class="icon-btn sm press" data-action="ph-edit" data-date="${s.date}" aria-label="עריכת הסשן">${icon('edit')}</button></div>
    <div class="muted small" data-weight>${weightText(s.date)}</div>
    <div class="ph-poses">${POSES.map((p) => (s.poses.includes(p.id)
      ? `<button type="button" class="ph-thumb press" data-action="ph-view" data-date="${s.date}" data-pose="${p.id}" aria-label="${p.label}">
          <img class="ph-img" data-photo="${photoId(s.date, p.id)}" alt=""><span class="ph-tag">${p.label}</span></button>`
      : `<div class="ph-thumb empty"><span class="ph-tag">${p.label}</span></div>`)).join('')}</div>
  </section>`;
}

function backupLine() {
  const d = lastPhotoBackupDate();
  return d ? `גיבוי תמונות אחרון: <bdi class="num" dir="ltr">${d}</bdi>` : 'עוד לא בוצע גיבוי תמונות';
}

function backupCard() {
  return `<section class="card">
    <div class="card-head">${icon('download', 'head-ic')}<h2>גיבוי תמונות</h2></div>
    <p class="muted small">התמונות אינן חלק מהגיבוי הרגיל. קובץ ZIP נפרד, שנשאר בידיים שלך.</p>
    <p class="backup-last" data-photo-backup-last>${backupLine()}</p>
    <div class="btn-col">
      <button type="button" class="btn secondary block press" data-action="ph-backup">${icon('download')}<span>גיבוי תמונות</span></button>
      <button type="button" class="btn secondary block press" data-action="ph-restore">${icon('upload')}<span>שחזור תמונות</span></button>
    </div>
    <input type="file" accept=".zip,application/zip" data-photo-file hidden>
  </section>`;
}

async function onClick(e, ctx, root) {
  if (veilTap(e)) return;
  const b = e.target.closest('[data-action]');
  if (!b || b.disabled) return;
  switch (b.dataset.action) {
    case 'back': return ctx.goTab(ctx.prevTab || 'trends');
    case 'ph-new': return startFlow(ctx);
    case 'ph-compare': return ctx.goTab('compare');
    case 'ph-edit': return editSession(ctx, b.dataset.date);
    case 'ph-view': {
      const s = sessionOn(b.dataset.date);
      const items = s.poses.map((p) => ({ id: photoId(s.date, p), label: `${poseLabel(p)} · ${fullDate(s.date)}` }));
      return openViewer(items, s.poses.indexOf(b.dataset.pose));
    }
    case 'ph-backup': return backupPhotos(ctx);
    case 'ph-restore': return root.querySelector('[data-photo-file]').click();
  }
}

/* ---------- New session flow ---------- */

/**
 * Guided flow: pose by pose — "צילום" (camera), "מהגלריה" (asks the session date the first time, so old
 * photos keep their real date) or "דילוג". Then a preview step with the previous photo of that pose as a
 * 30% overlay (when one exists): "שמירה" or "צילום מחדש".
 * opts: { date, poses, dateFixed, title }
 */
export function startFlow(ctx, opts = {}) {
  reveal(); // started by the user
  const poses = opts.poses || POSES.map((p) => p.id);
  let date = opts.date || todayKey();
  let dateSet = !!opts.dateFixed;
  let i = 0, saved = 0;
  const urlsToRevoke = [];
  const el = document.createElement('div');
  el.className = 'ph-flow ph-scope';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', opts.title || 'סשן חדש');
  el.innerHTML = `<div class="ph-flow-inner">
      <header class="ph-flow-head">
        <button type="button" class="icon-btn press" data-f="close" aria-label="סגירה">${icon('x')}</button>
        <div class="grow"><span class="eyebrow">${esc(opts.title || 'סשן חדש')}</span><h2 data-f-title></h2></div>
        <span class="muted small" data-f-count></span>
      </header>
      <div class="ph-flow-body" data-f-body></div>
    </div>
    ${veilHTML()}
    <input type="file" accept="image/*" capture="user" data-f-cam hidden>
    <input type="file" accept="image/*" data-f-gal hidden>`;
  document.body.appendChild(el);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => el.classList.add('open'));
  const body = el.querySelector('[data-f-body]');

  const pick = (src) => new Promise((resolve) => {
    const inp = el.querySelector(src === 'cam' ? '[data-f-cam]' : '[data-f-gal]');
    inp.value = '';
    inp.onchange = () => resolve(inp.files?.[0] || null);
    inp.oncancel = () => resolve(null);
    inp.click();
  });
  const urlOf = (blob) => { const u = URL.createObjectURL(blob); urlsToRevoke.push(u); return u; };

  const close = () => {
    el.classList.remove('open');
    setTimeout(() => {
      el.remove();
      urlsToRevoke.forEach((u) => URL.revokeObjectURL(u));
      if (!document.querySelector('.sheet-backdrop, .ph-viewer')) document.body.classList.remove('no-scroll');
    }, 220);
    if (saved) toast(poses.length > 1 ? 'הסשן נשמר' : 'התמונה נשמרה');
    if (ctx.tab !== 'photos') ctx.goTab('photos');
    else ctx.rerender();
  };

  const chooseStep = () => {
    if (i >= poses.length) return close();
    el.querySelector('[data-f-title]').textContent = poseLabel(poses[i]);
    el.querySelector('[data-f-count]').innerHTML = poses.length > 1 ? num(`${i + 1}/${poses.length}`) : '';
    body.innerHTML = `<div class="ph-step">
        <div class="ph-pose-art" aria-hidden="true">${icon('camera')}</div>
        <p class="ph-tip">${TIP}</p>
        ${dateSet && date !== todayKey() ? `<p class="muted small" data-f-date>תאריך הסשן: ${num(fullDate(date))}</p>` : ''}
        <div class="btn-col">
          <button type="button" class="btn primary block press" data-f="cam">${icon('camera')}<span>צילום</span></button>
          <button type="button" class="btn secondary block press" data-f="gal">${icon('gallery')}<span>מהגלריה</span></button>
          <button type="button" class="btn ghost block press" data-f="skip">דילוג</button>
        </div>
      </div>`;
  };

  const take = async (src) => {
    const file = await pick(src);
    if (!file) return;
    if (src === 'gal' && !dateSet) {
      const d = await askDate(date);
      if (!d) return;
      date = d;
    }
    body.innerHTML = `<div class="ph-step"><div class="ph-working">${icon('camera')}<span>מעבד את התמונה…</span></div></div>`;
    let processed;
    try { processed = await processImage(file); } catch {
      toast('לא הצלחנו לקרוא את התמונה');
      return chooseStep();
    }
    const prev = await previousPhoto(poses[i], date);
    body.innerHTML = `<div class="ph-step ph-preview">
        <div class="ph-stage" style="aspect-ratio:${processed.width}/${processed.height}">
          <img class="ph-img" data-f-new src="${urlOf(processed.blob)}" alt="">
          ${prev ? `<img class="ph-img ph-overlay" data-f-overlay src="${urlOf(prev.blob)}" alt="">` : ''}
        </div>
        <p class="hint">${prev ? `התמונה הקודמת (${num(shortDate(prev.sessionDate))}) מוצגת בשקיפות, כדי לבדוק שהמסגור תואם` : TIP}</p>
        <div class="btn-pair">
          <button type="button" class="btn secondary press" data-f="retake" data-src="${src}">${icon('camera')}<span>צילום מחדש</span></button>
          <button type="button" class="btn primary press" data-f="save">${icon('check')}<span>שמירה</span></button>
        </div>
      </div>`;
    body.querySelector('[data-f="save"]').onclick = async () => {
      await savePhoto(date, poses[i], processed);
      dateSet = true;
      saved++;
      vibrate(HAPTIC.item);
      i++;
      chooseStep();
    };
  };

  el.addEventListener('click', (e) => {
    if (veilTap(e)) return;
    const b = e.target.closest('[data-f]');
    if (!b) return;
    const f = b.dataset.f;
    if (f === 'close') close();
    else if (f === 'skip') { i++; chooseStep(); }
    else if (f === 'cam' || f === 'gal') take(f);
    else if (f === 'retake') take(b.dataset.src);
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !document.querySelector('.sheet-backdrop')) close(); });
  chooseStep();
}

/** Date of an imported (gallery) session; default today, no future dates. */
async function askDate(def) {
  return openSheet({
    title: 'תאריך הסשן',
    body: `<label class="field"><span>מתי צולמה התמונה?</span><input name="date" type="date" value="${def}" max="${todayKey()}"></label>`,
    actions: [
      { label: 'ביטול', value: null, kind: 'ghost' },
      {
        label: 'המשך', kind: 'primary',
        onClick: (w) => {
          const v = w.querySelector('[name=date]').value;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || v > todayKey()) return invalid(w.querySelector('[name=date]'), 'תאריך לא תקין');
          return v;
        },
      },
    ],
  });
}

/* ---------- Edit a session ---------- */

async function editSession(ctx, date) {
  const s = sessionOn(date);
  if (!s) return;
  let pending = null;
  const res = await openSheet({
    title: `עריכת סשן · ${shortDate(date)}`,
    body: `<label class="field"><span>תאריך הסשן</span><input name="date" type="date" value="${date}" max="${todayKey()}"></label>
      <ul class="ph-edit-list">${POSES.map((p) => {
        const has = s.poses.includes(p.id);
        return `<li class="list-row">
          <span class="ph-mini">${has ? `<img class="ph-img" data-photo="${photoId(date, p.id)}" alt="">` : icon('camera')}</span>
          <strong class="grow">${p.label}</strong>
          <button type="button" class="btn secondary sm press" data-e="replace" data-pose="${p.id}">${has ? 'החלפה' : 'הוספה'}</button>
          ${has ? `<button type="button" class="icon-btn sm press danger-ic" data-e="del" data-pose="${p.id}" aria-label="מחיקת ${p.label}">${icon('trash')}</button>` : ''}
        </li>`;
      }).join('')}</ul>
      <button type="button" class="btn danger block press" data-e="del-session">${icon('trash')}<span>מחיקת הסשן</span></button>`,
    onOpen: (w) => {
      hydrate(w);
      w.querySelectorAll('[data-e]').forEach((btn) => btn.addEventListener('click', () => {
        pending = { type: btn.dataset.e, pose: btn.dataset.pose };
        w.querySelector('[data-sheet-i="0"]').click();
      }));
    },
    actions: [
      { label: 'סגירה', kind: 'ghost', onClick: () => pending || null },
      { label: 'שמירה', kind: 'primary', onClick: (w) => ({ type: 'date', date: w.querySelector('[name=date]').value }) },
    ],
  });
  if (!res) return;
  if (res.type === 'date') {
    if (res.date === date) return;
    const err = await changeSessionDate(date, res.date);
    toast(err || 'תאריך הסשן עודכן');
    return ctx.rerender();
  }
  if (res.type === 'replace') return startFlow(ctx, { date, poses: [res.pose], dateFixed: true, title: `${poseLabel(res.pose)} · ${shortDate(date)}` });
  if (res.type === 'del') {
    const recs = await deletePose(date, res.pose);
    undoToast('התמונה נמחקה', recs, ctx);
    return ctx.rerender();
  }
  if (res.type === 'del-session') {
    const ok = await confirmDialog('למחוק את הסשן ואת כל התמונות שבו?', { title: 'מחיקת סשן', ok: 'מחיקה', danger: true });
    if (!ok) return;
    const recs = await deleteSession(date);
    undoToast('הסשן נמחק', recs, ctx);
    return ctx.rerender();
  }
}

function undoToast(msg, recs, ctx) {
  toast(msg, {
    iconHTML: icon('trash'),
    action: { label: 'ביטול', onClick: async () => { await restoreRecords(recs); ctx.rerender(); } },
  });
}

/* ---------- Full-screen viewer ---------- */

/** items: [{ id, label }]. Dark full screen, pinch-zoom / double-tap zoom, swipe between items. */
export function openViewer(items, start = 0) {
  if (!items.length) return;
  let idx = Math.max(0, start);
  let scale = 1, tx = 0, ty = 0;
  const el = document.createElement('div');
  el.className = 'ph-viewer ph-scope';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'צפייה בתמונה');
  el.innerHTML = `<header class="ph-viewer-head">
      <button type="button" class="icon-btn press" data-v="close" aria-label="סגירה">${icon('x')}</button>
      <span class="grow" data-v-label></span><span class="muted small" data-v-count></span>
    </header>
    <div class="ph-viewer-stage" data-v-stage><img class="ph-img" data-v-img alt=""></div>
    ${items.length > 1 ? `<button type="button" class="ph-nav prev press" data-v="prev" aria-label="הקודמת">${icon('chevR')}</button>
      <button type="button" class="ph-nav next press" data-v="next" aria-label="הבאה">${icon('chevL')}</button>` : ''}
    ${veilHTML()}`;
  document.body.appendChild(el);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => el.classList.add('open'));
  const img = el.querySelector('[data-v-img]');
  const stage = el.querySelector('[data-v-stage]');
  const apply = (animate = false) => {
    img.style.transition = animate && !reducedMotion() ? 'transform 220ms var(--ease-out)' : 'none';
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  };
  const show = async () => {
    scale = 1; tx = 0; ty = 0; apply();
    el.querySelector('[data-v-label]').textContent = items[idx].label;
    el.querySelector('[data-v-count]').innerHTML = items.length > 1 ? num(`${idx + 1}/${items.length}`) : '';
    img.classList.remove('in');
    img.src = (await photoUrl(items[idx].id)) || '';
    requestAnimationFrame(() => img.classList.add('in'));
  };
  const go = (d) => { if (items.length > 1) { idx = (idx + d + items.length) % items.length; show(); } };
  const close = () => {
    el.classList.remove('open');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => {
      el.remove();
      if (!document.querySelector('.sheet-backdrop, .ph-flow')) document.body.classList.remove('no-scroll');
    }, 220);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') go(1);
    else if (e.key === 'ArrowRight') go(-1);
  };
  document.addEventListener('keydown', onKey);

  // Gestures: two pointers = pinch (1–5×); one pointer = pan when zoomed, swipe when not; double tap = 2.5×.
  const pts = new Map();
  let base = null, lastTap = 0;
  const snap = () => ({ scale, tx, ty, pts: new Map([...pts].map(([k, v]) => [k, { ...v }])) });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  stage.addEventListener('pointerdown', (e) => {
    if (!revealed) return;
    try { stage.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    base = snap();
  });
  stage.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId) || !base) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const now = [...pts.values()], was = [...base.pts.values()];
    if (now.length >= 2 && was.length >= 2) {
      scale = Math.min(5, Math.max(1, base.scale * (dist(now[0], now[1]) / dist(was[0], was[1]))));
      if (scale === 1) { tx = 0; ty = 0; }
    } else if (now.length === 1 && was.length === 1) {
      const dx = now[0].x - was[0].x, dy = now[0].y - was[0].y;
      if (scale > 1) { tx = base.tx + dx; ty = base.ty + dy; } else { tx = dx; ty = 0; }
    }
    apply();
  });
  const up = (e) => {
    if (!pts.has(e.pointerId)) return;
    const single = pts.size === 1 && base?.pts.size === 1;
    const p0 = base?.pts.get(e.pointerId);
    const dx = p0 ? e.clientX - p0.x : 0, dy = p0 ? e.clientY - p0.y : 0;
    pts.delete(e.pointerId);
    base = pts.size ? snap() : null;
    if (!single) return;
    if (scale === 1 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) return go(dx > 0 ? 1 : -1); // RTL: swipe right → next
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
      const t = Date.now();
      if (t - lastTap < 300) { scale = scale > 1 ? 1 : 2.5; tx = 0; ty = 0; lastTap = 0; apply(true); return; }
      lastTap = t;
    }
    if (scale === 1) { tx = 0; ty = 0; apply(true); }
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  el.addEventListener('click', (e) => {
    if (veilTap(e)) return;
    const b = e.target.closest('[data-v]');
    if (!b) return;
    if (b.dataset.v === 'close') close();
    else go(b.dataset.v === 'next' ? 1 : -1);
  });
  show();
}

/* ---------- Compare screen ---------- */

const cmp = { a: null, b: null, pose: 'front', mode: 'side', x: 50 };

/** "‎-9.4 ק״ג · 42 ימים" (LRM so the sign stays with the number in RTL). */
export function diffText(a, b) {
  const wa = sessionWeight(a), wb = sessionWeight(b);
  const days = daysBetween(a, b);
  const parts = [];
  if (wa && wb) {
    const d = Math.round((wb.kg - wa.kg) * 10) / 10;
    parts.push(`${d > 0 ? '+' : d < 0 ? '-' : ''}${trim(Math.abs(d), 1)} ק״ג`);
  }
  parts.push(plural(days, 'יום אחד', 'ימים'));
  return `‎${parts.join(' · ')}`;
}

/** Same text, numbers isolated LTR so "-9.4" keeps its sign on the left inside RTL. */
const diffHTML = (a, b) => esc(diffText(a, b)).replace(/\u200E?[-+]?[\d.,]+/g, (m) => `<bdi class="num" dir="ltr">${m}</bdi>`);

const sideLabel = (date) => {
  const w = sessionWeight(date);
  return `${num(fullDate(date))}${w ? ` · ${num(fmt(w.kg))} ק״ג` : ''}`;
};

function renderCompare(root, ctx) {
  if (!PHOTO_SCREENS.includes(ctx.fromTab)) revealed = false;
  applyVeil();
  const list = sessions();
  const head = `<header class="page-head with-back">
      <button type="button" class="icon-btn press" data-action="back" aria-label="חזרה">${icon('chevR')}</button>
      <div><h1>השוואה</h1></div>
    </header>`;
  if (list.length < 2) {
    root.innerHTML = `${head}<section class="card empty-card">${emptyState('photos', 'צריך לפחות שני סשנים כדי להשוות.')}</section>`;
  } else {
    if (!sessionOn(cmp.a)) cmp.a = list[0].date;
    if (!sessionOn(cmp.b)) cmp.b = list.at(-1).date;
    const opts = (sel) => list.map((s) => `<option value="${s.date}" ${s.date === sel ? 'selected' : ''}>${esc(fullDate(s.date))}</option>`).join('');
    const pic = (date, cls = '') => (sessionOn(date)?.poses.includes(cmp.pose)
      ? `<img class="ph-img ${cls}" data-photo="${photoId(date, cmp.pose)}" alt="">`
      : `<div class="ph-none ${cls}">אין תמונת ${poseLabel(cmp.pose)} בסשן הזה</div>`);
    const strip = list.filter((s) => s.poses.includes(cmp.pose));
    root.innerHTML = `${head}
      ${veilHTML()}
      <section class="card ph-cmp-controls">
        <div class="field-grid">
          <label class="field"><span>לפני</span><select data-cmp="a">${opts(cmp.a)}</select></label>
          <label class="field"><span>אחרי</span><select data-cmp="b">${opts(cmp.b)}</select></label>
        </div>
        <div class="segmented" role="radiogroup" aria-label="תנוחה">${POSES.map((p) => `<label><input type="radio" name="ph-pose" value="${p.id}" data-cmp="pose" ${p.id === cmp.pose ? 'checked' : ''}><span>${p.label}</span></label>`).join('')}</div>
        <div class="segmented two" role="radiogroup" aria-label="תצוגה">
          <label><input type="radio" name="ph-mode" value="side" data-cmp="mode" ${cmp.mode === 'side' ? 'checked' : ''}><span>זה לצד זה</span></label>
          <label><input type="radio" name="ph-mode" value="wipe" data-cmp="mode" ${cmp.mode === 'wipe' ? 'checked' : ''}><span>החלקה</span></label>
        </div>
      </section>
      <section class="card ph-cmp">
        <p class="ph-diff" data-ph-diff>${diffHTML(cmp.a, cmp.b)}</p>
        ${cmp.mode === 'side'
          ? `<div class="ph-side">
              <figure data-side="a">${pic(cmp.a)}<figcaption><b>לפני</b> <span>${sideLabel(cmp.a)}</span></figcaption></figure>
              <figure data-side="b">${pic(cmp.b)}<figcaption><b>אחרי</b> <span>${sideLabel(cmp.b)}</span></figcaption></figure>
            </div>`
          : `<div class="ph-wipe" data-wipe style="--x:${cmp.x}%">
              ${pic(cmp.b, 'ph-wipe-b')}
              <div class="ph-wipe-a">${pic(cmp.a)}</div>
              <div class="ph-wipe-handle" data-wipe-handle role="slider" tabindex="0" aria-label="קו ההשוואה"
                aria-valuemin="0" aria-valuemax="100" aria-valuenow="${cmp.x}"><span>${icon('compare')}</span></div>
              <span class="ph-tag a">לפני</span><span class="ph-tag b">אחרי</span>
            </div>
            <div class="ph-wipe-caps"><span data-side="a"><b>לפני</b> ${sideLabel(cmp.a)}</span><span data-side="b"><b>אחרי</b> ${sideLabel(cmp.b)}</span></div>`}
      </section>
      <section class="card">
        <div class="card-head">${icon('list', 'head-ic')}<h2>ציר זמן · ${poseLabel(cmp.pose)}</h2><span class="muted small">${num(strip.length)}</span></div>
        <div class="ph-strip">${strip.map((s, i) => `<button type="button" class="ph-strip-item press" data-action="ph-strip" data-i="${i}">
            <img class="ph-img" data-photo="${photoId(s.date, cmp.pose)}" alt=""><span>${num(shortDate(s.date))}</span></button>`).join('')}</div>
      </section>`;
    bindWipe(root);
  }
  hydrate(root);
  root.onclick = (e) => {
    if (veilTap(e)) return;
    const b = e.target.closest('[data-action]');
    if (!b) return;
    if (b.dataset.action === 'back') return ctx.goTab('photos');
    if (b.dataset.action === 'ph-strip') {
      const strip = sessions().filter((s) => s.poses.includes(cmp.pose));
      openViewer(strip.map((s) => ({ id: photoId(s.date, cmp.pose), label: `${poseLabel(cmp.pose)} · ${fullDate(s.date)}` })), Number(b.dataset.i));
    }
  };
  root.onchange = (e) => {
    const k = e.target.dataset.cmp;
    if (!k) return;
    cmp[k] = e.target.value;
    ctx.rerender();
  };
}

/** Drag (or arrow keys) moves the wipe line; "לפני" shows to the right of it, "אחרי" to the left. */
function bindWipe(root) {
  const box = root.querySelector('[data-wipe]');
  if (!box) return;
  const handle = box.querySelector('[data-wipe-handle]');
  const set = (x) => {
    cmp.x = Math.round(Math.min(100, Math.max(0, x)));
    box.style.setProperty('--x', `${cmp.x}%`);
    handle.setAttribute('aria-valuenow', String(cmp.x));
  };
  let dragging = false;
  const at = (e) => { const r = box.getBoundingClientRect(); set(((e.clientX - r.left) / r.width) * 100); };
  box.addEventListener('pointerdown', (e) => {
    if (!revealed) return;
    dragging = true;
    try { box.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    at(e);
  });
  box.addEventListener('pointermove', (e) => { if (dragging) at(e); });
  box.addEventListener('pointerup', () => { dragging = false; });
  box.addEventListener('pointercancel', () => { dragging = false; });
  handle.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { set(cmp.x - 5); e.preventDefault(); }
    if (e.key === 'ArrowRight') { set(cmp.x + 5); e.preventDefault(); }
  });
}

export const compare = { render: renderCompare };

/* ---------- Cards for other screens ---------- */

/** "מגמות": entry card (no thumbnails — nothing private on a screen people glance at). */
export function photosCard() {
  const list = sessions();
  return `<button type="button" class="card ph-card press" data-action="photos">
    <span class="head-ic">${icon('camera')}</span>
    <div class="grow"><h2>תמונות התקדמות</h2>
      <div class="muted small">${list.length ? `${plural(list.length, 'סשן אחד', 'סשנים')} · אחרון ${num(shortDate(list.at(-1).date))}` : 'עוד אין תמונות'}</div></div>
    ${icon('chevL')}
  </button>`;
}

/** "היום": reminder card when a session is due (see photoReminder). */
export function photoReminderCard() {
  if (!photoReminder()) return '';
  const days = daysBetween(sessions().at(-1).date, todayKey());
  return `<section class="card backup-banner ph-remind" aria-label="תזכורת לתמונות התקדמות">
    <div class="bb-head">${icon('camera', 'head-ic')}
      <div class="bb-text"><strong>הגיע הזמן לתמונות התקדמות</strong>
        <div class="bb-sub"><span>${plural(days, 'יום אחד', 'ימים')} מהסשן האחרון</span>
          <button type="button" class="bb-later press" data-action="photo-later">אחר כך</button></div>
      </div>
    </div>
    <div class="bb-actions">
      <button type="button" class="btn primary press" data-action="photo-now">${icon('camera')}<span>צילום עכשיו</span></button>
    </div>
  </section>`;
}
export const snoozeReminder = snoozePhotoReminder;

/** "הגדרות": reminder on/off, interval, zip backup / restore. */
export function photoSettingsCard() {
  const st = getState().settings || {};
  const n = Number(st.photoInterval) || 14;
  return `<section class="card">
    <div class="card-head">${icon('camera', 'head-ic')}<h2>תמונות התקדמות</h2></div>
    <label class="check"><input type="checkbox" data-photo-setting="photoReminder" ${st.photoReminder !== false ? 'checked' : ''}>
      <span class="check-box">${icon('check')}</span><span>תזכורת לצילום</span></label>
    <div class="field"><span>כל כמה זמן</span>
      <div class="segmented" role="radiogroup" aria-label="תדירות התזכורת">${[7, 14, 30].map((d) => `<label>
        <input type="radio" name="photoInterval" value="${d}" data-photo-setting="photoInterval" ${d === n ? 'checked' : ''}><span>${d} ימים</span></label>`).join('')}</div>
    </div>
    <p class="backup-last" data-photo-backup-last>${backupLine()}</p>
    <div class="btn-col">
      <button type="button" class="btn secondary block press" data-action="ph-backup">${icon('download')}<span>גיבוי תמונות</span></button>
      <button type="button" class="btn secondary block press" data-action="ph-restore">${icon('upload')}<span>שחזור תמונות</span></button>
    </div>
    <input type="file" accept=".zip,application/zip" data-photo-file hidden>
  </section>`;
}

export function savePhotoSetting(input) {
  if (input.dataset.photoSetting === 'photoReminder') updateSettings({ photoReminder: input.checked });
  else updateSettings({ photoInterval: Number(input.value) });
  toast('נשמר');
}

/* ---------- Zip backup / restore ---------- */

/** "גיבוי תמונות": share the zip when the system share sheet takes files, otherwise download it. */
export async function backupPhotos(ctx) {
  if (!sessions().length) return toast('אין תמונות לגיבוי');
  const file = await buildPhotoZip();
  let ok = false;
  let canShare = false;
  try { canShare = !!navigator.canShare?.({ files: [file] }); } catch { canShare = false; }
  if (canShare) {
    try { await navigator.share({ files: [file], title: file.name }); ok = true; } catch { ok = false; }
    if (ok) toast('גיבוי התמונות שותף');
  } else {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    ok = true;
    toast('קובץ גיבוי התמונות נוצר');
  }
  if (ok) {
    markPhotoBackup();
    ctx?.rerender();
  }
}

/** "שחזור תמונות": merge a photos zip (by session date, no duplicates). */
export async function restorePhotos(file, ctx) {
  try {
    const { added, skipped } = await importPhotoZip(file);
    toast(added
      ? `שוחזרו ${plural(added, 'תמונה אחת', 'תמונות')}${skipped ? ` · ${skipped} כבר היו במכשיר` : ''}`
      : 'כל התמונות בקובץ כבר במכשיר');
    ctx?.rerender();
  } catch (err) {
    toast(err.message || 'השחזור נכשל');
  }
}
