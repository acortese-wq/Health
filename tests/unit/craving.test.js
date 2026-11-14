import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cravingPlan, cravingStats, QUESTIONS } from '../../app/js/domain/craving.js';
import { emptyState, sanitize, SCHEMA_VERSION } from '../../app/js/store.js';

const ctx = { kcalLeft: 600, hour: 16 };

test('Vier Fragen', () => {
  assert.equal(QUESTIONS.length, 4);
  assert.deepEqual(
    QUESTIONS.map((q) => q.id),
    ['lastMeal', 'apple', 'trigger', 'intensity'],
  );
});

test('Echter Hunger: lange nichts gegessen und offen für «irgendwas» → essen, proteinreich, kein Timer', () => {
  const p = cravingPlan({ lastMeal: 'ueber4', apple: true, trigger: 'nichts', intensity: 6 }, ctx);
  assert.equal(p.kind, 'hunger');
  assert.equal(p.timerMin, 0);
  assert.ok(p.snacks.some((s) => s.includes('Skyr')));
  // Spätabends: Küche schliessen
  assert.ok(
    cravingPlan({ lastMeal: '2bis4', apple: true, trigger: 'nichts', intensity: 5 }, { kcalLeft: 600, hour: 22 }).steps.some((s) =>
      s.includes('Zähne'),
    ),
  );
});

test('Gerade gegessen: 10 Minuten abwarten, Strategie zum Auslöser', () => {
  const p = cravingPlan({ lastMeal: 'unter2', apple: true, trigger: 'muede', intensity: 4 }, ctx);
  assert.equal(p.kind, 'unklar');
  assert.equal(p.timerMin, 10);
  assert.ok(p.steps.some((s) => s.includes('Müdigkeit')));
  assert.ok(p.refs.some((r) => r.includes('Greer')));
});

test('Lust auf etwas Bestimmtes: Welle abwarten; stark → 15 Minuten und gehen', () => {
  const weak = cravingPlan({ lastMeal: '2bis4', apple: false, trigger: 'tv', intensity: 4 }, ctx);
  assert.equal(weak.kind, 'emotional');
  assert.equal(weak.timerMin, 10);
  assert.ok(weak.steps[0].includes('Teller'));
  const strong = cravingPlan({ lastMeal: '2bis4', apple: false, trigger: 'stress', intensity: 9 }, ctx);
  assert.equal(strong.timerMin, 15);
  assert.ok(strong.steps.some((s) => s.includes('zügig gehen')));
  assert.ok(strong.steps.some((s) => s.includes('kein Rückfall')));
  // Kaum Budget übrig: nur sehr leichte Snacks
  assert.ok(
    cravingPlan({ lastMeal: 'ueber4', apple: true, trigger: 'nichts', intensity: 5 }, { kcalLeft: 80, hour: 15 }).snacks.every(
      (s) => !s.includes('Skyr'),
    ),
  );
});

test('Bilanz und Speichern (Schema 6)', () => {
  assert.equal(SCHEMA_VERSION, 6);
  const raw = JSON.parse(
    JSON.stringify({
      ...emptyState(),
      days: {
        '2026-11-14': {
          cravings: [
            { id: 'a', time: '21:10', trigger: 'tv', intensity: 8, after: 3, outcome: 'geschafft' },
            { id: 'b', time: '16:00', trigger: 'stress', intensity: 6, outcome: 'bewusst' },
            { id: 'c', time: '16:00', trigger: 'erfunden', intensity: 6 },
            { id: 'd', time: '16:00', trigger: 'stress', intensity: 11 },
          ],
        },
      },
    }),
  );
  const s = sanitize(raw);
  assert.equal(s.days['2026-11-14'].cravings?.length, 2);
  assert.deepEqual(cravingStats(['2026-11-14', '2026-11-13'], s.days), { n: 2, done: 1, avgDrop: 5 });
});
