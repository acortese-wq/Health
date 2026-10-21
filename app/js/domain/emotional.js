// @ts-check
// Emotionales Essen: Essen ohne körperlichen Hunger, ausgelöst durch Stress, Langeweile,
// Fernseher/Handy, Müdigkeit, Frust, Gewohnheit oder Gesellschaft. Ausgewertet werden die
// Notizen «Hunger vorher» und «Grund» der Einträge.
//
// Belege:
// - Robinson E et al., Am J Clin Nutr 2013;97:728–742: Ablenkung beim Essen (z. B. Fernseher)
//   erhöht die Menge bei der Mahlzeit und später am Tag; aufmerksames Essen senkt sie.
// - Adam TC, Epel ES, Physiol Behav 2007;91:449–458: Stress verstärkt das Verlangen nach
//   energiereichem, schmackhaftem Essen (Cortisol, Belohnungssystem).
// - Moynihan AB et al., Front Psychol 2015;6:369: Langeweile steigert das Essen, vor allem von Ungesundem.
// - Greer SM et al., Nat Commun 2013;4:2259: Schlafmangel verstärkt die Reaktion des Gehirns auf
//   kalorienreiches Essen.
// - Katterman SN et al., Eat Behav 2014;15:197–204: Achtsamkeits-Training reduziert Essanfälle
//   und emotionales Essen (Übersichtsarbeit).
// - Forman EM et al., Obesity 2016;24:2050–2056: Akzeptanz-basierte Verhaltenstherapie
//   verbessert den Gewichtsverlust, vor allem bei starker Reaktion auf Essensreize.

import { addDays } from './util.js';

/** @typedef {import('./meals.js').Trigger} Trigger */

/** Auslöser, die nicht körperlicher Hunger sind. */
export const EMOTIONAL = /** @type {const} */ (['stress', 'langeweile', 'tv', 'muede', 'frust', 'gewohnheit', 'belohnung', 'gesellschaft']);

/** Strategie und Beleg je Auslöser. */
export const STRATEGIES = /** @type {Record<Exclude<Trigger, 'hunger'>, { now: string, plan: string, ref: string }>} */ ({
  stress: {
    now: '10 Minuten raus: kurzer Spaziergang, 5 tiefe Atemzüge (lang aus), Wasser trinken. Danach neu entscheiden.',
    plan: 'Stressmomente vorhersehen (z. B. nach der Arbeit) und einen proteinreichen Zvieri einplanen, damit du nicht ausgehungert in den Stress kommst.',
    ref: 'Adam TC, Epel ES, Physiol Behav 2007;91:449–458',
  },
  langeweile: {
    now: 'Etwas mit den Händen tun: aufräumen, Telefonat, kurze Runde ums Haus. Langeweile-Hunger geht nach 10–15 Minuten meist vorbei.',
    plan: 'Abende mit fester Beschäftigung planen. Essen nur am Tisch, nicht «zwischendurch».',
    ref: 'Moynihan AB et al., Front Psychol 2015;6:369',
  },
  tv: {
    now: 'Portion auf einen Teller, Packung zurück in den Schrank. Oder: Tee, Wasser mit Zitrone, Kaugummi.',
    plan: 'Mahlzeiten nur am Tisch ohne Bildschirm. Abends keine Snacks in Griffweite des Sofas lagern.',
    ref: 'Robinson E et al., Am J Clin Nutr 2013;97:728–742',
  },
  muede: {
    now: 'Müdigkeit fühlt sich wie Hunger an. Ein Glas Wasser, 10 Minuten Tageslicht oder früh ins Bett.',
    plan: 'Schlaf priorisieren: feste Aufstehzeit, Bildschirm 30–60 Min. vor dem Schlafen weg.',
    ref: 'Greer SM et al., Nat Commun 2013;4:2259',
  },
  frust: {
    now: 'Gefühl benennen («Ich bin frustriert»), dann etwas tun, das wirklich hilft: jemanden anrufen, rausgehen, aufschreiben.',
    plan: 'Häufen sich solche Momente, hilft ein Gespräch mit Hausärztin, Ernährungsberatung oder Psychotherapie. Achtsamkeits-Programme senken emotionales Essen nachweislich.',
    ref: 'Katterman SN et al., Eat Behav 2014;15:197–204',
  },
  gewohnheit: {
    now: 'Kurz innehalten: Habe ich gerade Hunger, oder ist es nur die Uhrzeit?',
    plan: 'Neuen Ablauf setzen: nach dem Znacht Zähne putzen, Küche schliessen, Tee machen. Süsses nicht sichtbar lagern.',
    ref: 'Forman EM et al., Obesity 2016;24:2050–2056',
  },
  belohnung: {
    now: 'Wenn schon, dann bewusst: kleine Portion auf einen Teller, langsam und ohne Bildschirm geniessen.',
    plan: 'Belohnungen ohne Essen sammeln: Serie, Bad, Musik, etwas Schönes kaufen.',
    ref: 'Forman EM et al., Obesity 2016;24:2050–2056',
  },
  gesellschaft: {
    now: 'Vorher entscheiden, was und wie viel. Kleiner Teller, Wasser zu jedem Glas, langsam essen.',
    plan: 'Ein geplanter Genuss ist kein Ausrutscher. Am nächsten Tag normal weitermachen, nicht kompensieren.',
    ref: 'Robinson E et al., Am J Clin Nutr 2014;100:123–151 (Essgeschwindigkeit)',
  },
});

