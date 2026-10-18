// @ts-check
// Import von Garmin-Aktivitäten (CSV-Export aus Garmin Connect) und von Tageswerten aus
// Apple Health (per iPhone-Kurzbefehl in die Zwischenablage kopiert). Bewusst tolerant:
// Spaltennamen auf Englisch oder Deutsch, Komma oder Semikolon, verschiedene Zahlformate.

/**
 * CSV nach RFC 4180 lesen (Anführungszeichen, Zeilenumbrüche in Feldern). Trennzeichen
 * wird anhand der Kopfzeile erkannt.
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0)
      ? ';'
      : firstLine.includes('\t') && !firstLine.includes(',')
        ? '\t'
        : ',';
  /** @type {string[][]} */
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

/**
 * Zahl aus Texten wie «5.02», «5,02», «1,234.5», «1.234,5», «9'512», «48 bpm».
 * @param {string | undefined} raw
 * @returns {number | null}
 */
export function parseNumber(raw) {
  if (raw === undefined) return null;
  let s = String(raw)
    .trim()
    .replace(/[’'\s ]/g, '');
  const m = s.match(/-?[\d.,]+/);
  if (!m || m[0] === '--') return null;
  s = m[0];
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // Das hintere Zeichen ist das Dezimaltrennzeichen.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    // «1,234» mit genau drei Nachkommastellen ist ein Tausendertrenner, sonst Dezimalkomma.
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  }
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

/**
 * Dauer «h:mm:ss», «mm:ss» oder «45:12.3» in Minuten.
 * @param {string | undefined} raw
 * @returns {number | null}
 */
export function parseDurationMin(raw) {
  if (!raw) return null;
  const parts = raw
    .trim()
    .split(':')
    .map((p) => Number(p.replace(',', '.')));
  if (parts.some((p) => !Number.isFinite(p))) return null;
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  return null;
}

/**
 * Datum aus «2026-10-18 07:30:15», «18.10.2026 07:30», «10/18/2026 7:30 AM».
 * @param {string | undefined} raw
 * @returns {{ date: string, time: string } | null}
 */
export function parseDateTime(raw) {
  if (!raw) return null;
  const s = raw.trim();
  const time = (s.match(/(\d{1,2}):(\d{2})/) ?? []).slice(1, 3);
  const hhmm = time.length === 2 ? `${time[0].padStart(2, '0')}:${time[1]}` : '00:00';
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: hhmm };
  m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return { date: `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`, time: hhmm };
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return { date: `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`, time: hhmm };
  return null;
}

/** Spaltennamen, die Garmin je nach Sprache verwendet (Kleinschreibung, ohne Sonderzeichen). */
const COLUMNS = {
  type: ['activity type', 'aktivitätstyp', 'aktivitatstyp', 'type', 'typ'],
  date: ['date', 'datum', 'start time', 'startzeit'],
  title: ['title', 'titel', 'name'],
  distance: ['distance', 'distanz', 'strecke'],
  time: ['time', 'zeit', 'dauer', 'duration', 'moving time', 'bewegungszeit', 'elapsed time', 'gesamtzeit'],
  avgHr: ['avg hr', 'average heart rate', 'avg heart rate', 'ø herzfrequenz', 'durchschnittliche herzfrequenz', 'ø hf', 'herzfrequenz ø'],
  calories: ['calories', 'kalorien'],
};

/**
 * @param {string[]} header
 * @param {string[]} names
 */
function findCol(header, names) {
  const norm = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, ' '));
  for (const n of names) {
    const i = norm.indexOf(n);
    if (i >= 0) return i;
  }
  return -1;
}

/**
 * @typedef {{
 *   id: string, date: string, time: string, kind: 'run' | 'strength', runType?: 'z2' | 'interval' | 'long',
 *   minutes: number, km?: number, avgHr?: number, title: string,
 * }} ImportedActivity
 */

/**
 * Garmin-Connect-Aktivitätenliste lesen. Übernommen werden Läufe und Krafttraining;
 * andere Sportarten werden gezählt, aber nicht importiert.
 * @param {string} text
 * @returns {{ activities: ImportedActivity[], skipped: number, error: string | null }}
 */
