// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEAL_TEMPLATES, mealEntry, suggestMeals, nextSlot } from '../../app/js/domain/mealplans.js';
import { dailyTargets } from '../../app/js/domain/micros.js';
import { parseOffProduct, productPortion } from '../../app/js/domain/foodvision.js';

const ALL = { fisch: true, milch: true, fleisch: true, kantine: true };
const targets = dailyTargets({ kcalTarget: 1900, proteinG: 150, sex: 'm' });

test('Vorlagen: alle berechenbar, Hauptmahlzeiten mit genug Protein und Gemüse (Teller-Modell)', () => {
  for (const t of MEAL_TEMPLATES) {
    const e = mealEntry(t);
    assert.ok(e.kcal > 100 && e.kcal < 800, `${t.id}: ${e.kcal}`);
    if (t.slots.includes('mittag')) {
      assert.ok(e.protein >= 25, `${t.id}: ${e.protein} g Protein`);
      assert.ok((e.groups.gemuese ?? 0) + (e.groups.huelsen ?? 0) >= 1, `${t.id}: zu wenig Gemüse`);
    }
    assert.ok(Object.keys(e.micros).length > 15, t.id);
  }
  assert.equal(nextSlot(8 * 60), 'morgen');
  assert.equal(nextSlot(12 * 60), 'mittag');
  assert.equal(nextSlot(15 * 60), 'zvieri');
  assert.equal(nextSlot(19 * 60), 'abend');
});

test('Mahlzeiten-Vorschlag: Tageszeit, Budget, Vorlieben, Fisch der Woche', () => {
  const base = { kcalLeft: 700, proteinLeft: 60, amounts: { protein: 90 }, targets, dayGroups: { gemuese: 1 } };
  const fish = suggestMeals({ ...base, slot: 'abend', prefs: ALL, weekFish: 0 });
  assert.equal(fish.length, 2);
  assert.ok(fish[0].entry.tags.includes('fisch'), fish[0].template.id);
  assert.ok(fish[0].highlights.includes('Fisch der Woche'));
  const noAnimal = suggestMeals({
    ...base,
    slot: 'abend',
    prefs: { fisch: false, milch: false, fleisch: false, kantine: false },
    weekFish: 0,
    limit: 10,
  });
  assert.ok(noAnimal.length > 0);
  for (const m of noAnimal) assert.ok(!['fisch', 'fleisch', 'milch'].some((t) => m.entry.tags.includes(t)), m.template.id);
  const zvieri = suggestMeals({ ...base, slot: 'zvieri', prefs: ALL, weekFish: 2, limit: 10 });
  assert.ok(zvieri.every((m) => m.template.slots.includes('zvieri')));
  const tight = suggestMeals({ ...base, kcalLeft: 200, slot: 'abend', prefs: ALL, weekFish: 2, limit: 10 });
  assert.ok(tight.every((m) => m.entry.kcal <= 300));
});

test('NOVA-Gruppe aus Open Food Facts wird übernommen', () => {
  const p = parseOffProduct({ product_name: 'Chips', nova_group: 4, nutriments: { 'energy-kcal_100g': 530 } }, '1');
  assert.equal(p?.nova, 4);
  assert.equal(p && productPortion(p, 30).nova, 4);
  assert.equal(parseOffProduct({ product_name: 'x', nova_group: 9, nutriments: { 'energy-kcal_100g': 1 } }, '1')?.nova, undefined);
});
