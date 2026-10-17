// @ts-check
// Energiebedarf, Zielkalorien und Protein.
// Quellen: Mifflin MD et al., Am J Clin Nutr 1990;51:241–247 (Grundumsatz);
// Hall KD et al., Lancet 2011;378:826–837 (Energiebilanz, dynamische Anpassung);
// Morton RW et al., Br J Sports Med 2018;52:376–384 (Protein);
// Jensen MD et al., AHA/ACC/TOS-Leitlinie Adipositas, Circulation 2014;129:S102–S138
// (Defizit von 500–750 kcal/Tag).

import { addDays, clamp, daysBetween, isNum, mean, roundTo } from './util.js';

/** Energiegehalt von abgebautem Körpergewebe, Näherung (überwiegend Fett). */
export const KCAL_PER_KG = 7700;

/** Untergrenze der Zufuhr ohne ärztliche Begleitung. */
export const KCAL_FLOOR = { m: 1500, f: 1200 };

/** Maximal empfohlenes Abnahmetempo in Prozent des Körpergewichts pro Woche. */
export const MAX_RATE_PCT = 1.0;

/** Grösstes empfohlenes Tagesdefizit: 750 kcal oder 25 % des Bedarfs, je nachdem, was grösser ist. */
export const MAX_DEFICIT_KCAL = 750;
export const MAX_DEFICIT_SHARE = 0.25;

/**
 * @param {number} tdee
 * @returns {number}
 */
export function maxDeficit(tdee) {
  return Math.max(MAX_DEFICIT_KCAL, tdee * MAX_DEFICIT_SHARE);
}

/** @typedef {'m' | 'f'} Sex */

export const ACTIVITY_LEVELS = [
  { id: 'sitzend', factor: 1.2, label: 'Sitzend, kaum Bewegung' },
  { id: 'leicht', factor: 1.375, label: 'Leicht aktiv (1–3 Trainings/Woche)' },
  { id: 'mittel', factor: 1.55, label: 'Mittel aktiv (3–5 Trainings/Woche)' },
  { id: 'hoch', factor: 1.725, label: 'Sehr aktiv (6–7 Trainings/Woche)' },
];

/**
 * Alter in vollendeten Jahren.
 * @param {string} birthISO
 * @param {string} onISO
 * @returns {number}
 */
export function ageOn(birthISO, onISO) {
  const [by, bm, bd] = birthISO.split('-').map(Number);
  const [y, m, d] = onISO.split('-').map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/**
 * Grundumsatz nach Mifflin-St Jeor (kcal/Tag).
 * @param {{ sex: Sex, weightKg: number, heightCm: number, age: number }} p
 * @returns {number}
 */
export function bmrMifflin({ sex, weightKg, heightCm, age }) {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'm' ? 5 : -161);
}

/**
 * @param {string} id
 * @returns {number}
 */
export function activityFactor(id) {
  return (ACTIVITY_LEVELS.find((a) => a.id === id) ?? ACTIVITY_LEVELS[2]).factor;
}

/**
 * Gesamtenergiebedarf aus der Formel (Startschätzung).
 * @param {{ sex: Sex, weightKg: number, heightCm: number, age: number, activity: string }} p
 * @returns {number}
 */
export function formulaTdee(p) {
  return bmrMifflin(p) * activityFactor(p.activity);
}

/**
 * Adaptiver Energiebedarf aus erfasster Zufuhr und Gewichtstrend:
 * Bedarf = mittlere Zufuhr − (Gewichtsänderung pro Tag × 7700 kcal).
 * Verlangt genug vollständig erfasste Tage, sonst null.
 *
 * @param {{ intakes: number[], slopeKgPerDay: number | null, minDays?: number }} p
 * @returns {{ tdee: number, days: number } | null}
 */