/**
 * Hunger-Check vor dem Essen: körperlicher und emotionaler Hunger unterscheiden.
 * Bewährte Unterscheidung aus der Ernährungsberatung (Faustregeln, keine Messung).
 */
export const HUNGER_CHECK = /** @type {const} */ ([
  ['Kommt langsam, Magen knurrt, letzte Mahlzeit vor 3–5 Stunden', 'Kommt plötzlich, Lust auf etwas Bestimmtes (Süsses, Salziges)'],
  ['Viele Lebensmittel wären recht, auch Gemüse oder ein Apfel', 'Nur ein bestimmtes Essen hilft'],
  ['Hört auf, wenn du satt bist', 'Geht weiter über satt hinaus, oft nebenbei'],
  ['Danach zufrieden', 'Danach oft schlechtes Gewissen'],
]);

/**
 * @typedef {{ trigger: Trigger, n: number, kcal: number }} TriggerStat
 */

/**
 * Auswertung der letzten Tage: wie oft und mit wie viel Energie ohne Hunger gegessen wurde.
 * @param {Record<string, import('../store.js').Day>} days
 * @param {string} date
 * @param {number} [span]
 */
export function emotionalSummary(days, date, span = 28) {
  /** @type {Map<Trigger, TriggerStat>} */
  const by = new Map();
  let entries = 0;
  let tagged = 0;
  let noHunger = 0;
  let noHungerKcal = 0;
  let emotionalKcal = 0;
  let evening = 0;
  for (let i = 0; i < span; i++) {
    for (const f of days[addDays(date, -i)]?.food ?? []) {
      if (f.kcal < 50) continue;
      entries++;
      if (f.trigger || f.hunger) tagged++;
      if (f.hunger === 1) {
        noHunger++;
        noHungerKcal += f.kcal;
      }
      // Nur ohne nennenswerten Hunger zählt es als emotional (mittlerer oder starker Hunger = echte Mahlzeit)
      if (f.trigger && f.trigger !== 'hunger' && (f.hunger === undefined || f.hunger === 1)) {
        const s = by.get(f.trigger) ?? { trigger: f.trigger, n: 0, kcal: 0 };
        s.n++;
        s.kcal += f.kcal;
        by.set(f.trigger, s);
        emotionalKcal += f.kcal;
        if (f.time >= '18:00') evening++;
      }
    }
  }
  const top = [...by.values()].sort((a, b) => b.kcal - a.kcal);
  const emotionalN = top.reduce((a, s) => a + s.n, 0);
  return {
    span,
    entries,
    tagged,
    taggedShare: entries ? tagged / entries : 0,
    noHunger,
    noHungerKcal,
    emotionalN,
    emotionalKcal,
    perWeekKcal: Math.round((emotionalKcal / span) * 7),
    eveningShare: emotionalN ? evening / emotionalN : 0,
    top,
    // Viele Frust-Einträge: behutsamer Hinweis auf professionelle Unterstützung
    supportHint: (by.get('frust')?.n ?? 0) >= 4,
    enough: tagged >= 5,
  };
}
