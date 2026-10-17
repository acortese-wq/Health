import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LABEL_SCHEMA,
  MEAL_SCHEMA,
  isHighProtein,
  isValidGtin,
  macrosConsistent,
  parseEstimate,
  parseLabel,
  parseOpenFoodFacts,
  productPortion,
  scaleItem,
  totals,
  userPrompt,
} from '../../app/js/domain/foodvision.js';

const n = (o) => ({ sugar_g: 0, satfat_g: 0, fiber_g: 0, salt_g: 0, ...o });
const sample = {
  is_food: true,
  dish: 'Spaghetti bolognese',
  items: [
    n({
      name: 'Spaghetti, gekocht',
      portion: '1 Teller',
      grams: 250,
      kcal: 390,
      kcal_low: 330,
      kcal_high: 450,
      protein_g: 14,
      carbs_g: 78,
      fat_g: 2,
      fiber_g: 4.5,
      salt_g: 0.1,
    }),
    n({
      name: 'Bolognese-Sauce',
      portion: '2 Schöpfkellen',
      grams: 180,
      kcal: 300,
      kcal_low: 220,
      kcal_high: 400,
      protein_g: 18,
      carbs_g: 10,
      fat_g: 20,
      salt_g: 1.4,
      satfat_g: 7,
    }),
    n({
      name: 'Parmesan',
      portion: '1 EL',
      grams: 10,
      kcal: 40,
      kcal_low: 30,
      kcal_high: 60,
      protein_g: 4,
      carbs_g: 0,
      fat_g: 3,
      salt_g: 0.2,
    }),
  ],
  assumptions: ['Sauce mit 1 EL Olivenöl zubereitet'],
  confidence: 'mittel',
  tip: 'Mehr Protein: 100 g Poulet dazu.',
};

test('Schemas sind für strukturierte Ausgabe gültig (alle Felder Pflicht, keine Zusatzfelder)', () => {
  /** @param {any} node */
  const check = (node) => {
    if (node.type === 'object') {
      assert.equal(node.additionalProperties, false);
      assert.deepEqual([...node.required].sort(), Object.keys(node.properties).sort());
      Object.values(node.properties).forEach(check);
    }
    if (node.type === 'array') check(node.items);
  };
  check(MEAL_SCHEMA);
  check(LABEL_SCHEMA);
});

test('Antwort wird übernommen, Ausgangswerte für spätere Umrechnung gespeichert', () => {
  const r = parseEstimate(sample);
  assert.equal(r.dish, 'Spaghetti bolognese');
  assert.equal(r.items.length, 3);
  const sauce = r.items[1];
  assert.equal(sauce.grams, 180);
  assert.equal(sauce.baseGrams, 180);
  assert.equal(sauce.kcal, 300);
  assert.equal(sauce.salt, 1.4);
  assert.equal(sauce.satFat, 7);
  assert.equal(sauce.base.kcal, 300);
});

test('Unplausible Werte werden begrenzt, vertauschte Spannen korrigiert', () => {
  const r = parseEstimate({
    is_food: true,
    dish: '',
    items: [
      { name: '', portion: 3, grams: -5, kcal: 500, kcal_low: 700, kcal_high: 300, protein_g: 9999, carbs_g: 'x', fat_g: 10 },
      'kaputt',
    ],
    assumptions: ['', 42, 'ok'],
    confidence: 'sehr hoch',
    tip: null,
  });
  const it = r.items[0];
  assert.equal(r.dish, 'Mahlzeit');
  assert.equal(it.name, 'Bestandteil');
  assert.equal(it.grams, 0);
  assert.ok(it.kcalLow <= it.kcal && it.kcal <= it.kcalHigh);
  assert.equal(it.protein, 300);
  assert.equal(it.carbs, 0);
  assert.equal(it.fiber, 0);
  assert.deepEqual(r.assumptions, ['ok']);
  assert.equal(r.confidence, 'mittel');
  assert.throws(() => parseEstimate(null));
});

test('Grammangabe ändern skaliert alle Werte, ohne Rundungsfehler aufzusummieren', () => {
  const sauce = parseEstimate(sample).items[1];
  const half = scaleItem(sauce, 90);
  assert.equal(half.kcal, 150);
  assert.equal(half.protein, 9);
  assert.equal(half.salt, 0.7);
  assert.equal(half.kcalHigh, 200);
  let x = sauce;
  for (const g of [97, 123, 61, 333, 180]) x = scaleItem(x, g);
  assert.deepEqual({ ...x, base: undefined }, { ...sauce, base: undefined });
  // Ohne Grammangabe des Modells keine Umrechnung
  const noGrams = parseEstimate({
    ...sample,
    items: [n({ name: 'x', grams: 0, kcal: 100, kcal_low: 80, kcal_high: 120, protein_g: 1, carbs_g: 1, fat_g: 1 })],
  }).items[0];
  assert.equal(scaleItem(noGrams, 200).kcal, 100);
});

