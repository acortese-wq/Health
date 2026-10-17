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
  assert.equal(csv[1], '2026-10-17;95;500;30;;;;;;ja');
});

test('Zusatz-Nährwerte und Herkunft werden gespeichert, ungültige verworfen', async () => {
  const { sanitize } = await import('../../app/js/store.js');
  const s = sanitize({
    schema: 1,
    days: {
      '2026-10-17': {
        food: [
          {
            id: 'a',
            name: 'Skyr',
            kcal: 158,
            protein: 28,
            time: '16:00',
            fiber: 0,
            salt: 0.3,
            grams: 250,
            source: 'barcode',
            sugar: -1,
            fat: 'x',
          },
        ],
      },
    },
  });
  assert.deepEqual(s.days['2026-10-17'].food?.[0], {
    id: 'a',
    name: 'Skyr',
    kcal: 158,
    protein: 28,
    time: '16:00',
    fiber: 0,
    salt: 0.3,
    grams: 250,
    source: 'barcode',
  });
});

test('Zuletzt gegessen: neueste zuerst, ohne Doppel und ohne Schnellknöpfe', async () => {
  const { recentFoods } = await import('../../app/js/store.js');
  const s = emptyState();
  const f = (name, time = '12:00') => ({ id: name + time, name, kcal: 100, protein: 5, time });
  s.days['2026-10-15'] = { food: [f('Rösti'), f('Apfel')] };
  s.days['2026-10-16'] = { food: [f('Rösti', '19:00'), f('Skyr 250 g mit Beeren')] };
  s.days['2026-10-17'] = { food: [f('Heute')] };
  assert.deepEqual(
    recentFoods(s, '2026-10-17').map((x) => x.name),
    ['Rösti', 'Apfel'],
  );
  assert.equal(recentFoods(s, '2026-10-17')[0].time, '19:00');
});

test('Trinkmenge: gültige Werte übernehmen, unplausible verwerfen, im CSV', () => {
  const s = sanitize({
    schema: 1,
    days: { '2026-10-17': { waterMl: 1750 }, '2026-10-18': { waterMl: 99999 }, '2026-10-19': { waterMl: -5 } },
  });
  assert.equal(s.days['2026-10-17'].waterMl, 1750);
  assert.equal(s.days['2026-10-18'].waterMl, undefined);
  assert.equal(s.days['2026-10-19'].waterMl, undefined);
  assert.match(exportCSV(s).split('\n')[0], /Wasser ml/);
  assert.match(exportCSV(s).split('\n')[1], /;1750;/);
});
