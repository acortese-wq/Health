// @ts-check
// Makro- und Mikronährstoffe: Referenzwerte, Tagessummen, Abdeckung und Vorschläge für
// die nächste Mahlzeit.
//
// Referenzwerte: D-A-CH (DGE, ÖGE, SGE), Erwachsene 25 bis unter 51 Jahre, Stand der
// Revisionen 2015–2023 (Empfehlungen, Schätzwerte). Natrium und gesättigte Fettsäuren
// als Obergrenze nach WHO. Ausserhalb dieser Altersgruppe weichen einzelne Werte leicht ab.
// Omega-3: Alpha-Linolensäure 0.5 % der Energie (D-A-CH), EPA + DHA 250 mg (EFSA).
// Jod: Referenzwert Schweiz 150 µg. Vitamin K fehlt in der Schweizer Datenbank und ist nur
// teilweise erfasst (USDA-Ergänzung bei der Alltagsliste).

import { portionsFor } from './foodgroups.js';

/**
 * @typedef {'kcal' | 'protein' | 'carbs' | 'fat' | 'satFat' | 'fiber' | 'sugar' | 'sodium' | 'cholesterol'
 *   | 'potassium' | 'calcium' | 'iron' | 'magnesium' | 'phosphorus' | 'zinc' | 'selenium' | 'iodine'
 *   | 'vitA' | 'vitC' | 'vitD' | 'vitE' | 'vitK' | 'b1' | 'b2' | 'niacin' | 'b5' | 'b6' | 'folate' | 'b12'
 *   | 'ala' | 'epaDha'} NutrientKey
 * @typedef {'micro' | 'macro'} Group
 * @typedef {{
 *   key: NutrientKey, label: string, unit: string, group: 'makro' | 'vitamin' | 'mineral',
 *   kind: 'target' | 'limit' | 'info', ref?: { m: number, f: number }, digits: 0 | 1 | 2, note?: string,
 * }} NutrientDef
 * @typedef {Partial<Record<NutrientKey, number>>} Amounts
 */

/** Mikronährstoffe, die pro Eintrag gespeichert werden (Makros stehen im Eintrag selbst). */
export const MICRO_KEYS = /** @type {const} */ ([
  'sodium',
  'cholesterol',
  'potassium',
  'calcium',
  'iron',
  'magnesium',
  'phosphorus',
  'zinc',
  'selenium',
  'iodine',
  'vitA',
  'vitC',
  'vitD',
  'vitE',
  'vitK',
  'b1',
  'b2',
  'niacin',
  'b5',
  'b6',
  'folate',
  'b12',
  'ala',
  'epaDha',
]);

