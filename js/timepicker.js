// 24-hour time picker: two snapping scroll wheels (hours, minutes) in a bottom sheet.
// Touch, mouse wheel and arrow keys; haptic tick on each snap; LTR digits; respects reduced motion.
import { openSheet, vibrate, esc } from './ui.js';

const ITEM = 48; // px per wheel row (≥ 48px touch target)
const pad = (n) => String(n).padStart(2, '0');

/**
 * Open the picker. value: "HH:MM" (prefill), step: minute step (5 for sleep, 1 for food time).
 * Resolves "HH:MM" or null when cancelled.
 */
export function openTimePicker({ value = '00:00', step = 1, title = 'בחירת שעה' } = {}) {
  const [h0, m0] = (/^\d{2}:\d{2}$/.test(value) ? value : '00:00').split(':').map(Number);
  const minutes = Array.from({ length: Math.ceil(60 / step) }, (_, i) => i * step);
  // Prefill snaps to the nearest step (wrapping 23:58 → 00:00 for a 5-minute step)
  let mi = Math.round(m0 / step);
  let hi = h0;
  if (mi >= minutes.length) { mi = 0; hi = (h0 + 1) % 24; }

  const wheel = (name, items, label) => `<div class="tp-wheel" data-wheel="${name}" tabindex="0" role="listbox" aria-label="${label}">
      <div class="tp-pad"></div>${items.map((v, i) => `<div class="tp-item" role="option" data-i="${i}">${pad(v)}</div>`).join('')}<div class="tp-pad"></div>
    </div>`;

  return openSheet({
    title,
    body: `<div class="tp" dir="ltr">
        <div class="tp-band" aria-hidden="true"></div>
        ${wheel('h', Array.from({ length: 24 }, (_, i) => i), 'שעות')}
        <div class="tp-colon" aria-hidden="true">:</div>
        ${wheel('m', minutes, 'דקות')}
      </div>
      <p class="tp-preview" aria-live="polite"></p>`,
    onOpen: (root) => {
      const wheels = { h: root.querySelector('[data-wheel=h]'), m: root.querySelector('[data-wheel=m]') };
      const preview = root.querySelector('.tp-preview');
      const state = { h: hi, m: mi };
      const len = { h: 24, m: minutes.length };
      const show = () => {
        for (const k of ['h', 'm']) {
          wheels[k].querySelectorAll('.tp-item').forEach((el, i) => el.classList.toggle('sel', i === state[k]));
        }
        preview.textContent = `${pad(state.h)}:${pad(minutes[state.m])}`;
        root.dataset.value = preview.textContent;
      };
      for (const k of ['h', 'm']) {
        const w = wheels[k];
        // Instant, silent prefill: no smooth animation, no haptic ticks on the way.
        w.style.scrollBehavior = 'auto';
        w.scrollTop = state[k] * ITEM;
        requestAnimationFrame(() => { w.style.scrollBehavior = ''; });
        let t = 0;
        w.addEventListener('scroll', () => {
          const i = Math.max(0, Math.min(len[k] - 1, Math.round(w.scrollTop / ITEM)));
          if (i !== state[k]) {
            state[k] = i;
            vibrate(5); // light tick on each snap position
            show();
          }
          clearTimeout(t);
          t = setTimeout(() => {
            if (Math.abs(w.scrollTop - state[k] * ITEM) > 1) w.scrollTo({ top: state[k] * ITEM });
          }, 120);
        }, { passive: true });
        w.addEventListener('click', (e) => {
          const item = e.target.closest('.tp-item');
          if (item) w.scrollTo({ top: Number(item.dataset.i) * ITEM });
        });
        w.addEventListener('keydown', (e) => {
          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
          e.preventDefault();
          const i = Math.max(0, Math.min(len[k] - 1, state[k] + (e.key === 'ArrowDown' ? 1 : -1)));
          w.scrollTo({ top: i * ITEM });
        });
      }
      show();
    },
    actions: [
      { label: 'ביטול', value: null, kind: 'ghost' },
      { label: 'אישור', kind: 'primary', onClick: (root) => root.dataset.value || null },
    ],
  });
}

/** Large tappable time value that opens the picker (rendered by views). */
export function timeField({ value, action, attrs = '', label }) {
  return `<button type="button" class="time-field press" data-action="${action}" ${attrs} aria-label="${esc(label)}: ${esc(value)}">
    <span class="time-field-lbl">${esc(label)}</span><bdi class="time-field-val num" dir="ltr">${esc(value)}</bdi></button>`;
}
