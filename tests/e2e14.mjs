// v1.7.0: progress photos — flow (camera / gallery / skip, past date), processing (EXIF, resize, JPEG),
// overlay preview, compare (side / wipe, labels, weight diff), timeline + viewer (pinch), edit/delete/undo,
// reminder rules + snooze, settings, zip export/import (dedupe, share), veil, wipe-all, persist(), privacy.
import { chromium } from 'playwright';
import { autoDetail, openCard } from './nav200.mjs';
import fs from 'fs';
const BASE = process.env.BASE || 'http://127.0.0.1:8765/70/';
const SP = process.env.TEST_OUT;
const IMG = `${SP}/img`;
const b = await chromium.launch();
let fails = 0; const step = async (l, fn) => { try { await fn(); console.log('OK  ', l); } catch (e) { fails++; console.log('FAIL', l, '-', e.message.split('\n')[0]); } };
const errors = [];
const DAY = 86400000;
const key = (o = 0) => { const d = new Date(Date.now() - o * DAY); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const T = key(0), OLD = key(42);
const full = (k) => { const [y, m, d] = k.split('-').map(Number); return `${d}.${m}.${y}`; };

async function newPage({ width = 412, share = null } = {}) {
  const c = await b.newContext({ viewport: { width, height: 915 }, isMobile: true, hasTouch: true, acceptDownloads: true });
  await c.addInitScript((share) => {
    window.__persist = 0;
    try {
      Object.defineProperty(navigator, 'storage', { configurable: true, value: { ...navigator.storage, persist: async () => { window.__persist++; return true; }, persisted: async () => false, estimate: navigator.storage?.estimate?.bind(navigator.storage) } });
    } catch { /* ignore */ }
    if (share) {
      navigator.canShare = (d) => !!d?.files?.length;
      navigator.share = async (d) => { window.__shared = { name: d.files[0].name, type: d.files[0].type, size: d.files[0].size }; };
    }
  }, share);
  const p = await c.newPage();
  autoDetail(p);
  p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await p.goto(BASE);
  return { c, p };
}
const seedState = (p, extra = {}) => p.evaluate(([extra, OLD, T]) => {
  localStorage.setItem('seventy.v1', JSON.stringify({ schemaVersion: 4,
    settings: { coach: { enabled: false }, theme: 'flame', startWeight: 97, targetWeight: 85, proteinTarget: 150, stepsTarget: 10000, rideGoalKm: 45, climbsTarget: 6, floorsRegular: 6, floorsRoof: 10, sleepTarget: 8, waterTarget: 2500, ...(extra.settings || {}) },
    exercises: [], mealPresets: [], customFoods: [], foodMemory: {},
    weights: [{ date: OLD, kg: 96.2 }, { date: T, kg: 86.8 }],
    meta: { lastSeenLevel: 99, seenBadges: ['kg5', 'kg10'], lastBackupAt: new Date().toISOString(), ...(extra.meta || {}) },
    photoSessions: extra.photoSessions || [], days: {} }));
}, [extra, OLD, T]);
const state = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('seventy.v1')));
const idb = (p) => p.evaluate(async () => (await import('./js/photodb.js')).allPhotos().then((r) => r.map((x) => ({ id: x.id, w: x.width, h: x.height, type: x.blob.type, size: x.blob.size, createdAt: x.createdAt })).sort((a, b) => a.id.localeCompare(b.id))));
const pick = async (p, sel, file) => { const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click(sel)]); await fc.setFiles(`${IMG}/${file}`); };
const openPhotos = async (p) => { await p.click('[data-tab=trends]'); await p.waitForTimeout(200); await p.click('[data-tile=photos] .tile-open'); await p.waitForTimeout(300); }; // tiles: the photos tile opens the screen
const revealIfVeiled = async (p) => { if (await p.evaluate(() => document.body.classList.contains('ph-blur'))) { await p.click('.ph-veil'); await p.waitForTimeout(150); } };
const saveStep = async (p) => { await p.waitForSelector('[data-f=save]'); await p.waitForTimeout(150); await p.click('[data-f=save]'); await p.waitForTimeout(250); };
const flowDone = (p) => p.waitForSelector('.ph-flow', { state: 'detached' });

/* ======================= main page ======================= */
const { c, p } = await newPage();
await seedState(p); await p.reload();

