// @ts-check
// Datums- und Zahlenhilfen. Datumswerte sind lokale Kalendertage im Format YYYY-MM-DD.

const DAY_MS = 86_400_000;

/**
 * @param {Date} [d]
 * @returns {string}
 */
export function toISODate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Wandelt YYYY-MM-DD in eine UTC-Zeitmarke (unabhängig von Sommerzeit).
 * @param {string} iso
 * @returns {number}
 */
export function isoToUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * @param {string} iso
 * @returns {boolean}
 */
export function isISODate(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const t = isoToUTC(iso);
  return new Date(t).toISOString().slice(0, 10) === iso;
}

/**
 * @param {string} iso
 * @param {number} n
 * @returns {string}
 */
export function addDays(iso, n) {
  return new Date(isoToUTC(iso) + n * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Anzahl Tage von a bis b (b − a).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function daysBetween(a, b) {
  return Math.round((isoToUTC(b) - isoToUTC(a)) / DAY_MS);
}

/**
 * Montag der ISO-Woche, in der das Datum liegt.
 * @param {string} iso
 * @returns {string}
 */
export function weekStart(iso) {
  const dow = new Date(isoToUTC(iso)).getUTCDay(); // 0 = Sonntag
  return addDays(iso, -((dow + 6) % 7));
}

/**
 * Letzter Tag des Monats.
 * @param {string} iso
 * @returns {string}
 */
export function endOfMonth(iso) {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/**
 * "HH:MM" → Minuten seit Mitternacht.
 * @param {string} hhmm
 * @returns {number}
 */
export function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Minuten → "HH:MM" (modulo 24 h).
 * @param {number} min
 * @returns {string}
 */
export function minutesToTime(min) {
  const t = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/**
 * @param {number[]} xs
 * @returns {number}
 */
export function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

/**
 * @param {number[]} xs
 * @returns {number}
 */
export function median(xs) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Rundet auf ein Vielfaches von step.
 * @param {number} v
 * @param {number} step
 * @returns {number}
 */
export function roundTo(v, step) {
  return Math.round(v / step) * step;
}

/**
 * @param {unknown} v
 * @returns {v is number}
 */
export function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * YYYY-MM-DD → TT.MM.JJJJ
 * @param {string} iso
 * @returns {string}
 */
export function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
