// @ts-check
// Intervallfasten mit Essensfenster (Time-restricted Eating, z. B. 16:8).
//
// Einordnung: In randomisierten Studien wirkt ein Essensfenster über weniger Kalorien. Bei
// gleicher Kalorienmenge war es nicht besser als normale Kalorienreduktion (Lowe 2020,
// Liu 2022). Ein frühes Fenster könnte Blutzucker und Blutdruck zusätzlich verbessern
// (Sutton 2018, Jamshed 2022), die Daten sind aber klein. Die App behandelt das Fenster
// darum als Werkzeug für Struktur, besonders gegen spätes Essen, nicht als Ziel an sich.

import { timeToMinutes, minutesToTime } from './util.js';

/** @typedef {import('../store.js').FoodEntry} FoodEntry */
/** @typedef {{ start: number, end: number, hours: number }} EatWindow */

/** Fenstergrössen in Stunden; 0 = aus. */
export const FASTING_OPTIONS = [
  { hours: 0, label: 'Aus' },
  { hours: 12, label: '12:12 (Einstieg)' },
  { hours: 10, label: '14:10' },
  { hours: 8, label: '16:8' },
];

/**
 * Kleine Mengen (z. B. Milch im Kaffee) zählen nicht als Mahlzeit. Streng genommen
 * unterbrechen sie das Fasten, praktisch spielen sie für die Energiebilanz kaum eine Rolle.
 */
export const SMALL_KCAL = 50;

/**
 * Essensfenster aus Startzeit und Dauer. Endet spätestens um Mitternacht.
 * @param {string} startHHMM
 * @param {number} hours
 * @returns {EatWindow | null}
 */
export function eatingWindow(startHHMM, hours) {
  if (!hours) return null;
  const start = timeToMinutes(startHHMM);
  return { start, end: Math.min(start + hours * 60, 24 * 60), hours };
}

/** @param {EatWindow} w */
export const windowLabel = (w) => `${minutesToTime(w.start)}–${w.end >= 1440 ? '24:00' : minutesToTime(w.end)}`;

/**
 * Liegt eine Uhrzeit im Fenster? Ende inklusive (19:00 bei 11–19 Uhr ist noch drin).
 * @param {string} hhmm
 * @param {EatWindow} w
 */
export function inWindow(hhmm, w) {
  const m = timeToMinutes(hhmm);
  return m >= w.start && m <= w.end;
}

/** @param {FoodEntry[]} food */
const meals = (food) => food.filter((f) => f.kcal > SMALL_KCAL);

/**
 * Einträge ausserhalb des Fensters (ohne Kleinstmengen).
 * @param {FoodEntry[]} food
 * @param {EatWindow} w
 */
export function outsideWindow(food, w) {
  const out = meals(food).filter((f) => !inWindow(f.time, w));
  return {
    outside: out,
    early: out.filter((f) => timeToMinutes(f.time) < w.start),
    late: out.filter((f) => timeToMinutes(f.time) > w.end),
    kcal: out.reduce((a, f) => a + f.kcal, 0),
  };
}

/** @param {FoodEntry[]} food */
function lastMeal(food) {
  const m = meals(food).map((f) => timeToMinutes(f.time));
  return m.length ? Math.max(...m) : null;
}

/** @param {FoodEntry[]} food */
function firstMeal(food) {
  const m = meals(food).map((f) => timeToMinutes(f.time));
  return m.length ? Math.min(...m) : null;
}

/**
 * Nächtliche Fastendauer: letzte Mahlzeit am Vortag bis erste Mahlzeit am Tag.
 * @param {FoodEntry[]} prevFood
 * @param {FoodEntry[]} food
 * @returns {number | null} Stunden
 */
export function overnightFastH(prevFood, food) {
  const last = lastMeal(prevFood);
  const first = firstMeal(food);
  if (last === null || first === null) return null;
  return (first + 1440 - last) / 60;
}

/** @param {number} min */
export function durationText(min) {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? (r ? `${h} h ${r} min` : `${h} h`) : `${r} min`;
}

/**
 * Stand jetzt: Fastenphase oder Fenster offen, mit Countdown.
 * @param {{ w: EatWindow, food: FoodEntry[], prevFood: FoodEntry[], nowMin: number }} p
 */
export function fastingStatus({ w, food, prevFood, nowMin }) {
  const eatenToday = meals(food).filter((f) => timeToMinutes(f.time) <= nowMin);
  const lastToday = lastMeal(eatenToday);
  const lastPrev = lastMeal(prevFood);
  const sinceMin = lastToday !== null ? nowMin - lastToday : lastPrev !== null ? nowMin + 1440 - lastPrev : null;
  const fastTargetH = 24 - w.hours;
  if (nowMin < w.start) {
    return {
      phase: /** @type {const} */ ('fasting'),
      title: sinceMin !== null ? `Seit ${durationText(sinceMin)} nüchtern` : 'Fastenphase',
      detail: `Essensfenster öffnet um ${minutesToTime(w.start)} (in ${durationText(w.start - nowMin)}).`,
      sinceMin,
      progress: sinceMin !== null ? Math.min(1, sinceMin / 60 / fastTargetH) : null,
    };
  }
  if (nowMin <= w.end) {
    return {
      phase: /** @type {const} */ ('open'),
      title: `Essensfenster offen bis ${w.end >= 1440 ? '24:00' : minutesToTime(w.end)}`,
      detail: `Noch ${durationText(w.end - nowMin)}. Plane die letzte Mahlzeit sättigend: Protein und Gemüse.`,
      sinceMin,
      progress: null,
    };
  }
  return {
    phase: /** @type {const} */ ('closed'),
    title: 'Küche zu',
    detail:
      sinceMin !== null
        ? `Seit ${durationText(sinceMin)} nüchtern. Wasser, Tee und schwarzer Kaffee sind erlaubt (Koffein-Grenze beachten).`
        : 'Wasser und ungesüsster Tee sind erlaubt.',
    sinceMin,
    progress: null,
  };
}

/**
 * Proteinplan im Fenster: Bei 8 Stunden passen drei Portionen, das genügt für das Ziel.
 * Weniger als drei proteinreiche Mahlzeiten machen hohe Proteinziele schwer erreichbar,
 * und in einer 16:8-Studie ging ein Teil des Gewichtsverlusts auf Muskulatur (Lowe 2020).
 * @param {number} proteinG
 * @param {EatWindow} w
 */
export function proteinPlan(proteinG, w) {
  const n = 3;
  const step = (w.end - w.start) / (n - 1);
  const times = Array.from({ length: n }, (_, i) => minutesToTime(Math.round((w.start + i * step - (i === n - 1 ? 30 : 0)) / 15) * 15));
  return { portions: n, gramsEach: Math.round(proteinG / n / 5) * 5, times };
}

/** Wer nicht fasten sollte oder vorher ärztlich abklären muss. */
export const FASTING_CAUTION =
  'Nicht ohne ärztliche Begleitung bei Diabetes mit Insulin oder Sulfonylharnstoffen, bei Essstörungen (auch früher), Untergewicht, Schwangerschaft und Stillzeit. Abbrechen bei Schwindel, Heisshungerattacken oder wenn du nur noch ans Essen denkst.';