await step('"מגמות" card opens the photos screen; empty state with illustration + exact line', async () => {
  await openPhotos(p);
  if (await p.getAttribute('#app', 'data-tab') !== 'photos') throw new Error('not opened');
  const t = (await p.textContent('.empty-state p')).trim();
  if (t !== 'עוד אין תמונות. הסשן הראשון הוא נקודת ההתחלה שלך.' || !(await p.$('.empty-state svg.empty-art'))) throw new Error(t);
  if (await p.$('[data-action=ph-compare]:not([disabled])')) throw new Error('compare enabled without sessions');
});
await step('new session: camera → preview → save (front), skip (side), gallery → save (back); tip line shown', async () => {
  await p.click('[data-action=ph-new]'); await p.waitForSelector('.ph-flow.open');
  if ((await p.textContent('.ph-tip')).trim() !== 'אותו מקום, אותה תאורה, אותו מרחק, בבוקר') throw new Error('tip');
  if ((await p.textContent('[data-f-title]')).trim() !== 'חזית') throw new Error('first pose');
  const accept = await p.$$eval('.ph-flow input[type=file]', (els) => els.map((e) => `${e.accept}|${e.getAttribute('capture') || ''}`));
  if (accept.join(',') !== 'image/*|user,image/*|') throw new Error(accept.join(','));
  await pick(p, '[data-f=cam]', 'big.jpg');
  await p.waitForSelector('[data-f=save]');
  if (await p.$('[data-f-overlay]')) throw new Error('overlay without an earlier photo');
  await saveStep(p);
  if ((await p.textContent('[data-f-title]')).trim() !== 'צד') throw new Error('second pose');
  await p.click('[data-f=skip]');
  await pick(p, '[data-f=gal]', 'small.jpg'); // date already set by the first photo → no date sheet
  await saveStep(p); await flowDone(p);
  const s = await state(p);
  if (JSON.stringify(s.photoSessions) !== JSON.stringify([{ date: T, poses: ['front', 'back'] }])) throw new Error(JSON.stringify(s.photoSessions));
  if (!(await p.textContent('#toast')).includes('הסשן נשמר')) throw new Error('toast');
});
await step('processing: long side ≤ 1600 (3000×2000 → 1600×1067), no upscaling (800×600), JPEG, smaller than the original', async () => {
  const r = await idb(p);
  const front = r.find((x) => x.id === `${T}_front`), back = r.find((x) => x.id === `${T}_back`);
  if (front.w !== 1600 || front.h !== 1067 || front.type !== 'image/jpeg') throw new Error(JSON.stringify(front));
  if (back.w !== 800 || back.h !== 600) throw new Error(JSON.stringify(back));
  if (front.size >= fs.statSync(`${IMG}/big.jpg`).size) throw new Error('not compressed');
  const q = await p.evaluate(async () => (await import('./js/photos.js')).JPEG_QUALITY);
  if (Math.abs(q - 0.82) > 0.02) throw new Error('quality ' + q);
});
await step('navigator.storage.persist() asked once (first saved photo only)', async () => {
  if (await p.evaluate(() => window.__persist) !== 1 || !(await state(p)).meta.photoPersisted) throw new Error(String(await p.evaluate(() => window.__persist)));
});
await step('gallery import with a past date (date sheet, default today) → session on that date', async () => {
  await p.click('[data-action=ph-new]'); await p.waitForSelector('.ph-flow.open');
  await pick(p, '[data-f=gal]', 'portrait.jpg');
  await p.waitForSelector('.sheet [name=date]');
  if (await p.inputValue('.sheet [name=date]') !== T) throw new Error('default not today');
  await p.fill('.sheet [name=date]', OLD); await p.click('.sheet .btn.primary');
  await saveStep(p);
  await pick(p, '[data-f=gal]', 'big.jpg'); await saveStep(p); // side, same session date, no second date sheet
  await p.click('[data-f=skip]'); await flowDone(p);
  const s = await state(p);
  if (JSON.stringify(s.photoSessions) !== JSON.stringify([{ date: OLD, poses: ['front', 'side'] }, { date: T, poses: ['front', 'back'] }])) throw new Error(JSON.stringify(s.photoSessions));
  if (await p.evaluate(() => window.__persist) !== 1) throw new Error('persist asked again');
});
await step('alignment overlay: earlier photo of the pose shown at ~30% in the preview; "צילום מחדש" re-picks', async () => {
  // replace today's front through the edit sheet → earlier OLD front exists → overlay
  await p.click(`[data-action=ph-edit][data-date="${T}"]`); await p.waitForSelector('.sheet [data-e=replace]');
  await p.click('.sheet [data-e=replace][data-pose=front]'); await p.waitForSelector('.ph-flow.open');
  await pick(p, '[data-f=cam]', 'exif6.jpg'); await p.waitForSelector('[data-f-overlay]');
  const op = await p.$eval('[data-f-overlay]', (e) => Number(getComputedStyle(e).opacity));
  if (Math.abs(op - 0.3) > 0.05) throw new Error('opacity ' + op);
  const before = await p.getAttribute('[data-f-new]', 'src');
  await pick(p, '[data-f=retake]', 'big.jpg'); await p.waitForSelector('[data-f-overlay]'); await p.waitForTimeout(200);
  if (await p.getAttribute('[data-f-new]', 'src') === before) throw new Error('retake did not replace the preview');
  await p.click('.ph-flow [data-f=close]'); await flowDone(p); // closing without saving keeps the old photo
  // side pose today has no earlier → no overlay? (OLD has side → overlay); back has none earlier → no overlay
  await p.click(`[data-action=ph-edit][data-date="${T}"]`); await p.waitForSelector('.sheet [data-e=replace]');
  await p.click('.sheet [data-e=replace][data-pose=back]'); await p.waitForSelector('.ph-flow.open');
  await pick(p, '[data-f=cam]', 'small.jpg'); await p.waitForSelector('[data-f=save]');
  if (await p.$('[data-f-overlay]')) throw new Error('overlay for a pose with no earlier photo');
  await p.click('.ph-flow [data-f=close]'); await flowDone(p);
});
await step('EXIF orientation respected: orientation-6 photo stored upright (1067×1600) with the red band on top', async () => {
  await p.click(`[data-action=ph-edit][data-date="${T}"]`); await p.waitForSelector('.sheet [data-e=replace]');
  await p.click('.sheet [data-e=replace][data-pose=front]'); await p.waitForSelector('.ph-flow.open');
  await pick(p, '[data-f=cam]', 'exif6.jpg'); await saveStep(p); await flowDone(p);
  const r = await p.evaluate(async (id) => {
    const rec = await (await import('./js/photodb.js')).getPhoto(id);
    const bmp = await createImageBitmap(rec.blob);
    const cv = new OffscreenCanvas(bmp.width, bmp.height); const g = cv.getContext('2d'); g.drawImage(bmp, 0, 0);
    const px = (x, y) => [...g.getImageData(x, y, 1, 1).data].slice(0, 3);
    return { w: rec.width, h: rec.height, top: px(rec.width / 2, 20), bottom: px(rec.width / 2, rec.height - 20), left: px(20, rec.height / 2) };
  }, `${T}_front`);
  const red = (c) => c[0] > 200 && c[1] < 60 && c[2] < 60;
  if (r.w !== 1067 || r.h !== 1600 || !red(r.top) || red(r.bottom) || red(r.left)) throw new Error(JSON.stringify(r));
});
await step('session cards: weight of that day, or the latest weigh-in before it (marked)', async () => {
  const w = await p.$$eval('.ph-session', (els) => els.map((e) => `${e.dataset.session}|${e.querySelector('[data-weight]').textContent.replace(/\s+/g, ' ').trim()}`));
  if (w.join(' / ') !== `${T}|86.8 ק״ג / ${OLD}|96.2 ק״ג`) throw new Error(w.join(' / '));
  await p.evaluate(([d]) => { const s = JSON.parse(localStorage.getItem('seventy.v1')); s.photoSessions.push({ date: d, poses: [] }); localStorage.setItem('seventy.v1', JSON.stringify(s)); }, [key(30)]);
  const r = await p.evaluate(async (d) => (await import('./js/photos.js')).sessionWeight(d), key(30));
  if (!r || r.kg !== 96.2 || r.exact || r.date !== OLD) throw new Error(JSON.stringify(r));
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('seventy.v1')); s.photoSessions = s.photoSessions.filter((x) => x.poses.length); localStorage.setItem('seventy.v1', JSON.stringify(s)); });
  await p.reload(); await p.waitForTimeout(300);
  const html = await p.evaluate(async () => { const m = await import('./js/views/photos.js'); return 1; });
});

