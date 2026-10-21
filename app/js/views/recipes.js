// @ts-check
// Rezepte mit Nährwerten pro Portion, Filter, Einkaufsmengen und «Erfassen».

import { h, fmt, nowTime, badge } from '../ui/dom.js';
import { addFood } from '../store.js';
import { RECIPES, PRINCIPLES } from '../data/recipes.js';
import { mealEntry } from '../domain/mealplans.js';

/** @typedef {import('../app.js').Ctx} Ctx */

/** Originalrezepte der NDR-Sendung «Die Ernährungs-Docs» zum Thema Adipositas. */
const NDR_URL = 'https://www.ndr.de/ratgeber/kochen/rezepte/Rezepte-bei-Fettleibigkeit,fettleibigkeit110.html';
/** @typedef {import('../data/recipes.js').Recipe} Recipe */

/** Filter bleiben gewählt, solange die App offen ist. */
const view = {
  meal: /** @type {'' | import('../data/recipes.js').RecipeMeal} */ (''),
  veg: false,
  protein: false,
  light: false,
  people: 1,
};

const MEALS = /** @type {const} */ ([
  ['', 'Alle'],
  ['morgen', 'Frühstück'],
  ['mittag', 'Mittag'],
  ['abend', 'Znacht'],
  ['snack', 'Zwischendurch'],
]);

/**
 * Nährwerte einer Portion aus der Schweizer Nährwertdatenbank.
 * @param {Recipe} r
 */
export function recipeNutrition(r) {
  const parts = /** @type {[string, number][]} */ (r.ingredients.filter((i) => i.k && i.g > 0).map((i) => [i.k, i.g]));
  const e = mealEntry({ id: r.id, name: r.name, slots: [], parts });
  const { tags: _t, ...entry } = e;
  return entry;
}

/**
 * Sortierung «passt heute»: bei viel offenem Protein eiweissreiche zuerst, was das Restbudget
 * sprengt, nach hinten.
 * @param {Recipe[]} list
 * @param {number} kcalLeft
 * @param {number} proteinLeft
 */
export function rankRecipes(list, kcalLeft, proteinLeft) {
  return list
    .map((r) => {
      const n = recipeNutrition(r);
      let score = (n.protein * 4) / Math.max(n.kcal, 1) + n.fiber / 30;
      if (proteinLeft >= 25) score += (n.protein * 4) / Math.max(n.kcal, 1);
      if (n.kcal > kcalLeft + 50) score -= 1;
      return { r, n, score };
    })
    .sort((a, b) => b.score - a.score);
}

