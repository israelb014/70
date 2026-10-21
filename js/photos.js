// Progress photos: image processing, sessions, weights, reminder rule and the zip backup.
// Privacy: photos stay in IndexedDB on this device. Nothing here uploads, shares implicitly or writes
// to the phone gallery; summaries, insights and toasts never include a photo.
import { getState, setPhotoSessions, updateMeta } from './storage.js';
import { todayKey, addDays, parseKey } from './dates.js';
import { putPhoto, getPhoto, allPhotos, deletePhoto, clearPhotos, photoId } from './photodb.js';
import { makeZip, readZip } from './zip.js';

export const POSES = [
  { id: 'front', label: 'חזית' },
  { id: 'side', label: 'צד' },
  { id: 'back', label: 'גב' },
];
export const poseLabel = (id) => POSES.find((p) => p.id === id)?.label || id;
export const MAX_SIDE = 1600;
export const JPEG_QUALITY = 0.82;
const DAY_MS = 86400000;

/** Sessions sorted by date (oldest first). */
export const sessions = () => [...(getState().photoSessions || [])].sort((a, b) => a.date.localeCompare(b.date));
export const sessionOn = (date) => sessions().find((s) => s.date === date) || null;

/* ---------- Image processing ---------- */

/**
 * Decode → respect EXIF orientation → fit the long side into 1600 px → JPEG (q 0.82).
 * Drawing an <img> applies EXIF orientation (CSS image-orientation: from-image, the default in all
 * current browsers), so the canvas gets the upright picture.
 */
export async function processImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.style.imageOrientation = 'from-image';
    img.src = url;
    await img.decode();
    const w0 = img.naturalWidth, h0 = img.naturalHeight;
    const scale = Math.min(1, MAX_SIDE / Math.max(w0, h0));
    const width = Math.max(1, Math.round(w0 * scale)), height = Math.max(1, Math.round(h0 * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const g = canvas.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, width, height);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', JPEG_QUALITY));
    if (!blob) throw new Error('encode failed');
    return { blob, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Ask once (first saved photo) for persistent storage, so the browser doesn't evict the photos. */
async function persistOnce() {
  if (getState().meta.photoPersisted) return;
  updateMeta({ photoPersisted: true });
  try { await navigator.storage?.persist?.(); } catch { /* not supported */ }
}

/* ---------- Sessions ---------- */

function addPose(date, pose) {
  const list = sessions();
  const s = list.find((x) => x.date === date);
  if (s) { if (!s.poses.includes(pose)) s.poses = POSES.map((p) => p.id).filter((id) => id === pose || s.poses.includes(id)); }
  else list.push({ date, poses: [pose] });
  setPhotoSessions(list);
}

function removePose(date, pose) {
  const list = sessions().map((s) => (s.date === date ? { ...s, poses: s.poses.filter((p) => p !== pose) } : s))
    .filter((s) => s.poses.length);
  setPhotoSessions(list);
}

/** Save an already-processed photo for (date, pose); replaces an existing one. */
export async function savePhoto(date, pose, { blob, width, height }) {
  const rec = { id: photoId(date, pose), sessionDate: date, pose, blob, width, height, createdAt: Date.now() };
  await putPhoto(rec);
  addPose(date, pose);
  forgetUrl(rec.id);
  await persistOnce();
  return rec;
}

export const loadPhoto = (date, pose) => getPhoto(photoId(date, pose));

/** Latest earlier photo of this pose (for the alignment overlay). */
export async function previousPhoto(pose, beforeDate) {
  const s = sessions().filter((x) => x.date < beforeDate && x.poses.includes(pose)).pop();
  return s ? loadPhoto(s.date, pose) : null;
}

/** Delete one pose; returns the removed record (for undo). */
export async function deletePose(date, pose) {
  const rec = await loadPhoto(date, pose);
  await deletePhoto(photoId(date, pose));
  forgetUrl(photoId(date, pose));
  removePose(date, pose);
  return rec ? [rec] : [];
}

/** Delete a whole session; returns its records (for undo). */
export async function deleteSession(date) {
  const s = sessionOn(date);
  const recs = [];
  for (const pose of s?.poses || []) {
    const r = await loadPhoto(date, pose);
    if (r) recs.push(r);
    await deletePhoto(photoId(date, pose));
    forgetUrl(photoId(date, pose));
  }
  setPhotoSessions(sessions().filter((x) => x.date !== date));
  return recs;
}

/** Undo: put records back (and their sessions). */
export async function restoreRecords(recs) {
  for (const r of recs) {
    await putPhoto(r);
    addPose(r.sessionDate, r.pose);
  }
}

/** Move a session to another date. Returns an error message, or null. */
export async function changeSessionDate(from, to) {
  if (from === to) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(to) || to > todayKey()) return 'תאריך לא תקין';
  if (sessionOn(to)) return 'כבר יש סשן בתאריך הזה';
  const s = sessionOn(from);
  for (const pose of s?.poses || []) {
    const r = await loadPhoto(from, pose);
    if (!r) continue;
    await putPhoto({ ...r, id: photoId(to, pose), sessionDate: to });
    await deletePhoto(r.id);
    forgetUrl(r.id);
  }
  setPhotoSessions(sessions().map((x) => (x.date === from ? { ...x, date: to } : x)));
  return null;
}

export async function deleteAllPhotos() {
  for (const id of urls.keys()) forgetUrl(id);
  await clearPhotos();
}

/* ---------- Object URLs (one per photo, revoked when replaced or deleted) ---------- */

const urls = new Map(); // id → { url, createdAt }
export async function photoUrl(id) {
  const rec = await getPhoto(id);
  if (!rec) return null;
  const hit = urls.get(id);
  if (hit && hit.createdAt === rec.createdAt) return hit.url;
  if (hit) URL.revokeObjectURL(hit.url);
  const url = URL.createObjectURL(rec.blob);
  urls.set(id, { url, createdAt: rec.createdAt });
  return url;
}
function forgetUrl(id) {
  const hit = urls.get(id);
  if (hit) URL.revokeObjectURL(hit.url);
  urls.delete(id);
}

/* ---------- Weight for a session ---------- */

/** { kg, date, exact } — that day's weigh-in, or the latest one before it (exact: false); null if none. */
export function sessionWeight(date) {
  const ws = [...(getState().weights || [])].sort((a, b) => a.date.localeCompare(b.date));
  const same = ws.filter((w) => w.date === date).pop();
  if (same) return { kg: same.kg, date, exact: true };
  const before = ws.filter((w) => w.date < date).pop();
  return before ? { kg: before.kg, date: before.date, exact: false } : null;
}

export const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / DAY_MS);