/* ---------- Veil ---------- */
await step('veil: screen opens blurred ("הקש להצגה"), a thumbnail tap only reveals, blur returns on background', async () => {
  await p.click('[data-tab=today]'); await openPhotos(p);
  const blurred = await p.evaluate(() => document.body.classList.contains('ph-blur') && getComputedStyle(document.querySelector('.ph-session .ph-img')).filter.includes('blur'));
  if (!blurred || (await p.textContent('.ph-veil')).trim() !== 'הקש להצגה') throw new Error('not veiled');
  await p.click('.ph-session .ph-thumb'); await p.waitForTimeout(250);
  if (await p.$('.ph-viewer')) throw new Error('viewer opened while veiled');
  if (await p.evaluate(() => document.body.classList.contains('ph-blur'))) throw new Error('not revealed');
  if (await p.evaluate(() => getComputedStyle(document.querySelector('.ph-session .ph-img')).filter) !== 'none') throw new Error('still blurred');
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); delete document.visibilityState; });
  if (!(await p.evaluate(() => document.body.classList.contains('ph-blur')))) throw new Error('blur did not return on background');
  await p.click('.ph-veil'); await p.waitForTimeout(150);
});

/* ---------- Viewer ---------- */
await step('viewer: full screen, label, swipe between poses, pinch-zoom and double-tap zoom', async () => {
  await p.click(`.ph-thumb[data-date="${T}"][data-pose="front"]`); await p.waitForSelector('.ph-viewer.open');
  const bg = await p.$eval('.ph-viewer', (e) => getComputedStyle(e).backgroundColor);
  if (bg !== 'rgb(0, 0, 0)') throw new Error('bg ' + bg);
  if (!(await p.textContent('[data-v-label]')).includes('חזית')) throw new Error('label');
  const pinch = await p.evaluate(async () => {
    const st = document.querySelector('[data-v-stage]'); const r = st.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const ev = (type, id, x, y) => st.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: 'touch', isPrimary: id === 1 }));
    ev('pointerdown', 1, cx - 40, cy); ev('pointerdown', 2, cx + 40, cy);
    ev('pointermove', 1, cx - 100, cy); ev('pointermove', 2, cx + 100, cy);
    const t = document.querySelector('[data-v-img]').style.transform;
    ev('pointerup', 1, cx - 100, cy); ev('pointerup', 2, cx + 100, cy);
    return t;
  });
  const sc = Number(pinch.match(/scale\(([\d.]+)\)/)?.[1]);
  if (!(sc > 2.4 && sc < 2.6)) throw new Error('pinch ' + pinch);
  // double tap resets to 1
  await p.evaluate(() => {
    const st = document.querySelector('[data-v-stage]'); const r = st.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
    for (let i = 0; i < 2; i++) { st.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, clientX: x, clientY: y, bubbles: true })); st.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, clientX: x, clientY: y, bubbles: true })); }
  });
  if (!(await p.$eval('[data-v-img]', (e) => e.style.transform)).includes('scale(1)')) throw new Error('double tap');
  // swipe right → next pose
  await p.evaluate(() => {
    const st = document.querySelector('[data-v-stage]'); const r = st.getBoundingClientRect(); const y = r.top + r.height / 2;
    st.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 5, clientX: r.left + 60, clientY: y, bubbles: true }));
    st.dispatchEvent(new PointerEvent('pointermove', { pointerId: 5, clientX: r.left + 220, clientY: y, bubbles: true }));
    st.dispatchEvent(new PointerEvent('pointerup', { pointerId: 5, clientX: r.left + 220, clientY: y, bubbles: true }));
  });
  await p.waitForTimeout(250);
  if (!(await p.textContent('[data-v-label]')).includes('גב')) throw new Error('swipe ' + await p.textContent('[data-v-label]'));
  await p.keyboard.press('Escape'); await p.waitForSelector('.ph-viewer', { state: 'detached' });
});

