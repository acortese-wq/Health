import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, exportCSV, exportJSON, importJSON, load, sanitize, save, weightSeries, STORAGE_KEY } from '../../app/js/store.js';

class MemoryStorage {
  constructor() {
    /** @type {Map<string, string>} */
    this.m = new Map();
  }
  getItem(k) {
    return this.m.has(k) ? this.m.get(k) : null;
  }
  setItem(k, v) {
    this.m.set(k, String(v));
  }
  removeItem(k) {
    this.m.delete(k);
  }
}

test('Export → Import ergibt denselben Zustand', () => {
  const s = emptyState();
  s.days['2026-10-17'] = { weightKg: 95, food: [{ id: 'a', name: 'Skyr', kcal: 210, protein: 28, time: '16:00' }], complete: true };
  s.bp.push({ id: 'b', date: '2026-10-17', time: '07:00', sys: 128, dia: 82, setting: 'home' });
  s.workouts.push({ id: 'w', date: '2026-10-17', kind: 'run', runType: 'z2', minutes: 45 });
  const back = importJSON(exportJSON(s));
  assert.deepEqual(back, s);
});

test('Import verwirft ungültige Einträge und fremde Felder', () => {
  const back = sanitize({
    schema: 1,
    evil: '<script>',
    days: { '2026-02-30': { weightKg: 90 }, '2026-10-17': { weightKg: 'x', steps: 8000, food: [{ name: 1 }] } },
    bp: [{ date: '2026-10-17', sys: 120 }],
    workouts: [{ date: '2026-10-17', kind: 'run', runType: 'sprint', minutes: 10 }],
  });
  assert.deepEqual(Object.keys(back.days), ['2026-10-17']);
  assert.deepEqual(back.days['2026-10-17'], { steps: 8000, food: [] });
  assert.equal(back.bp.length, 0);
  assert.equal(back.workouts.length, 0);
  assert.equal(/** @type {any} */ (back).evil, undefined);
});

test('Import lehnt neuere Schema-Versionen und Nicht-JSON ab', () => {
  assert.throws(() => importJSON('{"schema": 99}'), /neueren/);
  assert.throws(() => importJSON('kein json'), /kein gültiges JSON/);
  assert.throws(() => importJSON('[]'), /keine gültigen/);
});

test('load/save über Storage, defekte Daten werden gemeldet', () => {
  const st = new MemoryStorage();
  const s = emptyState();
  s.days['2026-10-17'] = { weightKg: 95 };
  assert.equal(save(s, /** @type {any} */ (st)), true);
  assert.deepEqual(load(/** @type {any} */ (st)).state, s);
  st.setItem(STORAGE_KEY, '{kaputt');
  const r = load(/** @type {any} */ (st));
  assert.ok(r.error);
  assert.deepEqual(r.state, emptyState());
});

test('Gewichtsreihe sortiert, CSV mit Summen', () => {
  const s = emptyState();
  s.days['2026-10-18'] = { weightKg: 94.6 };
  s.days['2026-10-17'] = { weightKg: 95, food: [{ id: '1', name: 'A', kcal: 500, protein: 30, time: '12:00' }], complete: true };
  assert.deepEqual(
    weightSeries(s).map((w) => w.date),
    ['2026-10-17', '2026-10-18'],
  );
  const csv = exportCSV(s).split('\n');
  assert.equal(csv.length, 3);
  assert.equal(csv[1], '2026-10-17;95;500;30;;;;;ja');
});
