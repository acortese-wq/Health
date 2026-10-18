// Erzeugt app/js/data/foods.js. Aufruf: npm run foods
//
// Quellen:
// 1. Schweizer Nährwertdatenbank (BLV), daten/blv/*.xlsx: alle generischen Lebensmittel
//    und Markenprodukte. Hauptquelle.
// 2. USDA SR28 (gemeinfrei): ergänzt Vitamin K (fehlt in der Schweizer Datenbank) und
//    ersetzt sie bei den wenigen Alltagslebensmitteln ohne Schweizer Eintrag.
//
// Schutz vor US-Anreicherung: Wird ein USDA-Eintrag als Hauptquelle verwendet, darf er
// keine zugesetzte Folsäure enthalten; magere Milchprodukte kein zugesetztes Vitamin D.
// Werte «Sp.» (Spuren) gelten als 0, «<x» als x/2 (übliche Konvention), «k.A.» fehlt.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSheet } from 'read-excel-file/node';
import { FOODS_DE } from './foods-de.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Reihenfolge der Nährstoffe im kompakten Datenformat. */
const COLS = [
  'kcal',
  'protein',
  'carbs',
  'fat',
  'satFat',
  'fiber',
  'sugar',
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
];

// ---------------------------------------------------------------- BLV
const BLV_COLS = {
  kcal: 'Energie, Kilokalorien (kcal)',
  protein: 'Protein (g)',
  carbs: 'Kohlenhydrate, verfügbar (g)',
  fat: 'Fett, total (g)',
  satFat: 'Fettsäuren, gesättigt (g)',
  fiber: 'Nahrungsfasern (g)',
  sugar: 'Zucker (g)',
  sodium: 'Natrium (Na) (mg)',
  cholesterol: 'Cholesterin (mg)',
  potassium: 'Kalium (K) (mg)',
  calcium: 'Calcium (Ca) (mg)',
  iron: 'Eisen (Fe) (mg)',
  magnesium: 'Magnesium (Mg) (mg)',
  phosphorus: 'Phosphor (P) (mg)',
  zinc: 'Zink (Zn)  (mg)',
  selenium: 'Selen (Se) (µg)',
  iodine: 'Jod (I) (µg)',
  vitA: 'Vitamin A-Aktivität, RAE (µg)',
  vitC: 'Vitamin C (Ascorbinsäure) (mg)',
  vitD: 'Vitamin D (Calciferol) (µg)',
  vitE: 'Vitamin E (α-Tocopherol) (mg)',
  b1: 'Vitamin B1 (Thiamin) (mg)',
  b2: 'Vitamin B2 (Riboflavin) (mg)',
  niacin: 'Niacin equivalent (mg)',
  b5: 'Pantothensäure (mg)',
  b6: 'Vitamin B6 (Pyridoxin) (mg)',
  folate: 'Folat (µg)',
  b12: 'Vitamin B12 (Cobalamin) (µg)',
  ala: 'Alpha-Linolensäure (g)',
};
const EPA = 'Eicosapentaensäure (EPA) (g)';
const DHA = 'Docosahexaensäure (DHA) (g)';

/**
 * @param {unknown} raw
 * @returns {number | null}
 */
