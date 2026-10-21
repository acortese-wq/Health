// @ts-check
// Ernährungsplanung: geplante Mahlzeiten pro Tag, geplante Tageswerte, Übernahme in das
// Ernährungsprotokoll und Einkaufsliste. Geplant ist nicht gegessen: Erst die bestätigte
// Übernahme legt einen Eintrag im Protokoll an.

import { FOODS } from '../data/foods.js';
import { addDays } from './util.js';
import { recipeNutrition, scaleIngredients } from './recipes.js';
import { createEntry } from './entries.js';
import { baseUnit, normalizeUnit, UNIT_FAMILY } from './units.js';

/**
 * @typedef {import('./recipes.js').Recipe} Recipe
 * @typedef {import('./recipes.js').Meal} Meal
 * @typedef {{ id: string, recipeId: string, slot: Meal, servings: number, entryId?: string }} PlannedMeal
 * @typedef {Record<string, PlannedMeal[]>} MealPlan
 * @typedef {{
 *   id: string, key: string, label: string, amount: number | null, unit: import('./units.js').Unit | '',
 *   category: string, checked: boolean, manual: boolean, edited?: boolean, planAmount?: number | null, stale?: boolean,
 * }} ShoppingItem
 * @typedef {{ weekStart: string, updatedAt: string, items: ShoppingItem[] }} ShoppingList
 */

const BY_KEY = new Map(FOODS.map((f) => [f.k, f]));

/** @param {string} weekStart */
export function weekDates(weekStart) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/**
 * Geplante Tageswerte (Summe über die geplanten Mahlzeiten). Unvollständig, wenn ein Rezept
 * fehlt oder nur teilweise berechnet ist.
 * @param {PlannedMeal[]} meals
 * @param {Map<string, Recipe>} recipes
 */
export function plannedTotals(meals, recipes) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, salt: 0 };
  let partial = false;
  for (const m of meals) {
    const r = recipes.get(m.recipeId);
    const n = r ? recipeNutrition(r, m.servings) : null;
    if (!n || !n.total) {
      partial = true;
      continue;
    }
    if (n.status !== 'berechnet') partial = true;
    for (const k of /** @type {const} */ (['kcal', 'protein', 'carbs', 'fat', 'fiber', 'salt'])) t[k] += n.total[k];
  }
  const r1 = (/** @type {number} */ v) => Math.round(v * 10) / 10;
  return {
    kcal: Math.round(t.kcal),
    protein: r1(t.protein),
    carbs: r1(t.carbs),
    fat: r1(t.fat),
    fiber: r1(t.fiber),
    salt: r1(t.salt),
    partial,
  };
}

/**
 * @param {MealPlan} plan
 * @param {string} date
 * @param {Omit<PlannedMeal, 'id'>} m
 * @param {string} id
 */
export function addPlanned(plan, date, m, id) {
  plan[date] = [...(plan[date] ?? []), { ...m, id }];
  return plan[date][plan[date].length - 1];
}

/**
 * Geplante Mahlzeit finden.
 * @param {MealPlan} plan
 * @param {string} id
 */
export function findPlanned(plan, id) {
  for (const [date, list] of Object.entries(plan)) {
    const m = list.find((x) => x.id === id);
    if (m) return { date, meal: m };
  }
  return null;
}

/**
 * Verschieben auf anderen Tag und/oder andere Mahlzeit (eine bereits übernommene Buchung bleibt am alten Tag).
 * @param {MealPlan} plan
 * @param {string} id
 * @param {string} toDate
 * @param {Meal} toSlot
 */
export function movePlanned(plan, id, toDate, toSlot) {
  const hit = findPlanned(plan, id);
  if (!hit) return false;
  plan[hit.date] = plan[hit.date].filter((x) => x.id !== id);
  if (!plan[hit.date].length) delete plan[hit.date];
  const { entryId: _e, ...rest } = hit.meal;
  plan[toDate] = [...(plan[toDate] ?? []), { ...rest, slot: toSlot }];
  return true;
}

/**
 * @param {MealPlan} plan
 * @param {string} id
 */
export function removePlanned(plan, id) {
  const hit = findPlanned(plan, id);
  if (!hit) return false;
  plan[hit.date] = plan[hit.date].filter((x) => x.id !== id);
  if (!plan[hit.date].length) delete plan[hit.date];
  return true;
}

/**
 * Einen Tag auf einen anderen kopieren (ergänzt, ersetzt nichts; Übernahmen werden nicht mitkopiert).
 * @param {MealPlan} plan
 * @param {string} from
 * @param {string} to
 * @param {() => string} id
 */
