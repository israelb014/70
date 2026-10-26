// Full-screen countdown for timed holds: big SVG ring, Wake Lock, beep + vibration at the end.
import { icon, esc, beep, vibrate, primeAudio } from './ui.js';
import { arcPath } from './charts.js';

/**
 * Runs a countdown of `seconds`. Resolves with the seconds achieved
 * (full target when it completes, elapsed when stopped early) or null when cancelled.
 */
export function runTimer(seconds, name) {
  primeAudio();
  return new Promise((resolve) => {
    const size = 280, stroke = 18;
    const r = (size - stroke) / 2;
    const el = document.createElement('div');
    el.className = 'timer-overlay';
    el.innerHTML = `<div class="timer-inner">
      <div class="eyebrow">${esc(name)}</div>
      <div class="timer-ring">
        <svg viewBox="0 0 ${size} ${size}" aria-hidden="true">
          <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--track)" stroke-width="${stroke}"/>
          <path class="timer-fill" d="${arcPath(size / 2, size / 2, r, 1, stroke)}" fill="none" stroke="var(--accent)"
            stroke-width="${stroke}" stroke-linecap="round"/>
        </svg>
        <div class="timer-center"><bdi class="timer-num num" dir="ltr">${seconds}</bdi><span class="muted">שניות</span></div>
      </div>
      <div class="timer-actions">
        <button type="button" class="btn ghost press" data-t="cancel">${icon('x')}<span>ביטול</span></button>
        <button type="button" class="btn primary press" data-t="stop">${icon('stop')}<span>עצירה ושמירה</span></button>
      </div>
    </div>`;
    document.body.appendChild(el);
    document.body.classList.add('no-scroll');
    requestAnimationFrame(() => el.classList.add('open'));

    const fill = el.querySelector('.timer-fill');
    const numEl = el.querySelector('.timer-num');
    const start = performance.now();
    let raf = 0;
    let finished = false;
    let wakeLock = null;

    const requestWake = async () => {
      try {
        if ('wakeLock' in navigator && document.visibilityState === 'visible') {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch {
        /* not available / denied */
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'visible' && !finished) requestWake();
    };
    document.addEventListener('visibilitychange', onVis);
    requestWake();

    const elapsed = () => (performance.now() - start) / 1000;

    const cleanup = (result) => {
      finished = true;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
      try {
        wakeLock?.release();
      } catch {
        /* ignore */
      }
      el.classList.remove('open');
      setTimeout(() => {
        el.remove();
        document.body.classList.remove('no-scroll');
      }, 260);
      resolve(result);
    };

    const tick = () => {
      const t = elapsed();
      const left = Math.max(0, seconds - t);
      fill.setAttribute('d', arcPath(size / 2, size / 2, r, left / seconds, stroke));
      numEl.textContent = String(Math.ceil(left));
      if (left <= 0) {
        finished = true;
        beep();
        vibrate([180, 90, 180]);
        el.classList.add('done');
        numEl.textContent = String(seconds);
        setTimeout(() => cleanup(seconds), 900);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-t]');
      if (!b || finished) return;
      if (b.dataset.t === 'cancel') cleanup(null);
      else cleanup(Math.floor(elapsed()));
    });
  });
}
