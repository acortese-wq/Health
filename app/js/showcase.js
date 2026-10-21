// @ts-check
// Vorführprofil «−17 kg in einem Jahr»: ein erfundenes, aber realistisches Jahr zum Zeigen.
// Läuft nur im Arbeitsspeicher (siehe app.js, Vorführmodus) und berührt die eigenen Daten nie.
//
// Verlauf nach Studienlage: anfangs schneller (Glykogen und Wasser), danach rund 0.3–0.4 kg
// pro Woche, zwei Wochen Diätpause nach 6 Monaten, kleiner Anstieg über Weihnachten, Plateaus.
// Verhalten verbessert sich sichtbar: anfangs Fast Food, wenig Protein am Morgen, grosses
// Znacht; später proteinreiches Frühstück, Krafttraining, mehr Schritte.

import { emptyState, uid } from './store.js';
import { addDays, daysBetween } from './domain/util.js';
import { microsFor } from './demo.js';

/** Mahlzeiten-Vorlagen: Name, Zeit, kcal, Protein, Zutaten (BLV-Schlüssel, g), Herkunft der Kalorienfalle. */
const MEALS = /** @type {const} */ ({
  gipfeli: {
    name: 'Gipfeli und Kaffee mit Milch',
    time: '07:30',
    kcal: 320,
    protein: 7,
    parts: [
      ['gipfeli', 60],
      ['milch', 150],
    ],
  },
  skyr: {
    name: 'Skyr 200 g mit Beeren und Haferflocken',
    time: '07:15',
    kcal: 320,
    protein: 30,
    parts: [
      ['skyr', 200],
      ['heidelbeeren', 80],
      ['haferflocken', 30],
    ],
  },
  eier: {
    name: '2 Eier, Vollkornbrot, Tomate',
    time: '07:20',
    kcal: 360,
    protein: 22,
    parts: [
      ['ei', 110],
      ['vollkornbrot', 60],
      ['tomate', 100],
    ],
  },
  kantine: {
    name: 'Kantine Menü 1 (Fleisch, Beilage, Gemüse)',
    time: '12:10',
    kcal: 780,
    protein: 38,
    parts: [
      ['schweinsfilet', 130],
      ['roesti', 150],
      ['bohnen-gruen', 120],
      ['rapsoel', 10],
    ],
  },
  kantineLeicht: {
    name: 'Kantine: Poulet, Reis, viel Gemüse',
    time: '12:10',
    kcal: 620,
    protein: 45,
    parts: [
      ['pouletbrust', 150],
      ['reis', 150],
      ['broccoli', 200],
      ['rapsoel', 8],
    ],
  },
  salat: {
    name: 'Grosser Salat mit Thon und Kichererbsen',
    time: '12:15',
    kcal: 480,
    protein: 38,
    parts: [
      ['kopfsalat', 100],
      ['thon', 120],
      ['kichererbsen', 120],
      ['tomate', 100],
      ['olivenoel', 10],
    ],
  },
  mcdonalds: {
    name: "McDonald's Big Mac Menü mit Cola",
    time: '12:30',
    kcal: 1080,
    protein: 30,
    parts: [
      ['hackfleisch', 90],
      ['ruchbrot', 90],
      ['kartoffeln', 150],
      ['rapsoel', 25],
    ],
  },
  pizza: {
    name: 'Pizza Salami ganz',
    time: '19:30',
    kcal: 1150,
    protein: 45,
    parts: [
      ['ruchbrot', 220],
      ['mozzarella', 100],
      ['buendnerfleisch', 50],
      ['tomatensauce', 80],
    ],
  },
  pasta: {
    name: 'Pasta Carbonara grosse Portion',
    time: '19:45',
    kcal: 980,
    protein: 35,
    parts: [
      ['pasta', 300],
      ['rahm', 60],
      ['schinken', 60],
      ['parmesan', 20],
    ],
  },
  znachtLeicht: {
    name: 'Lachs, Ofengemüse, Kartoffeln',
    time: '18:45',
    kcal: 560,
    protein: 38,
    parts: [
      ['lachs', 120],
      ['zucchetti', 150],
      ['peperoni-rot', 100],
      ['kartoffeln', 150],
      ['olivenoel', 8],
    ],
  },
  linsen: {
    name: 'Linsencurry mit Vollreis und Spinat',
    time: '18:45',
    kcal: 540,
    protein: 26,
    parts: [
      ['linsen', 200],
      ['vollreis', 120],
      ['spinat', 100],
      ['rapsoel', 8],
    ],
  },
  poulet: {
    name: 'Poulet, Quinoa, Salat',
    time: '18:40',
    kcal: 520,
    protein: 45,
    parts: [
      ['pouletbrust', 150],
      ['quinoa', 150],
      ['kopfsalat', 80],
      ['olivenoel', 8],
    ],
  },
  chips: { name: 'Chips vor dem Fernseher', time: '21:45', kcal: 330, protein: 4, parts: [['chips', 60]] },
  bier: { name: 'Bier 2 Stangen', time: '21:00', kcal: 290, protein: 3, parts: [['kartoffeln', 10]] },
  apfel: { name: 'Apfel', time: '15:30', kcal: 80, protein: 0.5, parts: [['apfel', 150]] },
  quark: {
    name: 'Magerquark mit Beeren',
    time: '15:45',
    kcal: 170,
    protein: 20,
    parts: [
      ['magerquark', 150],
      ['erdbeeren', 100],
    ],
  },
  schoggi: { name: 'Schokolade halbe Tafel', time: '15:30', kcal: 270, protein: 3, parts: [['milchschokolade', 50]] },
});

