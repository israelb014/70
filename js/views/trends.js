// "מגמות" tab: weight progress + chart, 7-day steps and protein, personal records, weekly summary.
import { getState, getDay, addWeight, deleteWeight } from '../storage.js';
import { ring, barChart, weightChart, bindChartTips } from '../charts.js';
import { icon, esc, num, parseNum, toast, openSheet, confirmDialog, invalid, emptyState } from '../ui.js';
import { weekInsights } from '../insights.js';
import { lastNDays, todayKey, shortDate } from '../dates.js';
import { computeRecords, foodTotals, waterMl } from '../stats.js';
import { weeklySummary, copyText } from '../export.js';
import { heatmapCard, bindHeatmap } from '../heatmap.js';
import { levelInfo, weekXP, badgeStates, sleepMinutes, fmtDuration, averageBedtime, totalSleepMinutes, napsMinutes, hasSleep } from '../progress.js';
import { medallion } from '../badgeArt.js';
import { photosCard } from './photos.js';

export function render(root, ctx) {
  const st = getState().settings;
  const weights = getState().weights;
  const keys = lastNDays(7);

  root.innerHTML = `
    <header class="page-head"><h1>מגמות</h1></header>
    ${insightsSection()}
    ${heatmapCard()}
    ${achievementsCard()}
    ${photosCard()}
    ${weightCard(st, weights)}
    <section class="card role-steps">
      <div class="card-head">${icon('steps', 'head-ic')}<h2>צעדים · 7 ימים</h2></div>
      ${barChart({ keys, values: keys.map((k) => getDay(k).steps || 0), target: st.stepsTarget, color: 'var(--steps)', unit: 'צעדים' })}
      <p class="legend"><span class="lg-line"></span>יעד ${num(st.stepsTarget || 0)}</p>
    </section>
    <section class="card role-protein">
      <div class="card-head">${icon('food', 'head-ic')}<h2>חלבון · 7 ימים</h2></div>
      ${barChart({ keys, values: keys.map((k) => foodTotals(k).protein), target: st.proteinTarget, color: 'var(--protein)', unit: 'ג׳' })}
      <p class="legend"><span class="lg-line"></span>יעד ${num(st.proteinTarget || 0)} ג׳</p>
    </section>
    ${sleepTrendCard(st, keys)}
    ${waterTrendCard(st, keys)}
    ${recordsCard()}
    <button type="button" class="btn primary block press" data-action="copy-summary">${icon('copy')}<span>העתק סיכום שבועי</span></button>`;

  root.onclick = (e) => onClick(e, ctx);
  root.onchange = null;
  bindChartTips(root);
  bindHeatmap(root, (k) => {
    ctx.date = k;
    ctx.goTab('today');
  });
}

/* ---------- Insights ---------- */

function insightsSection() {
  const list = weekInsights();
  return `<section class="card insights-week role-accent">
    <div class="card-head">${icon('sparkle', 'head-ic')}<h2>תובנות</h2><span class="muted small">7 הימים האחרונים</span></div>
    ${list.length
      ? `<ul class="insight-list">${list.map((x) => `<li class="insight kind-${x.kind}">
          <span class="insight-ic">${icon(`cat-${x.cat}`)}</span><p>${esc(x.text)}</p></li>`).join('')}</ul>`
      : emptyState('insights', 'עוד כמה ימים של נתונים ונתחיל להציג תובנות')}
  </section>`;
}

function achievementsCard() {
  const L = levelInfo();
  const badges = badgeStates();
  const earned = badges.filter((b) => b.earned).sort((a, b) => b.earned.localeCompare(a.earned));
  return `<button type="button" class="card ach-card press" data-action="achievements">
    ${ring({ id: 'level-trends', size: 76, stroke: 8, frac: L.frac, inner: `<div class="ring-mid">${num(L.level)}</div>` })}
    <div class="grow">
      <h2>הישגים · רמה ${num(L.level)}</h2>
      <div class="muted small"><span class="nw">${num(L.xp)} נקודות</span> · <span class="nw">עוד ${num(L.toNext)} לרמה הבאה</span></div>
      <div class="ach-medals">${earned.slice(0, 5).map((b) => medallion(b, true, 30)).join('') || '<span class="muted small">עוד אין תגים</span>'}
        <span class="muted small">${num(`${earned.length}/${badges.length}`)}</span></div>
    </div>
    ${icon('chevL')}
  </button>`;
}

