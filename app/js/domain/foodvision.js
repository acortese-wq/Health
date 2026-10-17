// @ts-check
// Mahlzeiten erfassen per Foto, Beschreibung, Nährwerttabelle oder Barcode:
// Prompts, Antwortschemas, Prüfung, Umrechnung. Ohne DOM und ohne Netzwerk.
//
// Genauigkeit: Auch Fachleute liegen bei Kalorienschätzungen von Fotos oft 20–40 %
// daneben, vor allem wegen unsichtbarer Fette (Öl, Butter, Rahm) und der Portionsgrösse.
// Die App zeigt deshalb immer eine Spanne, die Annahmen und editierbare Grammangaben.
// Für verpackte Produkte sind Nährwerttabelle und Barcode deutlich genauer als ein Foto.

import { clamp, isNum } from './util.js';

/**
 * @typedef {{ kcal: number, protein: number, carbs: number, fat: number, fiber: number, sugar: number, satFat: number, salt: number }} Nutrients
 * @typedef {Nutrients & { kcalLow: number, kcalHigh: number }} ItemValues
 * @typedef {ItemValues & { name: string, portion: string, grams: number, baseGrams: number, base: ItemValues }} MealItem
 * @typedef {{
 *   isFood: boolean, dish: string, items: MealItem[], assumptions: string[],
 *   confidence: 'hoch' | 'mittel' | 'niedrig', tip: string,
 * }} MealEstimate
 * @typedef {{ name: string, brand: string, barcode: string, unit: 'g' | 'ml', servingG: number, per100: Nutrients, source: 'etikett' | 'barcode' }} Product
 */

/** Tagesrichtwerte: Ballaststoffe ≥ 30 g (SGE), Salz < 5 g (WHO). */
export const FIBER_TARGET_G = 30;
export const SALT_LIMIT_G = 5;

const NUTRIENT_PROPS = {
  protein_g: { type: 'number' },
  carbs_g: { type: 'number' },
  sugar_g: { type: 'number', description: 'davon Zucker' },
  fat_g: { type: 'number' },
  satfat_g: { type: 'number', description: 'davon gesättigte Fettsäuren' },
  fiber_g: { type: 'number', description: 'Ballaststoffe' },
  salt_g: { type: 'number', description: 'Salz (Natrium × 2.5)' },
};
const NUTRIENT_KEYS = Object.keys(NUTRIENT_PROPS);

const ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'portion', 'grams', 'kcal', 'kcal_low', 'kcal_high', ...NUTRIENT_KEYS],
  properties: {
    name: { type: 'string', description: 'Bestandteil auf Deutsch, z. B. «Spaghetti, gekocht»' },
    portion: { type: 'string', description: 'Menge in Alltagssprache, z. B. «1 Teller, ca. 2 Schöpfkellen»' },
    grams: { type: 'number', description: 'Geschätztes Gewicht in Gramm (verzehrfertig)' },
    kcal: { type: 'number', description: 'Beste Schätzung in kcal' },
    kcal_low: { type: 'number', description: 'Untere plausible Grenze in kcal' },
    kcal_high: { type: 'number', description: 'Obere plausible Grenze in kcal' },
    ...NUTRIENT_PROPS,
  },
};

/** JSON-Schema für Mahlzeiten (Foto oder Beschreibung). */
export const MEAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['is_food', 'dish', 'items', 'assumptions', 'confidence', 'tip'],
  properties: {
    is_food: { type: 'boolean', description: 'false, wenn keine Mahlzeit oder kein Getränk zu erkennen ist' },
    dish: { type: 'string', description: 'Name des Gerichts auf Deutsch, z. B. «Spaghetti bolognese»' },
    items: { type: 'array', items: ITEM_SCHEMA },
    assumptions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Annahmen, die das Ergebnis stark beeinflussen (Öl, Sauce, Portionsgrösse, Zubereitung)',
    },
    confidence: { type: 'string', enum: ['hoch', 'mittel', 'niedrig'] },
    tip: { type: 'string', description: 'Ein kurzer, konkreter Tipp passend zu den Zielen der Person, oder leer' },
  },
};

/** JSON-Schema für Nährwerttabellen und Barcodes auf Verpackungen. */
export const LABEL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['is_label', 'product', 'brand', 'barcode', 'unit', 'serving_g', 'per100'],
  properties: {
    is_label: { type: 'boolean', description: 'true, wenn eine Nährwerttabelle lesbar ist' },
    product: { type: 'string', description: 'Produktname, falls erkennbar, sonst leer' },
    brand: { type: 'string', description: 'Marke, falls erkennbar, sonst leer' },
    barcode: { type: 'string', description: 'Ziffern des EAN/UPC-Barcodes, falls lesbar, sonst leer' },
    unit: { type: 'string', enum: ['g', 'ml'] },
    serving_g: { type: 'number', description: 'Portionsgrösse laut Packung in g/ml, sonst 0' },
    per100: {
      type: 'object',
      additionalProperties: false,
      required: ['kcal', ...NUTRIENT_KEYS],
      properties: { kcal: { type: 'number' }, ...NUTRIENT_PROPS },
    },
  },
};

