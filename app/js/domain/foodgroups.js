// @ts-check
// Lebensmittelgruppen nach der Schweizer Lebensmittelpyramide (SGE). Ernährungsberatung
// arbeitet mit Portionen statt Mikrogramm: «5 am Tag», 3 Portionen Milchprodukte usw.
//
// Richtwerte (SGE, Schweizer Lebensmittelpyramide): Gemüse und Früchte 5 Portionen à
// 120 g (davon 3 Gemüse), Getreide/Kartoffeln 3 Portionen (die Hälfte Vollkorn),
// Milchprodukte 3 Portionen, täglich 1 Portion Proteinlieferant (Fleisch, Fisch, Ei,
// Tofu, Hülsenfrüchte), Nüsse 20–30 g, Süsses/Salziges/Alkohol höchstens 1 kleine Portion.
// Wochen-Richtwerte: Fisch 1–2 Mal, Fleisch inkl. Wurstwaren höchstens 3 Portionen,
// davon Wurstwaren selten, Hülsenfrüchte regelmässig.

/**
 * @typedef {'gemuese' | 'frucht' | 'staerke' | 'vollkorn' | 'milch' | 'fleisch' | 'wurst' | 'fisch' | 'ei'
 *   | 'huelsen' | 'pflanzlProtein' | 'nuss' | 'suess'} GroupKey
 * @typedef {Partial<Record<GroupKey, number>>} Groups Portionen pro Gruppe
 */

export const GROUP_KEYS = /** @type {const} */ ([
  'gemuese',
  'frucht',
  'staerke',
  'vollkorn',
  'milch',
  'fleisch',
  'wurst',
  'fisch',
  'ei',
  'huelsen',
  'pflanzlProtein',
  'nuss',
  'suess',
]);

/** Energie einer «kleinen Portion» Süsses, Salziges oder Alkohol. */
export const SWEET_PORTION_KCAL = 150;

/** Gruppen, die die KI pro Bestandteil angeben kann → Gruppe, Portion in g, Vollkorn. */
export const KI_GROUPS = /** @type {const} */ ({
  gemuese: ['gemuese', 120, 0],
  frucht: ['frucht', 120, 0],
  staerke: ['staerke', 150, 0],
  staerke_vollkorn: ['staerke', 150, 1],
  milch: ['milch', 200, 0],
  kaese: ['milch', 30, 0],
  fleisch: ['fleisch', 110, 0],
  wurst: ['wurst', 50, 0],
  fisch: ['fisch', 110, 0],
  ei: ['ei', 120, 0],
  huelsen: ['huelsen', 150, 0],
  pflanzl_protein: ['pflanzlProtein', 100, 0],
  nuss: ['nuss', 25, 0],
  suess: ['suess', 0, 0],
});

/**
 * Portionen eines Lebensmittels.
 * @param {[string, number, number] | readonly [string, number, number] | null | undefined} gr Gruppe, Portion g, Vollkorn
 * @param {number} grams
 * @param {number} kcal
 * @returns {Groups}
 */
export function portionsFor(gr, grams, kcal) {
  if (!gr || !(grams > 0)) return {};
  const [group, size, whole] = gr;
  const key = /** @type {GroupKey} */ (group);
  const n = group === 'suess' ? kcal / SWEET_PORTION_KCAL : size > 0 ? grams / size : 0;
  if (!(n > 0)) return {};
  const r = Math.round(n * 100) / 100;
  return whole ? { [key]: r, vollkorn: r } : { [key]: r };
}

/**
 * @param {...(Groups | undefined)} list
 * @returns {Groups}
 */
export function addGroups(...list) {
  /** @type {Groups} */
  const out = {};
  for (const g of list) {
    if (!g) continue;
    for (const [k, v] of Object.entries(g)) {
      const key = /** @type {GroupKey} */ (k);
      out[key] = Math.round(((out[key] ?? 0) + v) * 100) / 100;
    }
  }
  return out;
}

/**
 * @param {Groups | undefined} g
 * @param {number} f
 * @returns {Groups | undefined}
 */
export function scaleGroups(g, f) {
  if (!g) return undefined;
  /** @type {Groups} */
  const out = {};
  for (const [k, v] of Object.entries(g)) out[/** @type {GroupKey} */ (k)] = Math.round(v * f * 100) / 100;
  return out;
}

/**
 * @typedef {{
 *   id: string, label: string, value: number, unit: string, target: string,
 *   status: 'ok' | 'low' | 'over' | 'info', detail?: string,
 * }} PyramidRow
 */

