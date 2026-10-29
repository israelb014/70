// Tile dashboards ("היום" / "מגמות"): tile markup, mini visuals, saved layouts, detail-page header
// and the swipe-back gesture. Tiles are a layout only: every value comes from the same stats helpers
// the full cards use.
import { getState } from './storage.js';
import { icon, esc } from './ui.js';
import { arcFill } from './charts.js';

const clamp01 = (v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

/** "רשימה מלאה" shows both tabs as long card lists (the layout before tiles). */
export const tilesOn = () => getState().settings?.screenMode !== 'list';

/**
 * Saved order + visibility for a tab ({id, visible}[] under settings[key]). Unknown ids are dropped;
 * ids missing from the saved list (or no saved list) take their default place, visible.
 */
export function layoutOf(key, defs) {
  const saved = Array.isArray(getState().settings?.[key]) ? getState().settings[key] : [];
  const known = new Set(defs.map((d) => d.id));
  const out = [];
  const seen = new Set();
  for (const x of saved) {
    if (x && known.has(x.id) && !seen.has(x.id)) {
      out.push({ id: x.id, visible: x.visible !== false });
      seen.add(x.id);
    }
  }
  defs.forEach((d, i) => {
    if (seen.has(d.id)) return;
    // Insert after the closest preceding default that is already placed.
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const p = out.findIndex((x) => x.id === defs[j].id);
      if (p >= 0) { at = p + 1; break; }
    }
    out.splice(at, 0, { id: d.id, visible: true });
    seen.add(d.id);
  });
  return out;
}

export const defaultLayout = (defs) => defs.map((d) => ({ id: d.id, visible: true }));

/** "—" + "עוד אין נתונים" for a tile without data. */
export const EMPTY = { value: '—', sub: 'עוד אין נתונים', empty: true };

/**
 * One tile. t: { id, role, icon, label, value, sub, sub2 (second line), visual, full, empty, quick: { action, icon, label, attrs } }.
 * The quick action is a sibling button (never inside the open button) so it never opens the tile.
 */
export function tile(t) {
  const q = t.quick;
  return `<div class="tile role-${t.role}${t.full ? ' full' : ''}${t.empty ? ' is-empty' : ''}${q ? ' has-quick' : ''}" data-tile="${t.id}">
    <button type="button" class="tile-open press" data-action="tile-open" data-tile-id="${t.id}" aria-label="${esc(t.label)} · פרטים">
      <span class="tile-text">
        <span class="tile-head">${icon(t.icon, 'tile-ic')}<span class="tile-lbl">${esc(t.label)}</span></span>
        <span class="tile-val" data-tile-val>${t.value}</span>
        <span class="tile-sub" data-tile-sub>${t.sub}</span>
        ${t.sub2 && !t.empty ? `<span class="tile-sub tile-sub2" data-tile-sub2>${t.sub2}</span>` : ''}
      </span>
      ${t.visual && !t.empty ? `<span class="tile-vis">${t.visual}</span>` : ''}
    </button>
    ${q ? `<button type="button" class="tile-quick press" data-action="${q.action}" ${q.attrs || ''} aria-label="${esc(q.label)}">${icon(q.icon)}</button>` : ''}
  </div>`;
}

export const tileGrid = (tiles) => `<div class="tile-grid">${tiles.join('')}</div>`;

/* ---------- Mini visuals ---------- */

/** Thin progress bar. */
export function miniBar(frac, color) {
  const f = clamp01(frac);
  return `<span class="mini-bar" data-frac="${f.toFixed(3)}"><i style="width:${(f * 100).toFixed(1)}%;background:${color}"></i></span>`;
}

// Last drawn fraction per mini ring, so a re-render animates from the previous value.
const lastFrac = new Map();

/** Small ring (arc geometry shared with the big rings). */
export function miniRing(id, frac, color, size = 56, stroke = 6, inner = '') {
  const r = (size - stroke) / 2, h = size / 2;
  const f = clamp01(frac);
  const from = lastFrac.has(id) ? lastFrac.get(id) : 0;
  lastFrac.set(id, f);
  return `<span class="mini-ring" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle cx="${h}" cy="${h}" r="${r}" fill="none" stroke="var(--track)" stroke-width="${stroke}"/>
      ${arcFill({ cx: h, r, stroke, frac: f, from, color })}
    </svg>${inner ? `<span class="mini-ring-in">${inner}</span>` : ''}</span>`;
}

/**
 * Seven mini bars (oldest → newest; RTL: newest on the left), optional dashed target line and a
 * lighter stacked top segment. Bars that reach the target use the success color, as in the big charts.
 */
