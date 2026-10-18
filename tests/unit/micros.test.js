// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOODS } from '../../app/js/data/foods.js';
import { FOODS_DE } from '../../scripts/foods-de.mjs';
import {
  NUTRIENTS,
  MICRO_KEYS,
  dailyTargets,
  dayAmounts,
  averageAmounts,
  macroSplit,
  gaps,
  suggestions,
  searchFoods,
  entryFromFood,
  foodAmounts,
  scaleMicros,
} from '../../app/js/domain/micros.js';
import { parseEstimate, totals, scaleItem, MEAL_SCHEMA, MEAL_SYSTEM_PROMPT } from '../../app/js/domain/foodvision.js';
import { sanitize } from '../../app/js/store.js';

const ALL = { fisch: true, milch: true, fleisch: true, kantine: true };
const food = (/** @type {string} */ k) => /** @type {import('../../app/js/data/foods.js').Food} */ (FOODS.find((f) => f.k === k));

test('Datenbank: erzeugt aus der kuratierten Liste, Werte plausibel, nicht angereichert', () => {
  assert.deepEqual(
    FOODS.filter((f) => f.c).map((f) => f.k),
    FOODS_DE.map((f) => f.k),
    'app/js/data/foods.js ist veraltet: npm run foods',
  );
  // Schweizer Nährwertdatenbank: über 1000 generische Lebensmittel plus Markenprodukte
  assert.ok(FOODS.length > 1200, String(FOODS.length));
  assert.ok(FOODS.filter((f) => f.c).every((f) => f.sr.startsWith('BLV') || f.sr.startsWith('USDA')));
  assert.ok(
    FOODS.filter((f) => !f.c).every((f) => f.t.includes('nosuggest')),
    'nur die Alltagsliste wird vorgeschlagen',
  );
  assert.equal(new Set(FOODS.map((f) => f.k)).size, FOODS.length);
  for (const f of FOODS) {
    const v = f.v;
    assert.ok((v.kcal ?? -1) >= 0, f.k);
    assert.ok(f.n && f.g > 0, f.k);
    if (!f.c) continue;
    // Atwater-Kontrolle (4/4/9, Ballaststoffe 2, verfügbare Kohlenhydrate) mit Toleranz
    const atwater = (v.protein ?? 0) * 4 + (v.carbs ?? 0) * 4 + (v.fiber ?? 0) * 2 + (v.fat ?? 0) * 9;
    if ((v.kcal ?? 0) > 40) assert.ok(Math.abs(atwater - (v.kcal ?? 0)) / (v.kcal ?? 1) < 0.2, `${f.k}: ${atwater} vs ${v.kcal}`);
    assert.ok(f.g > 0 && f.p, f.k);
  }
  assert.ok((food('kiwi').v.vitC ?? 0) > 60, 'Kiwi ist reich an Vitamin C');
  assert.ok((food('lachs').v.b12 ?? 0) > 2, 'Lachs liefert B12');
  assert.ok((food('milch').v.vitD ?? 0) < 0.5, 'Milch ohne US-Vitamin-D-Anreicherung');
  assert.ok((food('pasta').v.iron ?? 0) < 1, 'Teigwaren ohne US-Eisenanreicherung');
  assert.ok(food('kiwi').sr.startsWith('BLV 395'), 'Schweizer Werte haben Vorrang');
  assert.ok((food('lachs').v.epaDha ?? 0) > 1000, 'Lachs liefert EPA + DHA');
  assert.ok((food('ruchbrot').v.iodine ?? 0) > 10, 'Brot mit Jodsalz liefert Jod');
  assert.ok((food('leinsamen').v.ala ?? 0) > 10, 'Leinsamen liefern Alpha-Linolensäure');
  assert.ok(food('kiwi').v.vitK !== undefined, 'Vitamin K aus USDA ergänzt');
});