export const MEAL_SYSTEM_PROMPT = `Du bist Ernährungswissenschaftler und schätzt Mahlzeiten für ein persönliches Ernährungsprotokoll in der Schweiz. Du erhältst ein Foto oder eine Beschreibung.

Vorgehen:
- Erkenne das Gericht und zerlege es in die wichtigsten Bestandteile (höchstens 8), inklusive Saucen, Toppings und Getränke.
- Schätze die Portion bei Fotos anhand von Bezugsgrössen (Teller ca. 26–28 cm, Besteck, Glas, Hand); bei Beschreibungen nach üblichen Schweizer Portionen. Gramm = verzehrfertiges Gewicht.
- Verwende Nährwerte, wie sie in der Schweizer Nährwertdatenbank bzw. auf Schweizer Produkten üblich sind. Typische Schweizer Gerichte (z. B. Älplermagronen, Rösti, Capuns, Zürcher Geschnetzeltes, Birchermüesli) erkennst du als solche.
- Rechne unsichtbare Energie ein: Bratöl, Butter, Rahm, Dressing, Käse. Das ist die häufigste Fehlerquelle; nenne deine Annahme dazu ausdrücklich.
- Gib pro Bestandteil eine beste Schätzung und eine ehrliche Spanne an (bei Saucen und Frittiertem breiter). Fülle auch Zucker, gesättigte Fette, Ballaststoffe und Salz als Schätzung.
- Angaben der Person (z. B. «halbe Portion», «ohne Sauce») haben Vorrang vor deiner Vermutung.
- Erfinde nichts. Ist kein Essen erkennbar, setze is_food auf false; bei Unsicherheit confidence «niedrig».
- Schreibe auf Deutsch (Schweizer Rechtschreibung, «ss» statt «ß»).`;

export const LABEL_SYSTEM_PROMPT = `Du liest Nährwerttabellen und Barcodes von Lebensmittelverpackungen ab.

- Übernimm die Werte pro 100 g bzw. 100 ml exakt so, wie sie auf der Packung stehen. Rechne nur um, wenn ausschliesslich Werte pro Portion angegeben sind.
- Energie in kcal (nicht kJ). Fehlt ein Wert auf der Packung, setze 0.
- Lies die Barcode-Ziffern (EAN-13, EAN-8, UPC) nur ab, wenn sie eindeutig lesbar sind; sonst leer lassen.
- Ist keine Nährwerttabelle lesbar, setze is_label auf false (ein lesbarer Barcode allein genügt dann).
- Produktname und Marke auf Deutsch bzw. wie auf der Packung.`;

/**
 * Nutzertext für die Mahlzeitenschätzung.
 * @param {{ hint: string, description?: string, proteinLeft: number | null, kcalLeft: number | null }} p
 * @returns {string}
 */
export function userPrompt({ hint, description = '', proteinLeft, kcalLeft }) {
  const lines = [description ? `Schätze diese Mahlzeit: «${description.trim().slice(0, 500)}»` : 'Schätze die Mahlzeit auf dem Foto.'];
  if (hint.trim()) lines.push(`Angabe der Person: «${hint.trim().slice(0, 300)}»`);
  if (kcalLeft !== null && proteinLeft !== null) {
    lines.push(
      `Kontext für den Tipp: Heute noch ca. ${Math.round(kcalLeft)} kcal und ${Math.round(proteinLeft)} g Protein bis zum Tagesziel. Ziel ist Fettabbau bei Muskelerhalt.`,
    );
  }
  return lines.join('\n');
}

/**
 * @param {unknown} v
 * @param {number} max
 */
function num(v, max) {
  return isNum(v) ? clamp(v, 0, max) : 0;
}

/** @param {number} v */
const r1 = (v) => Math.round(v * 10) / 10;

/**
 * Nährwerte aus einem Rohobjekt (Modell-Antwort) lesen.
 * @param {Record<string, unknown>} x
 * @returns {Omit<Nutrients, 'kcal'>}
 */
function readNutrients(x) {
  return {
    protein: r1(num(x.protein_g, 300)),
    carbs: r1(num(x.carbs_g, 600)),
    sugar: r1(num(x.sugar_g, 600)),
    fat: r1(num(x.fat_g, 300)),
    satFat: r1(num(x.satfat_g, 300)),
    fiber: r1(num(x.fiber_g, 150)),
    salt: r1(num(x.salt_g, 50)),
  };
}

