// @ts-check
// Beispieldaten zum Ausprobieren. Klar als Demo markiert (state.demo = true).

import { emptyState, uid } from './store.js';
import { addDays } from './domain/util.js';
import { FOODS } from './data/foods.js';
import { foodAmounts, pickMicros } from './domain/micros.js';
import { addGroups, portionsFor, scaleGroups } from './domain/foodgroups.js';

/**
 * Mikronährstoffe für einen Beispiel-Eintrag aus einer Zusammensetzung der Datenbank,
 * skaliert auf die Kalorien des Eintrags.
 * @param {number} kcal
 * @param {[string, number][]} parts Schlüssel und Gramm
 */
function microsFor(kcal, parts) {
  /** @type {import('./domain/micros.js').Amounts} */
  const sum = {};
  /** @type {import('./domain/foodgroups.js').Groups} */
  let groups = {};
  for (const [k, g] of parts) {
    const food = FOODS.find((f) => f.k === k);
    if (!food) continue;
    groups = addGroups(groups, portionsFor(food.gr, g, ((food.v.kcal ?? 0) * g) / 100));
    for (const [n, v] of Object.entries(foodAmounts(food, g))) {
      const key = /** @type {import('./domain/micros.js').NutrientKey} */ (n);
      sum[key] = (sum[key] ?? 0) + v;
    }
  }
  const f = sum.kcal ? kcal / sum.kcal : 1;
  for (const key of Object.keys(sum))
    sum[/** @type {import('./domain/micros.js').NutrientKey} */ (key)] =
      (sum[/** @type {import('./domain/micros.js').NutrientKey} */ (key)] ?? 0) * f;
  const r1 = (/** @type {number | undefined} */ v) => Math.round((v ?? 0) * 10) / 10;
  return {
    carbs: r1(sum.carbs),
    fat: r1(sum.fat),
    satFat: r1(sum.satFat),
    fiber: r1(sum.fiber),
    sugar: r1(sum.sugar),
    salt: Math.round(((sum.sodium ?? 0) * 2.5) / 10) / 100,
    micros: pickMicros(sum),
    microSrc: /** @type {const} */ ('db'),
    groups: /** @type {import('./domain/foodgroups.js').Groups} */ (scaleGroups(groups, 1)),
  };
}

/**
 * @param {string} today
 * @returns {import('./store.js').State}
 */
