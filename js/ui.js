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
  drop: '<path d="M12 3.5c3 3.6 6 7.2 6 10.5a6 6 0 0 1-12 0c0-3.3 3-6.9 6-10.5z"/><path d="M9 14.5a3 3 0 0 0 3 3"/>',
  glass: '<path d="M6 4h12l-1.6 15a1.5 1.5 0 0 1-1.5 1.3H9.1a1.5 1.5 0 0 1-1.5-1.3z"/><path d="M6.7 10.5h10.6"/>',
  bottle: '<path d="M10 2.5h4M10.5 2.5v3L8.5 8.5v11a2 2 0 0 0 2 2h3a2 2 0 0 0 2-2v-11l-2-3v-3"/><path d="M8.5 12.5h7"/>',
  bed: '<path d="M3 18V6M3 14h18v4M21 14v-2.5a3 3 0 0 0-3-3h-7v5.5"/><circle cx="7" cy="11" r="1.8"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.5h.01"/>',
  backup: '<path d="M7.5 18.5H7a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1A4 4 0 0 1 17 18.5h-.5"/><path d="M12 20.5v-8M8.8 15.5l3.2-3.2 3.2 3.2"/>',
  share: '<circle cx="17.5" cy="5.5" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="18.5" r="2.5"/><path d="M8.7 10.7l6.6-3.9M8.7 13.3l6.6 3.9"/>',
};

// Filled variants for the active tab (outline when inactive).
const FILLED = {
  today: '<circle cx="12" cy="12" r="9.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="4.5" stroke="var(--bg)" stroke-width="2.2"/><circle cx="12" cy="12" r="1.2" fill="var(--bg)" stroke="none"/>',
  food: '<path d="M6 3v7a2.5 2.5 0 0 0 5 0V3M8.5 3v18"/><path d="M17.5 21V3c-2.2 1.2-3.5 4-3.5 8h3.5z" fill="currentColor"/>',
  trends: '<path d="M3 20h18" /><rect x="4.5" y="12" width="3.5" height="6" rx="1.2" fill="currentColor" stroke="none"/><rect x="10.25" y="8" width="3.5" height="10" rx="1.2" fill="currentColor" stroke="none"/><rect x="16" y="4" width="3.5" height="14" rx="1.2" fill="currentColor" stroke="none"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.6" fill="currentColor"/><circle cx="9" cy="17" r="2.6" fill="currentColor"/>',
};
P.trendsOutline = '<path d="M3 20h18"/><rect x="4.5" y="12" width="3.5" height="6" rx="1.2"/><rect x="10.25" y="8" width="3.5" height="10" rx="1.2"/><rect x="16" y="4" width="3.5" height="14" rx="1.2"/>';
// Insight categories
P['cat-sleep'] = '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/><path d="M16 3.5h3l-3 3.5h3"/>';
P['cat-food'] = '<path d="M12 7c-1.5-2.5-6-2.5-7 1.5-1 4 1.5 9.5 4 11 1 .6 2 .2 3-.5 1 .7 2 1.1 3 .5 2.5-1.5 5-7 4-11-1-4-5.5-4-7-1.5z"/><path d="M12 7c0-2 1-3.5 2.5-4"/>';
P['cat-activity'] = '<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>';
P['cat-strength'] = '<path d="M3 9.5v5M6 7v10M18 7v10M21 9.5v5M6 12h12"/>';
P['cat-weight'] = '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><path d="M8.5 9.5a5 5 0 0 1 7 0L13 12"/>';
P['cat-consistency'] = '<rect x="3.5" y="5" width="17" height="15.5" rx="3.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4M9 14.5l2 2 4-4"/>';
P.sparkle = '<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6zM18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>';

/** Tab icon: filled when active, outline otherwise. */
export function tabIcon(name, active) {
  const paths = active ? FILLED[name] : name === 'trends' ? P.trendsOutline : P[name];
  return `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths || ''}</svg>`;
}

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
/**
 * Pill toast at the top. Optional action (e.g. undo): { label, onClick }.
 */
export function toast(msg, { iconHTML = icon('check'), duration = 2200, big = false, action = null } = {}) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.innerHTML = `<span class="toast-ic">${iconHTML}</span><span class="toast-msg">${esc(msg)}</span>${
    action ? `<button type="button" class="toast-action press">${esc(action.label)}</button>` : ''}`;
  el.classList.toggle('big', big);
  el.classList.toggle('has-action', !!action);
  el.classList.add('show');
  if (action) {
    el.querySelector('.toast-action').onclick = () => {
      el.classList.remove('show');
      action.onClick();
    };
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? Math.max(duration, 4000) : duration);
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
    // Swipe down on the handle/title to dismiss
    const sheetEl = wrap.querySelector('.sheet');
    let y0 = null, dy = 0;
    sheetEl.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.sheet-handle, .sheet-title') || e.button > 0) return;
      y0 = e.clientY; dy = 0;
      sheetEl.setPointerCapture?.(e.pointerId);
      sheetEl.classList.add('dragging');
    });
    sheetEl.addEventListener('pointermove', (e) => {
      if (y0 === null) return;
      dy = Math.max(0, e.clientY - y0);
      sheetEl.style.transform = `translateY(${dy}px)`;
    });
    const endDrag = () => {
      if (y0 === null) return;
      y0 = null;
      sheetEl.classList.remove('dragging');
      sheetEl.style.transform = '';
      if (dy > 90) close(null);
    };
    sheetEl.addEventListener('pointerup', endDrag);
    sheetEl.addEventListener('pointercancel', endDrag);
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

