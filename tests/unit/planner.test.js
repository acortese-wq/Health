// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toGrams, pieceGrams, spoonGrams } from '../../app/js/domain/units.js';
import {
  builtinRecipes,
  recipeNutrition,
  scaleIngredients,
  validateRecipe,
  importRecipes,
  parseReferenceCsv,
  detectAllergens,
} from '../../app/js/domain/recipes.js';
import {
  addPlanned,
  plannedTotals,
  logPlanned,
  isLogged,
  movePlanned,
  copyDay,
  buildShoppingList,
  aggregateIngredients,
} from '../../app/js/domain/planner.js';
import { emptyState, sanitize, exportJSON, importJSON } from '../../app/js/store.js';
import { FOODS } from '../../app/js/data/foods.js';
import { foodAmounts } from '../../app/js/domain/micros.js';

const food = (/** @type {string} */ k) => /** @type {any} */ (FOODS.find((f) => f.k === k));
let n = 0;
const id = () => `id${++n}`;
const NOW = '2026-10-22T08:00:00.000Z';

/** @returns {import('../../app/js/domain/recipes.js').Recipe} */
const own = (over = {}) =>
  validateRecipe(
    {
      title: 'Rührei für zwei',
      servings: 2,
      meals: ['morgen'],
      ingredients: [
        { foodKey: 'ei', amount: 4, unit: 'Stück', label: 'Eier' },
        { foodKey: 'rapsoel', amount: 1, unit: 'EL', label: 'Rapsöl' },
        { foodKey: 'milch', amount: 100, unit: 'ml', label: 'Milch' },
        { foodKey: null, amount: null, unit: 'g', label: 'Salz, Pfeffer' },
      ],
      steps: ['Verquirlen', 'Braten'],
      ...over,
    },
    { id, now: NOW },
  );

test('3: Einheiten – Stück und Löffel aus der Datenbank, ml nur mit Dichte, nichts geraten', () => {
  assert.equal(pieceGrams(food('ei')), 60);
  assert.equal(pieceGrams(food('zwetschgen')), 30, '4 Stück = 120 g');
  assert.equal(pieceGrams(food('broccoli')), null, '«1 Portion» ist kein Stück');
  assert.equal(spoonGrams(food('rapsoel')), 10);
  assert.equal(toGrams(food('rapsoel'), 3, 'TL').grams, 9.9);
  assert.equal(toGrams(food('milch'), 0.2, 'l').grams, 206);
  assert.equal(toGrams(food('haferflocken'), 100, 'ml').grams, null, 'Pulver/Flocken: keine Dichte → nicht umrechnen');
  assert.equal(toGrams(food('broccoli'), 2, 'Stück').grams, null);
  assert.equal(toGrams(food('pasta'), 1.5, 'kg').grams, 1500);
});

test('1/2: Nährwerte aus Zutaten, Portionen skalieren alles konsistent', () => {
  const r = own();
  const n2 = recipeNutrition(r);
  const expectKcal =
    (foodAmounts(food('ei'), 240).kcal ?? 0) + (foodAmounts(food('rapsoel'), 10).kcal ?? 0) + (foodAmounts(food('milch'), 103).kcal ?? 0);
  assert.equal(n2.status, 'berechnet');
  assert.equal(n2.total?.kcal, Math.round(expectKcal));
  assert.equal(n2.perServing?.kcal, Math.round(expectKcal / 2));
  assert.equal(n2.total?.kj, Math.round(expectKcal * 4.184));
  const n4 = recipeNutrition(r, 4);
  assert.ok(Math.abs((n4.total?.kcal ?? 0) - 2 * (n2.total?.kcal ?? 0)) <= 1);
  assert.equal(n4.perServing?.kcal, n2.perServing?.kcal, 'pro Portion gleich');
  assert.deepEqual(
    scaleIngredients(r, 3).map((i) => i.amount),
    [6, 1.5, 150, null],
  );
});

test('4: Fehlende Werte werden nicht als 0 gezählt, sondern ausgewiesen', () => {
  const r = own({
    ingredients: [
      { foodKey: 'ei', amount: 2, unit: 'Stück', label: 'Eier' },
      { foodKey: 'haferflocken', amount: 100, unit: 'ml', label: 'Haferflocken' },
    ],
  });
  const n = recipeNutrition(r);
  assert.equal(n.status, 'teilweise');
  assert.deepEqual(
    n.missing.map((m) => m.label),
    ['Haferflocken'],
  );
  const none = recipeNutrition(own({ ingredients: [{ foodKey: 'broccoli', amount: 1, unit: 'Stück', label: 'Broccoli' }] }));
  assert.equal(none.status, 'nicht verfügbar');
  assert.equal(none.total, null);
});

