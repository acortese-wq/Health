import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot } from '../../app/js/model.js';
import { emptyState } from '../../app/js/store.js';
import { addDays } from '../../app/js/domain/util.js';

function profile() {
  return {
    name: 'Test',
    sex: /** @type {'m'} */ ('m'),
    birthDate: '1977-05-09',
    heightCm: 172,
    startDate: '2026-10-17',
    startWeightKg: 95,
    goalWeightKg: 80,
    goalDate: '2027-03-31',
    activity: 'mittel',
    proteinPerKg: 1.9,
    kcalOverride: null,
    stepsTarget: 9000,
    sleepTargetH: 7.5,
    bedtime: '22:30',
    caffeineHalfLifeH: 5,
    caffeineCutoffH: 8,
    caffeineMaxMg: 400,
    caffeineStartCups: 7,
    caffeineTargetCups: 4,
    caffeineTaperStart: '2026-10-19',
  };
}

test('Snapshot am Starttag: Formelbedarf, Kalibrierungshinweis', () => {
  const s = emptyState();
  s.profile = profile();
  s.days['2026-10-17'] = { weightKg: 95 };
  const snap = snapshot(s, '2026-10-17');
  assert.equal(snap.age, 49);
  assert.equal(snap.adaptive, null);
  assert.equal(snap.kcalTarget, 2070);
  assert.equal(snap.protein.grams, 150);
  assert.ok(snap.hints.some((h) => h.id === 'calibrate'));
  assert.ok(snap.hints.some((h) => h.id === 'strength'));
});

test('Snapshot nach 3 Wochen: adaptiver Bedarf aus echten Daten', () => {
  const s = emptyState();
  s.profile = profile();
  // Wahrer Bedarf 2600 kcal, Zufuhr 2000 → −600 kcal/Tag → −0.078 kg/Tag
  for (let i = 0; i < 21; i++) {
    const date = addDays('2026-10-17', i);
    s.days[date] = {
      weightKg: 95 - (600 / 7700) * i + (i % 2 ? 0.3 : -0.3),
      food: [{ id: String(i), name: 'x', kcal: 2000, protein: 150, time: '12:00' }],
      complete: true,
    };
  }
  const snap = snapshot(s, addDays('2026-10-17', 20));
  assert.ok(snap.adaptive);
  assert.ok(Math.abs(snap.adaptive.tdee - 2600) < 80, `TDEE ${snap.adaptive.tdee}`);
  assert.ok(!snap.hints.some((h) => h.id === 'calibrate'));
});

test('Warnung bei zu schneller Abnahme und hohem Blutdruck', () => {
  const s = emptyState();
  s.profile = profile();
  for (let i = 0; i < 14; i++) s.days[addDays('2026-10-17', i)] = { weightKg: 95 - 0.25 * i };
  for (let i = 0; i < 7; i++)
    s.bp.push({ id: String(i), date: addDays('2026-10-24', i), time: '07:00', sys: 185, dia: 100, setting: 'home' });
  const snap = snapshot(s, '2026-10-30');
  assert.equal(snap.hints[0].severity, 'alert');
  assert.equal(snap.hints[0].id, 'bp');
  assert.ok(snap.hints.some((h) => h.id === 'too-fast'));
});

test('Koffein-Ausschleichplan im Snapshot', () => {
  const s = emptyState();
  s.profile = profile();
  assert.equal(snapshot(s, '2026-10-20').cupsAllowed, 6);
  assert.equal(snapshot(s, '2026-11-20').cupsAllowed, 4);
});

test('Abgelaufenes Zieldatum erzeugt einen eigenen Hinweis', () => {
  const s = emptyState();
  s.profile = { ...profile(), goalDate: '2026-11-01' };
  s.days['2026-11-05'] = { weightKg: 90 };
  const snap = snapshot(s, '2026-11-05');
  assert.ok(snap.plan.goalDatePassed);
  assert.equal(snap.hints.find((h) => h.id === 'goal-date')?.title, 'Zieldatum ist vorbei');
});

test('Modus «nur Laufen»: kein Kraft-Hinweis', () => {
  const s = emptyState();
  s.profile = { ...profile(), trainingMode: 'laufen' };
  assert.ok(!snapshot(s, '2026-10-17').hints.some((h) => h.id === 'strength'));
});

test('Schlaf-Regel: unter 6,5 h im Defizit → Warnung «Defizit nicht vergrössern»', () => {
  const s = emptyState();
  s.profile = /** @type {any} */ ({ ...profile(), proteinPerKg: 1.6 });
  for (let i = 0; i < 7; i++) s.days[addDays('2026-10-23', -i)] = { weightKg: 95, sleepH: 5.75 };
  const snap = snapshot(s, '2026-10-23');
  const h = snap.hints.find((x) => x.id === 'sleep');
  assert.ok(h);
  assert.equal(h.severity, 'warn');
  assert.match(h.title, /Defizit jetzt nicht vergrössern/);
  assert.equal(
    snap.hints.some((x) => x.id === 'protein-default'),
    false,
  );
  s.days['2026-10-23'].sleepH = 7.5;
  for (let i = 0; i < 7; i++) s.days[addDays('2026-10-23', -i)].sleepH = 7.4;
  assert.equal(
    snapshot(s, '2026-10-23').hints.some((x) => x.id === 'sleep'),
    false,
  );
});

test('Protein: Hinweis auf 1,6 g/kg nur bei der alten Voreinstellung 1,9', () => {
  const s = emptyState();
  s.profile = /** @type {any} */ (profile());
  s.days['2026-10-17'] = { weightKg: 95 };
  const h = snapshot(s, '2026-10-17').hints.find((x) => x.id === 'protein-default');
  assert.ok(h);
  assert.match(h.title, /≈ 130 statt 150 g/);
  s.profile = /** @type {any} */ ({ ...profile(), proteinPerKg: 2.0 });
  assert.equal(
    snapshot(s, '2026-10-17').hints.some((x) => x.id === 'protein-default'),
    false,
  );
});
