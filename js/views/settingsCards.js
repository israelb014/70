// Settings cards for v3.0: "עיצוב" (daily themes), "הקפאה", and — in the Android app only —
// automatic backup, "חיבור ל-Health Connect", "תזכורות" and "אייקון משתנה כל יום".
import { getState, updateSettings } from '../storage.js';
import { icon, esc, toast, vibrate, HAPTIC, invalid, parseNum } from '../ui.js';
import { todayKey } from '../dates.js';
import { THEMES, themeFor, applyTheme } from '../theme.js';
import { isNative, openExternal } from '../native.js';
import { currentPause, startPause, endPause, pauseLastDay, isPaused } from '../pause.js';
import { lastAutoBackup, shareLatestAutoBackup } from '../autobackup.js';
import { healthStatus, connectHealth, syncHealth, lastHealthSync, TYPES as HC_TYPES } from '../health.js';
import { reminderSettings, scheduleReminders, ensureNotificationPermission } from '../reminders.js';
import { nativeStore } from '../native.js';

const dm = (k) => { const [, m, d] = k.split('-'); return `${d}.${m}`; };

/** "עיצוב": changes every day (default) or one fixed theme; 7 preview cards. */
export function themeCard(st) {
  const auto = !st.theme || st.theme === 'auto';
  const today = themeFor(new Date(), 'auto');
  return `<section class="card theme-card-wrap">
    <div class="card-head">${icon('sparkle', 'head-ic')}<h2>עיצוב</h2></div>
    <div class="segmented two" role="radiogroup" aria-label="עיצוב">
      <label><input type="radio" name="themeMode" value="auto" data-theme-mode ${auto ? 'checked' : ''}><span>משתנה כל יום</span></label>
      <label><input type="radio" name="themeMode" value="fixed" data-theme-mode ${auto ? '' : 'checked'}><span>עיצוב קבוע</span></label>
    </div>
    <div class="theme-grid" role="radiogroup" aria-label="בחירת עיצוב">
      ${THEMES.map((t) => `<label class="theme-card" data-theme="${t.id}">
        <input type="radio" name="themePick" value="${t.id}" data-theme-pick ${!auto && st.theme === t.id ? 'checked' : ''}>
        <span class="tc-glow" aria-hidden="true"></span><span class="tc-dot" aria-hidden="true"></span>
        <b>${esc(t.name)}</b><small>${auto && t.id === today ? 'היום' : `יום ${t.day}`}</small>
      </label>`).join('')}
    </div>
    ${isNative() ? `<label class="check"><input type="checkbox" data-icon-daily ${st.iconDaily ? 'checked' : ''}>
      <span class="check-box">${icon('check')}</span><span>אייקון משתנה כל יום</span></label>
      <p class="muted small">בחלק מהטלפונים, כולל Samsung, החלפת אייקון יכולה להזיז את האייקון במסך הבית או להסיר אותו משם, והאפליקציה נסגרת לרגע.</p>` : ''}
  </section>`;
}

/** "הקפאה": start date + 1–30 days, or until cancelled. */
export function pauseCard() {
  const p = currentPause();
  const now = todayKey();
  const status = p ? (isPaused(now)
    ? `הקפאה פעילה ${pauseLastDay(p) ? `עד <bdi class="num" dir="ltr">${dm(pauseLastDay(p))}</bdi>` : 'עד שתבטל'}`
    : `הקפאה מתוכננת מ-<bdi class="num" dir="ltr">${dm(p.start)}</bdi>`) : '';
  return `<section class="card pause-card">
    <div class="card-head">${icon('pause', 'head-ic')}<h2>הקפאה</h2></div>
    <p class="muted small">בימי הקפאה אין תוכנית אימון, הרצף והסבב לא נפגעים, ואפשר להמשיך לרשום אוכל, מים, שינה, צעדים ומשקל.</p>
    ${p ? `<p class="pause-status" data-pause-status>${status}</p>
      <button type="button" class="btn secondary block press" data-action="pause-stop">${icon('x')}<span>סיום הקפאה</span></button>` : `
      <div class="field-grid">
        <label class="field"><span>מתאריך</span><input type="date" data-pause-start value="${now}" min="${now}"></label>
        <label class="field"><span>מספר ימים (1–30)</span><input type="number" inputmode="numeric" min="1" max="30" step="1" value="7" data-pause-days></label>
      </div>
      <label class="check"><input type="checkbox" data-pause-open><span class="check-box">${icon('check')}</span><span>עד שאבטל</span></label>
      <button type="button" class="btn secondary block press" data-action="pause-start">${icon('pause')}<span>התחלת הקפאה</span></button>`}
  </section>`;
}

