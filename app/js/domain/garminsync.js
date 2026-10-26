// @ts-check
// Garmin-Daten vom eigenen Worker in den App-Zustand übernehmen (rein, ohne Netzwerk).
// Regeln: Geräte-Werte (Schritte, Ruhepuls, Schlaf) kommen von Garmin und ersetzen ältere
// Werte desselben Tages; Gewicht wird nie überschrieben. Aktivitäten: Läufe und Krafttraining
// werden übernommen, sofern nicht schon vorhanden. VO₂max nur, wenn sich der Wert ändert.
// HRV, Stress und Body Battery stehen nicht im Zustand (und damit nicht im Backup), sondern in
// einem Zwischenspeicher auf dem Gerät.

import { isDuplicate } from './importers.js';

/**
 * @typedef {{ steps?: number, restingHr?: number, sleepH?: number, hrvMs?: number, stress?: number,
 *   bodyBatteryHigh?: number, bodyBatteryLow?: number, vo2max?: number,
 *   activities?: { id: string, date: string, time: string, type: string, minutes: number, km?: number, avgHr?: number, title: string }[] }} GarminDay
 * @typedef {Record<string, { hrvMs?: number, stress?: number, bodyBatteryHigh?: number, bodyBatteryLow?: number }>} GarminExtras
 */

/** @param {unknown} v @param {number} lo @param {number} hi */
const ok = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

/**
 * Garmin-Aktivitätsart → Training der App (andere Sportarten werden nicht übernommen).
 * @param {{ type: string, title: string, minutes: number }} a
 * @returns {{ kind: 'run', runType: 'z2' | 'interval' | 'long' } | { kind: 'strength' } | null}
 */
export function mapActivity(a) {
  if (/running|run|lauf/.test(a.type)) {
    const runType = /intervall|interval|4\s?x\s?4|tempo|hiit/i.test(a.title) ? 'interval' : a.minutes >= 60 ? 'long' : 'z2';
    return { kind: 'run', runType };
  }
  if (/strength|kraft/.test(a.type)) return { kind: 'strength' };
  return null;
}

/**
 * Daten übernehmen. Verändert `state` und gibt zurück, was neu ist.
 * @param {import('../store.js').State} state
 * @param {Record<string, GarminDay>} days
 * @param {string} today
 * @returns {{ days: number, workouts: number, vo2: number, extras: GarminExtras }}
 */
export function mergeGarmin(state, days, today) {
  let dayCount = 0;
  let workouts = 0;
  let vo2 = 0;
  /** @type {GarminExtras} */
  const extras = {};
  for (const [date, g] of Object.entries(days ?? {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today || !g || typeof g !== 'object') continue;
    const cur = { ...(state.days[date] ?? {}) };
    let changed = false;
    if (ok(g.steps, 0, 100000) && cur.steps !== g.steps) {
      cur.steps = Math.round(/** @type {number} */ (g.steps));
      changed = true;
    }
    if (ok(g.restingHr, 25, 150) && cur.restingHr !== g.restingHr) {
      cur.restingHr = Math.round(/** @type {number} */ (g.restingHr));
      changed = true;
    }
    if (ok(g.sleepH, 0.25, 16) && cur.sleepH !== g.sleepH) {
      cur.sleepH = /** @type {number} */ (g.sleepH);
      changed = true;
    }
    if (changed) {
      state.days[date] = cur;
      dayCount++;
    }
    /** @type {GarminExtras[string]} */
    const x = {};
    if (ok(g.hrvMs, 1, 300)) x.hrvMs = g.hrvMs;
    if (ok(g.stress, 0, 100)) x.stress = g.stress;
    if (ok(g.bodyBatteryHigh, 0, 100)) x.bodyBatteryHigh = g.bodyBatteryHigh;
    if (ok(g.bodyBatteryLow, 0, 100)) x.bodyBatteryLow = g.bodyBatteryLow;
    if (Object.keys(x).length) extras[date] = x;
    if (ok(g.vo2max, 10, 90)) {
      const latest = [...state.vo2max]
        .filter((v) => v.date <= date)
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .pop();
      if (!latest || (latest.value !== g.vo2max && !state.vo2max.some((v) => v.date === date))) {
        state.vo2max = [...state.vo2max, { id: `garmin-vo2-${date}`, date, value: Math.round(/** @type {number} */ (g.vo2max)) }];
        vo2++;
      }
    }
    for (const a of Array.isArray(g.activities) ? g.activities : []) {
      if (!a || typeof a.id !== 'string' || !ok(a.minutes, 1, 600) || !/^\d{4}-\d{2}-\d{2}$/.test(a.date)) continue;
      const m = mapActivity(a);
      if (!m) continue;
      /** @type {import('./importers.js').ImportedActivity} */
      const imp =
        m.kind === 'run'
          ? {
              id: a.id,
              date: a.date,
              time: a.time,
              kind: 'run',
              runType: m.runType,
              minutes: Math.round(a.minutes),
              title: a.title,
              ...(ok(a.km, 0.01, 200) ? { km: a.km } : {}),
              ...(ok(a.avgHr, 40, 230) ? { avgHr: a.avgHr } : {}),
            }
          : { id: a.id, date: a.date, time: a.time, kind: 'strength', minutes: Math.round(a.minutes), title: a.title };
      if (isDuplicate(imp, state.workouts)) continue;
      state.workouts = [
        ...state.workouts,
        imp.kind === 'run'
          ? {
              id: imp.id,
              date: imp.date,
              kind: 'run',
              runType: /** @type {'z2' | 'interval' | 'long'} */ (imp.runType),
              minutes: imp.minutes,
              ...(imp.km ? { km: imp.km } : {}),
              ...(imp.avgHr ? { avgHr: imp.avgHr } : {}),
              note: imp.title || 'Garmin',
            }
          : { id: imp.id, date: imp.date, kind: 'strength', template: 'Garmin', sets: [], note: imp.title || 'Garmin' },
      ];
      workouts++;
    }
  }
  return { days: dayCount, workouts, vo2, extras };
}
