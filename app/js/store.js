// @ts-check
// Lokale Datenhaltung. Alle Gesundheitsdaten bleiben im Browser des Geräts
// (localStorage). Export/Import als JSON dient als Backup und für Gerätewechsel.

import { isISODate, isNum } from './domain/util.js';
import { MICRO_KEYS } from './domain/micros.js';
import { GROUP_KEYS } from './domain/foodgroups.js';
import { TRIGGERS } from './domain/meals.js';

import { CYCLE_OPTIONS } from './domain/cycle.js';
import { BLUE_ITEMS } from './domain/bluezones.js';
import { createEntry } from './domain/entries.js';
import { validateRecipe } from './domain/recipes.js';
import { UNITS } from './domain/units.js';
import { sanitizeSupplement } from './domain/supplements.js';

const PLAN_SLOTS = ['morgen', 'mittag', 'abend', 'snack'];

const BLUE_IDS = BLUE_ITEMS.filter((i) => i.kind === 'self').map((i) => i.id);

const CYCLE_IDS = /** @type {string[]} */ (CYCLE_OPTIONS.map((c) => c[0]));
const TRIGGER_IDS = /** @type {string[]} */ (TRIGGERS.map((t) => t[0]));

export const STORAGE_KEY = 'gesundheitscockpit';
// Schema 2 (2026-10): Mahlzeiten mit Zeitstempel «at», «repeatOf» (bewusst wiederholt),
// «dupOf» (technische Kopie), «keep» (Doppelbuchung geprüft) und «proteinKnown».
// Version-1-Daten werden unverändert übernommen; die neuen Felder sind optional.
// Schema 3 (2026-10): Rezepte («recipes», eigene und Referenzen), Favoriten, zuletzt verwendet,
// Wochenplan («mealPlan»), Einkaufsliste («shopping»); Mahlzeiten mit «planId» und Quelle «rezept».
// Ältere Daten erhalten leere Sammlungen; nichts wird umgeschrieben.
// Schema 4 (2026-10): Nahrungsergänzungsmittel («supplements») und Einnahmen pro Tag («supps»).
export const SCHEMA_VERSION = 4;

