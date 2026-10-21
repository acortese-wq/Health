// @ts-check
// Rezeptmodell: eingebaute Rezepte der App, eigene Rezepte und Referenzen auf externe Quellen
// (z. B. NDR «Die Ernährungs-Docs»). Nährwerte werden aus den Zutaten mit der Schweizer
// Nährwertdatenbank berechnet; was nicht umrechenbar ist, zählt nicht und wird gekennzeichnet.

import { FOODS } from '../data/foods.js';
import { RECIPES as BUILTIN, PRINCIPLES } from '../data/recipes.js';
import { foodAmounts, pickMicros } from './micros.js';
import { portionsFor, addGroups } from './foodgroups.js';
import { toGrams, UNITS } from './units.js';

/**
 * @typedef {import('./units.js').Unit} Unit
 * @typedef {'morgen' | 'mittag' | 'abend' | 'snack'} Meal
 * @typedef {{ foodKey: string | null, amount: number | null, unit: Unit, label: string, note?: string }} Ingredient
 * @typedef {'app' | 'eigen' | 'referenz' | 'lizenz' | 'ki'} SourceKind
 * @typedef {{
 *   kind: SourceKind, publisher?: string, url?: string, checkedAt?: string,
 *   rights: 'eigen' | 'nur-link' | 'lizenziert' | 'ungeprueft',
 * }} Source
 * @typedef {{
 *   id: string, title: string, description?: string, meals: Meal[], minutes?: number,
 *   servings: number, ingredients: Ingredient[], steps: string[], veg?: boolean,
 *   allergens?: string[], principles?: string[], tip?: string,
 *   source: Source, createdAt: string, updatedAt: string,
 * }} Recipe
 */

const BY_KEY = new Map(FOODS.map((f) => [f.k, f]));
export const MEALS = /** @type {const} */ ([
  ['morgen', 'Frühstück'],
  ['mittag', 'Mittagessen'],
  ['abend', 'Abendessen'],
  ['snack', 'Zwischenmahlzeit'],
]);
const MEAL_IDS = MEALS.map((m) => m[0]);

/** Zeitstempel der eingebauten Rezepte (Stand der Rezeptsammlung). */
const BUILTIN_DATE = '2026-10-22T00:00:00.000Z';

/**
 * Eingebaute Rezepte im einheitlichen Modell (Mengen in g, 1 Portion).
 * @returns {Recipe[]}
 */
export function builtinRecipes() {
  return BUILTIN.map((r) => ({
    id: `app-${r.id}`,
    title: r.name,
    meals: [...r.meals],
    minutes: r.minutes,
    servings: 1,
    ingredients: r.ingredients.map((i) => {
      // «3 Eier», «2 TL Rapsöl»: Haushaltsmenge als Hinweis, Bezeichnung aus der Datenbank
      const household = i.k && /^(\d|½|Saft )/.test(i.label);
      return {
        foodKey: i.k,
        amount: i.k ? i.g : null,
        unit: /** @type {Unit} */ ('g'),
        label: household ? (BY_KEY.get(/** @type {string} */ (i.k))?.n ?? i.label) : i.label,
        ...(household ? { note: i.label } : {}),
      };
    }),
    steps: [...r.steps],
    veg: r.veg,
    principles: [...r.principles],
    ...(r.tip ? { tip: r.tip } : {}),
    source: { kind: 'app', publisher: 'Gesundheitscockpit', rights: 'eigen' },
    createdAt: BUILTIN_DATE,
    updatedAt: BUILTIN_DATE,
  }));
}

/** Rezeptsammlungen, die als Quelle verlinkt werden (Inhalte nicht übernommen). */
export const SOURCE_COLLECTIONS = [
  {
    title: 'Rezepte von den Ernährungs-Docs',
    publisher: 'NDR',
    url: 'https://www.ndr.de/ratgeber/kochen/rezepte/Rezepte-von-den-Ernaehrungs-Docs,edocsrezepte102.html',
  },
  {
    title: 'Rezepte bei Fettleibigkeit',
    publisher: 'NDR',
    url: 'https://www.ndr.de/ratgeber/kochen/rezepte/Rezepte-bei-Fettleibigkeit,fettleibigkeit110.html',
  },
];

/**
 * @typedef {{
 *   kcal: number, kj: number, protein: number, carbs: number, sugar: number, fat: number, satFat: number,
 *   fiber: number, salt: number, micros: import('./micros.js').Amounts,
 *   groups: import('./foodgroups.js').Groups, grams: number,
 * }} Totals
 * @typedef {{
 *   status: 'berechnet' | 'teilweise' | 'nicht verfügbar', perServing: Totals | null, total: Totals | null,
 *   missing: { label: string, reason: string }[], resolved: number,
 * }} RecipeNutrition
 */

