// @ts-check
// Trink-Motivation: Soll-Menge im Tagesverlauf und wechselnde, belegte Fakten.
// Quellen: EFSA NDA Panel, EFSA Journal 2010;8(3):1459 (Bedarf); Adan A, J Am Coll Nutr
// 2012;31:71–78 (ab ca. 2 % Flüssigkeitsverlust leiden Konzentration und Leistung);
// Dennis EA et al., Obesity 2010;18:300–307 (Wasser vor den Mahlzeiten).

/** Wachzeit, über die das Trinkziel verteilt wird. */
const DAY_START = 7 * 60;
const DAY_END = 21 * 60;

/**
 * Wo stehe ich heute im Vergleich zu einer gleichmässigen Verteilung über den Tag?
 * @param {{ ml: number, target: number, minutes: number, isToday: boolean }} p minutes = Uhrzeit in Minuten
 * @returns {{ expected: number, status: 'done' | 'ontrack' | 'behind' | 'past', message: string }}
 */
export function waterPace({ ml, target, minutes, isToday }) {
  if (ml >= target) return { expected: target, status: 'done', message: 'Trinkziel erreicht. Stark!' };
  if (!isToday) return { expected: target, status: 'past', message: `Es fehlten ${Math.round(target - ml)} ml zum Ziel.` };
  const share = Math.min(Math.max((minutes - DAY_START) / (DAY_END - DAY_START), 0), 1);
  const expected = Math.round((target * share) / 50) * 50;
  const gap = expected - ml;
  if (gap >= 300) {
    const glasses = Math.ceil(gap / 250);
    return {
      expected,
      status: 'behind',
      message: `Bis jetzt wären etwa ${expected} ml ideal. ${glasses === 1 ? 'Ein Glas' : `${glasses} Gläser`} jetzt, und du bist wieder im Plan.`,
    };
  }
  return {
    expected,
    status: 'ontrack',
    message: ml > 0 ? 'Gut im Plan. Weiter so, Schluck für Schluck.' : 'Starte mit einem Glas Wasser.',
  };
}

const FACTS = [
  'Schon rund 2 % Flüssigkeitsverlust können Konzentration und Leistung messbar senken, auf der Baustelle schnell erreicht.',
  'Ein grosses Glas Wasser vor dem Essen hilft beim Sattwerden. In Studien nahmen Personen damit etwas mehr ab.',
  'Wasser hat 0 kcal. Ein halber Liter Süssgetränk hat rund 200 kcal, so viel wie dein 16-Uhr-Snack.',
  'Bei Hitze, Sport und körperlicher Arbeit steigt der Bedarf deutlich, oft um einen Liter oder mehr.',
  'Ein einfacher Test: Hellgelber Urin heisst gut getrunken. Dunkelgelb heisst: Jetzt ein Glas.',
  'Müdigkeit am Nachmittag ist oft auch Durst. Ein Glas Wasser vor dem nächsten Kaffee lohnt sich.',
];

/**
 * Ein Fakt pro Tag (stabil, wechselt täglich).
 * @param {string} date
 */
export function waterFact(date) {
  const n = date.split('-').reduce((a, x) => a + Number(x), 0);
  return FACTS[n % FACTS.length];
}
