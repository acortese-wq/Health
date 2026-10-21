// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { behaviorCheck, swapFor } from '../../app/js/domain/behavior.js';
import { showcaseState } from '../../app/js/showcase.js';
import { sanitize, weightSeries } from '../../app/js/store.js';
import { emaTrend } from '../../app/js/domain/trend.js';
import { addDays } from '../../app/js/domain/util.js';

const TODAY = '2026-10-21';
/** @param {string} name @param {string} time @param {number} kcal @param {number} protein */
const e = (name, time, kcal, protein, extra = {}) => ({
  id: `${name}${time}${Math.random()}`,
  name,
  time,
  kcal,
  protein,
  carbs: 10,
  fat: 5,
  ...extra,
});
const base = { kcalTarget: 1900, proteinTarget: 150, bedtime: '22:30', fastingWindowH: 0 };

test('Kalorienfallen: McDonald’s → Salat, Cola Zero ist keine Falle', () => {
  assert.equal(swapFor({ name: "McDonald's Big Mac Menü", kcal: 1100 })?.id, 'burger');
  assert.equal(swapFor({ name: 'Cola Zero 5 dl', kcal: 2 }), null);
  assert.equal(swapFor({ name: 'Cola 5 dl', kcal: 210 })?.id, 'softdrink');
  assert.equal(swapFor({ name: 'Hamburger klein', kcal: 120 }), null, 'kleine Portion lohnt keinen Tausch');
});

test('Zu wenige Tage: keine Bewertung', () => {
  const days = { [TODAY]: { food: [e('Brot', '08:00', 300, 10)], complete: true } };
  const r = behaviorCheck({ days, date: TODAY, ...base });
  assert.equal(r.enough, false);
});

test('Muster: Fast Food, Abend-lastig, spät, Protein am Morgen fehlt, Wochenende', () => {
  /** @type {Record<string, any>} */
  const days = {};
  for (let i = 1; i <= 14; i++) {
    const d = addDays(TODAY, -i);
    const weekend = [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
    days[d] = {
      complete: true,
      food: [
        e('Gipfeli und Kaffee', '07:30', 320, 7),
        e(i % 7 === 2 ? "McDonald's Big Mac Menü" : 'Sandwich', '12:30', i % 7 === 2 ? 1100 : 500, 20),
        e('Pasta Carbonara', '19:30', weekend ? 1500 : 900, 30),
        e('Chips', '21:45', 300, 4),
      ],
    };
  }
  const r = behaviorCheck({ days, date: TODAY, ...base });
  assert.equal(r.enough, true);
  const ids = r.findings.map((f) => f.id);
  for (const id of ['traps', 'evening', 'late', 'protein-morning', 'weekend']) assert.ok(ids.includes(id), `${id} fehlt: ${ids}`);
  const traps = r.findings.find((f) => f.id === 'traps');
  assert.ok(traps?.examples.some((x) => /McDonald/.test(x.name) && /Salat/.test(x.alt ?? '')));
  assert.ok(
    traps?.examples.some((x) => /^\d+× Chips/.test(x.name)),
    'gleiche Fallen zusammengefasst',
  );
  assert.ok(
    r.findings.every((f) => f.ref.length > 10),
    'jede Kritik mit Quelle',
  );
});

test('Gutes Verhalten: keine Kritik, Stärken genannt; heute ohne Abschluss zählt nicht', () => {
  /** @type {Record<string, any>} */
  const days = {};
  for (let i = 0; i <= 10; i++) {
    days[addDays(TODAY, -i)] = {
      complete: i !== 0,
      food: [
        e('Skyr mit Beeren', '07:15', 320, 30, { groups: { milch: 1, frucht: 0.7 } }),
        e('Poulet, Reis, Broccoli', '12:15', 650, 45, { groups: { fleisch: 1, staerke: 1, gemuese: 1.7 } }),
        e('Apfel', '15:30', 80, 0.5, { groups: { frucht: 1.2 } }),
        e('Lachs, Gemüse', '18:30', 560, 38, { groups: { fisch: 1, gemuese: 2 } }),
      ],
    };
  }
  const r = behaviorCheck({ days, date: TODAY, ...base });
  assert.equal(r.analysedDays, 10);
  assert.deepEqual(r.findings, []);
  assert.ok(r.strengths.length >= 3, r.strengths.join(' | '));
});

test('Vorführprofil: 365 Tage, 97 → 80 kg, gültige Daten, realistisches Tempo', () => {
  const s = showcaseState(TODAY);
  assert.equal(Object.keys(s.days).length, 365);
  const clean = sanitize(JSON.parse(JSON.stringify(s)));
  const series = weightSeries(clean);
  const trend = emaTrend(series);
  assert.ok(Math.abs(trend[trend.length - 1].kg - 80) < 0.6, `Trend am Ende ${trend[trend.length - 1].kg}`);
  assert.ok(series[0].kg > 96 && series[0].kg < 98);
  // Kein Monat mit mehr als 1 % pro Woche nach den ersten zwei Wochen
  for (let i = 30; i < trend.length; i += 30) {
    const perWeek = ((trend[i - 30].kg - trend[i].kg) / 30) * 7;
    assert.ok(perWeek < 0.9, `zu schnell: ${perWeek.toFixed(2)} kg/Woche`);
  }
  assert.ok(s.workouts.length > 100);
  assert.equal(s.demo, true);
});