/* ---------- Compare ---------- */
await step('compare: defaults first + latest, side by side with date + weight labels, diff "‎-9.4 ק״ג · 42 ימים"', async () => {
  await p.click('[data-action=ph-compare]'); await p.waitForTimeout(400);
  if (await p.inputValue('[data-cmp=a]') !== OLD || await p.inputValue('[data-cmp=b]') !== T) throw new Error('defaults');
  const diff = await p.textContent('[data-ph-diff]');
  if (diff !== '‎-9.4 ק״ג · 42 ימים') throw new Error(JSON.stringify(diff));
  const caps = await p.$$eval('.ph-side figcaption', (e) => e.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  if (caps.join(' / ') !== `לפני ${full(OLD)} · 96.2 ק״ג / אחרי ${full(T)} · 86.8 ק״ג`) throw new Error(caps.join(' / '));
  if ((await p.$$eval('.ph-side img', (e) => e.filter((x) => x.src.startsWith('blob:')).length)) !== 2) throw new Error('images');
  // the diff number keeps its sign on the left (LTR isolate)
  if ((await p.$eval('[data-ph-diff] bdi', (e) => getComputedStyle(e).direction)) !== 'ltr') throw new Error('isolate');
});
await step('compare: wipe mode — drag and arrow keys move the line, labels on both sides', async () => {
  await p.click('input[name=ph-mode][value=wipe]', { force: true }); await p.waitForSelector('[data-wipe]');
  const box = await (await p.$('[data-wipe]')).boundingBox();
  await p.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2); await p.mouse.down();
  await p.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2); await p.mouse.up();
  let x = await p.$eval('[data-wipe]', (e) => e.style.getPropertyValue('--x'));
  const x0 = parseInt(x, 10);
  if (Math.abs(x0 - 25) > 1) throw new Error('drag ' + x);
  await p.focus('[data-wipe-handle]'); await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight');
  x = await p.$eval('[data-wipe]', (e) => e.style.getPropertyValue('--x'));
  if (parseInt(x, 10) !== x0 + 10) throw new Error('keys ' + x);
  const caps = await p.$$eval('.ph-wipe-caps > span', (e) => e.map((s) => s.textContent.replace(/\s+/g, ' ').trim()));
  if (!caps[0].startsWith('לפני') || !caps[0].includes('96.2') || !caps[1].startsWith('אחרי') || !caps[1].includes('86.8')) throw new Error(caps.join(' / '));
  const clip = await p.$eval('.ph-wipe-a', (e) => getComputedStyle(e).clipPath);
  if (!clip.includes(x)) throw new Error('clip ' + clip);
});
await step('compare: pose switch (back is missing in the first session → placeholder); timeline + viewer', async () => {
  await p.click('input[name=ph-mode][value=side]', { force: true }); await p.waitForTimeout(250);
  await p.click('input[name=ph-pose][value=back]', { force: true }); await p.waitForTimeout(300);
  if (!(await p.textContent('.ph-side figure[data-side=a] .ph-none')).includes('אין תמונת גב')) throw new Error('placeholder');
  await p.click('input[name=ph-pose][value=front]', { force: true }); await p.waitForTimeout(300);
  const items = await p.$$eval('.ph-strip-item span', (e) => e.map((x) => x.textContent.trim()));
  if (items.length !== 2) throw new Error(items.join());
  await p.click('.ph-strip-item[data-i="1"]'); await p.waitForSelector('.ph-viewer.open');
  if (!(await p.textContent('[data-v-label]')).includes(full(T))) throw new Error('timeline viewer');
  await p.keyboard.press('Escape'); await p.waitForSelector('.ph-viewer', { state: 'detached' });
  await p.click('[data-action=back]'); await p.waitForTimeout(300);
});

