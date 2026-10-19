// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEntry,
  repeatEntry,
  scaleEntry,
  possibleDuplicates,
  dayStatus,
  foodQuality,
  DOUBLE_TAP_MS,
} from '../../app/js/domain/entries.js';
import { addFood, emptyState, exportJSON, importJSON, sanitize, SCHEMA_VERSION } from '../../app/js/store.js';
import { series, seriesStats } from '../../app/js/domain/history.js';
import { toISODate } from '../../app/js/domain/util.js';

const APPLE = {
  name: 'Apfel (150 g)',
  kcal: 78,
  protein: 0.5,
  carbs: 17,
  fat: 0.2,
  fiber: 3.6,
  grams: 150,
  time: '08:00',
  source: /** @type {const} */ ('datenbank'),
  micros: { vitC: 18 },
  microSrc: /** @type {const} */ ('db'),
};
const at = (/** @type {number} */ s) => new Date(Date.UTC(2026, 9, 19, 8, 0, s));

test('1/8: Apfel dreimal bewusst erfasst → drei Einträge, Summe stimmt', () => {
  const st = emptyState();
  const a = addFood(st, '2026-10-19', APPLE, at(0));
  assert.ok(a);
  const b = addFood(st, '2026-10-19', repeatEntry(a, '10:00'), at(5));
  const c = addFood(st, '2026-10-19', repeatEntry(a, '15:00'), at(9));
  const food = st.days['2026-10-19'].food ?? [];
  assert.equal(food.length, 3);
  assert.ok(b && c);
  assert.equal(
    food.reduce((x, f) => x + f.kcal, 0),
    3 * 78,
  );
  assert.equal(Math.round(food.reduce((x, f) => x + f.protein, 0) * 10) / 10, 1.5);
  assert.equal(Math.round(food.reduce((x, f) => x + (f.micros?.vitC ?? 0), 0)), 54);
  assert.equal(possibleDuplicates(food).size, 0);
});