function blvNum(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (s === 'Sp.') return 0;
  const lt = s.match(/^<\s*([\d.]+)$/);
  if (lt) return Number(lt[1]) / 2;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const blvFile = readdirSync(join(ROOT, 'daten/blv')).find((f) => f.endsWith('.xlsx'));
if (!blvFile) throw new Error('daten/blv/*.xlsx fehlt');
const version = (blvFile.match(/V(\d+\.\d+)/) ?? [])[1] ?? '?';

/** @param {string} sheet */
async function readBlv(sheet) {
  const rows = await readSheet(join(ROOT, 'daten/blv', blvFile), sheet);
  const hdr = rows[2].map((h) => (typeof h === 'string' ? h : ''));
  const col = (/** @type {string} */ name) => {
    const i = hdr.indexOf(name);
    if (i < 0) throw new Error(`Spalte «${name}» fehlt in ${sheet}`);
    return i;
  };
  const idx = Object.fromEntries(Object.entries(BLV_COLS).map(([k, name]) => [k, col(name)]));
  const [iEpa, iDha, iName, iSyn, iCat, iUnit] = [col(EPA), col(DHA), col('Name'), col('Synonyme'), col('Kategorie'), col('Bezugseinheit')];
  /** @type {Map<number, { id: number, name: string, syn: string[], cat: string, v: Record<string, number> }>} */
  const out = new Map();
  for (const r of rows.slice(3)) {
    if (typeof r[0] !== 'number') continue;
    if (!String(r[iUnit]).startsWith('pro 100g')) throw new Error(`${r[0]}: unerwartete Bezugseinheit ${r[iUnit]}`);
    /** @type {Record<string, number>} */
    const v = {};
    for (const [k, i] of Object.entries(idx)) {
      const n = blvNum(r[i]);
      if (n !== null) v[k] = n;
    }
    const epa = blvNum(r[iEpa]);
    const dha = blvNum(r[iDha]);
    if (epa !== null || dha !== null) v.epaDha = ((epa ?? 0) + (dha ?? 0)) * 1000;
    out.set(r[0], {
      id: r[0],
      name: String(r[iName]).trim(),
      syn:
        typeof r[iSyn] === 'string'
          ? r[iSyn]
              .split(';')
              .map((x) => x.trim())
              .filter(Boolean)
          : [],
      cat: String(r[iCat] ?? ''),
      v,
    });
  }
  return out;
}

// ---------------------------------------------------------------- USDA SR28
const require = createRequire(import.meta.url);
const sr = dirname(require.resolve('fda-nutrient-database/package.json'));
const SR_COLS = {
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
  b5: 24,
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
/** @type {Map<string, string[]>} */
const srRows = new Map();
for (const l of readFileSync(join(sr, 'data', 'ABBREV.txt'), 'latin1')
  .split(/\r?\n/)
  .filter(Boolean)) {
  const f = l.split('^').map((x) => x.replace(/^~|~$/g, ''));
  srRows.set(f[0], f);
}

/** @param {string} ndb */
function usda(ndb) {
  const r = srRows.get(ndb);
  if (!r) throw new Error(`NDB ${ndb} nicht gefunden`);
  /** @type {Record<string, number>} */
  const v = {};
  for (const [k, c] of Object.entries(SR_COLS)) {
    if (r[c] === '' || r[c] === undefined) continue;
    const n = Number(r[c]);
    if (Number.isFinite(n)) v[k] = n;
  }
  // USDA zählt Ballaststoffe zu den Kohlenhydraten; in Europa sind es «verfügbare» Kohlenhydrate.
  if (v.carbs !== undefined) v.carbs = Math.max(0, v.carbs - (v.fiber ?? 0));
  return { desc: r[1], folicAcid: Number(r[27]) || 0, v };
}

// ---------------------------------------------------------------- Kategorien → Tags
/** @param {string} cat */
function tagsFor(cat) {
  const t = new Set();
  for (const x of cat.split(';').map((c) => c.split('/')[0])) {
    if (x === 'Früchte') t.add('frucht');
    else if (x === 'Gemüse') t.add('gemuese');
    else if (x === 'Fisch') t.add('fisch');
    else if (x === 'Fleisch und Innereien' || x === 'Fleisch- und Wurstwaren') t.add('fleisch');
    else if (x === 'Milch und Milchprodukte') t.add('milch');
    else if (x === 'Eier') t.add('ei');
    else if (x === 'Nüsse, Samen und Ölfrüchte') t.add('nuss');
    else if (x === 'Brote, Flocken und Frühstückscerealien' || x === 'Getreideprodukte, Hülsenfrüchte und Kartoffeln') t.add('getreide');
    else if (x === 'Pflanzliche Proteinlieferanten und Alternativen zu tierischen Produkten') t.add('huelsen');
  }
  return [...t];
}

/** @param {Record<string, number>} v */
const pack = (v) => COLS.map((k) => (v[k] === undefined ? null : Math.round(v[k] * 1000) / 1000));

// ---------------------------------------------------------------- Zusammenführen
const generic = await readBlv('Generische Lebensmittel');
const brands = await readBlv('Markenprodukte');
const errors = [];
const usedBlv = new Set();
/** @type {unknown[][]} */
const rows = [];

for (const f of FOODS_DE) {
  /** @type {Record<string, number>} */
  let v;
  let src;
  if (f.blv) {
    const b = generic.get(f.blv);
    if (!b) {
      errors.push(`${f.k}: BLV ${f.blv} nicht gefunden`);
      continue;
    }
    usedBlv.add(f.blv);
    v = { ...b.v };
    src = `BLV ${f.blv} ${b.name}`;
    if (f.ndb) {
      const u = usda(f.ndb);
      if (u.v.vitK !== undefined) v.vitK = u.v.vitK;
      src += ` · Vit. K: USDA ${f.ndb}`;
    }
  } else if (f.ndb) {
    const u = usda(f.ndb);
    if (u.folicAcid > 0) errors.push(`${f.k}: ${u.desc} ist mit Folsäure angereichert`);
    if (f.t.includes('milch') && (u.v.fat ?? 0) < 5 && (u.v.vitD ?? 0) > 0.5)
      errors.push(`${f.k}: ${u.desc} enthält zugesetztes Vitamin D`);
    v = u.v;
    src = `USDA ${f.ndb} ${u.desc}`;
  } else {
    errors.push(`${f.k}: keine Quelle`);
    continue;
  }
  if (v.kcal === undefined) errors.push(`${f.k}: keine Energie`);
  rows.push([f.k, f.n, f.g, f.p, f.t, f.a ?? [], 1, src, pack(v)]);
}

for (const [label, map, prefix, extra] of /** @type {const} */ ([
  ['generisch', generic, 'blv', []],
  ['Marke', brands, 'blvm', ['marke']],
])) {
  for (const b of map.values()) {
    if (prefix === 'blv' && usedBlv.has(b.id)) continue;
    if (b.v.kcal === undefined) continue;
    rows.push([
      `${prefix}-${b.id}`,
      b.name,
      100,
      '100 g',
      [...tagsFor(b.cat), ...extra, 'nosuggest'],
      b.syn,
      0,
      `BLV ${b.id} (${label})`,
      pack(b.v),
    ]);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const file = `// @ts-check
// Automatisch erzeugt von scripts/build-foods.mjs – nicht von Hand ändern.
// Quellen: Schweizer Nährwertdatenbank V ${version}, Bundesamt für Lebensmittelsicherheit
// und Veterinärwesen BLV (naehrwertdaten.ch); ergänzend U.S. Department of Agriculture,
// USDA National Nutrient Database for Standard Reference, Release 28 (2015).
// Werte pro 100 g essbarer Anteil; null = in der Quelle nicht erhoben.

/** @typedef {import('../domain/micros.js').NutrientKey} NutrientKey */
/**
 * @typedef {{ k: string, n: string, g: number, p: string, t: string[], a?: string[], c: boolean, sr: string,
 *   v: Partial<Record<NutrientKey, number>> }} Food
 */

export const FOOD_SOURCE = 'Schweizer Nährwertdatenbank V ${version} (BLV), ergänzend USDA SR28';

/** @type {NutrientKey[]} */
const COLS = ${JSON.stringify(COLS)};

/** k, Name, Portion g, Portion, Tags, Synonyme, kuratiert, Quelle, Werte (Reihenfolge COLS) */
/** @type {[string, string, number, string, string[], string[], number, string, (number | null)[]][]} */
const RAW = [
${rows.map((r) => `  ${JSON.stringify(r)},`).join('\n')}
];

/** @type {Food[]} */
export const FOODS = RAW.map(([k, n, g, p, t, a, c, sr, vals]) => {
  /** @type {Partial<Record<NutrientKey, number>>} */
  const v = {};
  vals.forEach((x, i) => {
    if (x !== null) v[COLS[i]] = x;
  });
  return { k, n, g, p, t, ...(a.length ? { a } : {}), c: c === 1, sr, v };
});
`;
writeFileSync(join(ROOT, 'app/js/data/foods.js'), file);
console.log(`${rows.length} Lebensmittel (${FOODS_DE.length} Alltagsliste, BLV V ${version}).`);