/**
 * @param {string} today
 * @returns {import('./store.js').State}
 */
export function showcaseState(today) {
  const s = emptyState();
  s.demo = true;
  const start = addDays(today, -364);
  s.profile = {
    name: 'Beispiel Marco',
    sex: 'm',
    birthDate: '1979-03-14',
    heightCm: 175,
    startDate: start,
    startWeightKg: 97,
    goalWeightKg: 80,
    goalDate: addDays(start, 364),
    activity: 'leicht',
    proteinPerKg: 1.8,
    kcalOverride: null,
    stepsTarget: 9000,
    sleepTargetH: 7.5,
    waterTargetMl: 2200,
    trainingMode: 'kombi',
    fastingWindowH: 0,
    foodPrefs: { fisch: true, milch: true, fleisch: true, kantine: true },
    vitDSupplementUg: 20,
    dietBreakUntil: '',
    cycleStatus: 'keine',
    cycleLength: 28,
    lastPeriodStart: '',
    shareCycle: false,
    eatStart: '11:00',
    bedtime: '23:00',
    caffeineHalfLifeH: 5,
    caffeineCutoffH: 8,
    caffeineMaxMg: 400,
    caffeineStartCups: 0,
    caffeineTargetCups: 4,
    caffeineTaperStart: start,
  };
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

  // Fettverlust pro Tag je Phase (relativ), danach auf genau 17 kg skaliert
  const rate = (/** @type {number} */ i) => (i < 90 ? 1.25 : i < 180 ? 1.05 : i < 194 ? 0 : i < 300 ? 0.95 : 0.75);
  const cum = [0];
  for (let i = 1; i < 365; i++) cum.push(cum[i - 1] + rate(i));
  const totalFat = 17 - 1.2; // 1.2 kg Wasser/Glykogen in den ersten zwei Wochen
  const christmas = (/** @type {string} */ d) => {
    const md = d.slice(5);
    if (md >= '12-23' && md <= '12-31') return 0.15 * (Number(md.slice(3)) - 22);
    if (md >= '01-01' && md <= '01-12') return Math.max(0, 1.35 - 0.12 * Number(md.slice(3)));
    return 0;
  };

  /**
   * @param {keyof typeof MEALS} key
   * @param {number} [jitter]
   */
  const meal = (key, jitter = 0) => {
    const m = MEALS[key];
    const kcal = Math.round(m.kcal * (1 + jitter));
    return {
      id: uid(),
      name: m.name,
      kcal,
      protein: Math.round(m.protein * (1 + jitter) * 10) / 10,
      time: m.time,
      ...microsFor(kcal, /** @type {[string, number][]} */ (m.parts.map((p) => [...p]))),
      ...(key === 'mcdonalds' || key === 'chips' || key === 'schoggi' ? { nova: 4 } : {}),
    };
  };

  for (let i = 0; i < 365; i++) {
    const date = addDays(start, i);
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    const p = i / 364;
    const water = Math.min(1, i / 14) * 1.2;
    const fat = (cum[i] / cum[364]) * totalFat;
    const kg = 97 - water - fat + christmas(date) + (dow === 1 ? 0.45 : 0) + rnd() * 0.35;
    const early = i < 70;
    const mid = i >= 70 && i < 200;
    /** @type {any[]} */
    const food = [];
    // Frühstück: anfangs Gipfeli (wenig Protein), ab Woche 10 meist Skyr oder Eier
    food.push(meal(early && rnd() < 0.6 ? 'gipfeli' : rnd() < 0.5 ? 'skyr' : 'eier', rnd() * 0.05));
    // Mittag: anfangs freitags McDonald's, später selten
    const fastFood = dow === 5 && (early || (mid && rnd() > 0.7) || (!early && !mid && rnd() > 0.92));
    food.push(meal(fastFood ? 'mcdonalds' : early ? 'kantine' : rnd() < 0.5 ? 'kantineLeicht' : 'salat', rnd() * 0.06));
    // Zvieri
    food.push(meal(early && rnd() < 0.5 ? 'schoggi' : rnd() < 0.5 ? 'quark' : 'apfel', 0));
    // Znacht: anfangs gross und spät, später leichter und früher
    const big = early ? rnd() < 0.6 : weekend && rnd() < 0.25;
    food.push(
      meal(big ? (rnd() < 0.5 ? 'pizza' : 'pasta') : rnd() < 0.33 ? 'znachtLeicht' : rnd() < 0.5 ? 'linsen' : 'poulet', rnd() * 0.06),
    );
    if ((early && rnd() < 0.35) || (weekend && rnd() < 0.15)) food.push(meal(rnd() < 0.5 ? 'chips' : 'bier'));
    const weighed = rnd() > -0.8; // ca. 90 % der Tage gewogen
    s.days[date] = {
      ...(weighed ? { weightKg: Math.round(kg * 10) / 10 } : {}),
      steps: Math.round(5800 + p * 4200 + rnd() * 1500 + (weekend ? 1200 : 0)),
      sleepH: Math.round((6.4 + p * 0.9 + rnd() * 0.4) * 4) / 4,
      restingHr: Math.round(63 - p * 8 + rnd() * 1.5),
      waterMl: Math.round((1500 + p * 700 + rnd() * 250) / 250) * 250,
      ...(rnd() > -0.85 ? { complete: true } : {}),
      food,
    };
    // Training: ab Woche 3 Kraft Mo/Do, ab Monat 3 Laufen, ab Monat 6 Intervalle, ab Monat 8 lange Läufe
    if (i >= 14 && (dow === 1 || dow === 4)) {
      const base = 20 + Math.min(30, Math.floor(i / 14) * 1.5);
      const tpl = dow === 1 ? 'A' : 'B';
      s.workouts.push({
        id: uid(),
        date,
        kind: 'strength',
        template: tpl,
        sets: (tpl === 'A'
          ? ['beinpresse', 'rdl', 'brustpresse', 'kabelrudern']
          : ['goblet', 'latzug', 'schulterdruecken', 'hipthrust']
        ).flatMap((ex) => [0, 1, 2].map((k) => ({ ex, kg: ex === 'beinpresse' || ex === 'hipthrust' ? base * 2 : base, reps: 12 - k }))),
      });
    }
    if (i >= 60 && dow === 2)
      s.workouts.push({
        id: uid(),
        date,
        kind: 'run',
        runType: 'z2',
        minutes: Math.round(25 + p * 25),
        km: Math.round((3 + p * 4.5) * 10) / 10,
        avgHr: 142 - Math.round(p * 8),
      });
    if (i >= 180 && dow === 6) s.workouts.push({ id: uid(), date, kind: 'run', runType: 'interval', minutes: 35, km: 5.8, avgHr: 154 });
    if (i >= 240 && dow === 0)
      s.workouts.push({
        id: uid(),
        date,
        kind: 'run',
        runType: 'long',
        minutes: Math.round(50 + (i - 240) / 6),
        km: 8 + Math.round(((i - 240) / 40) * 10) / 10,
        avgHr: 138,
      });
  }
  // Diätpause nach 6 Monaten (2 Wochen Erhaltung) ist im Verlauf als Plateau sichtbar
  for (let m = 0; m <= 12; m++) {
    const d = addDays(start, Math.min(364, m * 30));
    s.waist.push({ id: uid(), date: d, cm: Math.round((112 - (15 * Math.min(364, m * 30)) / 364 + rnd() * 0.4) * 10) / 10 });
  }
  for (const [d, v] of [
    [0, 36],
    [90, 38],
    [180, 40],
    [270, 42],
    [355, 43],
  ])
    s.vo2max.push({ id: uid(), date: addDays(start, d), value: v });
  // Blutdruck: anfangs eine Woche, am Ende die letzten 7 Tage (je morgens und abends)
  for (const [from, sys, dia] of [
    [2, 142, 91],
    [358, 124, 79],
  ]) {
    for (let k = 0; k < 7; k++) {
      const date = addDays(start, from + k);
      s.bp.push({
        id: uid(),
        date,
        time: '07:10',
        sys: sys + Math.round(rnd() * 3),
        dia: dia + Math.round(rnd() * 2),
        pulse: 60,
        setting: 'home',
      });
      s.bp.push({
        id: uid(),
        date,
        time: '21:00',
        sys: sys - 3 + Math.round(rnd() * 3),
        dia: dia - 2 + Math.round(rnd() * 2),
        pulse: 62,
        setting: 'home',
      });
    }
  }
  /** @type {[string, number, number, string][]} */
  const labs = [
    ['hba1c', 6.0, 5.4, '%'],
    ['glucose', 6.3, 5.2, 'mmol/l'],
    ['ldl', 4.1, 3.2, 'mmol/l'],
    ['hdl', 1.0, 1.25, 'mmol/l'],
    ['tg', 2.3, 1.1, 'mmol/l'],
    ['apob', 1.25, 0.95, 'g/l'],
    ['alt', 52, 24, 'U/l'],
    ['ast', 35, 22, 'U/l'],
    ['platelets', 235, 240, 'G/l'],
    ['creatinine', 88, 85, 'µmol/l'],
  ];
  for (const [key, a, b, unit] of labs) {
    s.labs.push({ id: uid(), date: addDays(start, 5), key, value: a, unit });
    s.labs.push({ id: uid(), date: addDays(start, 350), key, value: b, unit });
  }
  s.stopBang = { s: true, t: false, o: false, p: true, n: true };
  if (daysBetween(start, today) !== 364) throw new Error('Vorführprofil: Datumsfehler');
  return s;
}
