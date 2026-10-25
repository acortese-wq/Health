// @ts-check
// Mahlzeiten erfassen per Foto, Beschreibung, Nährwerttabelle oder Barcode:
// Prompts, Antwortschemas, Prüfung, Umrechnung. Ohne DOM und ohne Netzwerk.
//
// Genauigkeit: Auch Fachleute liegen bei Kalorienschätzungen von Fotos oft 20–40 %
// daneben, vor allem wegen unsichtbarer Fette (Öl, Butter, Rahm) und der Portionsgrösse.
// Die App zeigt deshalb immer eine Spanne, die Annahmen und editierbare Grammangaben.
// Für verpackte Produkte sind Nährwerttabelle und Barcode deutlich genauer als ein Foto.

import { clamp, isNum } from './util.js';
import { FOODS } from '../data/foods.js';
import { foodAmounts, pickMicros, scaleMicros } from './micros.js';
import { KI_GROUPS, portionsFor, scaleGroups, addGroups } from './foodgroups.js';

/**
 * @typedef {{
 *   kcal: number, protein: number, carbs: number, fat: number, fiber: number, sugar: number, satFat: number, salt: number,
 *   micros?: import('./micros.js').Amounts, microSrc?: 'db' | 'ki' | 'mix' | 'etikett',
 *   groups?: import('./foodgroups.js').Groups, nova?: number,
 * }} Nutrients
 * @typedef {Nutrients & { kcalLow: number, kcalHigh: number, dbKey?: string }} ItemValues
 * @typedef {ItemValues & { name: string, portion: string, grams: number, baseGrams: number, base: ItemValues }} MealItem
 * @typedef {{
 *   isFood: boolean, dish: string, items: MealItem[], assumptions: string[],
 *   confidence: 'hoch' | 'mittel' | 'niedrig', tip: string,
 * }} MealEstimate
 * @typedef {{
 *   name: string, brand: string, barcode: string, unit: 'g' | 'ml', servingG: number, per100: Nutrients,
 *   source: 'etikett' | 'barcode', stores?: string, nova?: number,
 * }} Product
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

/** Mikronährstoffe im Antwortschema → Schlüssel in der App. */
const MICRO_FIELDS = /** @type {const} */ ({
  sodium: 'sodium_mg',
  cholesterol: 'cholesterol_mg',
  potassium: 'potassium_mg',
  calcium: 'calcium_mg',
  iron: 'iron_mg',
  magnesium: 'magnesium_mg',
  phosphorus: 'phosphorus_mg',
  zinc: 'zinc_mg',
  selenium: 'selenium_ug',
  iodine: 'iodine_ug',
  vitA: 'vit_a_ug_rae',
  vitC: 'vit_c_mg',
  vitD: 'vit_d_ug',
  vitE: 'vit_e_mg',
  vitK: 'vit_k_ug',
  b1: 'vit_b1_mg',
  b2: 'vit_b2_mg',
  niacin: 'niacin_mg',
  b5: 'pantothenic_acid_mg',
  b6: 'vit_b6_mg',
  folate: 'folate_ug_dfe',
  b12: 'vit_b12_ug',
  ala: 'alpha_linolenic_acid_g',
  epaDha: 'epa_plus_dha_mg',
});
const MICRO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: Object.values(MICRO_FIELDS),
  properties: Object.fromEntries(Object.values(MICRO_FIELDS).map((f) => [f, { type: 'number' }])),
  description: 'Geschätzte Mikronährstoffe für die angegebene Grammzahl',
};
const FOOD_BY_KEY = new Map(FOODS.filter((f) => f.c).map((f) => [f.k, f]));

const ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'portion', 'grams', 'kcal', 'kcal_low', 'kcal_high', ...NUTRIENT_KEYS, 'db_key', 'food_group', 'micros'],
  properties: {
    name: { type: 'string', description: 'Bestandteil auf Deutsch, z. B. «Spaghetti, gekocht»' },
    portion: { type: 'string', description: 'Menge in Alltagssprache, z. B. «1 Teller, ca. 2 Schöpfkellen»' },
    grams: { type: 'number', description: 'Geschätztes Gewicht in Gramm (verzehrfertig)' },
    kcal: { type: 'number', description: 'Beste Schätzung in kcal' },
    kcal_low: { type: 'number', description: 'Untere plausible Grenze in kcal' },
    kcal_high: { type: 'number', description: 'Obere plausible Grenze in kcal' },
    ...NUTRIENT_PROPS,
    db_key: { type: 'string', description: 'Schlüssel aus der Lebensmittelliste, wenn er passt, sonst leer' },
    food_group: {
      type: 'string',
      enum: [...Object.keys(KI_GROUPS), 'keine'],
      description: 'Gruppe der Schweizer Lebensmittelpyramide; «keine» für Fette, Öle, Saucen, Getränke ohne Zucker',
    },
    micros: MICRO_SCHEMA,
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
    tip: {
      type: 'string',
      description:
        'Konkreter Vorschlag für die nächste Mahlzeit passend zum Tageskontext, höchstens 2 vollständige Sätze (max. 250 Zeichen), oder leer',
    },
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
- Verwende Nährwerte, wie sie in der Schweizer Nährwertdatenbank (BLV) bzw. auf Schweizer Produkten üblich sind. Typische Schweizer Gerichte (z. B. Älplermagronen, Rösti, Capuns, Zürcher Geschnetzeltes, Birchermüesli) erkennst du als solche.
- Rechne unsichtbare Energie ein: Bratöl, Butter, Rahm, Dressing, Käse. Das ist die häufigste Fehlerquelle; nenne deine Annahme dazu ausdrücklich.
- Gib pro Bestandteil eine beste Schätzung und eine ehrliche Spanne an (bei Saucen und Frittiertem breiter). Fülle auch Zucker, gesättigte Fette, Ballaststoffe und Salz als Schätzung.
- Angaben der Person (z. B. «halbe Portion», «ohne Sauce») haben Vorrang vor deiner Vermutung.
- Erfinde nichts. Ist kein Essen erkennbar, setze is_food auf false; bei Unsicherheit confidence «niedrig».
- Schreibe auf Deutsch (Schweizer Rechtschreibung, «ss» statt «ß»).

Tipp (Feld tip):
- Höchstens zwei vollständige Sätze, maximal 250 Zeichen, nie mitten im Satz aufhören.
- Bezieh dich auf den Tageskontext (was schon gegessen wurde, offene Gruppen der Lebensmittelpyramide, Protein, Restbudget) und schlage eine konkrete nächste Mahlzeit oder Ergänzung mit Menge vor (z. B. «Zum Znacht 150 g Kabeljau mit 200 g Broccoli»).

Mikronährstoffe:
- Setze db_key auf den passenden Schlüssel aus der Lebensmittelliste unten, wenn der Bestandteil im Wesentlichen diesem Lebensmittel in gleicher Zubereitung entspricht (z. B. «Spaghetti, gekocht» → pasta). Für zusammengesetzte Saucen, Fertiggerichte oder Unpassendes leer lassen.
- Schätze micros für jeden Bestandteil trotzdem (Menge für die angegebenen Gramm). Rechne mit Schweizer, nicht angereicherten Lebensmitteln.
- food_group: Gruppe der Schweizer Lebensmittelpyramide pro Bestandteil (Zerlege gemischte Gerichte so, dass jeder Bestandteil eine Gruppe hat; Wurstwaren als «wurst», Käse als «kaese», Süsses, Snacks und Alkohol als «suess»).

Lebensmittelliste (Schlüssel=Name):
${FOODS.filter((f) => f.c)
  .map((f) => `${f.k}=${f.n}`)
  .join('; ')}`;

export const LABEL_SYSTEM_PROMPT = `Du liest Nährwerttabellen und Barcodes von Lebensmittelverpackungen ab.

- Übernimm die Werte pro 100 g bzw. 100 ml exakt so, wie sie auf der Packung stehen. Rechne nur um, wenn ausschliesslich Werte pro Portion angegeben sind.
- Energie in kcal (nicht kJ). Fehlt ein Wert auf der Packung, setze 0.
- Lies die Barcode-Ziffern (EAN-13, EAN-8, UPC) nur ab, wenn sie eindeutig lesbar sind; sonst leer lassen.
- Ist keine Nährwerttabelle lesbar, setze is_label auf false (ein lesbarer Barcode allein genügt dann).
- Produktname und Marke auf Deutsch bzw. wie auf der Packung.`;

/**
 * Text kürzen, ohne mitten im Satz abzubrechen: am letzten Satzende, sonst am Wortende mit «…».
 * @param {string} text
 * @param {number} max
 */
export function clipText(text, max) {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (end > max * 0.4) return cut.slice(0, end + 1);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : max).replace(/[,;:(\s]+$/, '')} …`;
}