/* ---------- Reminder ---------- */

/**
 * Due every N days (7 / 14 / 30, default 14) after the latest session: shown in the morning (before 12:00)
 * of the due day or any later day, until a session is added. "אחר כך" hides it for 24 h. Off in settings = never.
 */
export function photoReminder(now = new Date()) {
  const st = getState().settings || {};
  if (st.photoReminder === false) return false;
  const last = sessions().at(-1);
  if (!last) return false;
  const due = addDays(last.date, Number(st.photoInterval) || 14);
  const snooze = getState().meta.photoSnoozeUntil;
  if (snooze && Date.parse(snooze) > now.getTime()) return false;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return today >= due && now.getHours() < 12;
}

export const snoozePhotoReminder = () => updateMeta({ photoSnoozeUntil: new Date(Date.now() + DAY_MS).toISOString() });

/* ---------- Zip backup ---------- */

const fileName = (r) => `photos/${r.sessionDate}-${r.pose}.jpg`;

/** One zip with every photo + index.json. Returns a File named 70-photos-YYYY-MM-DD.zip. */
export async function buildPhotoZip() {
  const recs = (await allPhotos()).sort((a, b) => a.id.localeCompare(b.id));
  const index = {
    app: '70', kind: 'photos', exportedAt: new Date().toISOString(),
    sessions: sessions(),
    photos: recs.map((r) => ({ id: r.id, sessionDate: r.sessionDate, pose: r.pose, file: fileName(r), width: r.width, height: r.height, createdAt: r.createdAt })),
  };
  const zip = await makeZip([{ name: 'index.json', data: JSON.stringify(index, null, 2) }, ...recs.map((r) => ({ name: fileName(r), data: r.blob }))]);
  return new File([zip], `70-photos-${todayKey()}.zip`, { type: 'application/zip' });
}

export const markPhotoBackup = () => updateMeta({ lastPhotoBackupAt: new Date().toISOString() });

/** "DD.MM.YYYY" of the last photo backup, or null. */
export function lastPhotoBackupDate() {
  const t = getState().meta.lastPhotoBackupAt;
  const d = t ? new Date(t) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/**
 * Import a photos zip, merging by session date without duplicates (a photo already stored for that
 * date and pose is kept). Resolves { added, skipped } or throws with a Hebrew message.
 */
export async function importPhotoZip(file) {
  let files;
  try { files = await readZip(file); } catch { throw new Error('הקובץ אינו גיבוי תמונות תקין'); }
  let index;
  try { index = JSON.parse(new TextDecoder().decode(files.get('index.json'))); } catch { index = null; }
  if (!index || index.kind !== 'photos' || !Array.isArray(index.photos)) throw new Error('הקובץ אינו גיבוי תמונות תקין');
  let added = 0, skipped = 0;
  for (const p of index.photos) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.sessionDate) || !POSES.some((x) => x.id === p.pose) || !files.has(p.file)) continue;
    // Already on this device → keep it (a session listed without its photo, e.g. after a JSON restore, gets filled).
    if (await getPhoto(photoId(p.sessionDate, p.pose))) { skipped++; continue; }
    await putPhoto({ id: photoId(p.sessionDate, p.pose), sessionDate: p.sessionDate, pose: p.pose,
      blob: new Blob([files.get(p.file)], { type: 'image/jpeg' }), width: p.width, height: p.height, createdAt: p.createdAt || Date.now() });
    addPose(p.sessionDate, p.pose);
    added++;
  }
  if (added) await persistOnce();
  return { added, skipped };
}