export function copyDay(plan, from, to, id) {
  const src = plan[from] ?? [];
  if (!src.length || from === to) return 0;
  plan[to] = [...(plan[to] ?? []), ...src.map(({ entryId: _e, ...m }) => ({ ...m, id: id() }))];
  return src.length;
}

/**
 * Protokoll-Eintrag aus einem Rezept (tatsächlich gegessene Portionen).
 * @param {Recipe} r
 * @param {number} servings
 * @param {string} time
 * @returns {Omit<import('../store.js').FoodEntry, 'id'> | null}
 */
export function entryFromRecipe(r, servings, time) {
  const n = recipeNutrition(r, servings);
  if (!n.total) return null;
  const t = n.total;
  const label = servings === 1 ? '1 Portion' : `${servings} Portionen`;
  return {
    name: `${r.title} (${label})`,
    kcal: t.kcal,
    protein: t.protein,
    carbs: t.carbs,
    fat: t.fat,
    sugar: t.sugar,
    satFat: t.satFat,
    fiber: t.fiber,
    salt: t.salt,
    grams: t.grams,
    time,
    source: 'rezept',
    ...(Object.keys(t.micros).length ? { micros: t.micros, microSrc: /** @type {const} */ ('db') } : {}),
    ...(Object.keys(t.groups).length ? { groups: t.groups } : {}),
  };
}

/**
 * Geplante Mahlzeit als gegessen übernehmen. Idempotent: Ist sie schon übernommen und der
 * Eintrag noch vorhanden, entsteht kein zweiter (technischer Wiederholungsversuch). Eine
 * bewusste weitere Portion läuft über «again».
 * @param {import('../store.js').State} state
 * @param {string} plannedId
 * @param {{ servings: number, time: string, now: Date, id: string, recipes: Map<string, Recipe>, again?: boolean }} o
 * @returns {{ status: 'created' | 'already' | 'missing' | 'not-computable', entryId?: string }}
 */
export function logPlanned(state, plannedId, { servings, time, now, id, recipes, again = false }) {
  const hit = findPlanned(state.mealPlan, plannedId);
  if (!hit) return { status: 'missing' };
  const r = recipes.get(hit.meal.recipeId);
  if (!r) return { status: 'missing' };
  const day = (state.days[hit.date] = state.days[hit.date] ?? {});
  const food = day.food ?? [];
  if (!again && hit.meal.entryId && food.some((f) => f.id === hit.meal.entryId)) return { status: 'already', entryId: hit.meal.entryId };
  const fields = entryFromRecipe(r, servings, time);
  if (!fields) return { status: 'not-computable' };
  const e = createEntry(food, { ...fields, planId: plannedId }, { id, now });
  if (!e) return { status: 'already', entryId: hit.meal.entryId };
  day.food = [...food, e];
  if (!again) hit.meal.entryId = e.id;
  return { status: 'created', entryId: e.id };
}

/**
 * Ist eine geplante Mahlzeit übernommen? (Eintrag existiert noch im Protokoll.)
 * @param {import('../store.js').State} state
 * @param {string} date
 * @param {PlannedMeal} m
 */
export function isLogged(state, date, m) {
  return Boolean(m.entryId && (state.days[date]?.food ?? []).some((f) => f.id === m.entryId));
}

// ---------------------------------------------------------------------------------------
// Einkaufsliste

const CATEGORY = /** @type {Record<string, string>} */ ({
  gemuese: 'Gemüse und Früchte',
  frucht: 'Gemüse und Früchte',
  milch: 'Milchprodukte und Eier',
  ei: 'Milchprodukte und Eier',
  fleisch: 'Fleisch und Fisch',
  wurst: 'Fleisch und Fisch',
  fisch: 'Fleisch und Fisch',
  staerke: 'Brot, Getreide, Beilagen',
  huelsen: 'Hülsenfrüchte und Nüsse',
  pflanzlProtein: 'Hülsenfrüchte und Nüsse',
  nuss: 'Hülsenfrüchte und Nüsse',
});
export const CATEGORY_ORDER = [
  'Gemüse und Früchte',
  'Milchprodukte und Eier',
  'Fleisch und Fisch',
  'Brot, Getreide, Beilagen',
  'Hülsenfrüchte und Nüsse',
  'Vorrat und Gewürze',
  'Eigene Artikel',
];

