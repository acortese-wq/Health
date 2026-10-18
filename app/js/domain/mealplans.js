// @ts-check
// Ganze Mahlzeiten vorschlagen statt einzelner Zutaten. Die Vorlagen sind nach dem
// Teller-Modell aufgebaut (½ Gemüse, ¼ Protein, ¼ Stärkebeilage) und werden mit der
// Nährwertdatenbank berechnet; bewertet wird, wie gut sie die offenen Lücken, das
// Proteinziel, die Pyramide und das Restbudget treffen.

import { FOODS } from '../data/foods.js';
import { entryFromFood, gaps, NUTRIENTS } from './micros.js';
import { addGroups } from './foodgroups.js';

/** @typedef {'morgen' | 'mittag' | 'zvieri' | 'abend'} Slot */
/**
 * @typedef {{ id: string, name: string, slots: Slot[], parts: [string, number][], note?: string }} MealTemplate
 */

/** @type {MealTemplate[]} */
export const MEAL_TEMPLATES = [
  {
    id: 'porridge',
    name: 'Haferflocken mit Joghurt, Beeren und Baumnüssen',
    slots: ['morgen'],
    parts: [
      ['haferflocken', 50],
      ['joghurt', 180],
      ['heidelbeeren', 100],
      ['baumnuesse', 15],
    ],
  },
  {
    id: 'skyr-bowl',
    name: 'Skyr mit Himbeeren, Leinsamen und Flocken',
    slots: ['morgen', 'zvieri'],
    parts: [
      ['skyr', 200],
      ['himbeeren', 100],
      ['leinsamen', 10],
      ['haferflocken', 20],
    ],
  },
  {
    id: 'brot-huette',
    name: 'Ruchbrot mit Hüttenkäse und Tomate',
    slots: ['morgen', 'zvieri'],
    parts: [
      ['ruchbrot', 100],
      ['huettenkaese', 150],
      ['tomate', 120],
    ],
  },
  {
    id: 'ruehrei',
    name: 'Rührei mit Spinat und Vollkornbrot',
    slots: ['morgen', 'abend'],
    parts: [
      ['ei', 120],
      ['spinat', 150],
      ['vollkornbrot', 50],
      ['rapsoel', 5],
    ],
  },
  {
    id: 'lachs',
    name: 'Lachs mit Kartoffeln und Broccoli',
    slots: ['mittag', 'abend'],
    parts: [
      ['lachs', 125],
      ['kartoffeln', 240],
      ['broccoli', 200],
      ['rapsoel', 5],
    ],
    note: 'Fetter Fisch deckt EPA/DHA für mehrere Tage.',
  },
  {
    id: 'pasta-light',
    name: 'Pasta light: Vollkornteigwaren mit Poulet und Gemüse-Tomatensauce',
    slots: ['mittag', 'abend'],
    parts: [
      ['vollkornpasta', 200],
      ['pouletbrust', 110],
      ['tomatensauce', 150],
      ['zucchetti', 150],
      ['parmesan', 10],
    ],
    note: 'Pasta bleibt: 80 g roh statt 120 g, doppelt Gemüse, Protein dazu.',
  },
  {
    id: 'pasta-thon',
    name: 'Spaghetti mit Thon, Tomaten und Rucola',
    slots: ['mittag', 'abend'],
    parts: [
      ['pasta', 200],
      ['thon', 100],
      ['tomate', 150],
      ['tomatensauce', 100],
      ['rucola', 40],
    ],
  },
  {
    id: 'linsen-bowl',
    name: 'Linsen-Bowl mit Peperoni, Gurke und Feta',
    slots: ['mittag', 'abend'],
    parts: [
      ['linsen', 200],
      ['peperoni-rot', 100],
      ['gurke', 100],
      ['feta', 40],
      ['olivenoel', 5],
    ],
  },
  {
    id: 'poulet-reis',
    name: 'Poulet mit Reis, Erbsen und Rüebli',
    slots: ['mittag', 'abend'],
    parts: [
      ['pouletbrust', 125],
      ['reis', 150],
      ['erbsen', 100],
      ['rueebli', 100],
      ['rapsoel', 5],
    ],
  },
  {
    id: 'forelle',
    name: 'Forelle mit Quinoa und Spinat',
    slots: ['mittag', 'abend'],
    parts: [
      ['forelle', 125],
      ['quinoa', 150],
      ['spinat', 150],
      ['rapsoel', 5],
    ],
  },
  {
    id: 'rind',
    name: 'Rindsfilet mit Süsskartoffel und grünen Bohnen',
    slots: ['mittag', 'abend'],
    parts: [
      ['rindsfilet', 120],
      ['suesskartoffel', 200],
      ['bohnen-gruen', 150],
    ],
  },
  {
    id: 'tofu',
    name: 'Tofu-Gemüse-Pfanne mit Vollreis',
    slots: ['mittag', 'abend'],
    parts: [
      ['tofu', 150],
      ['broccoli', 150],
      ['peperoni-rot', 100],
      ['vollreis', 150],
      ['rapsoel', 5],
    ],
  },
  {
    id: 'salat-ei',
    name: 'Grosser Salat mit Ei, Kichererbsen und Ruchbrot',
    slots: ['mittag', 'abend'],
    parts: [
      ['kopfsalat', 80],
      ['tomate', 120],
      ['gurke', 100],
      ['ei-hart', 100],
      ['kichererbsen', 100],
      ['ruchbrot', 50],
      ['olivenoel', 10],
    ],
  },
  {
    id: 'quark-apfel',
    name: 'Magerquark mit Apfel',
    slots: ['zvieri'],
    parts: [
      ['magerquark', 125],
      ['apfel', 150],
    ],
  },
  {
    id: 'apfel-mandeln',
    name: 'Apfel und Mandeln',
    slots: ['zvieri'],
    parts: [
      ['apfel', 180],
      ['mandeln', 20],
    ],
  },
  {
    id: 'buendner',
    name: 'Bündnerfleisch, Knäckebrot und Rüebli',
    slots: ['zvieri'],
    parts: [
      ['buendnerfleisch', 30],
      ['knaeckebrot', 20],
      ['rueebli', 100],
    ],
  },
  {
    id: 'sardinen',
    name: 'Sardinen auf Vollkornbrot mit Tomate',
    slots: ['zvieri', 'abend'],
    parts: [
      ['sardinen', 80],
      ['vollkornbrot', 100],
      ['tomate', 120],
    ],
  },
];

