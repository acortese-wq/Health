import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageOn, adaptiveTdee, bmrMifflin, formulaTdee, planTarget, proteinTarget, KCAL_PER_KG } from '../../app/js/domain/energy.js';

test('ageOn zählt vollendete Jahre', () => {
  assert.equal(ageOn('1977-05-09', '2026-10-17'), 49);
  assert.equal(ageOn('1977-05-09', '2027-05-08'), 49);
  assert.equal(ageOn('1977-05-09', '2027-05-09'), 50);
});

test('Mifflin-St Jeor: Referenzrechnung', () => {
  // 10×95 + 6.25×172 − 5×49 + 5 = 1785
  assert.equal(bmrMifflin({ sex: 'm', weightKg: 95, heightCm: 172, age: 49 }), 1785);
  // Frau 70 kg, 165 cm, 40 J.: 700 + 1031.25 − 200 − 161 = 1370.25
  assert.equal(bmrMifflin({ sex: 'f', weightKg: 70, heightCm: 165, age: 40 }), 1370.25);
});

test('Formelbedarf mit Aktivitätsfaktor', () => {
  const t = formulaTdee({ sex: 'm', weightKg: 95, heightCm: 172, age: 49, activity: 'mittel' });
  assert.ok(Math.abs(t - 1785 * 1.55) < 1e-9);
});

test('adaptiver Bedarf: Zufuhr + Abnahme × 7700', () => {
  const intakes = Array(14).fill(2000);
  // −0.1 kg/Tag → 770 kcal Defizit → Bedarf 2770
  const r = adaptiveTdee({ intakes, slopeKgPerDay: -0.1 });
  assert.ok(r);
  assert.equal(Math.round(r.tdee), 2000 + 0.1 * KCAL_PER_KG);
  assert.equal(r.days, 14);
});

test('adaptiver Bedarf verweigert zu wenige Tage und unplausible Werte', () => {
  assert.equal(adaptiveTdee({ intakes: Array(5).fill(2000), slopeKgPerDay: -0.1 }), null);
  assert.equal(adaptiveTdee({ intakes: Array(14).fill(2000), slopeKgPerDay: null }), null);
  // 800 kcal und Gewichtszunahme → Erfassung offensichtlich unvollständig
  assert.equal(adaptiveTdee({ intakes: Array(14).fill(800), slopeKgPerDay: 0.05 }), null);
});

test('Planziel: Profil aus dem Coaching (95 → 80 kg bis 31.03.2027)', () => {
  const tdee = 1785 * 1.55;
  const r = planTarget({ sex: 'm', tdee, bmr: 1785, weightKg: 95, goalWeightKg: 80, today: '2026-10-17', goalDate: '2027-03-31' });
  // 165 Tage → 0.636 kg/Woche, < 1 % (0.95 kg)
  assert.ok(r.feasible);
  assert.ok(Math.abs(r.requiredRateKgPerWeek - 15 / (165 / 7)) < 1e-9);
  assert.equal(r.kcal, 2070);
  assert.ok(r.deficit > 650 && r.deficit < 750);
  assert.equal(r.flooredAt, null);
});

test('Planziel: zu ehrgeiziges Datum wird durch die Defizit-Obergrenze gebremst', () => {
  const r = planTarget({ sex: 'm', tdee: 2767, bmr: 1785, weightKg: 95, goalWeightKg: 80, today: '2026-10-17', goalDate: '2027-01-01' });
  assert.equal(r.feasible, false);
  // 25 % von 2767 = 692 < 750 → 750 kcal Defizit → 0.68 kg/Woche (< 1 % = 0.95 kg)
  assert.equal(r.deficit, 750);
  assert.ok(Math.abs(r.rateKgPerWeek - (750 * 7) / 7700) < 1e-9);
  assert.ok(r.projectedGoalDate && r.projectedGoalDate > '2027-01-01');
  assert.equal(r.kcal, 2020);
});

test('Planziel: bei hohem Bedarf greift die 1-%-Grenze vor dem Defizit-Deckel', () => {
  // Bedarf 4000 → Deckel 1000 kcal (25 %); 1 % von 70 kg = 0.7 kg/Woche = 770 kcal/Tag
  const r = planTarget({ sex: 'm', tdee: 4000, bmr: 1900, weightKg: 70, goalWeightKg: 60, today: '2026-01-01', goalDate: '2026-02-01' });
  assert.ok(Math.abs(r.rateKgPerWeek - 0.7) < 1e-9);
  assert.equal(r.deficit, 770);
});

test('Planziel: Kalorienuntergrenze greift', () => {
  const r = planTarget({ sex: 'f', tdee: 1700, bmr: 1300, weightKg: 70, goalWeightKg: 60, today: '2026-01-01', goalDate: '2026-03-01' });
  assert.equal(r.kcal, 1200);
  assert.equal(r.flooredAt, 1200);
  assert.ok(r.belowBmr);
  assert.equal(r.feasible, false);
});

test('Planziel: Ziel erreicht → Erhaltung', () => {
  const r = planTarget({ sex: 'm', tdee: 2500, bmr: 1700, weightKg: 79.5, goalWeightKg: 80, today: '2027-03-01', goalDate: '2027-03-31' });
  assert.ok(r.maintenance);
  assert.equal(r.kcal, 2500);
});

test('Protein: Referenz = Zielgewicht, mindestens BMI-25-Gewicht', () => {
  const r = proteinTarget({ weightKg: 95, goalWeightKg: 80, heightCm: 172, gPerKg: 1.9 });
  assert.equal(r.referenceKg, 80);
  assert.equal(r.grams, 150);
  assert.equal(r.rangeLow, 130);
  assert.equal(r.rangeHigh, 175);
  // Ziel unter BMI 25 → BMI-25-Gewicht als Referenz (73.96 kg)
  const s = proteinTarget({ weightKg: 95, goalWeightKg: 65, heightCm: 172, gPerKg: 1.6 });
  assert.ok(Math.abs(s.referenceKg - 25 * 1.72 ** 2) < 1e-9);
  // Normalgewicht → aktuelles Gewicht
  const n = proteinTarget({ weightKg: 70, goalWeightKg: 68, heightCm: 180, gPerKg: 1.6 });
  assert.equal(n.referenceKg, 70);
});
