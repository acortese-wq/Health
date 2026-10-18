// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOODS } from '../../app/js/data/foods.js';
import { portionsFor, addGroups, scaleGroups, pyramid, KI_GROUPS, GROUP_KEYS } from '../../app/js/domain/foodgroups.js';
import { entryFromFood } from '../../app/js/domain/micros.js';
import { parseEstimate, totals } from '../../app/js/domain/foodvision.js';
import { sanitize } from '../../app/js/store.js';

const food = (/** @type {string} */ k) => /** @type {import('../../app/js/data/foods.js').Food} */ (FOODS.find((f) => f.k === k));

test('Portionen nach SGE: 120 g Gemüse, 30 g Hartkäse, 2 dl Milch, Vollkorn, Süsses über kcal', () => {
  assert.deepEqual(portionsFor(food('tomate').gr, 240, 40), { gemuese: 2 });
  assert.deepEqual(portionsFor(food('gruyere').gr, 30, 120), { milch: 1 });
  assert.deepEqual(portionsFor(food('milch').gr, 200, 136), { milch: 1 });
  assert.deepEqual(portionsFor(food('vollkornpasta').gr, 200, 300), { staerke: 1, vollkorn: 1 });
  assert.deepEqual(portionsFor(food('pasta').gr, 200, 300), { staerke: 1 });
  assert.deepEqual(portionsFor(food('chips').gr, 30, 160), { suess: 1.07 });
  assert.deepEqual(portionsFor(food('buendnerfleisch').gr, 50, 80), { wurst: 1 });
  assert.deepEqual(portionsFor(null, 100, 100), {});
  assert.deepEqual(entryFromFood(food('kiwi'), 120).groups, { frucht: 1 });
  assert.deepEqual(addGroups({ gemuese: 1 }, undefined, { gemuese: 0.5, frucht: 1 }), { gemuese: 1.5, frucht: 1 });
  assert.deepEqual(scaleGroups({ milch: 2 }, 0.5), { milch: 1 });
  // Alltagsliste: fast alles einer Gruppe zugeordnet, Öle und Saucen bewusst nicht
  const curated = FOODS.filter((f) => f.c);
  assert.ok(curated.filter((f) => f.gr).length > 100);
  assert.equal(food('olivenoel').gr, null);
  for (const v of Object.values(KI_GROUPS)) assert.ok(GROUP_KEYS.includes(/** @type {any} */ (v[0])));
});

test('Pyramide: Tag und Woche mit Richtwerten', () => {
  const day = [
    { kcal: 100, groups: { gemuese: 2, frucht: 1 } },
    { kcal: 500, groups: { staerke: 2, vollkorn: 1, fisch: 1 } },
    { kcal: 300, groups: { milch: 1, suess: 2 } },
    { kcal: 200 }, // ohne Gruppe
  ];
  const p = pyramid({ today: day, week: [day, [{ kcal: 600, groups: { fleisch: 2, wurst: 2 } }]] });
  const d = Object.fromEntries(p.daily.map((r) => [r.id, r]));
  assert.equal(d.fv.value, 3);
  assert.equal(d.fv.status, 'low');
  assert.match(d.fv.detail ?? '', /Gemüse 2 von 3, Früchte 1 von 2/);
  assert.equal(d.protein.value, 1);
  assert.equal(d.protein.status, 'ok');
  assert.equal(d.suess.status, 'over');
  const w = Object.fromEntries(p.weekly.map((r) => [r.id, r]));
  assert.equal(w.fisch.status, 'ok');
  assert.equal(w.fleisch.value, 4);
  assert.equal(w.fleisch.status, 'over');
  assert.equal(w.huelsen.status, 'low');
  assert.ok(Math.abs(p.coverage - 900 / 1100) < 1e-9);
});

test('KI: Gruppe aus Datenbank-Schlüssel oder food_group, Summen mit Portionsfaktor; Speicher prüft', () => {
  const r = parseEstimate({
    is_food: true,
    dish: 'Teller',
    confidence: 'mittel',
    tip: '',
    assumptions: [],
    items: [
      { name: 'Broccoli', grams: 240, kcal: 80, db_key: 'broccoli', food_group: 'keine', micros: {} },
      { name: 'Hörnli', grams: 300, kcal: 450, db_key: '', food_group: 'staerke', micros: {} },
      { name: 'Sauce', grams: 50, kcal: 100, db_key: '', food_group: 'keine', micros: {} },
    ],
  });
  assert.deepEqual(r.items[0].groups, { gemuese: 2 }, 'Datenbank hat Vorrang');
  assert.deepEqual(r.items[1].groups, { staerke: 2 });
  assert.equal(r.items[2].groups, undefined);
  assert.deepEqual(totals(r.items, 0.5).groups, { gemuese: 1, staerke: 1 });
  const s = sanitize({
    schema: 1,
    days: { '2026-10-18': { food: [{ name: 'x', kcal: 1, protein: 0, groups: { gemuese: 1, gift: 3, milch: -1 } }] } },
  });
  assert.deepEqual(s.days['2026-10-18'].food?.[0].groups, { gemuese: 1 });
});