/** Tagesabschnitt für «nächstes Essen» aus der Uhrzeit. */
export function nextSlot(/** @type {number} */ minutes) {
  if (minutes < 10 * 60 + 30) return /** @type {Slot} */ ('morgen');
  if (minutes < 14 * 60) return /** @type {Slot} */ ('mittag');
  if (minutes < 17 * 60) return /** @type {Slot} */ ('zvieri');
  return /** @type {Slot} */ ('abend');
}

/** Typische Energie pro Abschnitt, als Orientierung für die Auswahl. */
const SLOT_KCAL = { morgen: 450, mittag: 650, zvieri: 250, abend: 600 };

const BY_KEY = new Map(FOODS.map((f) => [f.k, f]));

/**
 * Nährwerte einer Vorlage als ein Eintrag (Summe der Bestandteile).
 * @param {MealTemplate} t
 */
export function mealEntry(t) {
  const parts = t.parts.map(([k, g]) => {
    const food = BY_KEY.get(k);
    if (!food) throw new Error(`Unbekanntes Lebensmittel in Vorlage ${t.id}: ${k}`);
    return { food, e: entryFromFood(food, g) };
  });
  /** @type {import('./micros.js').Amounts} */
  const micros = {};
  for (const { e } of parts) {
    for (const [k, v] of Object.entries(e.micros)) {
      const key = /** @type {import('./micros.js').NutrientKey} */ (k);
      micros[key] = Math.round(((micros[key] ?? 0) + v) * 100) / 100;
    }
  }
  const sum = (/** @type {(e: ReturnType<typeof entryFromFood>) => number} */ pick, d = 0) => {
    const v = parts.reduce((a, p) => a + pick(p.e), 0);
    return d ? Math.round(v * 10) / 10 : Math.round(v);
  };
  return {
    name: t.name,
    kcal: sum((e) => e.kcal),
    protein: sum((e) => e.protein),
    carbs: sum((e) => e.carbs, 1),
    fat: sum((e) => e.fat, 1),
    satFat: sum((e) => e.satFat, 1),
    fiber: sum((e) => e.fiber, 1),
    sugar: sum((e) => e.sugar, 1),
    salt: Math.round(parts.reduce((a, p) => a + p.e.salt, 0) * 100) / 100,
    micros,
    microSrc: /** @type {const} */ ('db'),
    groups: addGroups(...parts.map((p) => p.e.groups)),
    grams: sum((e) => e.grams),
    source: /** @type {const} */ ('datenbank'),
    tags: [...new Set(parts.flatMap((p) => p.food.t))],
  };
}

