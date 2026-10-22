// "נשימה": today card, setup sheet, full-screen session (time-driven phases, soft cues, wake lock),
// end screen, 7-day chart and settings card.
import { getState, getDay, updateSettings } from '../storage.js';
import { ring, barChart, arcPath } from '../charts.js';
import { icon, esc, num, toast, openSheet, vibrate, reducedMotion } from '../ui.js';
import { todayKey } from '../dates.js';
import { plural, int } from '../hebrew.js';
import { fieldHTML } from './wizard.js';
import {
  TECHNIQUES, DURATIONS, PHASE_WORD, PREP_SECONDS, techniqueById, phaseAt, breathMinutes, breathGoal,
  saveBreathing, lastChoice, rememberChoice,
} from '../breathing.js';

const minutesText = (m) => plural(m, 'דקה אחת', 'דקות');
/** Same text with the number isolated LTR. */
const minutesHTML = (m) => esc(minutesText(m)).replace(/\d+/, (d) => `<bdi class="num">${d}</bdi>`);

/* ---------- "היום" card ---------- */

export function breathCard(day, k) {
  const goal = breathGoal();
  const m = breathMinutes(day);
  return `<section class="card role-breath breath-card">
    <div class="card-head">${icon('breath', 'head-ic')}<h2>נשימה</h2></div>
    <div class="row">
      ${ring({
        id: 'breath', size: 108, stroke: 11, frac: m / goal,
        color: 'var(--breath)',
        inner: `<div class="ring-mid">${num(m)}</div><div class="muted xs">דקות</div>`,
      })}
      <div class="grow">
        <div class="breath-today" data-breath-today>${minutesHTML(m)} ${k === todayKey() ? 'היום' : 'ביום הזה'}</div>
        <div class="muted small">יעד ${minutesHTML(goal)}</div>
      </div>
    </div>
    <button type="button" class="btn breath-btn block press" data-action="breath-start">${icon('breath')}<span>להתחיל</span></button>
  </section>`;
}

/* ---------- Setup sheet ---------- */

/** Technique cards + duration chips; remembers the last choice. Resolves { technique, minutes } or null. */
export async function setupSheet() {
  const last = lastChoice();
  const res = await openSheet({
    title: 'נשימה',
    body: `<div class="tech-list" role="radiogroup" aria-label="טכניקה">${TECHNIQUES.map((t) => `<label class="tech-card press">
        <input type="radio" name="tech" value="${t.id}" ${t.id === last.technique ? 'checked' : ''}>
        <span class="tech-body"><strong>${esc(t.name)}</strong><span>${esc(t.desc)}</span></span>
        <span class="tech-check">${icon('check')}</span></label>`).join('')}</div>
      <div class="field"><span>משך</span>
        <div class="dur-chips" role="radiogroup" aria-label="משך">${DURATIONS.map((d) => `<label>
          <input type="radio" name="dur" value="${d}" ${d === last.minutes ? 'checked' : ''}><span><bdi class="num">${d}</bdi> דק׳</span></label>`).join('')}</div>
      </div>`,
    actions: [{
      label: 'התחלה', kind: 'breath-btn',
      onClick: (w) => ({ technique: w.querySelector('[name=tech]:checked').value, minutes: Number(w.querySelector('[name=dur]:checked').value) }),
    }],
  });
  if (res) rememberChoice(res.technique, res.minutes);
  return res;
}

/** Card / shortcut entry: setup, then the session. */
export async function startBreathing(ctx) {
  const choice = await setupSheet();
  if (choice) runSession(ctx, choice);
}

/* ---------- Soft tone (WebAudio, sine, low volume) ---------- */

let audio = null;
function softTone() {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const t = audio.currentTime;
    const osc = audio.createOscillator(), g = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = 396;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.04, t + 0.06);
    g.gain.linearRampToValueAtTime(0, t + 0.45);
    osc.connect(g).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.5);
  } catch { /* no audio */ }
}

/* ---------- Session ---------- */

const MIN_SCALE = 0.55;
const ease = (p) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, p)));
const clock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * Full-screen session. Time comes from Date.now() (accumulated while running), so phases are exact and
 * pausing freezes everything. A 3-second "מתכוננים…" countdown precedes the first phase.
 */