/**
 * Tages- und Wochenbilanz nach Pyramide.
 * @param {{ today: { groups?: Groups, kcal: number }[], week: { groups?: Groups, kcal: number }[][] }} p
 *   today: Einträge des Tages; week: Einträge der letzten 7 Tage (inkl. heute)
 */
export function pyramid({ today, week }) {
  const day = addGroups(...today.map((e) => e.groups));
  const wk = addGroups(...week.flat().map((e) => e.groups));
  const kcalDay = today.reduce((a, e) => a + e.kcal, 0);
  const kcalWithGroups = today.filter((e) => e.groups && Object.keys(e.groups).length).reduce((a, e) => a + e.kcal, 0);
  const g = (/** @type {Groups} */ x, /** @type {GroupKey} */ k) => x[k] ?? 0;
  const proteinDay = g(day, 'fleisch') + g(day, 'wurst') + g(day, 'fisch') + g(day, 'ei') + g(day, 'pflanzlProtein') + g(day, 'huelsen');
  const fv = g(day, 'gemuese') + g(day, 'frucht');
  const r1 = (/** @type {number} */ v) => Math.round(v * 10) / 10;
  /** @type {PyramidRow[]} */
  const daily = [
    {
      id: 'fv',
      label: 'Gemüse und Früchte',
      value: r1(fv),
      unit: 'Portionen',
      target: '5 (à 120 g)',
      status: fv >= 5 ? 'ok' : 'low',
      detail: `Gemüse ${r1(g(day, 'gemuese'))} von 3, Früchte ${r1(g(day, 'frucht'))} von 2`,
    },
    {
      id: 'staerke',
      label: 'Getreide, Kartoffeln',
      value: r1(g(day, 'staerke')),
      unit: 'Portionen',
      target: '3, davon die Hälfte Vollkorn',
      status: g(day, 'staerke') >= 2.5 ? 'ok' : 'low',
      detail: `davon Vollkorn ${r1(g(day, 'vollkorn'))}`,
    },
    {
      id: 'milch',
      label: 'Milchprodukte',
      value: r1(g(day, 'milch')),
      unit: 'Portionen',
      target: '3 (2 dl Milch, 1 Becher Joghurt, 30 g Hartkäse)',
      status: g(day, 'milch') >= 2.5 ? 'ok' : 'low',
    },
    {
      id: 'protein',
      label: 'Fleisch, Fisch, Ei, Tofu, Hülsenfrüchte',
      value: r1(proteinDay),
      unit: 'Portionen',
      target: '1 täglich, abwechseln',
      status: proteinDay >= 1 ? 'ok' : 'low',
    },
    {
      id: 'nuss',
      label: 'Nüsse und Samen',
      value: Math.round(g(day, 'nuss') * 25),
      unit: 'g',
      target: '20–30 g',
      status: g(day, 'nuss') >= 0.8 ? 'ok' : 'low',
    },
    {
      id: 'suess',
      label: 'Süsses, Salziges, Alkohol',
      value: r1(g(day, 'suess')),
      unit: 'kleine Portionen',
      target: 'höchstens 1 (à ca. 150 kcal)',
      status: g(day, 'suess') > 1.2 ? 'over' : 'ok',
    },
  ];
  const meat = g(wk, 'fleisch') + g(wk, 'wurst');
  /** @type {PyramidRow[]} */
  const weekly = [
    {
      id: 'fisch',
      label: 'Fisch',
      value: r1(g(wk, 'fisch')),
      unit: 'Portionen',
      target: '1–2 pro Woche',
      status: g(wk, 'fisch') >= 1 ? 'ok' : 'low',
    },
    {
      id: 'fleisch',
      label: 'Fleisch inkl. Wurstwaren',
      value: r1(meat),
      unit: 'Portionen',
      target: 'höchstens 3 pro Woche',
      status: meat > 3.5 ? 'over' : 'ok',
      detail: `davon Wurstwaren ${r1(g(wk, 'wurst'))} (selten)`,
    },
    {
      id: 'huelsen',
      label: 'Hülsenfrüchte',
      value: r1(g(wk, 'huelsen')),
      unit: 'Portionen',
      target: 'mind. 1 pro Woche; Blue Zones: fast täglich',
      status: g(wk, 'huelsen') >= 1 ? 'ok' : 'low',
    },
  ];
  return { daily, weekly, coverage: kcalDay > 0 ? kcalWithGroups / kcalDay : 1, day, week: wk };
}