/* ---------- Edit ---------- */
await step('edit: change the date (photos move), delete one pose + undo, delete session (confirm) + undo', async () => {
  const NEWD = key(40);
  await p.click(`[data-action=ph-edit][data-date="${OLD}"]`); await p.waitForSelector('.sheet [name=date]');
  await p.fill('.sheet [name=date]', NEWD); await p.click('.sheet .btn.primary'); await p.waitForTimeout(500);
  let s = await state(p); let r = await idb(p);
  if (!s.photoSessions.some((x) => x.date === NEWD) || s.photoSessions.some((x) => x.date === OLD) || !r.some((x) => x.id === `${NEWD}_front`) || r.some((x) => x.id.startsWith(OLD))) throw new Error('date not moved');
  // date already taken → refused
  await p.click(`[data-action=ph-edit][data-date="${NEWD}"]`); await p.waitForSelector('.sheet [name=date]');
  await p.fill('.sheet [name=date]', T); await p.click('.sheet .btn.primary'); await p.waitForTimeout(400);
  if (!(await p.textContent('#toast')).includes('כבר יש סשן בתאריך הזה')) throw new Error('duplicate date accepted');
  // delete one pose + undo
  await p.click(`[data-action=ph-edit][data-date="${NEWD}"]`); await p.waitForSelector('.sheet [data-e=del]');
  await p.click('.sheet [data-e=del][data-pose=side]'); await p.waitForTimeout(500);
  s = await state(p);
  if (JSON.stringify(s.photoSessions.find((x) => x.date === NEWD).poses) !== '["front"]') throw new Error('pose not deleted');
  await p.click('#toast .toast-action'); await p.waitForTimeout(500);
  s = await state(p); r = await idb(p);
  if (JSON.stringify(s.photoSessions.find((x) => x.date === NEWD).poses) !== '["front","side"]' || !r.some((x) => x.id === `${NEWD}_side`)) throw new Error('pose undo');
  // delete session (confirmation) + undo
  await p.click(`[data-action=ph-edit][data-date="${NEWD}"]`); await p.waitForSelector('.sheet [data-e=del-session]');
  await p.click('.sheet [data-e=del-session]'); await p.waitForSelector('.sheet-text');
  await p.click('.sheet .btn.danger'); await p.waitForTimeout(500);
  s = await state(p); r = await idb(p);
  if (s.photoSessions.some((x) => x.date === NEWD) || r.some((x) => x.id.startsWith(NEWD))) throw new Error('session not deleted');
  if (!(await p.textContent('#toast')).includes('הסשן נמחק')) throw new Error('toast');
  await p.click('#toast .toast-action'); await p.waitForTimeout(500);
  s = await state(p); r = await idb(p);
  if (!s.photoSessions.some((x) => x.date === NEWD && x.poses.length === 2) || r.filter((x) => x.id.startsWith(NEWD)).length !== 2) throw new Error('session undo');
  // put it back on OLD for the rest of the suite
  await p.click(`[data-action=ph-edit][data-date="${NEWD}"]`); await p.waitForSelector('.sheet [name=date]');
  await p.fill('.sheet [name=date]', OLD); await p.click('.sheet .btn.primary'); await p.waitForTimeout(400);
});