export function parseGarminActivities(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { activities: [], skipped: 0, error: 'Die Datei enthält keine Aktivitäten.' };
  const header = rows[0];
  const col = Object.fromEntries(Object.entries(COLUMNS).map(([k, names]) => [k, findCol(header, names)]));
  if (col.date < 0 || col.time < 0) {
    return {
      activities: [],
      skipped: 0,
      error: 'Spalten «Datum» und «Zeit» nicht gefunden. Bitte die Aktivitätenliste aus Garmin Connect als CSV exportieren.',
    };
  }
  /** @type {ImportedActivity[]} */
  const activities = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const when = parseDateTime(r[col.date]);
    const minutes = parseDurationMin(r[col.time]);
    const type = (col.type >= 0 ? r[col.type] : '').toLowerCase();
    const title = (col.title >= 0 ? r[col.title] : '').trim();
    if (!when || minutes === null || minutes <= 0 || minutes > 600) {
      skipped++;
      continue;
    }
    const isRun = /run|lauf|jogg/.test(type) || (!type && /run|lauf|jogg/i.test(title));
    const isStrength = /strength|kraft/.test(type);
    if (!isRun && !isStrength) {
      skipped++;
      continue;
    }
    const km = col.distance >= 0 ? parseNumber(r[col.distance]) : null;
    const hr = col.avgHr >= 0 ? parseNumber(r[col.avgHr]) : null;
    const base = {
      id: `garmin-${when.date}-${when.time.replace(':', '')}`,
      date: when.date,
      time: when.time,
      minutes: Math.round(minutes),
      title,
    };
    if (isStrength) {
      activities.push({ ...base, kind: 'strength' });
      continue;
    }
    const runType = /intervall|interval|4\s?x\s?4|tempo|hiit/i.test(title) ? 'interval' : minutes >= 60 ? 'long' : 'z2';
    activities.push({
      ...base,
      kind: 'run',
      runType,
      ...(km !== null && km > 0 && km < 200 ? { km: Math.round(km * 100) / 100 } : {}),
      ...(hr !== null && hr > 40 && hr < 230 ? { avgHr: Math.round(hr) } : {}),
    });
  }
  return { activities, skipped, error: null };
}

/**
 * Bereits vorhandene Einheiten erkennen: gleiche Garmin-ID oder gleicher Tag, gleiche Art
 * und Dauer ±3 Minuten (z. B. schon von Hand erfasst).
 * @param {ImportedActivity} a
 * @param {import('./training.js').Workout[]} existing
 */
export function isDuplicate(a, existing) {
  return existing.some(
    (w) =>
      w.id === a.id ||
      (w.date === a.date && w.kind === a.kind && (w.kind !== 'run' || Math.abs(/** @type {any} */ (w).minutes - a.minutes) <= 3)),
  );
}

/**
 * Tageswerte aus dem Kurzbefehl, z. B. «cockpit;schritte=9512;ruhepuls=48;schlaf=7.4;gewicht=94.2».
 * Schlüssel deutsch oder englisch, Einheiten werden ignoriert, Schlaf in Stunden oder
 * Minuten (über 24 → Minuten).
 * @param {string} text
 * @returns {{ steps?: number, restingHr?: number, sleepH?: number, weightKg?: number } | null}
 */
export function parseHealthPaste(text) {
  if (!/cockpit|schritte|steps|ruhepuls|resting/i.test(text)) return null;
  /** @type {{ steps?: number, restingHr?: number, sleepH?: number, weightKg?: number }} */
  const out = {};
  for (const part of text.split(/[;\n|]+/)) {
    const [kRaw, ...rest] = part.split(/[=:]/);
    const k = (kRaw ?? '').trim().toLowerCase();
    const v = parseNumber(rest.join(':'));
    if (v === null) continue;
    if (/^(schritte|steps)$/.test(k) && v >= 0 && v < 100000) out.steps = Math.round(v);
    else if (/^(ruhepuls|resting|rhr|restinghr)$/.test(k) && v > 25 && v < 150) out.restingHr = Math.round(v);
    else if (/^(schlaf|sleep)$/.test(k)) {
      const h = v > 24 ? v / 60 : v;
      if (h > 0 && h <= 16) out.sleepH = Math.round(h * 4) / 4;
    } else if (/^(gewicht|weight)$/.test(k) && v > 30 && v < 300) out.weightKg = Math.round(v * 10) / 10;
  }
  return Object.keys(out).length ? out : null;
}