/**
 * @typedef {'m' | 'f'} Sex
 * @typedef {{
 *   name: string, sex: Sex, birthDate: string, heightCm: number,
 *   startDate: string, startWeightKg: number, goalWeightKg: number, goalDate: string,
 *   activity: string, proteinPerKg: number, kcalOverride: number | null,
 *   stepsTarget: number, sleepTargetH: number, waterTargetMl: number, bedtime: string,
 *   trainingMode: import('./domain/training.js').TrainingMode,
 *   fastingWindowH: number, eatStart: string,
 *   foodPrefs: import('./domain/micros.js').FoodPrefs,
 *   vitDSupplementUg: number, dietBreakUntil: string,
 *   cycleStatus: import('./domain/cycle.js').CycleStatus, cycleLength: number, lastPeriodStart: string, shareCycle: boolean,
 *   caffeineHalfLifeH: number, caffeineCutoffH: number, caffeineMaxMg: number,
 *   caffeineStartCups: number, caffeineTargetCups: number, caffeineTaperStart: string,
 * }} Profile
 * @typedef {'foto' | 'text' | 'etikett' | 'barcode' | 'manuell' | 'datenbank' | 'rezept'} FoodSource
 * @typedef {{
 *   id: string, name: string, kcal: number, protein: number, time: string,
 *   carbs?: number, fat?: number, sugar?: number, satFat?: number, fiber?: number, salt?: number,
 *   grams?: number, source?: FoodSource,
 *   micros?: import('./domain/micros.js').Amounts, microSrc?: 'db' | 'ki' | 'mix' | 'etikett',
 *   groups?: import('./domain/foodgroups.js').Groups,
 *   hunger?: 1 | 2 | 3, trigger?: import('./domain/meals.js').Trigger, nova?: number,
 *   at?: string, repeatOf?: string, dupOf?: string, keep?: boolean, proteinKnown?: false, planId?: string,
 * }} FoodEntry
 * @typedef {{ id: string, label: string, mg: number, time: string }} CaffeineEntry
 * @typedef {{
 *   weightKg?: number, food?: FoodEntry[], caffeine?: CaffeineEntry[],
 *   steps?: number, sleepH?: number, restingHr?: number, waterMl?: number, complete?: boolean, period?: boolean,
 *   supps?: import('./domain/supplements.js').Intake[],
 * }} Day
 * @typedef {{ id: string, name: string, kcal: number, protein: number, carbs?: number, fat?: number, sugar?: number, satFat?: number, fiber?: number, salt?: number }} FoodPreset
 * @typedef {{ id: string, label: string, mg: number }} CaffeinePreset
 * @typedef {{ id: string, date: string, cm: number }} WaistEntry
 * @typedef {{ id: string, date: string, time: string, sys: number, dia: number, pulse?: number, setting: 'home' | 'office' }} BpEntry
 * @typedef {{ id: string, date: string, value: number }} Vo2Entry
 * @typedef {import('./domain/clinical.js').LabEntry} LabEntry
 * @typedef {import('./domain/training.js').Workout} Workout
 * @typedef {{
 *   schema: number,
 *   profile: Profile | null,
 *   days: Record<string, Day>,
 *   waist: WaistEntry[], bp: BpEntry[], vo2max: Vo2Entry[],
 *   labs: LabEntry[], workouts: Workout[],
 *   presets: { food: FoodPreset[], caffeine: CaffeinePreset[] },
 *   stopBang: Record<string, boolean>,
 *   prevention: Record<string, string>,
 *   blueZones: Record<string, string[]>,
 *   recipes: import('./domain/recipes.js').Recipe[],
 *   favorites: string[], recentRecipes: string[],
 *   mealPlan: import('./domain/planner.js').MealPlan,
 *   shopping: import('./domain/planner.js').ShoppingList | null,
 *   supplements: import('./domain/supplements.js').Supplement[],
 *   lastBackup?: string,
 *   demo?: boolean,
 * }} State
 */

/** @returns {FoodPreset[]} */
export function defaultFoodPresets() {
  return [
    { id: 'skyr', name: 'Skyr 250 g mit Beeren', kcal: 210, protein: 28 },
    { id: 'pasta', name: 'Pasta-Teller (90 g Pasta, 150 g Poulet, Gemüse)', kcal: 700, protein: 55 },
    { id: 'mittag', name: 'Mittagsteller Protein + Gemüse', kcal: 700, protein: 50 },
    { id: 'shake', name: 'Proteinshake (30 g Pulver, Wasser)', kcal: 120, protein: 24 },
    { id: 'schoggi', name: 'Dunkle Schokolade 20 g', kcal: 115, protein: 2 },
    { id: 'milch', name: 'Milch im Kaffee (Tagesmenge)', kcal: 60, protein: 4 },
  ];
}

/** @returns {CaffeinePreset[]} */
export function defaultCaffeinePresets() {
  return [
    { id: 'espresso', label: 'Espresso', mg: 70 },
    { id: 'kaffee', label: 'Kaffee / Lungo', mg: 90 },
    { id: 'cappuccino', label: 'Cappuccino', mg: 70 },
    { id: 'energy', label: 'Energy Drink 250 ml', mg: 80 },
    { id: 'tee', label: 'Schwarztee', mg: 40 },
  ];
}

/** @returns {State} */
export function emptyState() {
  return {
    schema: SCHEMA_VERSION,
    profile: null,
    days: {},
    waist: [],
    bp: [],
    vo2max: [],
    labs: [],
    workouts: [],
    presets: { food: defaultFoodPresets(), caffeine: defaultCaffeinePresets() },
    stopBang: {},
    prevention: {},
    blueZones: {},
    recipes: [],
    favorites: [],
    recentRecipes: [],
    mealPlan: {},
    shopping: null,
    supplements: [],
  };
}

