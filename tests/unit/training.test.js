import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exerciseHistory, findExercise, suggestNext, weekSummary } from '../../app/js/domain/training.js';

const ex = /** @type {NonNullable<ReturnType<typeof findExercise>>} */ (findExercise('brustpresse'));
const set = (kg, reps) => ({ ex: ex.id, kg, reps });

test('Doppelte Progression: Start', () => {
  assert.equal(suggestNext(ex, []).action, 'start');
});

test('Doppelte Progression: alle Sätze oben → mehr Gewicht', () => {
  const r = suggestNext(ex, [[set(40, 12), set(40, 12), set(40, 12)]]);
  assert.equal(r.action, 'increase');
  assert.equal(r.kg, 42.5);
  assert.equal(r.reps, 8);
});

test('Doppelte Progression: dazwischen → eine Wiederholung mehr', () => {
  const r = suggestNext(ex, [[set(40, 12), set(40, 11), set(40, 9)]]);
  assert.equal(r.action, 'repeat');
  assert.equal(r.kg, 40);
  assert.equal(r.reps, 12);
});

test('Doppelte Progression: zweimal unter Bereich → Deload 10 %', () => {
  const r = suggestNext(ex, [
    [set(50, 7), set(50, 6), set(50, 6)],
    [set(50, 8), set(50, 7), set(50, 6)],
  ]);
  assert.equal(r.action, 'deload');
  assert.equal(r.kg, 45);
});

test('Doppelte Progression: einmal unter Bereich → wiederholen', () => {
  const r = suggestNext(ex, [[set(50, 7), set(50, 6), set(50, 6)]]);
  assert.equal(r.action, 'repeat');
});

test('Zeitübungen steigern die Haltezeit', () => {
  const plank = findExercise('plank');
  assert.ok(plank);
  const r = suggestNext(plank, [[{ ex: 'plank', kg: 0, reps: 40 }]]);
  assert.equal(r.reps, 45);
});

test('Historie: neueste Einheit zuerst, nur passende Übung', () => {
  const ws = [
    { id: '1', date: '2026-10-01', kind: 'strength', template: 'A', sets: [set(40, 10)] },
    { id: '2', date: '2026-10-05', kind: 'strength', template: 'A', sets: [set(42.5, 8)] },
    { id: '3', date: '2026-10-03', kind: 'run', runType: 'z2', minutes: 40 },
  ];
  const h = exerciseHistory(/** @type {any} */ (ws), ex.id);
  assert.equal(h.length, 2);
  assert.equal(h[0][0].kg, 42.5);
});

test('Wochenbilanz nach WHO: intensive Minuten zählen doppelt', () => {
  const ws = [
    { id: '1', date: '2026-10-12', kind: 'strength', template: 'A', sets: [] },
    { id: '2', date: '2026-10-13', kind: 'run', runType: 'z2', minutes: 45 },
    { id: '3', date: '2026-10-15', kind: 'strength', template: 'B', sets: [] },
    { id: '4', date: '2026-10-17', kind: 'run', runType: 'interval', minutes: 35 },
    { id: '5', date: '2026-10-18', kind: 'run', runType: 'long', minutes: 70 },
    { id: '6', date: '2026-10-19', kind: 'run', runType: 'long', minutes: 70 },
  ];
  const w = weekSummary(/** @type {any} */ (ws), '2026-10-15');
  assert.equal(w.from, '2026-10-12');
  assert.equal(w.to, '2026-10-18');
  assert.equal(w.strengthDays, 2);
  assert.equal(w.moderate, 115);
  assert.equal(w.vigorous, 35);
  assert.equal(w.equivalent, 185);
  assert.ok(w.aerobicMet && w.strengthMet && w.intervalDone);
});

test('Modus «nur Laufen»: Wochenplan ohne Kraft, Läufe gezählt', async () => {
  const { plannedSession, weekPlan, rangeSummary } = await import('../../app/js/domain/training.js');
  assert.equal(plannedSession('2026-10-19', 'laufen').kind, 'rest'); // Montag
  assert.equal(plannedSession('2026-10-22', 'laufen').runType, 'interval'); // Donnerstag
  assert.equal(plannedSession('2026-10-19').kind, 'strength'); // Standard: Kombi
  assert.deepEqual(
    weekPlan('laufen').map(([d]) => d),
    ['Di', 'Do', 'So'],
  );
  assert.ok(weekPlan('laufen').every(([, p]) => p.kind === 'run'));
  const ws = [
    { id: '1', date: '2026-10-20', kind: 'run', runType: 'z2', minutes: 45 },
    { id: '2', date: '2026-10-22', kind: 'run', runType: 'interval', minutes: 35 },
  ];
  assert.equal(rangeSummary(/** @type {any} */ (ws), '2026-10-19', '2026-10-25').runs, 2);
});
