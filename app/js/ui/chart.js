// @ts-check
// Gewichtsdiagramm als SVG: Tagesmessungen (Punkte), Trend (Linie), Planlinie
// (gestrichelt) und Zielgewicht. Alle Farben kommen aus CSS-Tokens.

import { s } from './dom.js';
import { daysBetween, addDays } from '../domain/util.js';
import { fmt, fmtDate } from './dom.js';

/**
 * "Schöne" Achsenteilung (1, 2, 5 × 10^n).
 * @param {number} min
 * @param {number} max
 * @param {number} count gewünschte Anzahl Intervalle
 * @returns {{ lo: number, hi: number, step: number, ticks: number[] }}
 */
export function niceTicks(min, max, count = 5) {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(10)));
  return { lo, hi, step, ticks };
}

/**
 * @param {{
 *   from: string, to: string,
 *   points: { date: string, kg: number }[],
 *   trend: { date: string, kg: number }[],
 *   plan: { startDate: string, startKg: number, goalDate: string, goalKg: number },
 *   goalKg: number,
 *   width?: number,
 * }} o
 * @returns {SVGElement}
 */
export function weightChart({ from, to, points, trend, plan, goalKg, width = 640 }) {
  // Zeichenfläche in echten Pixeln, damit Schrift und Linien auf jedem Bildschirm gleich gross bleiben.
  const W = Math.round(Math.min(Math.max(width, 280), 1100));
  const H = Math.round(Math.min(Math.max(W * 0.45, 220), 340));
  const m = { top: 16, right: 16, bottom: 30, left: 44 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;

  const inRange = (/** @type {{date: string}} */ p) => p.date >= from && p.date <= to;
  const pts = points.filter(inRange);
  const tr = trend.filter(inRange);
  const planFrom = plan.startDate > from ? plan.startDate : from;
  const planTo = plan.goalDate < to ? plan.goalDate : to;
  const planPts =
    planFrom <= planTo
      ? [planFrom, planTo].map((d) => ({
          date: d,
          kg:
            plan.startKg +
            ((plan.goalKg - plan.startKg) * Math.max(0, daysBetween(plan.startDate, d))) /
              Math.max(1, daysBetween(plan.startDate, plan.goalDate)),
        }))
      : [];

  const ys = [...pts, ...tr, ...planPts].map((p) => p.kg).concat(goalKg);
  const yT = niceTicks(Math.min(...ys), Math.max(...ys), 5);
  const span = Math.max(1, daysBetween(from, to));
  const x = (/** @type {string} */ d) => m.left + (daysBetween(from, d) / span) * iw;
  const y = (/** @type {number} */ kg) => m.top + ih - ((kg - yT.lo) / (yT.hi - yT.lo)) * ih;

  // x-Achse: 4–6 Datumsmarken gleichmässig verteilt
  const xCount = Math.min(W < 480 ? 2 : 5, span);
  const xTicks = Array.from({ length: xCount + 1 }, (_, i) => addDays(from, Math.round((span * i) / xCount)));

  const path = (/** @type {{date: string, kg: number}[]} */ arr) =>
    arr.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.kg).toFixed(1)}`).join('');

  const last = tr[tr.length - 1];
  return s(
    'svg',
    { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': `Gewichtsverlauf vom ${fmtDate(from)} bis ${fmtDate(to)}` },
    s('g', { class: 'grid' }, ...yT.ticks.map((t) => s('line', { x1: m.left, x2: W - m.right, y1: y(t), y2: y(t) }))),
    s(
      'g',
      { class: 'axis' },
      ...yT.ticks.map((t) => s('text', { x: m.left - 8, y: y(t) + 4, 'text-anchor': 'end' }, fmt(t, yT.step < 1 ? 1 : 0))),
    ),
    s(
      'g',
      { class: 'axis' },
      ...xTicks.map((d, i) =>
        s('text', { x: x(d), y: H - 8, 'text-anchor': i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle' }, fmtDate(d, 'dm')),
      ),
    ),
    s('line', { class: 'goal-line', x1: m.left, x2: W - m.right, y1: y(goalKg), y2: y(goalKg) }),
    s('text', { class: 'goal-label', x: W - m.right - 4, y: y(goalKg) - 6, 'text-anchor': 'end' }, `Ziel ${fmt(goalKg, 1)} kg`),
    planPts.length === 2 ? s('path', { class: 'plan-line', d: path(planPts) }) : null,
    s(
      'g',
      { class: 'dots' },
      ...pts.map((p) => s('circle', { cx: x(p.date), cy: y(p.kg), r: 3 }, s('title', {}, `${fmtDate(p.date)}: ${fmt(p.kg, 1)} kg`))),
    ),
    tr.length > 1 ? s('path', { class: 'trend-line', d: path(tr) }) : null,
    last ? s('circle', { class: 'trend-end', cx: x(last.date), cy: y(last.kg), r: 5 }) : null,
  );
}