export function runSession(ctx, { technique, minutes }) {
  const tech = techniqueById(technique);
  const total = minutes * 60;
  const st = getState().settings || {};
  const cueVibrate = st.breathVibrate !== false;
  const cueSound = st.breathSound === true;
  const still = reducedMotion();
  let acc = 0, runFrom = Date.now(), running = true, finished = false, raf = 0, lastKey = '', wakeLock = null;

  const el = document.createElement('div');
  el.className = `breathe tech-${tech.id}${still ? ' still' : ''}`;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', `סשן נשימה · ${tech.name}`);
  el.innerHTML = `<div class="br-top"><span class="muted small">${esc(tech.name)}</span><bdi class="num br-left" data-br-left>${clock(total)}</bdi></div>
    <div class="br-stage">
      <svg class="br-ring" viewBox="0 0 280 280" aria-hidden="true">
        <circle cx="140" cy="140" r="136" fill="none" stroke="var(--track)" stroke-width="3"/>
        <path class="br-progress" data-br-progress d="" fill="none" stroke="var(--breath)" stroke-width="3" stroke-linecap="round"/>
      </svg>
      <div class="br-circle" data-br-circle></div>
      <div class="br-text" aria-live="polite"><div class="br-phase" data-br-phase>מתכוננים…</div><bdi class="br-sec num" data-br-sec>${PREP_SECONDS}</bdi></div>
    </div>
    <p class="br-paused" data-br-paused hidden>הפסקה<span class="muted small">הקשה להמשך</span></p>
    <button type="button" class="br-end press" data-br="end">סיום</button>`;
  document.body.appendChild(el);
  document.body.classList.add('no-scroll', 'breathing-on');
  requestAnimationFrame(() => el.classList.add('open'));
  const $ = (sel) => el.querySelector(sel);
  const circle = $('[data-br-circle]');

  const elapsed = () => acc + (running ? Date.now() - runFrom : 0); // ms incl. the prep countdown
  const requestWake = async () => {
    try { if ('wakeLock' in navigator && document.visibilityState === 'visible') wakeLock = await navigator.wakeLock.request('screen'); } catch { /* denied */ }
  };
  const cue = () => {
    if (cueVibrate) vibrate(20);
    if (cueSound) softTone();
  };

  const draw = () => {
    const ms = elapsed();
    const prep = PREP_SECONDS * 1000;
    if (ms < prep) {
      el.dataset.phase = 'prep';
      $('[data-br-phase]').textContent = 'מתכוננים…';
      $('[data-br-sec]').textContent = String(Math.ceil((prep - ms) / 1000));
      setCircle(MIN_SCALE);
      return;
    }
    const t = (ms - prep) / 1000;
    if (t >= total) return finish(true);
    $('[data-br-left]').textContent = clock(Math.ceil(total - t));
    $('[data-br-progress]').setAttribute('d', arcPath(140, 140, 136, t / total, 3));
    const ph = phaseAt(tech.id, t);
    if (!ph) {
      // Free breathing: no words to follow, only a slow ambient pulse (12 s).
      el.dataset.phase = 'free';
      $('[data-br-phase]').textContent = 'נשימה חופשית';
      $('[data-br-sec]').textContent = '';
      const p = (t % 12) / 12;
      setCircle(0.78 + 0.12 * Math.sin(p * 2 * Math.PI), 0.55 + 0.25 * Math.sin(p * 2 * Math.PI));
      if (lastKey !== 'free') { lastKey = 'free'; cue(); }
      return;
    }
    const key = `${Math.floor(t / ph.cycle)}:${ph.index}`;
    if (key !== lastKey) { lastKey = key; cue(); }
    el.dataset.phase = ph.kind;
    $('[data-br-phase]').textContent = PHASE_WORD[ph.kind];
    $('[data-br-sec]').textContent = String(ph.left);
    const p = Math.min(1, Math.max(0, ((t % ph.cycle) - offsetOf(ph)) / ph.duration)); // 0..1 within the phase
    if (ph.kind === 'in') setCircle(MIN_SCALE + (1 - MIN_SCALE) * ease(p));
    else if (ph.kind === 'out') setCircle(1 - (1 - MIN_SCALE) * ease(p));
    else setCircle(prevKind(ph) === 'in' ? 1 : MIN_SCALE);
  };
  const offsetOf = (ph) => tech.phases.slice(0, ph.index).reduce((a, [, d]) => a + d, 0);
  const prevKind = (ph) => tech.phases[(ph.index - 1 + tech.phases.length) % tech.phases.length][0];
  /** Scale the circle — or, with reduced motion, only change its opacity. */
  function setCircle(scale, opacity) {
    const s = Math.round(scale * 1000) / 1000;
    circle.dataset.scale = String(s);
    if (still) {
      circle.style.transform = 'none';
      circle.style.opacity = String(opacity ?? 0.35 + 0.65 * ((s - MIN_SCALE) / (1 - MIN_SCALE)));
    } else {
      circle.style.transform = `scale(${s})`;
      if (opacity !== undefined) circle.style.opacity = String(opacity);
    }
  }
  const loop = () => {
    if (finished) return;
    draw();
    if (!finished) raf = requestAnimationFrame(loop);
  };

  const setRunning = (on) => {
    if (finished || on === running) return;
    if (on) { runFrom = Date.now(); running = true; requestWake(); }
    else { acc = elapsed(); running = false; }
    el.dataset.state = on ? 'run' : 'paused';
    $('[data-br-paused]').hidden = on;
    draw();
  };
  const onVis = () => { if (document.visibilityState === 'hidden') setRunning(false); };

  function finish(complete) {
    if (finished) return;
    const seconds = complete ? total : Math.max(0, (elapsed() - PREP_SECONDS * 1000) / 1000);
    finished = true;
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVis);
    try { wakeLock?.release(); } catch { /* ignore */ }
    const saved = saveBreathing(tech.id, Math.min(total, seconds));
    if (complete) cue();
    const todayTotal = breathMinutes(getDay(todayKey()));
    el.dataset.state = 'done';
    el.innerHTML = `<div class="br-done">
        <div class="br-done-mark" aria-hidden="true"><span></span>${icon('check')}</div>
        <h1 data-br-result>${saved ? `${minutesHTML(saved)} של נשימה` : 'פחות מדקה, הסשן לא נשמר'}</h1>
        <p class="muted" data-br-total>היום: ${minutesHTML(todayTotal)}</p>
        <button type="button" class="btn breath-btn block press" data-br="close">סיום</button>
      </div>`;
  }
  const close = () => {
    el.classList.remove('open');
    setTimeout(() => {
      el.remove();
      document.body.classList.remove('breathing-on');
      if (!document.querySelector('.sheet-backdrop')) document.body.classList.remove('no-scroll');
    }, 260);
    ctx.rerender();
  };

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-br]');
    if (b?.dataset.br === 'end') return finish(false);
    if (b?.dataset.br === 'close') return close();
    if (!finished) setRunning(!running); // tap anywhere: pause / resume
  });
  document.addEventListener('visibilitychange', onVis);
  el.dataset.state = 'run';
  requestWake();
  loop();
}

