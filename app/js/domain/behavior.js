// @ts-check
// Verhaltens-Check: wertet die Einträge der letzten 14 Tage kritisch aus und nennt, was
// besser ginge, mit wissenschaftlicher Begründung. Grundsatz: Für das Gewicht zählt die
// Energiebilanz; Zeitpunkt, Verteilung und Lebensmittelwahl wirken vor allem über Hunger,
// Sättigung und die Menge, die man insgesamt isst. Die Texte sagen das ehrlich dazu.
//
// Belege:
// - Hall KD et al., Cell Metab 2019;30:67–77: Stark verarbeitete Kost → ca. 500 kcal/Tag mehr gegessen.
// - Ello-Martin JA et al., Am J Clin Nutr 2007;85:1465–1477: geringere Energiedichte (Gemüse, Obst) → mehr Gewichtsverlust.
// - Jakubowicz D et al., Obesity 2013;21:2504–2512: grosses Frühstück statt grosses Abendessen → mehr Gewichtsverlust.
// - Ruddick-Collins LC et al., Cell Metab 2022;34:1472–1485: gleicher Energieverbrauch, aber weniger Hunger mit grossem Frühstück.
// - Gu C et al., J Clin Endocrinol Metab 2020;105:2789–2802: spätes Abendessen → höherer Blutzucker, weniger Fettverbrennung in der Nacht.
// - Leidy HJ et al., Am J Clin Nutr 2013;97:677–688: proteinreiches Frühstück → weniger Hunger und Abend-Snacks.
// - Mamerow MM et al., J Nutr 2014;144:876–880: Protein gleichmässig verteilt → höhere Muskelproteinsynthese.
// - Malik VS et al., Am J Clin Nutr 2013;98:1084–1102: Süssgetränke → Gewichtszunahme.
// - Te Morenga L et al., BMJ 2013;346:e7492: Zucker beeinflusst das Gewicht über die Energiezufuhr.
// - Traversy G, Chaput JP, Curr Obes Rep 2015;4:122–130: Alkohol und Gewicht (v. a. bei regelmässig grösseren Mengen).
// - Racette SB et al., Obesity 2008;16:1826–1830: Wochenende → mehr Energiezufuhr, Abnahme stockt.

import { addDays } from './util.js';

/**
 * @typedef {import('../store.js').FoodEntry} FoodEntry
 * @typedef {import('../store.js').Day} Day
 * @typedef {'alert' | 'warn' | 'info' | 'ok'} Severity
 * @typedef {{ date: string, time: string, name: string, kcal: number, alt?: string, altKcal?: number }} Example
 * @typedef {{ id: string, severity: Severity, title: string, text: string, better: string, ref: string, examples: Example[] }} Finding
 */

/**
 * Bessere Wahl für typische Kalorienfallen (Richtwerte, Schätzung).
 * @type {{ id: string, re: RegExp, alt: string, altKcal: number, upf: boolean }[]}
 */