/** Backup card line (Android app): the last automatic backup + share it. */
export function autoBackupHTML() {
  if (!isNative()) return '';
  const d = lastAutoBackup();
  return `<p class="backup-last" data-auto-backup>${d ? `גיבוי אוטומטי אחרון: <bdi class="num" dir="ltr">${d}</bdi>` : 'גיבוי אוטומטי: עוד לא נוצר'}</p>
    ${d ? `<button type="button" class="btn ghost block press" data-action="auto-backup-share">${icon('share')}<span>שיתוף הגיבוי האוטומטי האחרון</span></button>` : ''}`;
}

/** "חיבור ל-Health Connect" (Android app). Status is filled in asynchronously. */
export function healthCard() {
  if (!isNative()) return '';
  const hc = nativeStore().hc || {};
  const granted = hc.granted || [];
  return `<section class="card hc-card" data-hc-card>
    <div class="card-head">${icon('heart', 'head-ic')}<h2>חיבור ל-Health Connect</h2></div>
    <p class="muted small">Samsung Health ואפליקציות אחרות צריכות לשתף את הנתונים שלהן ל-Health Connect (בהגדרות של Health Connect או של האפליקציה).</p>
    <ul class="hc-types">${HC_TYPES.map((t) => `<li class="${granted.includes(t.id) ? 'on' : ''}">${icon(granted.includes(t.id) ? 'check' : 'x')}<span>${t.name}</span></li>`).join('')}</ul>
    <p class="backup-last" data-hc-sync>${lastHealthSync() ? `סנכרון אחרון: <bdi class="num" dir="ltr">${lastHealthSync()}</bdi>` : 'עוד לא בוצע סנכרון'}</p>
    <div class="btn-col">
      ${hc.connected ? `<button type="button" class="btn secondary block press" data-action="hc-sync">${icon('undo')}<span>סנכרון עכשיו</span></button>` : ''}
      <button type="button" class="btn ${hc.connected ? 'ghost' : 'primary'} block press" data-action="hc-connect">${icon('heart')}<span>${hc.connected ? 'עדכון הרשאות' : 'חיבור'}</span></button>
      <button type="button" class="link-btn press" data-action="hc-privacy">מדיניות פרטיות: הנתונים נקראים רק כדי להציג אותם באפליקציה</button>
    </div>
    <p class="muted small" data-hc-missing hidden>Health Connect לא מותקן או לא זמין בטלפון. אפשר להמשיך לרשום הכול ידנית.</p>
  </section>`;
}

/** "תזכורות" (Android app): on/off + time. */
export function remindersCard() {
  if (!isNative()) return '';
  const r = reminderSettings();
  const row = (key, label, note, time) => `<div class="rem-row">
    <label class="check grow"><input type="checkbox" data-rem="${key}" ${r[key].on ? 'checked' : ''}><span class="check-box">${icon('check')}</span>
      <span><b>${label}</b><small class="muted">${note}</small></span></label>
    ${time ? `<input type="time" class="rem-time" data-rem-time="${key}" value="${r[key].time}" aria-label="שעת ${label}">` : ''}</div>`;
  return `<section class="card rem-card">
    <div class="card-head">${icon('bell', 'head-ic')}<h2>תזכורות</h2></div>
    ${row('sleep', 'רישום שינה', 'רק אם השינה של הלילה עוד לא נרשמה', true)}
    ${row('water', 'שתייה', 'כל שעתיים 10:00–20:00, רק כשמפגרים בקצב', false)}
    ${row('summary', 'סיכום יום', 'הסיכום היומי מוכן', true)}
    ${row('backup', 'גיבוי', 'כשעבר זמן מהגיבוי האחרון', false)}
  </section>`;
}

