import { test } from 'node:test';
import assert from 'node:assert/strict';
import { garminSummary, recovery, pace, latest } from '../../app/js/domain/garmin.js';
import { emptyState, sanitize } from '../../app/js/store.js';
import { addDays } from '../../app/js/domain/util.js';

const TODAY = '2026-10-26';

/** @param {(i: number) => Record<string, number>} f Tag i (0 = heute) */
function stateWith(f, n = 40) {
  const st = emptyState();
  for (let i = 0; i < n; i++) st.days[addDays(TODAY, -i)] = /** @type {any} */ (f(i));
  return st;
}

test('Pace und letzter Wert', () => {
  assert.equal(pace(30, 5), '6:00');
  assert.equal(pace(52.5, 10), '5:15');
  assert.equal(pace(30, 0), '');
  const st = stateWith((i) => (i === 1 ? { steps: 8000 } : {}), 3);
  assert.deepEqual(latest(st, 'steps', TODAY, 1), { value: 8000, date: addDays(TODAY, -1) });
  assert.equal(latest(st, 'restingHr', TODAY, 1), null);
});

test('Erholung: Ruhepuls über Basis und wenig Schlaf', () => {
  assert.equal(recovery(null, null, 7.5).level, 'offen');
  assert.equal(recovery(6.2, 7.4, 7.5).level, 'achtung');
  assert.equal(recovery(1, 6.0, 7.5).level, 'mittel');
  assert.equal(recovery(-1, 7.6, 7.5).level, 'gut');
});

test('Zusammenfassung: Ruhepuls 7 Tage gegen Basis, Intensitätsminuten, Laufkilometer, VO₂max', () => {
  const st = stateWith((i) => ({ restingHr: i < 7 ? 58 : 50, sleepH: 7, steps: 9000 }));
  st.profile = /** @type {any} */ ({ stepsTarget: 9000, sleepTargetH: 7.5 });
  st.workouts = [
    { id: 'garmin-a', date: TODAY, kind: 'run', runType: 'interval', minutes: 30, km: 6 },
    { id: 'b', date: addDays(TODAY, -2), kind: 'run', runType: 'z2', minutes: 45, km: 7.5 },
  ];
  st.vo2max = [
    { id: 'v1', date: addDays(TODAY, -100), value: 40 },
    { id: 'v2', date: addDays(TODAY, -3), value: 43 },
  ];
  const g = garminSummary(sanitize(JSON.parse(JSON.stringify(st))), TODAY);
  assert.equal(g.rhrBase, 50);
  assert.equal(g.rhrDelta, 8);
  assert.equal(g.recovery.level, 'achtung');
  assert.equal(g.week.equivalent, 105);
  assert.equal(g.km7, 13.5);
  assert.equal(g.runs7, 2);
  assert.equal(g.vo2?.value, 43);
  assert.equal(g.vo2Change, 3);
  assert.equal(g.lastActivityImport, TODAY);
  assert.equal(g.lastDaily, TODAY);
});