test('2: Erneut erfassen vergibt neue, eindeutige ID und behält Portion und Quelle', () => {
  const st = emptyState();
  const a = /** @type {import('../../app/js/store.js').FoodEntry} */ (
    addFood(st, '2026-10-19', { ...APPLE, hunger: 3, trigger: 'stress' }, at(0))
  );
  const copy = repeatEntry(a, '09:00');
  assert.equal(/** @type {any} */ (copy).id, undefined);
  assert.equal(copy.repeatOf, a.id);
  assert.equal(copy.grams, 150);
  assert.equal(copy.source, 'datenbank');
  assert.equal(copy.microSrc, 'db');
  assert.equal(copy.hunger, undefined, 'Hunger gehört zum Essmoment');
  const b = addFood(st, '2026-10-19', copy, at(3));
  assert.ok(b);
  assert.notEqual(b.id, a.id);
  const ids = (st.days['2026-10-19'].food ?? []).map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('3: Zwei legitime identische Lebensmittel werden nicht zusammengeführt', () => {
  const st = emptyState();
  addFood(st, '2026-10-19', { ...APPLE, time: '08:00' }, at(0));
  addFood(st, '2026-10-19', { ...APPLE, time: '16:00' }, new Date(at(0).getTime() + 8 * 3600e3));
  const food = st.days['2026-10-19'].food ?? [];
  assert.equal(food.length, 2);
  assert.equal(possibleDuplicates(food).size, 0, 'verschiedene Zeiten: kein Verdacht');
});

test('3b/14: Gleicher Eintrag kurz hintereinander wird markiert, nicht gelöscht; «Beide behalten» hebt es auf', () => {
  const st = emptyState();
  addFood(st, '2026-10-19', APPLE, at(0));
  const second = addFood(st, '2026-10-19', APPLE, at(20));
  const food = st.days['2026-10-19'].food ?? [];
  assert.equal(food.length, 2);
  assert.ok(second);
  assert.equal(possibleDuplicates(food).get(second.id), food[0].id);
  second.keep = true;
  assert.equal(possibleDuplicates(food).size, 0);
});

test('14: Doppeltipp innerhalb von 0.6 s erzeugt keinen zweiten Eintrag', () => {
  const st = emptyState();
  assert.ok(addFood(st, '2026-10-19', APPLE, new Date(1_000_000)));
  assert.equal(addFood(st, '2026-10-19', APPLE, new Date(1_000_000 + DOUBLE_TAP_MS - 100)), null);
  assert.equal(st.days['2026-10-19'].food?.length, 1);
  assert.ok(addFood(st, '2026-10-19', APPLE, new Date(1_000_000 + DOUBLE_TAP_MS + 400)));
  assert.equal(createEntry([], APPLE, { id: 'x', now: new Date(0) })?.id, 'x');
  // «Nochmal» direkt nach dem Erfassen ist gewollt, ein zweiter Tipp auf «Nochmal» nicht
  const st2 = emptyState();
  const first = /** @type {import('../../app/js/store.js').FoodEntry} */ (addFood(st2, 'd', APPLE, new Date(5000)));
  assert.ok(addFood(st2, 'd', repeatEntry(first, '08:00'), new Date(5200)));
  assert.equal(addFood(st2, 'd', repeatEntry(first, '08:00'), new Date(5300)), null);
});

test('4: Doppelt importierte ID wird erkannt und zur Prüfung markiert, nichts geht verloren', () => {
  const e = { id: 'abc', name: 'Brot', kcal: 250, protein: 8, time: '07:30' };
  const st = sanitize({ schema: 1, days: { '2026-10-18': { food: [e, { ...e }] }, '2026-10-19': { food: [{ ...e }] } } });
  const d18 = st.days['2026-10-18'].food ?? [];
  const d19 = st.days['2026-10-19'].food ?? [];
  assert.equal(d18.length, 2);
  assert.equal(d19.length, 1);
  const ids = [...d18, ...d19].map((f) => f.id);
  assert.equal(new Set(ids).size, 3, 'alle IDs eindeutig');
  assert.equal(d18[1].dupOf, 'abc');
  assert.equal(possibleDuplicates(d18).get(d18[1].id), 'abc');
  assert.equal(d19[0].dupOf, 'abc', 'auch über Tage hinweg erkannt');
});

test('5: Menge ändern skaliert alle Nährwerte und den Namen', () => {
  const x = scaleEntry({ ...APPLE, id: 'a' }, 2);
  assert.equal(x.kcal, 156);
  assert.equal(x.grams, 300);
  assert.equal(x.name, 'Apfel (300 g)');
  assert.equal(x.carbs, 34);
  assert.equal(x.micros?.vitC, 36);
  assert.equal(scaleEntry({ name: 'Skyr, 150 g', kcal: 95, protein: 16, grams: 150 }, 0.5).name, 'Skyr, 75 g');
});

test('7: Eintrag ohne vollständige Nährwerte gilt nicht als vollständig', () => {
  const food = [
    { id: '1', name: 'Apfel', kcal: 78, protein: 0.5, carbs: 17, fat: 0.2, time: '08:00' },
    { id: '2', name: 'Kantine', kcal: 700, protein: 0, proteinKnown: /** @type {const} */ (false), time: '12:00' },
  ];
  const st = dayStatus({ food, complete: true, isToday: false, kcalTarget: 1900 });
  assert.equal(st.nutrientsComplete, false);
  assert.ok(st.items.some((i) => i.id === 'macros' && i.detail.includes('1 von 2') && i.detail.includes('1 ohne Protein')));
  assert.ok(
    st.items.some((i) => i.id === 'implausible'),
    '778 kcal abgeschlossen bei Ziel 1900',
  );
  assert.equal(foodQuality(food).macroShare < 0.2, true);
  const ok = dayStatus({ food: [food[0]], complete: false, isToday: true, kcalTarget: 1900 });
  assert.equal(ok.nutrientsComplete, true);
  assert.equal(ok.items[0].label, 'Vorläufig');
  assert.ok(dayStatus({ food: [], complete: false, isToday: false, kcalTarget: 1900 }).items.some((i) => i.id === 'required'));
});

test('9: Datum nach Ortszeit, kurz vor und nach Mitternacht', () => {
  assert.equal(toISODate(new Date(2026, 9, 19, 23, 59, 30)), '2026-10-19');
  assert.equal(toISODate(new Date(2026, 9, 20, 0, 0, 30)), '2026-10-20');
  // Zeitumstellung (Ende Sommerzeit Schweiz 25.10.2026): Tage bleiben lückenlos
  assert.equal(toISODate(new Date(2026, 9, 25, 2, 30)), '2026-10-25');
});

test('10: Fehlerhafter Import wirft und liefert keinen Zustand', () => {
  assert.throws(() => importJSON('{kaputt'), /kein gültiges JSON/);
  assert.throws(() => importJSON(JSON.stringify({ schema: 99, days: {} })), /neueren/);
  assert.throws(() => importJSON('[]'), /keine gültigen/);
});

test('11: Export und Import erhalten Einträge, IDs, Zeitstempel und Nährwerte; Schema 1 bleibt lesbar', () => {
  const st = emptyState();
  const a = /** @type {import('../../app/js/store.js').FoodEntry} */ (addFood(st, '2026-10-19', APPLE, at(0)));
  addFood(st, '2026-10-19', repeatEntry(a, '10:00'), at(9));
  addFood(st, '2026-10-19', { name: 'Kantine', kcal: 700, protein: 0, proteinKnown: false, time: '12:00' }, at(30));
  const back = importJSON(exportJSON(st));
  assert.equal(back.schema, SCHEMA_VERSION);
  assert.deepEqual(back.days['2026-10-19'].food, st.days['2026-10-19'].food);
  const v1 = sanitize({ schema: 1, days: { '2026-01-02': { food: [{ id: 'old', name: 'Brot', kcal: 250, protein: 8, time: '07:00' }] } } });
  assert.equal(v1.days['2026-01-02'].food?.[0].id, 'old');
  assert.equal(v1.schema, 2);
});

test('Verlauf: Lücken bleiben null, Mittel nur über abgeschlossene Ernährungstage', () => {
  const st = emptyState();
  st.days['2026-10-17'] = { food: [{ id: 'a', name: 'x', kcal: 2000, protein: 100, time: '12:00' }], complete: true, steps: 8000 };
  st.days['2026-10-19'] = { food: [{ id: 'b', name: 'y', kcal: 900, protein: 50, time: '12:00' }] };
  const pts = series(st, 'kcal', '2026-10-17', '2026-10-19');
  assert.deepEqual(
    pts.map((p) => p.value),
    [2000, null, 900],
  );
  assert.equal(pts[2].partial, true);
  const s = seriesStats(pts, 'kcal');
  assert.equal(s.mean, 2000);
  assert.equal(s.recorded, 2);
  assert.deepEqual(
    series(st, 'steps', '2026-10-17', '2026-10-18').map((p) => p.value),
    [8000, null],
  );
});
