// Native (Android, Capacitor) bridge. The web app never loads @capacitor/core: inside the Android app the
// Capacitor runtime injects window.Capacitor, and plugins are called through it directly. On the web every
// helper here is a no-op or falls back to the existing browser behavior, so the web build is unchanged.

const cap = () => window.Capacitor;

/** True only inside the Android app. */
export const isNative = () => {
  try { return !!cap()?.isNativePlatform?.(); } catch { return false; }
};

/** Call a native plugin method. Rejects when unavailable (callers decide whether that matters). */
export function call(plugin, method, options = {}) {
  if (!isNative()) return Promise.reject(new Error('not native'));
  return cap().nativePromise(plugin, method, options);
}

/** Listen to a native plugin event; returns { remove }. */
export function on(plugin, event, cb) {
  if (!isNative()) return { remove() {} };
  return cap().addListener(plugin, event, cb);
}

/** Call and ignore any failure (missing plugin, permission denied, offline). Resolves the result or null. */
export const tryCall = (plugin, method, options) => call(plugin, method, options).catch(() => null);

/* ---------- Device-only state (never part of backups) ---------- */

const KEY = 'seventy.native';
export function nativeStore() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
export function setNativeStore(patch) {
  const next = { ...nativeStore(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  return next;
}

/* ---------- Haptics (same three presets as the web vibration) ---------- */

/** pattern: 10 (item) · 20 (target) · [array] (record / level). */
export function haptic(pattern) {
  if (Array.isArray(pattern)) return tryCall('Haptics', 'notification', { type: 'SUCCESS' });
  return tryCall('Haptics', 'impact', { style: pattern >= 20 ? 'MEDIUM' : 'LIGHT' });
}

/* ---------- Keep the screen on (plank timer, breathing) ---------- */

export const keepAwake = (on) => tryCall('KeepAwake', on ? 'keepAwake' : 'allowSleep');

/* ---------- Files: write + share sheet ---------- */

const toBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] || '');
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

/** Write a file into the app's cache and open the system share sheet for it. Resolves true when shared. */
export async function shareFile(file, title = file.name) {
  try {
    const data = await toBase64(file);
    const { uri } = await call('Filesystem', 'writeFile', { path: file.name, data, directory: 'CACHE', recursive: true });
    await call('Share', 'share', { title, files: [uri], dialogTitle: title });
    return true;
  } catch {
    return false;
  }
}

/** App-private storage (Directory.Data): write text, list a folder, delete, read. */
export const writePrivate = (path, text) => call('Filesystem', 'writeFile', { path, data: text, directory: 'DATA', encoding: 'utf8', recursive: true });
export const readPrivate = (path) => call('Filesystem', 'readFile', { path, directory: 'DATA', encoding: 'utf8' }).then((r) => r.data);
export const listPrivate = (path) => call('Filesystem', 'readdir', { path, directory: 'DATA' }).then((r) => (r.files || []).map((f) => (typeof f === 'string' ? f : f.name)));
export const deletePrivate = (path) => call('Filesystem', 'deleteFile', { path, directory: 'DATA' });

/* ---------- Camera / gallery (progress photos) ---------- */

/**
 * A photo from the camera or the gallery as a File, or null (cancelled / denied). Photos are never saved
 * to the phone's gallery; they go through the app's normal processing and private storage.
 */
export async function getPhoto(source) {
  try {
    const p = await call('Camera', 'getPhoto', {
      source: source === 'camera' ? 'CAMERA' : 'PHOTOS', resultType: 'base64', quality: 92,
      saveToGallery: false, correctOrientation: true, allowEditing: false, direction: 'FRONT',
    });
    const bytes = Uint8Array.from(atob(p.base64String), (c) => c.charCodeAt(0));
    return new File([bytes], `photo.${p.format || 'jpeg'}`, { type: `image/${p.format || 'jpeg'}` });
  } catch {
    return null;
  }
}

/* ---------- Barcode (ML Kit) ---------- */

/** Scan one barcode with ML Kit. Resolves the code, or null (cancelled / unavailable → manual entry). */
export async function scanBarcode() {
  try {
    const { available } = await call('BarcodeScanner', 'isGoogleBarcodeScannerModuleAvailable').catch(() => ({ available: true }));
    if (!available) await call('BarcodeScanner', 'installGoogleBarcodeScannerModule').catch(() => {});
    const { barcodes } = await call('BarcodeScanner', 'scan', { formats: ['EAN_13', 'EAN_8', 'UPC_A', 'UPC_E', 'CODE_128'] });
    return barcodes?.[0]?.rawValue || barcodes?.[0]?.displayValue || null;
  } catch {
    return null;
  }
}

/** Open a link in the system browser (outside the app). */
export function openExternal(url) {
  if (!isNative()) { window.open(url, '_blank', 'noopener'); return; }
  // Capacitor hands navigations to other hosts to the system (browser / download manager).
  window.location.href = url;
}