/**
 * Nutzertext für die Mahlzeitenschätzung.
 * @param {{ hint: string, description?: string, proteinLeft: number | null, kcalLeft: number | null, dayContext?: string }} p
 * @returns {string}
 */
export function userPrompt({ hint, description = '', proteinLeft, kcalLeft, dayContext = '' }) {
  const lines = [description ? `Schätze diese Mahlzeit: «${description.trim().slice(0, 500)}»` : 'Schätze die Mahlzeit auf dem Foto.'];
  if (hint.trim()) lines.push(`Angabe der Person: «${hint.trim().slice(0, 300)}»`);
  if (kcalLeft !== null && proteinLeft !== null) {
    lines.push(
      `Kontext für den Tipp: Heute noch ca. ${Math.round(kcalLeft)} kcal und ${Math.round(proteinLeft)} g Protein bis zum Tagesziel. Ziel ist Fettabbau bei Muskelerhalt.`,
    );
  }
  if (dayContext.trim()) lines.push(`Tageskontext: ${dayContext.trim().slice(0, 1500)}`);
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
 * Mikronährstoffe eines Bestandteils: aus der Datenbank, wenn der Schlüssel passt und eine
 * Grammzahl vorliegt, sonst die Schätzung des Modells (begrenzt auf plausible Werte).
 * @param {Record<string, unknown>} x
 * @param {number} grams
 * @returns {{ micros?: import('./micros.js').Amounts, microSrc?: 'db' | 'ki', dbKey?: string, groups?: import('./foodgroups.js').Groups }}
 */
function readMicros(x, grams) {
  const food = typeof x.db_key === 'string' ? FOOD_BY_KEY.get(x.db_key.trim()) : undefined;
  const kcal = num(x.kcal, 5000);
  const kiGroup =
    typeof x.food_group === 'string' && x.food_group in KI_GROUPS ? KI_GROUPS[/** @type {keyof typeof KI_GROUPS} */ (x.food_group)] : null;
  const groups = portionsFor(food?.gr ?? kiGroup, grams, kcal);
  const withGroups = Object.keys(groups).length ? { groups } : {};
  if (food && grams > 0) return { micros: pickMicros(foodAmounts(food, grams)), microSrc: 'db', dbKey: food.k, ...withGroups };
  if (typeof x.micros !== 'object' || x.micros === null) return {};
  const m = /** @type {Record<string, unknown>} */ (x.micros);
  /** @type {import('./micros.js').Amounts} */
  const raw = {};
  for (const [key, field] of Object.entries(MICRO_FIELDS)) raw[/** @type {keyof typeof MICRO_FIELDS} */ (key)] = num(m[field], 50000);
  const micros = pickMicros(raw);
  return Object.values(micros).some((v) => v > 0) ? { micros, microSrc: 'ki', ...withGroups } : withGroups;
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
    const values = {
      kcal: Math.round(kcal),
      kcalLow: Math.round(lo),
      kcalHigh: Math.round(hi),
      ...readNutrients(x),
      ...readMicros(x, grams),
    };
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
    tip: typeof r.tip === 'string' ? clipText(r.tip, 600) : '',
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
    ...(b.micros ? { micros: scaleMicros(b.micros, f) } : {}),
    ...(b.groups ? { groups: scaleGroups(b.groups, f) } : {}),
  };
}