export const SWAPS = [
  {
    id: 'burger',
    re: /mc ?donald|big ?mac|mcchicken|mcmenu|burger ?king|\bkfc\b|cheeseburger|hamburger|burger/i,
    alt: 'Salat mit grilliertem Poulet (gibt es auch bei McDonald’s) und Wasser',
    altKcal: 400,
    upf: true,
  },
  { id: 'pommes', re: /pommes(?!-chips)|frites|fries/i, alt: 'Beilagensalat statt Pommes', altKcal: 60, upf: true },
  {
    id: 'pizza',
    re: /pizza/i,
    alt: 'Halbe Pizza mit Gemüse und grossem Salat, die andere Hälfte für morgen',
    altKcal: 550,
    upf: false,
  },
  {
    id: 'doener',
    re: /d[öo]ner|kebab|d[üu]r[üu]m/i,
    alt: 'Döner-Teller mit viel Salat, ohne Pommes, Joghurtsauce statt Mayo',
    altKcal: 600,
    upf: false,
  },
  {
    id: 'softdrink',
    re: /\bcola\b(?!\s*(zero|light))|fanta|sprite|eistee|ice ?tea|rivella rot|limonade|energy ?drink|red ?bull|\bsaft\b|orangensaft/i,
    alt: 'Wasser, Mineral, Rivella blau, Cola Zero oder ungesüsster Tee',
    altKcal: 5,
    upf: true,
  },
  { id: 'chips', re: /chips|nachos|flips/i, alt: 'Gemüsesticks mit Hummus oder eine Handvoll Popcorn', altKcal: 120, upf: true },
  {
    id: 'gebaeck',
    re: /gipfeli|croissant|nussgipfel|berliner|donut|muffin|schoggiweggli/i,
    alt: 'Vollkornbrot mit Hüttenkäse oder Skyr mit Beeren (mehr Protein, satt bis Mittag)',
    altKcal: 220,
    upf: true,
  },
  {
    id: 'suess',
    re: /schoggi|schokolade|praline|glace|ice ?cream|kuchen|torte|cookie|guetzli|kekse|gummib|haribo|snickers|mars\b|twix|kitkat/i,
    alt: '20 g dunkle Schokolade bewusst geniessen oder Beeren mit Skyr',
    altKcal: 110,
    upf: true,
  },
  {
    id: 'alkohol',
    re: /\bbier\b|lager|\bwein\b|prosecco|ap[ée]ro|aperol|spritz|cocktail|whisky|vodka|gin\b/i,
    alt: 'Alkoholfreies Bier oder Mineral mit Zitrone; Alkohol höchstens an 1–2 Tagen pro Woche',
    altKcal: 60,
    upf: false,
  },
  {
    id: 'wurst',
    re: /bratwurst|cervelat|currywurst|hot ?dog|salami|wienerli|fleischkäse|leberkäse/i,
    alt: 'Pouletbrust oder Fisch vom Grill mit Gemüse',
    altKcal: 250,
    upf: true,
  },
];

/** Minuten seit Mitternacht. @param {string} t */
const minutes = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/** @param {string} iso */
const weekday = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();

/**
 * Bessere Alternative für einen Eintrag, falls er eine typische Kalorienfalle ist.
 * @param {Pick<FoodEntry, 'name' | 'kcal' | 'nova'>} e
 */
export function swapFor(e) {
  const s = SWAPS.find((x) => x.re.test(e.name));
  if (s && e.kcal >= s.altKcal + 100) return s;
  return null;
}

/**
 * @param {{
 *   days: Record<string, Day>, date: string, kcalTarget: number, proteinTarget: number,
 *   bedtime: string, fastingWindowH: number, span?: number,
 * }} p
 * @returns {{ findings: Finding[], strengths: string[], analysedDays: number, enough: boolean }}
 */