/** @type {NutrientDef[]} */
export const NUTRIENTS = [
  { key: 'carbs', label: 'Kohlenhydrate', unit: 'g', group: 'makro', kind: 'target', digits: 0 },
  { key: 'fiber', label: 'Ballaststoffe', unit: 'g', group: 'makro', kind: 'target', ref: { m: 30, f: 30 }, digits: 0 },
  { key: 'sugar', label: 'Zucker (gesamt)', unit: 'g', group: 'makro', kind: 'info', digits: 0, note: 'inkl. Frucht- und Milchzucker' },
  { key: 'fat', label: 'Fett', unit: 'g', group: 'makro', kind: 'target', digits: 0 },
  { key: 'satFat', label: 'Gesättigte Fettsäuren', unit: 'g', group: 'makro', kind: 'limit', digits: 0, note: '< 10 % der Energie' },
  { key: 'protein', label: 'Protein', unit: 'g', group: 'makro', kind: 'target', digits: 0 },
  {
    key: 'ala',
    label: 'Omega-3: Alpha-Linolensäure',
    unit: 'g',
    group: 'makro',
    kind: 'target',
    digits: 1,
    note: '0.5 % der Energie (Lein-, Raps-, Baumnussöl)',
  },
  {
    key: 'epaDha',
    label: 'Omega-3: EPA + DHA',
    unit: 'mg',
    group: 'makro',
    kind: 'target',
    ref: { m: 250, f: 250 },
    digits: 0,
    note: 'EFSA; entspricht 1–2 Portionen fetten Fisch pro Woche, Wochenschnitt beachten',
  },
  {
    key: 'sodium',
    label: 'Natrium',
    unit: 'mg',
    group: 'makro',
    kind: 'limit',
    ref: { m: 2000, f: 2000 },
    digits: 0,
    note: '= 5 g Salz (WHO)',
  },
  { key: 'cholesterol', label: 'Cholesterin', unit: 'mg', group: 'makro', kind: 'info', digits: 0 },
  { key: 'vitA', label: 'Vitamin A', unit: 'µg', group: 'vitamin', kind: 'target', ref: { m: 850, f: 700 }, digits: 0 },
  { key: 'vitC', label: 'Vitamin C', unit: 'mg', group: 'vitamin', kind: 'target', ref: { m: 110, f: 95 }, digits: 0 },
  {
    key: 'vitD',
    label: 'Vitamin D',
    unit: 'µg',
    group: 'vitamin',
    kind: 'target',
    ref: { m: 20, f: 20 },
    digits: 1,
    note: 'über die Nahrung kaum erreichbar; im Sommer bildet die Haut den Grossteil',
  },
  { key: 'vitE', label: 'Vitamin E', unit: 'mg', group: 'vitamin', kind: 'target', ref: { m: 14, f: 12 }, digits: 1 },
  {
    key: 'vitK',
    label: 'Vitamin K',
    unit: 'µg',
    group: 'vitamin',
    kind: 'target',
    ref: { m: 70, f: 60 },
    digits: 0,
    note: 'nur teilweise erfasst (fehlt in der Schweizer Datenbank)',
  },
  { key: 'b1', label: 'Vitamin B1 (Thiamin)', unit: 'mg', group: 'vitamin', kind: 'target', ref: { m: 1.2, f: 1.0 }, digits: 2 },
  { key: 'b2', label: 'Vitamin B2 (Riboflavin)', unit: 'mg', group: 'vitamin', kind: 'target', ref: { m: 1.4, f: 1.1 }, digits: 2 },
  {
    key: 'niacin',
    label: 'Niacin',
    unit: 'mg',
    group: 'vitamin',
    kind: 'target',
    ref: { m: 15, f: 12 },
    digits: 1,
    note: 'Niacin-Äquivalente',
  },
  { key: 'b5', label: 'Pantothensäure (B5)', unit: 'mg', group: 'vitamin', kind: 'target', ref: { m: 5, f: 5 }, digits: 1 },
  { key: 'b6', label: 'Vitamin B6', unit: 'mg', group: 'vitamin', kind: 'target', ref: { m: 1.6, f: 1.4 }, digits: 2 },
  { key: 'folate', label: 'Folat', unit: 'µg', group: 'vitamin', kind: 'target', ref: { m: 300, f: 300 }, digits: 0 },
  { key: 'b12', label: 'Vitamin B12', unit: 'µg', group: 'vitamin', kind: 'target', ref: { m: 4, f: 4 }, digits: 1 },
  { key: 'calcium', label: 'Calcium', unit: 'mg', group: 'mineral', kind: 'target', ref: { m: 1000, f: 1000 }, digits: 0 },
  { key: 'magnesium', label: 'Magnesium', unit: 'mg', group: 'mineral', kind: 'target', ref: { m: 350, f: 300 }, digits: 0 },
  { key: 'potassium', label: 'Kalium', unit: 'mg', group: 'mineral', kind: 'target', ref: { m: 4000, f: 4000 }, digits: 0 },
  { key: 'phosphorus', label: 'Phosphor', unit: 'mg', group: 'mineral', kind: 'target', ref: { m: 550, f: 550 }, digits: 0 },
  { key: 'iron', label: 'Eisen', unit: 'mg', group: 'mineral', kind: 'target', ref: { m: 11, f: 16 }, digits: 1 },
  {
    key: 'zinc',
    label: 'Zink',
    unit: 'mg',
    group: 'mineral',
    kind: 'target',
    ref: { m: 14, f: 8 },
    digits: 1,
    note: 'bei mittlerer Phytatzufuhr',
  },
  { key: 'selenium', label: 'Selen', unit: 'µg', group: 'mineral', kind: 'target', ref: { m: 70, f: 60 }, digits: 0 },
  {
    key: 'iodine',
    label: 'Jod',
    unit: 'µg',
    group: 'mineral',
    kind: 'target',
    ref: { m: 150, f: 150 },
    digits: 0,
    note: 'Referenz Schweiz; Jodsalz beim Kochen zählt nicht mit',
  },
];