test('Referenzwerte D-A-CH für Männer und Makroziele aus dem Kalorienziel', () => {
  const t = dailyTargets({ kcalTarget: 1900, proteinG: 150, sex: 'm' });
  assert.equal(t.vitC, 110);
  assert.equal(t.iodine, 150);
  assert.equal(t.b5, 5);
  assert.equal(t.epaDha, 250);
  assert.ok(Math.abs((t.ala ?? 0) - 1.06) < 0.01); // 0.5 % von 1900 kcal
  assert.equal(t.b12, 4);
  assert.equal(t.calcium, 1000);
  assert.equal(t.iron, 11);
  assert.equal(t.fiber, 30);
  assert.equal(t.sodium, 2000);
  assert.equal(Math.round(t.fat ?? 0), 63); // 30 % von 1900 kcal
  assert.equal(Math.round(t.carbs ?? 0), 183);
  assert.equal(Math.round(t.satFat ?? 0), 21);
  assert.equal(dailyTargets({ kcalTarget: 1900, proteinG: 120, sex: 'f' }).iron, 16);
  // Jeder Zielnährstoff hat eine Einheit und wird pro Eintrag gespeichert oder ist ein Makro
  for (const n of NUTRIENTS) assert.ok(n.unit && n.label, n.key);
  assert.ok(MICRO_KEYS.includes('b12'));
});

test('Tagessummen: Abdeckung, Natrium aus Salz, Makroverteilung nur aus vollständigen Einträgen', () => {
  const kiwi = entryFromFood(food('kiwi'), 150);
  assert.equal(kiwi.name, 'Kiwi (150 g)');
  assert.ok((kiwi.micros.vitC ?? 0) > 100); // BLV: 75 mg pro 100 g
  const quick = { kcal: 500, protein: 30 }; // Schnellerfassung ohne Details
  const r = dayAmounts([kiwi, quick]);
  assert.ok(Math.abs(r.coverage - kiwi.kcal / (kiwi.kcal + 500)) < 1e-9);
  assert.ok(r.macroCoverage < 0.3);
  assert.equal(r.amounts.protein, kiwi.protein + 30);
  // Ring nur aus der Kiwi: vor allem Kohlenhydrate
  const split = macroSplit(r.macroKnown);
  assert.ok(split.carbs > 0.8);
  const salty = dayAmounts([{ kcal: 300, protein: 10, salt: 2.5 }]);
  assert.equal(Math.round(salty.amounts.sodium ?? 0), 1000);
  const avg = averageAmounts([[kiwi], [], [kiwi, kiwi]]);
  assert.equal(avg.days, 2);
  assert.ok(Math.abs((avg.amounts.vitC ?? 0) - (kiwi.micros.vitC ?? 0) * 1.5) < 0.01);
  assert.deepEqual(scaleMicros({ vitC: 10, b12: 1 }, 0.5), { vitC: 5, b12: 0.5 });
});

test('Vorschläge: Vitamin C → Frucht oder Gemüse, B12 → Fisch/Fleisch/Milch, Vorlieben und Budget', () => {
  const targets = dailyTargets({ kcalTarget: 1900, proteinG: 150, sex: 'm' });
  // Tag mit Pasta: Vitamin C und B12 fehlen
  const pasta = entryFromFood(food('pasta'), 225);
  const { amounts } = dayAmounts([pasta]);
  const open = gaps(amounts, targets).map((g) => g.key);
  assert.ok(open.includes('vitC') && open.includes('b12'));
  assert.ok(!open.includes('vitD'), 'Vitamin D ist kein Vorschlagsziel');
  const list = suggestions({ foods: FOODS, amounts, targets, kcalLeft: 1200, prefs: ALL, limit: 6 });
  assert.ok(list.length >= 3);
  for (const s of list) {
    assert.ok(s.pct >= 0.3, s.food.k);
    assert.ok(!s.food.t.includes('nosuggest'));
  }
  assert.equal(new Set(list.map((s) => s.food.k)).size, list.length, 'kein Lebensmittel doppelt');
  const c = list.find((s) => s.key === 'vitC');
  if (c) assert.ok(c.food.t.includes('frucht') || c.food.t.includes('gemuese'), c.food.k);
  const b12 = list.find((s) => s.key === 'b12');
  if (b12)
    assert.ok(
      ['fisch', 'fleisch', 'milch', 'ei'].some((t) => b12.food.t.includes(t)),
      b12.food.k,
    );
  // Ohne Fisch, Fleisch und Milch: nichts davon
  const veg = suggestions({
    foods: FOODS,
    amounts,
    targets,
    kcalLeft: 1200,
    prefs: { fisch: false, milch: false, fleisch: false, kantine: false },
    limit: 6,
  });
  assert.ok(veg.every((s) => !['fisch', 'fleisch', 'milch'].some((t) => s.food.t.includes(t))));
  // Kleines Budget: nichts über Budget + 50 kcal
  const small = suggestions({ foods: FOODS, amounts, targets, kcalLeft: 100, prefs: ALL, limit: 6 });
  assert.ok(small.every((s) => s.kcal <= 150));
  // Alles gedeckt → keine Vorschläge
  /** @type {import('../../app/js/domain/micros.js').Amounts} */
  const full = {};
  for (const [k, v] of Object.entries(targets)) full[/** @type {import('../../app/js/domain/micros.js').NutrientKey} */ (k)] = (v ?? 0) * 2;
  assert.equal(suggestions({ foods: FOODS, amounts: full, targets, kcalLeft: 500, prefs: ALL }).length, 0);
});