/**
 * Bestandteil aus der Nährwertdatenbank (z. B. vergessene Sauce oder Beilage ergänzen).
 * Werte pro Gramm sind bekannt; die Spanne entspricht dem Wert (Unsicherheit liegt nur in der Menge).
 * @param {import('../data/foods.js').Food} food
 * @param {number} [grams] Standard: Datenbank-Portion
 * @returns {MealItem}
 */
export function itemFromFood(food, grams = food.g || 100) {
  const a = foodAmounts(food, grams);
  const kcal = Math.round(a.kcal ?? 0);
  /** @type {ItemValues} */
  const values = {
    kcal,
    kcalLow: kcal,
    kcalHigh: kcal,
    protein: r1(a.protein ?? 0),
    carbs: r1(a.carbs ?? 0),
    sugar: r1(a.sugar ?? 0),
    fat: r1(a.fat ?? 0),
    satFat: r1(a.satFat ?? 0),
    fiber: r1(a.fiber ?? 0),
    salt: Math.round((((a.sodium ?? 0) * 2.5) / 1000) * 100) / 100,
    micros: pickMicros(a),
    microSrc: 'db',
    ...(food.gr ? { groups: portionsFor(food.gr, grams, kcal) } : {}),
    dbKey: food.k,
  };
  return {
    ...values,
    name: food.n,
    portion: food.g === grams ? food.p : '',
    grams: Math.round(grams),
    baseGrams: Math.round(grams),
    base: values,
  };
}

/**
 * Schrittweite für ± bei einem Bestandteil: ein Viertel der geschätzten Menge, auf 5 g gerundet.
 * @param {MealItem} item
 */
export function gramStep(item) {
  return Math.max(5, Math.round(item.baseGrams / 4 / 5) * 5);
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
    ...sumMicros(items, f),
    ...(items.some((i) => i.groups) ? { groups: scaleGroups(addGroups(...items.map((i) => i.groups)), f) } : {}),
  };
}

/**
 * Mikronährstoffe summieren. Herkunft: «db», «ki» oder «mix»; fehlen sie bei einem
 * Bestandteil, gilt die Summe als Mindestwert (Herkunft «mix»).
 * @param {MealItem[]} items
 * @param {number} f
 * @returns {{ micros?: import('./micros.js').Amounts, microSrc?: 'db' | 'ki' | 'mix' }}
 */
function sumMicros(items, f) {
  const withMicros = items.filter((i) => i.micros);
  if (!withMicros.length) return {};
  /** @type {import('./micros.js').Amounts} */
  const sum = {};
  for (const i of withMicros) {
    for (const [k, v] of Object.entries(i.micros ?? {})) {
      const key = /** @type {import('./micros.js').NutrientKey} */ (k);
      sum[key] = (sum[key] ?? 0) + v * f;
    }
  }
  const srcs = new Set(withMicros.map((i) => i.microSrc));
  const microSrc = withMicros.length < items.length || srcs.size > 1 ? 'mix' : srcs.has('db') ? 'db' : 'ki';
  return { micros: pickMicros(sum), microSrc };
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
  return parseOffProduct(j.product, barcode);
}

/**
 * Vitamine und Mineralstoffe in Open Food Facts: Werte pro 100 g in Gramm, umgerechnet in
 * die Einheit der App. Unplausible Angaben (Tippfehler in der Datenbank) werden verworfen.
 */
