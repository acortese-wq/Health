// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SNAP_KEY,
  CORRUPT_KEY,
  saveWithBackup,
  snapshot,
  listSnapshots,
  restoreSnapshot,
  preserveCorrupt,
  saveDraft,
  takeDraft,
} from '../../app/js/safety.js';
import { STORAGE_KEY, load } from '../../app/js/store.js';

/** Speicher-Attrappe mit optionaler Grösse (Zeichen) für «Speicher voll». */
function mem(limit = Infinity) {
  /** @type {Map<string, string>} */
  const m = new Map();
  const size = () => [...m.values()].reduce((a, v) => a + v.length, 0);
  return {
    m,
    getItem: (/** @type {string} */ k) => m.get(k) ?? null,
    setItem: (/** @type {string} */ k, /** @type {string} */ v) => {
      const before = m.get(k);
      m.set(k, v);
      if (size() > limit) {
        if (before === undefined) m.delete(k);
        else m.set(k, before);
        throw new Error('QuotaExceededError');
      }
    },
    removeItem: (/** @type {string} */ k) => void m.delete(k),
  };
}

const json = (/** @type {number} */ n) =>
  JSON.stringify({
    schema: 1,
    profile: null,
    days: { '2026-10-01': { food: Array.from({ length: n }, () => ({ name: 'x', kcal: 1, protein: 0 })) } },
  });

test('Speichern legt den Tagesstand als Sicherung an', () => {
  const s = mem();
  assert.equal(saveWithBackup(json(2), s, '2026-10-18'), true);
  assert.equal(s.getItem(STORAGE_KEY), json(2));
  const list = listSnapshots(s);
  assert.equal(list.length, 1);
  assert.equal(list[0].day, '2026-10-18');
  assert.equal(list[0].entries, 2);
});

test('Tagessicherung ersetzt denselben Tag, andere Gründe kommen dazu, höchstens 7', () => {
  const s = mem();
  snapshot(s, json(1), '2026-10-18', 'täglich');
  snapshot(s, json(3), '2026-10-18', 'täglich');
  snapshot(s, json(1), '2026-10-18', 'vor Import');
  let list = listSnapshots(s);
  assert.equal(list.length, 2);
  assert.ok(list.some((x) => x.reason === 'täglich' && x.entries === 3));
  for (let d = 1; d <= 10; d++) snapshot(s, json(d), `2026-10-${String(d).padStart(2, '0')}`, 'täglich');
  list = listSnapshots(s);
  assert.equal(list.length, 7);
});

test('Speicher voll: Sicherungen werden geopfert, nie die Hauptdaten', () => {
  const s = mem(600);
  snapshot(s, json(3), '2026-10-17', 'täglich');
  assert.ok(s.getItem(SNAP_KEY));
  assert.equal(saveWithBackup(json(5), s, '2026-10-18'), true);
  assert.equal(s.getItem(STORAGE_KEY), json(5));
});

test('Speichern meldet Fehlschlag, wenn gar nichts passt', () => {
  const s = mem(10);
  assert.equal(saveWithBackup(json(5), s, '2026-10-18'), false);
  assert.equal(saveWithBackup(json(1), undefined, '2026-10-18'), false);
});

test('Sicherung wiederherstellen liefert geprüften Zustand', () => {
  const s = mem();
  snapshot(s, json(2), '2026-10-18', 'täglich');
  const [first] = listSnapshots(s);
  const st = restoreSnapshot(s, first.id);
  assert.ok(st);
  assert.equal(st.days['2026-10-01'].food.length, 2);
  assert.equal(restoreSnapshot(s, 'gibt-es-nicht'), null);
});

test('Unlesbare Daten werden beiseitegelegt', () => {
  const s = mem();
  s.setItem(STORAGE_KEY, '{kaputt');
  const r = load(s);
  assert.ok(r.error);
  assert.equal(r.raw, '{kaputt');
  assert.equal(preserveCorrupt(s, r.raw ?? ''), true);
  assert.equal(s.getItem(CORRUPT_KEY), '{kaputt');
});

test('Entwurf gilt nur für gleiche Seite und gleiches Datum, einmalig', () => {
  const s = mem();
  saveDraft(s, { route: 'heute', date: '2026-10-18', values: { 'food-name': 'Apfel', 'bad key!': 'x' } });
  assert.deepEqual(takeDraft(s, 'ernaehrung', '2026-10-18'), {});
  saveDraft(s, { route: 'heute', date: '2026-10-18', values: { 'food-name': 'Apfel', 'bad key!': 'x' } });
  assert.deepEqual(takeDraft(s, 'heute', '2026-10-18'), { 'food-name': 'Apfel' });
  assert.deepEqual(takeDraft(s, 'heute', '2026-10-18'), {});
  saveDraft(s, { route: 'heute', date: '2026-10-18', values: {} });
  assert.equal(s.getItem(`${STORAGE_KEY}.entwurf`), null);
});
