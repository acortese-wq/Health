import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bmi,
  bmiClass,
  bpCategory,
  bpSeriesMean,
  ckdStage,
  derivedLabs,
  egfrCkdEpi2021,
  fib4,
  findLab,
  preventionItems,
  stopBang,
  waistRisk,
  whtr,
} from '../../app/js/domain/clinical.js';

test('BMI und WHO-Klassen', () => {
  assert.ok(Math.abs(bmi(95, 172) - 32.11) < 0.01);
  assert.equal(bmiClass(32.1).label, 'Adipositas Grad I');
  assert.equal(bmiClass(24.99).label, 'Normalgewicht');
  assert.equal(bmiClass(25).label, 'Übergewicht (Präadipositas)');
  assert.equal(bmiClass(18.4).severity, 'warn');
});

test('Taille: WHO/IDF-Grenzen nach Geschlecht', () => {
  assert.equal(waistRisk('m', 93.9).severity, 'ok');
  assert.equal(waistRisk('m', 94).severity, 'info');
  assert.equal(waistRisk('m', 102).severity, 'warn');
  assert.equal(waistRisk('f', 80).severity, 'info');
  assert.equal(waistRisk('f', 88).severity, 'warn');
});

test('Taille/Grösse nach NICE', () => {
  assert.equal(whtr(86, 172).label, 'Erhöhtes Risiko'); // genau 0.5
  assert.equal(whtr(85, 172).label, 'Gesunder Bereich');
  assert.equal(whtr(104, 172).label, 'Hohes Risiko');
});

test('Blutdruck ESC 2024: Heim- vs. Praxismessung', () => {
  assert.equal(bpCategory(118, 68, 'home').label, 'Nicht erhöht');
  assert.equal(bpCategory(118, 70, 'home').label, 'Erhöht');
  assert.equal(bpCategory(134, 84, 'home').label, 'Erhöht');
  assert.equal(bpCategory(135, 80, 'home').label, 'Hypertonie-Bereich');
  assert.equal(bpCategory(138, 85, 'office').label, 'Erhöht');
  assert.equal(bpCategory(140, 85, 'office').label, 'Hypertonie-Bereich');
  assert.equal(bpCategory(182, 95, 'home').severity, 'alert');
  assert.equal(bpCategory(150, 112, 'office').severity, 'alert');
});

test('Blutdruck-Serie: 7-Tage-Fenster und Verlässlichkeit', () => {
  const readings = [];
  for (let i = 0; i < 7; i++) {
    const date = `2026-10-${String(11 + i).padStart(2, '0')}`;
    readings.push({ date, sys: 130, dia: 80 }, { date, sys: 126, dia: 78 });
  }
  readings.push({ date: '2026-10-01', sys: 200, dia: 120 });
  const r = bpSeriesMean(readings, '2026-10-17');
  assert.deepEqual(r, { sys: 128, dia: 79, n: 14, reliable: true });
  assert.equal(bpSeriesMean(readings, '2026-09-01'), null);
});

test('eGFR CKD-EPI 2021: Referenzwerte', () => {
  // Mann, 50 J., Kreatinin 1.0 mg/dl (88.42 µmol/l):
  // 142 × (1/0.9)^−1.2 × 0.9938^50 ≈ 91.7
  const m = egfrCkdEpi2021(88.42, 50, 'm');
  assert.ok(Math.abs(m - 142 * (1 / 0.9) ** -1.2 * 0.9938 ** 50) < 1e-9);
  assert.ok(Math.abs(m - 91.7) < 0.1);
  // Frau, 60 J., Kreatinin 0.6 mg/dl: 142 × (0.6/0.7)^−0.241 × 0.9938^60 × 1.012
  const f = egfrCkdEpi2021(0.6 * 88.42, 60, 'f');
  assert.ok(Math.abs(f - 142 * (0.6 / 0.7) ** -0.241 * 0.9938 ** 60 * 1.012) < 1e-9);
  assert.equal(ckdStage(91.7).label.slice(0, 2), 'G1');
  assert.equal(ckdStage(59.9).label.slice(0, 3), 'G3a');
  assert.equal(ckdStage(14).severity, 'alert');
});

