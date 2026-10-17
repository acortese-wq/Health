// @ts-check
// Training: Ganzkörper-Kraftplan mit doppelter Progression und Wochenbilanz.
// Quellen: Bull FC et al., Br J Sports Med 2020;54:1451–1462 (WHO-Empfehlungen);
// Villareal DT et al., N Engl J Med 2017;376:1943–1955 (Kraft + Ausdauer erhält
// Muskelmasse beim Abnehmen besser als Ausdauer allein).

import { addDays, weekStart } from './util.js';

/**
 * @typedef {{ id: string, name: string, sets: number, repMin: number, repMax: number,
 *   incrementKg: number, cue: string, timed?: boolean }} Exercise
 * @typedef {{ ex: string, kg: number, reps: number }} SetLog
 * @typedef {{ id: string, date: string, kind: 'strength', template: string, sets: SetLog[], note?: string }} StrengthWorkout
 * @typedef {{ id: string, date: string, kind: 'run', runType: 'z2' | 'interval' | 'long', minutes: number, km?: number, avgHr?: number, note?: string }} RunWorkout
 * @typedef {StrengthWorkout | RunWorkout} Workout
 */

/** @type {Record<string, { name: string, exercises: Exercise[] }>} */
export const TEMPLATES = {
  A: {
    name: 'Kraft A',
    exercises: [
      {
        id: 'beinpresse',
        name: 'Beinpresse',
        sets: 3,
        repMin: 8,
        repMax: 12,
        incrementKg: 5,
        cue: 'Knie folgen den Fussspitzen, Rücken bleibt am Polster.',
      },
      {
        id: 'rdl',
        name: 'Rumänisches Kreuzheben (Kurzhanteln)',
        sets: 3,
        repMin: 8,
        repMax: 12,
        incrementKg: 2.5,
        cue: 'Hüfte nach hinten schieben, Rücken neutral, Hanteln nah am Bein.',
      },
      {
        id: 'brustpresse',
        name: 'Brustpresse / Bankdrücken',
        sets: 3,
        repMin: 8,
        repMax: 12,
        incrementKg: 2.5,
        cue: 'Schulterblätter zusammen, kontrolliert absenken.',
      },
      {
        id: 'kabelrudern',
        name: 'Rudern am Kabel',
        sets: 3,
        repMin: 8,
        repMax: 12,
        incrementKg: 2.5,
        cue: 'Zug aus dem Rücken, Schultern weg von den Ohren.',
      },
      {
        id: 'plank',
        name: 'Unterarmstütz (Sekunden)',
        sets: 3,
        repMin: 30,
        repMax: 60,
        incrementKg: 0,
        cue: 'Becken neutral, Gesäss und Bauch fest.',
        timed: true,
      },
    ],
  },
  B: {
    name: 'Kraft B',
    exercises: [
      {
        id: 'goblet',
        name: 'Goblet-Kniebeuge',
        sets: 3,
        repMin: 8,
        repMax: 12,
        incrementKg: 2.5,
        cue: 'Hantel vor der Brust, aufrecht, tief so weit es sauber geht.',
      },
      {
        id: 'latzug',
        name: 'Latzug',
        sets: 3,
        repMin: 8,
        repMax: 12,
        incrementKg: 2.5,
        cue: 'Stange zur oberen Brust, Ellbogen nach unten.',
      },
      {
        id: 'schulterdruecken',
        name: 'Schulterdrücken (Maschine/Kurzhanteln)',
        sets: 3,
        repMin: 8,
        repMax: 12,
        incrementKg: 2.5,
        cue: 'Rumpf fest, kein Hohlkreuz.',
      },
      {
        id: 'ausfall',
        name: 'Ausfallschritte rückwärts (je Bein)',
        sets: 2,
        repMin: 8,
        repMax: 12,
        incrementKg: 2.5,
        cue: 'Vorderes Knie stabil über dem Fuss.',
      },
      {
        id: 'hipthrust',
        name: 'Hüftheben / Hip Thrust',
        sets: 3,
        repMin: 8,
        repMax: 12,
        incrementKg: 5,
        cue: 'Kinn zur Brust, oben Gesäss anspannen.',
      },
    ],
  },
};

export const RUN_TYPES = {
  z2: { label: 'Locker (Zone 2)', vigorous: false },
  interval: { label: 'Intervalle 4 × 4 Min.', vigorous: true },
  long: { label: 'Langer Lauf', vigorous: false },
};

/**
 * @param {string} id
 * @returns {Exercise | undefined}
 */
export function findExercise(id) {
  for (const t of Object.values(TEMPLATES)) {
    const e = t.exercises.find((x) => x.id === id);
    if (e) return e;
  }
  return undefined;
}

/**
 * Doppelte Progression: zuerst Wiederholungen bis repMax in allen Sätzen,
 * dann Gewicht erhöhen. Zweimal in Folge unter repMin → 10 % reduzieren.
 *
 * @param {Exercise} ex
 * @param {SetLog[][]} history Sätze der letzten Einheiten, neueste zuerst
 * @returns {{ kg: number | null, reps: number, action: 'start' | 'increase' | 'repeat' | 'deload', reason: string }}
 */