export function demoState(today) {
  const s = emptyState();
  s.demo = true;
  const start = addDays(today, -34);
  s.profile = {
    name: 'Beispiel',
    sex: 'm',
    birthDate: '1977-05-09',
    heightCm: 172,
    startDate: start,
    startWeightKg: 95,
    goalWeightKg: 80,
    goalDate: addDays(start, 165),
    activity: 'mittel',
    proteinPerKg: 1.9,
    kcalOverride: null,
    stepsTarget: 9000,
    sleepTargetH: 7.5,
    waterTargetMl: 2000,
    trainingMode: 'kombi',
    fastingWindowH: 0,
    foodPrefs: { fisch: true, milch: true, fleisch: true, kantine: true },
    eatStart: '11:00',
    bedtime: '22:30',
    caffeineHalfLifeH: 5,
    caffeineCutoffH: 8,
    caffeineMaxMg: 400,
    caffeineStartCups: 7,
    caffeineTargetCups: 4,
    caffeineTaperStart: addDays(start, 2),
  };
  // Deterministisches Pseudo-Rauschen, damit Demo und Tests reproduzierbar bleiben.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i <= 34; i++) {
    const date = addDays(start, i);
    const water = i < 10 ? -0.06 * i : -0.6;
    const kg = 95 + water - 0.085 * i + rnd() * 0.45 + (i % 7 === 6 ? 0.7 : 0);
    const cups = Math.max(4, 7 - Math.floor(i / 7));
    s.days[date] = {
      weightKg: Math.round(kg * 10) / 10,
      steps: Math.round(7500 + i * 40 + rnd() * 1800),
      sleepH: Math.round((6.9 + rnd() * 0.6 + i * 0.005) * 4) / 4,
      restingHr: Math.round(49 + rnd() * 2),
      waterMl: 1250 + Math.round((rnd() + 1) * 2) * 250,
      ...(i % 5 !== 3 ? { complete: true } : {}),
      food: [
        (() => {
          const kcal = 700 + Math.round(rnd() * 80);
          return {
            id: uid(),
            name: 'Mittagsteller Protein + Gemüse',
            kcal,
            protein: 50,
            time: '12:15',
            ...microsFor(kcal, [
              ['pouletbrust', 150],
              ['reis', 180],
              ['broccoli', 150],
              ['rapsoel', 10],
            ]),
          };
        })(),
        {
          id: uid(),
          name: 'Skyr 250 g mit Beeren',
          kcal: 210,
          protein: 28,
          time: '16:00',
          ...microsFor(210, [
            ['skyr', 250],
            ['heidelbeeren', 80],
          ]),
        },
        (() => {
          const kcal = 720 + Math.round(rnd() * 120);
          return {
            id: uid(),
            name: 'Pasta-Teller (90 g Pasta, 150 g Poulet, Gemüse)',
            kcal,
            protein: 55,
            time: '19:15',
            ...microsFor(kcal, [
              ['pasta', 225],
              ['pouletbrust', 150],
              ['tomatensauce', 100],
              ['zucchetti', 100],
              ['olivenoel', 10],
            ]),
          };
        })(),
        { id: uid(), name: 'Milch im Kaffee (Tagesmenge)', kcal: 60, protein: 4, time: '07:00', ...microsFor(60, [['milch', 100]]) },
        {
          id: uid(),
          name: 'Apfel und Nüsse 30 g',
          kcal: 260,
          protein: 6,
          time: '10:00',
          ...microsFor(260, [
            ['apfel', 180],
            ['baumnuesse', 30],
          ]),
        },
      ],
      caffeine: Array.from({ length: cups }, (_, k) => ({
        id: uid(),
        label: 'Kaffee / Lungo',
        mg: 90,
        time: ['07:00', '08:30', '10:00', '11:30', '13:30', '15:00', '16:30'][k],
      })),
    };
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (dow === 1 || dow === 4) {
      const tpl = dow === 1 ? 'A' : 'B';
      const base = 30 + Math.floor(i / 7) * 2.5;
      s.workouts.push({
        id: uid(),
        date,
        kind: 'strength',
        template: tpl,
        sets: (tpl === 'A'
          ? ['beinpresse', 'rdl', 'brustpresse', 'kabelrudern']
          : ['goblet', 'latzug', 'schulterdruecken', 'hipthrust']
        ).flatMap((ex) =>
          [0, 1, 2].map((k) => ({ ex, kg: ex === 'beinpresse' || ex === 'hipthrust' ? base * 2 : base, reps: 12 - k - (i % 3) })),
        ),
      });
    }
    if (dow === 2) s.workouts.push({ id: uid(), date, kind: 'run', runType: 'z2', minutes: 45, km: 6.8, avgHr: 138 });
    if (dow === 6) s.workouts.push({ id: uid(), date, kind: 'run', runType: 'interval', minutes: 38, km: 6.1, avgHr: 152 });
    if (dow === 0) s.workouts.push({ id: uid(), date, kind: 'run', runType: 'long', minutes: 65, km: 9.4, avgHr: 136 });
  }
  s.waist.push(
    { id: uid(), date: start, cm: 108 },
    { id: uid(), date: addDays(start, 14), cm: 106 },
    { id: uid(), date: addDays(start, 28), cm: 104.5 },
  );
  s.vo2max.push({ id: uid(), date: start, value: 44 }, { id: uid(), date: addDays(start, 28), value: 45 });
  for (let i = 0; i < 7; i++) {
    const date = addDays(today, -6 + i);
    s.bp.push({ id: uid(), date, time: '07:10', sys: 131 - (i % 3), dia: 83 - (i % 2), pulse: 52, setting: 'home' });
    s.bp.push({ id: uid(), date, time: '21:00', sys: 127 + (i % 2), dia: 80, pulse: 56, setting: 'home' });
  }
  const labDate = addDays(start, 10);
  /** @type {[string, number, string][]} */
  const labs = [
    ['hba1c', 5.6, '%'],
    ['ldl', 3.4, 'mmol/l'],
    ['hdl', 1.1, 'mmol/l'],
    ['tg', 1.9, 'mmol/l'],
    ['apob', 1.05, 'g/l'],
    ['lpa', 42, 'nmol/l'],
    ['creatinine', 84, 'µmol/l'],
    ['alt', 41, 'U/l'],
    ['ast', 29, 'U/l'],
    ['platelets', 240, 'G/l'],
  ];
  for (const [key, value, unit] of labs) s.labs.push({ id: uid(), date: labDate, key, value, unit });
  s.stopBang = { s: true, t: false, o: false, p: false, n: true };
  return s;
}