/** @param {Ctx} ctx */
export function viewRecipes(ctx) {
  const snap = ctx.snap;
  const kcalLeft = snap ? snap.kcalTarget - snap.kcal : 9999;
  const proteinLeft = snap ? snap.protein.grams - snap.proteinG : 0;
  const filtered = RECIPES.filter((r) => (!view.meal || r.meals.includes(view.meal)) && (!view.veg || r.veg));
  const ranked = rankRecipes(filtered, kcalLeft, proteinLeft).filter(
    (x) => (!view.protein || x.n.protein >= 25) && (!view.light || x.n.kcal <= 500),
  );
  const principle = (/** @type {string} */ id) => PRINCIPLES.find((p) => p.id === id);
  const toggle = (/** @type {'veg' | 'protein' | 'light'} */ key, /** @type {string} */ label) =>
    h(
      'button',
      {
        type: 'button',
        id: `rf-${key}`,
        'aria-pressed': String(view[key]),
        on: {
          click: () => {
            view[key] = !view[key];
            ctx.go('rezepte');
          },
        },
      },
      label,
    );
  return h(
    'div',
    { class: 'stack' },
    h('h1', {}, 'Rezepte'),
    h(
      'p',
      { class: 'lead' },
      'Einfache Rezepte nach Prinzipien, die auch die NDR-Sendung «Die Ernährungs-Docs» vertritt: viel Gemüse, Hülsenfrüchte, Eiweiss zu jeder Mahlzeit, gute Fette, wenig Zucker. Bewusst einfach: Zutaten aus dem Grossverteiler, gewürzt mit Salz, Pfeffer, Paprika und Kräutern. Es sind eigene Rezepte, keine Rezepte des NDR. Nährwerte pro Portion aus der Schweizer Nährwertdatenbank.',
    ),
    h(
      'p',
      { class: 'small' },
      'Originalrezepte der Sendung: ',
      h('a', { href: NDR_URL, target: '_blank', rel: 'noopener noreferrer', id: 'ndr-link' }, 'NDR: Rezepte bei Fettleibigkeit'),
    ),
    snap
      ? h(
          'p',
          { class: 'small', id: 'recipe-context' },
          `Sortiert nach «passt heute»: noch ${fmt(Math.max(0, kcalLeft))} kcal und ${fmt(Math.max(0, proteinLeft))} g Protein offen.`,
        )
      : null,
    h(
      'div',
      { class: 'stack-sm' },
      h(
        'div',
        { class: 'segmented wrap', role: 'group', 'aria-label': 'Mahlzeit' },
        ...MEALS.map(([id, label]) =>
          h(
            'button',
            {
              type: 'button',
              id: `rm-${id || 'alle'}`,
              'aria-pressed': String(view.meal === id),
              on: {
                click: () => {
                  view.meal = id;
                  ctx.go('rezepte');
                },
              },
            },
            label,
          ),
        ),
      ),
      h(
        'div',
        { class: 'segmented wrap', role: 'group', 'aria-label': 'Filter' },
        toggle('veg', 'Vegetarisch'),
        toggle('protein', 'Ab 25 g Protein'),
        toggle('light', 'Bis 500 kcal'),
      ),
      h(
        'div',
        { class: 'segmented wrap', role: 'group', 'aria-label': 'Einkaufsmengen für' },
        h('span', { class: 'small muted' }, 'Mengen für'),
        ...[1, 2, 4].map((n) =>
          h(
            'button',
            {
              type: 'button',
              id: `rp-${n}`,
              'aria-pressed': String(view.people === n),
              on: {
                click: () => {
                  view.people = n;
                  ctx.go('rezepte');
                },
              },
            },
            n === 1 ? '1 Person' : `${n} Personen`,
          ),
        ),
      ),
    ),
    ranked.length
      ? h(
          'ul',
          { class: 'recipe-list', id: 'recipe-list' },
          ...ranked.map(({ r, n }) =>
            h(
              'li',
              { class: 'card recipe', id: `recipe-${r.id}` },
              h(
                'details',
                {},
                h(
                  'summary',
                  {},
                  h('strong', { class: 'recipe-name' }, r.name),
                  h(
                    'span',
                    { class: 'small muted' },
                    `${fmt(n.kcal)} kcal · ${fmt(n.protein)} g Protein · ${fmt(n.fiber, 1)} g Ballaststoffe · ${r.minutes} Min.${r.veg ? ' · vegetarisch' : ''}`,
                  ),
                  n.kcal > kcalLeft + 50 && snap ? h('span', { class: 'small fast-tag' }, 'Mehr als heute noch übrig') : null,
                ),
                h('h3', { class: 'eyebrow' }, `Zutaten für ${view.people === 1 ? '1 Person' : `${view.people} Personen`}`),
                h(
                  'ul',
                  { class: 'small recipe-ingredients' },
                  ...r.ingredients.map((i) => h('li', {}, i.g ? `${fmt(i.g * view.people)} g ${i.label}` : i.label)),
                ),
                h('h3', { class: 'eyebrow' }, 'Zubereitung'),
                h('ol', { class: 'small' }, ...r.steps.map((st) => h('li', {}, st))),
                r.tip ? h('p', { class: 'note info small' }, r.tip) : null,
                h(
                  'p',
                  { class: 'small muted' },
                  `Pro Portion: ${fmt(n.kcal)} kcal · Protein ${fmt(n.protein)} g · Kohlenhydrate ${fmt(n.carbs)} g · Fett ${fmt(n.fat)} g · Ballaststoffe ${fmt(n.fiber, 1)} g · Salz ${fmt(n.salt, 1)} g (ohne Salz zum Würzen)`,
                ),
                h(
                  'div',
                  { class: 'recipe-principles' },
                  ...r.principles.map((pid) => {
                    const p = principle(pid);
                    return p ? badge(p.evidence === 'hoch' ? 'ok' : p.evidence === 'mittel' ? 'info' : 'warn', p.title) : null;
                  }),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'btn primary small-btn',
                    id: `recipe-add-${r.id}`,
                    disabled: !ctx.state.profile,
                    on: {
                      click: () =>
                        ctx.commit(
                          (s) =>
                            addFood(s, ctx.date, {
                              ...n,
                              name: `${r.name} (1 Portion)`,
                              time: ctx.date === ctx.today ? nowTime() : '12:00',
                            }) !== null,
                          `${r.name} erfasst`,
                        ),
                    },
                  },
                  '+ 1 Portion erfassen',
                ),
              ),
            ),
          ),
        )
      : h('p', { class: 'small', id: 'recipe-none' }, 'Kein Rezept passt zu diesen Filtern.'),
    h(
      'section',
      { class: 'card', 'aria-labelledby': 'princ-h', id: 'principles-card' },
      h('h2', { id: 'princ-h' }, 'Die Prinzipien und was die Studien sagen'),
      h(
        'p',
        { class: 'small' },
        'Themen, die in der Sendung häufig vorkommen, kritisch geprüft. Grün: gut belegt. Blau: teilweise belegt. Gelb: schwach belegt oder nur unter Bedingungen.',
      ),
      h(
        'ul',
        { class: 'behavior-list' },
        ...PRINCIPLES.map((p) =>
          h(
            'li',
            { class: `behavior sev-${p.evidence === 'hoch' ? 'ok' : p.evidence === 'mittel' ? 'info' : 'warn'}`, id: `princ-${p.id}` },
            h(
              'div',
              { class: 'behavior-head' },
              badge(p.evidence === 'hoch' ? 'ok' : p.evidence === 'mittel' ? 'info' : 'warn', `Belege: ${p.evidence}`),
              h('strong', {}, p.title),
            ),
            h('p', { class: 'small' }, p.text),
            h('p', { class: 'small' }, h('strong', {}, 'Studienlage: '), p.verdict),
            h('p', { class: 'hint' }, p.ref),
          ),
        ),
      ),
    ),
  );
}
