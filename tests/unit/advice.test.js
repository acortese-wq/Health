// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nutritionAdvice } from '../../app/js/domain/advice.js';

/** @type {Parameters<typeof nutritionAdvice>[0]} */
const base = {
  date: '2026-07-15',
  session: { kind: 'rest', title: 'Pause' },
  runsToday: [],
  ratePctPerWeek: 0.6,
  rhrDelta: 1,
  sleep7: 7.2,
  deficit7: 500,
  days: {},
  vitDSupplementUg: 0,
  dietBreakUntil: '',
  startDate: '2026-06-01',
  maintenance: false,
};
const ids = (/** @type {Partial<typeof base>} */ o) => nutritionAdvice({ ...base, ...o }).map((h) => h.id);

test('Ruhiger Sommertag: keine Hinweise', () => {
  assert.deepEqual(ids({}), []);
});

test('Energieverfügbarkeit: Warnung erst bei mindestens zwei Zeichen', () => {
  assert.ok(!ids({ ratePctPerWeek: 1.3 }).includes('red-s'));
  const h = nutritionAdvice({ ...base, ratePctPerWeek: 1.3, rhrDelta: 6 });
  assert.equal(h[0].id, 'red-s');
  assert.equal(h[0].severity, 'warn');
  assert.match(h[0].text, /schnelle Abnahme, erhöhter Ruhepuls/);
});

test('Sporternährung: langer Lauf und Intervalle', () => {
  assert.ok(ids({ session: { kind: 'run', runType: 'long', title: 'Langer Lauf' } }).includes('fuel-long'));
  assert.ok(ids({ runsToday: [{ minutes: 90, runType: 'z2' }] }).includes('fuel-long'));
  assert.ok(ids({ session: { kind: 'run', runType: 'interval', title: 'Intervalle' } }).includes('fuel'));
  assert.ok(!ids({ session: { kind: 'run', runType: 'z2', title: 'Lauf locker' } }).includes('fuel'));
});

test('Kaffee zum Essen an 3 Tagen, Vitamin D im Winter, Diätpause', () => {
  /** @type {Record<string, import('../../app/js/store.js').Day>} */
  const days = {};
  for (const d of ['2026-07-15', '2026-07-14', '2026-07-13']) {
    days[d] = {
      food: [{ id: 'a', name: 'Znacht', kcal: 700, protein: 40, time: '12:00' }],
      caffeine: [{ id: 'c', label: 'Kaffee', mg: 90, time: '12:30' }],
    };
  }
  assert.ok(ids({ days }).includes('coffee-iron'));
  assert.ok(ids({ date: '2026-12-01' }).includes('vit-d'));
  assert.ok(!ids({ date: '2026-12-01', vitDSupplementUg: 15 }).includes('vit-d'));
  assert.ok(ids({ dietBreakUntil: '2026-07-20' }).includes('diet-break'));
  assert.ok(ids({ startDate: '2026-03-01' }).includes('diet-break-offer'));
  assert.ok(!ids({ startDate: '2026-03-01', maintenance: true }).includes('diet-break-offer'));
});
