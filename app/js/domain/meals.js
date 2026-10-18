// @ts-check
// Essrhythmus: Verteilung von Energie und Protein über den Tag, Hunger und Auslöser pro
// Eintrag, und Muster hinter dem abendlichen Heisshunger.
//
// Protein: Pro Hauptmahlzeit etwa 0.4 g/kg bzw. 25–40 g maximiert die Muskelproteinsynthese
// (Schoenfeld & Aragon, J Int Soc Sports Nutr 2018). Mehr Protein und Energie in der ersten
// Tageshälfte sättigt und reduziert abendliches Essen (Leidy et al., Am J Clin Nutr 2015).

import { addDays, timeToMinutes } from './util.js';

/** @typedef {import('../store.js').FoodEntry} FoodEntry */
/** @typedef {import('../store.js').Day} Day */
/** @typedef {'hunger' | 'stress' | 'muede' | 'gewohnheit' | 'langeweile' | 'gesellschaft' | 'belohnung'} Trigger */

export const TRIGGERS = /** @type {const} */ ([
  ['hunger', 'Hunger'],
  ['stress', 'Stress'],
  ['muede', 'Müdigkeit'],
  ['gewohnheit', 'Gewohnheit'],
  ['langeweile', 'Langeweile'],
  ['gesellschaft', 'Gesellschaft'],
  ['belohnung', 'Belohnung'],
]);

export const HUNGER = /** @type {const} */ ([
  [1, 'kaum'],
  [2, 'mittel'],
  [3, 'stark'],
]);

/** Was gegen den jeweiligen Auslöser hilft (verhaltenstherapeutische Standardstrategien). */
export const TRIGGER_TIPS = /** @type {Record<Trigger, string>} */ ({
  hunger:
    'Echter Hunger am Abend heisst meist: zu wenig tagsüber. Mittags 40 g Protein und viel Gemüse, um 16 Uhr ein Zvieri mit Protein (z. B. Skyr).',
  stress:
    'Bei Stress hilft eine kurze Pause vor dem Essen: 10 Minuten gehen, Atemübung oder Musik. Danach entscheiden, ob du wirklich Hunger hast.',
  muede:
    'Müdigkeit steigert den Appetit nachweislich. Früher ins Bett ist hier die wirksamste «Diät»; Bildschirm eine Stunde vorher weglegen.',
  gewohnheit:
    'Gewohnheiten brauchen einen neuen Ablauf: nach dem Znacht Zähne putzen, Küche schliessen, Tee machen. Nichts Süsses sichtbar lagern.',
  langeweile:
    'Langeweile-Essen passiert nebenbei: Abends feste Beschäftigung planen (Spaziergang, Telefonat, Hobby) und nur am Tisch essen.',
  gesellschaft:
    'In Gesellschaft: vorher entscheiden, was und wie viel du isst, kleinen Teller nehmen, Wasser dazu. Ein geplanter Genuss ist kein Ausrutscher.',
  belohnung:
    'Belohnungen ohne Essen sammeln: etwas, auf das du dich freust (Serie, Bad, Musik). Wenn Essen, dann bewusst, langsam und portioniert.',
});

/** Tagesabschnitte (Schweizer Mahlzeiten). */
const SLOTS = /** @type {const} */ ([
  ['zmorge', 'Morgen', 0, 630],
  ['zmittag', 'Mittag', 630, 840],
  ['zvieri', 'Nachmittag', 840, 1050],
  ['znacht', 'Abend', 1050, 1260],
  ['spaet', 'Spät', 1260, 1441],
]);

/**
 * Energie und Protein pro Tagesabschnitt.
 * @param {FoodEntry[]} food
 */
export function mealSlots(food) {
  return SLOTS.map(([id, label, from, to]) => {
    const items = food.filter((f) => {
      const m = timeToMinutes(f.time);
      return m >= from && m < to;
    });
    return {
      id,
      label,
      kcal: items.reduce((a, f) => a + f.kcal, 0),
      protein: items.reduce((a, f) => a + f.protein, 0),
      n: items.length,
    };
  });
}

/**
 * Protein pro Hauptmahlzeit bewerten: Ziel 30 g (bzw. 0.4 g/kg), abhängig vom Zielgewicht.
 * @param {FoodEntry[]} food
 * @param {number} refWeightKg
 */
export function proteinPerMeal(food, refWeightKg) {
  const target = Math.max(25, Math.min(40, Math.round(refWeightKg * 0.4)));
  const slots = mealSlots(food).filter((s) => s.kcal >= 250);
  return { target, slots: slots.map((s) => ({ ...s, ok: s.protein >= target })) };
}

/**
 * @param {Day | undefined} d
 */