test('Suche: Umlaute, Gross/klein, Synonyme', () => {
  assert.deepEqual(
    searchFoods(FOODS, 'rueeb').map((f) => f.k),
    [],
  );
  assert.equal(searchFoods(FOODS, 'Rüeb')[0].k, 'rueebli');
  // Alltagsliste zuerst, dann die übrigen Einträge der Schweizer Datenbank
  const apfel = searchFoods(FOODS, 'apfel');
  assert.equal(apfel[0].k, 'apfel');
  assert.ok(apfel.some((f) => f.k.startsWith('blv-')));
  assert.ok(
    searchFoods(FOODS, 'Süssmost').some((f) => f.n === 'Apfelsaft'),
    'Synonyme der BLV-Datenbank',
  );
  assert.equal(searchFoods(FOODS, 'karotte')[0].k, 'rueebli');
  assert.ok(searchFoods(FOODS, 'kase').some((f) => f.k === 'gruyere'));
  assert.equal(searchFoods(FOODS, '').length, 0);
});

test('KI: Datenbank-Schlüssel ersetzt Mikro-Schätzung, sonst KI-Werte, Summe «gemischt»', () => {
  // Schema verlangt die neuen Felder, Prompt enthält die Liste
  const item = /** @type {any} */ (MEAL_SCHEMA.properties.items).items;
  assert.ok(item.required.includes('db_key') && item.required.includes('micros'));
  assert.ok(MEAL_SYSTEM_PROMPT.includes('kiwi=Kiwi'));
  const micros = { vit_c_mg: 5, vit_b12_ug: 2, calcium_mg: 50 };
  const r = parseEstimate({
    is_food: true,
    dish: 'Teller',
    confidence: 'mittel',
    tip: '',
    assumptions: [],
    items: [
      { name: 'Kiwi', portion: '2 Stück', grams: 150, kcal: 90, kcal_low: 80, kcal_high: 100, db_key: 'kiwi', micros },
      { name: 'Sauce', portion: '1 Kelle', grams: 100, kcal: 120, kcal_low: 90, kcal_high: 160, db_key: 'gibt-es-nicht', micros },
      {
        name: 'Brot',
        portion: '1 Scheibe',
        grams: 50,
        kcal: 120,
        kcal_low: 110,
        kcal_high: 130,
        db_key: '',
        micros: { vit_c_mg: 99999999 },
      },
    ],
  });
  const [kiwi, sauce, brot] = r.items;
  assert.equal(kiwi.microSrc, 'db');
  assert.ok(Math.abs((kiwi.micros?.vitC ?? 0) - (foodAmounts(food('kiwi'), 150).vitC ?? 0)) < 0.01);
  assert.equal(sauce.microSrc, 'ki');
  assert.equal(sauce.micros?.b12, 2);
  assert.ok((brot.micros?.vitC ?? 0) <= 50000, 'unplausible Werte begrenzt');
  const half = scaleItem(kiwi, 75);
  assert.ok(Math.abs((half.micros?.vitC ?? 0) - (kiwi.micros?.vitC ?? 0) / 2) < 0.02);
  const t = totals([kiwi, sauce]);
  assert.equal(t.microSrc, 'mix');
  assert.ok(Math.abs((t.micros?.b12 ?? 0) - 2 - (kiwi.micros?.b12 ?? 0)) < 0.01);
  assert.equal(totals([kiwi]).microSrc, 'db');
});

test('Speicher: Mikronährstoffe und Vorlieben werden geprüft übernommen', () => {
  const s = sanitize({
    schema: 1,
    profile: { foodPrefs: { fisch: false } },
    days: {
      '2026-10-18': {
        food: [
          {
            id: 'a',
            name: 'Kiwi',
            kcal: 90,
            protein: 2,
            time: '10:00',
            micros: { vitC: 139, b12: -1, evil: 5 },
            microSrc: 'db',
            source: 'datenbank',
          },
          { id: 'b', name: 'Alt', kcal: 300, protein: 10, time: '12:00', micros: 'kaputt' },
        ],
      },
    },
  });
  const [kiwi, alt] = s.days['2026-10-18'].food ?? [];
  assert.deepEqual(kiwi.micros, { vitC: 139 });
  assert.equal(kiwi.microSrc, 'db');
  assert.equal(kiwi.source, 'datenbank');
  assert.equal(alt.micros, undefined);
  assert.deepEqual(s.profile.foodPrefs, { fisch: false, milch: true, fleisch: true, kantine: true });
});

