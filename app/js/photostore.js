// @ts-check
// Kleine Vorschaubilder von Mahlzeit-Fotos fürs Tagebuch. Liegen nur auf diesem Gerät in
// IndexedDB (nicht im localStorage, nicht im Backup, nie an die KI) und werden nach
// KEEP_DAYS Tagen oder mit dem Eintrag gelöscht.

const DB_NAME = 'gesundheitscockpit-fotos';
const STORE = 'thumbs';
/** Aufbewahrung der Vorschaubilder in Tagen. */
export const KEEP_DAYS = 60;
const THUMB_EDGE = 240;

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null;
/** Bereits geladene Bilder (Eintrags-ID → Objekt-URL oder null = keins vorhanden). */
const cache = new Map();

function open() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB fehlt'));
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/**
 * @template T
 * @param {IDBTransactionMode} mode
 * @param {(s: IDBObjectStore) => IDBRequest<T>} fn
 * @returns {Promise<T>}
 */
async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Verkleinertes JPEG (längste Kante 240 px, ca. 10–20 KB).
 * @param {Blob} blob
 * @returns {Promise<Blob>}
 */
export async function makeThumb(blob) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, THUMB_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Vorschau nicht erstellt'))), 'image/jpeg', 0.72),
  );
}

/**
 * Vorschaubild zu einem Eintrag speichern. Fehler (z. B. privater Modus) bleiben folgenlos.
 * @param {string} id Eintrags-ID
 * @param {Blob} photo
 * @param {string} date JJJJ-MM-TT
 * @returns {Promise<boolean>}
 */
export async function savePhoto(id, photo, date) {
  try {
    const thumb = await makeThumb(photo);
    await tx('readwrite', (s) => s.put({ blob: thumb, date }, id));
    const old = cache.get(id);
    if (old) URL.revokeObjectURL(old);
    cache.set(id, URL.createObjectURL(thumb));
    return true;
  } catch {
    return false;
  }
}

/**
 * Objekt-URL des Vorschaubilds oder null.
 * @param {string} id
 * @returns {Promise<string | null>}
 */
export async function photoUrl(id) {
  if (cache.has(id)) return cache.get(id);
  try {
    const rec = /** @type {{ blob: Blob } | undefined} */ (await tx('readonly', (s) => s.get(id)));
    const url = rec?.blob ? URL.createObjectURL(rec.blob) : null;
    cache.set(id, url);
    return url;
  } catch {
    return null;
  }
}

/**
 * Bereits geladenes Vorschaubild (ohne Warten), sonst undefined.
 * @param {string} id
 * @returns {string | null | undefined}
 */
export function cachedPhotoUrl(id) {
  return cache.get(id);
}

/**
 * Vorschaubilder ohne zugehörigen Eintrag oder älter als KEEP_DAYS löschen.
 * @param {Set<string>} keepIds
 * @param {string} oldest JJJJ-MM-TT; ältere werden gelöscht
 */
export async function prunePhotos(keepIds, oldest) {
  try {
    const db = await open();
    await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readwrite');
      const req = t.objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return;
        const id = String(c.key);
        if (!keepIds.has(id) || /** @type {{ date: string }} */ (c.value).date < oldest) {
          c.delete();
          cache.delete(id);
        }
        c.continue();
      };
      t.oncomplete = () => resolve(undefined);
      t.onerror = () => reject(t.error);
    });
  } catch {
    // ohne IndexedDB gibt es nichts aufzuräumen
  }
}