export function miniBars(values, { target = 0, color, stack = null, stackColor = color } = {}) {
  const W = 100, H = 30, n = values.length, slot = W / n, bw = slot * 0.56;
  const max = Math.max(target || 0, ...values.map((v) => v || 0), 1) * 1.08;
  const yOf = (v) => H - (v / max) * H;
  let bars = '';
  values.forEach((v, i) => {
    const val = v || 0;
    const x = W - slot * (i + 1) + (slot - bw) / 2; // index 0 on the right
    const h = val > 0 ? Math.max(1.5, (val / max) * H) : 0;
    const met = target && val >= target;
    const fill = met ? 'var(--success)' : color;
    const top = stack ? Math.min(val, stack[i] || 0) : 0;
    const topH = top > 0 ? (h * top) / val : 0;
    bars += `<rect class="mb" data-v="${+val.toFixed(3)}" x="${x.toFixed(2)}" y="${(H - h).toFixed(2)}" width="${bw.toFixed(2)}" height="${h.toFixed(2)}" rx="1.5" fill="${fill}"/>`;
    if (topH > 0) bars += `<rect class="mb-top" data-v="${+top.toFixed(3)}" x="${x.toFixed(2)}" y="${(H - h).toFixed(2)}" width="${bw.toFixed(2)}" height="${topH.toFixed(2)}" rx="1.5" fill="${met ? 'var(--success-light)' : stackColor}"/>`;
  });
  const tl = target ? `<line class="mb-target" x1="0" x2="${W}" y1="${yOf(target).toFixed(2)}" y2="${yOf(target).toFixed(2)}"/>` : '';
  return `<svg class="mini-bars" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${bars}${tl}</svg>`;
}

/** Sparkline through the values (oldest → newest; RTL: newest on the left). */
export function sparkline(values, color) {
  const W = 100, H = 30, pad = 3;
  if (values.length < 2) return '';
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const pts = values.map((v, i) => [W - pad - (i * (W - pad * 2)) / (values.length - 1), pad + (1 - (v - lo) / span) * (H - pad * 2)]);
  const d = pts.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
  const last = pts.at(-1);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true" data-points="${values.join(',')}">
    <polyline points="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <circle cx="${last[0].toFixed(2)}" cy="${last[1].toFixed(2)}" r="2.6" fill="${color}"/></svg>`;
}

/**
 * Change vs the previous period: "▲ 12%" in success (good direction) or attention color, LTR-isolated.
 * dir: 1 = higher is better, -1 = lower is better, 0 = neutral. Returns '' when there is nothing to compare.
 */
export function deltaHTML(cur, prev, { dir = 1, mode = 'pct', unit = '', none = 'אין השוואה לשבוע הקודם' } = {}) {
  if (!(cur > 0) || !(prev > 0)) return `<span class="delta none">${none}</span>`;
  const diff = cur - prev;
  const val = mode === 'pct' ? Math.round((diff / prev) * 100) : Math.round(Math.abs(diff) * 10) / 10;
  const shown = mode === 'pct' ? Math.abs(val) : val;
  if (!shown) return '<span class="delta flat">ללא שינוי מהשבוע הקודם</span>';
  const up = diff > 0;
  const cls = dir === 0 ? 'neutral' : (up ? dir > 0 : dir < 0) ? 'good' : 'bad';
  const txt = mode === 'pct' ? `${shown}%` : shown.toLocaleString('he-IL', { maximumFractionDigits: 1 });
  return `<span class="delta ${cls}" data-delta="${up ? '' : '-'}${shown}"><bdi dir="ltr">${up ? '▲' : '▼'} ${txt}</bdi>${unit ? ` ${unit}` : ''}</span>`;
}

/* ---------- Detail pages ---------- */

export function detailHead(title, sub = '') {
  return `<header class="page-head with-back detail-head">
    <button type="button" class="icon-btn press" data-action="detail-back" aria-label="חזרה">${icon('chevR')}</button>
    <div class="grow"><h1>${esc(title)}</h1>${sub ? `<span class="muted small">${sub}</span>` : ''}</div>
  </header>`;
}

/**
 * Swipe-back on a detail page: a drag that starts near the right edge (RTL: the page came in from
 * the left) and moves left past a threshold goes back. The page follows the finger.
 */
export function bindSwipeBack(root, onBack) {
  let sx = 0, sy = 0, on = false, moved = false;
  const EDGE = 32, GO = 80;
  const reset = () => { root.style.transform = ''; root.style.transition = ''; on = false; moved = false; };
  root.ontouchstart = (e) => {
    const t = e.touches[0];
    if (e.touches.length !== 1 || t.clientX < innerWidth - EDGE) return;
    sx = t.clientX; sy = t.clientY; on = true; moved = false;
  };
  root.ontouchmove = (e) => {
    if (!on) return;
    const t = e.touches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (!moved && Math.abs(dy) > Math.abs(dx)) return reset();
    if (dx < 0) {
      moved = true;
      root.style.transition = 'none';
      root.style.transform = `translateX(${dx}px)`;
    }
  };
  root.ontouchend = (e) => {
    if (!on) return;
    const dx = (e.changedTouches[0]?.clientX ?? sx) - sx;
    const go = moved && dx < -GO;
    reset();
    if (go) onBack();
  };
  root.ontouchcancel = reset;
}

/** Remove the swipe-back handlers (grid and list views). */
export function unbindSwipeBack(root) {
  root.ontouchstart = root.ontouchmove = root.ontouchend = root.ontouchcancel = null;
  root.style.transform = '';
}

/** Header "עריכה" button: opens the "סידור המסך" screen for this tab. */
export const editButton = (which) =>
  `<button type="button" class="edit-btn press" data-action="layout-edit" data-layout="${which}">${icon('edit')}<span>עריכה</span></button>`;
