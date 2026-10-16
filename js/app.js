// Entry point: tab routing, shared context and service worker registration.
import { getState, setSaveErrorHandler, updateMeta } from './storage.js';
import { todayKey } from './dates.js';
import { icon, toast, queueToast, bindLongPress } from './ui.js';
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
    if (SCREENS[id] && !SCREENS[ctx.tab]) ctx.prevTab = ctx.tab;
    ctx.tab = id;
    main.classList.remove('settled');
    render();
    window.scrollTo(0, 0);
  },
};

function renderTabbar() {
  tabbar.innerHTML = TABS.map(
    (t) => `<button type="button" class="tab ${ctx.tab === t.id ? 'active' : ''}" data-tab="${t.id}"
      aria-current="${ctx.tab === t.id ? 'page' : 'false'}">${icon(t.icon)}<span>${t.label}</span></button>`
  ).join('');
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
  }
  if (level > meta.lastSeenLevel) {
    updateMeta({ lastSeenLevel: level });
    celebrateLevel(level);
  }
}

tabbar.addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b && b.dataset.tab !== ctx.tab) ctx.goTab(b.dataset.tab);
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
