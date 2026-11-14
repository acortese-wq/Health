import { test } from 'node:test';
import assert from 'node:assert/strict';
import { richFoods, richRecipes, weakest, ABSORPTION, REPLENISHABLE } from '../../app/js/domain/replenish.js';
import { FOODS } from '../../app/js/data/foods.js';
import { builtinRecipes } from '../../app/js/domain/recipes.js';

const all = { fisch: true, milch: true, fleisch: true };

test('Lebensmittel mit viel Eisen bzw. EPA/DHA; Vorlieben werden beachtet', () => {
  const iron = richFoods(FOODS, 'iron', { prefs: all, target: 10 });
  assert.equal(iron.length, 8);
  assert.ok(iron.every((x) => x.amount > 0 && x.pct !== null));
  // absteigend nach Bewertung
  for (let i = 1; i < iron.length; i++) assert.ok(iron[i - 1].score >= iron[i].score);
  const fish = richFoods(FOODS, 'epaDha', { prefs: all });
  assert.ok(fish.some((x) => x.food.t.includes('fisch')));
  const noFish = richFoods(FOODS, 'epaDha', { prefs: { ...all, fisch: false } });
  assert.ok(noFish.every((x) => !x.food.t.includes('fisch')));
  const noMeat = richFoods(FOODS, 'iron', { prefs: { ...all, fleisch: false } });
  assert.ok(noMeat.every((x) => !x.food.t.includes('fleisch')));
});

test('Rezepte nach Menge pro Portion; knappster Nährstoff; Aufnahme-Tipps', () => {
  const r = richRecipes(builtinRecipes(), 'protein', { target: 140 });
  assert.ok(r.length > 0);
  for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].amount >= r[i].amount);
  assert.equal(weakest({ iron: 3, vitC: 200 }, { iron: 10, vitC: 110 }), 'iron');
  assert.equal(weakest({ iron: 12 }, { iron: 10 }), null);
  assert.ok(REPLENISHABLE.includes('epaDha'));
  assert.ok(!REPLENISHABLE.includes(/** @type {any} */ ('sodium')));
  assert.ok(ABSORPTION.iron?.some((t) => t.text.includes('Kaffee') && t.ref?.includes('Morck')));
  assert.ok(ABSORPTION.epaDha?.some((t) => t.ref?.includes('Burdge')));
});
