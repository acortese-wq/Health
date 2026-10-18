// @ts-check
import { h, badge, fmt, fmtDate, fmtSigned } from '../ui/dom.js';
import { weightChart } from '../ui/chart.js';
import { milestones } from '../domain/trend.js';
import { addDays } from '../domain/util.js';
import { KCAL_PER_KG } from '../domain/energy.js';

/** @typedef {import('../app.js').Ctx} Ctx */

const RANGES = [
  { id: '30', label: '30 Tage', days: 30 },
  { id: '90', label: '90 Tage', days: 90 },
  { id: 'plan', label: 'Ganzer Plan', days: 0 },
];
let range = '90';

/** @param {Ctx} ctx */
export function viewWeight(ctx) {
  const snap = /** @type {NonNullable<Ctx['snap']>} */ (ctx.snap);
  const p = snap.profile;
  const plan = { startDate: p.startDate, startKg: p.startWeightKg, goalDate: p.goalDate, goalKg: p.goalWeightKg };
  const r = RANGES.find((x) => x.id === range) ?? RANGES[1];
  const firstData = snap.series[0]?.date ?? ctx.today;
  // Zeitraum nicht vor die erste Messung bzw. den Planstart legen (keine leeren Monate)
  const earliest = [p.startDate, firstData].sort()[0];
  const from = r.days ? [addDays(ctx.today, -(r.days - 1)), earliest].sort()[1] : earliest;
  const to = r.days ? ctx.today : p.goalDate > ctx.today ? p.goalDate : ctx.today;

  return h(
    'div',
    { class: 'stack' },
    h('h1', {}, 'Fortschritt'),
    h(
      'section',
      { class: 'card', 'aria-labelledby': 'chart-h' },
      h(
        'div',
        { class: 'card-head' },
        h('h2', { id: 'chart-h' }, 'Verlauf'),
        h(
          'div',
          { class: 'segmented', role: 'group', 'aria-label': 'Zeitraum' },
          ...RANGES.map((x) =>
            h(
              'button',
              {
                type: 'button',
                id: `range-${x.id}`,
                'aria-pressed': String(x.id === range),
                on: {
                  click: () => {
                    range = x.id;
                    ctx.go('fortschritt');
                  },
                },
              },
              x.label,
            ),
          ),
        ),
      ),
      snap.series.length
        ? h(
            'div',
            { class: 'chart-wrap' },
            weightChart({ from, to, points: snap.series, trend: snap.trend, plan, goalKg: p.goalWeightKg, width: chartWidth() }),
          )
        : h(
            'p',
            { class: 'empty' },
            'Noch keine Gewichtswerte. Erfasse dein Gewicht unter «Heute». Ab der ersten Messung erscheint hier der Verlauf.',
          ),
      h(
        'ul',
        { class: 'legend' },
        h('li', { class: 'lg-dot' }, 'Tagesmessung'),
        h('li', { class: 'lg-trend' }, 'Trend (geglättet)'),
        h('li', { class: 'lg-plan' }, 'Plan'),
        h('li', { class: 'lg-goal' }, 'Ziel'),
      ),
    ),
    h('div', { class: 'grid-2' }, progressCard(ctx, snap), energyCard(snap)),
    milestoneCard(ctx, snap, plan),
  );
}

/**
 * @param {Ctx} ctx
 * @param {NonNullable<Ctx['snap']>} snap
 */
function progressCard(ctx, snap) {
  const p = snap.profile;
  const lost = p.startWeightKg - snap.weightKg;
  const total = p.startWeightKg - p.goalWeightKg;
  const share = total > 0 ? Math.min(Math.max(lost / total, 0), 1) : 1;
  const perWeek = snap.slope ? snap.slope.slopeKgPerDay * 7 : null;
  const pctWeek = perWeek !== null ? (perWeek / snap.weightKg) * 100 : null;
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'prog-h' },
    h('h2', { id: 'prog-h' }, 'Fortschritt'),
    h('p', { class: 'big' }, h('strong', {}, fmtSigned(-lost, 1)), ' kg', h('small', {}, ` seit ${fmtDate(p.startDate)}`)),
    h(
      'div',
      {
        class: 'meter-track',
        role: 'progressbar',
        'aria-label': 'Anteil am Ziel',
        'aria-valuenow': String(Math.round(share * 100)),
        'aria-valuemax': '100',
      },
      fillBar(share),
    ),
    h(
      'dl',
      { class: 'kv' },
      h('dt', {}, 'Trendgewicht'),
      h('dd', {}, `${fmt(snap.weightKg, 1)} kg`),
      h('dt', {}, 'Tempo (Trend, 21 Tage)'),
      h('dd', {}, perWeek === null ? 'ab 7 Messungen über 10 Tage' : `${fmtSigned(perWeek, 2)} kg/Woche (${fmtSigned(pctWeek ?? 0, 1)} %)`),
      h('dt', {}, 'Prognose Ziel'),
      h(
        'dd',
        {},
        snap.projected ? fmtDate(snap.projected) : '–',
        snap.projected && snap.projected > p.goalDate ? badge('info', 'nach Zieldatum') : null,
      ),
      h('dt', {}, 'BMI'),
      h('dd', {}, `${fmt(snap.bmi.value, 1)} `, badge(snap.bmi.severity, snap.bmi.label)),
    ),
    h('p', { class: 'muted small' }, 'Sinnvolles Tempo: 0.5–1 % des Körpergewichts pro Woche. Schneller kostet Muskelmasse.'),
  );
}

