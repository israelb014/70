// "היום" tab: completion ring + streak, steps, stairs, cycling, exercises and rest day.
import { getState, getDay, updateDay, save, exerciseById } from '../storage.js';
import { ring, concentricRings } from '../charts.js';
import {
  icon, esc, fmt, num, parseNum, toast, vibrate, openSheet, confirmDialog, invalid,
  checkMark, dateNav, handleDateNav, HAPTIC, confetti, emptyState, bindSwipe,
} from '../ui.js';
import {
  dayCompletion, currentStreak, exercisesForDay, exerciseProgress, computeRecords, recordIdsOn,
  longestRideKm, floorsOf,
} from '../stats.js';
import { runTimer } from '../timer.js';
import {
  levelInfo, sleepMinutes, fmtDuration, lastSleep, durText, napMinutes, napsMinutes, totalSleepMinutes, hasSleep, sortedNaps, lastNap, napError,
} from '../progress.js';
import { waterMl } from '../stats.js';
import { nowTime } from '../dates.js';
import { dailySummary, copyText, exportBackup, canShareBackup, shareBackup, backupReminder, snoozeBackupReminder } from '../export.js';
import { plural, int, trim } from '../hebrew.js';
import { openTimePicker, timeField } from '../timepicker.js';
import { dayInsights } from '../insights.js';
import { foodTotals, completionPct } from '../stats.js';
import { todayKey } from '../dates.js';

// Unicode isolate for numbers inside plain-text (non-HTML) RTL strings.
const iso = (s) => `⁦${s}⁩`;

export function render(root, ctx) {
  const k = ctx.date;
  const st = getState().settings;
  const day = getDay(k);
  const rec = recordIdsOn(k, computeRecords().events);
  const badge = (id) => (rec.has(id) ? `<span class="badge">${icon('trophy')}<span>שיא חדש</span></span>` : '');

  celebrateNewRecords(ctx, k, rec);

  root.innerHTML = `
    ${backupBanner()}
    ${dateNav(k, '')}
    ${heroCard(k, day, st)}
    ${insightCard(k)}
    ${stepsCard(day, st, badge)}
    ${sleepCard(day, st)}
    ${waterCard(day, st)}
    ${stairsCard(day, st, badge)}
    ${ridesCard(day, st, badge)}
    ${exerciseCards(k, day, ctx, rec)}
    <button type="button" class="btn rest-btn block press ${day.rest ? 'active' : ''}" data-action="rest" aria-pressed="${day.rest}">
      ${icon('moon')}<span>${day.rest ? 'יום מנוחה · לביטול' : 'יום מנוחה'}</span>
    </button>
    <button type="button" class="btn secondary block press" data-action="copy-daily">${icon('copy')}<span>העתק סיכום יומי</span></button>`;
  // A row that just completed plays its check animation, then collapses after 600 ms.
  if (ctx.openEx && ctx.justCompleted.has(ctx.openEx)) {
    const id = ctx.openEx;
    setTimeout(() => { if (ctx.openEx === id) toggleRow(root, ctx, id, true); }, 600);
  }
  ctx.justCompleted.clear();

  bindSwipe(root, '[data-nap-i]', (row) => removeNap(ctx, k, Number(row.dataset.napI)));
  root.onkeydown = (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-nap-i]')) { e.preventDefault(); e.target.click(); }
  };
  root.onclick = (e) => onClick(e, ctx);
  root.onchange = (e) => onChange(e, ctx);
  root.oninput = (e) => {
    if (e.target.dataset.sleep) previewSleep(root);
  };
  bindInsightDots(root);
}

/** Confetti + haptics + toast when an action sets a new personal record on the shown day. */
function celebrateNewRecords(ctx, k, rec) {
  ctx.recSeen ||= {};
  const prev = ctx.recSeen[k];
  if (prev && [...rec].some((id) => !prev.has(id))) {
    confetti();
    vibrate(HAPTIC.record);
    toast('שיא אישי חדש', { iconHTML: icon('trophy'), big: true });
  }
  ctx.recSeen[k] = rec;
}

/* ---------- Insights carousel ---------- */

const KIND_LABEL = { positive: 'חיובי', attention: 'לתשומת לב', neutral: 'מידע' };

