// @ts-check
// Rückblick-Coach: was lief gut, was geht besser, ein Fokus für morgen.
//
// Grundsätze (Verhaltensänderung): konkret statt allgemein, Erfolge zuerst benennen,
// höchstens zwei Verbesserungen auf einmal, jede mit einer umsetzbaren Handlung, und
// einzelne Ausrutscher in den Trend einordnen statt zu werten. Regelmässige
// Selbstbeobachtung ist einer der stärksten Prädiktoren für Abnahmeerfolg
// (Burke LE et al., J Am Diet Assoc 2011;111:92–102).

import { plannedSession } from './training.js';
import { addDays, isNum, mean, timeToMinutes } from './util.js';
import { eatingWindow, outsideWindow, windowLabel } from './fasting.js';

/**
 * @typedef {{ id: string, title: string, tip: string, weight: number }} Improvement
 * @typedef {{
 *   period: 'day' | 'week', label: string, headline: string, tone: 'great' | 'good' | 'restart',
 *   met: number, total: number, wins: string[], improve: Improvement[], focus: string, empty: boolean,
 *   streaks: string[],
 * }} Review
 * @typedef {{
 *   date: string,
 *   profile: {
 *     stepsTarget: number, sleepTargetH: number, waterTargetMl?: number, trainingMode?: import('./training.js').TrainingMode,
 *     fastingWindowH?: number, eatStart?: string,
 *   },
 *   day: import('../store.js').Day,
 *   kcal: number, kcalTarget: number,
 *   proteinG: number, protein: { grams: number },
 *   caffeine: { late: unknown[], cutoff: string },
 *   cupsAllowed: number | null, cupsToday: number,
 * }} DayInput
 * @typedef {import('./training.js').Workout} Workout
 */

const fmt = (/** @type {number} */ v) => Math.round(v).toLocaleString('de-CH');

/** Abwechslung in den Formulierungen, aber pro Datum stabil. */
function pick(/** @type {string} */ seed, /** @type {string[]} */ options) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return options[h % options.length];
}

/**
 * Anteil der Kalorien nach 18 Uhr.
 * @param {import('../store.js').Day} day
 */
export function eveningShare(day) {
  const food = day.food ?? [];
  const total = food.reduce((a, f) => a + f.kcal, 0);
  if (!total) return 0;
  return food.filter((f) => timeToMinutes(f.time) >= 18 * 60).reduce((a, f) => a + f.kcal, 0) / total;
}

/**
 * Wurde die geplante Einheit erledigt?
 * @param {Workout[]} workouts
 * @param {string} date
 */
function sessionStatus(workouts, date, mode = /** @type {import('./training.js').TrainingMode} */ ('kombi')) {
  const plan = plannedSession(date, mode);
  const done = workouts.filter((w) => w.date === date);
  if (plan.kind === 'rest') return { plan, done: done.length > 0, extra: done.length > 0 };
  const hit = done.some((w) => w.kind === plan.kind);
  return { plan, done: hit, extra: false };
}

/**
 * Serien, die motivieren: aufeinanderfolgende Tage bis einschliesslich `date`.
 * @param {Record<string, import('../store.js').Day>} days
 * @param {string} date
 * @param {number} proteinTarget
 * @returns {{ weighed: number, logged: number, protein: number }}
 */
export function streaks(days, date, proteinTarget) {
  /** @param {(d: import('../store.js').Day) => boolean} ok */
  const count = (ok) => {
    let n = 0;
    // Heute zählt nur, wenn schon erfüllt; sonst ab gestern zählen.
    let d = days[date] && ok(days[date]) ? date : addDays(date, -1);
    while (days[d] && ok(days[d]) && n < 3650) {
      n++;
      d = addDays(d, -1);
    }
    return n;
  };
  return {
    weighed: count((d) => isNum(d.weightKg)),
    logged: count((d) => Boolean(d.complete)),
    protein: count((d) => (d.food ?? []).reduce((a, f) => a + f.protein, 0) >= proteinTarget * 0.9),
  };
}

/**
 * @param {{ weighed: number, logged: number, protein: number }} s
 * @returns {string[]}
 */
function streakTexts(s) {
  const out = [];
  if (s.weighed >= 3) out.push(`${s.weighed} Tage in Folge gewogen`);
  if (s.protein >= 3) out.push(`${s.protein} Tage in Folge Proteinziel erreicht`);
  if (s.logged >= 3) out.push(`${s.logged} Tage in Folge vollständig erfasst`);
  return out;
}

