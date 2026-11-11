// v1.6.0: backup reminder, home-screen shortcuts (?action=), quick step buttons.
import { chromium } from 'playwright';
import { autoDetail, openCard } from './nav200.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:8765/70/';
const b = await chromium.launch();
let fails = 0; const step = async (l, fn) => { try { await fn(); console.log('OK  ', l); } catch (e) { fails++; console.log('FAIL', l, '-', e.message.split('\n')[0]); } };
const errors = [];
const DAY = 86400000;
const key = (offset = 0) => { const d = new Date(Date.now() - offset * DAY); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

async function newPage({ width = 412, share = null } = {}) {
  const c = await b.newContext({ viewport: { width, height: 915 }, isMobile: true, hasTouch: true, acceptDownloads: true });
  if (share) await c.addInitScript((mode) => {
    navigator.canShare = (d) => !!(d && d.files && d.files.length);
    navigator.share = async (d) => {
      window.__shares = (window.__shares || 0) + 1;
      window.__shared = { name: d.files[0].name, type: d.files[0].type, text: await d.files[0].text() };
      if (mode === 'abort') throw new DOMException('cancel', 'AbortError');
    };
  }, share);
  const p = await c.newPage();
  autoDetail(p);
  p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await p.goto(BASE);
  return p;
}
// dataDays: number of days (today backwards) with steps; meta extras merged in.
const seed = (p, { dataDays = 3, meta = {}, todaySteps = 9400 } = {}) => p.evaluate(([dataDays, meta, todaySteps, keys]) => {
  const days = {};
  for (let i = 0; i < dataDays; i++) days[keys[i]] = { rest: false, steps: i === 0 ? todaySteps : 6000, climbs: [], rides: [], exercises: {}, food: [], sleep: null, water: [] };
  localStorage.setItem('seventy.v1', JSON.stringify({ schemaVersion: 4,
    settings: { coach: { enabled: false }, theme: 'flame', startWeight: 90, targetWeight: 80, proteinTarget: 150, stepsTarget: 12000, rideGoalKm: 45, climbsTarget: 6, floorsRegular: 6, floorsRoof: 10, sleepTarget: 8, waterTarget: 2500 },
    exercises: [{ id: 'e1', name: 'שכיבות סמיכה', type: 'setsReps', sets: 3, reps: 10, seconds: null, weight: null, order: 0, archived: false }],
    mealPresets: [], customFoods: [], foodMemory: {}, weights: [], meta: { lastSeenLevel: 99, seenBadges: [], ...meta }, days }));
}, [dataDays, meta, todaySteps, Array.from({ length: 10 }, (_, i) => key(i))]);
const meta = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('seventy.v1')).meta);
const banner = (p) => p.$('.backup-banner');
const ago = (days) => new Date(Date.now() - days * DAY - 60000).toISOString();

