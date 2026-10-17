// @ts-check
// Gewichtstrend. Tagesgewichte schwanken durch Wasser, Salz, Glykogen und Darminhalt
// um 1–2 kg; bewertet wird deshalb nur der geglättete Trend.

import { addDays, daysBetween, isNum, mean, median } from './util.js';

/** @typedef {{ date: string, kg: number }} WeightPoint */

/** Glättungsfaktor der exponentiellen Glättung (≈ 12-Tage-Fenster). */
export const EMA_ALPHA = 0.15;

/**
 * Exponentiell geglätteter Trend je Messpunkt.
 * @param {WeightPoint[]} series aufsteigend sortiert
 * @param {number} [alpha]
 * @returns {WeightPoint[]}
 */
export function emaTrend(series, alpha = EMA_ALPHA) {
  /** @type {WeightPoint[]} */
  const out = [];
  let t = NaN;
  for (const p of series) {
    t = isNum(t) ? t + alpha * (p.kg - t) : p.kg;
    out.push({ date: p.date, kg: t });
  }
  return out;
}

/**
 * Mittelwert der Messungen in den 7 Tagen bis einschliesslich `date`.
 * @param {WeightPoint[]} series
 * @param {string} date
 * @returns {{ kg: number, n: number } | null}
 */
export function rolling7(series, date) {
  const from = addDays(date, -6);
  const xs = series.filter((p) => p.date >= from && p.date <= date).map((p) => p.kg);
  return xs.length ? { kg: mean(xs), n: xs.length } : null;
}

/**
 * Theil-Sen-Schätzer: Median aller paarweisen Steigungen. Robust gegen Ausreisser
 * (z. B. ein Restaurantabend mit +1.5 kg Wasser am nächsten Morgen).
 * @param {{ x: number, y: number }[]} pts
 * @returns {{ slope: number, intercept: number } | null}
 */
export function theilSen(pts) {
  if (pts.length < 2) return null;
  const slopes = [];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[j].x - pts[i].x;
      if (dx !== 0) slopes.push((pts[j].y - pts[i].y) / dx);
    }
  }
  if (!slopes.length) return null;
  const slope = median(slopes);
  const intercept = median(pts.map((p) => p.y - slope * p.x));
  return { slope, intercept };
}

/**
 * Gewichtsveränderung pro Tag im Fenster bis `endDate`.
 * Liefert null, wenn zu wenige Messungen oder ein zu kurzer Zeitraum vorliegen.
 * @param {WeightPoint[]} series
 * @param {string} endDate
 * @param {{ windowDays?: number, minPoints?: number, minSpanDays?: number }} [opts]
 * @returns {{ slopeKgPerDay: number, levelKg: number, n: number, spanDays: number } | null}
 */
export function trendSlope(series, endDate, { windowDays = 21, minPoints = 7, minSpanDays = 10 } = {}) {
  const from = addDays(endDate, -(windowDays - 1));
  const win = series.filter((p) => p.date >= from && p.date <= endDate);
  if (win.length < minPoints) return null;
  const spanDays = daysBetween(win[0].date, win[win.length - 1].date);
  if (spanDays < minSpanDays) return null;
  const fit = theilSen(win.map((p) => ({ x: daysBetween(endDate, p.date), y: p.kg })));
  if (!fit) return null;
  return { slopeKgPerDay: fit.slope, levelKg: fit.intercept, n: win.length, spanDays };
}

/**
 * Datum, an dem das Ziel bei gleichbleibendem Trend erreicht wird.
 * @param {{ levelKg: number, slopeKgPerDay: number, goalKg: number, today: string }} p
 * @returns {string | null} null, wenn der Trend nicht Richtung Ziel zeigt
 */
export function projectGoalDate({ levelKg, slopeKgPerDay, goalKg, today }) {
  const diff = goalKg - levelKg;
  if (diff === 0) return today;
  if (slopeKgPerDay === 0 || Math.sign(diff) !== Math.sign(slopeKgPerDay)) return null;
  const days = Math.ceil(diff / slopeKgPerDay);
  return days > 3650 ? null : addDays(today, days);
}

/**
 * Lineare Planlinie vom Start zum Ziel.
 * @param {{ startDate: string, startKg: number, goalDate: string, goalKg: number }} plan
 * @param {string} date
 * @returns {number}
 */
export function planWeightOn(plan, date) {
  const total = daysBetween(plan.startDate, plan.goalDate);
  if (total <= 0) return plan.goalKg;
  const f = Math.min(Math.max(daysBetween(plan.startDate, date) / total, 0), 1);
  return plan.startKg + (plan.goalKg - plan.startKg) * f;
}

/**
 * Zwischenziele: Monatsenden zwischen Start und Ziel, plus Zieldatum.
 * @param {{ startDate: string, startKg: number, goalDate: string, goalKg: number }} plan
 * @returns {WeightPoint[]}
 */
export function milestones(plan) {
  /** @type {WeightPoint[]} */
  const out = [];
  let [y, m] = plan.startDate.split('-').map(Number);
  for (let guard = 0; guard < 120; guard++) {
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    if (last >= plan.goalDate) break;
    if (daysBetween(plan.startDate, last) >= 14) out.push({ date: last, kg: planWeightOn(plan, last) });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  out.push({ date: plan.goalDate, kg: plan.goalKg });
  return out;
}
