import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISES, suggestExercise } from '../../app/js/data/mindfulness.js';

test('Übungen: eindeutig, Anleitung in Schritten, Dauer passt zur Angabe, Quelle', () => {
  assert.ok(EXERCISES.length >= 10);
  assert.equal(new Set(EXERCISES.map((e) => e.id)).size, EXERCISES.length);
  for (const e of EXERCISES) {
    assert.ok(e.steps.length >= 4, e.id);
    assert.ok(e.ref.length > 10, e.id);
    const total = e.steps.reduce((a, s) => a + s.sec, 0);
    // Angegebene Minuten ±1 Minute
    assert.ok(Math.abs(total / 60 - e.minutes) <= 1, `${e.id}: ${total} s für ${e.minutes} Min.`);
    for (const s of e.steps) assert.ok(s.text.length > 15 && s.sec >= 5, e.id);
  }
});

test('Passende Übung: stark → Welle reiten, Stress → RAIN, echter Hunger → Hunger-Check', () => {
  assert.equal(suggestExercise('tv', 8, 'emotional').id, 'welle');
  assert.equal(suggestExercise('stress', 5, 'emotional').id, 'rain');
  assert.equal(suggestExercise('nichts', 5, 'hunger').id, 'hungerskala');
  assert.equal(suggestExercise('muede', 4, 'emotional').id, 'koerper');
});
