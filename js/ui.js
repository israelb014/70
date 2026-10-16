// Shared UI helpers: hand-written SVG icons, formatting, toast, bottom sheets, feedback.
import { longLabel, relativeLabel, todayKey, addDays } from './dates.js';

/* ---------- Icons (24×24, stroke-based, currentColor) ---------- */
const P = {
  today: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  food: '<path d="M6 3v7a2.5 2.5 0 0 0 5 0V3M8.5 3v18M17.5 21V3c-2.2 1.2-3.5 4-3.5 8h3.5"/>',
  trends: '<path d="M3 17l5.5-5.5 4 4L21 7"/><path d="M15 7h6v6"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
  chevR: '<path d="M9 5l7 7-7 7"/>',
  chevL: '<path d="M15 5l-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  flame: '<path d="M12 21c-3.9 0-7-2.8-7-6.6 0-3 1.8-5.1 3.4-6.8.3 1.8 1.2 3 2.4 3.6C10.6 7.8 12 5 14.5 3c.2 3.2 1.7 4.8 3 6.4 1 1.3 1.5 2.9 1.5 4.9C19 18.2 15.9 21 12 21z"/>',
  steps: '<path d="M8.5 3.5c1.7 0 2.7 1.8 2.5 4.2-.2 2-1 3.3-2.6 3.3S5.7 9.6 5.8 7.6C5.9 5.3 6.9 3.5 8.5 3.5zM6.3 14h4.6l-.4 2.6a2.3 2.3 0 0 1-4.5-.3zM15.5 8c1.7 0 2.7 1.8 2.6 4.2-.2 2-1 3.3-2.6 3.3s-2.7-1.4-2.6-3.4C13 9.8 14 8 15.5 8zM13.2 18.5h4.6l-.4 2.1a2.3 2.3 0 0 1-4.5-.3z"/>',
  stairs: '<path d="M3 20h5v-4.5h4.5V11H17V6.5h4"/><path d="M3 20h18"/>',
  roof: '<path d="M3 11l9-7 9 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
  bike: '<circle cx="5.5" cy="16.5" r="3.5"/><circle cx="18.5" cy="16.5" r="3.5"/><path d="M5.5 16.5L9 9h6.5l3 7.5M9 9l3.5 7.5h-7M14 5.5h2.5L18 9"/>',
  dumbbell: '<path d="M3 9.5v5M6 7v10M18 7v10M21 9.5v5M6 12h12"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M9.5 2.5h5M18.5 6.5l1.5-1.5"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  scale: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><path d="M8.5 9.5a5 5 0 0 1 7 0L13 12"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H4.5c0 2.5 1.3 4 3.6 4.3M16 6h3.5c0 2.5-1.3 4-3.6 4.3M12 13v4M8.5 20.5h7M9.5 17h5"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="3"/><path d="M15.5 5.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h.5"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M4.5 20h15"/>',
  upload: '<path d="M12 16V5M7 9.5l5-5 5 5M4.5 20h15"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  play: '<path d="M7.5 5v14l11-7z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2.5"/>',
  bolt: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  barcode: '<path d="M4 7V5.5A1.5 1.5 0 0 1 5.5 4H7M17 4h1.5A1.5 1.5 0 0 1 20 5.5V7M20 17v1.5a1.5 1.5 0 0 1-1.5 1.5H17M7 20H5.5A1.5 1.5 0 0 1 4 18.5V17M7.5 8v8M10.5 8v8M13 8v8M16.5 8v8"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.8-4.8"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="3"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M8 14h8"/>',
  box: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
  bed: '<path d="M3 18V6M3 14h18v4M21 14v-2.5a3 3 0 0 0-3-3h-7v5.5"/><circle cx="7" cy="11" r="1.8"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.5h.01"/>',
};

export function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

/** Animated check mark used when an item is completed. `draw` plays the draw-in animation. */
export function checkMark(draw = false) {
  return `<svg class="checkmark ${draw ? 'draw' : ''}" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" pathLength="1"/></svg>`;
}

/* ---------- Formatting ---------- */

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Locale-formatted number (thousands separators, up to 1 decimal). */
export function fmt(n, digits = 1) {
  if (n === null || n === undefined || n === '' || !Number.isFinite(Number(n))) return '–';
  return Number(n).toLocaleString('he-IL', { maximumFractionDigits: digits });
}

/** Number wrapped in an LTR isolate so it renders correctly inside RTL text. */
export function num(n, digits) {
  return `<bdi class="num">${typeof n === 'string' ? esc(n) : fmt(n, digits)}</bdi>`;
}

