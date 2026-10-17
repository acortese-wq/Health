import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emaTrend, milestones, planWeightOn, projectGoalDate, rolling7, theilSen, trendSlope } from '../../app/js/domain/trend.js';
import { addDays } from '../../app/js/domain/util.js';

/** Synthetische Reihe: −0.09 kg/Tag mit Wasser-Ausreissern. */
function series(days = 28) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const noise = i % 7 === 5 ? 1.4 : (i % 3) * 0.2 - 0.2;
    out.push({ date: addDays('2026-10-01', i), kg: 95 - 0.09 * i + noise });
  }
  return out;
}

test('Theil-Sen ignoriert Ausreisser', () => {
  const pts = [0, 1, 2, 3, 4, 5, 6].map((x) => ({ x, y: 2 * x + 1 }));
  pts[3].y = 50;
  const r = theilSen(pts);
  assert.ok(r);
  assert.equal(r.slope, 2);
  assert.equal(r.intercept, 1);
});

test('trendSlope trifft die wahre Steigung trotz Rauschen', () => {
  const s = series();
  const r = trendSlope(s, '2026-10-28');
  assert.ok(r);
  assert.ok(Math.abs(r.slopeKgPerDay + 0.09) < 0.02, `Steigung ${r.slopeKgPerDay}`);
  assert.equal(r.n, 21);
});

test('trendSlope verlangt genug Daten', () => {
  assert.equal(trendSlope(series(5), '2026-10-05'), null);
  // 7 Punkte, aber nur 6 Tage Spannweite
  assert.equal(trendSlope(series(7), '2026-10-07'), null);
});

test('EMA startet beim ersten Wert und glättet', () => {
  const t = emaTrend([
    { date: '2026-01-01', kg: 100 },
    { date: '2026-01-02', kg: 90 },
  ]);
  assert.equal(t[0].kg, 100);
  assert.equal(t[1].kg, 100 - 0.15 * 10);
});

test('rolling7 mittelt die letzten 7 Tage inklusive Stichtag', () => {
  const s = [
    { date: '2026-01-01', kg: 99 },
    { date: '2026-01-02', kg: 90 },
    { date: '2026-01-08', kg: 92 },
  ];
  assert.deepEqual(rolling7(s, '2026-01-08'), { kg: 91, n: 2 });
  assert.equal(rolling7(s, '2025-12-01'), null);
});

test('Prognose Zieldatum', () => {
  assert.equal(projectGoalDate({ levelKg: 90, slopeKgPerDay: -0.1, goalKg: 80, today: '2026-01-01' }), '2026-04-11');
  assert.equal(projectGoalDate({ levelKg: 90, slopeKgPerDay: 0.05, goalKg: 80, today: '2026-01-01' }), null);
  assert.equal(projectGoalDate({ levelKg: 90, slopeKgPerDay: 0, goalKg: 80, today: '2026-01-01' }), null);
});

test('Planlinie und Zwischenziele', () => {
  const plan = { startDate: '2026-10-17', startKg: 95, goalDate: '2027-03-31', goalKg: 80 };
  assert.equal(planWeightOn(plan, '2026-10-01'), 95);
  assert.equal(planWeightOn(plan, '2027-06-01'), 80);
  const ms = milestones(plan);
  assert.deepEqual(
    ms.map((m) => m.date),
    ['2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31'],
  );
  for (let i = 1; i < ms.length; i++) assert.ok(ms[i].kg < ms[i - 1].kg);
  assert.equal(ms.at(-1)?.kg, 80);
});
