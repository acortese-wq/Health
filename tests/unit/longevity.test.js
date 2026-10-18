import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activityYears, longevityEstimate, metHoursPerWeek, overweightRisks, yearsLostToBmi } from '../../app/js/domain/longevity.js';
import { waterFact, waterPace } from '../../app/js/domain/hydration.js';
import { addDays } from '../../app/js/domain/util.js';

test('Verlorene Jahre nach BMI: Stützpunkte der Prospective Studies Collaboration', () => {
  assert.deepEqual(yearsLostToBmi(24), { low: 0, high: 0 });
  assert.deepEqual(yearsLostToBmi(32.5), { low: 2, high: 4 });
  assert.deepEqual(yearsLostToBmi(42.5), { low: 8, high: 10 });
  const mid = yearsLostToBmi(28.75);
  assert.ok(Math.abs(mid.low - 1) < 1e-9 && Math.abs(mid.high - 2) < 1e-9);
});

test('Aktivität nach Moore 2012', () => {
  assert.equal(activityYears(0).years, 0);
  assert.equal(activityYears(2).years, 1.8);
  assert.equal(activityYears(7.5).years, 3.4);
  assert.equal(activityYears(20).years, 4.2);
  assert.equal(activityYears(30).years, 4.5);
});

test('MET-Stunden aus Läufen der letzten 4 Wochen', () => {
  const ws = [];
  for (let wk = 0; wk < 4; wk++) {
    const d = (n) => addDays('2026-10-18', -(wk * 7 + n));
    ws.push({ id: `a${wk}`, date: d(5), kind: 'run', runType: 'z2', minutes: 45 }); // 5.25 MET-h
    ws.push({ id: `b${wk}`, date: d(3), kind: 'run', runType: 'interval', minutes: 40 }); // 6 MET-h
    ws.push({ id: `c${wk}`, date: d(0), kind: 'run', runType: 'long', minutes: 60 }); // 7 MET-h
  }
  ws.push({ id: 'alt', date: '2026-08-01', kind: 'run', runType: 'long', minutes: 600 });
  assert.ok(Math.abs(metHoursPerWeek(ws, '2026-10-18') - 18.25) < 1e-9);
});

test('Gesamtschätzung für das Coaching-Profil (BMI 32.1 → 27.0, 3 Läufe)', () => {
  const e = longevityEstimate({ bmiNow: 32.1, bmiGoal: 27.0, metH: 18.25 });
  assert.ok(e.weightGain.low > 1.2 && e.weightGain.low < 1.5, `low ${e.weightGain.low}`);
  assert.ok(e.weightGain.high > 2.5 && e.weightGain.high < 2.9, `high ${e.weightGain.high}`);
  assert.equal(e.activity.years, 4.2);
  assert.equal(e.nextActivity?.metH, 22.5);
  assert.ok(Math.abs((e.nextActivity?.extraYears ?? 0) - 0.3) < 1e-9);
  // Ziel unter BMI 25 bringt nicht mehr als bis 25 (kein Verlust angenommen)
  assert.deepEqual(longevityEstimate({ bmiNow: 24, bmiGoal: 22, metH: 0 }).weightGain, { low: 0, high: 0 });
});

test('Risiken: Bauchfett ab 102 cm (Männer) zusätzlich markiert', () => {
  assert.ok(overweightRisks({ bmi: 32, waistCm: 104, sex: 'm' }).central);
  assert.ok(!overweightRisks({ bmi: 32, waistCm: 98, sex: 'm' }).central);
  assert.ok(!overweightRisks({ bmi: 23, waistCm: null, sex: 'm' }).show);
});

test('Trinkplan über den Tag', () => {
  // 14:00 = Hälfte der Wachzeit 07–21 Uhr → 1000 ml erwartet
  const behind = waterPace({ ml: 500, target: 2000, minutes: 14 * 60, isToday: true });
  assert.equal(behind.status, 'behind');
  assert.equal(behind.expected, 1000);
  assert.match(behind.message, /2 Gläser/);
  assert.equal(waterPace({ ml: 900, target: 2000, minutes: 14 * 60, isToday: true }).status, 'ontrack');
  assert.equal(waterPace({ ml: 0, target: 2000, minutes: 6 * 60, isToday: true }).status, 'ontrack');
  assert.equal(waterPace({ ml: 2000, target: 2000, minutes: 9 * 60, isToday: true }).status, 'done');
  assert.equal(waterPace({ ml: 1200, target: 2000, minutes: 0, isToday: false }).status, 'past');
  assert.notEqual(waterFact('2026-10-18'), waterFact('2026-10-19'));
});

test('Erinnerungszeiten und Kalenderdatei', async () => {
  const { reminderTimes, buildReminderIcs, shouldNudge } = await import('../../app/js/domain/hydration.js');
  assert.deepEqual(reminderTimes('09:00', '19:00', 120), ['09:00', '11:00', '13:00', '15:00', '17:00', '19:00']);
  assert.deepEqual(reminderTimes('08:30', '10:00', 45), ['08:30', '09:15', '10:00']);
  assert.deepEqual(reminderTimes('19:00', '09:00', 60), []);
  assert.deepEqual(reminderTimes('09:00', '19:00', 10), []);
  const ics = buildReminderIcs({
    times: ['09:00', '11:00'],
    mlPerReminder: 333,
    weekdaysOnly: true,
    startDate: '2026-10-18',
    stamp: '20261018T080000Z',
  });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 2);
  assert.equal((ics.match(/BEGIN:VALARM/g) ?? []).length, 2);
  assert.match(ics, /DTSTART:20261018T090000\r\n/);
  assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR/);
  assert.match(ics, /SUMMARY:Trinken: 350 ml Wasser/);
  assert.equal(ics.split('\r\n').join('').includes('\n'), false, 'nur CRLF-Zeilenenden');
  const daily = buildReminderIcs({ times: ['09:00'], mlPerReminder: 250, weekdaysOnly: false, startDate: '2026-10-18', stamp: 'x' });
  assert.match(daily, /RRULE:FREQ=DAILY/);
  assert.match(daily, /Trinken: 1 Glas Wasser/);
  const now = Date.UTC(2026, 9, 18, 12);
  assert.match(shouldNudge({ ml: 200, target: 2000, minutes: 14 * 60, lastNudge: null, now }) ?? '', /Gläser/);
  assert.equal(shouldNudge({ ml: 200, target: 2000, minutes: 14 * 60, lastNudge: now - 30 * 60000, now }), null);
  assert.equal(shouldNudge({ ml: 1000, target: 2000, minutes: 14 * 60, lastNudge: null, now }), null);
});
