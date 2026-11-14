// @ts-check
// Gezielt auffüllen: Lebensmittel und Rezepte, die viel von einem Nährstoff liefern, und belegte
// Tipps zur Aufnahme. Rangfolge nach Menge pro Portion, mit leichtem Abzug für sehr kalorienreiche
// Portionen (damit beim Abnehmen nicht nur Nüsse und Käse oben stehen).

import { foodAmounts, NUTRIENTS, gaps } from './micros.js';
import { recipeNutrition } from './recipes.js';

/**
 * @typedef {import('./micros.js').NutrientKey} NutrientKey
 * @typedef {import('../data/foods.js').Food} Food
 */

/** Nährstoffe, die sich «auffüllen» lassen (Ziele, keine Obergrenzen). */
export const REPLENISHABLE = NUTRIENTS.filter((n) => n.kind === 'target' && !['carbs', 'fat'].includes(n.key)).map((n) => n.key);

/**
 * Lebensmittel mit viel von einem Nährstoff pro üblicher Portion.
 * @param {Food[]} foods
 * @param {NutrientKey} key
 * @param {{ prefs?: { fisch: boolean, milch: boolean, fleisch: boolean }, target?: number, limit?: number }} [o]
 */
export function richFoods(foods, key, { prefs, target, limit = 8 } = {}) {
  return foods
    .filter((f) => {
      if (f.t.includes('nosuggest') || typeof f.v[key] !== 'number') return false;
      if (prefs && f.t.includes('fisch') && !prefs.fisch) return false;
      if (prefs && f.t.includes('milch') && !prefs.milch) return false;
      if (prefs && f.t.includes('fleisch') && !prefs.fleisch) return false;
      return true;
    })
    .map((f) => {
      const a = foodAmounts(f, f.g);
      const amount = a[key] ?? 0;
      const kcal = a.kcal ?? 0;
      return {
        food: f,
        grams: f.g,
        portion: f.p,
        amount,
        kcal,
        pct: target ? amount / target : null,
        score: amount / Math.sqrt(Math.max(kcal, 50) / 100),
      };
    })
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Rezepte mit viel von einem Nährstoff pro Portion (nur berechnete).
 * @param {import('./recipes.js').Recipe[]} recipes
 * @param {NutrientKey} key
 * @param {{ target?: number, limit?: number }} [o]
 */
export function richRecipes(recipes, key, { target, limit = 3 } = {}) {
  return recipes
    .flatMap((r) => {
      const n = recipeNutrition(r);
      const ps = n.perServing;
      if (!ps) return [];
      const amount = /** @type {Record<string, number | undefined>} */ (ps.micros)[key] ?? /** @type {Record<string, any>} */ (ps)[key];
      return typeof amount === 'number' && amount > 0
        ? [{ recipe: r, amount, kcal: ps.kcal, pct: target ? amount / target : null, partial: n.status !== 'berechnet' }]
        : [];
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

/**
 * Knappster Nährstoff (gegenüber dem Ziel), für die Vorauswahl.
 * @param {import('./micros.js').Amounts} amounts
 * @param {Partial<Record<NutrientKey, number>>} targets
 * @returns {NutrientKey | null}
 */
export function weakest(amounts, targets) {
  const g = gaps(amounts, targets).filter((x) => REPLENISHABLE.includes(x.key));
  return g[0]?.key ?? null;
}

/** Belegte Tipps zur Aufnahme, wo es sie gibt. */
export const ABSORPTION = /** @type {Partial<Record<NutrientKey, { text: string, ref?: string }[]>>} */ ({
  iron: [
    {
      text: 'Eisen aus Fleisch und Fisch (Häm-Eisen) nimmt der Körper deutlich besser auf als aus Pflanzen. Vitamin C in derselben Mahlzeit (Paprika, Orange, Kiwi) verbessert die Aufnahme aus pflanzlichen Quellen.',
      ref: 'Hurrell R, Egli I, Am J Clin Nutr 2010;91:1461S–1467S',
    },
    {
      text: 'Kaffee und Schwarztee zur Mahlzeit hemmen die Eisenaufnahme. Besser 1 bis 2 Stunden Abstand.',
      ref: 'Morck TA et al., Am J Clin Nutr 1983;37:416–420; Disler PB et al., Gut 1975;16:193–200',
    },
    {
      text: 'Viel Calcium (Milch, Käse) in derselben Mahlzeit hemmt ebenfalls. Eisenreiches lieber nicht mit einem grossen Glas Milch kombinieren.',
      ref: 'Hurrell R, Egli I, Am J Clin Nutr 2010;91:1461S–1467S',
    },
    { text: 'Ein Mangel lässt sich nur im Blut feststellen (Ferritin). Eisen nie auf Verdacht hoch dosiert einnehmen.' },
  ],
  epaDha: [
    {
      text: 'EPA und DHA stecken fast nur in fettem Fisch wie Lachs, Hering, Makrele oder Sardinen. Empfohlen sind 1 bis 2 Fischmahlzeiten pro Woche.',
    },
    {
      text: 'Pflanzliches Omega-3 (Leinöl, Rapsöl, Baumnüsse) wandelt der Körper nur in kleinen Mengen in EPA und kaum in DHA um. Es ersetzt Fisch nicht ganz.',
      ref: 'Burdge GC, Calder PC, Reprod Nutr Dev 2005;45:581–597',
    },
  ],
  ala: [{ text: 'Rapsöl statt Sonnenblumenöl zum Kochen, ein Löffel Leinöl im Joghurt oder eine Handvoll Baumnüsse decken den Bedarf.' }],
  vitD: [
    {
      text: 'Über das Essen ist Vitamin D kaum zu decken; fetter Fisch und Eier liefern am meisten. Im Sommer bildet die Haut es mit Sonnenlicht.',
    },
    {
      text: 'Im Winterhalbjahr empfehlen die Schweizer Behörden vielen Erwachsenen ein Präparat (15 µg, ab 60 Jahren 20 µg).',
      ref: 'Eidg. Ernährungskommission, Vitamin D-Mangel 2012',
    },
  ],
  b12: [
    {
      text: 'Vitamin B12 gibt es praktisch nur in tierischen Lebensmitteln (Fleisch, Fisch, Eier, Milchprodukte). Bei veganer Ernährung braucht es ein Präparat.',
    },
  ],
  calcium: [
    {
      text: 'Milchprodukte sind die einfachste Quelle. Ohne Milch: calciumreiches Mineralwasser (über 300 mg pro Liter), Tofu mit Calcium, grünes Gemüse wie Brokkoli.',
    },
  ],
  folate: [{ text: 'Folat ist hitzeempfindlich: Blattgemüse, Hülsenfrüchte und Kohl nur kurz garen oder roh essen.' }],
  iodine: [
    {
      text: 'In der Schweiz kommt Jod vor allem aus Jodsalz. Salz im Haushalt immer jodiert kaufen; Meerfisch und Milchprodukte liefern zusätzlich.',
    },
  ],
  magnesium: [{ text: 'Vollkorn, Hülsenfrüchte, Nüsse und Samen liefern viel Magnesium; auch Mineralwasser kann eine gute Quelle sein.' }],
  zinc: [
    {
      text: 'Fleisch, Käse und Hülsenfrüchte liefern Zink. Einweichen von Hülsenfrüchten und Sauerteigbrot verbessern die Aufnahme aus Pflanzen.',
    },
  ],
  vitA: [{ text: 'Beta-Carotin aus Rüebli, Süsskartoffeln oder Spinat wird mit etwas Fett (z. B. ein Teelöffel Öl) besser aufgenommen.' }],
  vitC: [{ text: 'Vitamin C ist hitzeempfindlich: Paprika, Kiwi, Beeren oder Zitrusfrüchte am besten roh.' }],
  selenium: [{ text: 'Eine einzige Paranuss kann den Tagesbedarf an Selen decken. Mehr als zwei pro Tag sind nicht nötig.' }],
  protein: [{ text: 'Protein über den Tag verteilen, 25 bis 30 g pro Hauptmahlzeit: Skyr, Eier, Fisch, Poulet, Hülsenfrüchte, Tofu.' }],
  fiber: [
    { text: 'Vollkorn statt Weissmehl, täglich Hülsenfrüchte oder Gemüse, und genug trinken: So kommen 30 g Ballaststoffe zusammen.' },
  ],
});