/** @returns {string} */
export function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
function isObj(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Prüft und bereinigt einen importierten oder geladenen Zustand. Unbekannte Felder
 * werden verworfen, fehlerhafte Einträge übersprungen. Wirft bei falscher Struktur.
 * @param {unknown} raw
 * @returns {State}
 */
export function sanitize(raw) {
  if (!isObj(raw)) throw new Error('Die Datei enthält keine gültigen App-Daten.');
  if (!isNum(raw.schema) || raw.schema > SCHEMA_VERSION) {
    throw new Error('Die Daten stammen aus einer neueren oder unbekannten App-Version.');
  }
  const s = emptyState();
  if (isObj(raw.profile)) s.profile = sanitizeProfile(raw.profile);
  if (isObj(raw.days)) {
    // IDs müssen eindeutig sein; eine doppelte ID (z. B. doppelter Import) wird nicht gelöscht,
    // sondern bekommt eine neue ID und wird als mögliche Doppelbuchung markiert.
    /** @type {Set<string>} */
    const seen = new Set();
    for (const [date, d] of Object.entries(raw.days).sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (isISODate(date) && isObj(d)) s.days[date] = sanitizeDay(d, seen);
    }
  }
  /**
   * @template T
   * @param {unknown} list
   * @param {(x: Record<string, unknown>) => T | null} fn
   * @returns {T[]}
   */
  const arr = (list, fn) => (Array.isArray(list) ? list.flatMap((x) => (isObj(x) ? [fn(x)].filter((v) => v !== null) : [])) : []);
  const date = (/** @type {unknown} */ v) => (typeof v === 'string' && isISODate(v) ? v : null);
  const id = (/** @type {unknown} */ v) => (typeof v === 'string' && v ? v : uid());
  const time = (/** @type {unknown} */ v) => (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : '12:00');

  s.waist = arr(raw.waist, (x) => (date(x.date) && isNum(x.cm) ? { id: id(x.id), date: /** @type {string} */ (x.date), cm: x.cm } : null));
  s.bp = arr(raw.bp, (x) =>
    date(x.date) && isNum(x.sys) && isNum(x.dia)
      ? {
          id: id(x.id),
          date: /** @type {string} */ (x.date),
          time: time(x.time),
          sys: x.sys,
          dia: x.dia,
          ...(isNum(x.pulse) ? { pulse: x.pulse } : {}),
          setting: x.setting === 'office' ? 'office' : 'home',
        }
      : null,
  );
  s.vo2max = arr(raw.vo2max, (x) =>
    date(x.date) && isNum(x.value) ? { id: id(x.id), date: /** @type {string} */ (x.date), value: x.value } : null,
  );
  s.labs = arr(raw.labs, (x) =>
    date(x.date) && typeof x.key === 'string' && isNum(x.value) && typeof x.unit === 'string'
      ? { id: id(x.id), date: /** @type {string} */ (x.date), key: x.key, value: x.value, unit: x.unit }
      : null,
  );
  s.workouts = arr(raw.workouts, (x) => {
    const d = date(x.date);
    if (!d) return null;
    if (x.kind === 'strength' && Array.isArray(x.sets)) {
      const sets = x.sets.flatMap((st) =>
        isObj(st) && typeof st.ex === 'string' && isNum(st.kg) && isNum(st.reps) ? [{ ex: st.ex, kg: st.kg, reps: st.reps }] : [],
      );
      return /** @type {Workout} */ ({
        id: id(x.id),
        date: d,
        kind: 'strength',
        template: typeof x.template === 'string' ? x.template : 'A',
        sets,
        ...(typeof x.note === 'string' ? { note: x.note } : {}),
      });
    }
    if (x.kind === 'run' && isNum(x.minutes) && (x.runType === 'z2' || x.runType === 'interval' || x.runType === 'long')) {
      return /** @type {Workout} */ ({
        id: id(x.id),
        date: d,
        kind: 'run',
        runType: x.runType,
        minutes: x.minutes,
        ...(isNum(x.km) ? { km: x.km } : {}),
        ...(isNum(x.avgHr) ? { avgHr: x.avgHr } : {}),
        ...(typeof x.note === 'string' ? { note: x.note } : {}),
      });
    }
    return null;
  });
  if (isObj(raw.presets)) {
    const food = arr(raw.presets.food, (x) =>
      typeof x.name === 'string' && isNum(x.kcal) && isNum(x.protein)
        ? { id: id(x.id), name: x.name, kcal: x.kcal, protein: x.protein, ...withoutMeta(extraNutrients(x)) }
        : null,
    );
    const caf = arr(raw.presets.caffeine, (x) =>
      typeof x.label === 'string' && isNum(x.mg) ? { id: id(x.id), label: x.label, mg: x.mg } : null,
    );
    if (food.length) s.presets.food = food;
    if (caf.length) s.presets.caffeine = caf;
  }
  if (isObj(raw.stopBang)) {
    for (const [k, v] of Object.entries(raw.stopBang)) if (typeof v === 'boolean') s.stopBang[k] = v;
  }
  if (isObj(raw.blueZones)) {
    for (const [k, v] of Object.entries(raw.blueZones)) {
      if (isISODate(k) && Array.isArray(v)) s.blueZones[k] = v.filter((x) => typeof x === 'string' && BLUE_IDS.includes(x));
    }
  }
  if (isObj(raw.prevention)) {
    for (const [k, v] of Object.entries(raw.prevention)) if (typeof v === 'string' && isISODate(v)) s.prevention[k] = v;
  }
  // Rezepte und Planung (Schema 3); ungültige Rezepte werden übersprungen, nicht repariert
  if (Array.isArray(raw.recipes)) {
    const seenIds = new Set();
    for (const r of raw.recipes.slice(0, 2000)) {
      try {
        const rec = validateRecipe(r, { id: uid, now: new Date().toISOString(), keepTimes: true });
        if (seenIds.has(rec.id)) rec.id = uid();
        seenIds.add(rec.id);
        s.recipes.push(rec);
      } catch {
        /* ungültig: weglassen */
      }
    }
  }
  const strList = (/** @type {unknown} */ v) =>
    Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && x))].slice(0, 500) : [];
  s.favorites = strList(raw.favorites);
  s.recentRecipes = strList(raw.recentRecipes).slice(0, 20);
  if (isObj(raw.mealPlan)) {
    for (const [d, list] of Object.entries(raw.mealPlan)) {
      if (!isISODate(d) || !Array.isArray(list)) continue;
      const meals = list.flatMap((m) =>
        isObj(m) &&
        typeof m.recipeId === 'string' &&
        isNum(m.servings) &&
        m.servings > 0 &&
        m.servings <= 50 &&
        PLAN_SLOTS.includes(String(m.slot))
          ? [
              {
                id: typeof m.id === 'string' && m.id ? m.id : uid(),
                recipeId: m.recipeId,
                slot: /** @type {import('./domain/recipes.js').Meal} */ (m.slot),
                servings: m.servings,
                ...(typeof m.entryId === 'string' && m.entryId ? { entryId: m.entryId } : {}),
              },
            ]
          : [],
      );
      if (meals.length) s.mealPlan[d] = meals;
    }
  }
  if (
    isObj(raw.shopping) &&
    typeof raw.shopping.weekStart === 'string' &&
    isISODate(raw.shopping.weekStart) &&
    Array.isArray(raw.shopping.items)
  ) {
    s.shopping = {
      weekStart: raw.shopping.weekStart,
      updatedAt: typeof raw.shopping.updatedAt === 'string' ? raw.shopping.updatedAt : '',
      items: raw.shopping.items.flatMap((x) =>
        isObj(x) && typeof x.label === 'string' && x.label.trim()
          ? [
              {
                id: typeof x.id === 'string' && x.id ? x.id : uid(),
                key: typeof x.key === 'string' ? x.key : `txt:${x.label.toLowerCase()}`,
                label: x.label.slice(0, 80),
                amount: isNum(x.amount) && x.amount >= 0 ? x.amount : null,
                unit: /** @type {any} */ (UNITS.includes(/** @type {any} */ (x.unit)) ? x.unit : ''),
                category: typeof x.category === 'string' ? x.category : 'Eigene Artikel',
                checked: x.checked === true,
                manual: x.manual === true,
                ...(x.edited === true ? { edited: true } : {}),
                ...(isNum(x.planAmount) || x.planAmount === null ? { planAmount: /** @type {number | null} */ (x.planAmount) } : {}),
                ...(x.stale === true ? { stale: true } : {}),
              },
            ]
          : [],
      ),
    };
  }
  if (Array.isArray(raw.supplements)) {
    const now = new Date().toISOString();
    const ids = new Set();
    for (const x of raw.supplements.slice(0, 100)) {
      const sp = sanitizeSupplement(x, { id: uid, now, microKeys: MICRO_KEYS });
      if (!sp) continue;
      if (ids.has(sp.id)) sp.id = uid();
      ids.add(sp.id);
      s.supplements.push(sp);
    }
  }
  if (typeof raw.lastBackup === 'string' && isISODate(raw.lastBackup)) s.lastBackup = raw.lastBackup;
  if (raw.demo === true) s.demo = true;
  return s;
}

