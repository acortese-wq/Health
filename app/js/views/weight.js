// @ts-check
import { h, badge, fmt, fmtDate, fmtSigned } from '../ui/dom.js';
import { weightChart, barChart } from '../ui/chart.js';
import { METRICS, series, seriesStats, firstDataDate } from '../domain/history.js';
import { milestones } from '../domain/trend.js';
import { addDays, daysBetween } from '../domain/util.js';
import { KCAL_PER_KG } from '../domain/energy.js';

/** @typedef {import('../app.js').Ctx} Ctx */

const RANGES = [
  { id: '30', label: '30 Tage', days: 30 },
  { id: '90', label: '90 Tage', days: 90 },
  { id: 'plan', label: 'Ganzer Plan', days: 0 },
];
let range = '90';

/** Zeitraum des Gewichtsdiagramms setzen (z. B. «plan» für die Vorführung). @param {string} id */
export function setWeightRange(id) {
  if (RANGES.some((r) => r.id === id)) range = id;
}

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
    balanceCard(ctx, snap),
    historyCard(ctx, snap),
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

/** Verlauf der Tageswerte: Zeitraum und Kennzahl bleiben gewählt, solange die App offen ist. */
const hist = { range: '7', metric: /** @type {import('../domain/history.js').MetricId} */ ('kcal') };

const HIST_RANGES = [
  { id: '7', label: '7 Tage', days: 7 },
  { id: '30', label: '30 Tage', days: 30 },
  { id: 'alle', label: 'Alles', days: 0 },
];

/**
 * Tageswerte als Balken mit sichtbaren Lücken, Mittelwert und Tabelle.
 * @param {Ctx} ctx
 * @param {NonNullable<Ctx['snap']>} snap
 */
function historyCard(ctx, snap) {
  const p = snap.profile;
  const r = HIST_RANGES.find((x) => x.id === hist.range) ?? HIST_RANGES[0];
  const from = r.days ? addDays(ctx.today, -(r.days - 1)) : firstDataDate(ctx.state, ctx.today);
  const m = METRICS.find((x) => x.id === hist.metric) ?? METRICS[0];
  const pts = series(ctx.state, m.id, from, ctx.today);
  const st = seriesStats(pts, m.id);
  /** @type {Record<string, number | null>} */
  const targets = {
    kcal: snap.kcalTarget,
    protein: snap.protein.grams,
    steps: p.stepsTarget,
    sleep: p.sleepTargetH,
    water: p.waterTargetMl / 1000,
    training: null,
  };
  const seg = (
    /** @type {string} */ aria,
    /** @type {{ id: string, label: string }[]} */ items,
    /** @type {string} */ current,
    /** @type {(id: string) => void} */ set,
    /** @type {string} */ prefix,
  ) =>
    h(
      'div',
      { class: 'segmented wrap', role: 'group', 'aria-label': aria },
      ...items.map((x) =>
        h(
          'button',
          {
            type: 'button',
            id: `${prefix}-${x.id}`,
            'aria-pressed': String(x.id === current),
            on: {
              click: () => {
                set(x.id);
                ctx.go('fortschritt');
              },
            },
          },
          x.label,
        ),
      ),
    );
  const unit = m.unit;
  const fmtV = (/** @type {number} */ v) => `${fmt(v, m.digits)}${unit ? ` ${unit}` : ''}`;
  const hasPartial = pts.some((x) => x.partial && x.value !== null);
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'hist-h', id: 'history-card' },
    h(
      'div',
      { class: 'card-head' },
      h('h2', { id: 'hist-h' }, 'Tageswerte'),
      seg('Zeitraum', HIST_RANGES, hist.range, (id) => (hist.range = id), 'hist-range'),
    ),
    seg('Kennzahl', METRICS, hist.metric, (id) => (hist.metric = /** @type {any} */ (id)), 'hist-metric'),
    h(
      'p',
      { class: 'small', id: 'hist-summary' },
      st.mean !== null
        ? [
            h('strong', {}, `Ø ${fmtV(st.mean)}`),
            m.id === 'kcal' || m.id === 'protein' ? ` über ${st.basis} abgeschlossene Tage` : ` über ${st.basis} erfasste Tage`,
          ]
        : 'Noch keine Werte in diesem Zeitraum',
      ` · erfasst an ${st.recorded} von ${st.days} Tagen`,
    ),
    h(
      'div',
      { class: 'chart-wrap' },
      barChart({ points: pts, target: targets[m.id], unit, digits: m.digits, label: m.label, width: chartWidth() }),
    ),
    h(
      'ul',
      { class: 'legend' },
      h('li', { class: 'lg-bar' }, 'Tageswert'),
      hasPartial ? h('li', { class: 'lg-bar-partial' }, 'vorläufig (Tag nicht abgeschlossen)') : null,
      h('li', { class: 'lg-missing' }, 'nicht erfasst'),
      targets[m.id] ? h('li', { class: 'lg-goal' }, `Ziel ${fmtV(/** @type {number} */ (targets[m.id]))}`) : null,
    ),
    h(
      'details',
      { class: 'hist-table' },
      h('summary', {}, 'Als Tabelle'),
      h(
        'table',
        {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Datum'), h('th', {}, m.label), h('th', {}, 'Status'))),
        h(
          'tbody',
          {},
          ...[...pts]
            .reverse()
            .map((x) =>
              h(
                'tr',
                {},
                h('td', {}, fmtDate(x.date)),
                h('td', {}, x.value === null ? '–' : fmtV(x.value)),
                h('td', {}, x.value === null ? 'nicht erfasst' : x.partial ? 'vorläufig' : 'erfasst'),
              ),
            ),
        ),
      ),
    ),
  );
}