test('Summen mit Portionsfaktor inkl. Ballaststoffe und Salz', () => {
  const r = parseEstimate(sample);
  const t = totals(r.items);
  assert.equal(t.kcal, 730);
  assert.equal(t.protein, 36);
  assert.equal(t.salt, 1.7);
  assert.equal(t.fiber, 4.5);
  assert.equal(totals(r.items, 0.5).kcal, 365);
});

test('Plausibilität nach Atwater und «proteinreich» nach EU-Verordnung', () => {
  assert.ok(macrosConsistent({ kcal: 730, protein: 36, carbs: 88, fat: 25 }));
  assert.ok(!macrosConsistent({ kcal: 1200, protein: 10, carbs: 20, fat: 5 }));
  // 20 % der Energie aus Protein: 25 g × 4 = 100 kcal von 500
  assert.ok(isHighProtein({ kcal: 500, protein: 25 }));
  assert.ok(!isHighProtein({ kcal: 500, protein: 24 }));
  assert.ok(!isHighProtein({ kcal: 0, protein: 10 }));
});

test('Nutzertext: Beschreibung, Angabe, Tagesrest', () => {
  const t = userPrompt({ hint: '  halbe Portion ', kcalLeft: 812.4, proteinLeft: 61.6 });
  assert.match(t, /Foto/);
  assert.match(t, /«halbe Portion»/);
  assert.match(t, /812 kcal und 62 g Protein/);
  assert.match(userPrompt({ hint: '', description: 'Rösti mit Spiegelei', kcalLeft: null, proteinLeft: null }), /«Rösti mit Spiegelei»/);
});

test('Barcode-Prüfziffer (EAN-13, EAN-8, UPC-A)', () => {
  assert.ok(isValidGtin('4006381333931'));
  assert.ok(isValidGtin('96385074'));
  assert.ok(isValidGtin('036000291452'));
  assert.ok(!isValidGtin('4006381333932'));
  assert.ok(!isValidGtin('12345'));
  assert.ok(!isValidGtin('abcdefghijklm'));
});

test('Nährwerttabelle lesen, ungültige Barcodes verwerfen', () => {
  const r = parseLabel({
    is_label: true,
    product: 'Skyr Nature',
    brand: 'Emmi',
    barcode: '4006 3813 3393 1',
    unit: 'g',
    serving_g: 150,
    per100: { kcal: 63, protein_g: 11, carbs_g: 4, sugar_g: 4, fat_g: 0.2, satfat_g: 0.1, fiber_g: 0, salt_g: 0.1 },
  });
  assert.ok(r.readable);
  assert.equal(r.product.barcode, '4006381333931');
  assert.equal(r.product.per100.protein, 11);
  assert.equal(r.product.servingG, 150);
  assert.equal(parseLabel({ is_label: false, barcode: '123', per100: {} }).product.barcode, '');
});

test('Open Food Facts: kcal, kJ-Umrechnung, nicht gefunden', () => {
  const p = parseOpenFoodFacts(
    {
      status: 1,
      product: {
        product_name: 'Skyr',
        brands: 'Emmi, Migros',
        quantity: '450 g',
        serving_quantity: '150',
        nutriments: {
          'energy-kcal_100g': 63,
          proteins_100g: 11,
          carbohydrates_100g: 4,
          sugars_100g: 4,
          fat_100g: 0.2,
          'saturated-fat_100g': 0.1,
          salt_100g: 0.1,
        },
      },
    },
    '4006381333931',
  );
  assert.ok(p);
  assert.equal(p.brand, 'Emmi');
  assert.equal(p.servingG, 150);
  assert.equal(p.unit, 'g');
  assert.equal(p.source, 'barcode');
  const kj = parseOpenFoodFacts(
    { status: 1, product: { product_name: 'Milch', quantity: '1 l', nutriments: { energy_100g: 268, proteins_100g: 3.3 } } },
    '1',
  );
  assert.equal(kj?.per100.kcal, 64);
  assert.equal(kj?.unit, 'ml');
  assert.equal(parseOpenFoodFacts({ status: 0, status_verbose: 'product not found' }, '1'), null);
  assert.equal(parseOpenFoodFacts({ status: 1, product: { nutriments: {} } }, '1'), null);
});

test('Portion eines Produkts', () => {
  const v = productPortion(
    {
      name: 'x',
      brand: '',
      barcode: '',
      unit: 'g',
      servingG: 0,
      source: 'etikett',
      per100: { kcal: 63, protein: 11, carbs: 4, sugar: 4, fat: 0.2, satFat: 0.1, fiber: 0, salt: 0.1 },
    },
    250,
  );
  assert.equal(v.kcal, 158);
  assert.equal(v.protein, 27.5);
  assert.equal(v.salt, 0.3);
});
