// @ts-check
// Tageswerte über einen Zeitraum für Verlaufsdiagramme. Fehlende Tage bleiben null (Lücke),
// sie werden weder als 0 gezählt noch überbrückt.

import { addDays, daysBetween, isNum, mean } from './util.js';

/**
 * @typedef {'kcal' | 'protein' | 'steps' | 'sleep' | 'water' | 'training'} MetricId
 * @typedef {{ date: string, value: number | null, partial: boolean }} DayPoint
 */

/** @type {{ id: MetricId, label: string, unit: string, digits: 0 | 1 }[]} */
export const METRICS = [
  { id: 'kcal', label: 'Kalorien', unit: 'kcal', digits: 0 },
  { id: 'protein', label: 'Protein', unit: 'g', digits: 0 },
  { id: 'steps', label: 'Schritte', unit: '', digits: 0 },
  { id: 'sleep', label: 'Schlaf', unit: 'h', digits: 1 },
  { id: 'water', label: 'Wasser', unit: 'l', digits: 1 },
  { id: 'training', label: 'Training', unit: 'min', digits: 0 },
];

/**
 * Wert eines Tages. partial = Ernährungstag nicht als vollständig markiert (vorläufig).
 * Training: Laufminuten plus 45 min je Krafteinheit; ein Tag ohne Training ist 0, keine Lücke.
 * @param {import('../store.js').State} state
 * @param {MetricId} metric
 * @param {string} date
 * @returns {{ value: number | null, partial: boolean }}
 */
export function dayValue(state, metric, date) {
  const d = state.days[date];
  const food = d?.food ?? [];
  switch (metric) {
    case 'kcal':
      return food.length ? { value: food.reduce((a, f) => a + f.kcal, 0), partial: !d?.complete } : { value: null, partial: false };
    case 'protein':
      return food.length
        ? { value: food.reduce((a, f) => a + f.protein, 0), partial: !d?.complete || food.some((f) => f.proteinKnown === false) }
        : { value: null, partial: false };
    case 'steps':
      return { value: isNum(d?.steps) ? /** @type {number} */ (d?.steps) : null, partial: false };
    case 'sleep':
      return { value: isNum(d?.sleepH) ? /** @type {number} */ (d?.sleepH) : null, partial: false };
    case 'water':
      return { value: isNum(d?.waterMl) ? /** @type {number} */ (d?.waterMl) / 1000 : null, partial: false };
    case 'training': {
      const ws = state.workouts.filter((w) => w.date === date);
      return { value: ws.reduce((a, w) => a + (w.kind === 'run' ? w.minutes : 45), 0), partial: false };
    }
  }
}

/**
 * Reihe vom ersten bis zum letzten Tag (inklusive), Lücken als null.
 * @param {import('../store.js').State} state
 * @param {MetricId} metric
 * @param {string} from
 * @param {string} to
 * @returns {DayPoint[]}
 */
export function series(state, metric, from, to) {
  const n = Math.max(0, daysBetween(from, to));
  return Array.from({ length: n + 1 }, (_, i) => {
    const date = addDays(from, i);
    return { date, ...dayValue(state, metric, date) };
  });
}

/**
 * Kennzahlen einer Reihe: Mittel über erfasste Tage (bei Kalorien/Protein nur abgeschlossene),
 * Anzahl erfasster Tage.
 * @param {DayPoint[]} pts
 * @param {MetricId} metric
 */
export function seriesStats(pts, metric) {
  const recorded = pts.filter((p) => p.value !== null);
  const basis = metric === 'kcal' || metric === 'protein' ? recorded.filter((p) => !p.partial) : recorded;
  const values = basis.map((p) => /** @type {number} */ (p.value));
  return {
    days: pts.length,
    recorded: recorded.length,
    basis: basis.length,
    mean: values.length ? mean(values) : null,
  };
}

/**
 * Erster Tag mit irgendeinem Eintrag (für «Alles»).
 * @param {import('../store.js').State} state
 * @param {string} fallback
 */
export function firstDataDate(state, fallback) {
  const dates = [...Object.keys(state.days), ...state.workouts.map((w) => w.date)].sort();
  return dates[0] && dates[0] < fallback ? dates[0] : fallback;
}