const OFF_MICROS = /** @type {const} */ ([
  ['sodium', 'sodium', 1e3, 40000],
  ['cholesterol', 'cholesterol', 1e3, 3000],
  ['potassium', 'potassium', 1e3, 10000],
  ['calcium', 'calcium', 1e3, 5000],
  ['iron', 'iron', 1e3, 100],
  ['magnesium', 'magnesium', 1e3, 2000],
  ['phosphorus', 'phosphorus', 1e3, 5000],
  ['zinc', 'zinc', 1e3, 100],
  ['selenium', 'selenium', 1e6, 1000],
  ['iodine', 'iodine', 1e6, 2000],
  ['vitA', 'vitamin-a', 1e6, 10000],
  ['vitC', 'vitamin-c', 1e3, 2000],
  ['vitD', 'vitamin-d', 1e6, 200],
  ['vitE', 'vitamin-e', 1e3, 200],
  ['vitK', 'vitamin-k', 1e6, 2000],
  ['b1', 'vitamin-b1', 1e3, 20],
  ['b2', 'vitamin-b2', 1e3, 20],
  ['niacin', 'vitamin-pp', 1e3, 200],
  ['b5', 'pantothenic-acid', 1e3, 100],
  ['b6', 'vitamin-b6', 1e3, 20],
  ['folate', 'vitamin-b9', 1e6, 3000],
  ['b12', 'vitamin-b12', 1e6, 100],
  ['ala', 'alpha-linolenic-acid', 1, 70],
]);

/**
 * @param {Record<string, unknown>} n nutriments
 * @returns {import('./micros.js').Amounts}
 */
function offMicros(n) {
  /** @type {import('./micros.js').Amounts} */
  const out = {};
  for (const [key, off, factor, max] of OFF_MICROS) {
    const raw = Number(n[`${off}_100g`] ?? (off === 'vitamin-b9' ? n.folates_100g : undefined));
    if (!Number.isFinite(raw) || raw < 0) continue;
    const v = raw * factor;
    if (v > max) continue;
    out[key] = Math.round(v * 100) / 100;
  }
  // Omega-3: EPA und DHA getrennt angegeben (g) → Summe in mg
  const epa = Number(n['eicosapentaenoic-acid_100g']);
  const dha = Number(n['docosahexaenoic-acid_100g']);
  if ([epa, dha].some((x) => Number.isFinite(x) && x >= 0)) {
    const sum = ((Number.isFinite(epa) ? epa : 0) + (Number.isFinite(dha) ? dha : 0)) * 1000;
    if (sum <= 40000) out.epaDha = Math.round(sum);
  }
  return out;
}

/**
 * Ein Produkt aus Open Food Facts (Barcode-Abfrage oder Suche).
 * @param {Record<string, any>} pr
 * @param {string} barcode
 * @returns {Product | null}
 */
export function parseOffProduct(pr, barcode) {
  const n = typeof pr.nutriments === 'object' && pr.nutriments !== null ? pr.nutriments : {};
  /** @param {string} k */
  const g = (k) => (isNum(Number(n[k])) ? Number(n[k]) : 0);
  const kcal = g('energy-kcal_100g') || g('energy_100g') / 4.184;
  if (!kcal && !g('proteins_100g') && !g('carbohydrates_100g')) return null;
  const name = [pr.product_name_de, pr.product_name, pr.generic_name].map(langText).find((x) => x.trim()) ?? 'Produkt';
  const quantity = typeof pr.quantity === 'string' ? pr.quantity : '';
  const micros = offMicros(n);
  // Natrium allein (aus Salz berechnet) zählt nicht als Mikronährstoff-Angabe
  const hasMicros = Object.keys(micros).some((k) => k !== 'sodium');
  return {
    name: String(name).trim().slice(0, 80),
    brand: (Array.isArray(pr.brands) ? String(pr.brands[0] ?? '') : typeof pr.brands === 'string' ? pr.brands.split(',')[0] : '')
      .trim()
      .slice(0, 60),
    barcode: barcode || (typeof pr.code === 'string' ? pr.code : ''),
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
      ...(hasMicros ? { micros, microSrc: /** @type {const} */ ('etikett') } : {}),
    },
    source: 'barcode',
    ...(storesText(pr.stores) ? { stores: storesText(pr.stores).slice(0, 80) } : {}),
    ...([1, 2, 3, 4].includes(Number(pr.nova_group)) ? { nova: Number(pr.nova_group) } : {}),
  };
}

/**
 * Text, der als String oder als Objekt je Sprache kommt ({ de, main, en, … }).
 * @param {unknown} v
 */