/** Einträge bis zu dieser Energiemenge ohne Mikronährstoffe zählen nicht gegen die Abdeckung. */
const NEGLIGIBLE_KCAL = 30;

/**
 * Tagesziele für die Makros aus dem Kalorienziel: Protein aus dem Profil, Fett 30 % der
 * Energie (D-A-CH 30–35 %), Kohlenhydrate der Rest, gesättigte Fette < 10 % (WHO).
 * @param {{ kcalTarget: number, proteinG: number, sex: 'm' | 'f' }} p
 * @returns {Partial<Record<NutrientKey, number>>}
 */
export function dailyTargets({ kcalTarget, proteinG, sex }) {
  const fat = (kcalTarget * 0.3) / 9;
  const carbs = Math.max(0, (kcalTarget - proteinG * 4 - fat * 9) / 4);
  /** @type {Partial<Record<NutrientKey, number>>} */
  const t = { kcal: kcalTarget, protein: proteinG, fat, carbs, satFat: (kcalTarget * 0.1) / 9, ala: (kcalTarget * 0.005) / 9 };
  for (const n of NUTRIENTS) if (n.ref) t[n.key] = n.ref[sex];
  return t;
}

/**
 * Nährstoffe eines Datenbank-Lebensmittels für eine Grammzahl.
 * @param {{ v: Amounts }} food
 * @param {number} grams
 * @returns {Amounts}
 */
export function foodAmounts(food, grams) {
  /** @type {Amounts} */
  const out = {};
  for (const [k, v] of Object.entries(food.v)) out[/** @type {NutrientKey} */ (k)] = (v * grams) / 100;
  return out;
}

/**
 * Nur die Mikronährstoffe, gerundet für die Speicherung.
 * @param {Amounts} a
 * @returns {Amounts}
 */
export function pickMicros(a) {
  /** @type {Amounts} */
  const out = {};
  for (const k of MICRO_KEYS) {
    const v = a[k];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[k] = Math.round(v * 100) / 100;
  }
  return out;
}

/**
 * Mikronährstoffe proportional skalieren (z. B. beim Bearbeiten der Kalorien).
 * @param {Amounts | undefined} micros
 * @param {number} f
 */
export function scaleMicros(micros, f) {
  if (!micros) return undefined;
  /** @type {Amounts} */
  const out = {};
  for (const [k, v] of Object.entries(micros)) out[/** @type {NutrientKey} */ (k)] = Math.round(v * f * 100) / 100;
  return out;
}

/**
 * @typedef {{ kcal: number, protein: number, carbs?: number, fat?: number, satFat?: number, fiber?: number,
 *   sugar?: number, salt?: number, micros?: Amounts, microSrc?: string }} EntryLike
 */

/**
 * Tagessummen und Abdeckung. Makros zählen immer, Mikronährstoffe nur aus Einträgen,
 * für die sie bekannt sind; die Abdeckung sagt, für welchen Anteil der Energie.
 * @param {EntryLike[]} food
 */
