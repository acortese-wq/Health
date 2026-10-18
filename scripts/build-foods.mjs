// Erzeugt app/js/data/foods.js aus der USDA-Datenbank SR28 (gemeinfrei) und der
// kuratierten deutschen Liste in scripts/foods-de.mjs. Aufruf: npm run foods
//
// Schutz vor US-Anreicherung: Einträge mit zugesetzter Folsäure werden abgelehnt, und
// magere Milchprodukte mit Vitamin D (in den USA angereichert; natürliches Vitamin D steckt
// nur im Milchfett) ebenfalls.

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { FOODS_DE } from './foods-de.mjs';

const require = createRequire(import.meta.url);
const pkg = dirname(require.resolve('fda-nutrient-database/package.json'));
const lines = readFileSync(join(pkg, 'data', 'ABBREV.txt'), 'latin1')
  .split(/\r?\n/)
  .filter(Boolean);

/** Spalten der SR28-Kurzfassung (sr28_doc.pdf, S. 44) → Schlüssel in der App. */
const COLS = {
  kcal: 3,
  protein: 4,
  fat: 5,
  carbs: 7,
  fiber: 8,
  sugar: 9,
  calcium: 10,
  iron: 11,
  magnesium: 12,
  phosphorus: 13,
  potassium: 14,
  sodium: 15,
  zinc: 16,
  selenium: 19,
  vitC: 20,
  b1: 21,
  b2: 22,
  niacin: 23,
  b6: 25,
  folate: 29,
  b12: 31,
  vitA: 33,
  vitE: 40,
  vitD: 41,
  vitK: 43,
  satFat: 44,
  cholesterol: 47,
};
const FOLIC_ACID = 27;

/** @type {Map<string, string[]>} */
const rows = new Map();
for (const l of lines) {
  const f = l.split('^').map((x) => x.replace(/^~|~$/g, ''));
  rows.set(f[0], f);
}

const errors = [];
const keys = new Set();
const out = FOODS_DE.map((food) => {
  if (keys.has(food.k)) errors.push(`${food.k}: Schlüssel doppelt`);
  keys.add(food.k);
  const r = rows.get(food.ndb);
  if (!r) {
    errors.push(`${food.k}: NDB ${food.ndb} nicht gefunden`);
    return null;
  }
  if (Number(r[FOLIC_ACID]) > 0) errors.push(`${food.k}: ${r[1]} ist mit Folsäure angereichert`);
  /** @type {Record<string, number>} */
  const v = {};
  for (const [key, col] of Object.entries(COLS)) {
    const raw = r[col];
    if (raw === '' || raw === undefined) continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    v[key] = Math.round(n * 1000) / 1000;
  }
  if (food.t.includes('milch') && (v.fat ?? 0) < 5 && (v.vitD ?? 0) > 0.5) errors.push(`${food.k}: ${r[1]} enthält zugesetztes Vitamin D`);
  if (!Number.isFinite(v.kcal)) errors.push(`${food.k}: keine Energie`);
  return { k: food.k, n: food.n, g: food.g, p: food.p, t: food.t, ...(food.a ? { a: food.a } : {}), sr: `${food.ndb} ${r[1]}`, v };
});

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const body = out.map((f) => `  ${JSON.stringify(f)},`).join('\n');
const file = `// @ts-check
// Automatisch erzeugt von scripts/build-foods.mjs – nicht von Hand ändern.
// Quelle: U.S. Department of Agriculture, Agricultural Research Service. USDA National
// Nutrient Database for Standard Reference, Release 28 (2015), gemeinfrei.
// Werte pro 100 g essbarer Anteil. Fehlende Werte sind in der Quelle nicht erhoben.

/** @typedef {import('../domain/micros.js').NutrientKey} NutrientKey */
/** @typedef {{ k: string, n: string, g: number, p: string, t: string[], a?: string[], sr: string, v: Partial<Record<NutrientKey, number>> }} Food */

export const FOOD_SOURCE = 'USDA SR28 (2015)';

/** @type {Food[]} */
export const FOODS = [
${body}
];
`;
writeFileSync(new URL('../app/js/data/foods.js', import.meta.url), file);
console.log(`${out.length} Lebensmittel geschrieben.`);
