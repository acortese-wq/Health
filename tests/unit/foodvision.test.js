import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEAL_SCHEMA, macrosConsistent, parseEstimate, totals, userPrompt } from '../../app/js/domain/foodvision.js';

const sample = {
  is_food: true,
  dish: 'Spaghetti bolognese',
  items: [
    {
      name: 'Spaghetti, gekocht',
      portion: '1 Teller',
      grams: 250,
      kcal: 390,
      kcal_low: 330,
      kcal_high: 450,
      protein_g: 14,
      carbs_g: 78,
      fat_g: 2,
    },
    {
      name: 'Bolognese-Sauce',
      portion: '2 Schöpfkellen',
      grams: 180,
      kcal: 300,
      kcal_low: 220,
      kcal_high: 400,
      protein_g: 18,
      carbs_g: 10,
      fat_g: 20,
    },
    { name: 'Parmesan', portion: '1 EL', grams: 10, kcal: 40, kcal_low: 30, kcal_high: 60, protein_g: 4, carbs_g: 0, fat_g: 3 },
  ],
  assumptions: ['Sauce mit 1 EL Olivenöl zubereitet'],
  confidence: 'mittel',
  tip: 'Mehr Protein: 100 g Poulet dazu.',
};

test('Schema ist für strukturierte Ausgabe gültig (alle Felder Pflicht, keine Zusatzfelder)', () => {
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
});

test('Antwort wird übernommen und gerundet', () => {
  const r = parseEstimate(sample);
  assert.equal(r.dish, 'Spaghetti bolognese');
  assert.equal(r.items.length, 3);
  assert.deepEqual(r.items[1], {
    name: 'Bolognese-Sauce',
    portion: '2 Schöpfkellen',
    grams: 180,
    kcal: 300,
    kcalLow: 220,
    kcalHigh: 400,
    protein: 18,
    carbs: 10,
    fat: 20,
  });
  assert.equal(r.confidence, 'mittel');
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
  assert.equal(r.dish, 'Mahlzeit');
  assert.equal(r.items.length, 1);
  const it = r.items[0];
  assert.equal(it.name, 'Bestandteil');
  assert.equal(it.grams, 0);
  assert.ok(it.kcalLow <= it.kcal && it.kcal <= it.kcalHigh);
  assert.equal(it.protein, 300);
  assert.equal(it.carbs, 0);
  assert.deepEqual(r.assumptions, ['ok']);
  assert.equal(r.confidence, 'mittel');
  assert.equal(r.tip, '');
  assert.throws(() => parseEstimate(null));
});

test('Kein Essen wird erkannt', () => {
  assert.equal(parseEstimate({ ...sample, is_food: false, items: [] }).isFood, false);
});

test('Summen mit Portionsfaktor', () => {
  const r = parseEstimate(sample);
  assert.deepEqual(totals(r.items), { kcal: 730, kcalLow: 580, kcalHigh: 910, protein: 36, carbs: 88, fat: 25 });
  assert.equal(totals(r.items, 0.5).kcal, 365);
  assert.equal(totals(r.items.slice(0, 1), 1.5).protein, 21);
});

test('Plausibilität nach Atwater (4/4/9)', () => {
  // 36×4 + 88×4 + 25×9 = 721 ≈ 730
  assert.ok(macrosConsistent({ kcal: 730, protein: 36, carbs: 88, fat: 25 }));
  assert.ok(!macrosConsistent({ kcal: 1200, protein: 10, carbs: 20, fat: 5 }));
});

test('Nutzertext enthält Angabe und Tagesrest, kürzt lange Eingaben', () => {
  const t = userPrompt({ hint: '  halbe Portion ', kcalLeft: 812.4, proteinLeft: 61.6 });
  assert.match(t, /«halbe Portion»/);
  assert.match(t, /812 kcal und 62 g Protein/);
  assert.ok(userPrompt({ hint: 'x'.repeat(1000), kcalLeft: null, proteinLeft: null }).length < 400);
});