export function adaptiveTdee({ intakes, slopeKgPerDay, minDays = 10 }) {
  const valid = intakes.filter((k) => isNum(k) && k > 0);
  if (valid.length < minDays || !isNum(slopeKgPerDay)) return null;
  const tdee = mean(valid) - slopeKgPerDay * KCAL_PER_KG;
  // Physiologisch unplausible Ergebnisse deuten auf unvollständige Erfassung hin.
  if (tdee < 1200 || tdee > 5000) return null;
  return { tdee, days: valid.length };
}

/**
 * Zielzufuhr und Abnahmetempo bestimmen.
 *
 * @param {{
 *   sex: Sex,
 *   tdee: number,
 *   bmr: number,
 *   weightKg: number,
 *   goalWeightKg: number,
 *   today: string,
 *   goalDate: string,
 * }} p
 * @returns {{
 *   kcal: number,
 *   deficit: number,
 *   rateKgPerWeek: number,
 *   requiredRateKgPerWeek: number,
 *   maxRateKgPerWeek: number,
 *   feasible: boolean,
 *   flooredAt: number | null,
 *   belowBmr: boolean,
 *   projectedGoalDate: string | null,
 *   maintenance: boolean,
 *   goalDatePassed: boolean,
 * }}
 */
export function planTarget({ sex, tdee, bmr, weightKg, goalWeightKg, today, goalDate }) {
  const toLose = weightKg - goalWeightKg;
  const maxRate = (weightKg * MAX_RATE_PCT) / 100;
  if (toLose <= 0) {
    return {
      kcal: roundTo(tdee, 10),
      deficit: 0,
      rateKgPerWeek: 0,
      requiredRateKgPerWeek: 0,
      maxRateKgPerWeek: maxRate,
      feasible: true,
      flooredAt: null,
      belowBmr: false,
      projectedGoalDate: null,
      maintenance: true,
      goalDatePassed: today >= goalDate,
    };
  }
  const weeksLeft = Math.max(daysBetween(today, goalDate), 1) / 7;
  const required = toLose / weeksLeft;
  const deficitCap = maxDeficit(tdee);
  let rate = Math.min(required, maxRate, (deficitCap * 7) / KCAL_PER_KG);
  let kcal = tdee - (rate * KCAL_PER_KG) / 7;
  const floor = KCAL_FLOOR[sex];
  let flooredAt = null;
  if (kcal < floor) {
    kcal = floor;
    flooredAt = floor;
    rate = Math.max(((tdee - kcal) * 7) / KCAL_PER_KG, 0);
  }
  const projectedGoalDate = rate > 0 ? addDays(today, Math.ceil((toLose / rate) * 7)) : null;
  return {
    kcal: roundTo(kcal, 10),
    deficit: Math.round(tdee - kcal),
    rateKgPerWeek: rate,
    requiredRateKgPerWeek: required,
    maxRateKgPerWeek: maxRate,
    feasible: Math.abs(rate - required) < 1e-9 && flooredAt === null,
    flooredAt,
    belowBmr: kcal < bmr,
    projectedGoalDate,
    maintenance: false,
    goalDatePassed: today >= goalDate,
  };
}

/**
 * Proteinziel in g/Tag. Bei Übergewicht wird nicht das aktuelle Gewicht, sondern
 * ein Referenzgewicht verwendet (Zielgewicht, mindestens Gewicht bei BMI 25),
 * sonst wird der Bedarf überschätzt.
 *
 * @param {{ weightKg: number, goalWeightKg: number, heightCm: number, gPerKg: number }} p
 * @returns {{ grams: number, referenceKg: number, rangeLow: number, rangeHigh: number }}
 */
export function proteinTarget({ weightKg, goalWeightKg, heightCm, gPerKg }) {
  const bmi25 = 25 * (heightCm / 100) ** 2;
  const referenceKg = Math.min(weightKg, Math.max(goalWeightKg, bmi25));
  const factor = clamp(gPerKg, 1.2, 2.4);
  return {
    grams: roundTo(referenceKg * factor, 5),
    referenceKg,
    rangeLow: roundTo(referenceKg * 1.6, 5),
    rangeHigh: roundTo(referenceKg * 2.2, 5),
  };
}