/**
 * Nährwerte aus den Zutaten (Summe für die angegebene Portionenzahl, plus pro Portion).
 * @param {Recipe} r
 * @param {number} [servings] gewünschte Portionen (skaliert alle Mengen)
 * @returns {RecipeNutrition}
 */
export function recipeNutrition(r, servings = r.servings) {
  const f = servings / r.servings;
  /** @type {Record<string, number>} */
  const sum = {};
  /** @type {import('./foodgroups.js').Groups} */
  let groups = {};
  let grams = 0;
  /** @type {{ label: string, reason: string }[]} */
  const missing = [];
  let resolved = 0;
  for (const i of r.ingredients) {
    if (!i.foodKey) {
      // Gewürze, Wasser usw. ohne Mengenangabe: kein Nährwertbeitrag, keine Lücke
      if (i.amount !== null && i.amount > 0) missing.push({ label: i.label, reason: 'nicht in der Datenbank' });
      continue;
    }
    const food = BY_KEY.get(i.foodKey);
    if (!food) {
      missing.push({ label: i.label, reason: 'Lebensmittel unbekannt' });
      continue;
    }
    const g = i.amount === null ? { grams: null, basis: 'Menge fehlt' } : toGrams(food, i.amount * f, i.unit);
    if (g.grams === null) {
      missing.push({ label: i.label, reason: g.basis });
      continue;
    }
    resolved++;
    grams += g.grams;
    for (const [k, v] of Object.entries(foodAmounts(food, g.grams))) sum[k] = (sum[k] ?? 0) + v;
    groups = addGroups(groups, portionsFor(food.gr, g.grams, ((food.v.kcal ?? 0) * g.grams) / 100));
  }
  if (!resolved) return { status: 'nicht verfügbar', perServing: null, total: null, missing, resolved };
  const r1 = (/** @type {number} */ v) => Math.round(v * 10) / 10;
  /** @param {number} d */
  const make = (d) => ({
    kcal: Math.round((sum.kcal ?? 0) / d),
    kj: Math.round(((sum.kcal ?? 0) * 4.184) / d),
    protein: r1((sum.protein ?? 0) / d),
    carbs: r1((sum.carbs ?? 0) / d),
    sugar: r1((sum.sugar ?? 0) / d),
    fat: r1((sum.fat ?? 0) / d),
    satFat: r1((sum.satFat ?? 0) / d),
    fiber: r1((sum.fiber ?? 0) / d),
    salt: Math.round((((sum.sodium ?? 0) * 2.5) / 1000 / d) * 100) / 100,
    micros: pickMicros(Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, v / d]))),
    groups: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, Math.round((v / d) * 100) / 100])),
    grams: Math.round(grams / d),
  });
  return {
    status: missing.length ? 'teilweise' : 'berechnet',
    total: make(1),
    perServing: make(Math.max(servings, 0.25)),
    missing,
    resolved,
  };
}

/**
 * Zutatenmengen für eine andere Portionenzahl.
 * @param {Recipe} r
 * @param {number} servings
 * @returns {Ingredient[]}
 */
export function scaleIngredients(r, servings) {
  const f = servings / r.servings;
  return r.ingredients.map((i) => ({ ...i, amount: i.amount === null ? null : Math.round(i.amount * f * 10) / 10 }));
}

/** Allergene nach Lebensmittel-Schlüssel (14 Hauptallergene, soweit aus der Datenbank ableitbar). */
const ALLERGEN_RULES = /** @type {[string, (k: string, t: string[], gr: string) => boolean][]} */ ([
  [
    'Milch/Laktose',
    (k, t, gr) => gr === 'milch' || /milch|joghurt|skyr|quark|kaese|käse|rahm|butter|feta|mozzarella|gruyere|emmentaler|parmesan/.test(k),
  ],
  ['Ei', (k) => /^ei(-|$)/.test(k)],
  ['Fisch', (k, t) => t.includes('fisch') && k !== 'crevetten'],
  ['Krebstiere', (k) => k === 'crevetten'],
  ['Schalenfrüchte (Nüsse)', (k) => /mandeln|baumnuesse|haselnuesse|cashew|paranuesse/.test(k)],
  ['Erdnüsse', (k) => /erdnuss/.test(k)],
  ['Gluten', (k) => /brot|pasta|couscous|gipfeli|haferflocken|knaeckebrot/.test(k)],
  ['Soja', (k) => /tofu|soja|edamame/.test(k)],
  ['Sesam', (k) => /^blv-(280|408|14107)$/.test(k)],
  ['Senf', (k) => k === 'blv-13464'],
  ['Sellerie', (k) => /sellerie|^blv-357$/.test(k)],
]);