function langText(v) {
  if (typeof v === 'string') return v;
  if (typeof v !== 'object' || v === null) return '';
  const o = /** @type {Record<string, unknown>} */ (v);
  const hit = [o.de, o.main, o.en, o.fr, o.it, ...Object.values(o)].find((x) => typeof x === 'string' && x.trim());
  return typeof hit === 'string' ? hit : '';
}

/** @param {unknown} v */
function storesText(v) {
  if (Array.isArray(v))
    return v
      .filter((x) => typeof x === 'string')
      .join(', ')
      .trim();
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Suchergebnis von Open Food Facts: gültige Produkte mit Nährwerten.
 * @param {unknown} json
 * @returns {Product[]}
 */
export function parseOffSearch(json) {
  if (typeof json !== 'object' || json === null) return [];
  // Klassische Suche liefert «products», die neue Suche (search-a-licious) «hits»
  const j = /** @type {Record<string, any>} */ (json);
  const list = Array.isArray(j.products) ? j.products : j.hits;
  if (!Array.isArray(list)) return [];
  /** @type {Product[]} */
  const out = [];
  for (const pr of list.slice(0, 50)) {
    if (typeof pr !== 'object' || pr === null) continue;
    const p = parseOffProduct(pr, typeof pr.code === 'string' ? pr.code : '');
    if (p) out.push(p);
  }
  return out;
}

/**
 * Suchadresse für Open Food Facts, beschränkt auf Produkte aus der Schweiz, optional auf
 * einen Händler (Migros, Coop …).
 * @param {string} query
 * @param {string} [store]
 */
export function offSearchUrl(query, store = '') {
  const p = new URLSearchParams({
    search_terms: query.trim().slice(0, 80),
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: '20',
    sort_by: 'unique_scans_n',
    fields: 'code,product_name,product_name_de,generic_name,brands,stores,quantity,serving_quantity,nutriments,nova_group',
    tagtype_0: 'countries',
    tag_contains_0: 'contains',
    tag_0: 'switzerland',
  });
  if (store) {
    p.set('tagtype_1', 'stores');
    p.set('tag_contains_1', 'contains');
    p.set('tag_1', store);
  }
  return `https://world.openfoodfacts.org/cgi/search.pl?${p}`;
}

/**
 * Strichcodes aus einem Suchergebnis (für Treffer ohne Nährwerte, die einzeln nachgeladen werden).
 * @param {unknown} json
 * @returns {string[]}
 */
export function offSearchCodes(json) {
  if (typeof json !== 'object' || json === null) return [];
  const j = /** @type {Record<string, any>} */ (json);
  const list = Array.isArray(j.products) ? j.products : Array.isArray(j.hits) ? j.hits : [];
  return list.map((x) => (x && typeof x.code === 'string' ? x.code : '')).filter((c) => /^\d{8,14}$/.test(c));
}

/**
 * Suchadresse für die neue, schnellere Suche von Open Food Facts (search-a-licious).
 * Die alte Suche ist oft überlastet; diese dient als erste Wahl.
 * @param {string} query
 * @param {string} [store]
 */
export function offSearchaliciousUrl(query, store = '') {
  // Sonderzeichen der Suchsprache entfernen, damit Eingaben keine Syntaxfehler auslösen
  const terms = query
    .replace(/[\\"():[\]{}^~*?!+\-&|/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  const filter = [`countries_tags:"en:switzerland"`, store ? `stores_tags:"${store.replace(/[^a-z0-9-]/g, '')}"` : ''].filter(Boolean);
  const p = new URLSearchParams({
    q: [terms, ...filter].join(' '),
    langs: 'de,fr,it,en',
    page_size: '20',
    fields: 'code,product_name,product_name_de,generic_name,brands,stores,quantity,serving_quantity,nutriments,nova_group',
  });
  return `https://search.openfoodfacts.org/search?${p}`;
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
    ...(v.micros ? { micros: scaleMicros(v.micros, f), microSrc: v.microSrc } : {}),
    ...(p.nova ? { nova: p.nova } : {}),
  };
}
