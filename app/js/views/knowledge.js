// @ts-check
import { h } from '../ui/dom.js';
import { EVIDENCE, LEVELS } from '../domain/evidence.js';

/** @typedef {import('../app.js').Ctx} Ctx */

/** @type {string} */
let filter = 'alle';

const LEVEL_CLASS = /** @type {Record<string, string>} */ ({
  'gut belegt': 'lvl-strong',
  'wahrscheinlich sinnvoll': 'lvl-likely',
  unsicher: 'lvl-unsure',
  unbelegt: 'lvl-none',
});

/** @param {Ctx} ctx */
export function viewKnowledge(ctx) {
  const items = filter === 'alle' ? EVIDENCE : EVIDENCE.filter((e) => e.level === filter);
  const topics = [...new Set(items.map((e) => e.topic))];
  return h(
    'div',
    { class: 'stack' },
    h('h1', {}, 'Wissen'),
    h(
      'p',
      { class: 'lead' },
      'Was ist belegt, und was ist ein Mythos? Jede Aussage hat einen Evidenzgrad und, wo vorhanden, die Originalquelle.',
    ),
    h(
      'div',
      { class: 'segmented wrap', role: 'group', 'aria-label': 'Nach Evidenzgrad filtern' },
      ...['alle', ...LEVELS].map((l) =>
        h(
          'button',
          {
            type: 'button',
            id: `lvl-${l.replace(/\s+/g, '-')}`,
            'aria-pressed': String(l === filter),
            on: {
              click: () => {
                filter = l;
                ctx.go('wissen');
              },
            },
          },
          l === 'alle' ? 'Alle' : l,
        ),
      ),
    ),
    ...topics.map((t) =>
      h(
        'section',
        { class: 'card', 'aria-labelledby': `topic-${t}` },
        h('h2', { id: `topic-${t}` }, t),
        h(
          'ul',
          { class: 'evidence' },
          ...items
            .filter((e) => e.topic === t)
            .map((e) =>
              h(
                'li',
                {},
                h('span', { class: `level ${LEVEL_CLASS[e.level]}` }, e.level),
                h('h3', {}, e.claim),
                h('p', {}, e.detail),
                e.refs.length ? h('p', { class: 'refs' }, e.refs.join(' · ')) : null,
              ),
            ),
        ),
      ),
    ),
  );
}
