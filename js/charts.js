// Hand-made SVG rings and charts. No libraries.
import { shortDate, weekdayShort, weekStart, addDays, parseKey } from './dates.js';

const clamp01 = (v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

/**
 * Dash offset for a round-capped arc whose VISIBLE length (dash + both caps) equals frac × circumference.
 * Round caps add stroke/2 at each end, so the dash itself is shortened by one stroke width.
 * Full rings are drawn exactly full; 0 hides the arc.
 */
export function arcOffset(c, frac, stroke) {
  const f = clamp01(frac);
  if (f >= 1) return 0;
  const dash = Math.max(0, f * c - stroke);
  return c - dash;
}
const fmt = (n) => Number(n).toLocaleString('he-IL', { maximumFractionDigits: 1 });

// Last rendered fraction per ring id, so re-renders animate from the previous value
// instead of re-filling from zero on every tap.
const lastFrac = new Map();

/**
 * Progress ring. `inner` is HTML placed in the center.
 * The fill animates from the previous value (or 0 on first paint) via CSS keyframes.
 */
export function ring({ id, size = 120, stroke = 12, frac, color = 'var(--accent)', inner = '', cls = '' }) {
  const f = clamp01(frac);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const to = arcOffset(c, f, stroke);
  const from = id && lastFrac.has(id) ? arcOffset(c, lastFrac.get(id), stroke) : c;
  if (id) lastFrac.set(id, f);
  const h = size / 2;
  return `<div class="ring ${cls}" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle cx="${h}" cy="${h}" r="${r}" fill="none" stroke="var(--track)" stroke-width="${stroke}"/>
      <circle class="ring-fill" cx="${h}" cy="${h}" r="${r}" fill="none" stroke="${color}"
        stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c.toFixed(2)}"
        stroke-dashoffset="${to.toFixed(2)}" style="--from:${from.toFixed(2)};--to:${to.toFixed(2)}${f <= 0 ? ';opacity:0' : ''}"
        transform="rotate(-90 ${h} ${h})"/>
    </svg>
    <div class="ring-inner">${inner}</div>
  </div>`;
}

/**
 * Three concentric rings (outer → inner), each { id, frac, color }. `inner` is centered HTML.
 */
export function concentricRings({ rings, size = 196, stroke = 14, gap = 5, inner = '' }) {
  const h = size / 2;
  let circles = '';
  rings.forEach((rg, i) => {
    const r = h - stroke / 2 - i * (stroke + gap);
    const c = 2 * Math.PI * r;
    const f = clamp01(rg.frac);
    const to = arcOffset(c, f, stroke);
    const from = rg.id && lastFrac.has(rg.id) ? arcOffset(c, lastFrac.get(rg.id), stroke) : c;
    if (rg.id) lastFrac.set(rg.id, f);
    // Neutral tracks keep adjacent arcs (accent / steps) visually separate.
    circles += `<circle cx="${h}" cy="${h}" r="${r}" fill="none" stroke="var(--track)" stroke-width="${stroke}"/>
      <circle class="ring-fill" cx="${h}" cy="${h}" r="${r}" fill="none" stroke="${rg.color}" stroke-width="${stroke}"
        stroke-linecap="round" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${to.toFixed(2)}"
        data-frac="${f}" style="--from:${from.toFixed(2)};--to:${to.toFixed(2)};animation-delay:${i * 90}ms${f <= 0 ? ';opacity:0' : ''}"
        transform="rotate(-90 ${h} ${h})"/>`;
  });
  return `<div class="ring rings3" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 ${size} ${size}" aria-hidden="true">${circles}</svg>
    <div class="ring-inner">${inner}</div>
  </div>`;
}

/**
 * Vertical bar chart for 7 days. values: numbers (or null), keys: day keys.
 * Draws a dashed target line when a target is set.
 */
export function barChart({ keys, values, target, color = 'var(--accent)', format = fmtShort, unit = '' }) {
  const W = 360, H = 190, top = 26, bottom = 34, side = 8;
  const max = Math.max(target || 0, ...values.map((v) => v || 0), 1) * 1.08;
  const plotH = H - top - bottom;
  const slot = (W - side * 2) / values.length;
  const bw = Math.min(30, slot * 0.56);
  const y = (v) => top + plotH - (v / max) * plotH;
  let bars = '';
  values.forEach((v, i) => {
    const cx = side + slot * i + slot / 2;
    const val = v || 0;
    const met = target && val >= target;
    const bh = Math.max(val > 0 ? 4 : 0, (val / max) * plotH);
    // Rounded top only: a rounded rect plus a square patch over the bottom corners.
    const x = (cx - bw / 2).toFixed(1), yTop = (top + plotH - bh).toFixed(1), rr = Math.min(8, bw / 2, bh / 2);
    const fill = met ? 'var(--success)' : color;
    bars += `<g class="bar" style="--i:${i}" data-tip="${shortDate(keys[i])} · ${format(val)}${unit ? ` ${unit}` : ''}">
      <rect class="bar-hit" x="${(cx - slot / 2).toFixed(1)}" y="${top}" width="${slot.toFixed(1)}" height="${plotH}" fill="transparent"/>
      ${bh > 0 ? `<rect x="${x}" y="${yTop}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="${rr}" fill="${fill}"/>
      <rect x="${x}" y="${(top + plotH - Math.min(bh, rr)).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.min(bh, rr).toFixed(1)}" fill="${fill}"/>` : ''}
    </g>`;
    if (val > 0) {
      bars += `<text x="${cx}" y="${(top + plotH - bh - 7).toFixed(1)}" class="chart-val">${format(val)}</text>`;
    }
    bars += `<text x="${cx}" y="${H - 16}" class="chart-lbl">${weekdayShort(keys[i])}</text>
      <text x="${cx}" y="${H - 2}" class="chart-sub">${shortDate(keys[i])}</text>`;
  });
  const tl = target
    ? `<line x1="${side}" x2="${W - side}" y1="${y(target)}" y2="${y(target)}" class="target-line"/>`
    : '';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${tl}${bars}</svg>`;
}

function fmtShort(v) {
  if (v >= 10000) return `${(v / 1000).toFixed(v >= 100000 ? 0 : 1)}k`;
  return fmt(Math.round(v * 10) / 10);
}

/**
 * Weight line chart: every weigh-in as a dot + a line of weekly (Sun–Sat) averages.
 * weights: [{date, kg}] sorted ascending.
 */
export function weightChart(weights, targetKg) {
  if (!weights.length) return '';
  const W = 360, H = 210, padL = 40, padR = 14, top = 16, bottom = 28;
  const t = (k) => parseKey(k).getTime();
  const t0 = t(weights[0].date);
  const t1 = Math.max(t(weights[weights.length - 1].date), t0 + 6 * 864e5);
  const kgs = weights.map((w) => w.kg);
  let lo = Math.min(...kgs), hi = Math.max(...kgs);
  const pad = Math.max(0.5, (hi - lo) * 0.12);
  lo -= pad; hi += pad;
  const x = (ms) => padL + ((ms - t0) / (t1 - t0)) * (W - padL - padR);
  const y = (kg) => top + (1 - (kg - lo) / (hi - lo)) * (H - top - bottom);

  // Weekly averages, placed at the middle (Wednesday) of each week, clamped to the data range.
  const weeks = new Map();
  for (const w of weights) {
    const ws = weekStart(w.date);
    if (!weeks.has(ws)) weeks.set(ws, []);
    weeks.get(ws).push(w.kg);
  }
  const avgPts = [...weeks.entries()].map(([ws, arr]) => {
    const mid = Math.min(t1, Math.max(t0, t(addDays(ws, 3))));
    return [x(mid), y(arr.reduce((a, b) => a + b, 0) / arr.length)];
  });

  let grid = '';
  for (let i = 0; i <= 3; i++) {
    const kg = lo + ((hi - lo) * i) / 3;
    const yy = y(kg);
    grid += `<line x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}" class="grid"/>
      <text x="${padL - 6}" y="${yy + 4}" class="chart-axis" text-anchor="end">${fmt(Math.round(kg * 10) / 10)}</text>`;
  }
  const tgt = targetKg && targetKg >= lo && targetKg <= hi
    ? `<line x1="${padL}" x2="${W - padR}" y1="${y(targetKg)}" y2="${y(targetKg)}" class="target-line"/>`
    : '';
  const dots = weights
    .map((w) => `<g class="pt" data-tip="${shortDate(w.date)} · ${fmt(w.kg)} ק״ג"><circle cx="${x(t(w.date)).toFixed(1)}" cy="${y(w.kg).toFixed(1)}" r="12" fill="transparent"/>
      <circle cx="${x(t(w.date)).toFixed(1)}" cy="${y(w.kg).toFixed(1)}" r="3.5" class="dot"/></g>`)
    .join('');
  const curve = smoothPath(avgPts);
  const base = H - bottom;
  const line = avgPts.length > 1
    ? `<defs><linearGradient id="wgrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--accent)" stop-opacity="0.28"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/>
      </linearGradient></defs>
      <path d="${curve} L${avgPts.at(-1)[0].toFixed(1)},${base} L${avgPts[0][0].toFixed(1)},${base} Z" fill="url(#wgrad)" class="avg-area"/>
      <path d="${curve}" class="avg-line" pathLength="1"/>`
    : '';
  const avgDots = avgPts.map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4" class="avg-dot"/>`).join('');
  const lastKey = weights[weights.length - 1].date;
  const xl = `<text x="${padL}" y="${H - 6}" class="chart-axis" text-anchor="start">${shortDate(weights[0].date)}</text>
    <text x="${W - padR}" y="${H - 6}" class="chart-axis" text-anchor="end">${shortDate(lastKey)}</text>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${grid}${tgt}${line}${avgDots}${dots}${xl}</svg>`;
}