/**
 * Tagesrückblick.
 * @param {DayInput} s
 * @param {{ workouts: Workout[], dayOver: boolean, streaks: { weighed: number, logged: number, protein: number } }} ctx
 * @returns {Review}
 */
export function dayReview(s, { workouts, dayOver, streaks: st }) {
  /** @type {string[]} */
  const wins = [];
  /** @type {Improvement[]} */
  const improve = [];
  let met = 0;
  let total = 0;
  const food = s.day.food ?? [];
  const logged = food.length > 0;
  const seed = s.date;

  // Ernährung
  if (logged) {
    total++;
    const ratio = s.kcal / s.kcalTarget;
    if (ratio >= 0.9 && ratio <= 1.1) {
      met++;
      wins.push(
        pick(seed, [
          `Kalorien im Ziel: ${fmt(s.kcal)} von ${fmt(s.kcalTarget)} kcal.`,
          `Punktlandung bei der Energie: ${fmt(s.kcal)} kcal.`,
        ]),
      );
    } else if (ratio > 1.1 && dayOver) {
      const over = s.kcal - s.kcalTarget;
      const evening = eveningShare(s.day) > 0.5;
      improve.push({
        id: 'kcal-over',
        weight: over > 500 ? 90 : 60,
        title: `${fmt(over)} kcal über dem Ziel`,
        tip: evening
          ? 'Mehr als die Hälfte kam nach 18 Uhr. Plane morgen um 16 Uhr einen Protein-Snack ein (z. B. Skyr): Protein sättigt am stärksten und nimmt dem Abend den Heisshunger.'
          : 'Lege die Abendportion vor dem Essen fest: Pasta abwiegen (90 g), doppelt Gemüse, kein Nachschöpfen. Ein Tag ändert deinen Trend nicht.',
      });
    } else if (ratio < 0.75 && s.day.complete && dayOver) {
      improve.push({
        id: 'kcal-under',
        weight: 70,
        title: `Nur ${fmt(s.kcal)} kcal gegessen`,
        tip: 'Zu wenig zu essen rächt sich: Heisshunger und Muskelabbau. Iss morgen eine richtige Mittagsmahlzeit mit 40–50 g Protein.',
      });
    }

    total++;
    if (s.proteinG >= s.protein.grams * 0.9) {
      met++;
      wins.push(
        pick(seed + 'p', [
          `Proteinziel erreicht (${fmt(s.proteinG)} g). Das schützt deine Muskeln.`,
          `${fmt(s.proteinG)} g Protein. Damit bleibt die Muskulatur im Defizit erhalten.`,
        ]),
      );
    } else if (dayOver && s.proteinG < s.protein.grams * 0.75) {
      improve.push({
        id: 'protein',
        weight: 80,
        title: `Protein: ${fmt(s.proteinG)} von ${fmt(s.protein.grams)} g`,
        tip: 'Verlege das Protein in die erste Tageshälfte: mittags 40–50 g (Fleisch, Fisch, Eier, Hülsenfrüchte) und um 16 Uhr 250 g Skyr oder Quark.',
      });
    }
    // Essensfenster (nur wenn gewählt)
    const w = eatingWindow(s.profile.eatStart ?? '11:00', s.profile.fastingWindowH ?? 0);
    if (w && dayOver) {
      total++;
      const off = outsideWindow(food, w);
      if (!off.outside.length) {
        met++;
        wins.push(`Essensfenster eingehalten (${windowLabel(w)}).`);
      } else {
        const late = off.late.length > 0;
        improve.push({
          id: 'window',
          weight: late ? 45 : 30,
          title: `${off.outside.length} ${off.outside.length === 1 ? 'Mahlzeit' : 'Mahlzeiten'} ausserhalb des Fensters`,
          tip: late
            ? `Das Fenster schloss um ${windowLabel(w).split('–')[1]}. Mach die letzte Mahlzeit proteinreich und sättigend, danach Zähne putzen: ein klares Signal, dass die Küche zu ist.`
            : `Vor ${windowLabel(w).split('–')[0]} gegessen. Kein Problem, wenn es dir guttut: Dann verschiebe das Fenster im Profil früher, statt dich durchzuquälen.`,
        });
      }
    }
  } else if (dayOver) {
    improve.push({
      id: 'not-logged',
      weight: 50,
      title: 'Keine Mahlzeiten erfasst',
      tip: 'Grobe Einträge sind besser als keine. Erfasse morgen wenigstens die Hauptmahlzeit, per Foto geht es in 10 Sekunden.',
    });
  }

  // Koffein
  if ((s.day.caffeine ?? []).length) {
    total++;
    const tooMany = s.cupsAllowed !== null && s.cupsToday > s.cupsAllowed;
    if (s.caffeine.late.length) {
      improve.push({
        id: 'caffeine-late',
        weight: 40,
        title: 'Kaffee nach der Grenzzeit',
        tip: `Die letzte Tasse spätestens um ${s.caffeine.cutoff} Uhr trinken. Danach entkoffeiniert. Das verbessert den Schlaf, auch wenn du es nicht direkt merkst.`,
      });
    } else if (tooMany) {
      improve.push({
        id: 'caffeine-cups',
        weight: 30,
        title: `${s.cupsToday} statt ${s.cupsAllowed} Tassen`,
        tip: 'Streiche die Nachmittagstasse zuerst. Ein kurzer Spaziergang hilft gegen das Tief um 15 Uhr oft besser.',
      });
    } else {
      met++;
      wins.push(
        s.cupsAllowed !== null
          ? `Koffein im Plan: ${s.cupsToday} von ${s.cupsAllowed} Tassen, alle vor ${s.caffeine.cutoff} Uhr.`
          : `Kein Kaffee nach ${s.caffeine.cutoff} Uhr.`,
      );
    }
  }

  // Bewegung
  if (isNum(s.day.steps)) {
    total++;
    if (s.day.steps >= s.profile.stepsTarget) {
      met++;
      wins.push(`${fmt(s.day.steps)} Schritte, Ziel erreicht.`);
    } else if (dayOver && s.day.steps < s.profile.stepsTarget * 0.75) {
      improve.push({
        id: 'steps',
        weight: 35,
        title: `${fmt(s.day.steps)} Schritte`,
        tip: '10 Minuten zügig gehen nach dem Mittagessen bringen ca. 1200 Schritte und senken den Blutzucker nach der Mahlzeit.',
      });
    }
  }

  // Trinken
  const waterTarget = s.profile.waterTargetMl ?? 2000;
  if (isNum(s.day.waterMl)) {
    total++;
    if (s.day.waterMl >= waterTarget) {
      met++;
      wins.push(`${fmt(s.day.waterMl)} ml getrunken.`);
    } else if (dayOver && s.day.waterMl < waterTarget * 0.6) {
      improve.push({
        id: 'water',
        weight: 25,
        title: `Nur ${fmt(s.day.waterMl)} ml getrunken`,
        tip: 'Stell dir morgens eine volle Literflasche auf den Schreibtisch. Und trink vor jeder Mahlzeit ein grosses Glas Wasser.',
      });
    }
  }

  // Schlaf (Wert gilt für die Nacht davor)
  if (isNum(s.day.sleepH)) {
    total++;
    if (s.day.sleepH >= s.profile.sleepTargetH - 0.25) {
      met++;
      wins.push(`${s.day.sleepH.toFixed(1)} h geschlafen. Das hilft gegen Heisshunger.`);
    } else if (s.day.sleepH < 6.5) {
      improve.push({
        id: 'sleep',
        weight: 55,
        title: `Nur ${s.day.sleepH.toFixed(1)} h Schlaf`,
        tip: 'Stell dir heute einen Wecker zum Zubettgehen, 30 Minuten vor der Schlafenszeit: Bildschirme weg, Licht dimmen.',
      });
    }
  }

  // Training
  const ses = sessionStatus(workouts, s.date, s.profile.trainingMode);
  if (ses.plan.kind !== 'rest') {
    total++;
    if (ses.done) {
      met++;
      wins.push(pick(seed + 't', [`${ses.plan.title} erledigt. Stark!`, `${ses.plan.title} durchgezogen. Genau das zählt.`]));
    } else if (dayOver) {
      improve.push({
        id: 'training',
        weight: ses.plan.kind === 'strength' ? 75 : 45,
        title: `${ses.plan.title} ausgelassen`,
        tip:
          ses.plan.kind === 'strength'
            ? 'Hol die Krafteinheit morgen nach oder trag sie fix in den Kalender ein, wie ein Meeting. Schon 30 Minuten mit den Grundübungen zählen.'
            : 'Kein Problem, wenn es einmal nicht passt. Hol die Einheit morgen kürzer nach: 30 Minuten locker reichen.',
      });
    }
  } else if (ses.extra) {
    wins.push('Bonus-Training am Ruhetag. Achte trotzdem auf Erholung.');
  }

  if (isNum(s.day.weightKg) && wins.length < 3) wins.push('Gewogen. Regelmässiges Messen ist einer der stärksten Erfolgsfaktoren.');

  improve.sort((a, b) => b.weight - a.weight);
  const top = improve.slice(0, 2);
  const share = total ? met / total : 0;
  const empty = total === 0 && !isNum(s.day.weightKg);
  const tone = share >= 0.8 ? 'great' : share >= 0.5 ? 'good' : 'restart';
  const headline = empty
    ? 'Noch keine Daten für diesen Tag'
    : tone === 'great'
      ? pick(seed + 'h', ['Starker Tag!', 'Richtig gut gemacht!', 'Ein Tag zum Wiederholen.'])
      : tone === 'good'
        ? pick(seed + 'h', ['Solider Tag mit Luft nach oben.', 'Gute Basis, kleine Stellschrauben.'])
        : pick(seed + 'h', ['Morgen ist ein neuer Tag.', 'Nicht dein Tag, aber kein Grund aufzugeben.']);
  const focus = top.length
    ? top[0].tip
    : dayOver
      ? 'Genau so weitermachen. Beständigkeit schlägt Perfektion.'
      : 'Der Tag läuft noch. Am Abend zeigt der Rückblick, wo du stehst.';
  return {
    period: 'day',
    label: '',
    headline,
    tone,
    met,
    total,
    wins: wins.slice(0, 6),
    improve: top,
    focus,
    empty,
    streaks: streakTexts(st),
  };
}

