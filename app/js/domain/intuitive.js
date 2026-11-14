// @ts-check
// Intuitives Essen, ergänzend zum Kalorienzählen: Grundsätze, Studienlage und Auswertung der
// Skalen «Hunger vorher» und «Sättigung danach» (1–10).
//
// Studienlage (geprüft im November 2026):
// - Linardon J, Tylka TL, Fuller-Tyszkiewicz M, Int J Eat Disord 2021;54:1073–1098: 97 Studien, meist
//   Querschnitt; intuitives Essen hängt mit weniger gestörtem Essverhalten, besserem Körperbild und
//   niedrigerem BMI zusammen. Ursache und Wirkung sind offen.
// - Schaefer JT, Magnuson AB, J Acad Nutr Diet 2014;114:734–760: Programme, die Essen nach inneren
//   Signalen fördern, verbessern Essverhalten und Wohlbefinden; beim Gewicht meist kein Unterschied.
// - Fuentes Artiles R et al., Obes Rev 2019;20:1619–1627: 10 randomisierte Studien; gegenüber keiner
//   Massnahme rund 0.35 kg mehr Abnahme, gegenüber üblichen Diätprogrammen kein Unterschied.

import { addDays, mean } from './util.js';

/** Die zehn Grundsätze nach Tribole & Resch, mit Bezug zu dieser App (ergänzend zu den Zahlen). */
export const PRINCIPLES = /** @type {const} */ ([
  [
    'Diätdenken loslassen',
    'Keine Verbote und Crash-Diäten. In dieser App sind Kalorien eine Orientierung, keine Regel; ein Ausrutscher ist kein Versagen.',
  ],
  ['Hunger ernst nehmen', 'Iss, wenn du hungrig bist, statt Hunger auszuhalten. Wer zu lange wartet, isst später oft zu viel.'],
  ['Frieden mit dem Essen schliessen', 'Kein Lebensmittel ist verboten. Was erlaubt ist, verliert an Reiz (siehe «später, irgendwann»).'],
  ['Die innere «Ernährungspolizei» hinterfragen', 'Gedanken wie «Ich war schlecht» bemerken und freundlicher formulieren.'],
  ['Genuss entdecken', 'Iss, was dir schmeckt, in Ruhe und am Tisch. Wer zufrieden isst, braucht weniger.'],
  ['Sättigung spüren', 'Mitten in der Mahlzeit kurz innehalten: Wie satt bin ich? Aufhören bei angenehm satt (6–7 von 10).'],
  ['Gefühle ohne Essen bewältigen', 'Stress, Langeweile, Frust brauchen andere Antworten (Heisshunger-Notfall, Achtsamkeitsübungen).'],
  ['Den Körper respektieren', 'Dein Körper verdient Respekt in jeder Grösse. Abnehmen geht besser mit Freundlichkeit als mit Abwertung.'],
  ['Bewegung spüren', 'Bewegung, weil sie guttut, nicht als Strafe für Essen.'],
  [
    'Gesundheit mit sanfter Ernährung',
    'Gemüse, Protein, Vollkorn als Grundlage, ohne Perfektion. Ein Tag macht keine Gesundheit, Gewohnheiten schon.',
  ],
]);

/**
 * Hunger- und Sättigungsbilanz der letzten Tage.
 * @param {Record<string, { food?: import('../store.js').FoodEntry[] }>} days
 * @param {string} date
 * @param {number} [span]
 */
export function scaleStats(days, date, span = 14) {
  /** @type {number[]} */
  const hunger = [];
  /** @type {number[]} */
  const full = [];
  for (let i = 0; i < span; i++)
    for (const f of days[addDays(date, -i)]?.food ?? []) {
      if (typeof f.hungerBefore === 'number') hunger.push(f.hungerBefore);
      if (typeof f.fullAfter === 'number') full.push(f.fullAfter);
    }
  const share = (/** @type {number[]} */ xs, /** @type {(v: number) => boolean} */ ok) =>
    xs.length ? Math.round((xs.filter(ok).length / xs.length) * 100) : null;
  return {
    hungerN: hunger.length,
    fullN: full.length,
    hungerAvg: hunger.length ? Math.round(mean(hunger) * 10) / 10 : null,
    fullAvg: full.length ? Math.round(mean(full) * 10) / 10 : null,
    /** Ohne Hunger gegessen (1–3) */
    noHungerPct: share(hunger, (v) => v <= 3),
    /** Ausgehungert gegessen (9–10): oft Folge zu langer Pausen */
    starvedPct: share(hunger, (v) => v >= 9),
    /** Angenehm satt aufgehört (5–7) */
    sweetSpotPct: share(full, (v) => v >= 5 && v <= 7),
    /** Übervoll (9–10) */
    overfullPct: share(full, (v) => v >= 9),
  };
}

/**
 * Kurze Rückmeldung zu den Werten.
 * @param {ReturnType<typeof scaleStats>} s
 * @returns {string[]}
 */
export function scaleFeedback(s) {
  /** @type {string[]} */
  const out = [];
  if (s.hungerN + s.fullN < 5)
    return ['Noch zu wenige Angaben. Notiere nach dem Erfassen kurz Hunger und Sättigung, dann zeigt sich hier dein Muster.'];
  if (s.noHungerPct !== null && s.noHungerPct >= 30)
    out.push(
      `${s.noHungerPct} % deiner Mahlzeiten mit wenig oder keinem Hunger (1–3). Hier lohnt der Blick auf Auslöser wie Gewohnheit oder Fernseher.`,
    );
  if (s.starvedPct !== null && s.starvedPct >= 25)
    out.push(
      `${s.starvedPct} % sehr hungrig gegessen (9–10). Kürzere Pausen und eine proteinreiche Zwischenmahlzeit helfen, nicht ausgehungert zu essen.`,
    );
  if (s.overfullPct !== null && s.overfullPct >= 20)
    out.push(`${s.overfullPct} % übervoll aufgehört (9–10). Langsamer essen und nach der Hälfte kurz innehalten.`);
  if (s.sweetSpotPct !== null && s.sweetSpotPct >= 60) out.push(`${s.sweetSpotPct} % angenehm satt aufgehört (5–7). Genau so.`);
  return out.length ? out : ['Unauffällig: Hunger und Sättigung liegen meist im mittleren Bereich.'];
}
