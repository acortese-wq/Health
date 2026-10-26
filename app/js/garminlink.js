// @ts-check
// Verbindung zum eigenen Garmin-Worker (siehe worker/ und docs/GARMIN.md). Adresse, Sync-Schlüssel
// und Zusatzwerte (HRV, Stress, Body Battery) liegen nur auf diesem Gerät, nicht im Backup.

const KEY = 'gesundheitscockpit.garmin';

/**
 * @typedef {{ url: string, token?: string, lastSync?: string, extras?: import('./domain/garminsync.js').GarminExtras }} GarminLink
 */

/** @returns {GarminLink | null} */
export function getLink() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return v && typeof v.url === 'string' ? v : null;
  } catch {
    return null;
  }
}

/** @param {GarminLink} link */
export function saveLink(link) {
  try {
    localStorage.setItem(KEY, JSON.stringify(link));
  } catch {
    // ohne Speicher keine dauerhafte Verbindung
  }
}

export function clearLink() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nichts zu tun
  }
}

/**
 * Adresse prüfen: nur https (lokal zum Testen auch http://localhost).
 * @param {string} raw
 * @returns {string | null}
 */
export function normalizeWorkerUrl(raw) {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname))) return null;
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * Anmeldung bei Garmin über den Worker starten (verlässt die App kurz).
 * @param {string} url
 */
export function startConnect(url) {
  saveLink({ ...(getLink() ?? {}), url });
  const back = `${location.origin}${location.pathname}`;
  location.href = `${url}/auth/start?return=${encodeURIComponent(back)}`;
}

/**
 * Nach der Rückkehr von Garmin: Sync-Schlüssel aus der Adresse übernehmen und entfernen.
 * @returns {boolean} true, wenn eine Verbindung hergestellt wurde
 */
export function takeConnectToken() {
  const m = location.hash.match(/^#garmin-connected=([A-Za-z0-9_-]{20,200})$/);
  if (!m) return false;
  const link = getLink();
  history.replaceState(null, '', `${location.pathname}${location.search}#garmin`);
  if (!link) return false;
  saveLink({ url: link.url, token: m[1] });
  return true;
}

/**
 * Werte seit `since` abholen.
 * @param {GarminLink} link
 * @param {string} since JJJJ-MM-TT
 * @param {AbortSignal} [signal]
 * @returns {Promise<Record<string, import('./domain/garminsync.js').GarminDay>>}
 */
export async function fetchGarmin(link, since, signal) {
  const res = await fetch(`${link.url}/data?since=${since}`, {
    headers: { authorization: `Bearer ${link.token}` },
    signal,
  }).catch(() => {
    throw new Error('Garmin-Worker nicht erreichbar. Internetverbindung und Adresse prüfen.');
  });
  if (res.status === 401) throw new Error('Verbindung abgelaufen. Bitte neu mit Garmin verbinden.');
  if (!res.ok) throw new Error(`Garmin-Worker meldet Fehler ${res.status}.`);
  const body = await res.json();
  return body && typeof body.days === 'object' ? body.days : {};
}

/**
 * Verbindung trennen: Daten im Worker löschen, dann lokal vergessen.
 * @param {GarminLink} link
 */
export async function disconnect(link) {
  if (link.token) await fetch(`${link.url}/me`, { method: 'DELETE', headers: { authorization: `Bearer ${link.token}` } }).catch(() => null);
  clearLink();
}