/**
 * Wochenrückblick über 7 Tage bis einschliesslich `to`.
 * @param {DayInput[]} days die 7 Tage
 * @param {{
 *   week: { strengthDays: number, aerobicMet: boolean, intervalDone: boolean, equivalent: number },
 *   slopeKgPerDay: number | null, weightKg: number,
 *   stepsTarget: number, sleepTargetH: number, waterTargetMl?: number, trainingMode?: import('./training.js').TrainingMode,
 *   streaks: { weighed: number, logged: number, protein: number },
 * }} ctx
 * @returns {Review}
 */
export function weekReview(days, ctx) {
  /** @type {string[]} */
  const wins = [];
  /** @type {Improvement[]} */
  const improve = [];
  let met = 0;
  let total = 0;
  const seed = days[days.length - 1]?.date ?? '';

  const complete = days.filter((d) => d.day.complete && (d.day.food ?? []).length);
  if (complete.length >= 3) {
    total++;
    const avg = mean(complete.map((d) => d.kcal));
    const target = mean(complete.map((d) => d.kcalTarget));
    const diff = avg - target;
    if (Math.abs(diff) <= target * 0.07) {
      met++;
      wins.push(`Kalorien im Wochenschnitt im Ziel (${fmt(avg)} kcal).`);
    } else if (diff > 0) {
      improve.push({
        id: 'w-kcal',
        weight: 80,
        title: `Im Schnitt ${fmt(diff)} kcal pro Tag über dem Ziel`,
        tip: 'Such dir die eine Mahlzeit, die am häufigsten ausreisst, und plane sie fix vor, statt überall ein bisschen zu sparen.',
      });
    }
  }

  const proteinDays = days.filter((d) => d.proteinG >= d.protein.grams * 0.9).length;
  const withFood = days.filter((d) => (d.day.food ?? []).length).length;
  if (withFood >= 3) {
    total++;
    if (proteinDays >= Math.min(5, withFood)) {
      met++;
      wins.push(`Proteinziel an ${proteinDays} von 7 Tagen erreicht.`);
    } else {
      improve.push({
        id: 'w-protein',
        weight: 70,
        title: `Proteinziel nur an ${proteinDays} Tagen`,
        tip: 'Mach den 16-Uhr-Snack zur Routine: Kauf Skyr oder Quark für die ganze Woche auf einmal ein.',
      });
    }
  }

  if (ctx.trainingMode !== 'laufen') {
    total++;
    if (ctx.week.strengthDays >= 2) {
      met++;
      wins.push(`${ctx.week.strengthDays} Krafteinheiten. Deine Muskeln danken es dir.`);
    } else {
      improve.push({
        id: 'w-strength',
        weight: 85,
        title: `${ctx.week.strengthDays} von 2 Krafteinheiten`,
        tip: 'Trag Montag und Donnerstag über Mittag fix im Kalender ein. Krafttraining ist beim Abnehmen dein wichtigster Muskelschutz.',
      });
    }
  }

  total++;
  if (ctx.week.aerobicMet) {
    met++;
    wins.push(`${fmt(ctx.week.equivalent)} Ausdauer-Minuten. WHO-Empfehlung erfüllt.`);
  } else {
    improve.push({
      id: 'w-aerobic',
      weight: 40,
      title: `${fmt(ctx.week.equivalent)} von 150 Ausdauer-Minuten`,
      tip: 'Plane die drei Läufe wie im Wochenplan fix ein. Intervall-Minuten zählen doppelt, 35 Minuten 4×4 bringen also schon 70.',
    });
  }

  const steps = days.map((d) => d.day.steps).filter(isNum);
  if (steps.length >= 4) {
    total++;
    const avg = mean(steps);
    if (avg >= ctx.stepsTarget) {
      met++;
      wins.push(`Im Schnitt ${fmt(avg)} Schritte pro Tag.`);
    } else
      improve.push({
        id: 'w-steps',
        weight: 30,
        title: `Im Schnitt ${fmt(avg)} Schritte`,
        tip: 'Mach Telefonate im Gehen und geh kurze Wege zu Fuss. Das kostet keine Extrazeit.',
      });
  }

  const water = days.map((d) => d.day.waterMl).filter(isNum);
  const waterTarget = ctx.waterTargetMl ?? 2000;
  if (water.length >= 4) {
    total++;
    const avg = mean(water);
    if (avg >= waterTarget * 0.9) {
      met++;
      wins.push(`Im Schnitt ${fmt(avg)} ml pro Tag getrunken.`);
    } else
      improve.push({
        id: 'w-water',
        weight: 20,
        title: `Im Schnitt ${fmt(avg)} ml getrunken`,
        tip: 'Häng das Trinken an feste Momente: ein Glas nach dem Aufstehen, eines zu jeder Mahlzeit, eines nach dem Training.',
      });
  }

  const sleep = days.map((d) => d.day.sleepH).filter(isNum);
  if (sleep.length >= 4) {
    total++;
    const avg = mean(sleep);
    if (avg >= ctx.sleepTargetH - 0.25) {
      met++;
      wins.push(`Schlaf im Schnitt ${avg.toFixed(1)} h.`);
    } else
      improve.push({
        id: 'w-sleep',
        weight: 50,
        title: `Schlaf im Schnitt ${avg.toFixed(1)} h`,
        tip: 'Geh eine Woche lang jeden Abend 20 Minuten früher ins Bett. Weniger Schlaf heisst messbar mehr Hunger.',
      });
  }

  if (ctx.slopeKgPerDay !== null) {
    const perWeek = -ctx.slopeKgPerDay * 7;
    const pct = (perWeek / ctx.weightKg) * 100;
    if (pct >= 0.4 && pct <= 1.1) wins.unshift(`Trend: −${perWeek.toFixed(2)} kg pro Woche. Genau im gesunden Tempo.`);
    else if (perWeek <= 0)
      improve.push({
        id: 'w-trend',
        weight: 60,
        title: 'Gewichtstrend stagniert',
        tip: 'Das passiert jedem. Prüfe ehrlich die Portionen am Abend und die Getränke. Wenn du die Tage vollständig erfasst, passt die App das Kalorienziel automatisch an deinen echten Verbrauch an.',
      });
  }

  const weighed = days.filter((d) => isNum(d.day.weightKg)).length;
  if (weighed >= 5) wins.push(`An ${weighed} von 7 Tagen gewogen.`);

  improve.sort((a, b) => b.weight - a.weight);
  const top = improve.slice(0, 2);
  const share = total ? met / total : 0;
  const tone = share >= 0.75 ? 'great' : share >= 0.45 ? 'good' : 'restart';
  const headline =
    tone === 'great'
      ? pick(seed, ['Eine richtig gute Woche!', 'Diese Woche sitzt.'])
      : tone === 'good'
        ? pick(seed, ['Solide Woche. Ein Hebel macht den Unterschied.', 'Auf Kurs, mit Potenzial.'])
        : pick(seed, ['Durchzogene Woche. Neustart mit einem einzigen Fokus.', 'Abhaken und mit einem klaren Fokus weiter.']);
  return {
    period: 'week',
    label: '',
    headline,
    tone,
    met,
    total,
    wins: wins.slice(0, 6),
    improve: top,
    focus: top.length ? top[0].tip : 'Halte das Niveau. Gleiche Routine, nächste Woche wieder.',
    empty: false,
    streaks: streakTexts(ctx.streaks),
  };
}
