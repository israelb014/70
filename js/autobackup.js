// Android app: an automatic safety backup once a day (first open), written to app-private storage;
// the last 7 are kept. Settings shows the date and can share the latest one.
import { getState } from './storage.js';
import { todayKey } from './dates.js';
import { nativeStore, setNativeStore, writePrivate, readPrivate, listPrivate, deletePrivate, shareFile } from './native.js';

const DIR = 'backups';
const NAME = /^70-auto-(\d{4}-\d{2}-\d{2})\.json$/;
export const KEEP = 7;

/** Write today's backup (once a day) and delete all but the newest 7. Resolves true when written. */
export async function dailyAutoBackup(today = todayKey()) {
  if (!getState().settings || nativeStore().autoBackupDate === today) return false;
  try {
    await writePrivate(`${DIR}/70-auto-${today}.json`, JSON.stringify(getState()));
    const files = (await listPrivate(DIR)).filter((n) => NAME.test(n)).sort();
    for (const f of files.slice(0, Math.max(0, files.length - KEEP))) await deletePrivate(`${DIR}/${f}`).catch(() => {});
    setNativeStore({ autoBackupDate: today });
    return true;
  } catch {
    return false;
  }
}

/** "DD.MM.YYYY" of the last automatic backup, or null. */
export function lastAutoBackup() {
  const k = nativeStore().autoBackupDate;
  if (!k) return null;
  const [y, m, d] = k.split('-');
  return `${d}.${m}.${y}`;
}

/** Share the newest automatic backup through the share sheet. */
export async function shareLatestAutoBackup() {
  try {
    const files = (await listPrivate(DIR)).filter((n) => NAME.test(n)).sort();
    if (!files.length) return false;
    const name = files.at(-1);
    const text = await readPrivate(`${DIR}/${name}`);
    return shareFile(new File([text], name.replace('auto', 'backup'), { type: 'application/json' }));
  } catch {
    return false;
  }
}
