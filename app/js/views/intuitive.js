// @ts-check
// Seiten «Intuitives Essen» (#intuitiv) und «Gelüste und Mangel» (#gelueste/<id>).

import { h, fmt } from '../ui/dom.js';
import { PRINCIPLES, scaleStats, scaleFeedback } from '../domain/intuitive.js';
import { CRAVING_CAUSES, NO_EVIDENCE } from '../data/cravingcauses.js';
import { averageAmounts, dailyTargets, NUTRIENTS } from '../domain/micros.js';
import { addDays } from '../domain/util.js';

/** @typedef {import('../app.js').Ctx} Ctx */

/** @param {Ctx} ctx */
export function viewIntuitive(ctx) {
  const s = scaleStats(ctx.state.days, ctx.today);
  return h(
    'div',
    { class: 'stack' },
    h('h1', {}, 'Intuitives Essen'),
    h(
      'p',
      { class: 'small' },
      'Intuitives Essen heisst: auf Hunger und Sättigung hören, ohne Verbote und ohne schlechtes Gewissen. In dieser App ergänzt es die Zahlen: Kalorien und Protein bleiben die Orientierung fürs Abnehmen, Hunger und Sättigung helfen, sie ohne Kampf einzuhalten.',
    ),
    h(
      'section',
      { class: 'card stack-sm', 'aria-labelledby': 'ie-scale-h', id: 'ie-scale' },
      h('h2', { id: 'ie-scale-h' }, 'Hunger und Sättigung von 1 bis 10'),
      h(
        'table',
        { class: 'nutrition-table small' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Wert'), h('th', {}, 'Hunger vorher'), h('th', {}, 'Sättigung danach'))),
        h(
          'tbody',
          {},
          h('tr', {}, h('th', {}, '1–3'), h('td', {}, 'kaum Hunger: eher Lust oder Gewohnheit'), h('td', {}, 'noch hungrig')),
          h('tr', {}, h('th', {}, '4–6'), h('td', {}, 'spürbarer Hunger: guter Zeitpunkt'), h('td', {}, 'etwas satt')),
          h('tr', {}, h('th', {}, '7–8'), h('td', {}, 'deutlich hungrig: jetzt essen'), h('td', {}, 'angenehm satt: aufhören')),
          h('tr', {}, h('th', {}, '9–10'), h('td', {}, 'ausgehungert: Gefahr, zu viel zu essen'), h('td', {}, 'übervoll')),
        ),
      ),
      h('p', { class: 'hint' }, 'Notieren: direkt nach dem Erfassen im Tagebuch unter «Hunger, Sättigung und Grund notieren».'),
    ),
    h(
      'section',
      { class: 'card stack-sm', 'aria-labelledby': 'ie-me-h', id: 'ie-me' },
      h('h2', { id: 'ie-me-h' }, 'Deine letzten 14 Tage'),
      s.hungerN + s.fullN
        ? h(
            'p',
            { class: 'small', id: 'ie-avg' },
            s.hungerAvg !== null ? `Hunger vorher im Schnitt ${fmt(s.hungerAvg, 1)} (${s.hungerN} Angaben)` : 'Noch kein Hunger notiert',
            ' · ',
            s.fullAvg !== null ? `Sättigung danach im Schnitt ${fmt(s.fullAvg, 1)} (${s.fullN} Angaben)` : 'noch keine Sättigung notiert',
          )
        : null,
      h('ul', { class: 'small', id: 'ie-feedback' }, ...scaleFeedback(s).map((t) => h('li', {}, t))),
    ),
    h(
      'section',
      { class: 'card stack-sm', 'aria-labelledby': 'ie-pr-h', id: 'ie-principles' },
      h('h2', { id: 'ie-pr-h' }, 'Die 10 Grundsätze'),
      h(
        'ol',
        { class: 'sos-steps' },
        ...PRINCIPLES.map(([t, d]) => h('li', {}, h('strong', {}, t), h('br', {}), h('span', { class: 'small' }, d))),
      ),
      h('p', { class: 'hint' }, 'Nach Tribole E, Resch E, Intuitive Eating (4. Auflage 2020), für diese App zusammengefasst.'),
    ),
    h(
      'section',
      { class: 'card stack-sm', 'aria-labelledby': 'ie-ev-h', id: 'ie-evidence' },
      h('h2', { id: 'ie-ev-h' }, 'Was die Forschung sagt'),
      h(
        'ul',
        { class: 'sos-idea-list' },
        h(
          'li',
          { class: 'sos-idea idea-warum' },
          h(
            'span',
            { class: 'idea-text' },
            'In 97 Studien hing intuitives Essen mit weniger gestörtem Essverhalten, besserem Körperbild, mehr Wohlbefinden und einem niedrigeren BMI zusammen. Die meisten Studien sind Momentaufnahmen; was Ursache und was Folge ist, bleibt offen.',
          ),
          h('small', { class: 'hint' }, 'Linardon J, Tylka TL, Fuller-Tyszkiewicz M, Int J Eat Disord 2021;54:1073–1098'),
        ),
        h(
          'li',
          { class: 'sos-idea idea-warum' },
          h(
            'span',
            { class: 'idea-text' },
            'Fürs Gewicht sind die Effekte klein: In 10 randomisierten Studien rund 0.35 kg mehr Abnahme als ohne Massnahme und kein Unterschied zu üblichen Diätprogrammen.',
          ),
          h('small', { class: 'hint' }, 'Fuentes Artiles R et al., Obes Rev 2019;20:1619–1627'),
        ),
        h(
          'li',
          { class: 'sos-idea idea-warum' },
          h(
            'span',
            { class: 'idea-text' },
            'Programme, die Essen nach inneren Signalen fördern, verbesserten Essverhalten und Wohlbefinden; strenge Diäten waren fürs Gewicht langfristig wenig wirksam.',
          ),
          h('small', { class: 'hint' }, 'Schaefer JT, Magnuson AB, J Acad Nutr Diet 2014;114:734–760'),
        ),
      ),
      h(
        'p',
        { class: 'small' },
        h('strong', {}, 'Darum ergänzend: '),
        'Zum Abnehmen braucht es ein Kaloriendefizit. Intuitive Elemente machen es leichter und freundlicher, ersetzen es aber nicht.',
      ),
    ),
    h(
      'div',
      { class: 'btn-row' },
      h('a', { href: '#gelueste', class: 'btn', id: 'ie-cravings' }, 'Gelüste und Mangel: Was ist belegt?'),
      h('a', { href: '#ernaehrung', class: 'btn' }, 'Zum Tagebuch'),
    ),
  );
}

/**
 * Deine 7-Tage-Werte der passenden Nährstoffe.
 * @param {Ctx} ctx
 * @param {import('../data/cravingcauses.js').CravingCause} c
 */
function personal(ctx, c) {
  const snap = ctx.snap;
  if (!snap) return null;
  const days = Array.from({ length: 7 }, (_, i) => ctx.state.days[addDays(ctx.today, -i)]?.food ?? []);
  const r = averageAmounts(days);
  if (!r.days) return h('p', { class: 'small muted', id: 'cc-mine' }, 'Für deine Werte fehlen noch Einträge der letzten 7 Tage.');
  const t = dailyTargets({ kcalTarget: snap.kcalTarget, proteinG: snap.protein.grams, sex: snap.profile.sex, stage: snap.lifeStage });
  const rows = c.nutrients.flatMap((k) => {
    const n = NUTRIENTS.find((x) => x.key === k);
    const v = r.amounts[k];
    const target = t[k];
    if (!n || v === undefined || !target) return [];
    const pct = Math.round((v / target) * 100);
    const limit = n.kind === 'limit';
    const text = limit
      ? pct > 100
        ? 'über dem Richtwert: ein Mangel ist sehr unwahrscheinlich'
        : 'unter dem Richtwert'
      : pct >= 100
        ? 'gedeckt: ein Mangel durch zu wenig Essen ist unwahrscheinlich'
        : pct >= 70
          ? 'knapp'
          : 'deutlich unter dem Richtwert: genauer anschauen';
    return [
      h(
        'li',
        {},
        h('strong', {}, `${n.label}: `),
        `Ø ${fmt(v, n.digits)} ${n.unit} von ${limit ? 'max. ' : ''}${fmt(target, n.digits)} ${n.unit} (${pct} %), ${text}.`,
      ),
    ];
  });
  return h(
    'div',
    { class: 'stack-sm', id: 'cc-mine' },
    h('h3', { class: 'eyebrow' }, 'Deine Werte (Schnitt 7 Tage)'),
    rows.length
      ? h('ul', { class: 'small' }, ...rows)
      : h('p', { class: 'small muted' }, 'Zu diesen Nährstoffen fehlen Angaben in deinen Einträgen.'),
    c.energy && snap.kcal < snap.kcalTarget * 0.6 && new Date().getHours() >= 15
      ? h(
          'p',
          { class: 'small' },
          `Heute erst ${fmt(snap.kcal)} von ${fmt(snap.kcalTarget)} kcal: Lust auf Brot oder Süsses ist dann oft einfach Hunger.`,
        )
      : null,
    h(
      'p',
      { class: 'hint' },
      `Beruht auf ${r.days} ${r.days === 1 ? 'Tag' : 'Tagen'} mit Einträgen; Nährstoffe sind für ${Math.round(r.coverage * 100)} % der Kalorien bekannt. Essdaten ersetzen keinen Bluttest.`,
    ),
  );
}

/** @param {Ctx} ctx */
export function viewCravings(ctx) {
  const c = CRAVING_CAUSES.find((x) => x.id === ctx.sub) ?? null;
  return h(
    'div',
    { class: 'stack' },
    h('h1', {}, 'Gelüste und Mangel'),
    h(
      'p',
      { class: 'small' },
      'Oft heisst es, Lust auf ein bestimmtes Lebensmittel zeige einen Mangel an. Belegt ist das nur in wenigen Fällen. Hier stehen nur diese belegten Zusammenhänge, dazu deine eigenen Werte.',
    ),
    h(
      'div',
      { class: 'chips', id: 'cc-chips', role: 'group', 'aria-label': 'Worauf hast du Lust?' },
      ...CRAVING_CAUSES.map((x) =>
        h(
          'a',
          {
            href: `#gelueste/${x.id}`,
            class: x === c ? 'chip chip-done' : 'chip',
            id: `cc-${x.id}`,
            'aria-current': x === c ? 'true' : undefined,
          },
          x.label,
        ),
      ),
    ),
    c
      ? h(
          'section',
          { class: 'card stack-sm', 'aria-labelledby': 'cc-h', id: 'cc-detail' },
          h('h2', { id: 'cc-h' }, `Lust auf ${c.label}`),
          c.evidence
            ? h(
                'div',
                { class: 'sos-idea idea-warum', id: 'cc-evidence' },
                h('span', { class: 'badge badge-ok' }, 'belegt'),
                h('span', { class: 'idea-text' }, c.evidence.text),
                h('small', { class: 'hint' }, c.evidence.ref),
              )
            : h('p', { class: 'small', id: 'cc-none' }, NO_EVIDENCE),
          c.check ? h('p', { class: 'note small', id: 'cc-check' }, c.check) : null,
          personal(ctx, c),
          h(
            'div',
            { class: 'btn-row' },
            h('a', { href: '#sos', class: 'btn primary' }, 'Zum Heisshunger-Notfall'),
            h('a', { href: '#lust', class: 'btn' }, 'Lust auf Bestimmtes: was hilft'),
          ),
        )
      : h('p', { class: 'small muted' }, 'Wähle oben, worauf du Lust hast.'),
  );
}
