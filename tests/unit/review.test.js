import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayReview, eveningShare, streaks, weekReview } from '../../app/js/domain/review.js';
import { addDays } from '../../app/js/domain/util.js';

const MONDAY = '2026-10-19'; // Kraft A geplant
const WEDNESDAY = '2026-10-21'; // Ruhetag

/** @param {Partial<import('../../app/js/domain/review.js').DayInput> & { day?: any }} o */
function input(o = {}) {
  const day = o.day ?? {};
  const food = day.food ?? [];
  return {
    date: MONDAY,
    profile: { stepsTarget: 9000, sleepTargetH: 7.5 },
    kcal: food.reduce((a, f) => a + f.kcal, 0),
    kcalTarget: 2070,
    proteinG: food.reduce((a, f) => a + f.protein, 0),
    protein: { grams: 150 },
    caffeine: { late: [], cutoff: '14:30' },
    cupsAllowed: 6,
    cupsToday: (day.caffeine ?? []).length,
    ...o,
    day,
  };
}
const meal = (kcal, protein, time = '12:00') => ({ id: time + kcal, name: 'x', kcal, protein, time });
const noStreaks = { weighed: 0, logged: 0, protein: 0 };

test('Perfekter Tag: nur Erfolge, motivierende Überschrift', () => {
  const r = dayReview(
    input({
      day: {
        weightKg: 94,
        steps: 9500,
        sleepH: 7.5,
        complete: true,
        food: [meal(700, 50), meal(210, 28, '16:00'), meal(1100, 75, '19:00')],
        // Koffein ohne Getränkemenge (ml: 0), damit Trinken hier nicht bewertet wird
        caffeine: [{ id: 'c', label: 'Kaffee', mg: 90, ml: 0, time: '08:00' }],
      },
    }),
    {
      workouts: [{ id: 'w', date: MONDAY, kind: 'strength', template: 'A', sets: [] }],
      dayOver: true,
      streaks: { weighed: 5, logged: 2, protein: 3 },
    },
  );
  assert.equal(r.tone, 'great');
  assert.equal(r.met, r.total);
  assert.equal(r.improve.length, 0);
  assert.ok(r.wins.some((w) => w.includes('Kraft A')));
  assert.match(r.focus, /weitermachen/);
  assert.deepEqual(r.streaks, ['5 Tage in Folge gewogen', '3 Tage in Folge Proteinziel erreicht']);
});

test('Abendlicher Ausreisser: Tipp zum 16-Uhr-Snack statt Vorwurf', () => {
  const r = dayReview(input({ day: { complete: true, food: [meal(400, 20), meal(2200, 60, '19:30')] } }), {
    workouts: [],
    dayOver: true,
    streaks: noStreaks,
  });
  const over = r.improve.find((i) => i.id === 'kcal-over');
  assert.ok(over);
  assert.match(over.title, /530 kcal über dem Ziel/);
  assert.match(over.tip, /16 Uhr/);
  // Über 500 kcal zu viel ist der grösste Hebel, danach Protein; ausgelassenes Training fällt weg (max. 2)
  assert.deepEqual(
    r.improve.map((i) => i.id),
    ['kcal-over', 'protein'],
  );
});

test('Höchstens zwei Verbesserungen, wichtigste zuerst, Fokus = wichtigster Tipp', () => {
  const r = dayReview(
    input({
      day: { steps: 4000, sleepH: 5.5, food: [meal(900, 30)], caffeine: [{ id: 'c', label: 'K', mg: 90, time: '17:00' }] },
      caffeine: { late: [1], cutoff: '14:30' },
    }),
    { workouts: [], dayOver: true, streaks: noStreaks },
  );
  assert.equal(r.improve.length, 2);
  assert.deepEqual(
    r.improve.map((i) => i.id),
    ['protein', 'training'],
  );
  assert.equal(r.focus, r.improve[0].tip);
  assert.equal(r.tone, 'restart');
  assert.match(r.headline, /neuer Tag|aufzugeben/);
});

test('Laufender Tag: keine Kritik an noch nicht Erreichtem', () => {
  const r = dayReview(input({ day: { food: [meal(500, 20)], steps: 3000 } }), { workouts: [], dayOver: false, streaks: noStreaks });
  assert.equal(r.improve.length, 0);
  assert.match(r.focus, /läuft noch/);
});

