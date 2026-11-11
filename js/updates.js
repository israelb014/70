// Android app updates: the latest GitHub Release of israelb014/70 (public API), checked on start and on
// resume, at most once every 6 hours. Errors and offline are ignored silently.
import { nativeStore, setNativeStore } from './native.js';

export const RELEASES_API = 'https://api.github.com/repos/israelb014/70/releases/latest';
export const RELEASES_PAGE = 'https://github.com/israelb014/70/releases/latest';
const EVERY = 6 * 3600 * 1000;

/** "3.0.1" > "3.0.0" (numeric, dot by dot). */
export function newer(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** The newer release found by the last check: { version, url } or null. */
export function pendingUpdate() {
  const u = nativeStore().update;
  return u && newer(u.version, self.APP_VERSION) ? u : null;
}

/** Check GitHub (throttled). Resolves true when the pending update changed. */
export async function checkUpdate(now = Date.now()) {
  const st = nativeStore();
  if (st.updateCheckedAt && now - st.updateCheckedAt < EVERY) return false;
  const before = JSON.stringify(pendingUpdate());
  try {
    const r = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
    if (!r.ok) return false;
    const j = await r.json();
    const version = String(j.tag_name || '').replace(/^v/, '');
    const apk = (j.assets || []).find((a) => /\.apk$/i.test(a.name))?.browser_download_url || j.html_url || RELEASES_PAGE;
    setNativeStore({ updateCheckedAt: now, update: version && newer(version, self.APP_VERSION) ? { version, url: apk } : null });
  } catch {
    return false; // offline / blocked: try again next time
  }
  return before !== JSON.stringify(pendingUpdate());
}
