// @ts-check
// «Warum es sich lohnt»: Lebenserwartung, Risiken von Übergewicht, Nutzen von Bewegung.

import { h, fmt } from '../ui/dom.js';
import { bmi } from '../domain/clinical.js';
import { longevityEstimate, metHoursPerWeek, overweightRisks } from '../domain/longevity.js';

/** @typedef {import('../app.js').Ctx} Ctx */

/** @param {number} v */
const yrs = (v) => fmt(v, v < 10 ? 1 : 0);

/** @param {Ctx} ctx */
export function motivationCard(ctx) {
  const snap = /** @type {NonNullable<Ctx['snap']>} */ (ctx.snap);
  const p = snap.profile;
  const bmiNow = snap.bmi.value;
  const bmiGoal = bmi(p.goalWeightKg, p.heightCm);
  const metH = metHoursPerWeek(ctx.state.workouts, ctx.today);
  const est = longevityEstimate({ bmiNow, bmiGoal, metH });
  const risks = overweightRisks({ bmi: bmiNow, waistCm: snap.waist?.cm ?? null, sex: p.sex });
  const hasRuns = metH > 0;

  return h(
    'section',
    { class: 'card motivation', 'aria-labelledby': 'mot-h' },
    h('h2', { id: 'mot-h' }, 'Warum es sich lohnt'),
    h(
      'div',
      { class: 'life-grid' },
      h(
        'div',
        { class: 'life-stat', id: 'life-activity' },
        h('span', { class: 'stat-label' }, hasRuns ? 'Durch Bewegung bereits gewonnen' : 'Durch Bewegung möglich'),
        h('span', { class: 'life-value' }, `+${yrs(hasRuns ? est.activity.years : 3.4)}`, h('small', {}, ' Jahre')),
        h(
          'span',
          { class: 'stat-sub' },
          hasRuns
            ? `${fmt(metH, 1)} MET-Stunden pro Woche (Schnitt 4 Wochen): ${est.activity.label}`
            : 'bei 150 Minuten zügiger Bewegung pro Woche',
        ),
      ),
      est.weightGain.high > 0
        ? h(
            'div',
            { class: 'life-stat', id: 'life-weight' },
            h('span', { class: 'stat-label' }, `Mit Zielgewicht ${fmt(p.goalWeightKg, 0)} kg zusätzlich`),
            h('span', { class: 'life-value' }, `+${yrs(est.weightGain.low)}–${yrs(est.weightGain.high)}`, h('small', {}, ' Jahre')),
            h('span', { class: 'stat-sub' }, `BMI ${fmt(bmiNow, 1)} → ${fmt(bmiGoal, 1)}`),
          )
        : null,
    ),
    est.nextActivity && hasRuns
      ? h(
          'p',
          { class: 'small' },
          `Nächste Stufe: Ab ${fmt(est.nextActivity.metH, 1)} MET-Stunden pro Woche (${est.nextActivity.label}) kommen laut Studie noch etwa ${yrs(est.nextActivity.extraYears)} Jahre dazu. Ein zusätzlicher lockerer Lauf von 45 Minuten bringt rund 5 MET-Stunden.`,
        )
      : null,
    h(
      'p',
      { class: 'small' },
      h('strong', {}, 'Gesunde Jahre zählen doppelt: '),
      'Männer, die mit 50 nicht rauchen, normalgewichtig sind, sich täglich mindestens 30 Minuten bewegen, höchstens mässig Alkohol trinken und sich ausgewogen ernähren, leben im Schnitt rund 12 Jahre länger als Männer ohne diese Gewohnheiten. Sie haben zudem rund 7–8 Jahre mehr ohne Diabetes, Herz-Kreislauf-Erkrankung und Krebs. Nichtrauchen erfüllst du bereits, Bewegung zum grossen Teil.',
    ),
    h(
      'details',
      { class: 'mot-details' },
      h('summary', {}, 'Was Bewegung bewirkt'),
      h(
        'ul',
        { class: 'review-list wins' },
        h('li', {}, 'Wer am meisten geht, hat ein um rund 40–50 % geringeres Sterberisiko als wer am wenigsten geht.'),
        h('li', {}, 'Die Ausdauerfitness (VO₂max) gehört zu den stärksten Prädiktoren für ein langes Leben.'),
        h('li', {}, 'Bessere Blutzucker-, Blutdruck- und Blutfettwerte, oft schon nach wenigen Wochen.'),
        h('li', {}, 'Besserer Schlaf, weniger Stress, geringeres Risiko für Depression.'),
        h('li', {}, 'Erhält Muskeln, Knochen und Gleichgewicht. Das schützt im Alter vor Stürzen und Pflegebedürftigkeit.'),
      ),
    ),
    risks.show
      ? h(
          'details',
          { class: 'mot-details', id: 'risk-details' },
          h('summary', {}, `Risiken von Übergewicht${risks.central ? ' (Bauchfett erhöht das Risiko zusätzlich)' : ''}`),
          h(
            'ul',
            { class: 'review-list improve' },
            ...risks.items.map((r) => h('li', {}, h('strong', {}, r.title), h('span', {}, r.text))),
          ),
          h(
            'p',
            { class: 'small' },
            'Die gute Nachricht: Diese Risiken sinken schon mit den ersten 5–10 % Gewichtsabnahme messbar. Du bist auf dem richtigen Weg.',
          ),
        )
      : null,
    h(
      'p',
      { class: 'hint' },
      'Schätzung aus grossen Beobachtungsstudien (Prospective Studies Collaboration, Lancet 2009; Moore, PLoS Med 2012; Li, Circulation 2018 und BMJ 2020). Sie beschreibt Durchschnittswerte, keine Garantie für dich. Die Effekte sind nicht einfach addierbar.',
    ),
  );
}
