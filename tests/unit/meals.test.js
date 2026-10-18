// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mealSlots, proteinPerMeal, cravingPatterns, TRIGGER_TIPS, TRIGGERS } from '../../app/js/domain/meals.js';
import { addDays } from '../../app/js/domain/util.js';

/** @param {string} time @param {number} kcal @param {number} protein */
const f = (time, kcal, protein, extra = {}) => ({ id: time, name: 'x', time, kcal, protein, ...extra });

test('Essrhythmus: Tagesabschnitte und Protein pro Hauptmahlzeit', () => {
  const food = [f('07:00', 60, 4), f('12:15', 700, 50), f('16:00', 210, 28), f('19:15', 800, 22), f('21:30', 300, 3)];
  const s = Object.fromEntries(mealSlots(food).map((x) => [x.id, x]));
  assert.equal(s.zmorge.kcal, 60);
  assert.equal(s.zmittag.protein, 50);
  assert.equal(s.zvieri.kcal, 210);
  assert.equal(s.znacht.kcal, 800);
  assert.equal(s.spaet.kcal, 300);
  const p = proteinPerMeal(food, 80);
  assert.equal(p.target, 32); // 0.4 g/kg Zielgewicht
  assert.deepEqual(
    p.slots.map((x) => [x.id, x.ok]),
    [
      ['zmittag', true],
      ['znacht', false],
      ['spaet', false],
    ],
  );
  assert.equal(proteinPerMeal([], 120).target, 40);
  for (const [id] of TRIGGERS) assert.ok(TRIGGER_TIPS[id]);
});

test('Heisshunger-Muster: kurzer Schlaf und wenig Protein am Tag erkennen, Auslöser zählen', () => {
  const date = '2026-10-18';
  /** @type {Record<string, import('../../app/js/store.js').Day>} */
  const days = {};
  for (let i = 1; i <= 14; i++) {
    const short = i % 2 === 0;
    days[addDays(date, -i)] = {
      complete: true,
      sleepH: short ? 6 : 7.5,
      food: short
        ? [f('12:00', 400, 15), f('19:30', 900, 30, { trigger: 'muede' }), f('21:00', 400, 5, { trigger: 'muede', hunger: 3 })]
        : [f('12:00', 800, 60), f('16:00', 200, 25), f('19:00', 700, 45, { trigger: 'hunger' })],
    };
  }
  const r = cravingPatterns(days, date, 150);
  assert.equal(r.enough, true);
  assert.equal(r.days, 14);
  assert.equal(r.highDays, 7);
  const ids = r.insights.map((i) => i.id);
  assert.ok(ids.includes('sleepShort'));
  assert.ok(ids.includes('lowProteinEarly'));
  assert.match(r.insights[0].text, /7 von 7 Tagen .* sonst an 0 von 7/);
  assert.equal(r.triggers[0].id, 'muede');
  assert.equal(r.triggers[0].n, 14);
  assert.equal(r.hungerStrong, 7);
  // Zu wenig Daten
  assert.equal(cravingPatterns({}, date, 150).enough, false);
});