/**
 * @param {Record<string, unknown>} p
 * @returns {Profile}
 */
function sanitizeProfile(p) {
  const num = (/** @type {unknown} */ v, /** @type {number} */ d) => (isNum(v) ? v : d);
  const str = (/** @type {unknown} */ v, /** @type {string} */ d) => (typeof v === 'string' ? v : d);
  const dt = (/** @type {unknown} */ v, /** @type {string} */ d) => (typeof v === 'string' && isISODate(v) ? v : d);
  return {
    name: str(p.name, ''),
    sex: p.sex === 'f' ? 'f' : 'm',
    birthDate: dt(p.birthDate, '1980-01-01'),
    heightCm: num(p.heightCm, 175),
    startDate: dt(p.startDate, '2026-01-01'),
    startWeightKg: num(p.startWeightKg, 80),
    goalWeightKg: num(p.goalWeightKg, 75),
    goalDate: dt(p.goalDate, '2027-01-01'),
    activity: str(p.activity, 'mittel'),
    proteinPerKg: num(p.proteinPerKg, 1.6),
    kcalOverride: isNum(p.kcalOverride) ? p.kcalOverride : null,
    stepsTarget: num(p.stepsTarget, 9000),
    sleepTargetH: num(p.sleepTargetH, 7.5),
    waterTargetMl: num(p.waterTargetMl, 2000),
    trainingMode: p.trainingMode === 'laufen' ? 'laufen' : 'kombi',
    cycleStatus: CYCLE_IDS.includes(String(p.cycleStatus))
      ? /** @type {import('./domain/cycle.js').CycleStatus} */ (p.cycleStatus)
      : 'keine',
    cycleLength: isNum(p.cycleLength) && p.cycleLength >= 21 && p.cycleLength <= 45 ? Math.round(p.cycleLength) : 28,
    lastPeriodStart: typeof p.lastPeriodStart === 'string' && isISODate(p.lastPeriodStart) ? p.lastPeriodStart : '',
    shareCycle: p.shareCycle === true,
    vitDSupplementUg: isNum(p.vitDSupplementUg) && p.vitDSupplementUg >= 0 && p.vitDSupplementUg <= 100 ? p.vitDSupplementUg : 0,
    dietBreakUntil: typeof p.dietBreakUntil === 'string' && isISODate(p.dietBreakUntil) ? p.dietBreakUntil : '',
    foodPrefs: {
      fisch: !isObj(p.foodPrefs) || p.foodPrefs.fisch !== false,
      milch: !isObj(p.foodPrefs) || p.foodPrefs.milch !== false,
      fleisch: !isObj(p.foodPrefs) || p.foodPrefs.fleisch !== false,
      kantine: !isObj(p.foodPrefs) || p.foodPrefs.kantine !== false,
    },
    fastingWindowH: [8, 10, 12].includes(/** @type {number} */ (p.fastingWindowH)) ? /** @type {number} */ (p.fastingWindowH) : 0,
    eatStart: typeof p.eatStart === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(p.eatStart) ? p.eatStart : '11:00',
    bedtime: str(p.bedtime, '22:30'),
    caffeineHalfLifeH: num(p.caffeineHalfLifeH, 5),
    caffeineCutoffH: num(p.caffeineCutoffH, 8),
    caffeineMaxMg: num(p.caffeineMaxMg, 400),
    caffeineStartCups: num(p.caffeineStartCups, 0),
    caffeineTargetCups: num(p.caffeineTargetCups, 4),
    caffeineTaperStart: dt(p.caffeineTaperStart, dt(p.startDate, '2026-01-01')),
  };
}