/** @param {string | null} foodKey */
function categoryOf(foodKey) {
  const f = foodKey ? BY_KEY.get(foodKey) : undefined;
  return (f?.gr && CATEGORY[f.gr[0]]) || 'Vorrat und Gewürze';
}

/**
 * Zutaten aller geplanten Mahlzeiten der Woche zusammenführen. Gleiche Lebensmittel werden
 * addiert, wenn die Einheiten zur gleichen Familie gehören (Masse, Volumen, Stück, Löffel);
 * sonst stehen sie getrennt.
 * @param {MealPlan} plan
 * @param {string[]} dates
 * @param {Map<string, Recipe>} recipes
 * @returns {Omit<ShoppingItem, 'id' | 'checked' | 'manual'>[]}
 */
export function aggregateIngredients(plan, dates, recipes) {
  /** @type {Map<string, Omit<ShoppingItem, 'id' | 'checked' | 'manual'>>} */
  const by = new Map();
  for (const d of dates) {
    for (const m of plan[d] ?? []) {
      const r = recipes.get(m.recipeId);
      if (!r || r.source.kind === 'referenz') continue;
      for (const i of scaleIngredients(r, m.servings)) {
        const name = i.foodKey ? i.label || BY_KEY.get(i.foodKey)?.n || i.foodKey : i.label;
        const ident = i.foodKey ?? `txt:${i.label.toLowerCase()}`;
        if (i.amount === null || i.amount === 0) {
          const key = `${ident}|`;
          if (!by.has(key)) by.set(key, { key, label: name, amount: null, unit: '', category: categoryOf(i.foodKey) });
          continue;
        }
        const b = baseUnit(i.amount, i.unit);
        const key = `${ident}|${UNIT_FAMILY[i.unit]}`;
        const prev = by.get(key);
        if (prev && prev.amount !== null) prev.amount = Math.round((prev.amount + b.amount) * 10) / 10;
        else by.set(key, { key, label: name, amount: Math.round(b.amount * 10) / 10, unit: b.unit, category: categoryOf(i.foodKey) });
      }
    }
  }
  return [...by.values()].map((x) => (x.amount !== null && x.unit ? { ...x, ...normalizeUnit(x.amount, /** @type {any} */ (x.unit)) } : x));
}

/**
 * Einkaufsliste aus dem Plan neu berechnen und mit der bestehenden Liste zusammenführen:
 * eigene Artikel bleiben immer, Häkchen bleiben, von Hand geänderte Mengen bleiben (mit
 * Hinweis, wenn der Plan etwas anderes ergibt); Artikel, die nicht mehr im Plan sind, fallen
 * nur weg, wenn sie unberührt waren.
 * @param {ShoppingList | null} prev
 * @param {MealPlan} plan
 * @param {string} weekStart
 * @param {Map<string, Recipe>} recipes
 * @param {{ id: () => string, now: string }} o
 * @returns {{ list: ShoppingList, changes: string[] }}
 */
export function buildShoppingList(prev, plan, weekStart, recipes, o) {
  const same = prev && prev.weekStart === weekStart ? prev : null;
  const fresh = aggregateIngredients(plan, weekDates(weekStart), recipes);
  /** @type {ShoppingItem[]} */
  const items = [];
  /** @type {string[]} */
  const changes = [];
  const prevAuto = new Map((same?.items ?? []).filter((x) => !x.manual).map((x) => [x.key, x]));
  for (const f of fresh) {
    const p = prevAuto.get(f.key);
    prevAuto.delete(f.key);
    if (!p) {
      items.push({ ...f, id: o.id(), checked: false, manual: false });
      continue;
    }
    if (p.edited) {
      const changed = p.planAmount !== f.amount;
      if (changed)
        changes.push(
          `${f.label}: Plan ergibt jetzt ${f.amount ?? 'nach Bedarf'} ${f.unit}, deine Menge bleibt ${p.amount ?? ''} ${p.unit}`.trim(),
        );
      items.push({ ...p, label: f.label, planAmount: f.amount, stale: false });
    } else items.push({ ...p, ...f, stale: false });
  }
  for (const p of prevAuto.values()) {
    if (p.checked || p.edited) {
      items.push({ ...p, stale: true });
      changes.push(`${p.label}: nicht mehr im Plan, bleibt auf der Liste (abgehakt oder geändert)`);
    }
  }
  for (const m of same?.items.filter((x) => x.manual) ?? []) items.push(m);
  return { list: { weekStart, updatedAt: o.now, items }, changes };
}
