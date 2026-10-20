// Full-screen level-up celebration (animation is disabled by the global prefers-reduced-motion rule).
import { icon, vibrate, HAPTIC, confetti } from './ui.js';

export function celebrateLevel(level) {
  return new Promise((resolve) => {
    const size = 240, stroke = 16;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const el = document.createElement('div');
    el.className = 'celebrate';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', `עלית לרמה ${level}`);
    el.innerHTML = `<div class="celebrate-inner">
      <div class="eyebrow">רמה חדשה</div>
      <div class="celebrate-ring">
        <svg viewBox="0 0 ${size} ${size}" aria-hidden="true">
          <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--track)" stroke-width="${stroke}"/>
          <circle class="celebrate-fill" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--accent)"
            stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" style="--c:${c.toFixed(1)}"
            transform="rotate(-90 ${size / 2} ${size / 2})"/>
        </svg>
        <div class="celebrate-num"><bdi class="num">${level}</bdi></div>
      </div>
      <h1>עלית לרמה ${level}</h1>
      <p class="muted">כל אימון, צעד ועלייה נספרים. ממשיכים.</p>
      <button type="button" class="btn primary block press" data-c="ok">${icon('check')}<span>המשך</span></button>
    </div>`;
    document.body.appendChild(el);
    document.body.classList.add('no-scroll');
    requestAnimationFrame(() => el.classList.add('open'));
    vibrate(HAPTIC.record);
    setTimeout(() => confetti({ x: 0.5, y: 0.4 }), 250);
    const close = () => {
      el.classList.remove('open');
      setTimeout(() => {
        el.remove();
        if (!document.querySelector('.sheet-backdrop')) document.body.classList.remove('no-scroll');
      }, 260);
      resolve();
    };
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-c=ok]') || e.target === el) close();
    });
  });
}
