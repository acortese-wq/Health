// @ts-check
// Rückblick-Karte: Gestern, Heute oder die letzten 7 Tage.

import { h, badge } from '../ui/dom.js';
import { snapshot } from '../model.js';
import { dayReview, streaks, weekReview } from '../domain/review.js';
import { rangeSummary } from '../domain/training.js';
import { addDays } from '../domain/util.js';

/** @typedef {import('../app.js').Ctx} Ctx */

/** @type {'yesterday' | 'today' | 'week' | null} */
let mode = null;

/** Abends gilt der Tag als abgeschlossen. */
function dayOver(/** @type {string} */ date, /** @type {string} */ today) {
  return date < today || new Date().getHours() >= 20;
}

/** @param {Ctx} ctx */
export function reviewCard(ctx) {
  const state = ctx.state;
  const snap = /** @type {NonNullable<Ctx['snap']>} */ (ctx.snap);
  const base = ctx.date;
  const prev = addDays(base, -1);
  const hasPrev = Boolean(state.days[prev]);
  const current = mode ?? (hasPrev && !dayOver(base, ctx.today) ? 'yesterday' : 'today');
  const st = streaks(state.days, base, snap.protein.grams);

  let review;
  if (current === 'week') {
    const days = Array.from({ length: 7 }, (_, i) => snapshot(state, addDays(base, i - 6)));
    review = weekReview(days, {
      week: rangeSummary(state.workouts, addDays(base, -6), base),
      slopeKgPerDay: snap.slope?.slopeKgPerDay ?? null,
      weightKg: snap.weightKg,
      stepsTarget: snap.profile.stepsTarget,
      sleepTargetH: snap.profile.sleepTargetH,
      waterTargetMl: snap.profile.waterTargetMl,
      trainingMode: snap.profile.trainingMode,
      streaks: st,
    });
  } else {
    const d = current === 'yesterday' ? prev : base;
    review = dayReview(current === 'yesterday' ? snapshot(state, prev) : snap, {
      workouts: state.workouts,
      dayOver: dayOver(d, ctx.today),
      streaks: st,
    });
  }

  const tabs = /** @type {const} */ ([
    ['yesterday', 'Gestern'],
    ['today', base === ctx.today ? 'Heute' : 'Dieser Tag'],
    ['week', '7 Tage'],
  ]);
  const toneBadge = review.empty
    ? null
    : badge(review.tone === 'great' ? 'ok' : review.tone === 'good' ? 'info' : 'warn', `${review.met} von ${review.total} Zielen`);

  return h(
    'section',
    { class: `card review tone-${review.tone}`, 'aria-labelledby': 'review-h' },
    h(
      'div',
      { class: 'card-head' },
      h('h2', { id: 'review-h' }, 'Rückblick'),
      h(
        'div',
        { class: 'segmented', role: 'group', 'aria-label': 'Zeitraum des Rückblicks' },
        ...tabs.map(([id, label]) =>
          h(
            'button',
            {
              type: 'button',
              id: `review-${id}`,
              'aria-pressed': String(current === id),
              on: {
                click: () => {
                  mode = id;
                  ctx.go('heute');
                },
              },
            },
            label,
          ),
        ),
      ),
    ),
    h('div', { class: 'review-head' }, h('p', { class: 'review-headline', id: 'review-headline' }, review.headline), toneBadge),
    review.streaks.length ? h('ul', { class: 'streaks' }, ...review.streaks.map((t) => h('li', {}, t))) : null,
    review.wins.length
      ? h(
          'div',
          {},
          h('p', { class: 'eyebrow' }, 'Das lief gut'),
          h('ul', { class: 'review-list wins', id: 'review-wins' }, ...review.wins.map((w) => h('li', {}, w))),
        )
      : null,
    review.improve.length
      ? h(
          'div',
          {},
          h('p', { class: 'eyebrow' }, 'Da geht noch mehr'),
          h(
            'ul',
            { class: 'review-list improve', id: 'review-improve' },
            ...review.improve.map((i, n) =>
              h(
                'li',
                { class: n === 0 ? 'focus' : '' },
                n === 0 ? h('span', { class: 'eyebrow' }, current === 'week' ? 'Fokus nächste Woche' : 'Dein Fokus für morgen') : null,
                h('strong', {}, i.title),
                h('span', {}, i.tip),
              ),
            ),
          ),
        )
      : review.empty
        ? null
        : h('p', { class: 'review-focus', id: 'review-focus' }, review.focus),
  );
}