function waterTrendCard(st, keys) {
  const target = (st.waterTarget || 2500) / 1000;
  const liters = keys.map((k) => waterMl(getDay(k)) / 1000);
  const logged = liters.filter((l) => l > 0);
  const avg = logged.length ? logged.reduce((a, b) => a + b, 0) / logged.length : 0;
  const f2 = (v) => v.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `<section class="card role-water">
    <div class="card-head">${icon('drop', 'head-ic')}<h2>מים · 7 ימים</h2></div>
    ${barChart({ keys, values: liters, target, color: 'var(--water)', format: (v) => f2(v), unit: 'ל׳' })}
    <p class="legend"><span class="lg-line"></span>יעד ${num(target, 2)} ל׳</p>
    <div class="hm-stats">
      <div><span class="stat-num">${logged.length ? num(f2(avg)) : '–'}</span><span class="muted small">ממוצע ליטרים ליום</span></div>
      <div><span class="stat-num"><bdi class="num">${logged.length}<small>/7</small></bdi></span><span class="muted small">ימים עם תיעוד</span></div>
    </div>
  </section>`;
}

function sleepTrendCard(st, keys) {
  const target = st.sleepTarget || 8;
  const days = keys.map((k) => getDay(k));
  // Bars and the average use the TOTAL (night + naps); naps are a lighter segment on top.
  const logged = days.filter(hasSleep);
  const hours = days.map((d) => totalSleepMinutes(d) / 60);
  const napHours = days.map((d) => napsMinutes(d) / 60);
  const tips = days.map((d, i) => (napsMinutes(d)
    ? `${shortDate(keys[i])} · לילה ${fmtDuration(sleepMinutes(d.sleep))} · תנומות ${fmtDuration(napsMinutes(d))} · סה״כ ${fmtDuration(totalSleepMinutes(d))} שעות`
    : null));
  const avgMin = logged.length ? logged.reduce((a, d) => a + totalSleepMinutes(d), 0) / logged.length : 0;
  // Average bedtime: night sleep only.
  const avgBed = averageBedtime(days.filter((d) => d.sleep).map((d) => d.sleep.bed));
  return `<section class="card role-sleep">
    <div class="card-head">${icon('bed', 'head-ic')}<h2>שינה · 7 ימים</h2></div>
    ${barChart({ keys, values: hours, target, color: 'var(--sleep)', format: (v) => fmtDuration(v * 60), unit: 'שעות', stack: napHours, stackColor: 'var(--sleep-light)', tips })}
    <p class="legend"><span class="lg-line"></span>יעד ${num(target)} שעות</p>
    <div class="hm-stats">
      <div><span class="stat-num">${logged.length ? num(fmtDuration(avgMin)) : '–'}</span><span class="muted small">ממוצע שעות שינה</span></div>
      <div><span class="stat-num">${avgBed ? num(avgBed) : '–'}</span><span class="muted small">שעת שינה ממוצעת</span></div>
    </div>
  </section>`;
}

