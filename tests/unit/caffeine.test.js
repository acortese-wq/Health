import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allowedCups,
  bedtimeMinutes,
  cutoffTime,
  dayAssessment,
  isAfterCutoff,
  residualMg,
  taperPlan,
} from '../../app/js/domain/caffeine.js';

test('Restkoffein halbiert sich pro Halbwertszeit', () => {
  const d = [{ time: '08:00', mg: 100 }];
  assert.ok(Math.abs(residualMg(d, 13 * 60, 5) - 50) < 1e-9);
  assert.ok(Math.abs(residualMg(d, 18 * 60, 5) - 25) < 1e-9);
  assert.equal(residualMg(d, 7 * 60, 5), 0);
});

test('Schlafenszeit nach Mitternacht', () => {
  assert.equal(bedtimeMinutes('22:30'), 22 * 60 + 30);
  assert.equal(bedtimeMinutes('00:30'), 24 * 60 + 30);
});

test('Grenzzeit 8 h vor dem Schlafen', () => {
  assert.equal(cutoffTime('22:30', 8), '14:30');
  assert.equal(cutoffTime('00:30', 8), '16:30');
  assert.equal(isAfterCutoff('14:30', '22:30', 8), false);
  assert.equal(isAfterCutoff('15:00', '22:30', 8), true);
});

test('Tagesbewertung: 7 Tassen', () => {
  const doses = ['07:00', '08:30', '10:00', '11:30', '13:30', '15:00', '16:30'].map((time) => ({ time, mg: 90 }));
  const a = dayAssessment(doses, { bedtime: '22:30', cutoffH: 8, halfLifeH: 5 });
  assert.equal(a.total, 630);
  assert.ok(a.overMax);
  assert.equal(a.late.length, 2);
  assert.ok(a.atBedtime > 100 && a.atBedtime < 200, `Rest ${a.atBedtime}`);
});

test('Ausschleichplan 7 → 4 Tassen', () => {
  const p = taperPlan({ startDate: '2026-10-19', startCups: 7, targetCups: 4 });
  assert.deepEqual(
    p.map((w) => w.cups),
    [6, 5, 4],
  );
  assert.equal(p[1].from, '2026-10-26');
  assert.equal(allowedCups(p, '2026-10-18'), null);
  assert.equal(allowedCups(p, '2026-10-25'), 6);
  assert.equal(allowedCups(p, '2026-11-02'), 4);
  assert.equal(allowedCups(p, '2027-06-01'), 4);
});