test('Ruhetag: Training wird nicht verlangt', () => {
  const r = dayReview(input({ date: WEDNESDAY, day: { food: [meal(2000, 150)], complete: true } }), {
    workouts: [],
    dayOver: true,
    streaks: noStreaks,
  });
  assert.ok(!r.improve.some((i) => i.id === 'training'));
});

test('Zu wenig gegessen wird angesprochen', () => {
  const r = dayReview(input({ date: WEDNESDAY, day: { complete: true, food: [meal(1100, 140)] } }), {
    workouts: [],
    dayOver: true,
    streaks: noStreaks,
  });
  assert.ok(r.improve.some((i) => i.id === 'kcal-under'));
});

test('Leerer Tag', () => {
  const r = dayReview(input({ date: WEDNESDAY }), { workouts: [], dayOver: false, streaks: noStreaks });
  assert.ok(r.empty);
});

test('Abendanteil der Kalorien', () => {
  assert.equal(eveningShare({ food: [meal(500, 0, '12:00'), meal(1500, 0, '18:00')] }), 0.75);
  assert.equal(eveningShare({}), 0);
});

test('Serien zählen bis gestern, heute erst wenn erfüllt', () => {
  const days = {};
  for (let i = 1; i <= 4; i++) days[addDays('2026-10-20', -i)] = { weightKg: 94 };
  assert.equal(streaks(days, '2026-10-20', 150).weighed, 4);
  days['2026-10-20'] = { weightKg: 93.8 };
  assert.equal(streaks(days, '2026-10-20', 150).weighed, 5);
  delete days['2026-10-18'];
  assert.equal(streaks(days, '2026-10-20', 150).weighed, 2);
});

test('Wochenrückblick: fehlendes Krafttraining hat Vorrang, gutes Tempo wird gelobt', () => {
  const days = Array.from({ length: 7 }, (_, i) =>
    input({ date: addDays('2026-10-13', i), day: { weightKg: 94, complete: true, steps: 9500, sleepH: 7.4, food: [meal(2000, 155)] } }),
  );
  const r = weekReview(days, {
    week: { strengthDays: 1, aerobicMet: true, intervalDone: true, equivalent: 180 },
    slopeKgPerDay: -0.09,
    weightKg: 93,
    stepsTarget: 9000,
    sleepTargetH: 7.5,
    streaks: noStreaks,
  });
  assert.equal(r.improve[0].id, 'w-strength');
  assert.ok(r.wins.some((w) => w.includes('gesunden Tempo')));
  assert.ok(r.wins.some((w) => w.includes('Proteinziel an 7 von 7')));
  assert.equal(r.focus, r.improve[0].tip);
});

test('Trinken: Ziel erreicht wird gelobt, zu wenig mit konkretem Tipp', () => {
  const ok = dayReview(input({ date: WEDNESDAY, day: { waterMl: 2250 } }), { workouts: [], dayOver: true, streaks: noStreaks });
  assert.ok(ok.wins.some((w) => /2[’']?250 ml/.test(w)));
  const low = dayReview(input({ date: WEDNESDAY, day: { waterMl: 750 } }), { workouts: [], dayOver: true, streaks: noStreaks });
  // Ohne erfasste Mahlzeiten hat «nichts erfasst» Vorrang, Trinken folgt als zweiter Punkt
  const water = low.improve.find((i) => i.id === 'water');
  assert.ok(water);
  assert.match(water.tip, /Literflasche/);
  const running = dayReview(input({ date: WEDNESDAY, day: { waterMl: 750 } }), { workouts: [], dayOver: false, streaks: noStreaks });
  assert.equal(running.improve.length, 0);
});

test('Modus «nur Laufen»: kein Krafttraining verlangt', () => {
  const day = dayReview(
    input({ profile: { stepsTarget: 9000, sleepTargetH: 7.5, trainingMode: 'laufen' }, day: { food: [meal(2000, 150)], complete: true } }),
    {
      workouts: [],
      dayOver: true,
      streaks: noStreaks,
    },
  );
  assert.ok(!day.improve.some((i) => i.id === 'training'), 'Montag ist im Laufmodus Ruhetag');
  const week = weekReview([input()], {
    week: { strengthDays: 0, aerobicMet: true, intervalDone: true, equivalent: 180 },
    slopeKgPerDay: null,
    weightKg: 93,
    stepsTarget: 9000,
    sleepTargetH: 7.5,
    trainingMode: 'laufen',
    streaks: noStreaks,
  });
  assert.ok(!week.improve.some((i) => i.id === 'w-strength'));
});
