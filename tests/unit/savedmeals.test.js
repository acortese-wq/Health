import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mealFromEntries, mealTotals, loggingStreak } from '../../app/js/domain/savedmeals.js';
import { emptyState, sanitize, SCHEMA_VERSION } from '../../app/js/store.js';

const entries = [
  {
    id: 'a',
    name: 'Skyr mit Beeren',
    kcal: 250,
    protein: 25,
    time: '07:20',
    at: '2026-10-25T05:20:00Z',
    hunger: 3,
    trigger: 'stress',
    carbs: 20,
    fat: 2,
  },
  { id: 'b', name: 'Kaffee mit Milch', kcal: 40, protein: 2, time: '07:25', repeatOf: 'x', planId: 'p' },
];

test('Eigene Mahlzeit: nur Nährwerte, ohne Uhrzeit, Hunger, Auslöser und Verknüpfungen', () => {
  const m = mealFromEntries('  Mein Frühstück ', /** @type {any} */ (entries), { id: 'm1', now: '2026-10-25T08:00:00Z' });
  assert.equal(m.name, 'Mein Frühstück');
  assert.equal(m.items.length, 2);
  for (const k of ['id', 'time', 'at', 'hunger', 'trigger', 'repeatOf', 'planId']) assert.ok(!(k in m.items[0]) && !(k in m.items[1]), k);
  assert.equal(m.items[0].carbs, 20);
  assert.deepEqual(mealTotals(m), { kcal: 290, protein: 27 });
});

test('Speichern (Schema 5): eigene Mahlzeiten werden geprüft, ältere Daten bleiben lesbar', () => {
  assert.equal(SCHEMA_VERSION, 5);
  const raw = JSON.parse(
    JSON.stringify({
      ...emptyState(),
      savedMeals: [
        {
          id: 'm1',
          name: 'Frühstück',
          items: [
            { name: 'Skyr', kcal: 250, protein: 25, hunger: 2 },
            { name: 'kaputt', kcal: -5, protein: 1 },
          ],
        },
        { id: 'm1', name: 'Doppelte ID', items: [{ name: 'Apfel', kcal: 80, protein: 0 }] },
        { name: '', items: [{ name: 'x', kcal: 1, protein: 0 }] },
        { name: 'Leer', items: [] },
      ],
    }),
  );
  const s = sanitize(raw);
  assert.equal(s.savedMeals.length, 2);
  assert.deepEqual(s.savedMeals[0].items, [{ name: 'Skyr', kcal: 250, protein: 25 }]);
  assert.notEqual(s.savedMeals[1].id, 'm1');
  const old = sanitize({ ...JSON.parse(JSON.stringify(emptyState())), schema: 4, savedMeals: undefined });
  assert.deepEqual(old.savedMeals, []);
});

test('Serie: Tage in Folge mit Einträgen; heute noch leer zählt ab gestern', () => {
  const f = { food: [{}] };
  const days = { '2026-10-22': f, '2026-10-23': f, '2026-10-24': f };
  assert.deepEqual(loggingStreak(days, '2026-10-25'), { days: 3, today: false });
  assert.deepEqual(loggingStreak({ ...days, '2026-10-25': f }, '2026-10-25'), { days: 4, today: true });
  assert.deepEqual(loggingStreak({ '2026-10-20': f }, '2026-10-25'), { days: 0, today: false });
});
