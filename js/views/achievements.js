// "הישגים" screen: level ring, XP stats and the badge grid.
import { ring } from '../charts.js';
import { icon, esc, num, fmt, openSheet } from '../ui.js';
import { longLabel } from '../dates.js';
import { levelInfo, weekXP, badgeStates } from '../progress.js';
import { medallion } from '../badgeArt.js';

export function render(root, ctx) {
  const L = levelInfo();
  const badges = sortedBadges();
  const earnedCount = badges.filter((b) => b.earned).length;

  root.innerHTML = `
    <header class="page-head with-back">
      <button type="button" class="icon-btn press" data-action="back" aria-label="חזרה">${icon('chevR')}</button>
      <div><h1>הישגים</h1></div>
    </header>
    <section class="card level-card">
      ${ring({
        id: 'level-big', size: 180, stroke: 16, frac: L.frac,
        inner: `<div class="muted small">רמה</div><div class="ring-big">${num(L.level)}</div>`,
      })}
      <div class="level-stats">
        <div><span class="stat-num">${num(L.xp)}</span><span class="muted small">נקודות בסך הכול</span></div>
        <div><span class="stat-num">${num(L.toNext)}</span><span class="muted small">חסרות לרמה ${num(L.level + 1)}</span></div>
        <div><span class="stat-num">${num(weekXP())}</span><span class="muted small">נקודות ב-7 ימים</span></div>
      </div>
    </section>
    <section class="card">
      <div class="card-head">${icon('trophy', 'head-ic')}<h2>תגים</h2><span class="muted small">${num(earnedCount)} מתוך ${num(badges.length)}</span></div>
      <div class="badge-grid">${badges.map(badgeTile).join('')}</div>
    </section>`;

  root.onclick = (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    if (b.dataset.action === 'back') return ctx.goTab(ctx.prevTab || 'trends');
    if (b.dataset.action === 'badge') showBadge(badges.find((x) => x.id === b.dataset.id));
  };
  root.onchange = null;
}

/** Earned first (newest first), then locked (closest to completion first). */
export function sortedBadges() {
  const all = badgeStates();
  const earned = all.filter((b) => b.earned).sort((a, b) => b.earned.localeCompare(a.earned));
  const locked = all.filter((b) => !b.earned).sort((a, b) => b.frac - a.frac);
  return [...earned, ...locked];
}

// One LTR isolate for the whole "value/target" so RTL layout doesn't swap the two numbers.
const progressText = (b) => num(`${fmt(Math.min(b.value, b.target))}/${fmt(b.target)}`);

function badgeTile(b) {
  return `<button type="button" class="badge-tile press ${b.earned ? 'earned' : ''}" data-action="badge" data-id="${b.id}">
    ${medallion(b, !!b.earned, 68)}
    <strong>${esc(b.name)}</strong>
    ${b.earned
      ? `<span class="muted xs">${esc(longLabel(b.earned))}</span>`
      : `<span class="badge-progress"><i style="width:${Math.round(b.frac * 100)}%"></i></span><span class="muted xs">${progressText(b)}</span>`}
  </button>`;
}

function showBadge(b) {
  if (!b) return;
  openSheet({
    title: b.name,
    body: `<div class="badge-detail">${medallion(b, !!b.earned, 120)}
      <p class="sheet-text">${esc(b.desc)}</p>
      <p class="${b.earned ? 'earned-on' : 'muted'}">${b.earned ? `הושג ב${esc(longLabel(b.earned))}` : `התקדמות: ${progressText(b)}${b.unit ? ` ${esc(b.unit)}` : ''}`}</p></div>`,
    actions: [{ label: 'סגירה', value: null, kind: 'ghost' }],
  });
}
