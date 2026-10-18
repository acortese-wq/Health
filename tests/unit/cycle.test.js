// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodStarts, cycleLength, cycleInfo, isPremenstrual, lifeStage } from '../../app/js/domain/cycle.js';
import { dailyTargets } from '../../app/js/domain/micros.js';
import { nutritionAdvice } from '../../app/js/domain/advice.js';
import { addDays } from '../../app/js/domain/util.js';
import { sanitize } from '../../app/js/store.js';

/** Periodentage ab Startdaten (je 4 Tage) */
function daysWith(/** @type {string[]} */ starts) {
  /** @type {Record<string, { period?: boolean }>} */
  const d = {};
  for (const s of starts) for (let i = 0; i < 4; i++) d[addDays(s, i)] = { period: true };
  return d;
}

test('Periodenbeginne und Zykluslänge aus den Einträgen', () => {
  const days = daysWith(['2026-07-01', '2026-07-30', '2026-08-28', '2026-09-27']);
  const starts = periodStarts(days);
  assert.deepEqual(starts, ['2026-07-01', '2026-07-30', '2026-08-28', '2026-09-27']);
  assert.equal(cycleLength(starts, 28), 29);
  assert.equal(cycleLength([], 31), 31);
  // Startwert aus dem Profil; Doppelungen innerhalb 10 Tagen zusammengefasst
  assert.deepEqual(periodStarts({}, '2026-10-01'), ['2026-10-01']);
  assert.deepEqual(periodStarts(daysWith(['2026-10-01']), '2026-10-03'), ['2026-10-01']);
});

test('Phase: Periode, erste Hälfte, Eisprung, zweite Hälfte, Tage vor der Periode', () => {
  const starts = ['2026-10-01'];
  const ph = (/** @type {number} */ day) => cycleInfo(addDays('2026-10-01', day - 1), starts, 28, {})?.phase;
  assert.equal(ph(2), 'periode');
  assert.equal(ph(8), 'follikel');
  assert.equal(ph(14), 'eisprung');
  assert.equal(ph(18), 'luteal');
  assert.equal(ph(25), 'praemenstruell');
  const info = cycleInfo('2026-10-10', starts, 28, {});
  assert.equal(info?.day, 10);
  assert.equal(info?.nextStart, '2026-10-29');
  assert.equal(cycleInfo('2026-09-01', starts, 28, {}), null);
  assert.ok(isPremenstrual('2026-10-25', starts, 28));
  assert.ok(!isPremenstrual('2026-10-10', starts, 28));
});

test('Lebensphase: Nährstoffziele für Schwangerschaft, Stillzeit, ohne Menstruation; Männer unverändert', () => {
  const base = { kcalTarget: 1900, proteinG: 110 };
  assert.equal(dailyTargets({ ...base, sex: 'f' }).iron, 16);
  const preg = dailyTargets({ ...base, sex: 'f', stage: lifeStage('f', 'schwanger') });
  assert.deepEqual([preg.folate, preg.iodine, preg.b12, preg.iron], [550, 230, 4.5, 27]);
  const lact = dailyTargets({ ...base, sex: 'f', stage: lifeStage('f', 'stillend') });
  assert.deepEqual([lact.folate, lact.iodine, lact.b12, lact.iron], [450, 260, 5.5, 16]);
  assert.equal(dailyTargets({ ...base, sex: 'f', stage: lifeStage('f', 'wechseljahre') }).iron, 11);
  assert.equal(lifeStage('m', 'schwanger'), 'standard');
  assert.equal(dailyTargets({ ...base, sex: 'm', stage: lifeStage('m', 'schwanger') }).iron, 11);
});

test('Hinweise: ausbleibende Periode, Tage vor der Periode, Schwangerschaft', () => {
  /** @type {Parameters<typeof nutritionAdvice>[0]} */
  const base = {
    date: '2026-07-15',
    session: { kind: 'rest', title: 'Pause' },
    runsToday: [],
    ratePctPerWeek: null,
    rhrDelta: null,
    sleep7: null,
    deficit7: null,
    days: {},
    vitDSupplementUg: 0,
    dietBreakUntil: '',
    startDate: '2026-07-01',
    maintenance: false,
  };
  const ids = (/** @type {any} */ cycle) => nutritionAdvice({ ...base, cycle }).map((h) => h.id);
  assert.ok(ids({ status: 'natuerlich', lastStart: '', phase: null, trainingHeavy: false }).includes('cycle-start'));
  const late = nutritionAdvice({
    ...base,
    cycle: { status: 'natuerlich', lastStart: '2026-04-01', phase: null, trainingHeavy: true },
  }).find((h) => h.id === 'amenorrhea');
  assert.ok(late);
  assert.equal(late.severity, 'warn');
  assert.match(late.text, /RED-S/);
  assert.ok(!ids({ status: 'natuerlich', lastStart: '2026-06-20', phase: null, trainingHeavy: false }).includes('amenorrhea'));
  assert.ok(ids({ status: 'natuerlich', lastStart: '2026-06-20', phase: 'praemenstruell', trainingHeavy: false }).includes('cycle-pms'));
  assert.ok(
    !ids({ status: 'hormonell', lastStart: '2026-01-01', phase: null, trainingHeavy: true }).includes('amenorrhea'),
    'mit Hormonen keine Warnung',
  );
  assert.ok(ids({ status: 'schwanger', lastStart: '', phase: null, trainingHeavy: false }).includes('pregnancy'));
  assert.ok(ids({ status: 'stillend', lastStart: '', phase: null, trainingHeavy: false }).includes('lactation'));
});

test('Speicher: Zyklusangaben werden geprüft', () => {
  const s = sanitize({
    schema: 1,
    profile: { sex: 'f', cycleStatus: 'natuerlich', cycleLength: 99, lastPeriodStart: '2026-10-01', shareCycle: 'ja' },
    days: { '2026-10-02': { period: true }, '2026-10-03': { period: 'x' } },
  });
  assert.equal(s.profile?.cycleStatus, 'natuerlich');
  assert.equal(s.profile?.cycleLength, 28);
  assert.equal(s.profile?.lastPeriodStart, '2026-10-01');
  assert.equal(s.profile?.shareCycle, false);
  assert.equal(s.days['2026-10-02'].period, true);
  assert.equal(s.days['2026-10-03']?.period, undefined);
  assert.equal(sanitize({ schema: 1, profile: { cycleStatus: 'gift' } }).profile?.cycleStatus, 'keine');
});