/**
 * Vorher → nachher seit Start: nur Werte, die am Anfang und zuletzt gemessen wurden
 * (mindestens 30 Tage auseinander).
 * @param {Ctx} ctx
 * @param {NonNullable<Ctx['snap']>} snap
 */
function balanceCard(ctx, snap) {
  const p = snap.profile;
  const s = ctx.state;
  /** @type {{ label: string, from: number, to: number, unit: string, digits: 0 | 1, better: 'down' | 'up' }[]} */
  const rows = [];
  /** @param {{ date: string, v: number }[]} list */
  const ends = (list) => {
    const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : 1));
    const a = sorted[0];
    const b = sorted[sorted.length - 1];
    return a && b && daysBetween(a.date, b.date) >= 30 ? { from: a.v, to: b.v } : null;
  };
  const days = Object.keys(s.days).sort();
  const span = days.length ? daysBetween(days[0], ctx.today) : 0;
  if (snap.series.length && daysBetween(p.startDate, ctx.today) >= 30)
    rows.push({ label: 'Gewicht (Trend)', from: p.startWeightKg, to: snap.weightKg, unit: 'kg', digits: 1, better: 'down' });
  const waist = ends(s.waist.map((w) => ({ date: w.date, v: w.cm })));
  if (waist) rows.push({ label: 'Taille', ...waist, unit: 'cm', digits: 1, better: 'down' });
  // Blutdruck: Mittel der ersten und der letzten Messwoche (Heimmessung)
  const home = s.bp.filter((b) => b.setting === 'home').sort((a, b) => (a.date < b.date ? -1 : 1));
  if (home.length >= 4 && daysBetween(home[0].date, home[home.length - 1].date) >= 30) {
    const first = home.filter((b) => daysBetween(home[0].date, b.date) < 7);
    const last = home.filter((b) => daysBetween(b.date, home[home.length - 1].date) < 7);
    const avg = (/** @type {typeof home} */ l, /** @type {'sys' | 'dia'} */ k) => Math.round(l.reduce((a, b) => a + b[k], 0) / l.length);
    rows.push({ label: 'Blutdruck systolisch', from: avg(first, 'sys'), to: avg(last, 'sys'), unit: 'mmHg', digits: 0, better: 'down' });
    rows.push({ label: 'Blutdruck diastolisch', from: avg(first, 'dia'), to: avg(last, 'dia'), unit: 'mmHg', digits: 0, better: 'down' });
  }
  const vo2 = ends(s.vo2max.map((v) => ({ date: v.date, v: v.value })));
  if (vo2) rows.push({ label: 'VO₂max', ...vo2, unit: 'ml/kg/min', digits: 0, better: 'up' });
  for (const [key, label, unit, digits] of /** @type {const} */ ([
    ['hba1c', 'HbA1c', '%', 1],
    ['ldl', 'LDL-Cholesterin', 'mmol/l', 1],
    ['tg', 'Triglyceride', 'mmol/l', 1],
    ['alt', 'ALT (Leber)', 'U/l', 0],
  ])) {
    const l = ends(s.labs.filter((x) => x.key === key).map((x) => ({ date: x.date, v: x.value })));
    if (l) rows.push({ label, ...l, unit, digits, better: 'down' });
  }
  // Ruhepuls und Schritte: erste gegen letzte 14 Tage
  if (span >= 60) {
    for (const [k, label, better] of /** @type {const} */ ([
      ['restingHr', 'Ruhepuls', 'down'],
      ['steps', 'Schritte pro Tag', 'up'],
    ])) {
      const first = days
        .slice(0, 14)
        .map((d) => s.days[d][k])
        .filter((v) => typeof v === 'number');
      const last = days
        .slice(-14)
        .map((d) => s.days[d][k])
        .filter((v) => typeof v === 'number');
      if (first.length >= 5 && last.length >= 5) {
        const m = (/** @type {number[]} */ l) => l.reduce((a, v) => a + v, 0) / l.length;
        rows.push({
          label,
          from: m(/** @type {number[]} */ (first)),
          to: m(/** @type {number[]} */ (last)),
          unit: k === 'steps' ? '' : '/min',
          digits: 0,
          better,
        });
      }
    }
  }
  if (rows.length < 2) return null;
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'bal-h', id: 'balance-card' },
    h('h2', { id: 'bal-h' }, `Bilanz seit ${fmtDate(p.startDate)}`),
    h(
      'table',
      { class: 'balance-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Wert'), h('th', {}, 'Start'), h('th', {}, 'Jetzt'), h('th', {}, 'Veränderung'))),
      h(
        'tbody',
        {},
        ...rows.map((r) => {
          const d = r.to - r.from;
          const good = r.better === 'down' ? d < 0 : d > 0;
          const u = r.unit ? ` ${r.unit}` : '';
          return h(
            'tr',
            {},
            h('th', {}, r.label),
            h('td', {}, `${fmt(r.from, r.digits)}${u}`),
            h('td', {}, `${fmt(r.to, r.digits)}${u}`),
            h('td', { class: Math.abs(d) < 10 ** -r.digits ? '' : good ? 'bal-good' : 'bal-bad' }, `${fmtSigned(d, r.digits)}${u}`),
          );
        }),
      ),
    ),
    h('p', { class: 'hint' }, 'Erste gegen letzte Messung. Laborwerte und Blutdruck ordnet die Hausärztin bzw. der Hausarzt ein.'),
  );
}
