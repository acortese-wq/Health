import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaleStats, scaleFeedback, PRINCIPLES } from '../../app/js/domain/intuitive.js';
import { CRAVING_CAUSES } from '../../app/js/data/cravingcauses.js';
import { emptyState, sanitize, SCHEMA_VERSION } from '../../app/js/store.js';
import { repeatEntry } from '../../app/js/domain/entries.js';

test('Intuitives Essen: 10 Grundsätze, Bilanz der Skalen', () => {
  assert.equal(PRINCIPLES.length, 10);
  /** @param {number} hb @param {number} fa */
  const f = (hb, fa) => /** @type {any} */ ({ id: 'x', name: 'E', kcal: 300, protein: 10, time: '12:00', hungerBefore: hb, fullAfter: fa });
  const days = { '2026-11-14': { food: [f(2, 6), f(2, 9), f(9, 9), f(6, 6), f(7, 7), f(1, 10)] } };
  const s = scaleStats(days, '2026-11-14');
  assert.equal(s.hungerN, 6);
  assert.equal(s.noHungerPct, 50);
  assert.equal(s.overfullPct, 50);
  const fb = scaleFeedback(s);
  assert.ok(fb.some((t) => t.includes('wenig oder keinem Hunger')));
  assert.ok(fb.some((t) => t.includes('übervoll')));
  assert.match(scaleFeedback(scaleStats({}, '2026-11-14'))[0], /zu wenige/);
});

test('Gelüste: nur Eis und Salz mit belegtem Zusammenhang, alle mit passenden Nährstoffen', () => {
  const ids = CRAVING_CAUSES.map((c) => c.id);
  assert.deepEqual(ids, ['eis', 'salzig', 'schokolade', 'suess', 'fleisch', 'kaese', 'brot']);
  assert.deepEqual(
    CRAVING_CAUSES.filter((c) => c.evidence).map((c) => c.id),
    ['eis', 'salzig'],
  );
  assert.ok(CRAVING_CAUSES.find((c) => c.id === 'eis')?.nutrients.includes('iron'));
  for (const c of CRAVING_CAUSES) assert.ok(c.nutrients.length >= 1);
});

test('Schema 7: Hunger vorher und Sättigung danach 1–10, nicht in Wiederholungen', () => {
  assert.ok(SCHEMA_VERSION >= 7);
  const raw = JSON.parse(
    JSON.stringify({
      ...emptyState(),
      days: {
        '2026-11-14': {
          food: [
            { id: 'a', name: 'X', kcal: 300, protein: 10, time: '12:00', hungerBefore: 7, fullAfter: 6 },
            { id: 'b', name: 'Y', kcal: 300, protein: 10, time: '13:00', hungerBefore: 11, fullAfter: 0.5 },
          ],
        },
      },
    }),
  );
  const s = sanitize(raw);
  const [a, b] = s.days['2026-11-14'].food ?? [];
  assert.equal(a.hungerBefore, 7);
  assert.equal(a.fullAfter, 6);
  assert.equal(b.hungerBefore, undefined);
  assert.equal(b.fullAfter, undefined);
  const r = repeatEntry(a, '18:00');
  assert.equal(/** @type {any} */ (r).hungerBefore, undefined);
});