test('Open Food Facts: Vitamine in g → mg/µg, Unplausibles verworfen, Suche auf Schweiz und Händler', async () => {
  const { parseOffProduct, parseOffSearch, offSearchUrl, productPortion } = await import('../../app/js/domain/foodvision.js');
  const p = parseOffProduct(
    {
      code: '7610200000000',
      product_name_de: 'Skyr nature',
      brands: 'M-Classic',
      stores: 'Migros',
      quantity: '450 g',
      serving_quantity: 150,
      nutriments: {
        'energy-kcal_100g': 63,
        proteins_100g: 11,
        carbohydrates_100g: 4,
        fat_100g: 0.2,
        salt_100g: 0.1,
        sodium_100g: 0.04,
        calcium_100g: 0.12,
        'vitamin-b12_100g': 0.0000005,
        'vitamin-c_100g': 7, // 7000 mg: Tippfehler in der Datenbank
      },
    },
    '',
  );
  assert.ok(p);
  assert.equal(p.barcode, '7610200000000');
  assert.equal(p.stores, 'Migros');
  assert.equal(p.per100.micros?.calcium, 120);
  assert.equal(p.per100.micros?.b12, 0.5);
  assert.equal(p.per100.micros?.sodium, 40);
  assert.equal(p.per100.micros?.vitC, undefined);
  assert.equal(p.per100.microSrc, 'etikett');
  const portion = productPortion(p, 150);
  assert.equal(portion.micros?.calcium, 180);
  // Nur Natrium → keine Mikronährstoff-Angabe
  const plain = parseOffProduct({ nutriments: { 'energy-kcal_100g': 250, sodium_100g: 0.4 } }, '1');
  assert.equal(plain?.per100.micros, undefined);
  assert.equal(
    parseOffSearch({ products: [{ nutriments: {} }, { code: '1', product_name: 'Brot', nutriments: { 'energy-kcal_100g': 240 } }] }).length,
    1,
  );
  assert.deepEqual(parseOffSearch(null), []);
  const url = new URL(offSearchUrl(' skyr ', 'migros'));
  assert.equal(url.hostname, 'world.openfoodfacts.org');
  assert.equal(url.searchParams.get('search_terms'), 'skyr');
  assert.equal(url.searchParams.get('tag_0'), 'switzerland');
  assert.equal(url.searchParams.get('tag_1'), 'migros');
  assert.equal(new URL(offSearchUrl('brot')).searchParams.get('tag_1'), null);
  // Etikettwerte zählen, gelten aber nicht als vollständige Abdeckung
  const r = dayAmounts([{ kcal: 100, protein: 10, micros: { calcium: 120 }, microSrc: 'etikett' }]);
  assert.equal(r.amounts.calcium, 120);
  assert.equal(r.coverage, 0);
});

test('Aufschlüsselung: welche Einträge einen Nährstoff liefern', async () => {
  const { contributions, entryValue } = await import('../../app/js/domain/micros.js');
  const food = [
    { name: 'Kiwi', kcal: 90, protein: 1, micros: { vitC: 110 } },
    { name: 'Peperoni', kcal: 40, protein: 1, micros: { vitC: 190 } },
    { name: 'Brot', kcal: 250, protein: 9, micros: { vitC: 0 } },
    { name: 'Kantine', kcal: 700, protein: 35, salt: 2.5 },
  ];
  const c = contributions(food, 'vitC');
  assert.deepEqual(
    c.items.map((x) => [x.f.name, x.value, Math.round(x.share * 100)]),
    [
      ['Peperoni', 190, 63],
      ['Kiwi', 110, 37],
    ],
  );
  assert.deepEqual(
    c.unknown.map((f) => f.name),
    ['Kantine'],
  );
  assert.equal(Math.round(entryValue(food[3], 'sodium') ?? 0), 1000, 'Natrium aus Salz');
  assert.equal(contributions(food, 'protein').items[0].f.name, 'Kantine');
});