/**
 * @param {Record<string, unknown>} d
 * @param {Set<string>} seen bereits vergebene Mahlzeiten-IDs
 * @returns {Day}
 */
function sanitizeDay(d, seen) {
  /** @type {Day} */
  const out = {};
  if (isNum(d.weightKg) && d.weightKg > 20 && d.weightKg < 400) out.weightKg = d.weightKg;
  if (isNum(d.steps) && d.steps >= 0) out.steps = d.steps;
  if (isNum(d.sleepH) && d.sleepH >= 0 && d.sleepH <= 24) out.sleepH = d.sleepH;
  if (isNum(d.restingHr) && d.restingHr > 20 && d.restingHr < 200) out.restingHr = d.restingHr;
  if (isNum(d.waterMl) && d.waterMl > 0 && d.waterMl <= 10000) out.waterMl = d.waterMl;
  if (d.complete === true) out.complete = true;
  if (d.period === true) out.period = true;
  if (Array.isArray(d.supps)) {
    const supps = d.supps.flatMap((x) =>
      isObj(x) && typeof x.sid === 'string' && isNum(x.servings) && x.servings > 0 && x.servings <= 20
        ? [
            {
              id: typeof x.id === 'string' && x.id ? x.id : uid(),
              sid: x.sid,
              servings: x.servings,
              time: typeof x.time === 'string' && /^\d{2}:\d{2}$/.test(x.time) ? x.time : '08:00',
            },
          ]
        : [],
    );
    if (supps.length) out.supps = supps;
  }
  const time = (/** @type {unknown} */ v) => (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : '12:00');
  if (Array.isArray(d.food)) {
    out.food = d.food.flatMap((f) => {
      if (!isObj(f) || typeof f.name !== 'string' || !isNum(f.kcal) || !isNum(f.protein)) return [];
      const given = typeof f.id === 'string' && f.id ? f.id : '';
      const id = given && !seen.has(given) ? given : uid();
      seen.add(id);
      /** @type {FoodEntry} */
      const e = { id, name: f.name, kcal: f.kcal, protein: f.protein, time: time(f.time), ...extraNutrients(f), ...entryMeta(f) };
      if (given && id !== given) e.dupOf = given;
      return [e];
    });
  }
  if (Array.isArray(d.caffeine)) {
    out.caffeine = d.caffeine.flatMap((c) =>
      isObj(c) && typeof c.label === 'string' && isNum(c.mg)
        ? [{ id: typeof c.id === 'string' ? c.id : uid(), label: c.label, mg: c.mg, time: time(c.time) }]
        : [],
    );
  }
  return out;
}

