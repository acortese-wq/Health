// @ts-check
// Lebenserwartung: Schätzung der gewonnenen Lebensjahre durch Gewicht und Bewegung.
//
// Grundlage sind grosse Beobachtungsstudien. Sie zeigen Zusammenhänge, keine garantierte
// Wirkung beim Einzelnen; deshalb rechnet die App immer mit Spannen.
// - Prospective Studies Collaboration (Whitlock G et al., Lancet 2009;373:1083–1096):
//   BMI 30–35 verkürzt das mittlere Überleben um 2–4 Jahre, BMI 40–45 um 8–10 Jahre
//   (Referenz BMI 22.5–25).
// - Moore SC et al., PLoS Med 2012;9:e1001335: Freizeitaktivität und Lebenserwartung
//   (+1.8 Jahre bei 0.1–3.74 MET-h/Woche bis +4.5 Jahre ab 22.5 MET-h/Woche).
// - Li Y et al., Circulation 2018;138:345–355 und BMJ 2020;368:l6669: gesunder Lebensstil
//   und Jahre ohne Krebs, Herz-Kreislauf-Erkrankung und Diabetes.

import { addDays } from './util.js';

/** MET-Werte nach Compendium of Physical Activities (Näherung). */
export const RUN_MET = { z2: 7, long: 7, interval: 9 };

/** Kategorien aus Moore 2012: MET-Stunden pro Woche → gewonnene Jahre gegenüber inaktiv. */
const MOORE = [
  { min: 22.5, years: 4.5, label: 'mehr als das Dreifache der WHO-Empfehlung' },
  { min: 15, years: 4.2, label: 'das Doppelte der WHO-Empfehlung' },
  { min: 7.5, years: 3.4, label: 'WHO-Empfehlung erfüllt' },
  { min: 3.75, years: 2.5, label: 'die Hälfte der WHO-Empfehlung' },
  { min: 0.1, years: 1.8, label: 'wenig aktiv' },
];

/**
 * Durchschnittliche MET-Stunden pro Woche aus den Läufen der letzten `weeks` Wochen.
 * @param {import('./training.js').Workout[]} workouts
 * @param {string} today
 * @param {number} [weeks]
 */
export function metHoursPerWeek(workouts, today, weeks = 4) {
  const from = addDays(today, -(weeks * 7 - 1));
  let met = 0;
  for (const w of workouts) {
    if (w.kind !== 'run' || w.date < from || w.date > today) continue;
    met += (RUN_MET[w.runType] ?? 7) * (w.minutes / 60);
  }
  // Krafttraining zählt mit ca. 3.5 MET × 45 Min.
  const strength = workouts.filter((w) => w.kind === 'strength' && w.date >= from && w.date <= today).length;
  met += strength * 3.5 * 0.75;
  return met / weeks;
}

/**
 * Gewonnene Lebensjahre durch Aktivität gegenüber Inaktivität (Moore 2012).
 * @param {number} metH MET-Stunden pro Woche
 * @returns {{ years: number, label: string }}
 */
export function activityYears(metH) {
  const hit = MOORE.find((c) => metH >= c.min);
  return hit ? { years: hit.years, label: hit.label } : { years: 0, label: 'inaktiv' };
}

/**
 * Verlorene Lebensjahre durch Übergewicht als Spanne, linear zwischen den Stützpunkten
 * der Prospective Studies Collaboration: BMI 25 → 0, BMI 32.5 → 2–4, BMI 42.5 → 8–10 Jahre.
 * Unter BMI 25 wird kein Verlust angenommen.
 * @param {number} bmi
 * @returns {{ low: number, high: number }}
 */
export function yearsLostToBmi(bmi) {
  const pts = [
    { b: 25, low: 0, high: 0 },
    { b: 32.5, low: 2, high: 4 },
    { b: 42.5, low: 8, high: 10 },
  ];
  if (bmi <= 25) return { low: 0, high: 0 };
  const b = Math.min(bmi, 50);
  const i = b <= 32.5 ? 0 : 1;
  const a = pts[i];
  const c = pts[i + 1];
  const f = (b - a.b) / (c.b - a.b);
  return { low: a.low + f * (c.low - a.low), high: a.high + f * (c.high - a.high) };
}

/**
 * Gesamtschätzung.
 * @param {{ bmiNow: number, bmiGoal: number, metH: number }} p
 */
export function longevityEstimate({ bmiNow, bmiGoal, metH }) {
  const now = yearsLostToBmi(bmiNow);
  const goal = yearsLostToBmi(bmiGoal);
  const activity = activityYears(metH);
  const next = MOORE.slice()
    .reverse()
    .find((c) => c.min > metH);
  return {
    weightGain: { low: Math.max(0, now.low - goal.low), high: Math.max(0, now.high - goal.high) },
    weightLossNow: now,
    activity,
    // Nächste Aktivitätsstufe als motivierendes Ziel
    nextActivity: next ? { metH: next.min, extraYears: next.years - activity.years, label: next.label } : null,
  };
}

/**
 * Risiken von Übergewicht, personalisiert nach BMI und Taille. Nur gut belegte Aussagen.
 * @param {{ bmi: number, waistCm: number | null, sex: 'm' | 'f' }} p
 */
export function overweightRisks({ bmi, waistCm, sex }) {
  const central = waistCm !== null && waistCm >= (sex === 'm' ? 102 : 88);
  /** @type {{ title: string, text: string }[]} */
  const items = [
    {
      title: 'Typ-2-Diabetes',
      text: 'Das wichtigste Einzelrisiko von Übergewicht. Schon 5–7 % Gewichtsabnahme plus Bewegung senkten das Diabetesrisiko in einer grossen Studie um 58 %.',
    },
    { title: 'Bluthochdruck, Herzinfarkt, Schlaganfall', text: 'Pro Kilo Gewichtsverlust sinkt der Blutdruck im Mittel um etwa 1 mmHg.' },
    { title: 'Fettleber', text: 'Bei Übergewicht häufig und lange ohne Beschwerden. 7–10 % Abnahme bessern sie deutlich.' },
    { title: 'Schlafapnoe', text: 'Atemaussetzer im Schlaf belasten Herz und Kreislauf und machen tagsüber müde.' },
    { title: 'Kniearthrose und Rücken', text: 'Jedes Kilo weniger entlastet das Knie beim Gehen um ein Mehrfaches.' },
    { title: 'Krebs', text: 'Übergewicht erhöht das Risiko für mindestens 13 Krebsarten, darunter Darm-, Nieren- und Speiseröhrenkrebs.' },
  ];
  return { central, items, show: bmi >= 25 || central };
}
