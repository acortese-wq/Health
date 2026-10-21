// @ts-check
// Einheiten für Rezeptzutaten und ihre Umrechnung in Gramm. Grundsatz: nichts raten.
// - g, kg: direkt.
// - ml, l: nur mit hinterlegter Dichte (Tabelle unten), sonst nicht umrechenbar.
// - Stück: nur, wenn die Datenbank-Portion ein Stück beschreibt («1 Ei» = 60 g, «4 Stück» = 120 g).
// - EL, TL: nur, wenn die Datenbank-Portion in EL angegeben ist («1 EL Rapsöl» = 10 g); TL = EL / 3.
// Nicht umrechenbare Zutaten zählen nicht zu den Nährwerten; das Rezept gilt dann als
// «teilweise berechnet» und die Summen als Untergrenze.

/** @typedef {'g' | 'kg' | 'ml' | 'l' | 'EL' | 'TL' | 'Stück'} Unit */

export const UNITS = /** @type {const} */ (['g', 'kg', 'ml', 'l', 'EL', 'TL', 'Stück']);

/** Einheitenfamilien für die Einkaufsliste (nur innerhalb einer Familie wird addiert). */
export const UNIT_FAMILY = /** @type {Record<Unit, 'masse' | 'volumen' | 'stueck' | 'loeffel'>} */ ({
  g: 'masse',
  kg: 'masse',
  ml: 'volumen',
  l: 'volumen',
  Stück: 'stueck',
  EL: 'loeffel',
  TL: 'loeffel',
});

/**
 * Dichte (g/ml) für Flüssigkeiten der Datenbank. Werte gerundet nach üblichen Tabellenwerten
 * (Milch ca. 1.03, Speiseöle ca. 0.91–0.92, wässrige Flüssigkeiten ca. 1.0).
 */
export const DENSITY = /** @type {Record<string, number>} */ ({
  milch: 1.03,
  'milch-teilentrahmt': 1.03,
  magermilch: 1.03,
  sojadrink: 1.03,
  orangensaft: 1.04,
  kaffee: 1.0,
  rahm: 1.0,
  olivenoel: 0.91,
  rapsoel: 0.92,
  'blv-13405': 0.92,
  'blv-14107': 0.92,
  'blv-664': 1.0,
  'blv-665': 1.0,
  'blv-668': 1.0,
  'blv-605': 1.03,
});

/** Behälter- und Mengenwörter in Portionsangaben, die kein Stück bedeuten. */
const NOT_PIECE = /^(portion|schale|handvoll|glas|teller|becher|el|tl|scheibe|scheiben|tranchen|reihen|tasse|dose|packung|würfel|schnitz)/i;

/**
 * Gewicht eines Stücks aus der Datenbank-Portion («1 Ei» = 60 g → 60; «4 Stück» = 120 g → 30).
 * @param {{ p: string, g: number } | undefined} food
 * @returns {number | null}
 */
export function pieceGrams(food) {
  if (!food) return null;
  const m = /^(\d+|½)\s+(\S+)/.exec(food.p.trim());
  if (!m || NOT_PIECE.test(m[2])) return null;
  const n = m[1] === '½' ? 0.5 : Number(m[1]);
  return n > 0 ? Math.round((food.g / n) * 10) / 10 : null;
}

/**
 * Gewicht eines Esslöffels aus der Datenbank-Portion («2 EL» = 20 g → 10).
 * @param {{ p: string, g: number } | undefined} food
 * @returns {number | null}
 */
export function spoonGrams(food) {
  if (!food) return null;
  const m = /^(\d+)\s+EL\b/.exec(food.p.trim());
  return m ? Math.round((food.g / Number(m[1])) * 10) / 10 : null;
}

/**
 * Menge einer Zutat in Gramm.
 * @param {{ p: string, g: number, k: string } | undefined} food
 * @param {number} amount
 * @param {Unit} unit
 * @returns {{ grams: number | null, basis: string }}
 */
export function toGrams(food, amount, unit) {
  if (!(amount >= 0)) return { grams: null, basis: 'Menge fehlt' };
  switch (unit) {
    case 'g':
      return { grams: amount, basis: 'direkt' };
    case 'kg':
      return { grams: amount * 1000, basis: 'direkt' };
    case 'ml':
    case 'l': {
      const d = food ? DENSITY[food.k] : undefined;
      if (!d) return { grams: null, basis: 'keine Dichte hinterlegt' };
      return { grams: Math.round(amount * (unit === 'l' ? 1000 : 1) * d * 10) / 10, basis: `Dichte ${d} g/ml` };
    }
    case 'Stück': {
      const g = pieceGrams(food);
      return g
        ? { grams: Math.round(amount * g * 10) / 10, basis: `1 Stück ≈ ${g} g (Datenbank)` }
        : { grams: null, basis: 'kein Stückgewicht' };
    }
    case 'EL':
    case 'TL': {
      const g = spoonGrams(food);
      if (!g) return { grams: null, basis: 'kein Löffelgewicht' };
      const per = unit === 'EL' ? g : Math.round((g / 3) * 10) / 10;
      return { grams: Math.round(amount * per * 10) / 10, basis: `1 ${unit} ≈ ${per} g (Datenbank)` };
    }
    default:
      return { grams: null, basis: 'unbekannte Einheit' };
  }
}

/**
 * Menge für die Anzeige in die passende Einheit bringen (1200 g → 1.2 kg).
 * @param {number} amount
 * @param {Unit} unit
 * @returns {{ amount: number, unit: Unit }}
 */
export function normalizeUnit(amount, unit) {
  if (unit === 'g' && amount >= 1000) return { amount: Math.round(amount / 10) / 100, unit: 'kg' };
  if (unit === 'ml' && amount >= 1000) return { amount: Math.round(amount / 10) / 100, unit: 'l' };
  if (unit === 'kg') return { amount: Math.round(amount * 100) / 100, unit };
  return { amount: Math.round(amount * 10) / 10, unit };
}

/**
 * In die Grundeinheit der Familie (g, ml, Stück, TL) umrechnen, für das Zusammenzählen.
 * @param {number} amount
 * @param {Unit} unit
 * @returns {{ amount: number, unit: Unit }}
 */
export function baseUnit(amount, unit) {
  if (unit === 'kg') return { amount: amount * 1000, unit: 'g' };
  if (unit === 'l') return { amount: amount * 1000, unit: 'ml' };
  if (unit === 'EL') return { amount: amount * 3, unit: 'TL' };
  return { amount, unit };
}