/**
 * Prüft und normalisiert die Modellantwort. Wirft bei unbrauchbarer Struktur.
 * @param {unknown} raw
 * @returns {MealEstimate}
 */
export function parseEstimate(raw) {
  if (typeof raw !== 'object' || raw === null) throw new Error('Die Antwort enthält keine Schätzung.');
  const r = /** @type {Record<string, unknown>} */ (raw);
  const items = Array.isArray(r.items) ? r.items : [];
  /** @type {MealItem[]} */
  const parsed = [];
  for (const it of items.slice(0, 12)) {
    if (typeof it !== 'object' || it === null) continue;
    const x = /** @type {Record<string, unknown>} */ (it);
    const kcal = num(x.kcal, 5000);
    // Spanne sicher um den Schätzwert legen, auch wenn das Modell sie vertauscht.
    const lo = Math.min(num(x.kcal_low, 5000) || kcal, kcal);
    const hi = Math.max(num(x.kcal_high, 5000) || kcal, kcal);
    const grams = Math.round(num(x.grams, 3000));
    /** @type {ItemValues} */
    const values = { kcal: Math.round(kcal), kcalLow: Math.round(lo), kcalHigh: Math.round(hi), ...readNutrients(x) };
    parsed.push({
      name: typeof x.name === 'string' && x.name.trim() ? x.name.trim().slice(0, 80) : 'Bestandteil',
      portion: typeof x.portion === 'string' ? x.portion.trim().slice(0, 120) : '',
      grams,
      baseGrams: grams,
      ...values,
      base: values,
    });
  }
  const confidence = r.confidence === 'hoch' || r.confidence === 'niedrig' ? r.confidence : 'mittel';
  return {
    isFood: r.is_food !== false,
    dish: typeof r.dish === 'string' && r.dish.trim() ? r.dish.trim().slice(0, 80) : 'Mahlzeit',
    items: parsed,
    assumptions: Array.isArray(r.assumptions)
      ? r.assumptions
          .filter((a) => typeof a === 'string' && a.trim())
          .map((a) => a.trim().slice(0, 200))
          .slice(0, 6)
      : [],
    confidence,
    tip: typeof r.tip === 'string' ? r.tip.trim().slice(0, 300) : '',
  };
}

/**
 * Bestandteil auf eine neue Grammzahl umrechnen. Gerechnet wird immer von den
 * Originalwerten aus, damit wiederholtes Ändern keine Rundungsfehler aufsummiert.
 * Ohne Grammangabe des Modells bleibt der Bestandteil unverändert.
 * @param {MealItem} item
 * @param {number} grams
 * @returns {MealItem}
 */
export function scaleItem(item, grams) {
  if (!item.baseGrams || !isNum(grams) || grams < 0) return item;
  const f = Math.min(grams, 5000) / item.baseGrams;
  const b = item.base;
  return {
    ...item,
    grams: Math.round(Math.min(grams, 5000)),
    kcal: Math.round(b.kcal * f),
    kcalLow: Math.round(b.kcalLow * f),
    kcalHigh: Math.round(b.kcalHigh * f),
    protein: r1(b.protein * f),
    carbs: r1(b.carbs * f),
    sugar: r1(b.sugar * f),
    fat: r1(b.fat * f),
    satFat: r1(b.satFat * f),
    fiber: r1(b.fiber * f),
    salt: r1(b.salt * f),
  };
}

/**
 * Summen über die gewählten Bestandteile, skaliert mit dem Portionsfaktor.
 * @param {MealItem[]} items
 * @param {number} factor z. B. 0.5 für eine halbe Portion
 */
export function totals(items, factor = 1) {
  const f = clamp(factor, 0.1, 3);
  const sum = (/** @type {(i: MealItem) => number} */ pick, digits = 0) => {
    const v = items.reduce((a, i) => a + pick(i), 0) * f;
    return digits ? Math.round(v * 10) / 10 : Math.round(v);
  };
  return {
    kcal: sum((i) => i.kcal),
    kcalLow: sum((i) => i.kcalLow),
    kcalHigh: sum((i) => i.kcalHigh),
    protein: sum((i) => i.protein),
    carbs: sum((i) => i.carbs),
    sugar: sum((i) => i.sugar),
    fat: sum((i) => i.fat),
    satFat: sum((i) => i.satFat, 1),
    fiber: sum((i) => i.fiber, 1),
    salt: sum((i) => i.salt, 1),
  };
}

/**
 * Plausibilitätsprüfung: Energie aus Makronährstoffen (Atwater 4/4/9, Ballaststoffe 2)
 * gegen die angegebenen kcal. Grosse Abweichung → Hinweis anzeigen.
 * @param {{ kcal: number, protein: number, carbs: number, fat: number, fiber?: number }} t
 * @returns {boolean} true, wenn die Angaben stimmig sind (±25 %)
 */
