// "היום" tab: completion ring + streak, steps, stairs, cycling, exercises and rest day.
import { getState, getDay, updateDay, save, exerciseById } from '../storage.js';
import { ring } from '../charts.js';
import {
  icon, esc, fmt, num, parseNum, toast, vibrate, openSheet, confirmDialog, invalid,
  checkMark, dateNav, handleDateNav,
} from '../ui.js';
import {
  dayCompletion, currentStreak, exercisesForDay, exerciseProgress, computeRecords, recordIdsOn,
  longestRideKm, floorsOf,
} from '../stats.js';
import { runTimer } from '../timer.js';
import { targetText } from '../exerciseEditor.js';

// Unicode isolate for numbers inside plain-text (non-HTML) RTL strings.
const iso = (s) => `⁦${s}⁩`;

export function render(root, ctx) {
  const k = ctx.date;
  const st = getState().settings;
  const day = getDay(k);
  const rec = recordIdsOn(k, computeRecords().events);
  const badge = (id) => (rec.has(id) ? `<span class="badge">${icon('trophy')}<span>שיא חדש</span></span>` : '');

  root.innerHTML = `
    ${dateNav(k, '70')}
    ${heroCard(k, day)}
    ${stepsCard(day, st, badge)}
    ${stairsCard(day, st, badge)}
    ${ridesCard(day, st, badge)}
    ${exerciseCards(k, day, ctx, rec)}
    <button type="button" class="btn rest-btn block press ${day.rest ? 'active' : ''}" data-action="rest" aria-pressed="${day.rest}">
      ${icon('moon')}<span>${day.rest ? 'יום מנוחה · לביטול' : 'יום מנוחה'}</span>
    </button>`;
  ctx.justCompleted.clear();

  root.onclick = (e) => onClick(e, ctx);
  root.onchange = (e) => onChange(e, ctx);
}

/* ---------- Cards ---------- */

function heroCard(k, day) {
  const c = dayCompletion(k);
  const pct = Math.round(c.fraction * 100);
  const streak = currentStreak();
  return `<section class="card hero">
    ${ring({
      id: 'hero', size: 172, stroke: 16, frac: c.fraction,
      color: pct >= 100 ? 'var(--success)' : 'var(--accent)',
      inner: `<div class="ring-big">${num(pct)}<small>%</small></div>
        <div class="muted small">${c.total ? `${num(c.done)} מתוך ${num(c.total)} תרגילים` : 'אין תרגילים'}</div>`,
    })}
    <div class="hero-side">
      <div class="streak ${streak ? 'on' : ''}">${icon('flame')}<span class="streak-num">${num(streak)}</span></div>
      <div class="muted">${streak === 1 ? 'יום רצף' : 'ימי רצף'}</div>
      ${day.rest ? `<span class="pill">${icon('moon')}<span>יום מנוחה</span></span>` : ''}
    </div>
  </section>`;
}

function stepsCard(day, st, badge) {
  const target = st.stepsTarget || 0;
  const steps = day.steps || 0;
  return `<section class="card">
    <div class="card-head">${icon('steps', 'head-ic')}<h2>צעדים</h2>${badge('steps')}</div>
    <div class="row">
      ${ring({
        id: 'steps', size: 108, stroke: 11, frac: target ? steps / target : 0,
        color: target && steps >= target ? 'var(--success)' : 'var(--accent)',
        inner: `<div class="ring-mid">${num(steps)}</div>`,
      })}
      <div class="grow">
        <label class="field"><span>צעדים ביום הזה</span>
          <input type="number" inputmode="numeric" min="0" data-change="steps" value="${day.steps ?? ''}" placeholder="0" enterkeyhint="done"></label>
        <div class="muted small">יעד ${num(target)}</div>
      </div>
    </div>
  </section>`;
}