/** @param {number} share */
function fillBar(share) {
  const el = h('div', { class: 'meter-fill' });
  el.style.width = `${(share * 100).toFixed(1)}%`;
  return el;
}

/** @param {NonNullable<Ctx['snap']>} snap */
function energyCard(snap) {
  const a = snap.adaptive;
  const plan = snap.plan;
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'en-h' },
    h('h2', { id: 'en-h' }, 'Energiebedarf'),
    h(
      'dl',
      { class: 'kv' },
      h('dt', {}, 'Grundumsatz (Mifflin-St Jeor)'),
      h('dd', {}, `${fmt(snap.bmr)} kcal`),
      h('dt', {}, 'Bedarf laut Formel'),
      h('dd', {}, `${fmt(snap.tdeeFormula)} kcal`),
      h('dt', {}, 'Bedarf aus deinen Daten'),
      h('dd', {}, a ? `${fmt(a.tdee)} kcal` : 'noch nicht genug Daten', a ? h('small', { class: 'muted' }, ` (${a.days} Tage)`) : null),
      h('dt', {}, 'Tagesziel'),
      h('dd', {}, h('strong', {}, `${fmt(snap.kcalTarget)} kcal`), snap.profile.kcalOverride !== null ? badge('info', 'manuell') : null),
      h('dt', {}, 'Defizit'),
      h('dd', {}, `${fmt(snap.tdee - snap.kcalTarget)} kcal ≈ ${fmt(((snap.tdee - snap.kcalTarget) * 7) / KCAL_PER_KG, 2)} kg/Woche`),
      h('dt', {}, 'Protein'),
      h(
        'dd',
        {},
        `${fmt(snap.protein.grams)} g`,
        h('small', { class: 'muted' }, ` (Bereich ${fmt(snap.protein.rangeLow)}–${fmt(snap.protein.rangeHigh)} g)`),
      ),
    ),
    !plan.feasible && !plan.maintenance
      ? h(
          'p',
          { class: 'note warn' },
          `Dein Zieldatum würde ${fmt(plan.requiredRateKgPerWeek, 2)} kg pro Woche erfordern. Begrenzt auf ${fmt(plan.rateKgPerWeek, 2)} kg pro Woche erreichst du das Ziel am ${plan.projectedGoalDate ? fmtDate(plan.projectedGoalDate) : '–'}.`,
        )
      : null,
    plan.belowBmr
      ? h(
          'p',
          { class: 'note info' },
          'Das Ziel liegt unter dem Grundumsatz. Das ist kurzfristig vertretbar, aber achte besonders auf Protein und Krafttraining.',
        )
      : null,
    h(
      'p',
      { class: 'muted small' },
      'Die Formel schätzt deinen Bedarf auf etwa ±10–15 % genau. Sobald 10 vollständig erfasste Tage und ein Gewichtstrend vorliegen, rechnet die App mit deinem gemessenen Verbrauch.',
    ),
  );
}

/**
 * @param {Ctx} ctx
 * @param {NonNullable<Ctx['snap']>} snap
 * @param {{ startDate: string, startKg: number, goalDate: string, goalKg: number }} plan
 */
function milestoneCard(ctx, snap, plan) {
  const ms = milestones(plan);
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'ms-h' },
    h('h2', { id: 'ms-h' }, 'Zwischenziele'),
    h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        {},
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            h('th', { scope: 'col' }, 'Datum'),
            h('th', { scope: 'col' }, 'Plan'),
            h('th', { scope: 'col' }, 'Ist (Trend)'),
            h('th', { scope: 'col' }, 'Status'),
          ),
        ),
        h(
          'tbody',
          {},
          ...ms.map((m) => {
            const past = m.date <= ctx.today;
            const actual = past ? trendAt(snap.trend, m.date) : null;
            const ok = actual !== null && actual <= m.kg + 0.3;
            return h(
              'tr',
              {},
              h('td', {}, fmtDate(m.date)),
              h('td', { class: 'num' }, `≤ ${fmt(m.kg, 1)} kg`),
              h('td', { class: 'num' }, actual === null ? '–' : `${fmt(actual, 1)} kg`),
              h(
                'td',
                {},
                !past
                  ? badge('info', 'offen')
                  : actual === null
                    ? badge('info', 'keine Daten')
                    : ok
                      ? badge('ok', 'erreicht')
                      : badge('warn', 'verfehlt'),
              ),
            );
          }),
        ),
      ),
    ),
  );
}

/**
 * Letzter Trendwert bis zum Datum.
 * @param {{ date: string, kg: number }[]} trend
 * @param {string} date
 */
function trendAt(trend, date) {
  let v = null;
  for (const t of trend) if (t.date <= date) v = t.kg;
  return v;
}

/** Verfügbare Breite in der Karte (Seitenrand, Navigation ab 960 px und Kartenpolster abgezogen). */
function chartWidth() {
  const vw = document.documentElement.clientWidth || window.innerWidth;
  const content = Math.min(vw >= 960 ? vw - 200 : vw, 1180) - 32;
  return content - 38;
}
