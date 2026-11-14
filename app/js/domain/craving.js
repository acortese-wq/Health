// @ts-check
// Heisshunger-Notfall: vier kurze Fragen, danach ein passender Plan.
//
// Belege und Einordnung:
// - Verlangen kommt in Wellen und klingt meist innert 10–20 Minuten ab; «Urge Surfing» (beobachten statt
//   nachgeben) senkt das Nachgeben (Bowen S, Marlatt GA, Psychol Addict Behav 2009;23:666–671; für Essen:
//   Lacaille J et al., Eat Behav 2014;15:509–512).
// - Körperlicher und emotionaler Hunger lassen sich mit Faustregeln unterscheiden (Apfel-Test, Zeit seit
//   der letzten Mahlzeit); das ist eine Hilfe aus der Ernährungsberatung, keine Messung.
// - Protein sättigt am stärksten pro Kalorie (Leidy HJ et al., Am J Clin Nutr 2015;101:1320S–1329S).
// - Kurze Bewegung (15 Minuten zügig gehen) reduziert das Verlangen nach Süssem
//   (Ledochowski L et al., PLoS One 2015;10:e0119278).
// - Auslöser-spezifische Strategien: siehe domain/emotional.js.

import { STRATEGIES } from './emotional.js';

/**
 * @typedef {'unter2' | '2bis4' | 'ueber4'} LastMeal
 * @typedef {import('./meals.js').Trigger | 'nichts'} CravingTrigger
 * @typedef {{ lastMeal: LastMeal, apple: boolean, trigger: CravingTrigger, intensity: number }} CravingAnswers
 * @typedef {{ kind: 'hunger' | 'unklar' | 'emotional', title: string, lead: string, steps: string[], snacks: string[], timerMin: number, refs: string[] }} CravingPlan
 * @typedef {{ id: string, time: string, trigger: CravingTrigger, intensity: number, after?: number, outcome?: 'geschafft' | 'bewusst' }} CravingLog
 */

/** Die vier Fragen (Reihenfolge = Ablauf). */
export const QUESTIONS = /** @type {const} */ ([
  {
    id: 'lastMeal',
    text: 'Wann hast du zuletzt richtig gegessen?',
    options: [
      ['unter2', 'Vor weniger als 2 Stunden'],
      ['2bis4', 'Vor 2 bis 4 Stunden'],
      ['ueber4', 'Vor mehr als 4 Stunden'],
    ],
  },
  {
    id: 'apple',
    text: 'Würdest du jetzt auch einen Apfel oder ein Joghurt essen?',
    options: [
      ['ja', 'Ja, Hauptsache etwas'],
      ['nein', 'Nein, ich will etwas Bestimmtes'],
    ],
  },
  {
    id: 'trigger',
    text: 'Was ist gerade los?',
    options: [
      ['stress', 'Stress'],
      ['langeweile', 'Langeweile'],
      ['tv', 'Fernseher/Handy'],
      ['muede', 'Müde'],
      ['frust', 'Frust/Traurig'],
      ['gewohnheit', 'Gewohnheit/Uhrzeit'],
      ['belohnung', 'Will mich belohnen'],
      ['nichts', 'Nichts davon'],
    ],
  },
  { id: 'intensity', text: 'Wie stark ist das Verlangen gerade?', options: [] },
]);

/**
 * Plan aus den Antworten.
 * @param {CravingAnswers} a
 * @param {{ kcalLeft: number, hour: number }} ctx
 * @returns {CravingPlan}
 */