/**
 * Horizontal swipe (either direction) past a threshold removes a row: rows matching `selector` slide out,
 * then onRemove(row) runs. A swipe never also triggers the row's tap action.
 */
export function bindSwipe(root, selector, onRemove) {
  root.querySelectorAll(selector).forEach((row) => {
    let x0 = null, y0 = 0, dx = 0, horizontal = false;
    row.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') && e.target.closest('button') !== row) return;
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
        vibrate(HAPTIC.item);
        setTimeout(() => onRemove(row), 160);
      } else {
        row.style.transform = '';
        row.style.opacity = '';
      }
    };
    row.addEventListener('pointerup', end);
    row.addEventListener('pointercancel', end);
    row.addEventListener('click', (e) => {
      if (horizontal) { e.stopPropagation(); e.preventDefault(); }
    }, true);
  });
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

/** Haptic presets: completing a set/item, reaching a target, records / level-ups. */
export const HAPTIC = { item: 10, target: 20, record: [30, 50, 30, 50, 80] };

export function vibrate(pattern = HAPTIC.item) {
  try {
    // Browsers block vibration before the first user gesture (and log an error) — skip then.
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch {
    /* unsupported */
  }
}

export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Count numbers up to their value: elements with data-count="1234" (and optional data-dec). */
export function countUp(root) {
  const els = root.querySelectorAll('[data-count]');
  if (!els.length) return;
  if (reducedMotion()) return;
  const start = performance.now();
  const dur = 700;
  const items = [...els].map((el) => ({ el, to: Number(el.dataset.count), dec: Number(el.dataset.dec || 0) }));
  const step = (now) => {
    const t = Math.min(1, (now - start) / dur);
    const e = 1 - Math.pow(1 - t, 3);
    for (const { el, to, dec } of items) {
      if (!el.isConnected) continue;
      el.textContent = (to * e).toLocaleString('he-IL', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    }
    if (t < 1) requestAnimationFrame(step);
  };
  for (const { el, dec } of items) el.textContent = (0).toLocaleString('he-IL', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  requestAnimationFrame(step);
}

/** Short (≤ 1.2 s) confetti burst built from CSS pieces. */
export function confetti(origin = { x: 0.5, y: 0.35 }) {
  if (reducedMotion()) return;
  const colors = ['var(--accent)', 'var(--steps)', 'var(--protein)', 'var(--sleep)', 'var(--water)', 'var(--success)'];
  const box = document.createElement('div');
  box.className = 'confetti';
  box.setAttribute('aria-hidden', 'true');
  box.style.left = `${origin.x * 100}%`;
  box.style.top = `${origin.y * 100}%`;
  let html = '';
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2 + (i % 3) * 0.2;
    const dist = 90 + ((i * 37) % 80);
    html += `<i style="--dx:${Math.cos(a) * dist}px;--dy:${Math.sin(a) * dist - 40}px;--r:${(i * 47) % 360}deg;
      background:${colors[i % colors.length]};${i % 2 ? 'border-radius:50%;' : ''}animation-delay:${(i % 4) * 20}ms"></i>`;
  }
  box.innerHTML = html;
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 1200);
}

/* ---------- Empty states & skeletons ---------- */

const ART = {
  insights: '<circle cx="40" cy="34" r="16"/><path d="M33 52h14M35 58h10M40 10v6M18 34h-6M68 34h-6M24 18l4 4M56 18l-4 4"/>',
  food: '<path d="M14 44h52a26 26 0 0 1-52 0z"/><path d="M28 30c0-6 6-6 6-12M40 30c0-6 6-6 6-12M52 30c0-6 6-6 6-12"/>',
  weight: '<rect x="14" y="14" width="52" height="52" rx="14"/><path d="M28 32a17 17 0 0 1 24 0L44 41"/><circle cx="40" cy="44" r="3"/>',
  dumbbell: '<path d="M12 32v16M20 24v32M60 24v32M68 32v16M20 40h40"/>',
  trophy: '<path d="M26 14h28v18a14 14 0 0 1-28 0z"/><path d="M26 20H16c0 9 5 14 12 14M54 20h10c0 9-5 14-12 14M40 46v10M30 66h20M33 56h14"/>',
  search: '<circle cx="36" cy="36" r="18"/><path d="M50 50l14 14M28 36h16"/>',
};

/** Small line illustration + one sentence + optional action button HTML. */
export function emptyState(art, text, actionHTML = '') {
  return `<div class="empty-state">
    <svg class="empty-art" viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="2.5"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ART[art] || ART.insights}</svg>
    <p>${esc(text)}</p>${actionHTML}
  </div>`;
}

/** Shimmer placeholder rows. */
export function skeleton(rows = 3) {
  return `<div class="skeleton" aria-busy="true" aria-label="טוען">${'<div class="sk-row"><i></i><i></i></div>'.repeat(rows)}</div>`;
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
      ${eyebrowHTML || (title ? `<span class="eyebrow">${esc(title)}</span>` : '')}
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