export function dayAmounts(food) {
  /** @type {Amounts} */
  const sum = {};
  const add = (/** @type {NutrientKey} */ k, /** @type {number | undefined} */ v) => {
    if (typeof v === 'number' && Number.isFinite(v)) sum[k] = (sum[k] ?? 0) + v;
  };
  let kcal = 0;
  let covered = 0;
  let macroCovered = 0;
  // Makro-Verteilung nur aus Einträgen mit vollständigen Makros, sonst wäre der Ring verzerrt
  /** @type {Amounts} */
  const macroKnown = { protein: 0, carbs: 0, fat: 0 };
  for (const f of food) {
    if (f.carbs !== undefined && f.fat !== undefined) {
      macroKnown.protein = (macroKnown.protein ?? 0) + f.protein;
      macroKnown.carbs = (macroKnown.carbs ?? 0) + f.carbs;
      macroKnown.fat = (macroKnown.fat ?? 0) + f.fat;
    }
    kcal += f.kcal;
    add('kcal', f.kcal);
    add('protein', f.protein);
    add('carbs', f.carbs);
    add('fat', f.fat);
    add('satFat', f.satFat);
    add('fiber', f.fiber);
    add('sugar', f.sugar);
    if (f.carbs !== undefined && f.fat !== undefined) macroCovered += f.kcal;
    else if (f.kcal <= NEGLIGIBLE_KCAL) macroCovered += f.kcal;
    if (f.micros && Object.keys(f.micros).length) {
      // Etikettwerte nennen nur einzelne Nährstoffe: Werte zählen, gelten aber nicht als vollständig
      if (f.microSrc !== 'etikett') covered += f.kcal;
      for (const [k, v] of Object.entries(f.micros)) add(/** @type {NutrientKey} */ (k), v);
    } else if (f.kcal <= NEGLIGIBLE_KCAL) covered += f.kcal;
    // Natrium aus Salz, wenn kein Natriumwert vorliegt (Salz = Natrium × 2.5)
    if (!f.micros?.sodium && typeof f.salt === 'number') add('sodium', (f.salt / 2.5) * 1000);
  }
  return {
    amounts: sum,
    macroKnown,
    kcal,
    coverage: kcal > 0 ? covered / kcal : 1,
    macroCoverage: kcal > 0 ? macroCovered / kcal : 1,
  };
}

/**
 * Durchschnitt über mehrere Tage (nur Tage mit Einträgen).
 * @param {EntryLike[][]} days
 */
export function averageAmounts(days) {
  const used = days.filter((d) => d.length);
  /** @type {Amounts} */
  const avg = {};
  /** @type {Amounts} */
  const macroKnown = { protein: 0, carbs: 0, fat: 0 };
  let coverage = 0;
  let macroCoverage = 0;
  for (const d of used) {
    const r = dayAmounts(d);
    coverage += r.coverage;
    macroCoverage += r.macroCoverage;
    for (const [k, v] of Object.entries(r.amounts))
      avg[/** @type {NutrientKey} */ (k)] = (avg[/** @type {NutrientKey} */ (k)] ?? 0) + v / used.length;
  }
  return {
    amounts: avg,
    macroKnown,
    days: used.length,
    coverage: used.length ? coverage / used.length : 1,
    macroCoverage: used.length ? macroCoverage / used.length : 1,
  };
}

/**
 * Anteil der Energie aus Protein, Kohlenhydraten und Fett (für den Makro-Ring).
 * @param {Amounts} a
 */
export function macroSplit(a) {
  const p = (a.protein ?? 0) * 4;
  const c = (a.carbs ?? 0) * 4;
  const f = (a.fat ?? 0) * 9;
  const total = p + c + f;
  return total > 0 ? { protein: p / total, carbs: c / total, fat: f / total } : { protein: 0, carbs: 0, fat: 0 };
}

/**
 * Lücken: verbleibende Menge pro Zielnährstoff (nur «target», nur Mikronährstoffe und
 * Ballaststoffe; Protein behandelt der Vorschlag separat).
 * @param {Amounts} amounts
 * @param {Partial<Record<NutrientKey, number>>} targets
 */
