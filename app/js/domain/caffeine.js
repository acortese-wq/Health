// @ts-check
// Koffein. Quellen: EFSA NDA Panel, EFSA Journal 2015;13(5):4102 (≤ 400 mg/Tag, ≤ 200 mg
// Einzeldosis); Drake C et al., J Clin Sleep Med 2013;9:1195–1200 (400 mg 6 h vor dem
// Schlafen verkürzt den Schlaf messbar); Gardiner C et al., Sleep Med Rev 2023;69:101764
// (Metaanalyse: ~100 mg Kaffee mindestens ~8.8 h vor dem Zubettgehen).
// Halbwertszeit typischerweise 3–7 h, individuell sehr variabel.

import { addDays, timeToMinutes, minutesToTime } from './util.js';

export const CAFFEINE_MAX_DAY_MG = 400;
export const CAFFEINE_MAX_SINGLE_MG = 200;

/** @typedef {{ time: string, mg: number }} Dose */

/**
 * Schlafenszeit in Minuten nach Mitternacht des Konsumtags. Zeiten vor 12:00 gelten
 * als nach Mitternacht (z. B. 00:30 → 1470).
 * @param {string} bedtime
 * @returns {number}
 */
export function bedtimeMinutes(bedtime) {
  const m = timeToMinutes(bedtime);
  return m < 12 * 60 ? m + 1440 : m;
}

/**
 * Geschätzte Koffeinmenge im Körper zum Zeitpunkt `atMin` (Einkompartiment-Modell,
 * vollständige Aufnahme angenommen).
 * @param {Dose[]} doses
 * @param {number} atMin Minuten seit Mitternacht des Konsumtags
 * @param {number} halfLifeH
 * @returns {number}
 */
export function residualMg(doses, atMin, halfLifeH) {
  const k = Math.LN2 / (halfLifeH * 60);
  let sum = 0;
  for (const d of doses) {
    const dt = atMin - timeToMinutes(d.time);
    if (dt >= 0) sum += d.mg * Math.exp(-k * dt);
  }
  return sum;
}

/**
 * Letzte empfohlene Uhrzeit für Koffein.
 * @param {string} bedtime
 * @param {number} cutoffH
 * @returns {string}
 */
export function cutoffTime(bedtime, cutoffH) {
  return minutesToTime(bedtimeMinutes(bedtime) - cutoffH * 60);
}

/**
 * @param {string} time
 * @param {string} bedtime
 * @param {number} cutoffH
 * @returns {boolean}
 */
export function isAfterCutoff(time, bedtime, cutoffH) {
  return timeToMinutes(time) > bedtimeMinutes(bedtime) - cutoffH * 60;
}

/**
 * Tagesbewertung.
 * @param {Dose[]} doses
 * @param {{ bedtime: string, cutoffH: number, halfLifeH: number, maxMg?: number }} cfg
 */
export function dayAssessment(doses, { bedtime, cutoffH, halfLifeH, maxMg = CAFFEINE_MAX_DAY_MG }) {
  const total = doses.reduce((a, d) => a + d.mg, 0);
  const late = doses.filter((d) => isAfterCutoff(d.time, bedtime, cutoffH));
  return {
    total,
    overMax: total > maxMg,
    largeSingle: doses.some((d) => d.mg > CAFFEINE_MAX_SINGLE_MG),
    late,
    atBedtime: residualMg(doses, bedtimeMinutes(bedtime), halfLifeH),
    cutoff: cutoffTime(bedtime, cutoffH),
  };
}

/**
 * Ausschleichplan: pro Woche eine Tasse weniger, bis zum Ziel.
 * @param {{ startDate: string, startCups: number, targetCups: number, stepPerWeek?: number }} p
 * @returns {{ from: string, to: string, cups: number }[]}
 */
export function taperPlan({ startDate, startCups, targetCups, stepPerWeek = 1 }) {
  const out = [];
  let cups = startCups;
  let from = startDate;
  for (let guard = 0; guard < 52; guard++) {
    cups = Math.max(targetCups, cups - stepPerWeek);
    out.push({ from, to: addDays(from, 6), cups });
    if (cups <= targetCups) break;
    from = addDays(from, 7);
  }
  return out;
}

/**
 * Erlaubte Tassen am Datum gemäss Plan (null ausserhalb).
 * @param {{ from: string, to: string, cups: number }[]} plan
 * @param {string} date
 * @returns {number | null}
 */
export function allowedCups(plan, date) {
  if (!plan.length || date < plan[0].from) return null;
  const hit = plan.find((w) => date >= w.from && date <= w.to);
  return hit ? hit.cups : plan[plan.length - 1].cups;
}
