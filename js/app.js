// Entry point: tab routing, shared context and service worker registration.
import { getState, setSaveErrorHandler } from './storage.js';
import { todayKey } from './dates.js';
import { icon, toast, bindLongPress } from './ui.js';
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
  TABS.find((t) => t.id === ctx.tab).view.render(main, ctx);
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
    if (!document.querySelector('.sheet-backdrop, .timer-overlay')) render();
  }
});

setSaveErrorHandler(() => toast('השמירה נכשלה — ייתכן שהאחסון מלא'));

render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW registration failed', err));
  });
}
