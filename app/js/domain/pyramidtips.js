// @ts-check
// Konkrete Ergänzungen, um die Schweizer Lebensmittelpyramide (SGE) heute bzw. diese Woche
// zu erreichen, abgestimmt auf Restbudget, Protein und Vorlieben. Bevorzugt werden
// Lebensmittel mit wenig Energie pro Portion; ist das Budget ausgeschöpft, nur noch Gemüse.

import { foodAmounts } from './micros.js';

/**
 * @typedef {import('../data/foods.js').Food} Food
 * @typedef {{
 *   id: string, label: string, reason: string, food: Food, grams: number, kcal: number, protein: number,
 * }} PyramidTip
 */

/** Kandidaten je Lücke: [Lebensmittel-Schlüssel, Gramm], von leicht nach gehaltvoll. */
const CANDIDATES = /** @type {const} */ ({
  gemuese: [
    ['gurke', 150],
    ['tomate', 150],
    ['peperoni-rot', 120],
    ['broccoli', 150],
    ['rueebli', 120],
    ['zucchetti', 150],
    ['kopfsalat', 80],
    ['fenchel', 150],
  ],
  frucht: [
    ['erdbeeren', 150],
    ['apfel', 150],
    ['kiwi', 150],
    ['orange', 150],
    ['heidelbeeren', 125],
    ['birne', 150],
  ],
  protein: [
    ['magerquark', 150],
    ['huettenkaese', 150],
    ['kabeljau', 150],
    ['pouletbrust', 120],
    ['trutenbrust', 100],
    ['tofu', 150],
    ['ei-hart', 120],
  ],
  milch: [
    ['magerquark', 150],
    ['joghurt', 180],
    ['magermilch', 200],
    ['huettenkaese', 150],
    ['emmentaler', 30],
  ],
  staerke: [
    ['kartoffeln', 200],
    ['vollkornbrot', 60],
    ['haferflocken', 40],
    ['vollreis', 150],
  ],
  nuss: [
    ['baumnuesse', 20],
    ['mandeln', 20],
    ['kuerbiskerne', 20],
  ],
  huelsen: [
    ['linsen', 150],
    ['kichererbsen', 150],
    ['edamame', 100],
    ['kidneybohnen', 150],
  ],
  fisch: [
    ['kabeljau', 150],
    ['forelle', 120],
    ['lachs', 120],
    ['sardinen', 90],
  ],
});

/**
 * @param {{
 *   pyramid: { daily: import('./foodgroups.js').PyramidRow[], weekly: import('./foodgroups.js').PyramidRow[], day: import('./foodgroups.js').Groups },
 *   kcalLeft: number, proteinLeft: number, prefs: import('./micros.js').FoodPrefs, foods: Food[], date: string, limit?: number,
 * }} p
 * @returns {{ tips: PyramidTip[], budgetSpent: boolean }}
 */
