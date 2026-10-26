// @ts-check
// Garmin-Dashboard: Schritte, Schlaf, Ruhepuls, VO₂max, Belastung und Aktivitäten auf einen Blick,
// wie die Übersicht in Garmin Connect. Quelle: Garmin-CSV, Kurzbefehl (Apple Health) und eigene Einträge.

import { h, badge, fmt, fmtDate } from '../ui/dom.js';
import { barChart, lineChart } from '../ui/chart.js';
import { series } from '../domain/history.js';
import { garminSummary, pace } from '../domain/garmin.js';
import { addDays } from '../domain/util.js';
import { RUN_TYPES } from '../domain/training.js';
import { healthPasteBlock } from './garmin.js';

/** @typedef {import('../app.js').Ctx} Ctx */

/** Verfügbare Breite in der Karte. */
function chartWidth() {
  const vw = document.documentElement.clientWidth || window.innerWidth;
  const content = Math.min(vw >= 960 ? vw - 200 : vw, 1180) - 32;
  return content - 38;
}

/**
 * @param {string} label
 * @param {string} value
 * @param {string} unit
 * @param {string} sub
 * @param {string} [tone]
 * @param {string} [id]
 */
function tile(label, value, unit, sub, tone = '', id = '') {
  return h(
    'div',
    { class: `stat ${tone}`, ...(id ? { id } : {}) },
    h('span', { class: 'stat-label' }, label),
    h('span', { class: 'stat-value' }, value, unit ? h('small', {}, ` ${unit}`) : null),
    h('span', { class: 'stat-sub' }, sub),
  );
}

