// "אייקון משתנה כל יום" (Android app only, default off): 7 launcher activity-aliases, one per theme, exactly
// one enabled. The icon is switched at most once a day, and only when the app goes to the background —
// never while it's in use. Turning the setting off restores the default "להבה" icon (also on background).
import { getState } from './storage.js';
import { todayKey } from './dates.js';
import { themeFor } from './theme.js';
import { tryCall, isNative, nativeStore, setNativeStore } from './native.js';

export const iconDailyOn = () => getState().settings?.iconDaily === true;

/** The icon the launcher should show now: today's theme when on, "flame" when off. */
export const wantedIcon = (now = new Date()) => (iconDailyOn() ? themeFor(now) : 'flame');

/** Called when the app goes to the background. Resolves the alias switched to, or null. */
export async function switchIconOnBackground(now = new Date()) {
  if (!isNative()) return null;
  const want = wantedIcon(now);
  const st = nativeStore();
  const current = st.icon || 'flame';
  if (want === current) return null;
  // Daily switching: once a day at most. Restoring the default after turning it off: any time.
  if (iconDailyOn() && st.iconSwitchedOn === todayKey()) return null;
  const r = await tryCall('AppIcon', 'setActive', { name: want });
  if (!r) return null;
  setNativeStore({ icon: want, iconSwitchedOn: todayKey() });
  return want;
}
