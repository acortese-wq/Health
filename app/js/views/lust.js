// @ts-check
// «Lust auf ein bestimmtes Essen» (z. B. Kuchen im Kühlschrank): Erklärung, Strategien mit Anleitung
// und Beweislage, Tipps fürs nächste Mal. Seite #lust, verlinkt aus dem Heisshunger-Notfall und dem Coach.

import { h } from '../ui/dom.js';
import { EXPLAIN, STRATEGIES, NEXT_TIME } from '../data/specificcraving.js';

const STRENGTH = /** @type {const} */ ({
  stark: ['ok', 'Beweislage: stark'],
  mittel: ['info', 'Beweislage: mittel'],
  vorläufig: ['warn', 'Beweislage: vorläufig'],
});

/** Geöffnete Strategie (eine zur Zeit, damit die Seite kurz bleibt). */
let open = 'weg';

/** Seite (ohne Abhängigkeit vom Zustand). */
export function viewLust() {
  return h(
    'div',
    { class: 'stack' },
    h('h1', {}, 'Lust auf ein bestimmtes Essen'),
    h(
      'p',
      { class: 'small' },
      'Du weisst, dass zuhause etwas wartet, z. B. ein Stück Kuchen im Kühlschrank, und spürst schon den Geschmack im Mund. Hier steht, was dabei passiert und was nachweislich hilft.',
    ),
    h(
      'section',
      { class: 'card stack-sm', 'aria-labelledby': 'lust-why-h', id: 'lust-why' },
      h('h2', { id: 'lust-why-h' }, 'Was gerade passiert'),
      h(
        'ul',
        { class: 'sos-idea-list' },
        ...EXPLAIN.map((e) =>
          h(
            'li',
            { class: 'sos-idea idea-warum' },
            h('strong', {}, e.title),
            h('span', { class: 'idea-text' }, e.text),
            h('small', { class: 'hint' }, e.ref),
          ),
        ),
      ),
    ),
    h(
      'section',
      { class: 'card stack-sm', 'aria-labelledby': 'lust-do-h', id: 'lust-do' },
      h('h2', { id: 'lust-do-h' }, 'Was hilft, Schritt für Schritt'),
      h('p', { class: 'small muted' }, 'Am besten in dieser Reihenfolge. Oft reichen die ersten zwei oder drei.'),
      ...STRATEGIES.map((s, i) =>
        h(
          'details',
          {
            class: 'lust-strategy',
            id: `lust-${s.id}`,
            open: open === s.id,
            on: {
              toggle: (e) => {
                if (/** @type {HTMLDetailsElement} */ (e.target).open) open = s.id;
              },
            },
          },
          h('summary', {}, h('span', { class: 'lust-num' }, String(i + 1)), h('span', {}, s.title)),
          h('ol', { class: 'sos-steps' }, ...s.steps.map((t) => h('li', {}, t))),
          h('p', { class: 'small' }, h('span', { class: `badge badge-${STRENGTH[s.strength][0]}` }, STRENGTH[s.strength][1]), ' ', s.why),
          h('p', { class: 'hint' }, s.ref),
          s.link ? h('a', { href: s.link.href, class: 'btn small-btn' }, s.link.label) : null,
        ),
      ),
    ),
    h(
      'section',
      { class: 'card stack-sm', 'aria-labelledby': 'lust-next-h', id: 'lust-next' },
      h('h2', { id: 'lust-next-h' }, 'Fürs nächste Mal'),
      h('ul', {}, ...NEXT_TIME.map((t) => h('li', { class: 'small' }, t))),
    ),
    h(
      'div',
      { class: 'btn-row' },
      h('a', { href: '#sos', class: 'btn primary', id: 'lust-sos' }, 'Zum Heisshunger-Notfall'),
      h('a', { href: '#achtsam', class: 'btn' }, 'Achtsamkeitsübungen'),
    ),
    h(
      'p',
      { class: 'hint' },
      'Beweislage: stark = Meta-Analyse oder mehrere Studien; mittel = einzelne kontrollierte Studien; vorläufig = einzelner Befund oder widersprüchliche Wiederholungen. Quellen geprüft im November 2026.',
    ),
  );
}
