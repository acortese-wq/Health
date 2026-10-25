// @ts-check
// Vorlagen für Nahrungsergänzungsmittel. Werte pro Portion nach Packung bzw. Hersteller- und
// Apothekenangaben (Stand 21.10.2026); vor Gebrauch mit der eigenen Packung abgleichen, da
// Rezepturen wechseln. Werte, die nicht verlässlich gefunden wurden, stehen als «unbekannt»
// und zählen nicht (nicht als 0).

/**
 * @typedef {import('../domain/micros.js').NutrientKey} NutrientKey
 * @typedef {{ label: string, amount: number, unit: string }} OtherIngredient
 * @typedef {{
 *   id: string, rev: number, name: string, brand: string, serving: string, perDay: number,
 *   nutrients: Partial<Record<NutrientKey, number>>, folicAcid?: number, nicotinamide?: boolean,
 *   preformedVitA?: number, suppMagnesium?: boolean,
 *   other: OtherIngredient[], unknown: string[], source: string, checked: string, notes: string[],
 *   evidence: { text: string, ref: string }[],
 * }} SupplementTemplate
 */

/** @type {SupplementTemplate[]} */
export const SUPPLEMENT_TEMPLATES = [
  {
    id: 'burgerstein-mood',
    rev: 3,
    name: 'Burgerstein Mood',
    brand: 'Burgerstein (Antistress AG)',
    serving: '1 Kapsel',
    perDay: 2,
    nutrients: { b6: 1.75, niacin: 20, b5: 7.5, b12: 3.5, vitD: 7.5, zinc: 2.5 },
    folicAcid: 250,
    nicotinamide: true,
    other: [
      { label: 'Safranextrakt (affron)', amount: 14, unit: 'mg' },
      { label: 'davon Crocin und Safranal', amount: 0.5, unit: 'mg' },
      { label: 'Melissenextrakt (Bluenesse)', amount: 300, unit: 'mg' },
      { label: 'davon Rosmarinsäure', amount: 18, unit: 'mg' },
    ],
    unknown: [],
    source: 'Packungsangabe (Antistress AG, Rapperswil)',
    checked: '2026-10-21',
    notes: ['Empfohlen für Erwachsene: morgens und abends je 1 Kapsel (Tagesportion 2 Kapseln). Jede Kapsel lässt sich einzeln abhaken.'],
    evidence: [
      {
        text: 'Safran: In kleinen, kurzen Studien linderte Safranextrakt (meist 30 mg/Tag) leichte bis mittlere depressive Symptome besser als Placebo. Die Studienqualität ist mässig; bei anhaltender Niedergeschlagenheit ärztlich abklären.',
        ref: 'Marx W et al., Nutr Rev 2019;77:557–571',
      },
      {
        text: 'Melisse: nur wenige, kleine Studien zu Stress und Schlaf; schwach belegt.',
        ref: 'Übersicht: Shakeri A et al., J Ethnopharmacol 2016;188:204–228',
      },
      {
        text: 'B-Vitamine, Vitamin D und Zink helfen der Psyche und gegen Müdigkeit nachweislich nur bei einem Mangel. Bei Einnahme von Antidepressiva vorher ärztlich oder in der Apotheke besprechen.',
        ref: 'Zugelassene Gesundheitsangaben (EU-Verordnung 432/2012, Schweiz LIV)',
      },
    ],
  },
  {
    id: 'supradyn-pro-energy',
    rev: 2,
    name: 'Supradyn pro energy-complex (Filmtablette)',
    brand: 'Bayer (Schweiz) AG',
    serving: '1 Filmtablette',
    perDay: 1,
    nutrients: {
      vitC: 180,
      vitE: 12,
      vitK: 20,
      vitD: 5,
      b1: 3.3,
      b2: 4,
      b6: 4,
      niacin: 45,
      b5: 17,
      b12: 3,
      calcium: 120,
      magnesium: 80,
      iron: 8,
      zinc: 4.4,
      selenium: 55,
      iodine: 150,
    },
    folicAcid: 430,
    nicotinamide: true,
    suppMagnesium: true,
    other: [
      { label: 'Biotin', amount: 145, unit: 'µg' },
      { label: 'Beta-Carotin', amount: 0.86, unit: 'mg' },
      { label: 'Kupfer', amount: 1, unit: 'mg' },
      { label: 'Mangan', amount: 500, unit: 'µg' },
      { label: 'Molybdän', amount: 50, unit: 'µg' },
    ],
    unknown: [],
    source: 'Packungsangabe (Bayer)',
    checked: '2026-10-21',
    notes: [
      'Beta-Carotin zählt die App nicht als Vitamin A (Umrechnung bei Präparaten uneinheitlich).',
      'Empfohlen: 1 Tablette pro Tag; nicht zusätzlich zu anderen Multivitaminen.',
    ],
    evidence: [
      {
        text: 'Multivitamine senkten bei gut ernährten Erwachsenen weder Herz-Kreislauf-Erkrankungen noch Krebs oder Sterblichkeit.',
        ref: 'US Preventive Services Task Force, Mangione CM et al., JAMA 2022;327:2326–2333',
      },
      {
        text: '«Energie»: B-Vitamine, Eisen und Magnesium verringern Müdigkeit nur, wenn ein Mangel besteht.',
        ref: 'Zugelassene Gesundheitsangaben (EU-Verordnung 432/2012, Schweiz LIV)',
      },
      {
        text: 'Eisen (8 mg): Männer und Frauen nach der Menopause brauchen meist kein zusätzliches Eisen; vor längerer Einnahme Ferritin bestimmen lassen. Vitamin K (20 µg): Wer Blutverdünner vom Typ Vitamin-K-Antagonist (z. B. Marcoumar) nimmt, bespricht das vorher.',
        ref: 'EFSA, Scientific opinion on iron, EFSA J 2024;22:e8819',
      },
    ],
  },
  {
    id: 'vitamin-d3-1000',
    rev: 1,
    name: 'Vitamin D3 1000 IE',
    brand: 'beliebig',
    serving: '1 Tablette oder Tropfen-Portion à 1000 IE',
    perDay: 1,
    nutrients: { vitD: 25 },
    other: [],
    unknown: [],
    source: 'Definition: 1000 IE Vitamin D = 25 µg',
    checked: '2026-10-21',
    notes: ['Das BAG empfiehlt Erwachsenen 15 µg (600 IE), ab 60 Jahren 20 µg (800 IE) täglich.'],
    evidence: [
      {
        text: 'Vitamin D im Winterhalbjahr: über die Haut kaum Bildung, über das Essen kaum zu decken.',
        ref: 'Eidg. Ernährungskommission, Vitamin D-Mangel 2012',
      },
    ],
  },
  {
    id: 'magnesium-150',
    rev: 1,
    name: 'Magnesium 150 mg',
    brand: 'beliebig',
    serving: '1 Portion à 150 mg',
    perDay: 1,
    nutrients: { magnesium: 150 },
    suppMagnesium: true,
    other: [],
    unknown: [],
    source: 'Menge laut Produktname',
    checked: '2026-10-21',
    notes: ['Aus Präparaten höchstens 250 mg pro Tag (darüber häufig Durchfall).'],
    evidence: [
      {
        text: 'Nutzen vor allem bei nachgewiesenem Mangel oder Wadenkrämpfen in der Schwangerschaft; sonst schwach belegt.',
        ref: 'EFSA, EFSA J 2015;13:4186',
      },
    ],
  },
  {
    id: 'omega3-500',
    rev: 1,
    name: 'Omega-3 Fischöl (500 mg EPA+DHA)',
    brand: 'beliebig',
    serving: '1 Kapsel mit 500 mg EPA+DHA',
    perDay: 1,
    nutrients: { epaDha: 500 },
    other: [],
    unknown: [],
    source: 'Menge laut Produktname',
    checked: '2026-10-21',
    notes: ['Zweimal pro Woche fetter Fisch liefert ähnlich viel.'],
    evidence: [
      {
        text: 'Für Herz-Kreislauf-Ereignisse bei Gesunden kein klarer Nutzen von Fischöl-Kapseln.',
        ref: 'Abdelhamid AS et al., Cochrane Database Syst Rev 2020;CD003177',
      },
    ],
  },
];
