// Yearly activity heatmap (GitHub style, RTL: oldest week on the right, newest on the left).
import { getState, getDay } from './storage.js';
import { todayKey, addDays, parseKey, keyOf, longLabel } from './dates.js';
import { dayScore, walkHistory } from './progress.js';
import { isDayActive, foodTotals } from './stats.js';
import { num, esc, icon } from './ui.js';

const CELL = 14, GAP = 3, STEP = CELL + GAP, TOP = 18;
const DAY_INITIALS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const monthFmt = new Intl.DateTimeFormat('he-IL', { month: 'short' });

/** Color for a score; matches the 5 legend steps. */
export function scoreColor(score) {
  if (!(score > 0)) return '#1C2026';
  if (score <= 0.25) return 'rgba(255,106,0,0.25)';
  if (score <= 0.5) return 'rgba(255,106,0,0.5)';
  if (score <= 0.75) return 'rgba(255,106,0,0.75)';
  return 'rgba(255,106,0,1)';
}

export function heatmapCard() {
  const today = todayKey();
  const start = addDays(today, -364);
  const firstSunday = addDays(start, -parseKey(start).getDay());
  const cols = Math.floor((parseKey(today) - parseKey(firstSunday)) / 864e5 / 7) + 1;
  const W = cols * STEP - GAP;
  const H = TOP + 7 * STEP - GAP;
  const xOf = (c) => W - CELL - c * STEP; // column 0 (oldest) on the right

  let cells = '';
  let months = '';
  let lastMonth = -1;
  let active = 0;
  for (let c = 0; c < cols; c++) {
    const weekStart = addDays(firstSunday, c * 7);
    // Month label above the first column that contains the 1st..7th of a month
    const ws = parseKey(weekStart);
    const probe = new Date(ws);
    for (let i = 0; i < 7; i++) {
      if (probe.getDate() <= 7 && probe.getMonth() !== lastMonth && keyOf(probe) >= start && keyOf(probe) <= today) {
        lastMonth = probe.getMonth();
        months += `<text x="${xOf(c) + CELL}" y="11" class="hm-month" text-anchor="end">${esc(monthFmt.format(probe))}</text>`;
        break;
      }
      probe.setDate(probe.getDate() + 1);
    }
    for (let r = 0; r < 7; r++) {
      const k = addDays(weekStart, r);
      if (k < start || k > today) continue; // future days are not drawn
      const rest = getState().days[k]?.rest;
      const score = dayScore(k);
      if (isDayActive(k)) active++;
      const x = xOf(c), y = TOP + r * STEP;
      // Rest days: empty color with a protein-teal outline (stroke drawn inside the cell bounds).
      cells += rest
        ? `<rect class="hm-cell" data-day="${k}" data-score="${score.toFixed(3)}" x="${x + 0.75}" y="${y + 0.75}" width="${CELL - 1.5}" height="${CELL - 1.5}" rx="3" fill="#1C2026" stroke="#2DD4BF" stroke-width="1.5"/>`
        : `<rect class="hm-cell" data-day="${k}" data-score="${score.toFixed(3)}" x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="3" fill="${scoreColor(score)}"/>`;
    }
  }
  const labels = DAY_INITIALS.map((d, r) => `<span style="top:${TOP + r * STEP}px">${d}</span>`).join('');
  const legend = [0, 0.2, 0.45, 0.7, 1].map((s) => `<i style="background:${scoreColor(s)}"></i>`).join('');
  const { longestStreak } = walkHistory();

  return `<section class="card heatmap-card">
    <div class="card-head">${icon('today', 'head-ic')}<h2>שנה של פעילות</h2></div>
    <div class="hm-wrap">
      <div class="hm-days" style="height:${H}px">${labels}</div>
      <div class="hm-scroll" data-hm-scroll>
        <svg class="hm-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="מפת פעילות שנתית">${months}${cells}</svg>
      </div>
      <div class="hm-tip" data-hm-tip hidden></div>
    </div>
    <div class="hm-legend"><span>פחות</span>${legend}<span>יותר</span><i class="rest"></i><span>מנוחה</span></div>
    <div class="hm-stats">
      <div><span class="stat-num">${num(active)}</span><span class="muted small">ימים פעילים בשנה</span></div>
      <div><span class="stat-num">${num(longestStreak)}</span><span class="muted small">הרצף הארוך ביותר</span></div>
    </div>
  </section>`;
}

/** Wire up scrolling + tooltip after the card is in the DOM. */
export function bindHeatmap(root, onOpenDay) {
  const scroller = root.querySelector('[data-hm-scroll]');
  if (!scroller) return;
  // RTL scroller: newest days are at the far left end.
  scroller.scrollLeft = -scroller.scrollWidth;
  const tip = root.querySelector('[data-hm-tip]');
  const wrap = root.querySelector('.hm-wrap');

  scroller.addEventListener('click', (e) => {
    const cell = e.target.closest('.hm-cell');
    if (!cell) return;
    e.stopPropagation();
    const k = cell.dataset.day;
    if (tip.dataset.day === k && !tip.hidden) {
      tip.hidden = true;
      return;
    }
    root.querySelectorAll('.hm-cell.sel').forEach((c) => c.classList.remove('sel'));
    cell.classList.add('sel');
    const day = getDay(k);
    const score = Math.round(Number(cell.dataset.score) * 100);
    tip.dataset.day = k;
    tip.innerHTML = `<strong>${esc(longLabel(k))}</strong>
      <div class="hm-tip-score">${num(`${score}%`)}${day.rest ? ' · יום מנוחה' : ''}</div>
      <div class="muted small">צעדים ${num(day.steps || 0)} · עליות ${num(day.climbs.length)} · חלבון ${num(foodTotals(k).protein)} ג׳</div>
      <div class="hm-tip-link">פתיחת היום ${icon('chevL')}</div>`;
    tip.hidden = false;
    // Position under the tapped cell, clamped inside the card.
    const cr = cell.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const left = Math.max(0, Math.min(wr.width - tw, cr.left - wr.left + cr.width / 2 - tw / 2));
    tip.style.left = `${left}px`;
    tip.style.top = `${cr.bottom - wr.top + 6}px`;
  });
  tip.addEventListener('click', () => onOpenDay(tip.dataset.day));
}