export function macrosConsistent(t) {
  if (t.kcal < 50) return true;
  const fromMacros = 4 * t.protein + 4 * t.carbs + 9 * t.fat + 2 * (t.fiber ?? 0);
  return Math.abs(fromMacros - t.kcal) / t.kcal <= 0.25;
}

/**
 * «Proteinreich» nach EU-Verordnung 1924/2006: mindestens 20 % der Energie aus Protein.
 * @param {{ kcal: number, protein: number }} t
 */
export function isHighProtein(t) {
  return t.kcal > 0 && (t.protein * 4) / t.kcal >= 0.2;
}

/**
 * Antwort zur Nährwerttabelle prüfen.
 * @param {unknown} raw
 * @returns {{ readable: boolean, product: Product }}
 */
export function parseLabel(raw) {
  if (typeof raw !== 'object' || raw === null) throw new Error('Die Antwort enthält keine Nährwerte.');
  const r = /** @type {Record<string, unknown>} */ (raw);
  const p = typeof r.per100 === 'object' && r.per100 !== null ? /** @type {Record<string, unknown>} */ (r.per100) : {};
  const barcode = typeof r.barcode === 'string' ? r.barcode.replace(/\D/g, '') : '';
  return {
    readable: r.is_label === true,
    product: {
      name: typeof r.product === 'string' && r.product.trim() ? r.product.trim().slice(0, 80) : 'Produkt',
      brand: typeof r.brand === 'string' ? r.brand.trim().slice(0, 60) : '',
      barcode: isValidGtin(barcode) ? barcode : '',
      unit: r.unit === 'ml' ? 'ml' : 'g',
      servingG: Math.round(num(r.serving_g, 2000)),
      per100: { kcal: Math.round(num(p.kcal, 900)), ...readNutrients(p) },
      source: 'etikett',
    },
  };
}

/**
 * Prüfziffer von EAN-8, EAN-13, UPC-A (12) und GTIN-14 kontrollieren.
 * @param {string} code
 */
export function isValidGtin(code) {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop();
  const sum = digits.reverse().reduce((a, d, i) => a + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * Antwort der Open-Food-Facts-API (v2, product) lesen.
 * @param {unknown} json
 * @param {string} barcode
 * @returns {Product | null}
 */
export function parseOpenFoodFacts(json, barcode) {
  if (typeof json !== 'object' || json === null) return null;
  const j = /** @type {Record<string, any>} */ (json);
  if (j.status !== 1 || typeof j.product !== 'object' || j.product === null) return null;
  const pr = j.product;
  const n = typeof pr.nutriments === 'object' && pr.nutriments !== null ? pr.nutriments : {};
  /** @param {string} k */
  const g = (k) => (isNum(Number(n[k])) ? Number(n[k]) : 0);
  const kcal = g('energy-kcal_100g') || g('energy_100g') / 4.184;
  if (!kcal && !g('proteins_100g') && !g('carbohydrates_100g')) return null;
  const name = [pr.product_name_de, pr.product_name, pr.generic_name].find((x) => typeof x === 'string' && x.trim()) ?? 'Produkt';
  const quantity = typeof pr.quantity === 'string' ? pr.quantity : '';
  return {
    name: String(name).trim().slice(0, 80),
    brand: typeof pr.brands === 'string' ? pr.brands.split(',')[0].trim().slice(0, 60) : '',
    barcode,
    unit: /\bml\b|\bcl\b|\bl\b/i.test(quantity) && !/\bg\b/i.test(quantity) ? 'ml' : 'g',
    servingG: Math.round(num(Number(pr.serving_quantity), 2000)),
    per100: {
      kcal: Math.round(num(kcal, 900)),
      protein: r1(num(g('proteins_100g'), 100)),
      carbs: r1(num(g('carbohydrates_100g'), 100)),
      sugar: r1(num(g('sugars_100g'), 100)),
      fat: r1(num(g('fat_100g'), 100)),
      satFat: r1(num(g('saturated-fat_100g'), 100)),
      fiber: r1(num(g('fiber_100g'), 100)),
      salt: r1(num(g('salt_100g'), 100)),
    },
    source: 'barcode',
  };
}

/**
 * Nährwerte für eine gegessene Menge eines Produkts.
 * @param {Product} p
 * @param {number} grams
 * @returns {Nutrients}
 */
export function productPortion(p, grams) {
  const f = clamp(grams, 0, 5000) / 100;
  const v = p.per100;
  return {
    kcal: Math.round(v.kcal * f),
    protein: r1(v.protein * f),
    carbs: r1(v.carbs * f),
    sugar: r1(v.sugar * f),
    fat: r1(v.fat * f),
    satFat: r1(v.satFat * f),
    fiber: r1(v.fiber * f),
    salt: r1(v.salt * f),
  };
}