/* ---------- Backup reminder ---------- */
{
  const p = await newPage();
  autoDetail(p);
  await step('never backed up + 2 data days → no banner', async () => {
    await seed(p, { dataDays: 2 }); await p.reload();
    if (await banner(p)) throw new Error('banner shown');
  });
  await step('never backed up + 3 data days → "עוד לא גיבית את הנתונים", under the header, above the tiles, no share button without canShare', async () => {
    await seed(p, { dataDays: 3 }); await p.reload();
    const t = await p.textContent('.backup-banner');
    if (!t.includes('עוד לא גיבית את הנתונים')) throw new Error(t);
    // Tiles: header (date + chips) first, then the banners, then the grid.
    const first = await p.evaluate(() => !!document.querySelector('#app > .dash-rings + .backup-banner')
      && document.querySelector('.backup-banner').compareDocumentPosition(document.querySelector('.tile-grid')) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (!first) throw new Error('not at the top');
    if (await p.$('[data-action="backup-share"]')) throw new Error('share shown without canShare');
  });
  await step('last backup 6 days ago → no banner; 7 days → "עברו 7 ימים מהגיבוי האחרון"; 12 days', async () => {
    await seed(p, { meta: { lastBackupAt: ago(6) } }); await p.reload();
    if (await banner(p)) throw new Error('shown at 6 days');
    await seed(p, { meta: { lastBackupAt: ago(7) } }); await p.reload();
    let t = (await p.textContent('.backup-banner strong')).trim();
    if (t !== 'עברו 7 ימים מהגיבוי האחרון') throw new Error(t);
    await seed(p, { dataDays: 1, meta: { lastBackupAt: ago(12) } }); await p.reload();
    t = (await p.textContent('.backup-banner strong')).trim();
    if (t !== 'עברו 12 ימים מהגיבוי האחרון') throw new Error(t);
  });
  await step('singular wording: "עבר יום אחד מהגיבוי האחרון"', async () => {
    const t = await p.evaluate(async () => (await import('./js/hebrew.js')).plural(1, 'יום אחד', 'ימים'));
    if (t !== 'יום אחד') throw new Error(t);
    const src = await (await fetch(BASE + 'js/views/today.js')).text();
    if (!src.includes("days === 1 ? 'עבר' : 'עברו'")) throw new Error('no singular verb');
  });
  await step('"אחר כך" hides for 24 h (backupSnoozeUntil), survives reload, returns after expiry', async () => {
    await seed(p, { meta: { lastBackupAt: ago(9) } }); await p.reload();
    await p.click('[data-action="backup-later"]'); await p.waitForTimeout(200);
    if (await banner(p)) throw new Error('still shown');
    const m = await meta(p);
    const dt = Date.parse(m.backupSnoozeUntil) - Date.now();
    if (Math.abs(dt - DAY) > 60000) throw new Error(`snooze ${dt}`);
    await p.reload();
    if (await banner(p)) throw new Error('shown after reload');
    await p.evaluate((past) => { const s = JSON.parse(localStorage.getItem('seventy.v1')); s.meta.backupSnoozeUntil = past; localStorage.setItem('seventy.v1', JSON.stringify(s)); }, new Date(Date.now() - 1000).toISOString());
    await p.reload();
    if (!(await banner(p))) throw new Error('not back after expiry');
  });
  await step('"גיבוי עכשיו" downloads the backup, updates lastBackupAt, hides the banner, toast', async () => {
    await seed(p, { meta: { lastBackupAt: ago(8) } }); await p.reload();
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-action="backup-now"]')]);
    if (!/^70-backup-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename())) throw new Error(dl.suggestedFilename());
    const data = JSON.parse(await (await import('fs')).promises.readFile(await dl.path(), 'utf8'));
    const m = await meta(p);
    if (Date.now() - Date.parse(m.lastBackupAt) > 10000) throw new Error('lastBackupAt not updated');
    if (data.meta.lastBackupAt !== m.lastBackupAt || data.schemaVersion !== 4) throw new Error('file differs from state');
    await p.waitForTimeout(150);
    if (await banner(p)) throw new Error('banner still shown');
    if (!(await p.textContent('#toast')).includes('קובץ הגיבוי נוצר')) throw new Error('no toast');
  });
  await step('Settings: "עוד לא בוצע גיבוי" → export → "גיבוי אחרון: DD.MM.YYYY"', async () => {
    await seed(p, { dataDays: 1 }); await p.reload();
    await p.click('[data-tab="settings"]');
    let t = (await p.textContent('[data-backup-last]')).trim();
    if (t !== 'עוד לא בוצע גיבוי') throw new Error(t);
    await Promise.all([p.waitForEvent('download'), p.click('[data-action="export"]')]);
    await p.waitForTimeout(150);
    t = (await p.textContent('[data-backup-last]')).replace(/\s+/g, ' ').trim();
    const d = new Date(); const want = `גיבוי אחרון: ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
    if (t !== want) throw new Error(`${t} ≠ ${want}`);
    if (await p.$('[data-action="share-backup"]')) throw new Error('share shown without canShare');
  });
  await step('backup round-trip keeps lastBackupAt (import of the exported file)', async () => {
    const m = await meta(p);
    if (!m.lastBackupAt) throw new Error('missing');
    await p.reload();
    if ((await meta(p)).lastBackupAt !== m.lastBackupAt) throw new Error('lost on reload/normalize');
  });
}
{
  const p = await newPage({ share: 'ok' });
  await step('share (mocked): banner "שיתוף הקובץ" shares the JSON file, updates lastBackupAt, hides banner', async () => {
    await seed(p, { meta: { lastBackupAt: ago(10) } }); await p.reload();
    await p.click('[data-action="backup-share"]'); await p.waitForTimeout(200);
    const s = await p.evaluate(() => window.__shared);
    if (!/^70-backup-.*\.json$/.test(s.name) || s.type !== 'application/json' || JSON.parse(s.text).schemaVersion !== 4) throw new Error(JSON.stringify(s).slice(0, 80));
    const m = await meta(p);
    if (Date.now() - Date.parse(m.lastBackupAt) > 10000) throw new Error('not updated');
    if (await banner(p)) throw new Error('banner still shown');
  });
  await step('share (mocked) from Settings updates the "גיבוי אחרון" line', async () => {
    await seed(p, { dataDays: 1 }); await p.reload();
    await p.click('[data-tab="settings"]');
    await p.click('[data-action="share-backup"]'); await p.waitForTimeout(200);
    if (!(await p.textContent('[data-backup-last]')).includes('גיבוי אחרון:')) throw new Error('line not updated');
  });
}
{
  const p = await newPage({ share: 'abort' });
  await step('share cancelled → lastBackupAt unchanged, banner stays', async () => {
    const before = ago(10);
    await seed(p, { meta: { lastBackupAt: before } }); await p.reload();
    await p.click('[data-action="backup-share"]'); await p.waitForTimeout(200);
    if ((await meta(p)).lastBackupAt !== before) throw new Error('changed');
    if (!(await banner(p))) throw new Error('banner hidden');
  });
}

/* ---------- Shortcuts ---------- */
{
  const p = await newPage();
  autoDetail(p);
  await seed(p, { dataDays: 1 });
  const at = (a) => p.goto(BASE + (a === null ? '' : `?action=${a}`));
  await step('?action=water → "היום", the "נוזלים" detail page with the water card in view, URL cleaned', async () => {
    await at('water'); await p.waitForTimeout(80);
    if (await p.getAttribute('#app', 'data-detail') !== 'fluids') throw new Error('not the fluids page');
    await p.waitForTimeout(700);
    const inView = await p.evaluate(() => { const r = document.querySelector('.water-card').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
    if (!inView) throw new Error('not scrolled into view');
    if (p.url().includes('action')) throw new Error(p.url());
    if (await p.getAttribute('#app', 'data-tab') !== 'today') throw new Error('tab');
  });
  await step('?action=food → "אוכל", search field focused, URL cleaned', async () => {
    await at('food'); await p.waitForTimeout(150);
    if (await p.getAttribute('#app', 'data-tab') !== 'food') throw new Error('tab');
    if (!(await p.evaluate(() => document.activeElement?.matches('[data-search]')))) throw new Error('not focused');
    if (p.url().includes('action')) throw new Error(p.url());
  });
  await step('?action=scan → "אוכל" + barcode scanner open, URL cleaned', async () => {
    await at('scan'); await p.waitForSelector('.scan-overlay', { timeout: 3000 });
    if (await p.getAttribute('#app', 'data-tab') !== 'food') throw new Error('tab');
    if (p.url().includes('action')) throw new Error(p.url());
    await p.click('.scan-overlay [data-s="close"]');
  });
  await step('unknown / missing action → normal start on "היום", URL cleaned', async () => {
    await at('bogus'); await p.waitForTimeout(100);
    if (await p.getAttribute('#app', 'data-tab') !== 'today' || p.url().includes('action')) throw new Error(p.url());
    if (await p.$('.water-card.pulse, .scan-overlay')) throw new Error('acted');
    await at(null); await p.waitForTimeout(100);
    if (await p.getAttribute('#app', 'data-tab') !== 'today') throw new Error('tab');
  });
  await step('app already open on another tab: shortcut navigation still lands in the right place', async () => {
    await p.click('[data-tab="trends"]'); await p.waitForTimeout(100);
    await at('water'); await p.waitForTimeout(80);
    if (await p.getAttribute('#app', 'data-tab') !== 'today' || await p.getAttribute('#app', 'data-detail') !== 'fluids' || !(await p.$('.water-card'))) throw new Error('water');
  });
  await step('manifest: 3 Hebrew shortcuts with 96×96 PNG icons, cached by the service worker', async () => {
    const m = await (await fetch(BASE + 'manifest.json')).json();
    const want = [['הוספת מים', './?action=water'], ['הוספת אוכל', './?action=food'], ['סריקת ברקוד', './?action=scan']];
    want.forEach(([n, u], i) => { const s = m.shortcuts[i]; if (s.name !== n || s.url !== u || s.icons[0].sizes !== '96x96') throw new Error(JSON.stringify(s)); });
    for (const s of m.shortcuts) {
      const r = await fetch(BASE + s.icons[0].src); const buf = Buffer.from(await r.arrayBuffer());
      if (!r.ok || buf.readUInt32BE(16) !== 96 || buf.readUInt32BE(20) !== 96) throw new Error(s.icons[0].src);
    }
    const sw = await (await fetch(BASE + 'sw.js')).text();
    for (const k of ['water', 'food', 'scan']) if (!sw.includes(`./icons/shortcut-${k}.png`)) throw new Error('not cached ' + k);
  });
}

/* ---------- Quick step buttons ---------- */
for (const width of [412, 360]) {
  const p = await newPage({ width });
  await step(`${width}px: +1,000 on today → 10,400, ring updates, undo restores 9,400`, async () => {
    await seed(p, { dataDays: 2, meta: { lastBackupAt: ago(1) } }); await p.reload();
    await openCard(p, 'steps');
    const labels = await p.$$eval('[data-action="steps-add"]', (els) => els.map((e) => e.textContent));
    if (labels.join('|') !== '‎+1,000|‎+5,000') throw new Error(JSON.stringify(labels));
    await p.click('[data-action="steps-add"][data-n="1000"]'); await p.waitForTimeout(150);
    if (await p.inputValue('[data-change="steps"]') !== '10400') throw new Error(await p.inputValue('[data-change="steps"]'));
    const frac = await p.getAttribute('.role-steps .ring-fill', 'data-frac');
    if (Math.abs(+frac - 10400 / 12000) > 1e-6) throw new Error('ring ' + frac);
    if (!(await p.textContent('#toast')).includes('נוספו 1,000 צעדים')) throw new Error('toast');
    await p.click('#toast .toast-action'); await p.waitForTimeout(150);
    if (await p.inputValue('[data-change="steps"]') !== '9400') throw new Error('undo ' + await p.inputValue('[data-change="steps"]'));
  });
  await step(`${width}px: +5,000 crossing the goal → "יעד הצעדים הושג"; typing still works`, async () => {
    await p.click('[data-action="steps-add"][data-n="5000"]'); await p.waitForTimeout(150);
    if (!(await p.textContent('#toast')).includes('יעד הצעדים הושג')) throw new Error('toast');
    await p.fill('[data-change="steps"]', '7777'); await p.press('[data-change="steps"]', 'Enter'); await p.waitForTimeout(150);
    const steps = await p.evaluate((k) => JSON.parse(localStorage.getItem('seventy.v1')).days[k].steps, key(0));
    if (steps !== 7777) throw new Error(steps);
  });
  await step(`${width}px: past day without steps: +5,000 → 5,000, undo → empty; today untouched`, async () => {
    await p.click('[data-action="date-prev"]'); await p.click('[data-action="date-prev"]'); await p.waitForTimeout(100);
    if (await p.inputValue('[data-change="steps"]') !== '') throw new Error('not empty');
    await p.click('[data-action="steps-add"][data-n="5000"]'); await p.waitForTimeout(150);
    const k2 = key(2);
    let s = await p.evaluate((k) => JSON.parse(localStorage.getItem('seventy.v1')).days[k].steps, k2);
    if (s !== 5000) throw new Error(s);
    await p.click('#toast .toast-action'); await p.waitForTimeout(150);
    s = await p.evaluate((k) => JSON.parse(localStorage.getItem('seventy.v1')).days[k].steps, k2);
    if (s !== null || (await p.inputValue('[data-change="steps"]')) !== '') throw new Error('undo ' + s);
    const t = await p.evaluate((k) => JSON.parse(localStorage.getItem('seventy.v1')).days[k].steps, key(0));
    if (t !== 7777) throw new Error('today changed ' + t);
  });
  await step(`${width}px: no overflow / no wrapping (banner + steps buttons)`, async () => {
    await seed(p, { dataDays: 3, meta: { lastBackupAt: ago(12) } }); await p.reload();
    await p.evaluate(() => { navigator.canShare = () => true; }); await p.click('[data-tab="settings"]'); await p.click('[data-tab="today"]');
    const r = await p.evaluate(() => {
      const one = (el) => { const cs = getComputedStyle(el); return el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().height <= parseFloat(cs.lineHeight) * 1.6 + parseFloat(cs.paddingTop) * 2 + 30; };
      const els = [...document.querySelectorAll('.bb-actions .btn, .bb-later, .chip-btn, .bb-text strong, .bb-sub span')];
      return { over: document.documentElement.scrollWidth > innerWidth, share: !!document.querySelector('[data-action="backup-share"]'),
        bad: els.filter((e) => !one(e) || (e.matches('.btn, .bb-later, .chip-btn') && e.getClientRects().length && e.getBoundingClientRect().height > 56)).map((e) => e.textContent.trim()),
        strongLines: Math.round(document.querySelector('.bb-text strong').getBoundingClientRect().height / parseFloat(getComputedStyle(document.querySelector('.bb-text strong')).lineHeight)) };
    });
    if (r.over || r.bad.length || !r.share || r.strongLines > 1) throw new Error(JSON.stringify(r));
  });
}
console.log('errors:', errors.length ? errors : 'none');
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
await b.close();
