// @ts-check
// Eigene Mahlzeiten (mehrere Einträge mit einem Tipp erfassen) und Erfassungs-Serie.
//
// Hintergrund: Regelmässiges Protokollieren hängt eng mit dem Abnehmerfolg zusammen; wer häufiger
// erfasst, nimmt mehr ab (Burke LE et al., J Am Diet Assoc 2011;111:92–102; Harvey J et al.,
// Obesity 2019;27:380–384). Weniger Aufwand pro Eintrag hilft, dabeizubleiben.

import { repeatEntry } from './entries.js';
import { addDays } from './util.js';

/**
 * @typedef {import('../store.js').FoodEntry} FoodEntry
 * @typedef {import('../store.js').SavedMeal} SavedMeal
 */

/**
 * Eigene Mahlzeit aus Einträgen: nur Nährwerte, ohne Uhrzeit, Hunger, Auslöser und Verknüpfungen.
 * @param {string} name
 * @param {FoodEntry[]} entries
 * @param {{ id: string, now: string }} o
 * @returns {SavedMeal}
 */
export function mealFromEntries(name, entries, { id, now }) {
  return {
    id,
    name: name.trim().slice(0, 80),
    items: entries.map((f) => {
      const { time: _t, repeatOf: _r, ...rest } = repeatEntry(f, '');
      return rest;
    }),
    createdAt: now,
  };
}

/**
 * Summen einer eigenen Mahlzeit.
 * @param {SavedMeal} m
 */
export function mealTotals(m) {
  return {
    kcal: m.items.reduce((a, f) => a + f.kcal, 0),
    protein: Math.round(m.items.reduce((a, f) => a + f.protein, 0) * 10) / 10,
  };
}

/**
 * Tage in Folge mit mindestens einem Essenseintrag, bis heute (oder bis gestern, solange heute
 * noch nichts erfasst ist).
 * @param {Record<string, { food?: unknown[] }>} days
 * @param {string} date
 */
export function loggingStreak(days, date) {
  const has = (/** @type {string} */ d) => (days[d]?.food?.length ?? 0) > 0;
  let d = has(date) ? date : addDays(date, -1);
  let n = 0;
  while (has(d) && n < 3650) {
    n++;
    d = addDays(d, -1);
  }
  return { days: n, today: has(date) };
}