export function suggestNext(ex, history) {
  const last = history[0];
  if (!last || !last.length) {
    return {
      kg: null,
      reps: ex.repMin,
      action: 'start',
      reason: 'Startgewicht so wählen, dass nach dem letzten Satz noch 2–3 Wiederholungen möglich wären.',
    };
  }
  const kg = Math.max(...last.map((s) => s.kg));
  const top = last.filter((s) => s.kg === kg);
  const allTop = top.length >= ex.sets && top.every((s) => s.reps >= ex.repMax);
  const failed = (/** @type {SetLog[]} */ sets) => sets.some((s) => s.reps < ex.repMin);
  if (ex.timed) {
    return allTop
      ? {
          kg,
          reps: ex.repMax,
          action: 'increase',
          reason: 'Alle Sätze am oberen Ende. Schwierigere Variante wählen (z. B. Beine weiter weg).',
        }
      : {
          kg,
          reps: Math.min(ex.repMax, Math.max(...last.map((s) => s.reps)) + 5),
          action: 'repeat',
          reason: 'Haltezeit um ca. 5 Sekunden steigern.',
        };
  }
  if (allTop) {
    return {
      kg: kg + ex.incrementKg,
      reps: ex.repMin,
      action: 'increase',
      reason: `Alle Sätze mit ${ex.repMax} Wiederholungen geschafft: +${ex.incrementKg} kg.`,
    };
  }
  if (failed(last) && history[1] && failed(history[1])) {
    const reduced = Math.max(0, Math.round((kg * 0.9) / 2.5) * 2.5);
    return {
      kg: reduced,
      reps: ex.repMin,
      action: 'deload',
      reason: 'Zweimal in Folge unter dem Zielbereich: Gewicht um ca. 10 % senken und sauber neu aufbauen.',
    };
  }
  const best = Math.max(...top.map((s) => s.reps));
  return { kg, reps: Math.min(ex.repMax, best + 1), action: 'repeat', reason: 'Gleiches Gewicht, eine Wiederholung mehr anstreben.' };
}

/**
 * Sätze einer Übung aus der Trainingshistorie, neueste Einheit zuerst.
 * @param {Workout[]} workouts
 * @param {string} exId
 * @param {number} [limit]
 * @returns {SetLog[][]}
 */
export function exerciseHistory(workouts, exId, limit = 3) {
  return workouts
    .filter(/** @returns {w is StrengthWorkout} */ (w) => w.kind === 'strength')
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map((w) => w.sets.filter((s) => s.ex === exId))
    .filter((s) => s.length)
    .slice(0, limit);
}

/**
 * Wochenbilanz gegenüber WHO-Empfehlung (150 Min. moderat oder 75 Min. intensiv,
 * plus an mind. 2 Tagen Kraft). Intensive Minuten zählen doppelt.
 * @param {Workout[]} workouts
 * @param {string} anyDateInWeek
 */
export function weekSummary(workouts, anyDateInWeek) {
  const from = weekStart(anyDateInWeek);
  return rangeSummary(workouts, from, addDays(from, 6));
}

/**
 * Bilanz für einen beliebigen Zeitraum, z. B. die letzten 7 Tage.
 * @param {Workout[]} workouts
 * @param {string} from
 * @param {string} to
 */
export function rangeSummary(workouts, from, to) {
  const inWeek = workouts.filter((w) => w.date >= from && w.date <= to);
  const strengthDays = new Set(inWeek.filter((w) => w.kind === 'strength').map((w) => w.date)).size;
  let moderate = 0;
  let vigorous = 0;
  for (const w of inWeek) {
    if (w.kind !== 'run') continue;
    if (RUN_TYPES[w.runType]?.vigorous) vigorous += w.minutes;
    else moderate += w.minutes;
  }
  const equivalent = moderate + 2 * vigorous;
  return {
    from,
    to,
    strengthDays,
    moderate,
    vigorous,
    equivalent,
    aerobicMet: equivalent >= 150,
    strengthMet: strengthDays >= 2,
    intervalDone: inWeek.some((w) => w.kind === 'run' && w.runType === 'interval'),
  };
}

/**
 * @typedef {{ title: string, detail: string, kind: 'strength' | 'run' | 'rest', template?: string, runType?: 'z2' | 'interval' | 'long' }} PlannedSession
 */

/**
 * Wochenplan: Mo Kraft A, Di locker, Do Kraft B, Sa Intervalle, So lang; Mi/Fr Pause.
 * @param {string} iso
 * @returns {PlannedSession}
 */
export function plannedSession(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  /** @type {Record<number, PlannedSession>} */
  const plan = {
    1: { title: 'Kraft A', detail: '45 Min. Geschäfts-Gym', kind: 'strength', template: 'A' },
    2: { title: 'Lauf locker', detail: `${RUN_TYPES.z2.label}, 40–50 Min.`, kind: 'run', runType: 'z2' },
    3: { title: 'Pause', detail: 'Schritte sammeln', kind: 'rest' },
    4: { title: 'Kraft B', detail: '45 Min. Geschäfts-Gym', kind: 'strength', template: 'B' },
    5: { title: 'Pause', detail: 'Schritte sammeln', kind: 'rest' },
    6: { title: 'Intervalle', detail: '4 × 4 Min. zügig, 3 Min. locker', kind: 'run', runType: 'interval' },
    0: { title: 'Langer Lauf', detail: '60–75 Min. locker', kind: 'run', runType: 'long' },
  };
  return plan[dow];
}