/** Parse a user-entered number; returns null for empty/invalid. */
export function parseNum(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/* ---------- Toast ---------- */

let toastTimer;
export function toast(msg, { iconHTML = icon('check'), duration = 2200, big = false } = {}) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.innerHTML = `${iconHTML}<span>${esc(msg)}</span>`;
  el.classList.toggle('big', big);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

// Sequential toasts (e.g. several badges unlocked at once) so none overwrites another.
const toastQueue = [];
let queueBusy = false;
export function queueToast(msg, opts = {}) {
  toastQueue.push([msg, opts]);
  if (!queueBusy) runQueue();
}
function runQueue() {
  const next = toastQueue.shift();
  if (!next) {
    queueBusy = false;
    return;
  }
  queueBusy = true;
  const duration = next[1].duration || 2800;
  toast(next[0], { ...next[1], duration });
  setTimeout(runQueue, duration + 350);
}

/* ---------- Bottom sheet dialogs ---------- */

/**
 * Open a bottom sheet. Resolves with the clicked action's value (or what its onClick returns),
 * or null when dismissed. An onClick returning false keeps the sheet open (validation).
 */
export function openSheet({ title, body = '', actions = [], onOpen }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'sheet-backdrop';
    wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-handle"></div>
      <h2 class="sheet-title">${esc(title)}</h2>
      <div class="sheet-body">${body}</div>
      <div class="sheet-actions">${actions
        .map((a, i) => `<button type="button" class="btn press ${a.kind || ''}" data-sheet-i="${i}">${esc(a.label)}</button>`)
        .join('')}</div>
    </div>`;
    document.body.appendChild(wrap);
    document.body.classList.add('no-scroll');
    requestAnimationFrame(() => wrap.classList.add('open'));

    let closed = false;
    const close = (v) => {
      if (closed) return;
      closed = true;
      wrap.classList.remove('open');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => {
        wrap.remove();
        if (!document.querySelector('.sheet-backdrop')) document.body.classList.remove('no-scroll');
      }, 260);
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(null);
    };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) return close(null);
      const b = e.target.closest('[data-sheet-i]');
      if (!b) return;
      const a = actions[Number(b.dataset.sheetI)];
      const r = a.onClick ? a.onClick(wrap) : undefined;
      if (r === false) return;
      close(r === undefined ? (a.value ?? null) : r);
    });
    // Enter inside a single-line input submits with the primary action
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches('input:not([type=checkbox])')) {
        const primary = wrap.querySelector('.btn.primary');
        if (primary) {
          e.preventDefault();
          primary.click();
        }
      }
    });
    onOpen?.(wrap);
  });
}

export async function confirmDialog(message, { title = 'אישור', ok = 'אישור', cancel = 'ביטול', danger = false } = {}) {
  const r = await openSheet({
    title,
    body: `<p class="sheet-text">${esc(message)}</p>`,
    actions: [
      { label: cancel, value: false, kind: 'ghost' },
      { label: ok, value: true, kind: danger ? 'danger' : 'primary' },
    ],
  });
  return r === true;
}

/** Mark invalid input inside a sheet and focus it. Returns false (to keep a sheet open). */
export function invalid(input, msg) {
  if (input) {
    input.classList.add('invalid');
    input.focus();
    setTimeout(() => input.classList.remove('invalid'), 1200);
  }
  if (msg) toast(msg);
  return false;
}

/* ---------- Feedback ---------- */

export function vibrate(pattern = 30) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch {
    /* unsupported */
  }
}

let audioCtx;
/** Short two-tone beep via WebAudio (used at the end of a timer). */
export function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    [0, 0.22].forEach((offset, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = i ? 1175 : 880;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.35, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.2);
    });
  } catch {
    /* audio unavailable */
  }
}

/** Unlock audio on a user gesture so the end-of-timer beep can play later. */
export function primeAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {
    /* audio unavailable */
  }
}

/* ---------- Day navigation header (shared by "היום" and "אוכל") ---------- */

export function dateNav(k, title, eyebrowHTML = '') {
  const rel = relativeLabel(k);
  const isToday = k >= todayKey();
  // RTL: the first button sits on the right and goes back in time.
  return `<header class="date-nav">
    <button type="button" class="icon-btn press" data-action="date-prev" aria-label="היום הקודם">${icon('chevR')}</button>
    <div class="date-nav-label">
      ${eyebrowHTML || `<span class="eyebrow">${esc(title)}</span>`}
      <h1>${esc(rel || longLabel(k))}</h1>
      ${rel ? `<span class="muted small">${esc(longLabel(k))}</span>` : '<button type="button" class="link-btn" data-action="date-today">חזרה להיום</button>'}
    </div>
    <button type="button" class="icon-btn press" data-action="date-next" aria-label="היום הבא" ${isToday ? 'disabled' : ''}>${icon('chevL')}</button>
  </header>`;
}

/** Handles date-nav actions; returns true when the date changed. Never moves into the future. */
export function handleDateNav(action, ctx) {
  const today = todayKey();
  if (action === 'date-prev') ctx.date = addDays(ctx.date, -1);
  else if (action === 'date-next' && ctx.date < today) ctx.date = addDays(ctx.date, 1);
  else if (action === 'date-today') ctx.date = today;
  else return false;
  if (ctx.date > today) ctx.date = today;
  return true;
}

/** Long-press detection for elements matching `selector` inside root. */
export function bindLongPress(root, selector, onLong, ms = 480) {
  let timer = null;
  let startX = 0, startY = 0;
  root.addEventListener('pointerdown', (e) => {
    const el = e.target.closest(selector);
    if (!el) return;
    startX = e.clientX;
    startY = e.clientY;
    clearTimeout(timer);
    timer = setTimeout(() => {
      el.dataset.longPressed = '1';
      vibrate(15);
      onLong(el);
    }, ms);
  });
  const cancel = () => clearTimeout(timer);
  root.addEventListener('pointerup', cancel);
  root.addEventListener('pointercancel', cancel);
  root.addEventListener('pointerleave', cancel);
  root.addEventListener('pointermove', (e) => {
    if (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10) cancel();
  });
  root.addEventListener('contextmenu', (e) => {
    if (e.target.closest(selector)) e.preventDefault();
  });
}