/** Fill the Health Connect card's live status (installed? granted?). */
export async function fillHealthCard(root) {
  const el = root.querySelector('[data-hc-card]');
  if (!el) return;
  const s = await healthStatus();
  el.querySelector('[data-hc-missing]').hidden = s.available;
}

/** Change events of these cards. Returns true when handled. */
export function onCardsChange(t, ctx) {
  if (t.matches('[data-theme-mode]')) {
    updateSettings({ theme: t.value === 'auto' ? 'auto' : themeFor() });
    applyTheme();
    ctx.rerender();
    return true;
  }
  if (t.matches('[data-theme-pick]')) {
    updateSettings({ theme: t.value });
    applyTheme();
    vibrate(HAPTIC.item);
    ctx.rerender();
    return true;
  }
  if (t.matches('[data-icon-daily]')) {
    updateSettings({ iconDaily: t.checked });
    toast(t.checked ? 'האייקון יתחלף כשהאפליקציה ברקע' : 'האייקון יחזור ל״להבה״');
    return true;
  }
  if (t.matches('[data-rem]') || t.matches('[data-rem-time]')) {
    const key = t.dataset.rem || t.dataset.remTime;
    const cur = getState().settings.reminders || {};
    const patch = t.dataset.rem ? { on: t.checked } : { time: /^\d\d:\d\d$/.test(t.value) ? t.value : reminderSettings()[key].time };
    updateSettings({ reminders: { ...cur, [key]: { ...(cur[key] || {}), ...patch } } });
    if (patch.on) ensureNotificationPermission(true);
    scheduleReminders();
    toast('נשמר');
    return true;
  }
  return false;
}

/** Click actions of these cards. Returns true when handled. */
export async function onCardsClick(a, b, ctx, root) {
  switch (a) {
    case 'pause-start': {
      const start = root.querySelector('[data-pause-start]').value;
      const open = root.querySelector('[data-pause-open]').checked;
      const daysIn = root.querySelector('[data-pause-days]');
      const days = Math.round(parseNum(daysIn.value));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || start < todayKey()) { invalid(root.querySelector('[data-pause-start]'), 'תאריך לא תקין'); return true; }
      if (!open && !(days >= 1 && days <= 30)) { invalid(daysIn, 'בין 1 ל-30 ימים'); return true; }
      startPause(start, open ? null : days);
      vibrate(HAPTIC.item);
      toast('ההקפאה נשמרה');
      ctx.rerender();
      return true;
    }
    case 'pause-stop':
      endPause();
      toast('ההקפאה הסתיימה');
      ctx.rerender();
      return true;
    case 'auto-backup-share':
      if (!(await shareLatestAutoBackup())) toast('השיתוף לא הושלם');
      return true;
    case 'hc-connect': {
      const g = await connectHealth();
      if (g.length) { toast('Health Connect מחובר'); await syncHealth(); } else toast('לא ניתנה הרשאה. אפשר להמשיך ידנית.');
      ctx.rerender();
      return true;
    }
    case 'hc-sync': {
      const n = await syncHealth();
      toast(n ? `עודכנו ${n} רישומים` : 'הכול מעודכן');
      ctx.rerender();
      return true;
    }
    case 'hc-privacy':
      if (isNative()) window.location.href = './privacy.html';
      else openExternal('./privacy.html');
      return true;
    default:
      return false;
  }
}