export function pyramidTips({ pyramid, kcalLeft, proteinLeft, prefs, foods, date, limit = 4 }) {
  const byKey = new Map(foods.map((f) => [f.k, f]));
  const low = (/** @type {string} */ id, weekly = false) =>
    (weekly ? pyramid.weekly : pyramid.daily).find((r) => r.id === id)?.status === 'low';
  const allowed = (/** @type {Food} */ f) =>
    !(f.t.includes('fisch') && !prefs.fisch) && !(f.t.includes('milch') && !prefs.milch) && !(f.t.includes('fleisch') && !prefs.fleisch);
  const budgetSpent = kcalLeft < 120;
  // Abwechslung: je Tag eine andere Reihenfolge der Kandidaten
  const seed = [...date].reduce((a, c) => a + c.charCodeAt(0), 0);
  /** @type {PyramidTip[]} */
  const tips = [];
  const used = new Set();
  let budget = Math.max(0, kcalLeft);
  /**
   * @param {keyof typeof CANDIDATES} group
   * @param {string} id
   * @param {string} label
   * @param {string} reason
   * @param {number} maxKcal
   */
  const pick = (group, id, label, reason, maxKcal) => {
    const list = CANDIDATES[group];
    for (let i = 0; i < list.length; i++) {
      const [k, grams] = list[(i + seed) % list.length];
      const food = byKey.get(k);
      if (!food || used.has(k) || !allowed(food)) continue;
      const a = foodAmounts(food, grams);
      const kcal = Math.round(a.kcal ?? 0);
      if (kcal > maxKcal) continue;
      used.add(k);
      budget -= kcal;
      tips.push({ id, label, reason, food, grams, kcal, protein: Math.round(a.protein ?? 0) });
      return true;
    }
    return false;
  };
  const g = pyramid.day;
  const veg = g.gemuese ?? 0;
  const fruit = g.frucht ?? 0;
  const fvOpen = Math.max(0, 5 - veg - fruit);
  // 1. Protein, wenn noch deutlich offen (Muskelerhalt im Defizit)
  if (proteinLeft >= 20 && !budgetSpent)
    pick('protein', 'protein', 'Protein', `noch ${Math.round(proteinLeft)} g bis zum Ziel`, Math.max(budget, 0));
  // Budget leicht überschritten, aber viel Protein offen: sehr mageres Protein (≤ 120 kcal) lohnt sich,
  // weil zu wenig Protein im Defizit Muskeln kostet; eine kleine Überschreitung wiegt weniger.
  if (proteinLeft >= 30 && budgetSpent && kcalLeft > -300)
    pick(
      'protein',
      'protein',
      'Protein',
      `noch ${Math.round(proteinLeft)} g offen: lieber leicht über dem Kalorienziel als zu wenig Protein`,
      120,
    );
  // 2. Gemüse geht immer, auch bei ausgeschöpftem Budget
  if (veg < 3) pick('gemuese', 'gemuese', 'Gemüse', `${fmt1(veg)} von 3 Portionen Gemüse`, budgetSpent ? 60 : Math.max(budget, 60));
  if (fvOpen > 1 && veg < 2)
    pick('gemuese', 'gemuese2', 'Gemüse', `noch ${fmt1(fvOpen)} Portionen «5 am Tag»`, budgetSpent ? 60 : Math.max(budget, 60));
  if (!budgetSpent && fruit < 2 && fvOpen > 0) pick('frucht', 'frucht', 'Früchte', `${fmt1(fruit)} von 2 Portionen Früchten`, budget);
  if (!budgetSpent && low('milch')) pick('milch', 'milch', 'Milchprodukte', `${fmt1(g.milch ?? 0)} von 3 Portionen`, budget);
  if (!budgetSpent && low('huelsen', true)) pick('huelsen', 'huelsen', 'Hülsenfrüchte', 'diese Woche noch keine Portion', budget);
  if (!budgetSpent && low('fisch', true)) pick('fisch', 'fisch', 'Fisch', 'diese Woche noch kein Fisch', budget);
  if (!budgetSpent && low('staerke') && budget >= 150)
    pick('staerke', 'staerke', 'Getreide, Kartoffeln', `${fmt1(g.staerke ?? 0)} von 3 Portionen`, budget);
  if (!budgetSpent && low('nuss') && budget >= 120) pick('nuss', 'nuss', 'Nüsse', 'täglich 20–30 g', budget);
  return { tips: tips.slice(0, limit), budgetSpent };
}

/** @param {number} v */
function fmt1(v) {
  return String(Math.round(v * 10) / 10).replace('.', ',');
}

/**
 * Kurzfassung für den KI-Tipp: was heute schon gegessen wurde und was in der Pyramide offen ist.
 * @param {{ names: string[], pyramid: { daily: import('./foodgroups.js').PyramidRow[], weekly: import('./foodgroups.js').PyramidRow[] }, gaps: string[] }} p
 */
export function dayContextText({ names, pyramid, gaps }) {
  const open = [...pyramid.daily, ...pyramid.weekly]
    .filter((r) => r.status === 'low')
    .map((r) => `${r.label} ${fmt1(r.value)} ${r.unit} (Ziel ${r.target})`);
  const over = pyramid.daily.filter((r) => r.status === 'over').map((r) => r.label);
  return [
    names.length ? `Heute schon gegessen: ${names.slice(0, 10).join('; ')}.` : 'Heute noch nichts erfasst.',
    open.length ? `Lebensmittelpyramide noch offen: ${open.join('; ')}.` : 'Lebensmittelpyramide heute erfüllt.',
    over.length ? `Schon über dem Richtwert: ${over.join(', ')}.` : '',
    gaps.length ? `Grösste Nährstofflücken: ${gaps.join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}