export function cravingPlan(a, { kcalLeft, hour }) {
  const strategy = a.trigger !== 'nichts' && a.trigger !== 'hunger' ? STRATEGIES[a.trigger] : null;
  const refs = ['Bowen & Marlatt 2009 (Urge Surfing)'];
  // Proteinreiche, kleine Snacks; bei knappem Budget nur die leichtesten
  const snacks =
    kcalLeft < 150
      ? ['Grosses Glas Wasser oder ungesüsster Tee', 'Gurke, Rüebli oder Cherrytomaten', 'Bouillon (1 Tasse)']
      : [
          'Skyr oder Magerquark (150 g, ca. 100 kcal, 16 g Protein)',
          'Hüttenkäse mit Gurke (150 g, ca. 140 kcal)',
          '1–2 hart gekochte Eier (80–160 kcal)',
          'Apfel mit 10 Mandeln (ca. 140 kcal)',
        ];
  const late = hour >= 21;
  // Körperlicher Hunger: lange nichts gegessen und offen für «irgendwas»
  if (a.apple && a.lastMeal !== 'unter2') {
    refs.push('Leidy 2015 (Protein und Sättigung)');
    return {
      kind: 'hunger',
      title: 'Das ist echter Hunger. Iss jetzt, aber gezielt.',
      lead: 'Hunger auszuhalten macht den nächsten Heisshunger nur stärker. Eine kleine, proteinreiche Zwischenmahlzeit hilft am besten.',
      steps: [
        'Eine Portion aus der Liste unten auf einen Teller, Packung wegräumen.',
        'Am Tisch und ohne Bildschirm essen, langsam.',
        late ? 'Danach Küche schliessen und Zähne putzen: Das Signal «fertig gegessen» hilft.' : 'Nächste Mahlzeit nicht ausfallen lassen.',
      ],
      snacks,
      timerMin: 0,
      refs,
    };
  }
  // Unklar: offen für «irgendwas», aber gerade gegessen
  if (a.apple) {
    return {
      kind: 'unklar',
      title: 'Wahrscheinlich kein echter Hunger. Gib dir 10 Minuten.',
      lead: 'Du hast vor kurzem gegessen. Durst, Müdigkeit oder Gewohnheit fühlen sich oft wie Hunger an.',
      steps: [
        'Ein grosses Glas Wasser oder Tee trinken.',
        strategy?.now ?? 'Kurz etwas anderes tun: aufstehen, ein paar Schritte gehen, Fenster öffnen.',
        'Nach dem Timer neu entscheiden. Ist der Hunger noch da: eine kleine Portion aus der Liste.',
      ],
      snacks,
      timerMin: 10,
      refs: strategy ? [...refs, strategy.ref] : refs,
    };
  }
  // Emotional: Lust auf etwas Bestimmtes
  const strong = a.intensity >= 7;
  return {
    kind: 'emotional',
    title: strong
      ? 'Starkes Verlangen. Es ist eine Welle, und sie geht vorbei.'
      : 'Das ist Lust, kein Hunger. Lass die Welle vorbeiziehen.',
    lead: 'Verlangen steigt, erreicht einen Höhepunkt und klingt meist nach 10 bis 20 Minuten ab. Du musst nichts tun ausser es kommen und gehen lassen.',
    steps: [
      strategy?.now ?? 'Raum wechseln und 10 Minuten etwas mit den Händen tun.',
      strong
        ? '15 Minuten zügig gehen: Das senkt das Verlangen nach Süssem nachweislich.'
        : 'Ein Glas Wasser trinken, ein paar tiefe Atemzüge mit langem Ausatmen.',
      'Das Verlangen beobachten statt bekämpfen: Wo spürst du es? Wie stark ist es jetzt, auf einer Skala von 1 bis 10?',
      'Wenn du danach trotzdem isst: eine kleine Portion bewusst auf einem Teller geniessen, ohne schlechtes Gewissen. Ein Snack ist kein Rückfall.',
    ],
    snacks: [],
    timerMin: strong ? 15 : 10,
    refs: strategy ? [...refs, strategy.ref, ...(strong ? ['Ledochowski 2015 (Gehen gegen Süsshunger)'] : [])] : refs,
  };
}

/**
 * Bilanz der letzten Tage für Motivation («3 von 4 Heisshunger-Momenten überstanden»).
 * @param {Record<string, { cravings?: CravingLog[] }>} days
 * @param {string[]} dates
 */
export function cravingStats(dates, days) {
  const logs = dates.flatMap((d) => days[d]?.cravings ?? []);
  const done = logs.filter((l) => l.outcome === 'geschafft').length;
  const drops = logs.filter((l) => typeof l.after === 'number').map((l) => l.intensity - /** @type {number} */ (l.after));
  return {
    n: logs.length,
    done,
    avgDrop: drops.length ? Math.round((drops.reduce((a, v) => a + v, 0) / drops.length) * 10) / 10 : null,
  };
}

/** Arten, aus denen die praktischen Ideen gezogen werden (Fakten kommen separat dazu). */
const ACTION_KINDS = /** @type {const} */ (['ablenkung', 'bewegung', 'trinken', 'kopf', 'umgebung']);

/**
 * Ideen ziehen, ohne zu wiederholen: zwei praktische Ideen aus verschiedenen Arten und ein Fakt.
 * Passende Ideen (Auslöser, Abend) haben Vorrang. Sind alle Ideen einer Art gesehen, beginnt die Art von vorn.
 * @param {import('../data/cravingtips.js').CravingTip[]} tips
 * @param {{ seen: Iterable<string>, trigger?: string, hour?: number, rng?: () => number, actions?: number }} o
 * @returns {{ tips: import('../data/cravingtips.js').CravingTip[], seen: string[] }}
 */
export function pickTips(tips, { seen, trigger = '', hour = 12, rng = Math.random, actions = 2 }) {
  const used = new Set(seen);
  const tags = new Set([trigger, ...(hour >= 19 || hour < 5 ? ['abend'] : []), ...(hour >= 8 && hour < 18 ? ['buero'] : [])]);
  /** @param {(t: import('../data/cravingtips.js').CravingTip) => boolean} ok */
  const pool = (ok) => {
    let list = tips.filter((t) => ok(t) && !used.has(t.id));
    if (!list.length) {
      // Alle gesehen: diese Art wieder freigeben
      for (const t of tips) if (ok(t)) used.delete(t.id);
      list = tips.filter(ok);
    }
    return list;
  };
  /** @param {import('../data/cravingtips.js').CravingTip[]} list */
  const draw = (list) => {
    const fit = list.filter((t) => t.tags?.some((g) => tags.has(g)));
    // Passende Idee mit 60 % Wahrscheinlichkeit bevorzugen, sonst Abwechslung
    const from = fit.length && rng() < 0.6 ? fit : list;
    return from[Math.floor(rng() * from.length)];
  };
  /** @type {import('../data/cravingtips.js').CravingTip[]} */
  const out = [];
  const kinds = [...ACTION_KINDS].sort(() => rng() - 0.5);
  for (const kind of kinds) {
    if (out.length >= actions) break;
    const t = draw(pool((x) => x.kind === kind));
    if (t) {
      out.push(t);
      used.add(t.id);
    }
  }
  const fact = draw(pool((x) => x.kind === 'fakt'));
  if (fact) {
    out.push(fact);
    used.add(fact.id);
  }
  return { tips: out, seen: [...used] };
}
