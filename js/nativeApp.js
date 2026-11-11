// Android app lifecycle: no service worker, dark system bars, the back button, shortcuts, update check,
// daily auto-backup, Health Connect sync, reminders and the daily icon. Loaded only when isNative().
import { getState } from './storage.js';
import { on, tryCall } from './native.js';
import { checkUpdate } from './updates.js';
import { dailyAutoBackup } from './autobackup.js';
import { syncHealth } from './health.js';
import { scheduleReminders, ensureNotificationPermission } from './reminders.js';
import { switchIconOnBackground } from './appicon.js';
import { applyTheme } from './theme.js';

/** "seventy://action/water" (static app shortcuts) → "water". */
export const actionFromUrl = (url) => {
  const m = /^seventy:\/\/action\/(water|food|scan|breathe)\b/.exec(String(url || ''));
  return m ? m[1] : null;
};

/**
 * Android back: closes the top sheet / overlay, then a detail page (or screen), then switches to "היום",
 * then exits. Returns what it did ('overlay' | 'detail' | 'screen' | 'today' | 'exit').
 */
export function handleBack(ctx, screens) {
  const esc = (target) => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  if (document.querySelector('.sheet-backdrop')) { esc(document); return 'overlay'; }
  const timer = document.querySelector('.timer-overlay [data-t="cancel"]');
  if (timer) { timer.click(); return 'overlay'; }
  const breathe = document.querySelector('.breathe [data-br="end"], .breathe [data-br="close"]');
  if (breathe) { breathe.click(); return 'overlay'; }
  const celebrate = document.querySelector('.celebrate');
  if (celebrate) { celebrate.click(); return 'overlay'; }
  for (const sel of ['.scan-overlay', '.ph-viewer', '.ph-flow']) {
    const el = document.querySelector(sel);
    if (el) { esc(el); return 'overlay'; }
  }
  if (!screens[ctx.tab] && ctx.detail[ctx.tab]) { ctx.closeDetail(); return 'detail'; }
  if (screens[ctx.tab]) { ctx.goTab(ctx.prevTab || 'today'); return 'screen'; }
  if (ctx.tab !== 'today') { ctx.goTab('today'); return 'today'; }
  tryCall('App', 'exitApp');
  return 'exit';
}

let started = false;
export function initNative({ ctx, screens, runAction, rerender }) {
  if (started) return;
  started = true;
  document.documentElement.classList.add('native');
  // The web auto-update mechanism is for the browser only.
  navigator.serviceWorker?.getRegistrations?.().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
  tryCall('StatusBar', 'setStyle', { style: 'DARK' });
  tryCall('StatusBar', 'setBackgroundColor', { color: '#0B0D10' });

  on('App', 'backButton', () => handleBack(ctx, screens));
  // App shortcuts (water / food / scan / breathe) → the same actions as ?action=.
  tryCall('App', 'getLaunchUrl').then((r) => { const a = actionFromUrl(r?.url); if (a) runAction(a); });
  on('App', 'appUrlOpen', (e) => { const a = actionFromUrl(e?.url); if (a) runAction(a); });
  on('LocalNotifications', 'localNotificationActionPerformed', (e) => {
    const a = e?.notification?.extra?.action;
    if (a === 'water') runAction('water');
    else if (a === 'sleep') { ctx.goTab('today'); ctx.openDetail('sleep'); } else if (a === 'settings') ctx.goTab('settings');
    else ctx.goTab('today');
  });
  on('App', 'appStateChange', (s) => (s?.isActive ? resume() : background()));

  const resume = async () => {
    applyTheme();
    if (!getState().settings) return;
    const changed = [await checkUpdate(), (await syncHealth()) > 0];
    await dailyAutoBackup();
    await scheduleReminders();
    if (changed.some(Boolean) && !document.querySelector('.sheet-backdrop, .timer-overlay, .breathe, .scan-overlay, .ph-flow')) rerender();
  };
  const background = () => {
    scheduleReminders();
    switchIconOnBackground();
  };
  ensureNotificationPermission();
  resume();
}
