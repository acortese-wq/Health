// @ts-check
// Gelüste und Mangel: Nur belegte Zusammenhänge werden genannt (geprüft im November 2026).
// Die verbreitete Annahme «Lust auf X bedeutet Mangel an Y» ist für die meisten Lebensmittel nicht
// belegt; belegt sind wenige Ausnahmen (Eis bei Eisenmangel, Salzhunger bei Nebennierenschwäche).

/**
 * @typedef {import('../domain/micros.js').NutrientKey} NutrientKey
 * @typedef {{
 *   id: string, label: string, evidence: { text: string, ref: string } | null, check?: string,
 *   nutrients: NutrientKey[], energy?: boolean,
 * }} CravingCause
 */

/** @type {CravingCause[]} */
export const CRAVING_CAUSES = [
  {
    id: 'eis',
    label: 'Eis, Eiswürfel',
    evidence: {
      text: 'Belegt: Häufiges, starkes Verlangen nach Eis ist ein bekanntes Zeichen für Eisenmangel. Von 262 Erwachsenen mit Eisenmangel hatten 45 % ein solches Verlangen, fast immer nach Eis. Nach Behandlung des Mangels lässt es meist nach.',
      ref: 'Barton JC, Barton JC, Bertoli LF, BMC Blood Disord 2010;10:9',
    },
    check: 'Beim Hausarzt Ferritin und Blutbild bestimmen lassen.',
    nutrients: ['iron'],
  },
  {
    id: 'salzig',
    label: 'Salziges, Chips',
    evidence: {
      text: 'Belegt, aber selten: Starker, anhaltender Salzhunger zusammen mit Müdigkeit, Gewichtsverlust, Schwindel beim Aufstehen oder dunklerer Haut kann ein Zeichen einer Nebennierenschwäche (Morbus Addison) sein. Nach starkem Schwitzen, etwa langen Läufen bei Hitze, braucht der Körper zudem mehr Salz. Ohne diese Umstände ist Salzlust meist Gewohnheit.',
      ref: 'Mayo Clinic: Salt craving – a symptom of Addison’s disease?; Übersicht Nebenniereninsuffizienz, Compr Physiol 2014 (PMC4215264)',
    },
    check: 'Bei Salzhunger mit den genannten Beschwerden ärztlich abklären lassen.',
    nutrients: ['sodium'],
  },
  {
    id: 'schokolade',
    label: 'Schokolade',
    evidence: null,
    nutrients: ['magnesium', 'iron'],
  },
  {
    id: 'suess',
    label: 'Süsses, Zucker',
    evidence: null,
    nutrients: ['carbs'],
    energy: true,
  },
  {
    id: 'fleisch',
    label: 'Fleisch',
    evidence: null,
    check: 'Wenn du zugleich oft müde, blass oder kurzatmig bist: Ferritin prüfen lassen. Das Verlangen allein ist kein Beleg.',
    nutrients: ['iron', 'protein', 'b12'],
  },
  {
    id: 'kaese',
    label: 'Käse',
    evidence: null,
    nutrients: ['calcium', 'protein'],
  },
  {
    id: 'brot',
    label: 'Brot',
    evidence: null,
    nutrients: ['carbs', 'fiber'],
    energy: true,
  },
];

/** Für alle Gelüste ohne belegten Mangel-Zusammenhang. */
export const NO_EVIDENCE =
  'Für dieses Gelüst ist kein Zusammenhang mit einem Nährstoffmangel belegt. Häufigere, belegte Gründe sind eine lange Essenspause, wenig Schlaf, Stress, Gewohnheit und das innere Bild vom Essen.';