/**
 * Allergene aus den Zutaten (automatisch erkannt, ohne Gewähr; Verpackung prüfen).
 * @param {Recipe} r
 */
export function detectAllergens(r) {
  const out = new Set(r.allergens ?? []);
  for (const i of r.ingredients) {
    const food = i.foodKey ? BY_KEY.get(i.foodKey) : undefined;
    if (!food) continue;
    for (const [name, test] of ALLERGEN_RULES) if (test(food.k, food.t, food.gr?.[0] ?? '')) out.add(name);
  }
  return [...out];
}

/** Rezept ohne Fleisch und Fisch? (aus den Zutaten) @param {Recipe} r */
export function isVegetarian(r) {
  if (typeof r.veg === 'boolean') return r.veg;
  return r.ingredients.every((i) => {
    const f = i.foodKey ? BY_KEY.get(i.foodKey) : undefined;
    return !f || !(f.t.includes('fleisch') || f.t.includes('fisch') || ['fleisch', 'wurst', 'fisch'].includes(f.gr?.[0] ?? ''));
  });
}

/** Prinzip-Info für eine ID. @param {string} id */
export function principle(id) {
  return PRINCIPLES.find((p) => p.id === id);
}

// ---------------------------------------------------------------------------------------
// Prüfung, Import, Export

const isStr = (/** @type {unknown} */ v) => typeof v === 'string';
const isNum = (/** @type {unknown} */ v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Rezept prüfen und bereinigen. Wirft mit verständlicher Meldung bei ungültigen Daten.
 * @param {unknown} raw
 * @param {{ id: () => string, now: string, keepTimes?: boolean }} o keepTimes: beim Laden Zeitstempel behalten
 * @returns {Recipe}
 */
export function validateRecipe(raw, { id, now, keepTimes = false }) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('kein Rezept-Objekt');
  const x = /** @type {Record<string, any>} */ (raw);
  const title = isStr(x.title) ? x.title.trim().slice(0, 120) : '';
  if (!title) throw new Error('Titel fehlt');
  const srcIn = typeof x.source === 'object' && x.source ? x.source : {};
  const kind = ['eigen', 'referenz', 'lizenz', 'ki'].includes(srcIn.kind) ? srcIn.kind : 'eigen';
  const url = isStr(srcIn.url) ? srcIn.url.trim() : '';
  if (url && !/^https:\/\/[^\s]+$/.test(url)) throw new Error('Quelle muss eine https-Adresse sein');
  if (kind === 'referenz' && !url) throw new Error('Referenz ohne Link zur Originalseite');
  const ingredients = Array.isArray(x.ingredients) ? x.ingredients : [];
  /** @type {Ingredient[]} */
  const ing = ingredients.slice(0, 40).map((/** @type {any} */ i, /** @type {number} */ n) => {
    if (typeof i !== 'object' || i === null) throw new Error(`Zutat ${n + 1} ungültig`);
    const foodKey = isStr(i.foodKey) && i.foodKey ? i.foodKey : null;
    if (foodKey && !BY_KEY.has(foodKey)) throw new Error(`Zutat ${n + 1}: Lebensmittel «${foodKey}» unbekannt`);
    const unit = UNITS.includes(i.unit) ? i.unit : null;
    if (!unit) throw new Error(`Zutat ${n + 1}: Einheit «${i.unit}» unbekannt (erlaubt: ${UNITS.join(', ')})`);
    const amount = i.amount === null || i.amount === undefined || i.amount === '' ? null : Number(i.amount);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 10000)) throw new Error(`Zutat ${n + 1}: Menge ungültig`);
    const label = isStr(i.label) && i.label.trim() ? i.label.trim().slice(0, 80) : foodKey ? (BY_KEY.get(foodKey)?.n ?? '') : '';
    if (!label) throw new Error(`Zutat ${n + 1}: Bezeichnung fehlt`);
    return { foodKey, amount, unit, label, ...(isStr(i.note) && i.note.trim() ? { note: i.note.trim().slice(0, 80) } : {}) };
  });
  if (kind !== 'referenz' && !ing.length) throw new Error('keine Zutaten');
  const servings = isNum(x.servings) && x.servings > 0 && x.servings <= 50 ? x.servings : 1;
  const meals = Array.isArray(x.meals) ? x.meals.filter((/** @type {any} */ m) => MEAL_IDS.includes(m)) : [];
  return {
    id: isStr(x.id) && /^[\w-]{1,60}$/.test(x.id) ? x.id : id(),
    title,
    ...(isStr(x.description) && x.description.trim() ? { description: x.description.trim().slice(0, 400) } : {}),
    meals: meals.length ? meals : ['mittag'],
    ...(isNum(x.minutes) && x.minutes > 0 && x.minutes <= 600 ? { minutes: Math.round(x.minutes) } : {}),
    servings,
    ingredients: ing,
    steps: Array.isArray(x.steps)
      ? x.steps
          .filter(isStr)
          .map((/** @type {string} */ s) => s.trim().slice(0, 600))
          .filter(Boolean)
          .slice(0, 20)
      : [],
    ...(typeof x.veg === 'boolean' ? { veg: x.veg } : {}),
    ...(Array.isArray(x.allergens) ? { allergens: x.allergens.filter(isStr).slice(0, 14) } : {}),
    source: {
      kind,
      ...(isStr(srcIn.publisher) && srcIn.publisher.trim() ? { publisher: srcIn.publisher.trim().slice(0, 80) } : {}),
      ...(url ? { url } : {}),
      ...(isStr(srcIn.checkedAt) && /^\d{4}-\d{2}-\d{2}$/.test(srcIn.checkedAt) ? { checkedAt: srcIn.checkedAt } : {}),
      rights: kind === 'referenz' ? 'nur-link' : kind === 'lizenz' ? 'lizenziert' : kind === 'ki' ? 'ungeprueft' : 'eigen',
    },
    createdAt: isStr(x.createdAt) && !Number.isNaN(Date.parse(x.createdAt)) ? x.createdAt : now,
    updatedAt: keepTimes && isStr(x.updatedAt) && !Number.isNaN(Date.parse(x.updatedAt)) ? x.updatedAt : now,
  };
}