export function gaps(amounts, targets) {
  /** @type {{ key: NutrientKey, left: number, target: number, share: number }[]} */
  const out = [];
  for (const n of NUTRIENTS) {
    // Makros (Energie, Protein, Kohlenhydrate, Fett) sind keine Lücken zum Auffüllen.
    if (n.kind !== 'target' || n.key === 'protein' || n.key === 'carbs' || n.key === 'fat') continue;
    // Vitamin D ist über die Nahrung praktisch nicht zu decken, Vitamin K nur teilweise
    // erfasst; beide sind kein Vorschlagsziel.
    if (n.key === 'vitD' || n.key === 'vitK') continue;
    const target = targets[n.key] ?? 0;
    const left = Math.max(0, target - (amounts[n.key] ?? 0));
    if (target > 0 && left / target >= 0.25) out.push({ key: n.key, left, target, share: left / target });
  }
  return out.sort((a, b) => b.share - a.share);
}

/**
 * @typedef {{ fisch: boolean, milch: boolean, fleisch: boolean, kantine: boolean }} FoodPrefs
 * @typedef {import('../data/foods.js').Food} Food
 * @typedef {{
 *   key: NutrientKey, label: string, food: Food, grams: number, portion: string, pct: number,
 *   kcal: number, protein: number, also: { key: NutrientKey, label: string, pct: number }[],
 * }} Suggestion
 */

/**
 * Vorschläge für die nächste Mahlzeit: Für die grössten offenen Lücken je das Lebensmittel,
 * das sie mit wenig Energie am besten schliesst (z. B. Vitamin C → Kiwi, B12 → Fisch).
 * Berücksichtigt Vorlieben, Restbudget und Natrium; jedes Lebensmittel höchstens einmal.
 * @param {{
 *   foods: Food[], amounts: Amounts, targets: Partial<Record<NutrientKey, number>>,
 *   kcalLeft: number, prefs: FoodPrefs, limit?: number,
 * }} p
 * @returns {Suggestion[]}
 */
export function suggestions({ foods, amounts, targets, kcalLeft, prefs, limit = 3 }) {
  const open = gaps(amounts, targets);
  const labels = /** @type {Record<NutrientKey, string>} */ (Object.fromEntries(NUTRIENTS.map((n) => [n.key, n.label])));
  const sodiumLeft = (targets.sodium ?? 2000) - (amounts.sodium ?? 0);
  const budget = kcalLeft > 0 ? kcalLeft + 50 : 250;
  const allowed = foods.filter((f) => {
    const t = f.t;
    if (t.includes('nosuggest')) return false;
    if (t.includes('fisch') && !prefs.fisch) return false;
    if (t.includes('milch') && !prefs.milch) return false;
    if (t.includes('fleisch') && !prefs.fleisch) return false;
    return true;
  });
  /** @type {Suggestion[]} */
  const out = [];
  const used = new Set();
  for (const g of open) {
    if (out.length >= limit) break;
    // Schon durch einen früheren Vorschlag weitgehend gedeckt?
    const before = out.reduce((acc, s) => acc + (foodAmounts(s.food, s.grams)[g.key] ?? 0), 0);
    if (before >= g.left * 0.6) continue;
    let best = null;
    let bestScore = 0;
    for (const food of allowed) {
      if (used.has(food.k)) continue;
      // Früchte und Gemüse dürfen doppelt sein (2 Kiwis), wenn eine Portion wenig deckt.
      for (const n of food.t.includes('frucht') || food.t.includes('gemuese') ? [1, 2] : [1]) {
        const grams = food.g * n;
        const a = foodAmounts(food, grams);
        const kcal = a.kcal ?? 0;
        if (kcal <= 0 || kcal > budget) continue;
        const pct = Math.min(1, (a[g.key] ?? 0) / g.left);
        if (pct < 0.3) continue;
        let score = pct / Math.sqrt(Math.max(kcal, 40) / 100);
        if ((a.sodium ?? 0) > Math.max(sodiumLeft, 300)) score *= 0.5;
        if (prefs.kantine && food.t.includes('kantine')) score *= 1.15;
        if (n === 2) score *= 0.9;
        if (score > bestScore) {
          bestScore = score;
          best = { food, grams, n, a, pct, kcal };
        }
      }
    }
    if (!best) continue;
    used.add(best.food.k);
    const b = best;
    const also = open
      .filter((o) => o.key !== g.key)
      .map((o) => ({ key: o.key, label: labels[o.key], pct: Math.min(1, (b.a[o.key] ?? 0) / o.left) }))
      .filter((o) => o.pct >= 0.25)
      .sort((x, y) => y.pct - x.pct)
      .slice(0, 2);
    out.push({
      key: g.key,
      label: labels[g.key],
      food: b.food,
      grams: Math.round(b.grams),
      portion: b.n === 2 ? `2 × ${b.food.p}` : b.food.p,
      pct: b.pct,
      kcal: Math.round(b.kcal),
      protein: Math.round(b.a.protein ?? 0),
      also,
    });
  }
  return out;
}

