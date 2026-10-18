// @ts-check
// Zyklus und Lebensphase (nur bei «weiblich», freiwillig). Grundsätze:
// - Gewicht schwankt vor der Periode um 0.5–2 kg (Wasser), das ist kein Fett.
// - Ausbleibende Periode über 3 Monate bei Training und Defizit ist ein Leitsymptom zu
//   geringer Energieverfügbarkeit (RED-S; Mountjoy et al., Br J Sports Med 2023) → abklären.
// - Schwangerschaft und Stillzeit: kein Kaloriendefizit, angepasste Nährstoffziele.
// - Phasenschätzung: Eisprung ca. 14 Tage vor der nächsten Periode; Schätzung, keine
//   Verhütungsmethode.
// Die Angaben bleiben auf dem Gerät, gehen nicht an die KI und in den Bericht nur auf Wunsch.

import { addDays, daysBetween } from './util.js';

/** @typedef {'keine' | 'natuerlich' | 'hormonell' | 'wechseljahre' | 'schwanger' | 'stillend'} CycleStatus */

export const CYCLE_OPTIONS = /** @type {const} */ ([
  ['keine', 'Keine Angabe'],
  ['natuerlich', 'Natürlicher Zyklus'],
  ['hormonell', 'Hormonelle Verhütung (Pille, Spirale mit Hormon …)'],
  ['wechseljahre', 'Wechseljahre / keine Periode mehr'],
  ['schwanger', 'Schwanger'],
  ['stillend', 'Stillend'],
]);

/**
 * Periodenbeginne: erster Tag einer Folge von Periodentagen, plus optionaler Startwert aus
 * dem Profil. Aufsteigend sortiert.
 * @param {Record<string, { period?: boolean }>} days
 * @param {string} [lastPeriodStart]
 */
export function periodStarts(days, lastPeriodStart = '') {
  const set = new Set();
  for (const [d, v] of Object.entries(days)) {
    if (v?.period && !days[addDays(d, -1)]?.period) set.add(d);
  }
  if (lastPeriodStart) set.add(lastPeriodStart);
  // Zwei Starts innerhalb von 10 Tagen gelten als dieselbe Periode
  const sorted = [...set].sort();
  /** @type {string[]} */
  const out = [];
  for (const d of sorted) if (!out.length || daysBetween(out[out.length - 1], d) > 10) out.push(d);
  return out;
}

/**
 * Durchschnittliche Zykluslänge aus den letzten Abständen (21–45 Tage), sonst Profilwert.
 * @param {string[]} starts
 * @param {number} fallback
 */
export function cycleLength(starts, fallback = 28) {
  const gaps = [];
  for (let i = 1; i < starts.length; i++) {
    const g = daysBetween(starts[i - 1], starts[i]);
    if (g >= 21 && g <= 45) gaps.push(g);
  }
  const recent = gaps.slice(-6);
  if (!recent.length) return fallback;
  const sorted = [...recent].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * @typedef {{ day: number, length: number, phase: 'periode' | 'follikel' | 'eisprung' | 'luteal' | 'praemenstruell',
 *   label: string, nextStart: string, start: string }} CycleInfo
 */

/**
 * Zyklustag und geschätzte Phase für ein Datum.
 * @param {string} date
 * @param {string[]} starts
 * @param {number} length
 * @param {Record<string, { period?: boolean }>} days
 * @returns {CycleInfo | null}
 */
export function cycleInfo(date, starts, length, days) {
  const past = starts.filter((s) => s <= date);
  if (!past.length) return null;
  const start = past[past.length - 1];
  const day = daysBetween(start, date) + 1;
  if (day > 60) return null;
  const ovulation = length - 14;
  /** @type {CycleInfo['phase']} */
  let phase;
  if (days[date]?.period || day <= 5) phase = 'periode';
  else if (day < ovulation - 1) phase = 'follikel';
  else if (day <= ovulation + 1) phase = 'eisprung';
  else if (day > length - 6) phase = 'praemenstruell';
  else phase = 'luteal';
  const labels = {
    periode: 'Periode',
    follikel: 'Erste Zyklushälfte',
    eisprung: 'Um den Eisprung (geschätzt)',
    luteal: 'Zweite Zyklushälfte',
    praemenstruell: 'Tage vor der Periode',
  };
  return { day, length, phase, label: labels[phase], nextStart: addDays(start, length), start };
}

/** Kurze, alltagstaugliche Hinweise je Phase. */
export const PHASE_TIPS = /** @type {Record<CycleInfo['phase'], string>} */ ({
  periode:
    'Eisenreich essen (Fleisch, Hülsenfrüchte, Vollkorn) mit Vitamin C dazu, Kaffee nicht direkt zum Essen. Bewegung nach Befinden; lockeres Training lindert Krämpfe oft.',
  follikel: 'Viele fühlen sich jetzt leistungsfähig: guter Zeitpunkt für intensive Einheiten und neue Gewohnheiten.',
  eisprung: 'Keine besonderen Anpassungen nötig. Die Schätzung ist ungenau und keine Verhütungsmethode.',
  luteal: 'Der Appetit kann zunehmen. Plane Protein und Ballaststoffe in jede Mahlzeit, dann bleibt der Hunger berechenbarer.',
  praemenstruell:
    'Gewicht oft 0.5–2 kg höher durch Wasser, das ist kein Fett. Lust auf Süsses ist häufig: lieber einen geplanten Genuss (z. B. 2 Reihen dunkle Schokolade) als ein Verbot, das am Abend kippt.',
});

/**
 * Prämenstruelle Tage (letzte 6 Tage vor der geschätzten nächsten Periode), z. B. für die
 * Heisshunger-Analyse und den Gewichtshinweis.
 * @param {string} date
 * @param {string[]} starts
 * @param {number} length
 */
export function isPremenstrual(date, starts, length) {
  const info = cycleInfo(date, starts, length, {});
  return info !== null && info.day > length - 6 && info.day <= length + 3;
}

/**
 * Lebensphase für Kalorien und Nährstoffe.
 * @param {'m' | 'f'} sex
 * @param {CycleStatus | undefined} status
 */
export function lifeStage(sex, status) {
  if (sex !== 'f') return /** @type {const} */ ('standard');
  if (status === 'schwanger') return /** @type {const} */ ('schwanger');
  if (status === 'stillend') return /** @type {const} */ ('stillend');
  if (status === 'wechseljahre') return /** @type {const} */ ('ohne-menstruation');
  return /** @type {const} */ ('standard');
}
