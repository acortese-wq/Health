// @ts-check
// Garmin-Dashboard: Kennzahlen wie in Garmin Connect aus den importierten Werten (Aktivitäten-CSV,
// Tageswerte per Kurzbefehl) und eigenen Einträgen. Keine Live-Verbindung: Garmin bietet für
// Privatpersonen keine offene Schnittstelle (Garmin Health API nur für Firmenpartner mit Server).
//
// Einordnung:
// - Ruhepuls: Anstieg um > 5 Schläge über den persönlichen Basiswert über mehrere Tage spricht für
//   unvollständige Erholung, Infekt oder Stress (Buchheit M, Front Physiol 2014;5:73).
// - Schlaf: Erwachsene ≥ 7 h (Watson NF et al., Sleep 2015;38:843–844).
// - Bewegung: 150 Minuten mässig oder 75 Minuten intensiv pro Woche (WHO 2020).
// - VO₂max: einer der stärksten Prädiktoren der Sterblichkeit (Mandsager K et al., JAMA Netw Open
//   2018;1:e183605); Uhren-Schätzungen weichen oft einige ml/kg/min vom Labor ab.

import { addDays, isNum, mean } from './util.js';
import { rangeSummary } from './training.js';

/**
 * @typedef {import('../store.js').State} State
 */

/**
 * Werte einer Tageskennzahl über einen Zeitraum (inklusive), nur erfasste Tage.
 * @param {State} state
 * @param {'steps' | 'sleepH' | 'restingHr'} key
 * @param {string} from
 * @param {string} to
 */
function values(state, key, from, to) {
  /** @type {number[]} */
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const v = state.days[d]?.[key];
    if (isNum(v)) out.push(/** @type {number} */ (v));
  }
  return out;
}

/**
 * Letzter erfasster Wert (bis `date`, höchstens `back` Tage zurück).
 * @param {State} state
 * @param {'steps' | 'sleepH' | 'restingHr' | 'weightKg'} key
 * @param {string} date
 * @param {number} back
 * @returns {{ value: number, date: string } | null}
 */
export function latest(state, key, date, back = 3) {
  for (let i = 0; i <= back; i++) {
    const d = addDays(date, -i);
    const v = state.days[d]?.[key];
    if (isNum(v)) return { value: /** @type {number} */ (v), date: d };
  }
  return null;
}

/**
 * Pace in min/km als «5:42».
 * @param {number} minutes
 * @param {number} km
 */
export function pace(minutes, km) {
  if (!(km > 0) || !(minutes > 0)) return '';
  const sec = Math.round((minutes * 60) / km);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/**
 * Erholung aus Ruhepuls (7 Tage gegen Basis) und Schlaf (7 Tage).
 * @param {number | null} rhrDelta
 * @param {number | null} sleep7
 * @param {number} sleepTarget
 * @returns {{ level: 'gut' | 'mittel' | 'achtung' | 'offen', text: string }}
 */
export function recovery(rhrDelta, sleep7, sleepTarget) {
  if (rhrDelta === null && sleep7 === null)
    return { level: 'offen', text: 'Für eine Einschätzung fehlen Ruhepuls und Schlaf der letzten Tage.' };
  if (rhrDelta !== null && rhrDelta > 5)
    return {
      level: 'achtung',
      text: `Ruhepuls ${Math.round(rhrDelta)} Schläge über deinem Basiswert: heute locker oder Ruhetag, auf Infekt und Schlaf achten.`,
    };
  if ((rhrDelta !== null && rhrDelta > 3) || (sleep7 !== null && sleep7 < Math.min(7, sleepTarget) - 0.5))
    return { level: 'mittel', text: 'Leicht eingeschränkt: Intervalle verschieben, locker trainieren, früher ins Bett.' };
  return { level: 'gut', text: 'Gut erholt: Ein intensives Training passt, wenn es im Plan steht.' };
}

/**
 * Alles fürs Dashboard.
 * @param {State} state
 * @param {string} today
 */
export function garminSummary(state, today) {
  const p = state.profile;
  const rhr7 = values(state, 'restingHr', addDays(today, -6), today);
  const rhrBase = values(state, 'restingHr', addDays(today, -37), addDays(today, -7));
  const sleep7 = values(state, 'sleepH', addDays(today, -6), today);
  const steps7 = values(state, 'steps', addDays(today, -6), today);
  const rhr7m = rhr7.length >= 3 ? mean(rhr7) : null;
  const rhrBaseM = rhrBase.length >= 10 ? mean(rhrBase) : null;
  const rhrDelta = rhr7m !== null && rhrBaseM !== null ? rhr7m - rhrBaseM : null;
  const sleep7m = sleep7.length >= 3 ? mean(sleep7) : null;
  const week = rangeSummary(state.workouts, addDays(today, -6), today);
  const runs7 = state.workouts.filter((w) => w.kind === 'run' && w.date >= addDays(today, -6) && w.date <= today);
  const km7 = runs7.reduce((a, w) => a + (w.kind === 'run' ? (w.km ?? 0) : 0), 0);
  const vo2 = [...state.vo2max].sort((a, b) => (a.date < b.date ? -1 : 1));
  const vo2Last = vo2[vo2.length - 1] ?? null;
  const vo2Old = vo2.filter((v) => vo2Last && v.date <= addDays(vo2Last.date, -60)).pop() ?? null;
  const daily = Object.keys(state.days)
    .filter((d) => d <= today && ['steps', 'sleepH', 'restingHr'].some((k) => isNum(/** @type {any} */ (state.days[d])[k])))
    .sort();
  const garminRuns = state.workouts
    .filter((w) => w.id.startsWith('garmin-'))
    .map((w) => w.date)
    .sort();
  return {
    steps: latest(state, 'steps', today, 1),
    stepsTarget: p?.stepsTarget ?? 8000,
    steps7: steps7.length ? mean(steps7) : null,
    sleep: latest(state, 'sleepH', today, 1),
    sleepTarget: p?.sleepTargetH ?? 7.5,
    sleep7: sleep7m,
    rhr: latest(state, 'restingHr', today, 2),
    rhr7: rhr7m,
    rhrBase: rhrBaseM,
    rhrDelta,
    vo2: vo2Last,
    vo2Change: vo2Last && vo2Old ? vo2Last.value - vo2Old.value : null,
    week,
    runs7: runs7.length,
    km7: Math.round(km7 * 10) / 10,
    recovery: recovery(rhrDelta, sleep7m, p?.sleepTargetH ?? 7.5),
    lastDaily: daily[daily.length - 1] ?? null,
    lastActivityImport: garminRuns[garminRuns.length - 1] ?? null,
  };
}