test('FIB-4: Formel und altersabhängige Grenzen', () => {
  // 50 × 30 / (250 × √36) = 1500 / 1500 = 1.0
  const r = fib4({ age: 50, ast: 30, alt: 36, plateletsG: 250 });
  assert.equal(r.value, 1);
  assert.equal(r.severity, 'ok');
  // 1.5 bei 50 J. → unklar; bei 66 J. → niedrig (Grenze 2.0)
  assert.equal(fib4({ age: 50, ast: 45, alt: 36, plateletsG: 250 }).severity, 'info');
  assert.equal(fib4({ age: 66, ast: 34.09, alt: 36, plateletsG: 250 }).severity, 'ok');
  assert.equal(fib4({ age: 60, ast: 80, alt: 36, plateletsG: 150 }).severity, 'warn');
});

test('derivedLabs: FIB-4 nur bei zeitnahen Werten', () => {
  const labs = [
    { id: '1', date: '2026-10-01', key: 'ast', value: 30, unit: 'U/l' },
    { id: '2', date: '2026-10-01', key: 'alt', value: 36, unit: 'U/l' },
    { id: '3', date: '2026-10-01', key: 'platelets', value: 250, unit: 'G/l' },
    { id: '4', date: '2026-10-01', key: 'creatinine', value: 88.42, unit: 'µmol/l' },
  ];
  const d = derivedLabs(labs, () => 50, 'm');
  assert.equal(d.fib4?.value, 1);
  assert.ok(d.egfr && Math.abs(d.egfr.value - 91.7) < 0.1);
  labs[2].date = '2025-01-01';
  assert.equal(derivedLabs(labs, () => 50, 'm').fib4, undefined);
});

test('Laborgrenzen', () => {
  const ctx = { sex: /** @type {'m'} */ ('m'), unit: '%' };
  const hba1c = findLab('hba1c');
  assert.ok(hba1c);
  assert.equal(hba1c.rate(5.6, ctx).label, 'Normal');
  assert.equal(hba1c.rate(5.7, ctx).label, 'Prädiabetes-Bereich');
  assert.equal(hba1c.rate(6.5, ctx).severity, 'alert');
  // 48 mmol/mol ≙ 6.5 %
  assert.equal(hba1c.rate(48, { ...ctx, unit: 'mmol/mol' }).severity, 'alert');
  assert.equal(hba1c.rate(38, { ...ctx, unit: 'mmol/mol' }).label, 'Normal');
  const lpa = findLab('lpa');
  assert.ok(lpa);
  assert.equal(lpa.rate(126, { ...ctx, unit: 'nmol/l' }).severity, 'warn');
  assert.equal(lpa.rate(51, { ...ctx, unit: 'mg/dl' }).severity, 'warn');
  assert.equal(lpa.rate(431, { ...ctx, unit: 'nmol/l' }).severity, 'alert');
  assert.equal(findLab('ldl')?.rate(5.0, ctx).severity, 'alert');
  assert.equal(findLab('hdl')?.rate(1.1, ctx).severity, 'ok');
  assert.equal(findLab('hdl')?.rate(1.1, { ...ctx, sex: 'f' }).severity, 'info');
});

test('STOP-BANG', () => {
  assert.equal(stopBang({ s: true, a: false, g: true }).score, 2);
  assert.equal(stopBang({ s: true, t: true, g: true }).label, 'Mittleres Risiko');
  assert.equal(stopBang({ s: true, t: true, o: true, p: true, g: true }).severity, 'warn');
});

test('Vorsorge: Darmkrebs ab 50, Zoster ab 65', () => {
  const at49 = preventionItems(49, 'm');
  assert.equal(at49.find((i) => i.id === 'colon')?.due, false);
  const at50 = preventionItems(50, 'm');
  assert.equal(at50.find((i) => i.id === 'colon')?.due, true);
  assert.equal(at50.find((i) => i.id === 'zoster')?.due, false);
  assert.equal(preventionItems(55, 'f').find((i) => i.id === 'psa')?.due, false);
});