function weightCard(st, weights) {
  const start = st.startWeight;
  const target = st.targetWeight;
  const current = weights.length ? weights[weights.length - 1].kg : start;
  const span = target - start;
  const frac = span ? (current - start) / span : 0;
  const diff = start - current; // positive = lost
  const recent = weights
    .map((w, i) => ({ ...w, i }))
    .slice(-6)
    .reverse()
    .map(
      (w) => `<li class="list-row"><div class="grow"><strong>${num(w.kg)} ק״ג</strong>
        <span class="muted small"> · ${num(shortDate(w.date))}</span></div>
        <button type="button" class="icon-btn sm press danger-ic" data-action="weight-del" data-i="${w.i}" aria-label="מחיקת שקילה">${icon('trash')}</button></li>`
    )
    .join('');
  return `<section class="card role-accent">
    <div class="card-head">${icon('scale', 'head-ic')}<h2>משקל</h2></div>
    <div class="row">
      ${ring({
        id: 'weight', size: 150, stroke: 14, frac,
        color: frac >= 1 ? 'var(--success)' : 'var(--accent)',
        inner: `<div class="ring-big sm">${num(current)}</div><div class="muted small">ק״ג</div>`,
      })}
      <div class="grow">
        <div class="stat-num">${num(Math.abs(diff))}<small> ק״ג</small></div>
        <div class="muted">${diff >= 0 ? 'ירדו מההתחלה' : 'עלו מההתחלה'}</div>
        <div class="muted small">התחלה ${num(start)} · יעד ${num(target)}</div>
      </div>
    </div>
    <button type="button" class="btn secondary block press" data-action="weight-add">${icon('plus')}<span>הוספת שקילה</span></button>
    ${weights.length ? `${weightChart(weights, target)}
      <p class="legend"><span class="lg-dot"></span>שקילה <span class="lg-avg"></span>ממוצע שבועי <span class="lg-line"></span>יעד</p>
      <ul class="list">${recent}</ul>` : emptyState('weight', 'עוד אין שקילות. הוסיפו שקילה ראשונה כדי לראות גרף.')}
  </section>`;
}

function recordsCard() {
  const { records, events } = computeRecords();
  const recent = new Set(events.filter((e) => e.date >= lastNDays(7)[0]).map((e) => e.id));
  const rows = records
    .map(
      (r) => `<li class="list-row">
        <div class="grow"><strong>${esc(r.label)}</strong><div class="muted small">${num(shortDate(r.date))}</div></div>
        ${recent.has(r.id) ? `<span class="badge">${icon('trophy')}<span>חדש</span></span>` : ''}
        <div class="rec-val">${num(r.value)} <span class="muted small">${esc(r.unit)}</span></div>
      </li>`
    )
    .join('');
  return `<section class="card role-accent">
    <div class="card-head">${icon('trophy', 'head-ic')}<h2>שיאים אישיים</h2></div>
    ${rows ? `<ul class="list">${rows}</ul>` : emptyState('trophy', 'השיאים יופיעו כאן אוטומטית אחרי שתתחילו לתעד.')}
  </section>`;
}

async function onClick(e, ctx) {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  switch (b.dataset.action) {
    case 'achievements':
      return ctx.goTab('achievements');
    case 'photos':
      return ctx.goTab('photos');
    case 'weight-add': {
      const last = getState().weights.at(-1)?.kg ?? getState().settings.startWeight;
      const res = await openSheet({
        title: 'הוספת שקילה',
        body: `<div class="field-grid">
          <label class="field"><span>משקל (ק״ג)</span><input name="kg" type="number" inputmode="decimal" step="0.1" min="0" placeholder="${last ?? ''}"></label>
          <label class="field"><span>תאריך</span><input name="date" type="date" value="${todayKey()}" max="${todayKey()}"></label>
        </div>`,
        onOpen: (root) => setTimeout(() => root.querySelector('[name=kg]').focus(), 300),
        actions: [
          { label: 'ביטול', value: null, kind: 'ghost' },
          {
            label: 'שמירה',
            kind: 'primary',
            onClick: (root) => {
              const kgIn = root.querySelector('[name=kg]');
              const kg = parseNum(kgIn.value);
              const date = root.querySelector('[name=date]').value;
              if (!(kg > 20 && kg < 400)) return invalid(kgIn, 'משקל לא תקין');
              if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayKey()) return invalid(root.querySelector('[name=date]'), 'תאריך לא תקין');
              return { kg, date };
            },
          },
        ],
      });
      if (res) {
        addWeight(res.date, res.kg);
        toast('השקילה נשמרה');
        ctx.rerender();
      }
      return;
    }
    case 'weight-del':
      if (await confirmDialog('למחוק את השקילה?', { title: 'מחיקת שקילה', ok: 'מחיקה', danger: true })) {
        deleteWeight(Number(b.dataset.i));
        ctx.rerender();
      }
      return;
    case 'copy-summary': {
      const ok = await copyText(weeklySummary());
      toast(ok ? 'הסיכום השבועי הועתק' : 'ההעתקה נכשלה');
    }
  }
}