/**
 * @typedef {{ template: MealTemplate, entry: ReturnType<typeof mealEntry>, score: number, highlights: string[] }} MealSuggestion
 */

/**
 * Mahlzeiten passend zu Tageszeit, Restbudget, Protein, Nährstoff- und Pyramidenlücken.
 * @param {{
 *   slot: Slot, kcalLeft: number, proteinLeft: number, amounts: import('./micros.js').Amounts,
 *   targets: Partial<Record<import('./micros.js').NutrientKey, number>>, prefs: import('./micros.js').FoodPrefs,
 *   dayGroups: import('./foodgroups.js').Groups, weekFish: number, limit?: number,
 * }} p
 * @returns {MealSuggestion[]}
 */
export function suggestMeals({ slot, kcalLeft, proteinLeft, amounts, targets, prefs, dayGroups, weekFish, limit = 2 }) {
  const open = gaps(amounts, targets);
  const labels = Object.fromEntries(NUTRIENTS.map((n) => [n.key, n.label]));
  const want = Math.min(SLOT_KCAL[slot], Math.max(kcalLeft, 150));
  /** @type {MealSuggestion[]} */
  const out = [];
  for (const t of MEAL_TEMPLATES) {
    if (!t.slots.includes(slot)) continue;
    const e = mealEntry(t);
    if (e.tags.includes('fisch') && !prefs.fisch) continue;
    if (e.tags.includes('fleisch') && !prefs.fleisch) continue;
    if (e.tags.includes('milch') && !prefs.milch) continue;
    // Budget: deutlich darüber → nicht vorschlagen
    if (kcalLeft > 0 && e.kcal > kcalLeft + 100) continue;
    let score = 0;
    /** @type {string[]} */
    const highlights = [];
    // Protein: Anteil am offenen Bedarf, wichtigster Faktor gegen Heisshunger
    if (proteinLeft > 0) {
      const share = Math.min(e.protein, proteinLeft) / proteinLeft;
      score += share * 2;
    }
    if (e.protein >= 25) highlights.push(`${e.protein} g Protein`);
    // Nährstofflücken
    const covered = open
      .map((g) => ({ key: g.key, pct: Math.min(1, (e.micros[g.key] ?? (g.key === 'fiber' ? e.fiber : 0)) / g.left) }))
      .filter((c) => c.pct >= 0.4)
      .sort((a, b) => b.pct - a.pct);
    score += covered.reduce((a, c) => a + c.pct, 0) * 0.5;
    if (covered.length)
      highlights.push(
        `deckt ${covered
          .slice(0, 3)
          .map((c) => `${Math.round(c.pct * 100)} % ${labels[c.key]}`)
          .join(', ')}`,
      );
    // Pyramide: fehlendes Gemüse und Fisch der Woche
    const veg = e.groups.gemuese ?? 0;
    const vegMissing = Math.max(0, 3 - (dayGroups.gemuese ?? 0));
    if (veg > 0 && vegMissing > 0) {
      score += Math.min(veg, vegMissing) * 0.4;
      highlights.push(`${Math.round(veg * 10) / 10} Portionen Gemüse`);
    }
    if ((e.groups.fisch ?? 0) > 0 && weekFish < 1) {
      score += 0.8;
      highlights.push('Fisch der Woche');
    }
    // Passende Grösse für den Abschnitt
    score -= (Math.abs(e.kcal - want) / want) * 0.8;
    if (prefs.kantine && e.tags.includes('kantine')) score += 0.1;
    out.push({ template: t, entry: e, score, highlights });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Teller-Modell für Personalrestaurant und auswärts. */
export const CANTEEN_TIPS = [
  'Teller-Modell: die Hälfte Gemüse oder Salat, ein Viertel Protein (Fleisch, Fisch, Ei, Tofu, Hülsenfrüchte), ein Viertel Beilage.',
  'Sauce separat oder wenig; Rahm- und Käsesaucen sind die grössten versteckten Kalorien.',
  'Vegimenü mit Hülsenfrüchten oder Fisch wählen, wenn das Fleisch paniert oder frittiert ist.',
  'Dessert durch Frucht oder Joghurt ersetzen; Süssgetränke durch Wasser.',
  'Langsam essen: Das Sättigungsgefühl kommt nach rund 20 Minuten.',
];
