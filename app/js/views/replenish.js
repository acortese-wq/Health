// @ts-check
// «Gezielt auffüllen» (#auffuellen/<nährstoff>): Lebensmittel und Rezepte mit viel von einem Nährstoff,
// eigener 7-Tage-Stand und belegte Tipps zur Aufnahme.

import { h, fmt } from '../ui/dom.js';
import { FOODS } from '../data/foods.js';
import { NUTRIENTS, averageAmounts, dailyTargets } from '../domain/micros.js';
import { REPLENISHABLE, richFoods, richRecipes, weakest, ABSORPTION } from '../domain/replenish.js';
import { addDays } from '../domain/util.js';
import { allRecipes, openRecipe } from './recipes.js';
import { addFood } from './nutrients.js';

/** @typedef {import('../app.js').Ctx} Ctx */
/** @typedef {import('../domain/micros.js').NutrientKey} NutrientKey */

/**
 * Link zur Seite für einen Nährstoff (z. B. aus «Gelüste und Mangel»).
 * @param {NutrientKey} key
 * @param {string} label
 */
export function replenishLink(key, label) {
  return h('a', { href: `#auffuellen/${key}`, class: 'link-btn small', id: `fill-${key}` }, `${label} gezielt auffüllen`);
}

/** @param {Ctx} ctx */
export function viewReplenish(ctx) {
  const snap = /** @type {NonNullable<Ctx['snap']>} */ (ctx.snap);
  const targets = dailyTargets({ kcalTarget: snap.kcalTarget, proteinG: snap.protein.grams, sex: snap.profile.sex, stage: snap.lifeStage });
  const days = Array.from({ length: 7 }, (_, i) => ctx.state.days[addDays(ctx.today, -i)]?.food ?? []);
  const avg = averageAmounts(days);
  const auto = avg.days ? weakest(avg.amounts, targets) : null;
  const key = /** @type {NutrientKey} */ (REPLENISHABLE.includes(/** @type {any} */ (ctx.sub)) ? ctx.sub : (auto ?? 'iron'));
  const n = /** @type {import('../domain/micros.js').NutrientDef} */ (NUTRIENTS.find((x) => x.key === key));
  const target = targets[key];
  const have = avg.amounts[key];
  const foods = richFoods(FOODS, key, { prefs: snap.profile.foodPrefs, target, limit: 8 });
  const recipes = richRecipes(allRecipes(ctx.state), key, { target, limit: 3 });
  const tips = ABSORPTION[key] ?? [];
  const v = (/** @type {number} */ x) => `${fmt(x, x < 10 ? 1 : 0)} ${n.unit}`;
  return h(
    'div',
    { class: 'stack' },
    h('h1', {}, 'Gezielt auffüllen'),
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'fill-pick' }, 'Nährstoff'),
      h(
        'select',
        {
          id: 'fill-pick',
          on: { change: (e) => ctx.go(`auffuellen/${/** @type {HTMLSelectElement} */ (e.target).value}`) },
        },
        ...REPLENISHABLE.map((k) => {
          const d = NUTRIENTS.find((x) => x.key === k);
          return h('option', { value: k, selected: k === key }, `${d?.label ?? k}${k === auto ? ' (bei dir am knappsten)' : ''}`);
        }),
      ),
    ),
    h(
      'section',
      { class: 'card stack-sm', id: 'fill-status' },
      h('h2', {}, n.label),
      avg.days && typeof have === 'number' && target
        ? h(
            'p',
            { class: 'small', id: 'fill-have' },
            `Dein Schnitt der letzten ${avg.days} ${avg.days === 1 ? 'Tag' : 'Tage'}: ${v(have)} von ${v(target)} (${Math.round((have / target) * 100)} %).`,
            have >= target ? ' Gedeckt.' : ` Es fehlen im Schnitt ${v(target - have)} pro Tag.`,
          )
        : h('p', { class: 'small muted' }, 'Für deinen Stand fehlen Einträge mit Nährstoffangaben.'),
      h('p', { class: 'hint' }, 'Aus deinen Essdaten geschätzt; ein Mangel lässt sich nur im Blut sicher feststellen.'),
    ),
    h(
      'section',
      { class: 'card stack-sm', 'aria-labelledby': 'fill-foods-h', id: 'fill-foods' },
      h('h2', { id: 'fill-foods-h' }, 'Lebensmittel mit viel ' + n.label),
      h(
        'p',
        { class: 'small muted' },
        'Pro übliche Portion; kalorienreiche Portionen stehen etwas weiter unten. Deine Vorlieben (Fisch, Fleisch, Milch) sind berücksichtigt.',
      ),
      foods.length
        ? h(
            'ul',
            { class: 'fill-list' },
            ...foods.map((x, i) =>
              h(
                'li',
                { class: 'fill-item' },
                h(
                  'div',
                  { class: 'fill-text' },
                  h('strong', {}, x.food.n),
                  h(
                    'span',
                    { class: 'small muted' },
                    `${x.portion} (${fmt(x.grams)} g) · ${v(x.amount)}${x.pct !== null ? ` · ${Math.round(x.pct * 100)} % des Tagesbedarfs` : ''} · ${fmt(x.kcal)} kcal`,
                  ),
                ),
                h(
                  'button',
                  { type: 'button', class: 'btn small-btn', id: `fill-add-${i}`, on: { click: () => addFood(ctx, x.food, x.grams) } },
                  '+ Erfassen',
                ),
              ),
            ),
          )
        : h('p', { class: 'small muted' }, 'Keine passenden Lebensmittel mit Angaben gefunden.'),
      h('p', { class: 'hint' }, 'Quelle: Schweizer Nährwertdatenbank (BLV), ergänzend USDA.'),
    ),
    recipes.length
      ? h(
          'section',
          { class: 'card stack-sm', 'aria-labelledby': 'fill-rec-h', id: 'fill-recipes' },
          h('h2', { id: 'fill-rec-h' }, 'Rezepte'),
          h(
            'ul',
            { class: 'fill-list' },
            ...recipes.map((x) =>
              h(
                'li',
                { class: 'fill-item' },
                h(
                  'div',
                  { class: 'fill-text' },
                  h('strong', {}, x.recipe.title),
                  h(
                    'span',
                    { class: 'small muted' },
                    `pro Portion ${x.partial ? 'mind. ' : ''}${v(x.amount)}${x.pct !== null ? ` · ${Math.round(x.pct * 100)} %` : ''} · ${fmt(x.kcal)} kcal`,
                  ),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'btn small-btn',
                    id: `fill-rec-${x.recipe.id}`,
                    on: {
                      click: () => {
                        openRecipe(x.recipe);
                        ctx.go('rezepte');
                      },
                    },
                  },
                  'Rezept',
                ),
              ),
            ),
          ),
        )
      : null,
    tips.length
      ? h(
          'section',
          { class: 'card stack-sm', 'aria-labelledby': 'fill-tips-h', id: 'fill-tips' },
          h('h2', { id: 'fill-tips-h' }, 'So nimmt der Körper es gut auf'),
          h(
            'ul',
            { class: 'sos-idea-list' },
            ...tips.map((t) =>
              h(
                'li',
                { class: 'sos-idea idea-vorbeugen' },
                h('span', { class: 'idea-text' }, t.text),
                t.ref ? h('small', { class: 'hint' }, t.ref) : null,
              ),
            ),
          ),
        )
      : null,
  );
}
