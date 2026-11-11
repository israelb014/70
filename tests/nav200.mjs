// v2.0.0 tile dashboards: the full cards of "היום" / "מגמות" live on tile detail pages.
// openCard(page, id) taps the tile (closing another open detail page first), like a user would.
// autoDetail(page) makes the existing suites reach a card through its detail page: when a selector is
// not on screen and it belongs to a card, the matching tile is opened first (real clicks).

const TODAY = [
  [/data-tile|date-(prev|next|today)|date-nav|copy-daily|insight|dash-|layout-edit|backup-|photo-(now|later)|bb-/, '@grid'],
  [/hero|ex-card|ex-head|exrow|ex-toggle|data-action="?set"?\]|sets-edit|\.chip\b|chip-reps|chip-lbl|set-hint|data-action="?timer|data-manual|manual-save|data-action="?rest|rest-btn|ring-legend|level-chip|\.streak|go-settings|empty-card|ex-list-card|ex-status|ex-name|ex-body|ex-tools|ex-chev|ring-sm|\.checkmark/, 'workout'],
  [/water|role-water/, 'fluids'],
  [/descent|climb|data-floors|btn-trio|big-add|small-add|stairs/, 'stairs'],
  [/nap|sleep/, 'sleep'],
  [/breath/, 'breath'],
  [/ride/, 'rides'],
  [/steps|role-steps/, 'steps'],
  [/weight/, 'weight'],
];
const TRENDS = [
  [/data-tile|copy-summary|insights-week|insight-list|layout-edit/, '@grid'],
  [/heatmap|hm-/, 'heatmap'],
  [/weight|lg-dot|lg-avg/, 'weight'],
  [/role-sleep/, 'sleep'],
  [/role-water/, 'fluids'],
  [/role-breath|breath-week/, 'breath'],
  [/role-protein/, 'protein'],
  [/role-steps/, 'steps'],
  [/rec-val|שיאים/, 'records'],
];

export async function openCard(page, id) {
  await page.evaluate(async (id) => {
    const app = document.getElementById('app');
    if (app.dataset.detail === id) return;
    const back = app.querySelector('.detail-head [data-action=detail-back]');
    if (back) back.click();
    if (id === '@grid') return;
    app.querySelector(`[data-tile-id="${id}"] .tile-open, [data-tile-id="${id}"]`)?.click();
  }, id);
  await page.waitForTimeout(80);
}

// Card titles inside Playwright text selectors (:text("…") / :has-text("…")).
const TEXT_TODAY = [[/"שינה"/, 'sleep'], [/"מים"/, 'fluids'], [/"רכיבה"/, 'rides'], [/"מדרגות"/, 'stairs'], [/"צעדים"/, 'steps'], [/"תרגילים"/, 'workout'], [/"נשימה"/, 'breath'], [/"משקל"/, 'weight']];
const TEXT_TRENDS = [[/שינה · 7/, 'sleep'], [/מים · 7/, 'fluids'], [/צעדים · 7/, 'steps'], [/חלבון · 7/, 'protein'], [/נשימה · 7/, 'breath'], [/"משקל"/, 'weight'], [/שיאים/, 'records'], [/שנה של פעילות/, 'heatmap']];
const tileFor = (sel, tab) => {
  for (const [re, id] of tab === 'trends' ? TEXT_TRENDS : tab === 'today' ? TEXT_TODAY : []) if (re.test(sel)) return id;
  for (const [re, id] of tab === 'trends' ? TRENDS : tab === 'today' ? TODAY : []) if (re.test(sel)) return id;
  return null;
};

async function ensure(page, sel) {
  if (typeof sel !== 'string' || sel.includes('.sheet') || sel.includes('.toast') || sel.startsWith('[data-tab')) return;
  const st = await page.evaluate((sel) => {
    let found = false;
    // Playwright-only selectors (:text(), :has-text(), text=): judge by the CSS part before the pseudo.
    const css = sel.replace(/:(text|text-is|has-text)\([^)]*\)/g, '').replace(/:has\(\s*\)/g, '');
    try { found = !!document.querySelector(css); } catch { found = true; }
    const app = document.getElementById('app');
    return { found, tab: app?.dataset.tab, open: app?.querySelector('.detail-head h1')?.textContent || null, sheet: !!document.querySelector('.sheet-backdrop, .timer-overlay') };
  }, sel).catch(() => ({ found: true }));
  if (st.sheet) return;
  if (st.found && /:(text|text-is|has-text)\(/.test(sel) && page.__raw) st.found = (await page.__raw(sel).count().catch(() => 1)) > 0;
  if (st.found) return;
  const id = tileFor(sel, st.tab);
  if (id) await openCard(page, id);
}

const METHODS = ['click', 'textContent', 'innerText', '$', '$$', '$eval', '$$eval', 'getAttribute', 'fill', 'inputValue', 'isChecked', 'isVisible', 'isHidden', 'waitForSelector', 'press', 'focus', 'hover', 'dispatchEvent', 'tap'];

export function autoDetail(page) {
  for (const m of METHODS) {
    const orig = page[m].bind(page);
    page[m] = async (sel, ...rest) => { await ensure(page, sel); return orig(sel, ...rest); };
  }
  const loc = page.locator.bind(page);
  page.__raw = loc;
  const wrap = (l, sel) => new Proxy(l, {
    get(t, k) {
      const v = t[k];
      if (typeof v !== 'function') return v;
      if (['first', 'last', 'nth', 'locator', 'filter'].includes(k)) return (...a) => wrap(v.apply(t, a), sel);
      return async (...a) => { await ensure(page, sel); return v.apply(t, a); };
    },
  });
  page.locator = (sel, ...rest) => wrap(loc(sel, ...rest), sel);
  return page;
}
