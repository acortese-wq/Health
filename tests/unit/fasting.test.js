// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  eatingWindow,
  windowLabel,
  inWindow,
  outsideWindow,
  overnightFastH,
  fastingStatus,
  proteinPlan,
  durationText,
} from '../../app/js/domain/fasting.js';
import { dayReview } from '../../app/js/domain/review.js';

/** @param {string} time @param {number} kcal */
const f = (time, kcal, name = 'x') => ({ id: time + name, name, kcal, protein: 10, time });

test('Essensfenster 16:8 ab 11 Uhr, aus bei 0, endet spätestens um Mitternacht', () => {
  const w = eatingWindow('11:00', 8);
  assert.deepEqual(w, { start: 660, end: 1140, hours: 8 });
  assert.equal(windowLabel(/** @type {any} */ (w)), '11:00–19:00');
  assert.equal(eatingWindow('11:00', 0), null);
  assert.equal(eatingWindow('18:00', 8)?.end, 1440);
  assert.equal(windowLabel(/** @type {any} */ (eatingWindow('18:00', 8))), '18:00–24:00');
  assert.ok(inWindow('19:00', /** @type {any} */ (w)));
  assert.ok(!inWindow('19:01', /** @type {any} */ (w)));
  assert.ok(!inWindow('10:59', /** @type {any} */ (w)));
});

test('Ausserhalb: Milch im Kaffee (≤ 50 kcal) zählt nicht, früh und spät getrennt', () => {
  const w = /** @type {any} */ (eatingWindow('11:00', 8));
  const r = outsideWindow([f('07:00', 40, 'Milch'), f('09:30', 260), f('12:00', 700), f('21:15', 300)], w);
  assert.equal(r.outside.length, 2);
  assert.equal(r.early.length, 1);
  assert.equal(r.late.length, 1);
  assert.equal(r.kcal, 560);
});

test('Nächtliche Fastendauer über Mitternacht', () => {
  assert.equal(overnightFastH([f('19:00', 700)], [f('07:00', 40), f('11:00', 500)]), 16);
  assert.equal(overnightFastH([], [f('11:00', 500)]), null);
});

test('Status: Fastenphase mit Countdown, offen, Küche zu', () => {
  const w = /** @type {any} */ (eatingWindow('11:00', 8));
  const prev = [f('19:00', 700)];
  const morning = fastingStatus({ w, food: [], prevFood: prev, nowMin: 9 * 60 });
  assert.equal(morning.phase, 'fasting');
  assert.equal(morning.title, 'Seit 14 h nüchtern');
  assert.match(morning.detail, /öffnet um 11:00 \(in 2 h\)/);
  assert.equal(morning.progress, 14 / 16);
  const noon = fastingStatus({ w, food: [f('12:00', 700)], prevFood: prev, nowMin: 13 * 60 + 30 });
  assert.equal(noon.phase, 'open');
  assert.match(noon.detail, /Noch 5 h 30 min/);
  const night = fastingStatus({ w, food: [f('18:30', 700)], prevFood: prev, nowMin: 21 * 60 });
  assert.equal(night.phase, 'closed');
  assert.match(night.detail, /Seit 2 h 30 min nüchtern/);
  // Einträge in der Zukunft (vorerfasst) zählen für «nüchtern seit» nicht
  const planned = fastingStatus({ w, food: [f('12:00', 700)], prevFood: prev, nowMin: 9 * 60 });
  assert.equal(planned.title, 'Seit 14 h nüchtern');
});

test('Proteinplan: drei Portionen im Fenster', () => {
  const p = proteinPlan(150, /** @type {any} */ (eatingWindow('11:00', 8)));
  assert.deepEqual(p, { portions: 3, gramsEach: 50, times: ['11:00', '15:00', '18:30'] });
  assert.equal(durationText(45), '45 min');
  assert.equal(durationText(120), '2 h');
});

test('Rückblick: Fenster eingehalten wird gelobt, spätes Essen mit Tipp, ohne Fenster nichts', () => {
  const base = {
    date: '2026-10-14',
    kcal: 1900,
    kcalTarget: 2000,
    proteinG: 150,
    protein: { grams: 150 },
    caffeine: { late: [], cutoff: '14:30' },
    cupsAllowed: 6,
    cupsToday: 0,
  };
  const ctx = { workouts: [], dayOver: true, streaks: { weighed: 0, logged: 0, protein: 0 } };
  const profile = { stepsTarget: 9000, sleepTargetH: 7.5, fastingWindowH: 8, eatStart: '11:00' };
  const kept = dayReview({ ...base, profile, day: { food: [f('07:00', 40), f('12:00', 900), f('18:45', 1000)] } }, ctx);
  assert.ok(kept.wins.some((w) => w.includes('Essensfenster eingehalten (11:00–19:00)')));
  const late = dayReview({ ...base, profile, day: { food: [f('12:00', 900), f('21:30', 1000)] } }, ctx);
  const tip = late.improve.find((i) => i.id === 'window');
  assert.ok(tip);
  assert.match(tip.tip, /schloss um 19:00/);
  const off = dayReview({ ...base, profile: { ...profile, fastingWindowH: 0 }, day: { food: [f('21:30', 1000)] } }, ctx);
  assert.ok(!off.improve.some((i) => i.id === 'window'));
  assert.ok(!off.wins.some((w) => w.includes('Essensfenster')));
});