/**
 * Lebensmittel nach Namen oder Suchbegriff finden (Gross/klein und Umlaute egal).
 * @param {Food[]} foods
 * @param {string} q
 */
export function searchFoods(foods, q) {
  const norm = (/** @type {string} */ s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const query = norm(q.trim());
  if (!query) return [];
  return foods
    .map((f) => {
      const names = [f.n, ...(f.a ?? [])].map(norm);
      const rank = names.some((n) => n.startsWith(query)) ? 0 : names.some((n) => n.includes(query)) ? 1 : 2;
      return { f, rank };
    })
    .filter((x) => x.rank < 2)
    .sort((a, b) => a.rank - b.rank || Number(b.f.c) - Number(a.f.c) || a.f.n.length - b.f.n.length || a.f.n.localeCompare(b.f.n, 'de'))
    .map((x) => x.f);
}

/**
 * Eintrag aus einem Datenbank-Lebensmittel (alle Nährwerte aus der Datenbank).
 * @param {Food} food
 * @param {number} grams
 */
export function entryFromFood(food, grams) {
  const a = foodAmounts(food, grams);
  const r1 = (/** @type {number | undefined} */ v) => Math.round((v ?? 0) * 10) / 10;
  return {
    name: `${food.n} (${Math.round(grams)} g)`,
    kcal: Math.round(a.kcal ?? 0),
    protein: Math.round(a.protein ?? 0),
    carbs: r1(a.carbs),
    fat: r1(a.fat),
    satFat: r1(a.satFat),
    fiber: r1(a.fiber),
    sugar: r1(a.sugar),
    salt: Math.round((((a.sodium ?? 0) * 2.5) / 1000) * 100) / 100,
    micros: pickMicros(a),
    microSrc: /** @type {const} */ ('db'),
    groups: portionsFor(food.gr, grams, a.kcal ?? 0),
    grams: Math.round(grams),
    source: /** @type {const} */ ('datenbank'),
  };
}

/**
 * Menge eines Nährstoffs in einem Eintrag (Makros aus den Feldern, Mikros aus «micros»;
 * Natrium notfalls aus Salz). undefined = für diesen Eintrag nicht bekannt.
 * @param {EntryLike} f
 * @param {NutrientKey} key
 * @returns {number | undefined}
 */
export function entryValue(f, key) {
  switch (key) {
    case 'kcal':
    case 'protein':
      return f[key];
    case 'carbs':
    case 'fat':
    case 'satFat':
    case 'fiber':
    case 'sugar':
      return f[key];
    case 'sodium':
      return f.micros?.sodium ?? (typeof f.salt === 'number' ? (f.salt / 2.5) * 1000 : undefined);
    default:
      return f.micros?.[key];
  }
}

/**
 * Woher ein Nährstoff kommt: Einträge mit Beitrag, grösster zuerst, plus Einträge ohne Angabe.
 * @template {EntryLike} T
 * @param {T[]} food
 * @param {NutrientKey} key
 */
export function contributions(food, key) {
  /** @type {{ f: T, value: number }[]} */
  const items = [];
  /** @type {T[]} */
  const unknown = [];
  for (const f of food) {
    const v = entryValue(f, key);
    if (v === undefined) unknown.push(f);
    else if (v > 0) items.push({ f, value: v });
  }
  items.sort((a, b) => b.value - a.value);
  const total = items.reduce((a, x) => a + x.value, 0);
  return { items: items.map((x) => ({ ...x, share: total > 0 ? x.value / total : 0 })), unknown, total };
}
