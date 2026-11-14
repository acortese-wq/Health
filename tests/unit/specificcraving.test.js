import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXPLAIN, STRATEGIES, NEXT_TIME, DRINK_FACTS } from '../../app/js/data/specificcraving.js';

test('Lust auf Bestimmtes: Erklärungen und Strategien mit Quelle, Beweislage und Anleitung', () => {
  assert.ok(EXPLAIN.length >= 4);
  for (const e of EXPLAIN) assert.match(e.ref, /\d{4}/);
  assert.ok(STRATEGIES.length >= 6);
  assert.equal(new Set(STRATEGIES.map((s) => s.id)).size, STRATEGIES.length);
  for (const s of STRATEGIES) {
    assert.ok(s.steps.length >= 3, s.id);
    assert.match(s.ref, /\d{4}/, s.id);
    assert.ok(['stark', 'mittel', 'vorläufig'].includes(s.strength), s.id);
  }
  // Unsichere Befunde sind als vorläufig markiert
  assert.equal(STRATEGIES.find((s) => s.id === 'durchspielen')?.strength, 'vorläufig');
  assert.ok(NEXT_TIME.length >= 3);
});

test('Tee, Wasser, Eiswürfel: Beweislage ehrlich abgestuft', () => {
  assert.ok(DRINK_FACTS.some((f) => f.level === 'belegt'));
  assert.equal(DRINK_FACTS.find((f) => f.text.startsWith('Eiswürfel'))?.level, 'kaum belegt');
  assert.equal(STRATEGIES.find((s) => s.id === 'mund')?.strength, 'vorläufig');
});
