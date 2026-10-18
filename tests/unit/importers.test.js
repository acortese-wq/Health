import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  isDuplicate,
  parseCsv,
  parseDateTime,
  parseDurationMin,
  parseGarminActivities,
  parseHealthPaste,
  parseNumber,
} from '../../app/js/domain/importers.js';

const fixture = (name) => readFile(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

test('CSV: Anführungszeichen, Kommas im Feld, Semikolon-Trenner', () => {
  assert.deepEqual(parseCsv('a,b,c\n1,"x, y",3\n'), [
    ['a', 'b', 'c'],
    ['1', 'x, y', '3'],
  ]);
  assert.deepEqual(parseCsv('a;b\r\n"1;2";"he said ""hi"""'), [
    ['a', 'b'],
    ['1;2', 'he said "hi"'],
  ]);
});

test('Zahlen in verschiedenen Formaten', () => {
  assert.equal(parseNumber('5.02'), 5.02);
  assert.equal(parseNumber('5,02'), 5.02);
  assert.equal(parseNumber('1,050'), 1050);
  assert.equal(parseNumber('1,234.5'), 1234.5);
  assert.equal(parseNumber('1.234,5'), 1234.5);
  assert.equal(parseNumber("9'512"), 9512);
  assert.equal(parseNumber('48 bpm'), 48);
  assert.equal(parseNumber('--'), null);
});

test('Dauer und Datum', () => {
  assert.ok(Math.abs((parseDurationMin('00:45:20') ?? 0) - 45.333) < 0.01);
  assert.ok(Math.abs((parseDurationMin('45:20') ?? 0) - 45.333) < 0.01);
  assert.equal(parseDurationMin('01:12:31.5')?.toFixed(1), '72.5');
  assert.deepEqual(parseDateTime('2026-10-14 18:05:11'), { date: '2026-10-14', time: '18:05' });
  assert.deepEqual(parseDateTime('14.10.2026 6:05'), { date: '2026-10-14', time: '06:05' });
  assert.deepEqual(parseDateTime('10/14/2026 6:05 PM')?.date, '2026-10-14');
});

test('Garmin-Export englisch: Läufe, Intervalle, langer Lauf, Kraft; Radfahren übersprungen', async () => {
  const r = parseGarminActivities(await fixture('garmin-en.csv'));
  assert.equal(r.error, null);
  assert.equal(r.skipped, 1);
  assert.deepEqual(
    r.activities.map((a) => [a.kind, a.runType ?? '-', a.minutes, a.km ?? 0, a.avgHr ?? 0]),
    [
      ['run', 'z2', 45, 7.02, 138],
      ['run', 'interval', 38, 6.1, 151],
      ['strength', '-', 42, 0, 0],
      ['run', 'long', 73, 11.43, 136],
    ],
  );
  assert.equal(r.activities[0].id, 'garmin-2026-10-14-1805');
});

test('Garmin-Export deutsch mit BOM und Semikolon; Gehen übersprungen', async () => {
  const r = parseGarminActivities(await fixture('garmin-de.csv'));
  assert.equal(r.error, null);
  assert.equal(r.activities.length, 2);
  assert.deepEqual(r.activities[0], {
    id: 'garmin-2026-10-14-1805',
    date: '2026-10-14',
    time: '18:05',
    minutes: 45,
    title: 'Abendlauf',
    kind: 'run',
    runType: 'z2',
    km: 7.02,
    avgHr: 138,
  });
  assert.equal(r.skipped, 1);
});

test('Falsche Datei wird verständlich abgelehnt', () => {
  assert.match(parseGarminActivities('Name,Wert\nx,1').error ?? '', /Datum/);
  assert.match(parseGarminActivities('').error ?? '', /keine Aktivitäten/);
});

test('Doppelte erkennen: gleiche ID oder gleicher Tag mit ähnlicher Dauer', () => {
  const a = { id: 'garmin-2026-10-14-1805', date: '2026-10-14', time: '18:05', kind: 'run', runType: 'z2', minutes: 45, title: '' };
  assert.ok(isDuplicate(a, [{ id: 'garmin-2026-10-14-1805', date: '2026-10-14', kind: 'run', runType: 'z2', minutes: 45 }]));
  assert.ok(isDuplicate(a, [{ id: 'x', date: '2026-10-14', kind: 'run', runType: 'z2', minutes: 47 }]));
  assert.ok(!isDuplicate(a, [{ id: 'x', date: '2026-10-14', kind: 'run', runType: 'z2', minutes: 70 }]));
  assert.ok(!isDuplicate(a, [{ id: 'x', date: '2026-10-15', kind: 'run', runType: 'z2', minutes: 45 }]));
});

test('Kurzbefehl-Text aus Apple Health', () => {
  assert.deepEqual(parseHealthPaste('cockpit;schritte=9’512;ruhepuls=48;schlaf=7,4;gewicht=94.2 kg'), {
    steps: 9512,
    restingHr: 48,
    sleepH: 7.5,
    weightKg: 94.2,
  });
  assert.deepEqual(parseHealthPaste('cockpit;steps=8000;sleep=430'), { steps: 8000, sleepH: 7.25 });
  assert.deepEqual(parseHealthPaste('cockpit;schritte=;ruhepuls=500'), null);
  assert.equal(parseHealthPaste('irgendein Text'), null);
});
