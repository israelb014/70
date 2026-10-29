// "סידור המסך": order and visibility of the tiles on "היום" or "מגמות". Changes stay in a working copy
// until "סיום"; back discards them. Drag the handle, or use the up / down buttons; the eye hides a tile.
import { getState, updateSettings } from '../storage.js';
import { icon, esc, toast, vibrate, HAPTIC } from '../ui.js';
import { layoutOf, defaultLayout } from '../tiles.js';
import { HOME_TILES } from './today.js';
import { TREND_TILES } from './trends.js';

const TABS = {
  home: { key: 'homeLayout', defs: HOME_TILES, tab: 'today', title: 'היום' },
  trends: { key: 'trendsLayout', defs: TREND_TILES, tab: 'trends', title: 'מגמות' },
};

export function render(root, ctx) {
  const cfg = TABS[ctx.layoutFor] || TABS.home;
  if (!ctx.layoutDraft || ctx.layoutDraft.for !== cfg.key) ctx.layoutDraft = { for: cfg.key, list: layoutOf(cfg.key, cfg.defs) };
  const list = ctx.layoutDraft.list;
  const def = Object.fromEntries(cfg.defs.map((d) => [d.id, d]));

  root.innerHTML = `
    <header class="page-head with-back">
      <button type="button" class="icon-btn press" data-action="back" aria-label="חזרה בלי לשמור">${icon('chevR')}</button>
      <div class="grow"><h1>סידור המסך</h1><span class="muted small">${esc(cfg.title)} · גוררים לשינוי הסדר</span></div>
    </header>
    <section class="card lay-card">
      <ul class="lay-list" data-lay-list>
        ${list.map((x, i) => `<li class="lay-row ${x.visible ? '' : 'off'}" data-id="${x.id}">
          <span class="lay-grip" data-grip aria-hidden="true">${icon('grip')}</span>
          <span class="lay-ic">${icon(def[x.id].icon)}</span>
          <span class="grow lay-name"><b>${esc(def[x.id].label)}</b>${def[x.id].full ? '<small>רוחב מלא</small>' : ''}</span>
          <button type="button" class="icon-btn sm press" data-action="lay-up" data-i="${i}" aria-label="הזזת ${esc(def[x.id].label)} למעלה" ${i ? '' : 'disabled'}>${icon('up')}</button>
          <button type="button" class="icon-btn sm press" data-action="lay-down" data-i="${i}" aria-label="הזזת ${esc(def[x.id].label)} למטה" ${i < list.length - 1 ? '' : 'disabled'}>${icon('down')}</button>
          <button type="button" class="icon-btn sm press lay-eye" data-action="lay-eye" data-i="${i}" aria-pressed="${x.visible}"
            aria-label="${x.visible ? 'הסתרת' : 'הצגת'} ${esc(def[x.id].label)}">${icon(x.visible ? 'eye' : 'eyeOff')}</button>
        </li>`).join('')}
      </ul>
    </section>
    <button type="button" class="btn ghost block press" data-action="lay-reset">${icon('undo')}<span>איפוס לברירת מחדל</span></button>
    <button type="button" class="btn primary block press" data-action="lay-done">${icon('check')}<span>סיום</span></button>`;

  const back = () => {
    ctx.layoutDraft = null;
    ctx.goTab(ctx.prevTab || cfg.tab);
  };
  root.onclick = (e) => {
    const b = e.target.closest('[data-action]');
    if (!b || b.disabled) return;
    const i = Number(b.dataset.i);
    switch (b.dataset.action) {
      case 'back':
        return back();
      case 'lay-up':
      case 'lay-down': {
        const j = b.dataset.action === 'lay-up' ? i - 1 : i + 1;
        [list[i], list[j]] = [list[j], list[i]];
        vibrate(HAPTIC.item);
        ctx.rerender();
        // Keep focus on the moved row's same button.
        root.querySelector(`[data-action="${b.dataset.action}"][data-i="${j}"]`)?.focus();
        return;
      }
      case 'lay-eye':
        list[i].visible = !list[i].visible;
        vibrate(HAPTIC.item);
        return ctx.rerender();
      case 'lay-reset':
        ctx.layoutDraft.list = defaultLayout(cfg.defs);
        vibrate(HAPTIC.item);
        return ctx.rerender();
      case 'lay-done':
        updateSettings({ [cfg.key]: list.map((x) => ({ id: x.id, visible: x.visible })) });
        vibrate(HAPTIC.item);
        toast('הסידור נשמר');
        return back();
    }
  };
  root.onchange = null;
  bindDrag(root, ctx, list);
}

/**
 * Drag to reorder: press the handle and move; the row follows the finger and swaps places with the
 * row it passes. The new order is applied to the working copy on release.
 */
function bindDrag(root, ctx, list) {
  const ul = root.querySelector('[data-lay-list]');
  ul.onpointerdown = (e) => {
    const grip = e.target.closest('[data-grip]');
    if (!grip) return;
    e.preventDefault();
    const row = grip.closest('.lay-row');
    let lastY = e.clientY, offset = 0;
    row.classList.add('dragging');
    ul.setPointerCapture?.(e.pointerId);
    vibrate(10);
    const move = (ev) => {
      offset += ev.clientY - lastY;
      lastY = ev.clientY;
      // Swap with the neighbour once the row has passed half of it.
      const prev = row.previousElementSibling, next = row.nextElementSibling;
      if (next && offset > next.offsetHeight / 2) {
        next.after(row);
        offset -= next.offsetHeight + rowGap(ul);
      } else if (prev && offset < -prev.offsetHeight / 2) {
        prev.before(row);
        offset += prev.offsetHeight + rowGap(ul);
      }
      row.style.transform = `translateY(${offset}px)`;
    };
    const up = () => {
      ul.removeEventListener('pointermove', move);
      ul.removeEventListener('pointerup', up);
      ul.removeEventListener('pointercancel', up);
      row.classList.remove('dragging');
      row.style.transform = '';
      const order = [...ul.children].map((li) => li.dataset.id);
      const changed = order.some((id, i) => list[i].id !== id);
      if (!changed) return;
      const byId = Object.fromEntries(list.map((x) => [x.id, x]));
      list.splice(0, list.length, ...order.map((id) => byId[id]));
      vibrate(HAPTIC.item);
      ctx.rerender();
    };
    ul.addEventListener('pointermove', move);
    ul.addEventListener('pointerup', up);
    ul.addEventListener('pointercancel', up);
  };
}

const rowGap = (ul) => parseFloat(getComputedStyle(ul).rowGap) || 0;