test('5: Fehlerhafter Import überschreibt nichts und meldet jeden Fehler', () => {
  const existing = [...builtinRecipes(), own()];
  const res = importRecipes(
    {
      recipes: [
        { title: '', ingredients: [] },
        { title: 'X', ingredients: [{ foodKey: 'gibtsnicht', amount: 1, unit: 'g', label: 'x' }] },
        { title: 'Y', ingredients: [{ foodKey: 'ei', amount: 1, unit: 'Prise', label: 'x' }] },
        { title: 'Rührei für zwei', ingredients: [{ foodKey: 'ei', amount: 1, unit: 'Stück', label: 'Ei' }] },
        { title: 'Ref ohne Link', source: { kind: 'referenz' } },
        { title: 'Ref http', source: { kind: 'referenz', url: 'http://unsicher.example' } },
        { id: existing[0].id, title: 'Neu mit fremder ID', ingredients: [{ foodKey: 'ei', amount: 1, unit: 'Stück', label: 'Ei' }] },
      ],
    },
    existing,
    { id, now: NOW },
  );
  assert.equal(res.added.length, 1);
  assert.notEqual(res.added[0].id, existing[0].id, 'vorhandene ID wird nie überschrieben');
  assert.equal(res.skipped.length, 6);
  assert.match(res.skipped.map((s) => s.reason).join(' | '), /Titel fehlt.*unbekannt.*Einheit.*gleicher Titel.*ohne Link.*https/);
  assert.throws(() => importRecipes({ foo: 1 }, existing, { id, now: NOW }), /keine Rezeptliste/);
});

test('CSV-Referenzen: Titel, Link, Herausgeber, nur Link (keine Inhalte)', () => {
  const rows = parseReferenceCsv(
    'Titel;Link;Herausgeber;Mahlzeit\nGemüsecurry;https://www.ndr.de/x.html;NDR;Mittag\n;https://www.ndr.de/y.html;NDR;',
  );
  const res = importRecipes(rows, [], { id, now: NOW });
  assert.equal(res.added.length, 1);
  assert.equal(res.added[0].source.rights, 'nur-link');
  assert.equal(res.added[0].ingredients.length, 0);
  assert.deepEqual(res.added[0].meals, ['mittag']);
  assert.equal(res.skipped.length, 1);
});

test('6: Wochenplan speichern und erneut laden (Schema 3, ältere Daten bleiben lesbar)', () => {
  const st = emptyState();
  const r = own();
  st.recipes.push(r);
  st.favorites.push(r.id);
  addPlanned(st.mealPlan, '2026-10-26', { recipeId: r.id, slot: 'morgen', servings: 1 }, 'p1');
  addPlanned(st.mealPlan, '2026-10-26', { recipeId: 'app-linsensalat', slot: 'mittag', servings: 2 }, 'p2');
  const back = importJSON(exportJSON(st));
  assert.deepEqual(back.mealPlan, st.mealPlan);
  assert.deepEqual(back.recipes, st.recipes);
  assert.deepEqual(back.favorites, [r.id]);
  const v2 = sanitize({ schema: 2, days: {} });
  assert.deepEqual(v2.mealPlan, {});
  assert.deepEqual(v2.recipes, []);
  assert.equal(v2.schema, 3);
});

test('8/9/10: Übernahme in die Ernährung – idempotent, bewusst nochmals möglich, Löschen hebt auf', () => {
  const st = emptyState();
  const r = own();
  st.recipes.push(r);
  const recipes = new Map([...builtinRecipes(), r].map((x) => [x.id, x]));
  addPlanned(st.mealPlan, '2026-10-26', { recipeId: r.id, slot: 'morgen', servings: 1 }, 'p1');
  const plannedKcal = plannedTotals(st.mealPlan['2026-10-26'], recipes).kcal;
  assert.equal(st.days['2026-10-26'], undefined, 'geplant ist nicht gegessen');
  const a = logPlanned(st, 'p1', { servings: 1, time: '07:30', now: new Date(1e6), id: 'e1', recipes });
  assert.equal(a.status, 'created');
  const food = st.days['2026-10-26'].food ?? [];
  assert.equal(food[0].kcal, plannedKcal);
  assert.equal(food[0].planId, 'p1');
  assert.ok(isLogged(st, '2026-10-26', st.mealPlan['2026-10-26'][0]));
  // Technischer Wiederholungsversuch (z. B. Doppelklick, erneutes Absenden)
  const b = logPlanned(st, 'p1', { servings: 1, time: '07:30', now: new Date(1e6 + 200), id: 'e2', recipes });
  assert.equal(b.status, 'already');
  assert.equal(st.days['2026-10-26'].food?.length, 1);
  // Bewusst eine weitere Portion
  const c = logPlanned(st, 'p1', { servings: 0.5, time: '08:00', now: new Date(1e6 + 5000), id: 'e3', recipes, again: true });
  assert.equal(c.status, 'created');
  assert.equal(st.days['2026-10-26'].food?.length, 2);
  // Eintrag gelöscht → wieder offen
  st.days['2026-10-26'].food = st.days['2026-10-26'].food?.filter((f) => f.id !== 'e1');
  assert.equal(isLogged(st, '2026-10-26', st.mealPlan['2026-10-26'][0]), false);
});