/** Smooth curve through points (Catmull-Rom → cubic Bézier). */
function smoothPath(pts) {
  if (!pts.length) return '';
  const p = pts.map(([a, b]) => [Number(a.toFixed(1)), Number(b.toFixed(1))]);
  let d = `M${p[0][0]},${p[0][1]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/** Tap a bar / point (any [data-tip] inside a .chart) to show a small tooltip. */
export function bindChartTips(root) {
  root.querySelectorAll('.chart').forEach((svg) => {
    const host = svg.parentElement;
    host.classList.add('chart-host');
    svg.addEventListener('click', (e) => {
      const g = e.target.closest('[data-tip]');
      host.querySelector('.chart-tip')?.remove();
      svg.querySelectorAll('.sel').forEach((n) => n.classList.remove('sel'));
      if (!g) return;
      g.classList.add('sel');
      const tip = document.createElement('div');
      tip.className = 'chart-tip';
      tip.innerHTML = `<bdi>${g.dataset.tip}</bdi>`;
      host.appendChild(tip);
      const gr = g.getBoundingClientRect(), hr = host.getBoundingClientRect();
      const left = Math.max(0, Math.min(hr.width - tip.offsetWidth, gr.left - hr.left + gr.width / 2 - tip.offsetWidth / 2));
      tip.style.left = `${left}px`;
      tip.style.top = `${Math.max(0, gr.top - hr.top - tip.offsetHeight - 6)}px`;
    });
  });
}