/** @param {Ctx} ctx */
export function viewGarmin(ctx) {
  const g = garminSummary(ctx.state, ctx.today);
  const from14 = addDays(ctx.today, -13);
  const from30 = addDays(ctx.today, -29);
  const steps = series(ctx.state, 'steps', from14, ctx.today);
  const sleep = series(ctx.state, 'sleep', from14, ctx.today);
  const rhr = Array.from({ length: 30 }, (_, i) => {
    const date = addDays(from30, i);
    const v = ctx.state.days[date]?.restingHr;
    return { date, value: typeof v === 'number' ? v : null };
  });
  const rec = g.recovery;
  const activities = [...ctx.state.workouts].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 10);
  const none = !g.lastDaily && !g.lastActivityImport && !ctx.state.workouts.length;
  return h(
    'div',
    { class: 'stack' },
    h('h1', {}, 'Garmin-Dashboard'),
    h(
      'p',
      { class: 'small muted', id: 'garmin-freshness' },
      g.lastDaily ? `Tageswerte bis ${fmtDate(g.lastDaily)}` : 'Noch keine Tageswerte',
      ' · ',
      g.lastActivityImport ? `Garmin-Aktivitäten bis ${fmtDate(g.lastActivityImport)}` : 'noch keine Garmin-Aktivitäten importiert',
    ),
    none
      ? h(
          'p',
          { class: 'note info small' },
          'So füllt sich das Dashboard: Tageswerte (Schritte, Schlaf, Ruhepuls) per Kurzbefehl einfügen, Aktivitäten unter Training als Garmin-CSV importieren.',
        )
      : null,
    h(
      'section',
      { class: `card recovery-card rec-${rec.level}`, 'aria-labelledby': 'g-rec-h', id: 'garmin-recovery' },
      h(
        'div',
        { class: 'card-head' },
        h('h2', { id: 'g-rec-h' }, 'Erholung heute'),
        badge(
          rec.level === 'gut' ? 'ok' : rec.level === 'mittel' ? 'warn' : rec.level === 'achtung' ? 'alert' : 'info',
          rec.level === 'gut' ? 'Gut' : rec.level === 'mittel' ? 'Eingeschränkt' : rec.level === 'achtung' ? 'Achtung' : 'Offen',
        ),
      ),
      h('p', { class: 'small' }, rec.text),
      h(
        'p',
        { class: 'hint' },
        'Aus Ruhepuls (7 Tage gegen deinen Basiswert der Wochen davor) und Schlaf. Garmins «Body Battery» und HRV werden nicht übertragen.',
      ),
    ),
    h(
      'section',
      { class: 'summary', 'aria-label': 'Kennzahlen', id: 'garmin-tiles' },
      tile(
        'Schritte',
        g.steps ? fmt(g.steps.value) : '–',
        '',
        g.steps ? `Ziel ${fmt(g.stepsTarget)}${g.steps7 !== null ? ` · Ø 7 T ${fmt(g.steps7)}` : ''}` : 'Noch nicht erfasst',
        g.steps && g.steps.value >= g.stepsTarget ? 'good' : '',
        'g-steps',
      ),
      tile(
        'Schlaf',
        g.sleep ? fmt(g.sleep.value, 1) : '–',
        g.sleep ? 'h' : '',
        g.sleep ? `Ziel ${fmt(g.sleepTarget, 1)} h${g.sleep7 !== null ? ` · Ø 7 T ${fmt(g.sleep7, 1)} h` : ''}` : 'Noch nicht erfasst',
        g.sleep && g.sleep.value >= Math.min(7, g.sleepTarget) ? 'good' : '',
        'g-sleep',
      ),
      tile(
        'Ruhepuls',
        g.rhr ? fmt(g.rhr.value) : '–',
        g.rhr ? '/min' : '',
        g.rhrBase !== null
          ? `Basis ${fmt(g.rhrBase)}${g.rhrDelta !== null ? ` · 7 T ${g.rhrDelta >= 0 ? '+' : '−'}${fmt(Math.abs(g.rhrDelta), 1)}` : ''}`
          : 'Basis ab 10 Messtagen',
        g.rhrDelta !== null && g.rhrDelta > 5 ? 'bad' : '',
        'g-rhr',
      ),
      tile(
        'VO₂max',
        g.vo2 ? fmt(g.vo2.value) : '–',
        g.vo2 ? 'ml/kg/min' : '',
        g.vo2
          ? `${fmtDate(g.vo2.date)}${g.vo2Change !== null ? ` · ${g.vo2Change >= 0 ? '+' : '−'}${fmt(Math.abs(g.vo2Change))} seit 2 Mt.` : ''}`
          : 'Unter Gesundheit eintragen',
        g.vo2Change !== null && g.vo2Change > 0 ? 'good' : '',
        'g-vo2',
      ),
      tile(
        'Intensitätsminuten',
        fmt(g.week.equivalent),
        '/ 150',
        'letzte 7 Tage, intensiv zählt doppelt (WHO)',
        g.week.aerobicMet ? 'good' : '',
        'g-intensity',
      ),
      tile('Laufen', fmt(g.km7, 1), 'km', `${g.runs7} ${g.runs7 === 1 ? 'Lauf' : 'Läufe'} in 7 Tagen`, '', 'g-run'),
    ),
    h(
      'section',
      { class: 'card stack-sm', 'aria-labelledby': 'g-steps-h' },
      h('h2', { id: 'g-steps-h' }, 'Schritte, 14 Tage'),
      h(
        'div',
        { class: 'chart-wrap' },
        barChart({ points: steps, target: g.stepsTarget, unit: '', label: 'Schritte', width: chartWidth() }),
      ),
      h('ul', { class: 'legend' }, h('li', { class: 'lg-bar' }, 'Tageswert'), h('li', { class: 'lg-goal' }, `Ziel ${fmt(g.stepsTarget)}`)),
    ),
    h(
      'section',
      { class: 'card stack-sm', 'aria-labelledby': 'g-sleep-h' },
      h('h2', { id: 'g-sleep-h' }, 'Schlaf, 14 Tage'),
      h(
        'div',
        { class: 'chart-wrap' },
        barChart({ points: sleep, target: g.sleepTarget, unit: 'h', digits: 1, label: 'Schlaf', width: chartWidth() }),
      ),
      h(
        'ul',
        { class: 'legend' },
        h('li', { class: 'lg-bar' }, 'Stunden'),
        h('li', { class: 'lg-goal' }, `Ziel ${fmt(g.sleepTarget, 1)} h`),
      ),
    ),
    h(
      'section',
      { class: 'card stack-sm', 'aria-labelledby': 'g-rhr-h' },
      h('h2', { id: 'g-rhr-h' }, 'Ruhepuls, 30 Tage'),
      rhr.some((p) => p.value !== null)
        ? [
            h(
              'div',
              { class: 'chart-wrap' },
              lineChart({ points: rhr, baseline: g.rhrBase, unit: '/min', label: 'Ruhepuls', width: chartWidth() }),
            ),
            h(
              'ul',
              { class: 'legend' },
              h('li', {}, 'Ruhepuls'),
              g.rhrBase !== null ? h('li', { class: 'lg-plan' }, `Basiswert ${fmt(g.rhrBase)}`) : null,
            ),
            h(
              'p',
              { class: 'hint' },
              'Sinkt der Ruhepuls über Wochen, verbessert sich die Ausdauer. Ein Anstieg um mehr als 5 Schläge für mehrere Tage spricht für Erholungsbedarf (Buchheit 2014).',
            ),
          ]
        : h('p', { class: 'small muted' }, 'Noch keine Ruhepuls-Werte.'),
    ),
    h(
      'section',
      { class: 'card stack-sm', 'aria-labelledby': 'g-act-h', id: 'garmin-activities' },
      h(
        'div',
        { class: 'card-head' },
        h('h2', { id: 'g-act-h' }, 'Letzte Aktivitäten'),
        h('a', { href: '#training', class: 'link-btn' }, 'Importieren'),
      ),
      activities.length
        ? h(
            'ul',
            { class: 'entries' },
            ...activities.map((w) => {
              const run = w.kind === 'run' ? /** @type {import('../domain/training.js').RunWorkout} */ (w) : null;
              return h(
                'li',
                {},
                h('span', { class: 'entry-time' }, fmtDate(w.date, 'dm')),
                h(
                  'span',
                  { class: 'entry-name' },
                  run ? (RUN_TYPES[run.runType]?.label ?? 'Lauf') : 'Krafttraining',
                  w.id.startsWith('garmin-') ? h('small', { class: 'muted' }, ' · Garmin') : null,
                ),
                h(
                  'span',
                  { class: 'entry-num' },
                  run
                    ? [
                        `${fmt(run.minutes)} min`,
                        run.km ? ` · ${fmt(run.km, 1)} km · ${pace(run.minutes, run.km)} /km` : '',
                        run.avgHr ? ` · Ø ${fmt(run.avgHr)} /min` : '',
                      ].join('')
                    : `${/** @type {any} */ (w).sets?.length ?? 0} Sätze`,
                ),
              );
            }),
          )
        : h('p', { class: 'small muted' }, 'Noch keine Aktivitäten. Unter Training lässt sich der Garmin-CSV-Export importieren.'),
    ),
    h(
      'section',
      { class: 'card stack-sm', 'aria-labelledby': 'g-in-h' },
      h('h2', { id: 'g-in-h' }, `Tageswerte für ${fmtDate(ctx.date)} einfügen`),
      healthPasteBlock(ctx),
    ),
  );
}