function eveningShare(d) {
  const food = d?.food ?? [];
  const total = food.reduce((a, f) => a + f.kcal, 0);
  if (!total) return null;
  const evening = food.filter((f) => timeToMinutes(f.time) >= 18 * 60).reduce((a, f) => a + f.kcal, 0);
  return evening / total;
}

/**
 * @typedef {{ id: string, text: string, withRate: number, withoutRate: number, nWith: number, nWithout: number }} Insight
 */

/**
 * Muster hinter abendlichem Mehr-Essen in den letzten 28 Tagen: Vergleich von Tagen mit
 * und ohne möglichen Einflussfaktor. Nur vollständig erfasste Tage; ein Faktor wird erst
 * genannt, wenn beide Gruppen mindestens 3 Tage haben und der Unterschied ≥ 25 Prozent-
 * punkte beträgt. Das sind Zusammenhänge im eigenen Alltag, keine Beweise.
 * @param {Record<string, Day>} days
 * @param {string} date
 * @param {number} proteinTarget
 */
export function cravingPatterns(days, date, proteinTarget) {
  /** @type {{ high: boolean, sleepShort: boolean | null, lowProteinEarly: boolean, skippedLunch: boolean, coffeeHigh: boolean }[]} */
  const rows = [];
  for (let i = 1; i <= 28; i++) {
    const iso = addDays(date, -i);
    const d = days[iso];
    if (!d?.complete || !d.food?.length) continue;
    const share = eveningShare(d);
    if (share === null) continue;
    const early = d.food.filter((f) => timeToMinutes(f.time) < 15 * 60);
    const lunch = d.food.filter((f) => {
      const m = timeToMinutes(f.time);
      return m >= 630 && m < 840;
    });
    rows.push({
      high: share >= 0.5,
      sleepShort: typeof d.sleepH === 'number' ? d.sleepH < 6.5 : null,
      lowProteinEarly: early.reduce((a, f) => a + f.protein, 0) < proteinTarget * 0.35,
      skippedLunch: lunch.reduce((a, f) => a + f.kcal, 0) < 300,
      coffeeHigh: (d.caffeine ?? []).reduce((a, c) => a + c.mg, 0) >= 400,
    });
  }
  const highDays = rows.filter((r) => r.high).length;
  /** @type {[keyof typeof rows[number], string, string][]} */
  const factors = [
    ['sleepShort', 'weniger als 6.5 h Schlaf', 'Schlaf'],
    ['lowProteinEarly', `weniger als ${Math.round(proteinTarget * 0.35)} g Protein bis 15 Uhr`, 'Protein am Tag'],
    ['skippedLunch', 'kaum Mittagessen', 'Mittagessen'],
    ['coffeeHigh', 'mehr als 400 mg Koffein', 'Koffein'],
  ];
  /** @type {Insight[]} */
  const insights = [];
  for (const [key, label] of factors) {
    const withF = rows.filter((r) => r[key] === true);
    const withoutF = rows.filter((r) => r[key] === false);
    if (withF.length < 3 || withoutF.length < 3) continue;
    const a = withF.filter((r) => r.high).length / withF.length;
    const b = withoutF.filter((r) => r.high).length / withoutF.length;
    if (a - b >= 0.25) {
      insights.push({
        id: String(key),
        text: `An Tagen mit ${label} hast du an ${withF.filter((r) => r.high).length} von ${withF.length} Tagen mehr als die Hälfte der Kalorien abends gegessen, sonst an ${withoutF.filter((r) => r.high).length} von ${withoutF.length}.`,
        withRate: a,
        withoutRate: b,
        nWith: withF.length,
        nWithout: withoutF.length,
      });
    }
  }
  insights.sort((x, y) => y.withRate - y.withoutRate - (x.withRate - x.withoutRate));

  // Auslöser abends (ab 18 Uhr, ohne Hauptmahlzeit-Hunger)
  /** @type {Record<string, number>} */
  const triggers = {};
  let tagged = 0;
  let hungerStrong = 0;
  for (let i = 0; i < 28; i++) {
    for (const f of days[addDays(date, -i)]?.food ?? []) {
      if (timeToMinutes(f.time) < 18 * 60) continue;
      if (f.trigger) {
        triggers[f.trigger] = (triggers[f.trigger] ?? 0) + 1;
        tagged++;
      }
      if (f.hunger === 3) hungerStrong++;
    }
  }
  const top = Object.entries(triggers)
    .sort((x, y) => y[1] - x[1])
    .map(([id, n]) => ({ id: /** @type {Trigger} */ (id), n, share: n / Math.max(tagged, 1) }));
  return { days: rows.length, highDays, insights, triggers: top, tagged, hungerStrong, enough: rows.length >= 7 };
}
