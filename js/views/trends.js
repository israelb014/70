// "מגמות" tab: weight progress + chart, 7-day steps and protein, personal records, weekly summary.
import { getState, getDay, addWeight, deleteWeight } from '../storage.js';
import { ring, barChart, weightChart } from '../charts.js';
import { icon, esc, num, parseNum, toast, openSheet, confirmDialog, invalid } from '../ui.js';
import { lastNDays, todayKey, shortDate } from '../dates.js';
import { computeRecords, foodTotals } from '../stats.js';
import { weeklySummary, copyText } from '../export.js';

export function render(root, ctx) {
  const st = getState().settings;
  const weights = getState().weights;
  const keys = lastNDays(7);

  root.innerHTML = `
    <header class="page-head"><span class="eyebrow">70</span><h1>מגמות</h1></header>
    ${weightCard(st, weights)}
    <section class="card">
      <div class="card-head">${icon('steps', 'head-ic')}<h2>צעדים · 7 ימים</h2></div>
      ${barChart({ keys, values: keys.map((k) => getDay(k).steps || 0), target: st.stepsTarget })}
      <p class="legend"><span class="lg-line"></span>יעד ${num(st.stepsTarget || 0)}</p>
    </section>
    <section class="card">
      <div class="card-head">${icon('food', 'head-ic')}<h2>חלבון · 7 ימים</h2></div>
      ${barChart({ keys, values: keys.map((k) => foodTotals(k).protein), target: st.proteinTarget, color: 'var(--protein)' })}
      <p class="legend"><span class="lg-line"></span>יעד ${num(st.proteinTarget || 0)} ג׳</p>
    </section>
    ${recordsCard()}
    <button type="button" class="btn primary block press" data-action="copy-summary">${icon('copy')}<span>העתק סיכום שבועי</span></button>`;

  root.onclick = (e) => onClick(e, ctx);
  root.onchange = null;
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
  return `<section class="card">
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
      <ul class="list">${recent}</ul>` : '<p class="muted">עוד אין שקילות. הוסיפו שקילה ראשונה כדי לראות גרף.</p>'}
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
  return `<section class="card">
    <div class="card-head">${icon('trophy', 'head-ic')}<h2>שיאים אישיים</h2></div>
    ${rows ? `<ul class="list">${rows}</ul>` : '<p class="muted">השיאים יופיעו כאן אוטומטית אחרי שתתחילו לתעד.</p>'}
  </section>`;
}

async function onClick(e, ctx) {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  switch (b.dataset.action) {
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