function insightCard(k) {
  const list = dayInsights(k).slice(0, 4);
  if (!list.length) {
    return `<section class="card insight-card is-empty">${emptyState('insights', 'עוד כמה ימים של נתונים ונתחיל להציג תובנות')}</section>`;
  }
  return `<section class="card insight-card" aria-label="תובנות">
    <div class="insight-track" data-insights>
      ${list.map((x) => `<article class="insight kind-${x.kind}">
          <span class="insight-ic">${icon(`cat-${x.cat}`)}</span>
          <div class="grow"><span class="insight-kind">${KIND_LABEL[x.kind]}</span><p>${esc(x.text)}</p></div>
        </article>`).join('')}
    </div>
    ${list.length > 1 ? `<div class="insight-dots">${list.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}
  </section>`;
}

function bindInsightDots(root) {
  const track = root.querySelector('[data-insights]');
  const dots = root.querySelectorAll('.insight-dots i');
  if (!track || !dots.length) return;
  track.addEventListener('scroll', () => {
    const w = track.clientWidth || 1;
    const i = Math.round(Math.abs(track.scrollLeft) / w);
    dots.forEach((d, j) => d.classList.toggle('on', j === i));
  }, { passive: true });
}

/* ---------- Cards ---------- */

/** Small level ring in the header; opens the "הישגים" screen. */
function levelChip() {
  const L = levelInfo();
  return `<button type="button" class="level-chip press" data-action="achievements" aria-label="רמה ${L.level} · הישגים">
    ${ring({ id: 'level-chip', size: 36, stroke: 4, frac: L.frac, inner: `<span class="level-chip-num">${num(L.level)}</span>` })}
    <span>רמה ${num(L.level)}</span>
  </button>`;
}

/** durText with the number isolated LTR ("1:20" must not flip inside RTL text). */
const durHTML = (m) => esc(durText(m)).replace(/[\d:]+/, (d) => `<bdi class="num">${d}</bdi>`);

function sleepCard(day, st) {
  const target = st.sleepTarget || 8;
  const s = day.sleep;
  const pre = s || lastSleep() || { bed: '23:00', wake: '07:00' };
  const min = s ? sleepMinutes(s) : 0;
  const naps = sortedNaps(day);
  const total = totalSleepMinutes(day); // the ring shows night + naps
  return `<section class="card role-sleep">
    <div class="card-head">${icon('bed', 'head-ic')}<h2>שינה</h2></div>
    <div class="row">
      ${ring({
        id: 'sleep', size: 108, stroke: 11, frac: total / (target * 60),
        color: total >= target * 60 ? 'var(--success)' : 'var(--sleep)',
        inner: `<div class="ring-mid">${num(fmtDuration(total))}</div><div class="muted xs">שעות</div>`,
      })}
      <div class="grow">
        <div class="stat-num">${s ? num(fmtDuration(min)) : '–'}<small> שעות</small></div>
        <div class="muted small" data-sleep-preview>${s ? '' : 'עוד לא נרשם · '}משך ${num(fmtDuration(sleepMinutes(pre)))} · יעד ${num(target)} שעות</div>
        ${hasSleep(day) ? `<div class="sleep-tot">${naps.length ? `<span data-naps-total>תנומות: ${durHTML(napsMinutes(day))}</span>` : ''}
          <b data-sleep-total>סה״כ שינה: ${durHTML(total)}</b></div>` : ''}
      </div>
    </div>
    <div class="sub-head"><span>שינת לילה</span>
      ${s ? '<button type="button" class="link-btn press" data-action="sleep-del">ניקוי</button>' : ''}</div>
    <div class="field-grid">
      ${timeField({ value: pre.bed, action: 'pick-sleep', attrs: `data-sleep="bed" data-value="${pre.bed}"`, label: 'הלכתי לישון' })}
      ${timeField({ value: pre.wake, action: 'pick-sleep', attrs: `data-sleep="wake" data-value="${pre.wake}"`, label: 'קמתי' })}
    </div>
    <button type="button" class="btn secondary block press" data-action="sleep-save">${icon('check')}<span>${s ? 'עדכון שינה' : 'שמירת שינה'}</span></button>
    ${naps.length ? `<ul class="nap-list">${naps.map(({ n, i }) => `<li class="swipe-item"><span class="swipe-bg" aria-hidden="true">${icon('trash')}</span>
      <div class="list-row swipe nap-row press" role="button" tabindex="0" data-action="nap-edit" data-nap-i="${i}" aria-label="עריכת תנומה ${n.start}–${n.end}">
        ${icon('moon')}<span class="grow">תנומה · <bdi class="num">${n.start}–${n.end}</bdi> · ${durHTML(napMinutes(n))}</span>
      </div></li>`).join('')}</ul>` : ''}
    <button type="button" class="btn ghost block press" data-action="nap-new">${icon('plus')}<span>תנומה</span></button>
  </section>`;
}

/**
 * Nap sheet (add / edit): "נרדמתי" / "קמתי" on the 24-hour picker (5-minute steps).
 * Validation runs live; "שמירה" stays disabled while the message is shown.
 * Resolves { start, end }, 'delete', or null.
 */
function napSheet(k, index = null) {
  const nap = index !== null ? getDay(k).naps[index] : null;
  const pre = nap || lastNap() || { start: '14:00', end: '15:00' };
  const actions = [];
  if (nap) actions.push({ label: 'מחיקה', kind: 'danger', value: 'delete' });
  actions.push({
    label: 'שמירה', kind: 'primary',
    onClick: (w) => {
      const v = read(w);
      return napError(k, v, index ?? -1) ? false : v;
    },
  });
  const read = (w) => ({ start: w.querySelector('[data-nap=start]').dataset.value, end: w.querySelector('[data-nap=end]').dataset.value });
  const check = (w) => {
    const v = read(w);
    const err = napError(k, v, index ?? -1);
    w.querySelector('[data-nap-err]').textContent = err || `משך ${durText(Math.max(0, napMinutes(v)))}`;
    w.querySelector('[data-nap-err]').classList.toggle('bad', !!err);
    w.querySelector('.btn.primary').disabled = !!err;
  };
  return openSheet({
    title: nap ? 'עריכת תנומה' : 'תנומה',
    body: `<div class="field-grid">
        ${timeField({ value: pre.start, action: 'nap-pick', attrs: `data-nap="start" data-value="${pre.start}"`, label: 'נרדמתי' })}
        ${timeField({ value: pre.end, action: 'nap-pick', attrs: `data-nap="end" data-value="${pre.end}"`, label: 'קמתי' })}
      </div>
      <p class="nap-msg" data-nap-err role="status" aria-live="polite"></p>`,
    actions,
    onOpen: (w) => {
      check(w);
      w.querySelectorAll('[data-nap]').forEach((b) => b.addEventListener('click', async () => {
        const v = await openTimePicker({ value: b.dataset.value, step: 5, title: b.dataset.nap === 'start' ? 'נרדמתי' : 'קמתי' });
        if (!v) return;
        b.dataset.value = v;
        b.querySelector('.time-field-val').textContent = v;
        b.setAttribute('aria-label', `${b.querySelector('.time-field-lbl').textContent}: ${v}`);
        check(w);
      }));
    },
  });
}

/** Remove a nap with an undo toast that puts it back. */
function removeNap(ctx, k, i) {
  const removed = getDay(k).naps[i];
  if (!removed) return;
  updateDay(k, (d) => d.naps.splice(i, 1));
  toast('התנומה נמחקה', {
    iconHTML: icon('trash'),
    action: { label: 'ביטול', onClick: () => { updateDay(k, (d) => { d.naps.push(removed); d.naps.sort((a, b) => a.start.localeCompare(b.start)); }); ctx.rerender(); } },
  });
  ctx.rerender();
}

// Quick-add amounts (ml)
const GLASS = 250, BOTTLE = 500;
const liters = (ml) => (ml / 1000).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function waterCard(day, st) {
  const target = st.waterTarget || 2500;
  const ml = waterMl(day);
  const last = day.water.at(-1);
  return `<section class="card water-card role-water">
    <div class="card-head">${icon('drop', 'head-ic')}<h2>מים</h2>
      <button type="button" class="icon-btn sm press" data-action="water-undo" aria-label="ביטול הוספה אחרונה" ${last ? '' : 'disabled'}>${icon('undo')}</button></div>
    <div class="row">
      ${ring({
        id: 'water', size: 132, stroke: 13, frac: ml / target,
        color: ml >= target ? 'var(--success)' : 'var(--water)',
        inner: `<div class="ring-big xs">${num(liters(ml))}</div><div class="muted small">ל׳</div>`,
      })}
      <div class="grow">
        <div class="stat-num">${num(ml)}<small> מ״ל</small></div>
        <div class="muted">מתוך ${num(target / 1000, 2)} ל׳ · ${esc(plural(Math.round((ml / GLASS) * 10) / 10, 'כוס אחת', 'כוסות'))}</div>
        ${last ? `<div class="muted small">אחרון: ${num(last.ml)} מ״ל${last.time ? ` בשעה ${num(last.time)}` : ''}</div>` : ''}
      </div>
    </div>
    <div class="water-btns">
      <button type="button" class="water-add press" data-action="water-add" data-ml="${GLASS}">${icon('glass')}<strong>+ כוס</strong><span>${num(GLASS)} מ״ל</span></button>
      <button type="button" class="water-add press" data-action="water-add" data-ml="${BOTTLE}">${icon('bottle')}<strong>+ בקבוק</strong><span>${num(BOTTLE)} מ״ל</span></button>
      <button type="button" class="water-add press" data-action="water-other">${icon('plus')}<strong>אחר</strong><span>מ״ל</span></button>
    </div>
  </section>`;
}

function addWater(ctx, ml) {
  const st = getState().settings;
  const before = waterMl(getDay(ctx.date));
  updateDay(ctx.date, (d) => d.water.push({ ml, time: nowTime() }));
  const after = waterMl(getDay(ctx.date));
  const target = st.waterTarget || 2500;
  if (before < target && after >= target) {
    vibrate(HAPTIC.target);
    toast('יעד המים הושג');
  } else vibrate(HAPTIC.item);
  ctx.rerender();
}

function readSleep(root) {
  const bed = root.querySelector('[data-sleep=bed]')?.dataset.value;
  const wake = root.querySelector('[data-sleep=wake]')?.dataset.value;
  return bed && wake ? { bed, wake } : null;
}

function previewSleep(root) {
  const s = readSleep(root);
  const el = root.querySelector('[data-sleep-preview]');
  if (el && s) el.innerHTML = `משך ${num(fmtDuration(sleepMinutes(s)))} · יעד ${num(getState().settings.sleepTarget || 8)} שעות`;
}

function heroCard(k, day, st) {
  const c = dayCompletion(k);
  const pct = completionPct(k); // the same value drives the ring and the number
  const streak = currentStreak();
  const steps = day.steps || 0;
  const protein = Math.round(foodTotals(k).protein);
  const L = levelInfo();
  return `<section class="card hero">
    <div class="hero-main">
      ${concentricRings({
        rings: [
          { id: 'hero-ex', frac: pct / 100, color: 'var(--accent)' },
          { id: 'hero-steps', frac: st.stepsTarget ? steps / st.stepsTarget : 0, color: 'var(--steps)' },
          { id: 'hero-protein', frac: st.proteinTarget ? protein / st.proteinTarget : 0, color: 'var(--protein)' },
        ],
        inner: `<div class="ring-big"><bdi class="num" data-count="${pct}">${pct}</bdi><small>%</small></div>
          <div class="caption">${c.total ? 'אימון' : 'אין תרגילים'}</div>`,
      })}
      <div class="hero-side">
        <button type="button" class="level-chip press" data-action="achievements" aria-label="רמה ${L.level} · הישגים">
          ${ring({ id: 'level-chip', size: 34, stroke: 4, frac: L.frac, inner: `<span class="level-chip-num">${num(L.level)}</span>` })}
          <span class="level-chip-txt"><small>רמה</small><b>${num(`${fmt(L.xp - L.base)}/${fmt(L.next - L.base)}`)} נק׳</b></span>
        </button>
        <div class="streak ${streak ? 'on' : ''}">${icon('flame')}<span class="streak-num">${num(streak)}</span></div>
        <div class="caption">${streak === 1 ? 'יום רצף' : 'ימי רצף'}</div>
      </div>
    </div>
    <ul class="ring-legend">
      <li style="--c:var(--accent)"><i></i><span>תרגילים</span><b>${num(`${c.done}/${c.total}`)}</b></li>
      <li style="--c:var(--steps)"><i></i><span>צעדים</span><b>${num(steps)}</b></li>
      <li style="--c:var(--protein)"><i></i><span>חלבון</span><b>${num(protein)} ג׳</b></li>
    </ul>
    <p class="hero-status">${esc(statusLine(day, st, c, steps, protein))}</p>
  </section>`;
}

/**
 * One line: the first remaining item, in a fixed order — exercises (skipped on rest days),
 * steps, climbs, protein, water. Everything done → "כל היעדים של היום הושגו".
 */
export function statusLine(day, st, c, steps, protein) {
  const exLeft = c.total - c.done;
  if (!day.rest && exLeft > 0) return `עוד ${plural(exLeft, 'תרגיל אחד', 'תרגילים')}`;
  if (st.stepsTarget && steps < st.stepsTarget) return `עוד ${plural(st.stepsTarget - steps, 'צעד אחד', 'צעדים', int)}`;
  const climbs = day.climbs.length;
  if (st.climbsTarget && climbs < st.climbsTarget) return `עוד ${plural(st.climbsTarget - climbs, 'עלייה אחת', 'עליות')}`;
  if (st.proteinTarget && protein < st.proteinTarget) return `עוד ${int(st.proteinTarget - protein)} ג׳ חלבון`;
  const ml = waterMl(day);
  if (st.waterTarget && ml < st.waterTarget) return `עוד ${trim((st.waterTarget - ml) / 1000, 2)} ל׳ מים`;
  return 'כל היעדים של היום הושגו';
}

/** Backup reminder (top of "היום"): 7+ days since the last backup, or never with 3+ data days. */
function backupBanner() {
  const { show, days } = backupReminder();
  if (!show) return '';
  const title = days === null ? 'עוד לא גיבית את הנתונים' : `${days === 1 ? 'עבר' : 'עברו'} ${plural(days, 'יום אחד', 'ימים')} מהגיבוי האחרון`;
  return `<section class="card backup-banner" aria-label="תזכורת גיבוי">
    <div class="bb-head">${icon('backup', 'head-ic')}
      <div class="bb-text"><strong>${esc(title)}</strong>
        <div class="bb-sub"><span>שמורים רק במכשיר הזה</span>
          <button type="button" class="bb-later press" data-action="backup-later">אחר כך</button></div>
      </div>
    </div>
    <div class="bb-actions">
      <button type="button" class="btn primary press" data-action="backup-now">${icon('download')}<span>גיבוי עכשיו</span></button>
      ${canShareBackup() ? `<button type="button" class="btn secondary press" data-action="backup-share">${icon('share')}<span>שיתוף הקובץ</span></button>` : ''}
    </div>
  </section>`;
}

const STEP_ADDS = [1000, 5000];

function stepsCard(day, st, badge) {
  const target = st.stepsTarget || 0;
  const steps = day.steps || 0;
  return `<section class="card role-steps">
    <div class="card-head">${icon('steps', 'head-ic')}<h2>צעדים</h2>${badge('steps')}</div>
    <div class="row">
      ${ring({
        id: 'steps', size: 108, stroke: 11, frac: target ? steps / target : 0,
        color: target && steps >= target ? 'var(--success)' : 'var(--steps)',
        inner: `<div class="ring-mid">${num(steps)}</div>`,
      })}
      <div class="grow">
        <label class="field"><span>צעדים ביום הזה</span>
          <input type="number" inputmode="numeric" min="0" data-change="steps" value="${day.steps ?? ''}" placeholder="0" enterkeyhint="done"></label>
        <div class="steps-add">${STEP_ADDS.map((n) =>
          `<button type="button" class="chip-btn press" data-action="steps-add" data-n="${n}" aria-label="הוספת ${int(n)} צעדים">\u200E+${int(n)}</button>`).join('')}</div>
        <div class="muted small">יעד ${num(target)}</div>
      </div>
    </div>
  </section>`;
}

function stairsCard(day, st, badge) {
  const count = day.climbs.length;
  const target = st.climbsTarget || 0;
  return `<section class="card role-accent">
    <div class="card-head">${icon('stairs', 'head-ic')}<h2>מדרגות</h2>${badge('climbs')}</div>
    <div class="row">
      ${ring({
        id: 'climbs', size: 108, stroke: 11, frac: target ? count / target : 0,
        color: target && count >= target ? 'var(--success)' : 'var(--accent)',
        inner: `<div class="ring-mid"><bdi class="num">${fmt(count)}<small>/${fmt(target)}</small></bdi></div>`,
      })}
      <div class="grow">
        <div class="stat-num">${num(floorsOf(day))}</div>
        <div class="muted">קומות · ${num(count)} עליות</div>
      </div>
      <button type="button" class="icon-btn press" data-action="climb-undo" aria-label="ביטול עלייה אחרונה" ${count ? '' : 'disabled'}>${icon('undo')}</button>
    </div>
    <div class="btn-pair">
      <button type="button" class="big-add press" data-action="climb" data-type="regular">
        ${icon('plus')}<strong>עלייה רגילה</strong><span>${num(st.floorsRegular || 0)} קומות</span></button>
      <button type="button" class="big-add press" data-action="climb" data-type="roof">
        ${icon('roof')}<strong>עלייה לגג</strong><span>${num(st.floorsRoof || 0)} קומות</span></button>
    </div>
  </section>`;
}

function ridesCard(day, st, badge) {
  const goal = st.rideGoalKm || 0;
  const longest = longestRideKm();
  const totalKm = day.rides.reduce((s, r) => s + (Number(r.km) || 0), 0);
  const totalMin = day.rides.reduce((s, r) => s + (Number(r.minutes) || 0), 0);
  const list = day.rides
    .map(
      (r, i) => `<li class="list-row ride-row">
        <div class="grow"><strong>${num(r.km)} ק״מ</strong>${r.minutes ? `<span class="muted"> · ${num(r.minutes)} דק׳</span>` : ''}${
          r.note ? `<span class="muted"> · ${esc(r.note)}</span>` : ''}</div>
        <button type="button" class="icon-btn sm press danger-ic" data-action="ride-del" data-i="${i}" aria-label="מחיקת רכיבה">${icon('trash')}</button>
      </li>`
    )
    .join('');
  return `<section class="card role-accent">
    <div class="card-head">${icon('bike', 'head-ic')}<h2>רכיבה</h2>${badge('ride')}</div>
    <div class="row">
      ${ring({
        id: 'ride', size: 96, stroke: 10, frac: goal ? longest / goal : 0,
        color: goal && longest >= goal ? 'var(--success)' : 'var(--accent)',
        inner: `<div class="ring-mid">${num(longest)}</div><div class="muted xs">שיא ק״מ</div>`,
      })}
      <div class="grow">
        <div class="stat-num">${num(totalKm)}<small> ק״מ היום</small></div>
        <div class="muted small">${totalMin ? `${num(totalMin)} דק׳ · ` : ''}יעד לרכיבה אחת ${num(goal)} ק״מ</div>
      </div>
    </div>
    ${list ? `<ul class="list">${list}</ul>` : '<p class="muted ride-empty">עוד לא רכבת היום</p>'}
    <button type="button" class="btn secondary block press" data-action="ride-new">${icon('plus')}<span>רכיבה</span></button>
  </section>`;
}

/** Bottom sheet for a new ride. Resolves { km, minutes, note } or null. */
function rideSheet() {
  return openSheet({
    title: 'רכיבה חדשה',
    body: `<div class="field-grid">
        <label class="field"><span>ק״מ</span><input name="km" type="number" inputmode="decimal" min="0" step="0.1" placeholder="0"></label>
        <label class="field"><span>דקות</span><input name="minutes" type="number" inputmode="numeric" min="0" placeholder="0"></label>
      </div>
      <label class="field"><span>הערה (רשות)</span><input name="note" type="text" maxlength="60" autocomplete="off"></label>`,
    onOpen: (r) => setTimeout(() => r.querySelector('[name=km]').focus(), 300),
    actions: [
      { label: 'ביטול', value: null, kind: 'ghost' },
      {
        label: 'הוספה',
        kind: 'primary',
        onClick: (r) => {
          const km = parseNum(r.querySelector('[name=km]').value);
          if (!(km > 0)) return invalid(r.querySelector('[name=km]'), 'יש להזין מרחק בק״מ');
          const minutes = parseNum(r.querySelector('[name=minutes]').value);
          return { km, minutes: minutes > 0 ? minutes : null, note: r.querySelector('[name=note]').value.trim() };
        },
      },
    ],
  });
}

function exerciseCards(k, day, ctx, rec) {
  const list = exercisesForDay(k);
  if (!list.length) {
    return `<section class="card empty-card">${emptyState('dumbbell', 'עדיין לא הוגדרו תרגילים. אפשר להוסיף אותם בהגדרות.',
      '<button type="button" class="btn secondary press" data-action="go-settings">הוספת תרגילים</button>')}</section>`;
  }
  const done = list.filter((ex) => exerciseProgress(ex, day.exercises[ex.id]) >= 1).length;
  return `<section class="card ex-list-card role-accent">
    <div class="card-head">${icon('dumbbell', 'head-ic')}<h2>תרגילים</h2>
      <span class="muted small">${num(`${done}/${list.length}`)} הושלמו</span></div>
    <div class="ex-rows">${list.map((ex) => exerciseRow(ex, day.exercises[ex.id], ctx, rec)).join('')}</div>
  </section>`;
}

/** Muted one-line target: "3×20 · 6 ק״ג", "60 שניות", "סט אחד עד כשל". */
function compactTarget(ex) {
  if (ex.type === 'setsReps') return `${num(`${ex.sets}×${ex.reps}`)}${ex.weight ? ` · ${num(ex.weight)} ק״ג` : ''}`;
  if (ex.type === 'timed') return `${num(ex.seconds)} שניות${ex.weight ? ` · ${num(ex.weight)} ק״ג` : ''}`;
  return `סט אחד עד כשל${ex.reps ? ` · יעד ${num(ex.reps)}` : ''}`;
}

/** Trailing status: "2/3 סטים", "45/60 שנ׳", "12/15 חזרות", "הושלם". */
export function exerciseStatus(ex, entry) {
  if (exerciseProgress(ex, entry) >= 1) return 'הושלם';
  if (ex.type === 'setsReps') return `${num(`${(entry?.sets || []).filter((x) => x.done).length}/${ex.sets}`)} סטים`;
  if (ex.type === 'timed') return `${num(`${entry?.seconds || 0}/${ex.seconds}`)} שנ׳`;
  return entry?.reps ? `${num(`${entry.reps}/${ex.reps}`)} חזרות` : 'טרם בוצע';
}

function exerciseRow(ex, entry, ctx, rec) {
  const p = exerciseProgress(ex, entry);
  const complete = p >= 1;
  const open = ctx.openEx === ex.id;
  const recBadge = ['reps', 'w', 'sec'].some((t) => rec.has(`${t}:${ex.id}`))
    ? `<span class="badge">${icon('trophy')}<span>שיא חדש</span></span>` : '';
  let body = '';
  if (ex.type === 'setsReps') body = setsBody(ex, entry, ctx.hintEx === ex.id);
  else if (ex.type === 'timed') body = timedBody(ex, entry);
  else body = maxRepsBody(ex, entry);
  return `<section class="ex-card ${complete ? 'complete' : ''} ${open ? 'open' : ''}" data-exrow="${ex.id}">
    <button type="button" class="ex-head press" data-action="ex-toggle" data-ex="${ex.id}" aria-expanded="${open}" aria-controls="exb-${ex.id}">
      ${ring({
        id: `ex-${ex.id}`, size: 44, stroke: 5, frac: p, cls: 'ring-sm',
        color: complete ? 'var(--success)' : 'var(--accent)',
        inner: complete ? checkMark(ctx.justCompleted.has(ex.id)) : '',
      })}
      <span class="grow ex-meta"><h2 class="ex-name">${esc(ex.name)}${ex.archived ? ' <span class="muted xs">(נמחק)</span>' : ''}</h2>
        <span class="muted small">${compactTarget(ex)}</span></span>
      <span class="ex-status">${exerciseStatus(ex, entry)}</span>
      ${icon('down', 'ex-chev')}
    </button>
    <div class="ex-body-wrap" id="exb-${ex.id}"><div class="ex-body">
      ${recBadge ? `<div class="ex-tools">${recBadge}</div>` : ''}
      ${body}
    </div></div>
  </section>`;
}

/** Accordion: open one row (closing others) or close it — in place, so the height animates. */
function toggleRow(root, ctx, id, forceClose = false) {
  const rows = root.querySelectorAll('.ex-card');
  const target = root.querySelector(`.ex-card[data-exrow="${id}"]`);
  const opening = !forceClose && target && !target.classList.contains('open');
  rows.forEach((r) => {
    const on = opening && r === target;
    r.classList.toggle('open', on);
    r.querySelector('.ex-head')?.setAttribute('aria-expanded', String(on));
  });
  ctx.openEx = opening ? id : null;
  // The "tap marks a set" hint belongs to the first sets exercise that gets opened, once.
  if (opening && !ctx.hintEx && target.querySelector('.set-hint')) {
    ctx.hintEx = id;
    target.querySelector('.set-hint').hidden = false;
  }
}

const prefillReps = (ex, i) => ex.last?.reps?.[i] ?? ex.reps;
const prefillWeight = (ex) => ex.last?.weight ?? ex.weight ?? null;

function setsBody(ex, entry, showHint) {
  const sets = entry?.sets || [];
  const n = Math.max(ex.sets || 1, sets.length);
  let chips = '';
  for (let i = 0; i < n; i++) {
    const s = sets[i];
    const done = s?.done;
    chips += `<button type="button" class="chip press ${done ? 'done' : ''}" data-action="set" data-long="set" data-ex="${ex.id}" data-i="${i}"
      aria-label="סט ${i + 1}${done ? ' בוצע' : ''}">
      <span class="chip-reps">${num(done ? s.reps : prefillReps(ex, i))}</span>
      <span class="chip-lbl">${done && s.weight ? `${num(s.weight)} ק״ג` : `סט ${num(i + 1)}`}</span>
    </button>`;
  }
  return `<div class="chips">${chips}</div>
    <div class="ex-foot"><p class="hint set-hint grow" ${showHint ? '' : 'hidden'}>הקשה מסמנת סט · לחיצה ארוכה לעריכת חזרות</p>
      <button type="button" class="icon-btn sm press" data-action="sets-edit" data-ex="${ex.id}" aria-label="עריכת ביצוע">${icon('edit')}</button></div>`;
}

function timedBody(ex, entry) {
  const sec = entry?.seconds || 0;
  return `<div class="row">
      <div class="grow"><div class="stat-num"><bdi class="num">${fmt(sec)}<small>/${fmt(ex.seconds)}</small></bdi></div><div class="muted">שניות</div></div>
      <button type="button" class="btn primary press" data-action="timer" data-ex="${ex.id}">${icon('play')}<span>טיימר</span></button>
    </div>
    <div class="inline-form">
      <label class="field grow"><span>שניות שהושגו</span>
        <input type="number" inputmode="numeric" min="0" data-manual="${ex.id}" value="${entry?.seconds ?? ''}" placeholder="${ex.last?.seconds ?? ex.seconds}"></label>
      <button type="button" class="btn secondary press" data-action="manual-save" data-ex="${ex.id}">שמירה</button>
    </div>`;
}

function maxRepsBody(ex, entry) {
  const last = ex.last?.reps?.[0];
  return `<div class="inline-form">
      <label class="field grow"><span>חזרות שהושגו</span>
        <input type="number" inputmode="numeric" min="0" data-manual="${ex.id}" value="${entry?.reps ?? ''}" placeholder="${last ?? ex.reps ?? 0}"></label>
      <button type="button" class="btn secondary press" data-action="manual-save" data-ex="${ex.id}">שמירה</button>
    </div>
    ${last ? `<p class="hint">פעם קודמת: ${num(last)} חזרות</p>` : ''}`;
}

/* ---------- Actions ---------- */

/** Runs a mutation and, if it completes the exercise, triggers vibration + check draw-in. */
function trackCompletion(ctx, ex, fn) {
  const before = exerciseProgress(ex, getDay(ctx.date).exercises[ex.id]);
  fn();
  const after = exerciseProgress(ex, getDay(ctx.date).exercises[ex.id]);
  if (before < 1 && after >= 1) {
    ctx.justCompleted.add(ex.id);
    vibrate(HAPTIC.target);
  }
}

function rememberSets(ex, sets) {
  const reps = sets.map((s, i) => (s?.done ? s.reps : ex.last?.reps?.[i] ?? ex.reps));
  const lastDone = [...sets].reverse().find((s) => s?.done);
  ex.last = { ...(ex.last || {}), reps, weight: lastDone ? lastDone.weight ?? null : prefillWeight(ex) };
  save();
}

async function onClick(e, ctx) {
  const b = e.target.closest('[data-action]');
  if (!b || b.disabled) return;
  const a = b.dataset.action;
  const k = ctx.date;
  const st = getState().settings;
  const rerender = () => ctx.rerender();
  const root = () => b.closest('#app') || document;

  if (handleDateNav(a, ctx)) return rerender();

  switch (a) {
    case 'climb': {
      const type = b.dataset.type;
      const floors = type === 'roof' ? st.floorsRoof || 0 : st.floorsRegular || 0;
      updateDay(k, (d) => d.climbs.push({ type, floors }));
      const count = getDay(k).climbs.length;
      if (st.climbsTarget && count === st.climbsTarget) {
        vibrate(HAPTIC.target);
        toast('יעד העליות הושג');
      } else vibrate(HAPTIC.item);
      return rerender();
    }
    case 'climb-undo':
      updateDay(k, (d) => d.climbs.pop());
      return rerender();
    case 'ride-new': {
      const ride = await rideSheet();
      if (!ride) return;
      updateDay(k, (d) => d.rides.push(ride));
      vibrate(HAPTIC.item);
      toast('הרכיבה נוספה');
      return rerender();
    }
    case 'ride-del': {
      if (!(await confirmDialog('למחוק את הרכיבה?', { title: 'מחיקת רכיבה', ok: 'מחיקה', danger: true }))) return;
      updateDay(k, (d) => d.rides.splice(Number(b.dataset.i), 1));
      return rerender();
    }
    case 'set': {
      if (b.dataset.longPressed) {
        delete b.dataset.longPressed;
        return;
      }
      const ex = exerciseById(b.dataset.ex);
      if (ex) toggleSet(ctx, ex, Number(b.dataset.i));
      return rerender();
    }
    case 'sets-edit': {
      const ex = exerciseById(b.dataset.ex);
      if (ex) await editSets(ctx, ex, null);
      return;
    }
    case 'timer': {
      const ex = exerciseById(b.dataset.ex);
      if (!ex) return;
      const sec = await runTimer(ex.seconds || 60, ex.name);
      if (sec > 0) {
        trackCompletion(ctx, ex, () =>
          updateDay(k, (d) => {
            const entry = (d.exercises[ex.id] ||= {});
            entry.seconds = Math.max(entry.seconds || 0, sec);
            entry.weight = ex.weight ?? null;
          })
        );
        ex.last = { ...(ex.last || {}), seconds: sec };
        save();
        toast(`נשמרו ${sec} שניות`);
      }
      return rerender();
    }
    case 'manual-save': {
      const ex = exerciseById(b.dataset.ex);
      const input = b.closest('.card').querySelector(`[data-manual="${ex?.id}"]`);
      if (ex && input) await saveManual(ctx, ex, input);
      return;
    }
    case 'achievements':
      return ctx.goTab('achievements');
    case 'ex-toggle':
      return toggleRow(b.closest('#app') || document, ctx, b.dataset.ex);
    case 'pick-sleep': {
      const v = await openTimePicker({ value: b.dataset.value, step: 5, title: b.dataset.sleep === 'bed' ? 'הלכתי לישון' : 'קמתי' });
      if (!v) return;
      b.dataset.value = v;
      b.querySelector('.time-field-val').textContent = v;
      b.setAttribute('aria-label', `${b.querySelector('.time-field-lbl').textContent}: ${v}`);
      previewSleep(root());
      return;
    }
    case 'sleep-save': {
      const sl = readSleep(root());
      if (!sl || !sleepMinutes(sl)) return invalid(root().querySelector('[data-sleep=wake]'), 'שעות שינה לא תקינות');
      updateDay(k, (d) => (d.sleep = sl));
      vibrate(HAPTIC.item);
      toast(`נשמרו ${fmtDuration(sleepMinutes(sl))} שעות שינה`);
      return rerender();
    }
    case 'water-add':
      return addWater(ctx, Number(b.dataset.ml));
    case 'water-other': {
      const ml = await openSheet({
        title: 'כמה מים?',
        body: `<label class="field"><span>כמות במ״ל</span>
          <input type="number" inputmode="numeric" name="ml" min="1" max="5000" placeholder="330"></label>`,
        onOpen: (r) => setTimeout(() => r.querySelector('[name=ml]').focus(), 300),
        actions: [
          { label: 'ביטול', value: null, kind: 'ghost' },
          {
            label: 'הוספה',
            kind: 'primary',
            onClick: (r) => {
              const v = parseNum(r.querySelector('[name=ml]').value);
              return v > 0 && v <= 5000 ? Math.round(v) : invalid(r.querySelector('[name=ml]'), 'כמות לא תקינה (1–5000 מ״ל)');
            },
          },
        ],
      });
      if (ml) addWater(ctx, ml);
      return;
    }
    case 'water-undo':
      updateDay(k, (d) => d.water.pop());
      return rerender();
    case 'backup-now':
      exportBackup();
      vibrate(HAPTIC.item);
      toast('קובץ הגיבוי נוצר');
      return rerender();
    case 'backup-share':
      if (await shareBackup()) {
        toast('הגיבוי שותף');
        return rerender();
      }
      return;
    case 'backup-later':
      snoozeBackupReminder();
      return rerender();
    case 'steps-add': {
      const n = Number(b.dataset.n);
      const prev = getDay(k).steps ?? null;
      const before = prev || 0;
      const target = st.stepsTarget;
      updateDay(k, (d) => (d.steps = before + n));
      const reached = target && before < target && before + n >= target;
      vibrate(reached ? HAPTIC.target : HAPTIC.item);
      toast(reached ? 'יעד הצעדים הושג' : `נוספו ${int(n)} צעדים`, {
        action: { label: 'ביטול', onClick: () => { updateDay(k, (d) => (d.steps = prev)); vibrate(HAPTIC.item); ctx.rerender(); } },
      });
      return rerender();
    }
    case 'copy-daily': {
      const ok = await copyText(dailySummary(k));
      toast(ok ? 'הסיכום היומי הועתק' : 'ההעתקה נכשלה');
      return;
    }
    case 'sleep-del': {
      const prev = getDay(k).sleep;
      updateDay(k, (d) => (d.sleep = null));
      toast('שינת הלילה נוקתה', {
        iconHTML: icon('trash'),
        action: { label: 'ביטול', onClick: () => { updateDay(k, (d) => (d.sleep = prev)); ctx.rerender(); } },
      });
      return rerender();
    }
    case 'nap-new':
    case 'nap-edit': {
      const i = a === 'nap-edit' ? Number(b.dataset.napI) : null;
      const res = await napSheet(k, i);
      if (!res) return;
      if (res === 'delete') return removeNap(ctx, k, i);
      updateDay(k, (d) => {
        d.naps ||= [];
        if (i !== null) d.naps[i] = res;
        else d.naps.push(res);
        d.naps.sort((x, y) => x.start.localeCompare(y.start));
      });
      vibrate(HAPTIC.item);
      toast(`נשמרה תנומה של ${durText(napMinutes(res))}`);
      return rerender();
    }
    case 'rest':
      updateDay(k, (d) => (d.rest = !d.rest));
      if (getDay(k).rest) vibrate(HAPTIC.item);
      return rerender();
    case 'go-settings':
      return ctx.goTab('settings');
  }
}

function onChange(e, ctx) {
  const t = e.target;
  if (t.dataset.change === 'steps') {
    const v = parseNum(t.value);
    const target = getState().settings.stepsTarget;
    const before = getDay(ctx.date).steps || 0;
    updateDay(ctx.date, (d) => (d.steps = v !== null && v >= 0 ? Math.round(v) : null));
    const after = getDay(ctx.date).steps || 0;
    if (target && before < target && after >= target) {
      vibrate(HAPTIC.target);
      toast('יעד הצעדים הושג');
    }
    ctx.rerender();
  }
}

/** Long-press on a set chip opens the edit dialog focused on that set. */
export function onLong(el, ctx) {
  if (el.dataset.long !== 'set') return;
  const ex = exerciseById(el.dataset.ex);
  if (ex) editSets(ctx, ex, Number(el.dataset.i));
}

function toggleSet(ctx, ex, i) {
  trackCompletion(ctx, ex, () =>
    updateDay(ctx.date, (d) => {
      const entry = (d.exercises[ex.id] ||= { sets: [] });
      entry.sets ||= [];
      while (entry.sets.length <= i) entry.sets.push({ reps: null, weight: null, done: false });
      const s = entry.sets[i];
      if (s.done) {
        s.done = false;
      } else {
        s.done = true;
        s.reps = s.reps ?? prefillReps(ex, i);
        s.weight = s.weight ?? prefillWeight(ex);
        vibrate(HAPTIC.item);
      }
    })
  );
  rememberSets(ex, getDay(ctx.date).exercises[ex.id].sets);
}

async function editSets(ctx, ex, focusIdx) {
  const entry = getDay(ctx.date).exercises[ex.id];
  const sets = entry?.sets || [];
  const n = Math.max(ex.sets || 1, sets.length);
  const doneW = sets.find((s) => s?.done && s.weight != null)?.weight;
  const weight = doneW ?? prefillWeight(ex);
  let rows = '';
  for (let i = 0; i < n; i++) {
    const s = sets[i];
    const val = s?.done ? s.reps : i === focusIdx ? prefillReps(ex, i) : '';
    rows += `<label class="set-row"><span>סט ${num(i + 1)}</span>
      <input type="number" inputmode="numeric" min="0" name="r${i}" value="${val ?? ''}" placeholder="${prefillReps(ex, i)}"></label>`;
  }
  const body = `<div class="set-rows">${rows}</div>
    <label class="field"><span>משקל לכל יד, ק״ג (רשות)</span>
      <input type="number" inputmode="decimal" min="0" step="0.5" name="weight" value="${weight ?? ''}"></label>
    <p class="hint">שדה ריק = סט שלא בוצע</p>`;
  const res = await openSheet({
    title: ex.name,
    body,
    onOpen: (root) => {
      if (focusIdx !== null) {
        const inp = root.querySelector(`[name=r${focusIdx}]`);
        setTimeout(() => {
          inp?.focus();
          inp?.select();
        }, 300);
      }
    },
    actions: [
      { label: 'ביטול', value: null, kind: 'ghost' },
      {
        label: 'שמירה',
        kind: 'primary',
        onClick: (root) => {
          const reps = [];
          for (let i = 0; i < n; i++) {
            const v = parseNum(root.querySelector(`[name=r${i}]`).value);
            reps.push(v > 0 ? Math.round(v) : null);
          }
          const w = parseNum(root.querySelector('[name=weight]').value);
          return { reps, weight: w > 0 ? w : null };
        },
      },
    ],
  });
  if (!res) return;

  trackCompletion(ctx, ex, () =>
    updateDay(ctx.date, (d) => {
      const e = (d.exercises[ex.id] ||= { sets: [] });
      e.sets = res.reps.map((r) => (r ? { reps: r, weight: res.weight, done: true } : { reps: null, weight: null, done: false }));
    })
  );
  rememberSets(ex, getDay(ctx.date).exercises[ex.id].sets);
  ctx.rerender();

  // Offer to carry the new values forward as the exercise target.
  const done = res.reps.filter(Boolean);
  if (!done.length) return;
  const allDone = done.length >= (ex.sets || 1);
  const minReps = Math.min(...done);
  const weightChanged = (res.weight ?? null) !== (ex.weight ?? null);
  const repsChanged = allDone && minReps !== ex.reps;
  if (!weightChanged && !repsChanged) return;
  const newReps = repsChanged ? minReps : ex.reps;
  const desc = `${iso(`${ex.sets}×${newReps}`)}${res.weight ? ` · ${iso(fmt(res.weight))} ק״ג` : ''}`;
  const ok = await confirmDialog(`לעדכן את היעד של "${ex.name}" ל-${desc}? כך ההתקדמות תמשיך גם בפעם הבאה.`, {
    title: 'עדכון יעד', ok: 'עדכון יעד', cancel: 'לא עכשיו',
  });
  if (!ok) return;
  ex.reps = newReps;
  ex.weight = res.weight;
  ex.last = { ...(ex.last || {}), reps: Array(ex.sets).fill(newReps), weight: res.weight };
  save();
  toast('היעד עודכן');
  ctx.rerender();
}

async function saveManual(ctx, ex, input) {
  const v = parseNum(input.value);
  const val = v > 0 ? Math.round(v) : null;
  trackCompletion(ctx, ex, () =>
    updateDay(ctx.date, (d) => {
      const entry = (d.exercises[ex.id] ||= {});
      if (ex.type === 'timed') entry.seconds = val;
      else entry.reps = val;
      entry.weight = ex.weight ?? null;
    })
  );
  if (val) {
    ex.last = ex.type === 'timed' ? { ...(ex.last || {}), seconds: val } : { ...(ex.last || {}), reps: [val] };
    save();
  }
  toast('נשמר');
  ctx.rerender();

  // Offer to raise the target after beating it.
  const target = ex.type === 'timed' ? ex.seconds : ex.reps;
  if (!val || !target || val <= target) return;
  const unit = ex.type === 'timed' ? 'שניות' : 'חזרות';
  const ok = await confirmDialog(`לעדכן את היעד של "${ex.name}" ל-${iso(val)} ${unit}?`, {
    title: 'עדכון יעד', ok: 'עדכון יעד', cancel: 'לא עכשיו',
  });
  if (!ok) return;
  if (ex.type === 'timed') ex.seconds = val;
  else ex.reps = val;
  save();
  toast('היעד עודכן');
  ctx.rerender();
}