/**
 * Rezepte importieren (JSON-Liste oder Objekt mit «recipes»). Ungültige Einträge werden
 * übersprungen und gemeldet; bestehende Rezepte werden nie überschrieben (Duplikate nach ID,
 * Link oder gleichem Titel werden ausgelassen).
 * @param {unknown} data
 * @param {Recipe[]} existing
 * @param {{ id: () => string, now: string }} o
 */
export function importRecipes(data, existing, o) {
  const list = Array.isArray(data)
    ? data
    : typeof data === 'object' && data && Array.isArray(/** @type {any} */ (data).recipes)
      ? /** @type {any} */ (data).recipes
      : null;
  if (!list) throw new Error('Die Datei enthält keine Rezeptliste.');
  const ids = new Set(existing.map((r) => r.id));
  const urls = new Set(existing.map((r) => r.source.url).filter(Boolean));
  const titles = new Set(existing.map((r) => r.title.toLowerCase()));
  /** @type {Recipe[]} */
  const added = [];
  /** @type {{ index: number, title: string, reason: string }[]} */
  const skipped = [];
  list.slice(0, 500).forEach((/** @type {any} */ raw, /** @type {number} */ index) => {
    const title = typeof raw?.title === 'string' ? raw.title : `Eintrag ${index + 1}`;
    try {
      const r = validateRecipe(raw, o);
      if (r.source.url && urls.has(r.source.url)) throw new Error('gleicher Link schon vorhanden');
      if (titles.has(r.title.toLowerCase())) throw new Error('gleicher Titel schon vorhanden');
      // Eine vorhandene ID wird nie überschrieben: das Rezept bekommt eine neue
      if (ids.has(r.id)) r.id = o.id();
      ids.add(r.id);
      titles.add(r.title.toLowerCase());
      if (r.source.url) urls.add(r.source.url);
      added.push(r);
    } catch (e) {
      skipped.push({ index, title, reason: e instanceof Error ? e.message : String(e) });
    }
  });
  return { added, skipped };
}

/**
 * Rezept-Referenzen aus CSV (Semikolon oder Komma): Titel;Link;Herausgeber;Mahlzeit;geprüft am
 * @param {string} text
 * @returns {Record<string, unknown>[]}
 */
export function parseReferenceCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const sep = lines[0].includes(';') ? ';' : ',';
  const header = lines[0].toLowerCase();
  const start = /titel|title/.test(header) ? 1 : 0;
  return lines.slice(start).map((line) => {
    const [title = '', url = '', publisher = '', meal = '', checked = ''] = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    const m = meal.toLowerCase();
    const mealId =
      MEAL_IDS.find((id) => m.startsWith(id.slice(0, 4))) ??
      (m.startsWith('früh') ? 'morgen' : m.startsWith('zwischen') ? 'snack' : undefined);
    return {
      title,
      meals: mealId ? [mealId] : [],
      ingredients: [],
      source: { kind: 'referenz', url, publisher: publisher || undefined, checkedAt: checked || undefined },
    };
  });
}

/**
 * Eigene Rezepte und Referenzen als JSON (für Backup oder Weitergabe).
 * @param {Recipe[]} recipes
 */
export function exportRecipes(recipes) {
  return JSON.stringify({ format: 'gesundheitscockpit-rezepte', version: 1, exportedAt: new Date().toISOString(), recipes }, null, 2);
}
