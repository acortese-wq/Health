// @ts-check
// Schutz vor Datenverlust auf dem Gerät:
// - Automatische Tages-Sicherungen (letzte 7 Tage) neben den Hauptdaten, wiederherstellbar.
// - Sicherung vor riskanten Aktionen (Import, Löschen, Beispieldaten).
// - Unlesbare Daten werden vor dem nächsten Speichern beiseitegelegt statt überschrieben.
// - Speicher voll: zuerst Sicherungen opfern, nie die Hauptdaten.
// - Entwürfe: halb ausgefüllte Felder überstehen das Beenden der App.
// Alles liegt im selben Browser-Speicher. Gegen das Löschen der Website-Daten oder einen
// Gerätewechsel schützt nur das Backup (Datei), darauf weist die App weiter hin.

import { STORAGE_KEY, sanitize } from './store.js';

export const SNAP_KEY = `${STORAGE_KEY}.sicherungen`;
export const CORRUPT_KEY = `${STORAGE_KEY}.defekt`;
export const DRAFT_KEY = `${STORAGE_KEY}.entwurf`;
const META_KEY = `${STORAGE_KEY}.sicherungen.meta`;
const MAX_SNAPSHOTS = 7;

/**
 * @typedef {{ id: string, day: string, savedAt: string, reason: string, json: string }} Snapshot
 * @typedef {Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>} Store
 */

/** @param {Store} storage @returns {Snapshot[]} */
function readSnapshots(storage) {
  try {
    const raw = storage.getItem(SNAP_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((s) => s && typeof s.json === 'string' && typeof s.day === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Hauptdaten speichern; bei vollem Speicher die Sicherungen opfern und erneut versuchen.
 * Danach (best effort) die Sicherung des Tages aktualisieren.
 * @param {string} json
 * @param {Store | undefined} storage
 * @param {string} today
 * @returns {boolean}
 */
export function saveWithBackup(json, storage, today) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, json);
  } catch {
    try {
      storage.removeItem(SNAP_KEY);
      storage.setItem(STORAGE_KEY, json);
    } catch {
      return false;
    }
  }
  // Tagesstand höchstens alle 15 Minuten aktualisieren (schont Speicher und Akku)
  try {
    const meta = storage.getItem(META_KEY) ?? '';
    const [day, at] = meta.split('|');
    if (day !== today || Date.now() - Number(at) > 15 * 60 * 1000) {
      if (snapshot(storage, json, today, 'täglich')) storage.setItem(META_KEY, `${today}|${Date.now()}`);
    }
  } catch {
    /* Sicherung ist best effort */
  }
  return true;
}

/**
 * Sicherung anlegen: «täglich» ersetzt die Sicherung desselben Tages, andere Gründe
 * (z. B. «vor Import») kommen dazu. Höchstens 7 Sicherungen, älteste fallen weg.
 * @param {Store} storage
 * @param {string} json
 * @param {string} today
 * @param {string} reason
 */
export function snapshot(storage, json, today, reason) {
  try {
    const list = readSnapshots(storage);
    const savedAt = new Date().toISOString();
    const entry = { id: `${today}-${reason}-${savedAt}`, day: today, savedAt, reason, json };
    const rest = reason === 'täglich' ? list.filter((s) => !(s.day === today && s.reason === 'täglich')) : list;
    const next = [entry, ...rest].sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1)).slice(0, MAX_SNAPSHOTS);
    // Bei knappem Speicher die ältesten Sicherungen weglassen, bis es passt
    for (let n = next.length; n >= 1; n--) {
      try {
        storage.setItem(SNAP_KEY, JSON.stringify(next.slice(0, n)));
        return true;
      } catch {
        /* kleiner versuchen */
      }
    }
    return false;
  } catch {
    // Kein Platz für Sicherungen: Hauptdaten haben Vorrang
    return false;
  }
}

/**
 * Übersicht der Sicherungen (neueste zuerst) mit Anzahl Tage und Einträge.
 * @param {Store | undefined} storage
 */
export function listSnapshots(storage) {
  if (!storage) return [];
  return readSnapshots(storage).map((s) => {
    let days = 0;
    let entries = 0;
    try {
      const st = JSON.parse(s.json);
      const d = st && typeof st.days === 'object' ? Object.values(st.days) : [];
      days = d.length;
      entries = d.reduce((a, x) => a + (Array.isArray(x?.food) ? x.food.length : 0), 0);
    } catch {
      /* unlesbar */
    }
    return { id: s.id, day: s.day, savedAt: s.savedAt, reason: s.reason, days, entries };
  });
}

/**
 * Sicherung als geprüften Zustand zurückgeben.
 * @param {Store | undefined} storage
 * @param {string} id
 */
export function restoreSnapshot(storage, id) {
  if (!storage) return null;
  const s = readSnapshots(storage).find((x) => x.id === id);
  return s ? sanitize(JSON.parse(s.json)) : null;
}

/**
 * Unlesbare Hauptdaten beiseitelegen, bevor sie überschrieben werden könnten.
 * @param {Store | undefined} storage
 * @param {string} raw
 */
export function preserveCorrupt(storage, raw) {
  if (!storage || !raw) return false;
  try {
    storage.setItem(CORRUPT_KEY, raw);
    return true;
  } catch {
    return false;
  }
}

/**
 * Entwurf (nicht gespeicherte Eingaben) sichern bzw. lesen. Gilt nur für dieselbe Seite und
 * dasselbe Datum und höchstens 12 Stunden.
 * @param {Store | undefined} storage
 * @param {{ route: string, date: string, values: Record<string, string> }} d
 */
export function saveDraft(storage, d) {
  if (!storage) return;
  try {
    if (!Object.keys(d.values).length) storage.removeItem(DRAFT_KEY);
    else storage.setItem(DRAFT_KEY, JSON.stringify({ ...d, at: Date.now() }));
  } catch {
    /* ohne Speicher kein Entwurf */
  }
}

/**
 * @param {Store | undefined} storage
 * @param {string} route
 * @param {string} date
 * @returns {Record<string, string>}
 */
export function takeDraft(storage, route, date) {
  if (!storage) return {};
  try {
    const raw = storage.getItem(DRAFT_KEY);
    if (!raw) return {};
    const d = JSON.parse(raw);
    storage.removeItem(DRAFT_KEY);
    if (d.route !== route || d.date !== date || Date.now() - Number(d.at) > 12 * 3600 * 1000) return {};
    /** @type {Record<string, string>} */
    const out = {};
    for (const [k, v] of Object.entries(d.values ?? {})) if (typeof v === 'string' && /^[\w-]+$/.test(k)) out[k] = v.slice(0, 500);
    return out;
  } catch {
    return {};
  }
}