/* ---------- "מגמות" chart ---------- */

export function breathTrendCard(keys) {
  const goal = breathGoal();
  const vals = keys.map((k) => breathMinutes(getDay(k)));
  const total = vals.reduce((a, b) => a + b, 0);
  return `<section class="card role-breath">
    <div class="card-head">${icon('breath', 'head-ic')}<h2>נשימה · 7 ימים</h2></div>
    ${barChart({ keys, values: vals, target: goal, color: 'var(--breath)', format: (v) => int(v), unit: 'דקות' })}
    <p class="legend"><span class="lg-line"></span>יעד ${minutesHTML(goal)}</p>
    <div class="hm-stats"><div><span class="stat-num" data-breath-week>${num(total)}</span><span class="muted small">דקות נשימה השבוע</span></div></div>
  </section>`;
}

/* ---------- Settings card ---------- */

export function breathSettingsCard() {
  const st = getState().settings || {};
  const check = (key, label, on) => `<label class="check"><input type="checkbox" data-breath-setting="${key}" ${on ? 'checked' : ''}>
      <span class="check-box">${icon('check')}</span><span>${label}</span></label>`;
  return `<section class="card role-breath">
    <div class="card-head">${icon('breath', 'head-ic')}<h2>נשימה</h2></div>
    <div class="field-grid">${fieldHTML('breathGoal', st.breathGoal ?? 5)}</div>
    ${check('breathVibrate', 'רטט במעבר בין שלבים', st.breathVibrate !== false)}
    ${check('breathSound', 'צליל שקט במעבר בין שלבים', st.breathSound === true)}
  </section>`;
}

export function saveBreathSetting(input) {
  updateSettings({ [input.dataset.breathSetting]: input.checked });
  toast('נשמר');
}