test('Plan: verschieben, Tag kopieren ohne Übernahmen', () => {
  const plan = /** @type {import('../../app/js/domain/planner.js').MealPlan} */ ({});
  addPlanned(plan, '2026-10-26', { recipeId: 'a', slot: 'mittag', servings: 1, entryId: 'e' }, 'p1');
  assert.equal(copyDay(plan, '2026-10-26', '2026-10-27', id), 1);
  assert.equal(plan['2026-10-27'][0].entryId, undefined);
  movePlanned(plan, 'p1', '2026-10-28', 'abend');
  assert.equal(plan['2026-10-26'], undefined);
  assert.equal(plan['2026-10-28'][0].slot, 'abend');
});

test('7: Einkaufsliste – zusammenführen, Einheiten getrennt, eigene Artikel und Änderungen bleiben', () => {
  const r1 = own();
  const r2 = own({
    title: 'Eier mit Milch',
    ingredients: [
      { foodKey: 'ei', amount: 120, unit: 'g', label: 'Eier' },
      { foodKey: 'milch', amount: 0.2, unit: 'l', label: 'Milch' },
    ],
  });
  const recipes = new Map([r1, r2].map((x) => [x.id, x]));
  const plan = {};
  addPlanned(plan, '2026-10-26', { recipeId: r1.id, slot: 'morgen', servings: 2 }, 'p1');
  addPlanned(plan, '2026-10-27', { recipeId: r1.id, slot: 'morgen', servings: 1 }, 'p2');
  addPlanned(plan, '2026-10-27', { recipeId: r2.id, slot: 'abend', servings: 1 }, 'p3');
  const agg = aggregateIngredients(plan, ['2026-10-26', '2026-10-27'], recipes);
  const ei = agg.filter((x) => x.label === 'Eier');
  assert.deepEqual(
    ei.map((x) => [x.amount, x.unit]).sort(),
    [
      [6, 'Stück'],
      [60, 'g'],
    ],
    'Stück und Gramm nicht addiert (Rezept für 2, geplant 1 Portion)',
  );
  const milk = agg.find((x) => x.label === 'Milch');
  assert.deepEqual([milk?.amount, milk?.unit], [250, 'ml'], '100 ml + 50 ml + ½ × 0.2 l = 250 ml');
  assert.ok(agg.some((x) => x.label === 'Salz, Pfeffer' && x.amount === null));
  const first = buildShoppingList(null, plan, '2026-10-26', recipes, { id, now: NOW });
  const list = first.list;
  const milkItem = /** @type {any} */ (list.items.find((x) => x.label === 'Milch'));
  milkItem.edited = true;
  milkItem.planAmount = milkItem.amount;
  milkItem.amount = 1;
  milkItem.unit = 'l';
  list.items.find((x) => x.label === 'Eier' && x.unit === 'g').checked = true;
  list.items.push({
    id: 'm1',
    key: 'txt:kaffee',
    label: 'Kaffee',
    amount: null,
    unit: '',
    category: 'Eigene Artikel',
    checked: false,
    manual: true,
  });
  // Plan ändern: r2 fällt weg
  delete plan['2026-10-27'];
  const second = buildShoppingList(list, plan, '2026-10-26', recipes, { id, now: NOW });
  const labels = second.list.items.map((x) => `${x.label}:${x.amount}${x.unit}${x.stale ? '*' : ''}`);
  assert.ok(labels.includes('Kaffee:null'), 'eigener Artikel bleibt');
  assert.ok(labels.includes('Milch:1l'), 'eigene Menge bleibt');
  assert.ok(labels.includes('Eier:60g*'), 'abgehakter Artikel bleibt, als nicht mehr im Plan markiert');
  assert.ok(second.changes.some((c) => c.startsWith('Milch: Plan ergibt jetzt 100 ml')));
});

test('Allergene und vegetarisch aus den Zutaten', () => {
  const r = own();
  assert.deepEqual(detectAllergens(r).sort(), ['Ei', 'Milch/Laktose']);
  const lachs = builtinRecipes().find((x) => x.id === 'app-lachs-ofengemuese');
  assert.ok(lachs && detectAllergens(lachs).includes('Fisch'));
});

test('Alle eingebauten Rezepte vollständig berechenbar', () => {
  for (const r of builtinRecipes()) assert.equal(recipeNutrition(r).status, 'berechnet', r.id);
});
