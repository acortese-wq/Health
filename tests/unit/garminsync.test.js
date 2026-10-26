import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeGarmin, mapActivity } from '../../app/js/domain/garminsync.js';
import { emptyState } from '../../app/js/store.js';

test('Übernahme: Geräte-Werte ersetzen, Gewicht bleibt, Aktivitäten ohne Doppel, VO₂max nur bei Änderung', () => {
  const st = emptyState();
  st.days['2026-10-25'] = { steps: 5000, weightKg: 94.2 };
  st.vo2max = [{ id: 'v', date: '2026-10-01', value: 43 }];
  st.workouts = [{ id: 'hand', date: '2026-10-24', kind: 'run', runType: 'z2', minutes: 45 }];
  const days = {
    '2026-10-25': {
      steps: 9512,
      restingHr: 48,
      sleepH: 7.25,
      hrvMs: 52,
      bodyBatteryHigh: 85,
      vo2max: 44,
      activities: [
        { id: 'garmin-1', date: '2026-10-25', time: '18:30', type: 'running', minutes: 35, title: 'Intervalle 4x4', km: 5.8, avgHr: 154 },
      ],
    },
    '2026-10-24': {
      vo2max: 43,
      activities: [
        { id: 'garmin-2', date: '2026-10-24', time: '07:00', type: 'running', minutes: 46, title: '', km: 7 },
        { id: 'garmin-3', date: '2026-10-24', time: '12:00', type: 'cycling', minutes: 60, title: 'Velo' },
      ],
    },
    '2099-01-01': { steps: 1 },
  };
  const r = mergeGarmin(st, /** @type {any} */ (days), '2026-10-26');
  assert.deepEqual(st.days['2026-10-25'], { steps: 9512, weightKg: 94.2, restingHr: 48, sleepH: 7.25 });
  assert.equal(st.days['2099-01-01'], undefined);
  assert.equal(r.workouts, 1, 'Lauf vom 24. ist schon von Hand erfasst, Velo wird nicht übernommen');
  assert.deepEqual(st.workouts[1], {
    id: 'garmin-1',
    date: '2026-10-25',
    kind: 'run',
    runType: 'interval',
    minutes: 35,
    km: 5.8,
    avgHr: 154,
    note: 'Intervalle 4x4',
  });
  assert.equal(r.vo2, 1);
  assert.deepEqual(r.extras, { '2026-10-25': { hrvMs: 52, bodyBatteryHigh: 85 } });
  // Zweiter Abgleich: nichts Neues
  const again = mergeGarmin(st, /** @type {any} */ (days), '2026-10-26');
  assert.equal(again.days + again.workouts + again.vo2, 0);
});

test('Aktivitätsarten', () => {
  assert.deepEqual(mapActivity({ type: 'trail_running', title: '', minutes: 70 }), { kind: 'run', runType: 'long' });
  assert.deepEqual(mapActivity({ type: 'strength_training', title: '', minutes: 40 }), { kind: 'strength' });
  assert.equal(mapActivity({ type: 'cycling', title: '', minutes: 40 }), null);
});