function stairsCard(day, st, badge) {
  const count = day.climbs.length;
  const target = st.climbsTarget || 0;
  return `<section class="card">
    <div class="card-head">${icon('stairs', 'head-ic')}<h2>מדרגות</h2>${badge('climbs')}</div>
    <div class="row">
      ${ring({
        id: 'climbs', size: 108, stroke: 11, frac: target ? count / target : 0,
        color: target && count >= target ? 'var(--success)' : 'var(--accent)',
        inner: `<div class="ring-mid">${num(count)}<small>/${num(target)}</small></div>`,
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
      (r, i) => `<li class="list-row">
        <div class="grow"><strong>${num(r.km)} ק״מ</strong>${r.minutes ? ` · ${num(r.minutes)} דק׳` : ''}
          ${r.note ? `<div class="muted small">${esc(r.note)}</div>` : ''}</div>
        <button type="button" class="icon-btn sm press danger-ic" data-action="ride-del" data-i="${i}" aria-label="מחיקת רכיבה">${icon('trash')}</button>
      </li>`
    )
    .join('');
  return `<section class="card">
    <div class="card-head">${icon('bike', 'head-ic')}<h2>רכיבה</h2>${badge('ride')}</div>
    <div class="row">
      ${ring({
        id: 'ride', size: 108, stroke: 11, frac: goal ? longest / goal : 0,
        color: goal && longest >= goal ? 'var(--success)' : 'var(--accent)',
        inner: `<div class="ring-mid">${num(longest)}</div><div class="muted xs">שיא ק״מ</div>`,
      })}
      <div class="grow">
        <div class="stat-num">${num(totalKm)}<small> ק״מ</small></div>
        <div class="muted">ביום הזה${totalMin ? ` · ${num(totalMin)} דק׳` : ''}</div>
        <div class="muted small">יעד רכיבה בודדת ${num(goal)} ק״מ</div>
      </div>
    </div>
    ${list ? `<ul class="list">${list}</ul>` : ''}
    <div class="field-grid">
      <label class="field"><span>ק״מ</span><input type="number" inputmode="decimal" min="0" step="0.1" data-ride="km" placeholder="0"></label>
      <label class="field"><span>דקות</span><input type="number" inputmode="numeric" min="0" data-ride="minutes" placeholder="0"></label>
    </div>
    <label class="field"><span>הערה (רשות)</span><input type="text" maxlength="60" data-ride="note" autocomplete="off"></label>
    <button type="button" class="btn secondary block press" data-action="ride-add">${icon('plus')}<span>הוספת רכיבה</span></button>
  </section>`;
}

function exerciseCards(k, day, ctx, rec) {
  const list = exercisesForDay(k);
  if (!list.length) {
    return `<section class="card empty-card">
      ${icon('dumbbell', 'head-ic')}
      <p>עדיין לא הוגדרו תרגילים.</p>
      <button type="button" class="btn secondary press" data-action="go-settings">הוספת תרגילים בהגדרות</button>
    </section>`;
  }
  return list.map((ex) => exerciseCard(ex, day.exercises[ex.id], ctx, rec)).join('');
}

function exerciseCard(ex, entry, ctx, rec) {
  const p = exerciseProgress(ex, entry);
  const complete = p >= 1;
  const draw = ctx.justCompleted.has(ex.id);
  const typeIcon = ex.type === 'timed' ? 'timer' : 'dumbbell';
  const recBadge = ['reps', 'w', 'sec'].some((t) => rec.has(`${t}:${ex.id}`))
    ? `<span class="badge">${icon('trophy')}<span>שיא חדש</span></span>` : '';
  let body = '';
  if (ex.type === 'setsReps') body = setsBody(ex, entry);
  else if (ex.type === 'timed') body = timedBody(ex, entry);
  else body = maxRepsBody(ex, entry);
  return `<section class="card ex-card ${complete ? 'complete' : ''}">
    <div class="card-head">
      ${ring({
        id: `ex-${ex.id}`, size: 52, stroke: 6, frac: p, cls: 'ring-sm',
        color: complete ? 'var(--success)' : 'var(--accent)',
        inner: complete ? checkMark(draw) : icon(typeIcon),
      })}
      <div class="grow"><h2>${esc(ex.name)}${ex.archived ? ' <span class="muted xs">(נמחק)</span>' : ''}</h2>
        <span class="muted small">${targetText(ex)}</span></div>
      ${recBadge}
      ${ex.type === 'setsReps' ? `<button type="button" class="icon-btn sm press" data-action="sets-edit" data-ex="${ex.id}" aria-label="עריכת ביצוע">${icon('edit')}</button>` : ''}
    </div>
    ${body}
  </section>`;
}

const prefillReps = (ex, i) => ex.last?.reps?.[i] ?? ex.reps;
const prefillWeight = (ex) => ex.last?.weight ?? ex.weight ?? null;

function setsBody(ex, entry) {
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
  return `<div class="chips">${chips}</div><p class="hint">הקשה מסמנת סט · לחיצה ארוכה לעריכת חזרות</p>`;
}

function timedBody(ex, entry) {
  const sec = entry?.seconds || 0;
  return `<div class="row">
      <div class="grow"><div class="stat-num">${num(sec)}<small>/${num(ex.seconds)}</small></div><div class="muted">שניות</div></div>
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
    vibrate([40, 50, 40]);
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

  if (handleDateNav(a, ctx)) return rerender();

  switch (a) {
    case 'climb': {
      const type = b.dataset.type;
      const floors = type === 'roof' ? st.floorsRoof || 0 : st.floorsRegular || 0;
      updateDay(k, (d) => d.climbs.push({ type, floors }));
      const count = getDay(k).climbs.length;
      if (st.climbsTarget && count === st.climbsTarget) {
        vibrate([40, 50, 40]);
        toast('יעד העליות הושג');
      } else vibrate(20);
      return rerender();
    }
    case 'climb-undo':
      updateDay(k, (d) => d.climbs.pop());
      return rerender();
    case 'ride-add': {
      const root = b.closest('.card');
      const kmIn = root.querySelector('[data-ride=km]');
      const km = parseNum(kmIn.value);
      if (!(km > 0)) return invalid(kmIn, 'יש להזין מרחק בק״מ');
      const minutes = parseNum(root.querySelector('[data-ride=minutes]').value);
      const note = root.querySelector('[data-ride=note]').value.trim();
      updateDay(k, (d) => d.rides.push({ km, minutes: minutes > 0 ? minutes : null, note }));
      vibrate(30);
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
    case 'rest':
      updateDay(k, (d) => (d.rest = !d.rest));
      if (getDay(k).rest) vibrate(30);
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
      vibrate([40, 50, 40]);
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
        vibrate(15);
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
