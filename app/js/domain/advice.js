// @ts-check
// Ernährungsberatung im Alltag: Sporternährung, Warnzeichen für zu wenig Energie,
// Kaffee und Eisen, Vitamin D im Winter, Diätpause. Ergänzt die Hinweise aus coach.js.
//
// Quellen:
// - Sporternährung: Thomas DT et al., ACSM/AND/DC Joint Position Statement, Med Sci Sports
//   Exerc 2016;48:543–568 (Kohlenhydrate um intensive Einheiten, 30–60 g/h ab ca. 60–75 Min.,
//   Flüssigkeit nach Durst/Schweissverlust, 0.25–0.4 g/kg Protein nach dem Training).
// - Zu geringe Energieverfügbarkeit (RED-S): Mountjoy M et al., Br J Sports Med 2023;57:1073–1097.
// - Kaffee hemmt die Eisenaufnahme aus einer Mahlzeit um rund 40 %: Morck TA et al.,
//   Am J Clin Nutr 1983;37:416–420. Vitamin C fördert sie (Hallberg L et al., 1989).
// - Vitamin D: BAG/EEK (2012): Erwachsene 15 µg (600 IE) täglich, v. a. im Winterhalbjahr.
// - Diätpause: Byrne NM et al., Int J Obes 2018;42:129–138 (MATADOR, kleine Studie).

import { addDays, timeToMinutes } from './util.js';

/** @typedef {import('./coach.js').Hint} Hint */

/**
 * @param {{
 *   date: string,
 *   session: { kind: 'strength' | 'run' | 'rest', runType?: 'z2' | 'interval' | 'long', title: string },
 *   runsToday: { minutes: number, runType: string }[],
 *   ratePctPerWeek: number | null,
 *   rhrDelta: number | null,
 *   sleep7: number | null,
 *   deficit7: number | null,
 *   days: Record<string, import('../store.js').Day>,
 *   vitDSupplementUg: number,
 *   dietBreakUntil: string,
 *   startDate: string,
 *   maintenance: boolean,
 * }} s
 * @returns {Hint[]}
 */
export function nutritionAdvice(s) {
  /** @type {Hint[]} */
  const out = [];

  // Zu geringe Energieverfügbarkeit: mindestens zwei Warnzeichen gleichzeitig
  const signs = [];
  if (s.ratePctPerWeek !== null && s.ratePctPerWeek > 1) signs.push('schnelle Abnahme');
  if (s.rhrDelta !== null && s.rhrDelta >= 5) signs.push('erhöhter Ruhepuls');
  if (s.sleep7 !== null && s.sleep7 < 6.5) signs.push('wenig Schlaf');
  if (s.deficit7 !== null && s.deficit7 > 1000) signs.push(`Defizit über 1000 kcal`);
  if (signs.length >= 2) {
    out.push({
      id: 'red-s',
      severity: 'warn',
      title: 'Achtung: möglicherweise zu wenig Energie',
      text: `${signs.join(', ')}. Zusammen mit Training kann das auf zu geringe Energieverfügbarkeit hinweisen (Leistungsabfall, Infekte, Muskelabbau). Iss an Trainingstagen 200–400 kcal mehr, vor allem Kohlenhydrate um das Training. Hält es an oder sinkt die Leistung: ärztlich abklären.`,
    });
  }

  // Sporternährung am Trainingstag
  const longRun = s.runsToday.some((r) => r.minutes >= 75) || s.session.runType === 'long';
  const hard = s.runsToday.some((r) => r.runType === 'interval') || s.session.runType === 'interval';
  if (s.session.kind !== 'rest' || s.runsToday.length) {
    if (longRun) {
      out.push({
        id: 'fuel-long',
        severity: 'info',
        title: 'Langer Lauf: Energie und Trinken planen',
        text: '1–2 h vorher eine leichte Mahlzeit mit Kohlenhydraten (z. B. Brot mit Honig, Banane). Ab ca. 75 Minuten unterwegs 30–60 g Kohlenhydrate pro Stunde und nach Durst trinken, bei Hitze mit etwas Salz. Danach Protein (25–40 g) und Kohlenhydrate.',
      });
    } else if (hard || s.session.kind === 'strength') {
      out.push({
        id: 'fuel',
        severity: 'info',
        title: `${s.session.kind === 'strength' ? s.session.title : 'Intervalle'}: Kohlenhydrate dorthin legen`,
        text: 'Für intensive Einheiten 1–2 h vorher etwas mit Kohlenhydraten essen, danach eine Mahlzeit mit 25–40 g Protein. Das Kaloriendefizit eher an Ruhetagen setzen: So bleiben Leistung und Muskeln erhalten.',
      });
    }
  }

  // Kaffee direkt zum Essen an mindestens 3 der letzten 7 Tage
  let coffeeWithMeals = 0;
  for (let i = 0; i < 7; i++) {
    const d = s.days[addDays(s.date, -i)];
    if (!d?.caffeine?.length || !d.food?.length) continue;
    const meals = d.food.filter((f) => f.kcal >= 300).map((f) => timeToMinutes(f.time));
    if (d.caffeine.some((c) => meals.some((m) => Math.abs(timeToMinutes(c.time) - m) <= 45))) coffeeWithMeals++;
  }
  if (coffeeWithMeals >= 3) {
    out.push({
      id: 'coffee-iron',
      severity: 'info',
      title: 'Kaffee direkt zum Essen',
      text: `An ${coffeeWithMeals} der letzten 7 Tage gab es Kaffee innerhalb von 45 Minuten zu einer Mahlzeit. Das senkt die Eisenaufnahme deutlich (in Studien um rund 40 %). Besser: Kaffee mindestens 1 h vor oder nach dem Essen, dazu Vitamin C (Peperoni, Broccoli, Kiwi) zur Mahlzeit.`,
    });
  }

  // Vitamin D im Winterhalbjahr (Oktober bis März)
  const month = Number(s.date.slice(5, 7));
  if ((month >= 10 || month <= 3) && !(s.vitDSupplementUg > 0)) {
    out.push({
      id: 'vit-d',
      severity: 'info',
      title: 'Vitamin D im Winterhalbjahr',
      text: 'Von Oktober bis März bildet die Haut in der Schweiz kaum Vitamin D, über das Essen ist der Bedarf kaum zu decken. Das BAG empfiehlt Erwachsenen 15 µg (600 IE) täglich. Mit Hausärztin oder Hausarzt besprechen; wenn du ein Präparat nimmst, im Profil eintragen.',
    });
  }

  // Diätpause
  if (s.dietBreakUntil && s.dietBreakUntil >= s.date) {
    out.push({
      id: 'diet-break',
      severity: 'ok',
      title: `Diätpause bis ${s.dietBreakUntil.split('-').reverse().join('.')}`,
      text: 'Kalorienziel auf Erhaltung. Wiegen wie gewohnt; ein leichter Anstieg durch Glykogen und Wasser ist normal und kein Fett.',
    });
  } else if (
    !s.maintenance &&
    s.startDate &&
    addDays(s.startDate, 84) <= s.date &&
    (!s.dietBreakUntil || addDays(s.dietBreakUntil, 84) <= s.date)
  ) {
    out.push({
      id: 'diet-break-offer',
      severity: 'ok',
      title: 'Seit über 12 Wochen im Defizit',
      text: 'Eine geplante Diätpause von 1–2 Wochen auf Erhaltung kann Hunger und Motivation entlasten (Studienlage klein, aber ermutigend). Im Profil unter «Diätpause bis» eintragen; das Zieldatum verschiebt sich entsprechend.',
    });
  }

  return out;
}
