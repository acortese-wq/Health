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

// Vorteile des Trinkens, nur gut belegte oder vorsichtig formulierte Aussagen.
// Quellen: Adan 2012 (J Am Coll Nutr), Dennis 2010 (Obesity), Pan 2013 (Am J Clin Nutr),
// Borghi 1996 (J Urol), Killer 2014 (PLoS One), Armstrong 2012 (J Nutr), Roussel 2011
// (Diabetes Care), ACSM 2007 (Exercise and Fluid Replacement).
export const FACTS = [
  'Konzentration: Schon rund 2 % Flüssigkeitsverlust können Aufmerksamkeit und Leistung messbar senken, bei Hitze oder Sport schnell erreicht.',
  'Sattwerden: Ein grosses Glas Wasser vor dem Essen hilft beim Sattwerden. In einer Studie nahmen Personen damit in 12 Wochen etwas mehr ab.',
  'Null Kalorien: Ein halber Liter Süssgetränk hat rund 200 kcal, so viel wie dein 16-Uhr-Snack. Wasser hat 0 kcal.',
  'Gewicht langfristig: Wer Süssgetränke durch Wasser ersetzt, nimmt laut grossen Langzeitstudien über die Jahre weniger zu.',
  'Laufen: Verlierst du beim Joggen mehr als 2 % deines Gewichts an Schweiss, sinkt die Ausdauer. 1 kg weniger nach dem Lauf entspricht etwa 1 Liter.',
  'Kühlung: Schwitzen kühlt dich nur, wenn genug Flüssigkeit nachkommt. Bei Hitze und Sport steigt der Bedarf oft um einen Liter oder mehr.',
  'Stimmung: Schon leichter Flüssigkeitsmangel ging in Studien mit mehr Müdigkeit, schlechterer Laune und Kopfweh einher.',
  'Nieren: Genug trinken senkt das Risiko für Nierensteine deutlich. Wer schon einmal einen hatte, profitiert besonders.',
  'Verdauung: Ballaststoffe aus Gemüse und Vollkorn wirken nur mit genug Flüssigkeit gegen Verstopfung.',
  'Kaffee zählt mit: Kaffee in normalen Mengen trocknet nicht aus. Ein Glas Wasser zu jeder Tasse hilft trotzdem, weniger Kaffee zu trinken.',
  'Nachmittagstief: Müdigkeit am Nachmittag ist oft auch Durst. Ein Glas Wasser vor dem nächsten Kaffee lohnt sich.',
  'Selbsttest: Hellgelber Urin heisst gut getrunken. Dunkelgelb heisst: Jetzt ein Glas.',
  'Blutzucker: Wer wenig trank, hatte in einer grossen Beobachtungsstudie häufiger erhöhten Blutzucker. Ursache und Wirkung sind nicht bewiesen.',
  'Gewohnheit: Wasser sichtbar auf dem Pult oder im Auto ist der einfachste Trick. Was griffbereit ist, wird getrunken.',
];

/**
 * Vorteil des Trinkens. Wechselt täglich und mit jeder Erfassung (step = Gläser à 250 ml),
 * damit nach jedem Glas ein neuer Vorteil erscheint.
 * @param {string} date
 * @param {number} [step]
 */
export function waterFact(date, step = 0) {
  const n = date.split('-').reduce((a, x) => a + Number(x), 0);
  return FACTS[(n + Math.max(0, Math.round(step))) % FACTS.length];
}

/**
 * Erinnerungszeiten zwischen Start und Ende im festen Abstand.
 * @param {string} start «HH:MM»
 * @param {string} end «HH:MM»
 * @param {number} everyMin Abstand in Minuten
 * @returns {string[]}
 */
export function reminderTimes(start, end, everyMin) {
  const toMin = (/** @type {string} */ t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const a = toMin(start);
  const b = toMin(end);
  if (!(everyMin >= 30) || b < a) return [];
  const out = [];
  for (let t = a; t <= b && out.length < 24; t += everyMin) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  }
  return out;
}

/**
 * Kalenderdatei (iCalendar, RFC 5545) mit täglich wiederkehrenden Trink-Erinnerungen.
 * Ortszeit ohne Zeitzone («floating»): die Erinnerung kommt immer zur lokalen Uhrzeit.
 * Wird in Apple Kalender importiert, der zuverlässig benachrichtigt, auch wenn die App
 * geschlossen ist.
 * @param {{ times: string[], mlPerReminder: number, weekdaysOnly: boolean, startDate: string, stamp: string }} p
 *   startDate «YYYY-MM-DD», stamp UTC-Zeitstempel «YYYYMMDDTHHMMSSZ»
 * @returns {string}
 */
export function buildReminderIcs({ times, mlPerReminder, weekdaysOnly, startDate, stamp }) {
  const day = startDate.replace(/-/g, '');
  const glasses = mlPerReminder <= 250 ? '1 Glas' : `${Math.round(mlPerReminder / 50) * 50} ml`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Gesundheitscockpit//Trink-Erinnerung//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Trinken',
  ];
  for (const t of times) {
    const hhmm = t.replace(':', '');
    lines.push(
      'BEGIN:VEVENT',
      `UID:trinken-${hhmm}@gesundheitscockpit`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${day}T${hhmm}00`,
      'DURATION:PT5M',
      weekdaysOnly ? 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' : 'RRULE:FREQ=DAILY',
      `SUMMARY:Trinken: ${glasses} Wasser`,
      'DESCRIPTION:Erinnerung aus dem Gesundheitscockpit. Kurz in der App eintragen.',
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:Trinken: ${glasses} Wasser`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

/**
 * Soll die App beim Öffnen an das Trinken erinnern? Höchstens alle 90 Minuten.
 * @param {{ ml: number, target: number, minutes: number, lastNudge: number | null, now: number }} p
 */
export function shouldNudge({ ml, target, minutes, lastNudge, now }) {
  if (lastNudge !== null && now - lastNudge < 90 * 60 * 1000) return null;
  const pace = waterPace({ ml, target, minutes, isToday: true });
  return pace.status === 'behind' ? pace.message : null;
}