/**
 * @param {Storage | undefined} storage
 * @returns {{ state: State, error: string | null, raw?: string }}
 */
export function load(storage = safeStorage()) {
  /** @type {string | null | undefined} */
  let raw;
  try {
    raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return { state: emptyState(), error: null };
    return { state: sanitize(JSON.parse(raw)), error: null };
  } catch (e) {
    // Rohdaten mitgeben, damit sie vor dem nächsten Speichern gesichert werden können
    return { state: emptyState(), error: e instanceof Error ? e.message : String(e), ...(raw ? { raw } : {}) };
  }
}

/**
 * @param {State} state
 * @param {Storage | undefined} storage
 * @returns {boolean} false, wenn nicht gespeichert werden konnte
 */
export function save(state, storage = safeStorage()) {
  try {
    if (!storage) return false;
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/** @returns {Storage | undefined} */
export function safeStorage() {
  try {
    const s = globalThis.localStorage;
    const probe = '__probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return undefined;
  }
}

/**
 * @param {State} state
 * @returns {string}
 */
export function exportJSON(state) {
  return JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2);
}

/**
 * @param {string} text
 * @returns {State}
 */
export function importJSON(text) {
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist kein gültiges JSON.');
  }
  return sanitize(parsed);
}

/**
 * Tagesgewichte als sortierte Reihe.
 * @param {State} state
 * @returns {{ date: string, kg: number }[]}
 */
