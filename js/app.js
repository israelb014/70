// Entry point: tab routing, shared context and service worker registration.
import { getState, setSaveErrorHandler, updateMeta } from './storage.js';
import { todayKey } from './dates.js';
import { icon, tabIcon, toast, queueToast, bindLongPress, countUp, confetti, vibrate, HAPTIC } from './ui.js';
import { levelInfo, walkHistory, BADGES } from './progress.js';
import { medallion } from './badgeArt.js';
import { celebrateLevel } from './celebrate.js';
import * as achievements from './views/achievements.js';
import * as today from './views/today.js';
import * as food from './views/food.js';
import * as trends from './views/trends.js';
import * as settings from './views/settings.js';
import * as wizard from './views/wizard.js';

const TABS = [
  { id: 'today', label: 'היום', icon: 'today', view: today },
  { id: 'food', label: 'אוכל', icon: 'food', view: food },
  { id: 'trends', label: 'מגמות', icon: 'trends', view: trends },
  { id: 'settings', label: 'הגדרות', icon: 'settings', view: settings },
];

// Screens reachable without a tab of their own.
const SCREENS = { achievements };

const main = document.getElementById('app');
const tabbar = document.getElementById('tabbar');

/** Shared state passed to views. `date` is shared by "היום" and "אוכל". */
const ctx = {
  tab: 'today',
  date: todayKey(),
  lastToday: todayKey(),
  justCompleted: new Set(),
  // In-place re-render (after a tap): skip card entrance animations.
  rerender: () => {
    main.classList.add('settled');
    render();
  },
  goTab: (id) => {
    const from = tabIndex(ctx.tab);
    if (SCREENS[id] && !SCREENS[ctx.tab]) ctx.prevTab = ctx.tab;
    ctx.tab = id;
    main.classList.remove('settled');
    // Content fades in and slides 8px in the direction of travel (RTL: higher index = further left).
    main.style.setProperty('--enter-x', tabIndex(id) >= from ? '-8px' : '8px');
    main.classList.remove('tab-enter');
    void main.offsetWidth;
    main.classList.add('tab-enter');
    render();
    window.scrollTo(0, 0);
  },
};

const tabIndex = (id) => {
  const i = TABS.findIndex((t) => t.id === (SCREENS[id] ? ctx.prevTab || 'trends' : id));
  return i < 0 ? 0 : i;
};

/** Floating tab bar, built once so the active indicator can slide between tabs. */
function renderTabbar() {
  if (!tabbar.dataset.built) {
    tabbar.innerHTML = `<span class="tab-indicator" aria-hidden="true"></span>${TABS.map(
      (t) => `<button type="button" class="tab" data-tab="${t.id}"><span class="tab-ic"></span><span>${t.label}</span></button>`
    ).join('')}`;
    tabbar.dataset.built = '1';
  }
  const activeId = SCREENS[ctx.tab] ? null : ctx.tab;
  tabbar.style.setProperty('--i', tabIndex(ctx.tab));
  tabbar.classList.toggle('no-active', !activeId);
  for (const t of TABS) {
    const b = tabbar.querySelector(`[data-tab="${t.id}"]`);
    const on = t.id === activeId;
    b.classList.toggle('active', on);
    b.setAttribute('aria-current', on ? 'page' : 'false');
    if (b.dataset.on !== String(on)) {
      b.querySelector('.tab-ic').innerHTML = tabIcon(t.icon, on);
      b.dataset.on = String(on);
    }
  }
}

function render() {
  if (!getState().settings) {
    tabbar.hidden = true;
    document.body.classList.add('wizard-mode');
    wizard.render(main, () => {
      main.classList.remove('settled');
      ctx.tab = 'today';
      ctx.date = todayKey();
      render();
      window.scrollTo(0, 0);
    });
    return;
  }
  document.body.classList.remove('wizard-mode');
  tabbar.hidden = false;
  renderTabbar();
  main.onkeydown = null;
  main.oninput = null;
  main.dataset.tab = ctx.tab;
  (SCREENS[ctx.tab] || TABS.find((t) => t.id === ctx.tab).view).render(main, ctx);
  if (!main.classList.contains('settled')) countUp(main);
  checkProgress();
}

/**
 * Level-ups and new badges are shown once: lastSeenLevel / seenBadges remember what was shown.
 * First run (fresh or migrated data): mark everything already earned as seen and show one summary.
 */
function checkProgress() {
  const meta = getState().meta;
  const walk = walkHistory();
  const earned = BADGES.filter((b) => walk.earned[b.id]);
  const { level } = levelInfo();

  if (meta.lastSeenLevel === null) {
    updateMeta({ lastSeenLevel: level, seenBadges: earned.map((b) => b.id) });
    if (earned.length || level > 1) {
      queueToast(`נפתחו ${earned.length} תגים ורמה ${level}`, { iconHTML: icon('trophy'), big: true });
    }
    return;
  }
  const fresh = earned.filter((b) => !meta.seenBadges.includes(b.id));
  if (fresh.length) {
    updateMeta({ seenBadges: [...meta.seenBadges, ...fresh.map((b) => b.id)] });
    fresh.forEach((b) => queueToast(`תג חדש: ${b.name}`, { iconHTML: medallion(b, true, 40), big: true }));
    confetti({ x: 0.5, y: 0.08 });
    vibrate(HAPTIC.record);
  }
  if (level > meta.lastSeenLevel) {
    updateMeta({ lastSeenLevel: level });
    celebrateLevel(level);
  }
}

tabbar.addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b && b.dataset.tab !== ctx.tab) {
    vibrate(HAPTIC.item);
    ctx.goTab(b.dataset.tab);
  }
});

// Long-press is bound once on the persistent container and dispatched to the active view.
bindLongPress(main, '[data-long]', (el) => {
  const view = TABS.find((t) => t.id === ctx.tab)?.view;
  view?.onLong?.(el, ctx);
});

// Enter in a single-line field commits it (fires change) instead of doing nothing.
main.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('input[data-change], input[data-setting]') && getState().settings) {
    e.target.blur();
  }
});

// If the app stays open past midnight, follow the new day when returning to it.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const t = todayKey();
  if (t !== ctx.lastToday) {
    if (ctx.date === ctx.lastToday) ctx.date = t;
    ctx.lastToday = t;
    if (!document.querySelector('.sheet-backdrop, .timer-overlay, .celebrate')) render();
  }
});

setSaveErrorHandler(() => toast('השמירה נכשלה — ייתכן שהאחסון מלא'));

render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW registration failed', err));
  });
}