/* ---------- Privacy ---------- */
await step('privacy: summaries never mention photos; JSON backup has session metadata only (no image data)', async () => {
  const d = await p.evaluate(async () => (await import('./js/export.js')).dailySummary(new Date().toISOString().slice(0, 10)));
  const w = await p.evaluate(async () => (await import('./js/export.js')).weeklySummary());
  if (/תמונ|צילום|photo/i.test(d + w)) throw new Error('summary mentions photos');
  const [dl] = await Promise.all([p.waitForEvent('download'), (async () => { await p.click('[data-tab=settings]'); await p.click('[data-action=export]'); })()]);
  const txt = fs.readFileSync(await dl.path(), 'utf8');
  if (txt.length > 20000 || /data:image|blob|\/9j\//.test(txt) || !JSON.parse(txt).photoSessions?.length) throw new Error(`json backup ${txt.length}`);
});

/* ---------- Settings + zip ---------- */
await step('settings: reminder on/off and interval 7/14/30 saved; photo backup line', async () => {
  await p.click('[data-tab=settings]'); await p.waitForTimeout(200);
  if (!(await p.isChecked('[data-photo-setting=photoReminder]')) || !(await p.isChecked('input[name=photoInterval][value="14"]'))) throw new Error('defaults');
  await p.click('label.check:has([data-photo-setting=photoReminder])'); await p.waitForTimeout(150);
  await p.click('label:has(input[name=photoInterval][value="30"])'); await p.waitForTimeout(150);
  let st = (await state(p)).settings;
  if (st.photoReminder !== false || st.photoInterval !== 30) throw new Error(JSON.stringify(st));
  await p.click('label.check:has([data-photo-setting=photoReminder])'); await p.click('label:has(input[name=photoInterval][value="14"])'); await p.waitForTimeout(150);
  st = (await state(p)).settings;
  if (st.photoReminder !== true || st.photoInterval !== 14) throw new Error('back');
  if ((await p.textContent('[data-photo-backup-last]')).trim() !== 'עוד לא בוצע גיבוי תמונות') throw new Error('line');
});
let zipPath = '';
await step('zip export (download without share): 70-photos-DATE.zip with photos + index.json; "גיבוי תמונות אחרון"', async () => {
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-action=ph-backup]')]);
  if (dl.suggestedFilename() !== `70-photos-${T}.zip`) throw new Error(dl.suggestedFilename());
  zipPath = `${SP}/photos-backup.zip`; await dl.saveAs(zipPath);
  const names = await p.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const m = await (await import('./js/zip.js')).readZip(new Blob([bytes]));
    const idx = JSON.parse(new TextDecoder().decode(m.get('index.json')));
    return { files: [...m.keys()].sort(), n: idx.photos.length, sessions: idx.sessions.length, kind: idx.kind };
  }, fs.readFileSync(zipPath).toString('base64'));
  if (names.n !== 4 || names.sessions !== 2 || names.kind !== 'photos' || names.files[0] !== 'index.json' || names.files.length !== 5) throw new Error(JSON.stringify(names));
  await p.waitForTimeout(200);
  const d = new Date(); const want = `גיבוי תמונות אחרון: ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  if ((await p.textContent('[data-photo-backup-last]')).replace(/\s+/g, ' ').trim() !== want) throw new Error(await p.textContent('[data-photo-backup-last]'));
});
await step('zip import: merges by session date without duplicates (deleted session restored, others skipped)', async () => {
  await p.evaluate(async (old) => { const m = await import('./js/photos.js'); await m.deleteSession(old); }, OLD);
  await p.reload(); await p.click('[data-tab=settings]');
  await p.setInputFiles('[data-photo-file]', zipPath); await p.waitForTimeout(800);
  const t = await p.textContent('#toast');
  if (!t.includes('שוחזרו 2 תמונות') || !t.includes('2 כבר היו במכשיר')) throw new Error(t);
  const s = await state(p); const r = await idb(p);
  if (s.photoSessions.length !== 2 || r.length !== 4) throw new Error(`${s.photoSessions.length} / ${r.length}`);
  await p.setInputFiles('[data-photo-file]', zipPath); await p.waitForTimeout(800);
  if (!(await p.textContent('#toast')).includes('כל התמונות בקובץ כבר במכשיר') || (await idb(p)).length !== 4) throw new Error('duplicated');
  await p.setInputFiles('[data-photo-file]', `${IMG}/small.jpg`); await p.waitForTimeout(500);
  if (!(await p.textContent('#toast')).includes('אינו גיבוי תמונות תקין')) throw new Error('bad file accepted');
});

/* ---------- Reminder rules ---------- */
await step('reminder rule: due day / later day before 12:00, not after 12:00, not before due, snooze 24 h, off, interval', async () => {
  const r = await p.evaluate(async ([last]) => {
    const m = await import('./js/photos.js'); const S = await import('./js/storage.js');
    const st = S.getState();
    const set = (sessions, settings = {}, meta = {}) => { st.photoSessions = sessions; Object.assign(st.settings, { photoReminder: true, photoInterval: 14 }, settings); st.meta.photoSnoozeUntil = meta.snooze; };
    const at = (offsetDays, hour) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); d.setHours(hour, 0, 0, 0); return d; };
    const out = {};
    set([{ date: last, poses: ['front'] }]); // last session 14 days ago → due today
    out.dueMorning = m.photoReminder(at(0, 9)); out.dueAfternoon = m.photoReminder(at(0, 13));
    out.dayBefore = m.photoReminder(at(-1, 9)); out.later = m.photoReminder(at(3, 8));
    set([{ date: last, poses: ['front'] }], {}, { snooze: new Date(at(0, 9).getTime() + 3600e3).toISOString() });
    out.snoozed = m.photoReminder(at(0, 9));
    set([{ date: last, poses: ['front'] }], { photoReminder: false }); out.off = m.photoReminder(at(0, 9));
    set([{ date: last, poses: ['front'] }], { photoInterval: 30 }); out.i30 = m.photoReminder(at(0, 9));
    set([{ date: last, poses: ['front'] }], { photoInterval: 7 }); out.i7 = m.photoReminder(at(0, 9));
    set([]); out.none = m.photoReminder(at(0, 9));
    return out;
  }, [key(14)]);
  const want = { dueMorning: true, dueAfternoon: false, dayBefore: false, later: true, snoozed: false, off: false, i30: false, i7: true, none: false };
  if (JSON.stringify(r) !== JSON.stringify(want)) throw new Error(JSON.stringify(r));
});
await p.close(); await c.close();

/* ======================= reminder card (fixed morning clock) ======================= */
{
  const { c: c2, p: p2 } = await newPage();
  const morning = new Date(); morning.setHours(9, 0, 0, 0);
  await p2.clock.setFixedTime(morning);
  await seedState(p2, { photoSessions: [{ date: key(14), poses: ['front'] }] }); await p2.reload(); await p2.waitForTimeout(300);
  await step('"היום" reminder card at 09:00 on the due day: text + "צילום עכשיו" opens the flow; "אחר כך" hides 24 h', async () => {
    const t = (await p2.textContent('.ph-remind strong')).trim();
    if (t !== 'הגיע הזמן לתמונות התקדמות') throw new Error(t);
    await p2.click('[data-action=photo-now]'); await p2.waitForSelector('.ph-flow.open');
    if (await p2.getAttribute('#app', 'data-tab') !== 'photos') throw new Error('not on photos');
    if ((await p2.textContent('.ph-tip')).trim() !== 'אותו מקום, אותה תאורה, אותו מרחק, בבוקר') throw new Error('tip');
    await p2.click('.ph-flow [data-f=close]'); await flowDone(p2);
    await p2.click('[data-tab=today]'); await p2.waitForTimeout(200);
    await p2.click('[data-action=photo-later]'); await p2.waitForTimeout(200);
    if (await p2.$('.ph-remind')) throw new Error('still shown');
    const until = Date.parse((await state(p2)).meta.photoSnoozeUntil) - morning.getTime();
    if (Math.abs(until - DAY) > 60000) throw new Error('snooze ' + until);
  });
  await step('reminder card hidden after 12:00 and when a session was added since', async () => {
    const noon = new Date(); noon.setHours(13, 0, 0, 0);
    await p2.clock.setFixedTime(noon);
    await seedState(p2, { photoSessions: [{ date: key(14), poses: ['front'] }] }); await p2.reload(); await p2.waitForTimeout(300);
    if (await p2.$('.ph-remind')) throw new Error('shown after noon');
    await p2.clock.setFixedTime(morning);
    await seedState(p2, { photoSessions: [{ date: key(14), poses: ['front'] }, { date: key(2), poses: ['front'] }] }); await p2.reload(); await p2.waitForTimeout(300);
    if (await p2.$('.ph-remind')) throw new Error('shown though a session is recent');
  });
  await p2.close(); await c2.close();
}

/* ======================= share + wipe + layout + offline ======================= */
{
  const { c: c3, p: p3 } = await newPage({ share: true });
  await seedState(p3); await p3.reload();
  await step('photo backup via the share sheet when supported (zip file), updates the last-backup line', async () => {
    await openPhotos(p3);
    await p3.click('[data-action=ph-new]'); await p3.waitForSelector('.ph-flow.open');
    await pick(p3, '[data-f=cam]', 'small.jpg'); await saveStep(p3); await p3.click('[data-f=skip]'); await p3.click('[data-f=skip]'); await flowDone(p3);
    await revealIfVeiled(p3);
    await p3.click('[data-action=ph-backup]'); await p3.waitForTimeout(600);
    const sh = await p3.evaluate(() => window.__shared);
    if (!sh || sh.name !== `70-photos-${T}.zip` || sh.type !== 'application/zip' || !(sh.size > 1000)) throw new Error(JSON.stringify(sh));
    if (!(await p3.textContent('[data-photo-backup-last]')).includes('גיבוי תמונות אחרון:')) throw new Error('line');
  });
  for (const width of [412, 360]) {
    await step(`${width}px: photos screen, flow and compare — no horizontal overflow`, async () => {
      await p3.setViewportSize({ width, height: 915 });
      await p3.evaluate(async (old) => {
        const m = await import('./js/photos.js');
        const blob = await (await fetch('./icons/icon-512.png')).blob();
        await m.savePhoto(old, 'front', { blob, width: 512, height: 512 });
      }, OLD);
      await p3.click('[data-tab=trends]'); await openPhotos(p3); await revealIfVeiled(p3);
      const over = () => p3.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      if (await over()) throw new Error('photos');
      await p3.click('[data-action=ph-compare]'); await p3.waitForTimeout(300);
      if (await over()) throw new Error('compare');
      await p3.click('input[name=ph-mode][value=wipe]', { force: true }); await p3.waitForTimeout(300);
      if (await over()) throw new Error('wipe');
      await p3.click('[data-action=back]'); await p3.waitForTimeout(200);
      await p3.click('[data-action=ph-new]'); await p3.waitForSelector('.ph-flow.open');
      if (await over()) throw new Error('flow');
      await p3.click('.ph-flow [data-f=close]'); await flowDone(p3);
    });
  }
  await step('offline: photos screen opens and photos load from the device', async () => {
    await p3.setViewportSize({ width: 412, height: 915 });
    await p3.evaluate(() => navigator.serviceWorker.ready); await p3.reload(); await p3.waitForTimeout(400);
    await c3.setOffline(true);
    await p3.reload(); await p3.waitForTimeout(400);
    await openPhotos(p3); await revealIfVeiled(p3); await p3.waitForTimeout(400);
    const n = await p3.$$eval('.ph-session img', (e) => e.filter((x) => x.src.startsWith('blob:') && x.naturalWidth > 0).length);
    await c3.setOffline(false);
    if (n < 2) throw new Error('images ' + n);
  });
  await step('"מחיקת כל הנתונים" (double confirmation) also deletes every photo', async () => {
    if (!(await idb(p3)).length) throw new Error('no photos to delete');
    await p3.click('[data-tab=settings]'); await p3.click('[data-action=wipe]');
    await p3.click('.sheet .btn.danger'); await p3.waitForTimeout(350); await p3.click('.sheet .btn.danger'); await p3.waitForTimeout(600);
    if ((await idb(p3)).length !== 0) throw new Error('photos left');
  });
  await p3.close(); await c3.close();
}
console.log('errors:', errors.length ? errors : 'none');
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
await b.close();