export function behaviorCheck({ days, date, kcalTarget, proteinTarget, bedtime, fastingWindowH, span = 14 }) {
  // Heute zählt erst, wenn der Tag abgeschlossen ist (sonst fehlt das Abendessen)
  const dates = Array.from({ length: span }, (_, i) => addDays(date, -i)).filter((d) => {
    const day = days[d];
    return day?.food?.length && (d !== date || day.complete);
  });
  /** @type {Finding[]} */
  const findings = [];
  /** @type {string[]} */
  const strengths = [];
  if (dates.length < 4) return { findings, strengths, analysedDays: dates.length, enough: false };

  const food = (/** @type {string} */ d) => days[d].food ?? [];
  const kcalOf = (/** @type {FoodEntry[]} */ list) => list.reduce((a, f) => a + f.kcal, 0);
  // Für Bilanz-Aussagen nur Tage mit plausibel vollständiger Erfassung
  const full = dates.filter((d) => days[d].complete || kcalOf(food(d)) >= kcalTarget * 0.6);

  // 1. Kalorienfallen und stark Verarbeitetes
  /** @type {Example[]} */
  const traps = [];
  for (const d of dates)
    for (const f of food(d)) {
      const s = swapFor(f);
      if (s) traps.push({ date: d, time: f.time, name: f.name, kcal: f.kcal, alt: s.alt, altKcal: s.altKcal });
    }
  const upf = dates.flatMap((d) => food(d).filter((f) => f.nova === 4 && f.kcal >= 150 && !swapFor(f)));
  if (traps.length) {
    const saved = traps.reduce((a, t) => a + (t.kcal - (t.altKcal ?? 0)), 0);
    findings.push({
      id: 'traps',
      severity: traps.length >= 6 || saved >= 2000 ? 'alert' : 'warn',
      title: `${traps.length}× Fast Food, Süssgetränke oder Süsses, wo es besser ginge`,
      text: `Mit der besseren Wahl wären es in ${dates.length} Tagen rund ${Math.round(saved / 100) * 100} kcal weniger gewesen, etwa ${(Math.round((saved / 7700) * 10) / 10).toFixed(1).replace('.', ',')} kg Fett. Stark verarbeitete Kost verleitet nachweislich zum Mehressen: Im Stoffwechsel-Labor assen Erwachsene damit rund 500 kcal pro Tag mehr, ohne es zu merken.`,
      better:
        'Vorher entscheiden statt vor Ort: im Restaurant zuerst nach Salat oder Poulet schauen, Getränk ohne Zucker, Pommes durch Salat ersetzen.',
      ref: 'Hall KD et al., Cell Metab 2019;30:67–77; Malik VS et al., Am J Clin Nutr 2013;98:1084–1102',
      examples: groupExamples(traps).slice(0, 4),
    });
  } else if (!upf.length) strengths.push('Keine Fast-Food- oder Süssgetränke-Fallen in den letzten zwei Wochen.');
  if (upf.length >= 3)
    findings.push({
      id: 'upf',
      severity: 'info',
      title: `${upf.length}× stark verarbeitete Produkte (NOVA 4)`,
      text: 'Fertigprodukte sind leicht zu essen und machen weniger satt. Das erhöht die Gesamtmenge.',
      better: 'Gleiche Mahlzeit aus einfachen Zutaten: Naturjoghurt statt Fruchtjoghurt, Brot vom Beck statt Toast, Poulet statt Nuggets.',
      ref: 'Hall KD et al., Cell Metab 2019;30:67–77',
      examples: upf.slice(0, 3).map((f) => ({ date: '', time: f.time, name: f.name, kcal: f.kcal })),
    });

  // 2. Abends zu viel
  const evening = full.map((d) => {
    const total = kcalOf(food(d));
    const late = kcalOf(food(d).filter((f) => minutes(f.time) >= minutes('17:30')));
    return { d, share: total > 0 ? late / total : 0, late };
  });
  const heavyEvenings = evening.filter((e) => e.share > 0.45);
  if (evening.length >= 4 && heavyEvenings.length / evening.length >= 0.5) {
    const avg = Math.round((heavyEvenings.reduce((a, e) => a + e.share, 0) / heavyEvenings.length) * 100);
    findings.push({
      id: 'evening',
      severity: 'warn',
      title: `Abends zu viel: an ${heavyEvenings.length} von ${evening.length} Tagen fast die Hälfte der Kalorien nach 17:30`,
      text: `Im Schnitt ${avg} % der Tagesenergie am Abend. Entscheidend bleibt die Tagesbilanz, aber mit grossem Frühstück und kleinem Abendessen nahmen Frauen in einer Studie deutlich mehr ab; neuere Messungen zeigen keinen höheren Verbrauch, wohl aber weniger Hunger über den Tag.`,
      better:
        'Kalorien nach vorne verschieben: Frühstück und Mittagessen sättigender, Znacht kleiner (z. B. Gemüse + Protein, Kohlenhydrate halbieren).',
      ref: 'Jakubowicz D et al., Obesity 2013;21:2504–2512; Ruddick-Collins LC et al., Cell Metab 2022;34:1472–1485',
      examples: heavyEvenings
        .sort((a, b) => b.share - a.share)
        .slice(0, 3)
        .map((e) => ({ date: e.d, time: '', name: `${Math.round(e.share * 100)} % am Abend`, kcal: e.late })),
    });
  } else if (evening.length >= 4) strengths.push('Gute Tagesverteilung: Der Abend ist nicht die grösste Mahlzeit.');

  // 3. Spät gegessen (weniger als 2 Stunden vor dem Schlafen)
  const lateLimit = Math.min(minutes(bedtime || '22:30') - 120, minutes('21:30'));
  const lateMeals = dates.flatMap((d) =>
    food(d)
      .filter((f) => f.kcal >= 150 && minutes(f.time) >= lateLimit)
      .map((f) => ({ date: d, time: f.time, name: f.name, kcal: f.kcal })),
  );
  const lateDays = new Set(lateMeals.map((m) => m.date)).size;
  if (lateDays >= 3)
    findings.push({
      id: 'late',
      severity: 'warn',
      title: `Spät gegessen an ${lateDays} Tagen (weniger als 2 Stunden vor dem Schlafen)`,
      text: 'Ein spätes Abendessen führte im Versuch zu höherem Blutzucker und weniger Fettverbrennung in der Nacht als dieselbe Mahlzeit früher am Abend. Späte Snacks sind zudem oft zusätzliche Kalorien aus Gewohnheit.',
      better: 'Küche 2–3 Stunden vor dem Schlafen schliessen. Bei Hunger: Tee, ein Glas Milch oder ein kleiner Magerquark.',
      ref: 'Gu C et al., J Clin Endocrinol Metab 2020;105:2789–2802',
      examples: lateMeals.slice(0, 3),
    });

  // 4. Protein am Morgen bzw. in der ersten Mahlzeit
  const firstMeal = dates
    .map((d) => {
      const list = [...food(d)].filter((f) => f.kcal >= 80).sort((a, b) => minutes(a.time) - minutes(b.time));
      if (!list.length) return null;
      const start = minutes(list[0].time);
      const meal = list.filter((f) => minutes(f.time) <= start + 60);
      return { d, time: list[0].time, protein: meal.reduce((a, f) => a + f.protein, 0), names: meal.map((f) => f.name).join(', ') };
    })
    .filter((x) => x !== null);
  const lowStart = firstMeal.filter((m) => m.protein < 20);
  if (firstMeal.length >= 4 && lowStart.length / firstMeal.length >= 0.6) {
    findings.push({
      id: 'protein-morning',
      severity: 'warn',
      title: `${fastingWindowH ? 'Erste Mahlzeit' : 'Frühstück'} mit zu wenig Protein: an ${lowStart.length} von ${firstMeal.length} Tagen unter 20 g`,
      text: `Dein Tagesziel sind ${Math.round(proteinTarget)} g. Wer es erst am Abend nachholt, hat tagsüber mehr Hunger: Ein proteinreiches Frühstück senkte in Studien Hunger und Abend-Snacks. Gleichmässig verteiltes Protein (je 25–40 g pro Mahlzeit) baut zudem mehr Muskelprotein auf als dieselbe Menge vor allem am Abend.`,
      better: 'Morgens 25–30 g Protein: 200 g Skyr oder Magerquark mit Beeren, 2–3 Eier mit Vollkornbrot oder Hüttenkäse aufs Brot.',
      ref: 'Leidy HJ et al., Am J Clin Nutr 2013;97:677–688; Mamerow MM et al., J Nutr 2014;144:876–880',
      examples: lowStart
        .slice(0, 3)
        .map((m) => ({ date: m.d, time: m.time, name: `${m.names}: ${Math.round(m.protein)} g Protein`, kcal: 0 })),
    });
  } else if (firstMeal.length >= 4) strengths.push('Proteinreicher Start in den Tag an den meisten Tagen.');

  // 5. Wochenende
  const weekend = full.filter((d) => [0, 6].includes(weekday(d)));
  const weekdays = full.filter((d) => ![0, 6].includes(weekday(d)));
  if (weekend.length >= 2 && weekdays.length >= 3) {
    const avg = (/** @type {string[]} */ ds) => ds.reduce((a, d) => a + kcalOf(food(d)), 0) / ds.length;
    const diff = avg(weekend) - avg(weekdays);
    if (diff >= 300)
      findings.push({
        id: 'weekend',
        severity: diff >= 600 ? 'alert' : 'warn',
        title: `Wochenende: im Schnitt ${Math.round(diff / 10) * 10} kcal mehr pro Tag als unter der Woche`,
        text: `Zwei solche Tage machen rund ${Math.round((diff * 2) / 10) * 10} kcal pro Woche, oft ein Drittel des Wochendefizits. In einer Studie stoppte die Abnahme genau an den Wochenenden.`,
        better: 'Ein geplanter Genussmoment statt eines ganzen Genusstages; Samstag und Sonntag genauso erfassen und morgens wiegen.',
        ref: 'Racette SB et al., Obesity 2008;16:1826–1830',
        examples: [],
      });
    else strengths.push('Wochenende und Werktage sind ähnlich: Das Defizit hält über die ganze Woche.');
  }

  // 6. Ziel überschritten
  const over = full.filter((d) => kcalOf(food(d)) > kcalTarget + 200);
  if (over.length >= 4)
    findings.push({
      id: 'over',
      severity: 'warn',
      title: `Kalorienziel an ${over.length} von ${full.length} Tagen um mehr als 200 kcal überschritten`,
      text: 'Einzelne Ausreisser sind normal. Häufen sie sich, ist das Defizit weg, und die Waage bleibt stehen.',
      better:
        'Abends zuerst schauen, wie viel noch übrig ist, und das Znacht danach planen (Vorschläge oben). Häufigster Grund: Öl, Saucen, Getränke, Snacks.',
      ref: 'Energiebilanz; Hall KD et al., Lancet 2011;378:826–837',
      examples: over.slice(0, 3).map((d) => ({ date: d, time: '', name: 'Tagestotal', kcal: kcalOf(food(d)) })),
    });

  // 7. Gemüse und Früchte
  const fv = dates.map((d) => food(d).reduce((a, f) => a + (f.groups?.gemuese ?? 0) + (f.groups?.frucht ?? 0), 0));
  const withGroups = dates.filter((d) => food(d).some((f) => f.groups && Object.keys(f.groups).length)).length;
  if (withGroups >= 4) {
    const avgFv = fv.reduce((a, v) => a + v, 0) / dates.length;
    if (avgFv < 3)
      findings.push({
        id: 'veg',
        severity: 'info',
        title: `Zu wenig Gemüse und Früchte: im Schnitt ${avgFv.toFixed(1).replace('.', ',')} von 5 Portionen`,
        text: 'Gemüse macht Teller voll bei wenig Kalorien. Wer die Energiedichte senkt, nimmt bei gleicher Sättigung mehr ab.',
        better: 'Bei jeder Hauptmahlzeit die Hälfte des Tellers Gemüse oder Salat; Frucht als Zwischenmahlzeit statt Gebäck.',
        ref: 'Ello-Martin JA et al., Am J Clin Nutr 2007;85:1465–1477',
        examples: [],
      });
    else strengths.push('Gemüse und Früchte: gut dabei.');
  }

  const order = { alert: 0, warn: 1, info: 2, ok: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return { findings, strengths, analysedDays: dates.length, enough: true };
}

/**
 * Gleiche Einträge zusammenfassen («3× Chips …: 17. Okt., 18. Okt.»), grösste Ersparnis zuerst.
 * @param {Example[]} list
 * @returns {Example[]}
 */
function groupExamples(list) {
  /** @type {Map<string, Example & { n: number, dates: string[] }>} */
  const by = new Map();
  for (const e of list) {
    const k = e.name.toLowerCase();
    const g = by.get(k);
    if (g) {
      g.n++;
      g.dates.push(e.date);
    } else by.set(k, { ...e, n: 1, dates: [e.date] });
  }
  return [...by.values()]
    .sort((a, b) => b.n * (b.kcal - (b.altKcal ?? 0)) - a.n * (a.kcal - (a.altKcal ?? 0)))
    .map((g) => (g.n > 1 ? { ...g, date: '', time: '', name: `${g.n}× ${g.name}` } : g));
}
