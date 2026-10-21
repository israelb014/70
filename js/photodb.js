// Progress photos: IndexedDB store "photos" ({ id, sessionDate, pose, blob, width, height, createdAt }).
// Stays on this device only — never uploaded, never part of the JSON backup.
const DB = 'seventy-photos';
const STORE = 'photos';
let dbp = null;

function open() {
  dbp ||= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const s = r.result.createObjectStore(STORE, { keyPath: 'id' });
      s.createIndex('sessionDate', 'sessionDate');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => { dbp = null; reject(r.error); };
  });
  return dbp;
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    let out;
    if (req) req.onsuccess = () => { out = req.result; };
    t.oncomplete = () => resolve(out);
    t.onerror = t.onabort = () => reject(t.error);
  });
}

export const photoId = (date, pose) => `${date}_${pose}`;
export const putPhoto = (rec) => run('readwrite', (s) => s.put(rec));
export const getPhoto = (id) => run('readonly', (s) => s.get(id));
export const allPhotos = () => run('readonly', (s) => s.getAll());
export const deletePhoto = (id) => run('readwrite', (s) => s.delete(id));
export const clearPhotos = () => run('readwrite', (s) => s.clear());