export function weightSeries(state) {
  return Object.entries(state.days)
    .filter(([, d]) => isNum(d.weightKg))
    .map(([date, d]) => ({ date, kg: /** @type {number} */ (d.weightKg) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * CSV der Tageswerte (für Excel).
 * @param {State} state
 * @returns {string}
 */
export function exportCSV(state) {
  const rows = [['Datum', 'Gewicht kg', 'kcal', 'Protein g', 'Koffein mg', 'Schritte', 'Schlaf h', 'Ruhepuls', 'Wasser ml', 'Vollständig']];
  for (const date of Object.keys(state.days).sort()) {
    const d = state.days[date];
    const kcal = (d.food ?? []).reduce((a, f) => a + f.kcal, 0);
    const prot = (d.food ?? []).reduce((a, f) => a + f.protein, 0);
    const caf = (d.caffeine ?? []).reduce((a, c) => a + c.mg, 0);
    rows.push(
      [
        date,
        d.weightKg ?? '',
        kcal || '',
        prot || '',
        caf || '',
        d.steps ?? '',
        d.sleepH ?? '',
        d.restingHr ?? '',
        d.waterMl ?? '',
        d.complete ? 'ja' : '',
      ].map(String),
    );
  }
  return rows.map((r) => r.join(';')).join('\n');
}

const EXTRA_KEYS = /** @type {const} */ (['carbs', 'fat', 'sugar', 'satFat', 'fiber', 'salt', 'grams']);
const SOURCES = ['foto', 'text', 'etikett', 'barcode', 'manuell', 'datenbank', 'rezept'];

/**
 * Optionale Nährwerte und Herkunft eines Eintrags übernehmen (nur gültige Zahlen).
 * @param {Record<string, unknown>} f
 * @returns {Partial<FoodEntry>}
 */
export function extraNutrients(f) {
  /** @type {Partial<FoodEntry>} */
  const out = {};
  for (const k of EXTRA_KEYS) {
    const v = f[k];
    if (isNum(v) && v >= 0 && v < 10000) out[k] = v;
  }
  if (typeof f.source === 'string' && SOURCES.includes(f.source)) out.source = /** @type {FoodSource} */ (f.source);
  if (f.hunger === 1 || f.hunger === 2 || f.hunger === 3) out.hunger = f.hunger;
  if (typeof f.trigger === 'string' && TRIGGER_IDS.includes(f.trigger))
    out.trigger = /** @type {import('./domain/meals.js').Trigger} */ (f.trigger);
  if (f.nova === 1 || f.nova === 2 || f.nova === 3 || f.nova === 4) out.nova = f.nova;
  if (isObj(f.groups)) {
    /** @type {import('./domain/foodgroups.js').Groups} */
    const g = {};
    for (const k of GROUP_KEYS) {
      const v = /** @type {Record<string, unknown>} */ (f.groups)[k];
      if (isNum(v) && v > 0 && v <= 50) g[k] = v;
    }
    if (Object.keys(g).length) out.groups = g;
  }
  if (isObj(f.micros)) {
    /** @type {import('./domain/micros.js').Amounts} */
    const m = {};
    for (const k of MICRO_KEYS) {
      const v = /** @type {Record<string, unknown>} */ (f.micros)[k];
      if (isNum(v) && v >= 0 && v < 100000) m[k] = v;
    }
    if (Object.keys(m).length) {
      out.micros = m;
      out.microSrc = f.microSrc === 'ki' || f.microSrc === 'mix' || f.microSrc === 'etikett' ? f.microSrc : 'db';
    }
  }
  return out;
}

/**
 * Mahlzeit an einem Tag anlegen (neue ID und Zeitstempel). Gibt null zurück, wenn es ein
 * Doppeltipp war; dann bleibt der Zustand unverändert.
 * @param {State} state
 * @param {string} date
 * @param {Omit<FoodEntry, 'id'>} fields
 * @param {Date} [now]
 * @returns {FoodEntry | null}
 */
export function addFood(state, date, fields, now = new Date()) {
  const d = (state.days[date] = state.days[date] ?? {});
  const list = d.food ?? [];
  const e = createEntry(list, fields, { id: uid(), now });
  if (!e) return null;
  d.food = [...list, e];
  return e;
}

/**
 * Ereignis-Angaben einer Mahlzeit (Schema 2).
 * @param {Record<string, unknown>} f
 * @returns {Partial<FoodEntry>}
 */
function entryMeta(f) {
  /** @type {Partial<FoodEntry>} */
  const out = {};
  if (typeof f.at === 'string' && !Number.isNaN(Date.parse(f.at))) out.at = f.at;
  if (typeof f.repeatOf === 'string' && f.repeatOf) out.repeatOf = f.repeatOf;
  if (typeof f.dupOf === 'string' && f.dupOf) out.dupOf = f.dupOf;
  if (f.keep === true) out.keep = true;
  if (f.proteinKnown === false) out.proteinKnown = false;
  if (typeof f.planId === 'string' && f.planId) out.planId = f.planId;
  return out;
}

/**
 * Zuletzt gegessene Einträge vor `date` (je Name nur der neueste), für die Schnellerfassung.
 * @param {State} state
 * @param {string} date
 * @param {number} [limit]
 * @returns {FoodEntry[]}
 */
export function recentFoods(state, date, limit = 8) {
  const presetNames = new Set(state.presets.food.map((p) => p.name.toLowerCase()));
  const seen = new Set();
  /** @type {FoodEntry[]} */
  const out = [];
  const dates = Object.keys(state.days)
    .filter((d) => d < date)
    .sort()
    .reverse()
    .slice(0, 30);
  for (const d of dates) {
    for (const f of [...(state.days[d].food ?? [])].reverse()) {
      const key = f.name.toLowerCase();
      if (seen.has(key) || presetNames.has(key)) continue;
      seen.add(key);
      out.push(f);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/**
 * Herkunft und Gramm gehören nicht in eine Vorlage.
 * @param {Partial<FoodEntry>} e
 */
function withoutMeta(e) {
  const { grams: _g, source: _s, ...rest } = e;
  return rest;
}
