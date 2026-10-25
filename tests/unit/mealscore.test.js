import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mealCheck, averageStars, starText } from '../../app/js/domain/mealscore.js';

/** @param {Record<string, unknown>} o */
const e = (o) => /** @type {any} */ ({ id: 'x', name: 'Eintrag', kcal: 400, protein: 20, time: '12:00', ...o });

test('Gute Hauptmahlzeit: Protein, Gemüse, Vollkorn → 5 Sterne mit Lob, kein Tipp', () => {
  const c = mealCheck(
    [e({ name: 'Lachs mit Gemüse und Vollreis', kcal: 650, protein: 38, fiber: 9, groups: { fisch: 1, gemuese: 2, vollkorn: 1 } })],
    true,
  );
  assert.equal(c?.stars, 5);
  assert.ok(c?.good.includes('Proteinreich (38 g)'));
  assert.ok(c?.good.includes('Viel Gemüse/Früchte'));
  assert.equal(c?.tip, null);
});

test('Fast Food: stark verarbeitet, wenig Gemüse, grosse Portion → 1 Stern, wichtigster Tipp zuerst', () => {
  const c = mealCheck([e({ name: 'Burger-Menü', kcal: 1100, protein: 30, nova: 4, sugar: 40, groups: { staerke: 1 } })], true);
  assert.equal(c?.stars, 1);
  assert.match(c?.tip ?? '', /Stark verarbeitet \(Burger-Menü\)/);
});

test('Wenig Protein wird konkret benannt; fehlende Gruppen werden nicht bestraft', () => {
  const c = mealCheck([e({ name: 'Gipfeli', kcal: 300, protein: 6 })], true);
  assert.equal(c?.stars, 2);
  assert.match(c?.tip ?? '', /Nur 6 g Protein/);
  const unknownProtein = mealCheck([e({ protein: 0, proteinKnown: false })], true);
  assert.equal(unknownProtein?.stars, 3);
});

test('Zwischenmahlzeit: eigene Massstäbe', () => {
  assert.equal(mealCheck([e({ name: 'Joghurt mit Beeren', kcal: 180, protein: 12, groups: { milch: 1, frucht: 0.5 } })], false)?.stars, 5);
  assert.equal(mealCheck([e({ name: 'Chips', kcal: 500, protein: 6, nova: 4 })], false)?.stars, 1);
  assert.equal(mealCheck([], false), null);
});

test('Durchschnitt und Sterne als Text', () => {
  assert.equal(averageStars([]), null);
  assert.equal(averageStars(/** @type {any} */ ([{ stars: 4 }, { stars: 3 }, { stars: 5 }])), 4);
  assert.equal(starText(3), '★★★☆☆');
});
