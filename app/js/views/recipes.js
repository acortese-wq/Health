// @ts-check
// Rezepte & Ernährungsplanung: Bibliothek (Suche, Filter, Favoriten, eigene Rezepte,
// Quellen-Referenzen), Detail mit Portionsregler und Nährwerten, Editor, Import/Export.

import { h, fmt, nowTime, badge, fmtDate } from '../ui/dom.js';
import { addFood, uid } from '../store.js';
import { FOODS } from '../data/foods.js';
import { PRINCIPLES } from '../data/recipes.js';
import { NUTRIENTS, searchFoods } from '../domain/micros.js';
import { UNITS, toGrams } from '../domain/units.js';
import {
  builtinRecipes,
  recipeNutrition,
  scaleIngredients,
  detectAllergens,
  isVegetarian,
  principle,
  validateRecipe,
  importRecipes,
  parseReferenceCsv,
  exportRecipes,
  MEALS,
  SOURCE_COLLECTIONS,
} from '../domain/recipes.js';
import { addPlanned, entryFromRecipe } from '../domain/planner.js';
import { addDays } from '../domain/util.js';

/** @typedef {import('../app.js').Ctx} Ctx */
/** @typedef {import('../domain/recipes.js').Recipe} Recipe */

const BY_KEY = new Map(FOODS.map((f) => [f.k, f]));
const BUILTIN = builtinRecipes();

/** Ansicht merken, solange die App offen ist. */
const view = {
  q: '',
  meal: /** @type {'' | import('../domain/recipes.js').Meal} */ (''),
  fav: false,
  own: false,
  veg: false,
  protein: false,
  light: false,
  detail: '',
  servings: 1,
  confirmLog: false,
  editing: /** @type {Record<string, any> | null} */ (null),
  report: /** @type {{ added: number, skipped: { title: string, reason: string }[] } | null} */ (null),
};

/**
 * Alle Rezepte: eingebaute und gespeicherte (eigene, Referenzen, Importe).
 * @param {import('../store.js').State} state
 */
export function allRecipes(state) {
  return [...BUILTIN, ...state.recipes];
}

/** @param {import('../store.js').State} state */
export function recipeMap(state) {
  return new Map(allRecipes(state).map((r) => [r.id, r]));
}

const SOURCE_LABEL = { app: 'App-Rezept', eigen: 'Eigenes Rezept', referenz: 'Externe Referenz', lizenz: 'Lizenziert', ki: 'KI-Vorschlag' };
const STATUS_LABEL = {
  berechnet: 'Nährwerte berechnet (BLV)',
  teilweise: 'Nährwerte teilweise berechnet',
  'nicht verfügbar': 'Nährwerte nicht verfügbar',
};

/**
 * Zuletzt verwendet vorne einreihen.
 * @param {import('../store.js').State} s
 * @param {string} id
 */
export function touchRecent(s, id) {
  s.recentRecipes = [id, ...s.recentRecipes.filter((x) => x !== id)].slice(0, 12);
}

/**
 * Unternavigation des Moduls.
 * @param {'rezepte' | 'planung'} active
 */
export function moduleNav(active) {
  return h(
    'nav',
    { class: 'module-nav', 'aria-label': 'Rezepte und Planung' },
    h(
      'a',
      { href: '#rezepte', class: 'btn small-btn', 'aria-current': active === 'rezepte' ? 'page' : undefined, id: 'nav-rezepte' },
      'Rezepte',
    ),
    h(
      'a',
      { href: '#planung', class: 'btn small-btn', 'aria-current': active === 'planung' ? 'page' : undefined, id: 'nav-planung' },
      'Wochenplan und Einkauf',
    ),
  );
}

/** @param {Ctx} ctx */
export function viewRecipes(ctx) {
  if (view.editing) return editorView(ctx);
  const r = view.detail ? allRecipes(ctx.state).find((x) => x.id === view.detail) : null;
  return h(
    'div',
    { class: 'stack' },
    h('h1', {}, 'Rezepte und Ernährungsplanung'),
    moduleNav('rezepte'),
    r ? detailView(ctx, r) : libraryView(ctx),
  );
}

/** @param {Ctx} ctx */
function libraryView(ctx) {
  const snap = ctx.snap;
  const kcalLeft = snap ? snap.kcalTarget - snap.kcal : 9999;
  const proteinLeft = snap ? snap.protein.grams - snap.proteinG : 0;
  const favs = new Set(ctx.state.favorites);
  const norm = (/** @type {string} */ s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const q = norm(view.q.trim());
  const rows = allRecipes(ctx.state)
    .filter((r) => !view.meal || r.meals.includes(view.meal))
    .filter((r) => !view.fav || favs.has(r.id))
    .filter((r) => !view.own || r.source.kind !== 'app')
    .filter((r) => !view.veg || isVegetarian(r))
    .filter((r) => !q || norm([r.title, r.description ?? '', ...r.ingredients.map((i) => i.label)].join(' ')).includes(q))
    .map((r) => {
      const n = recipeNutrition(r, r.servings);
      const per = n.perServing;
      // «Passt heute»: Eiweiss pro kcal und Ballaststoffe; was das Restbudget sprengt, nach hinten
      let score = per ? (per.protein * 4) / Math.max(per.kcal, 1) + per.fiber / 30 : -5;
      if (per && proteinLeft >= 25) score += (per.protein * 4) / Math.max(per.kcal, 1);
      if (per && per.kcal > kcalLeft + 50) score -= 1;
      if (favs.has(r.id)) score += 0.3;
      return { r, per, score };
    })
    .filter((x) => !view.protein || (x.per && x.per.protein >= 25))
    .filter((x) => !view.light || (x.per && x.per.kcal <= 500))
    .sort((a, b) => b.score - a.score);
  const recent = ctx.state.recentRecipes
    .map((id) => allRecipes(ctx.state).find((r) => r.id === id))
    .filter((r) => r !== undefined)
    .slice(0, 6);
  const toggle = (/** @type {'fav' | 'own' | 'veg' | 'protein' | 'light'} */ key, /** @type {string} */ label) =>
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
    h(
      'p',
      { class: 'small muted' },
      'App-Rezepte nach Prinzipien, die auch die NDR-Sendung «Die Ernährungs-Docs» vertritt, deine eigenen Rezepte und Referenzen auf Originalrezepte. Nährwerte pro Portion aus der Schweizer Nährwertdatenbank.',
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
      h('label', { for: 'recipe-search', class: 'eyebrow' }, 'Suchen (Titel oder Zutat)'),
      h('input', {
        type: 'search',
        id: 'recipe-search',
        value: view.q,
        placeholder: 'z. B. Linsen, Quark, Fisch',
        on: {
          change: (e) => {
            view.q = /** @type {HTMLInputElement} */ (e.target).value;
            ctx.go('rezepte');
          },
        },
      }),
      h(
        'div',
        { class: 'segmented wrap', role: 'group', 'aria-label': 'Mahlzeit' },
        ...[['', 'Alle'], ...MEALS].map(([id, label]) =>
          h(
            'button',
            {
              type: 'button',
              id: `rm-${id || 'alle'}`,
              'aria-pressed': String(view.meal === id),
              on: {
                click: () => {
                  view.meal = /** @type {any} */ (id);
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
        toggle('fav', '★ Favoriten'),
        toggle('own', 'Eigene und Referenzen'),
        toggle('veg', 'Vegetarisch'),
        toggle('protein', 'Ab 25 g Protein'),
        toggle('light', 'Bis 500 kcal'),
      ),
    ),
    recent.length
      ? h(
          'div',
          { class: 'stack-sm' },
          h('h2', { class: 'eyebrow' }, 'Zuletzt verwendet'),
          h(
            'div',
            { class: 'chips', id: 'recent-recipes' },
            ...recent.map((r) =>
              h(
                'button',
                {
                  type: 'button',
                  class: 'chip',
                  on: {
                    click: () => {
                      openDetail(r);
                      ctx.go('rezepte');
                    },
                  },
                },
                r.title,
              ),
            ),
          ),
        )
      : null,
    h(
      'div',
      { class: 'btn-row' },
      h(
        'button',
        {
          type: 'button',
          class: 'btn primary',
          id: 'recipe-new',
          on: {
            click: () => {
              view.editing = blankDraft();
              ctx.go('rezepte');
            },
          },
        },
        '+ Eigenes Rezept',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn',
          id: 'recipe-new-ref',
          on: {
            click: () => {
              view.editing = { ...blankDraft(), kind: 'referenz', publisher: 'NDR', ingredients: [] };
              ctx.go('rezepte');
            },
          },
        },
        '+ Referenz (Link zum Original)',
      ),
    ),
    rows.length
      ? h('ul', { class: 'recipe-list', id: 'recipe-list' }, ...rows.map((x) => recipeCard(ctx, x.r, x.per, favs.has(x.r.id), kcalLeft)))
      : h('p', { class: 'small', id: 'recipe-none' }, 'Kein Rezept passt zu Suche und Filtern.'),
    importExportCard(ctx),
    sourcesCard(),
    principlesCard(),
  );
}

/** @param {Recipe} r */
function openDetail(r) {
  view.detail = r.id;
  view.servings = r.servings;
  view.confirmLog = false;
}

/**
 * @param {Ctx} ctx
 * @param {Recipe} r
 * @param {import('../domain/recipes.js').Totals | null} per
 * @param {boolean} fav
 * @param {number} kcalLeft
 */
function recipeCard(ctx, r, per, fav, kcalLeft) {
  return h(
    'li',
    { class: 'card recipe', id: `recipe-${r.id}` },
    h(
      'div',
      { class: 'recipe-head' },
      h(
        'button',
        {
          type: 'button',
          class: 'recipe-open',
          id: `open-${r.id}`,
          on: {
            click: () => {
              openDetail(r);
              ctx.go('rezepte');
              window.scrollTo(0, 0);
            },
          },
        },
        h('strong', { class: 'recipe-name' }, r.title),
        h(
          'span',
          { class: 'small muted' },
          per
            ? `${fmt(per.kcal)} kcal · ${fmt(per.protein)} g Protein · ${fmt(per.fiber, 1)} g Ballaststoffe pro Portion`
            : 'Nährwerte nicht verfügbar',
          r.minutes ? ` · ${r.minutes} Min.` : '',
          isVegetarian(r) ? ' · vegetarisch' : '',
        ),
      ),
      favButton(ctx, r, fav),
    ),
    h(
      'div',
      { class: 'recipe-tags' },
      badge(r.source.kind === 'referenz' ? 'info' : r.source.kind === 'ki' ? 'warn' : 'ok', SOURCE_LABEL[r.source.kind]),
      per && per.kcal > kcalLeft + 50 && ctx.snap ? h('span', { class: 'small fast-tag' }, 'Mehr als heute noch übrig') : null,
    ),
  );
}

/**
 * @param {Ctx} ctx
 * @param {Recipe} r
 * @param {boolean} fav
 */
function favButton(ctx, r, fav) {
  return h(
    'button',
    {
      type: 'button',
      class: 'icon-btn fav-btn',
      'aria-pressed': String(fav),
      'aria-label': fav ? `${r.title} aus Favoriten entfernen` : `${r.title} zu Favoriten`,
      id: `fav-${r.id}`,
      on: {
        click: () =>
          ctx.commit(
            (s) => {
              s.favorites = fav ? s.favorites.filter((x) => x !== r.id) : [...s.favorites, r.id];
              return true;
            },
            fav ? 'Aus Favoriten entfernt' : 'Zu Favoriten hinzugefügt',
          ),
      },
    },
    fav ? '★' : '☆',
  );
}

/**
 * Rezeptdetail: Quelle, Portionsregler, Zutaten, Nährwerte, Allergene, Zubereitung, Aktionen.
 * @param {Ctx} ctx
 * @param {Recipe} r
 */
function detailView(ctx, r) {
  const servings = view.servings;
  const n = recipeNutrition(r, servings);
  const ing = scaleIngredients(r, servings);
  const fav = ctx.state.favorites.includes(r.id);
  const allergens = detectAllergens(r);
  const isRef = !r.ingredients.length;
  const setServ = (/** @type {number} */ v) => {
    view.servings = Math.min(20, Math.max(0.5, Math.round(v * 2) / 2));
    view.confirmLog = false;
    ctx.go('rezepte');
  };
  const days = Array.from({ length: 14 }, (_, i) => addDays(ctx.today, i));
  const per = n.perServing;
  const tot = n.total;
  const sv = fmt(servings, servings % 1 ? 1 : 0);
  /** @param {string} label @param {(t: import('../domain/recipes.js').Totals) => string} pick */
  const row = (label, pick) => h('tr', {}, h('th', {}, label), h('td', {}, per ? pick(per) : '–'), h('td', {}, tot ? pick(tot) : '–'));
  const microRows = per
    ? NUTRIENTS.filter((x) => x.group !== 'makro' && x.key !== 'sodium' && (per.micros[x.key] ?? 0) > 0)
        .slice(0, 10)
        .map((x) =>
          h(
            'tr',
            {},
            h('th', {}, x.label),
            h('td', {}, `${fmt(per.micros[x.key] ?? 0, x.digits ?? 0)} ${x.unit}`),
            h('td', {}, tot ? `${fmt(tot.micros[x.key] ?? 0, x.digits ?? 0)} ${x.unit}` : '–'),
          ),
        )
    : [];
  return h(
    'article',
    { class: 'stack', id: 'recipe-detail' },
    h(
      'button',
      {
        type: 'button',
        class: 'link-btn',
        id: 'detail-back',
        on: {
          click: () => {
            view.detail = '';
            ctx.go('rezepte');
          },
        },
      },
      '‹ Zurück zur Liste',
    ),
    h(
      'section',
      { class: 'card stack-sm' },
      h('div', { class: 'recipe-head' }, h('h2', { id: 'detail-title' }, r.title), favButton(ctx, r, fav)),
      r.description ? h('p', {}, r.description) : null,
      h(
        'p',
        { class: 'small', id: 'detail-source' },
        badge(r.source.kind === 'referenz' ? 'info' : 'ok', SOURCE_LABEL[r.source.kind]),
        ' ',
        r.source.publisher ? `Quelle: ${r.source.publisher}. ` : '',
        r.source.url
          ? h('a', { href: r.source.url, target: '_blank', rel: 'noopener noreferrer', id: 'detail-url' }, 'Zum Original')
          : null,
        r.source.url ? ' · ' : '',
        r.source.kind === 'app'
          ? ''
          : r.source.checkedAt
            ? `Quelle geprüft am ${fmtDate(r.source.checkedAt)}`
            : r.source.url
              ? 'Quelle nicht geprüft'
              : '',
        r.source.rights === 'nur-link' ? '. Inhalte nicht übernommen (nur Link).' : '',
      ),
      isRef
        ? h(
            'div',
            { class: 'note info small stack-sm' },
            h(
              'p',
              {},
              'Für diese Referenz sind keine Zutaten gespeichert, deshalb keine Nährwerte. Du kannst die Zutaten aus dem Original selbst eintragen; daraus wird ein eigenes Rezept mit Verweis auf die Quelle.',
            ),
            h(
              'button',
              {
                type: 'button',
                class: 'btn small-btn',
                id: 'ref-to-own',
                on: {
                  click: () => {
                    view.editing = draftFrom(r, true);
                    ctx.go('rezepte');
                  },
                },
              },
              'Zutaten eintragen',
            ),
          )
        : [
            h(
              'div',
              { class: 'servings', role: 'group', 'aria-label': 'Portionen' },
              h('span', { class: 'small muted' }, 'Portionen'),
              h(
                'button',
                {
                  type: 'button',
                  class: 'icon-btn',
                  id: 'serv-minus',
                  'aria-label': 'Weniger Portionen',
                  on: { click: () => setServ(servings - 0.5) },
                },
                '−',
              ),
              h('strong', { id: 'serv-value', 'aria-live': 'polite' }, sv),
              h(
                'button',
                {
                  type: 'button',
                  class: 'icon-btn',
                  id: 'serv-plus',
                  'aria-label': 'Mehr Portionen',
                  on: { click: () => setServ(servings + 0.5) },
                },
                '+',
              ),
              r.servings !== 1 ? h('span', { class: 'small muted' }, `(Original: ${fmt(r.servings)})`) : null,
            ),
            h('h3', { class: 'eyebrow' }, 'Zutaten'),
            h(
              'ul',
              { class: 'small recipe-ingredients', id: 'detail-ingredients' },
              ...ing.map((i) => {
                const food = i.foodKey ? BY_KEY.get(i.foodKey) : undefined;
                const g = food && i.amount !== null ? toGrams(food, i.amount, i.unit) : null;
                return h(
                  'li',
                  {},
                  i.amount !== null ? `${fmt(i.amount, i.amount % 1 ? 1 : 0)} ${i.unit} ` : '',
                  i.label,
                  i.note ? h('small', { class: 'muted' }, ` (${i.note})`) : null,
                  g && i.unit !== 'g' && g.grams !== null ? h('small', { class: 'muted' }, ` (≈ ${fmt(g.grams)} g)`) : null,
                  g && g.grams === null ? h('small', { class: 'fast-tag' }, ` (nicht berechnet: ${g.basis})`) : null,
                );
              }),
            ),
            h(
              'p',
              { class: 'small', id: 'detail-status' },
              badge(n.status === 'berechnet' ? 'ok' : n.status === 'teilweise' ? 'warn' : 'alert', STATUS_LABEL[n.status]),
              n.missing.length ? ` Nicht enthalten: ${n.missing.map((m) => m.label).join(', ')}. Werte sind eine Untergrenze.` : '',
            ),
            per
              ? h(
                  'table',
                  { class: 'nutrition-table small', id: 'detail-nutrition' },
                  h('thead', {}, h('tr', {}, h('th', {}, 'Nährwerte'), h('th', {}, 'pro Portion'), h('th', {}, `gesamt (${sv} P.)`))),
                  h(
                    'tbody',
                    {},
                    row('Energie', (t) => `${fmt(t.kcal)} kcal / ${fmt(t.kj)} kJ`),
                    row('Eiweiss', (t) => `${fmt(t.protein, 1)} g`),
                    row('Kohlenhydrate', (t) => `${fmt(t.carbs, 1)} g`),
                    row('davon Zucker', (t) => `${fmt(t.sugar, 1)} g`),
                    row('Fett', (t) => `${fmt(t.fat, 1)} g`),
                    row('davon gesättigt', (t) => `${fmt(t.satFat, 1)} g`),
                    row('Ballaststoffe', (t) => `${fmt(t.fiber, 1)} g`),
                    row('Salz', (t) => `${fmt(t.salt, 1)} g`),
                    ...microRows,
                  ),
                )
              : null,
            h(
              'p',
              { class: 'hint' },
              'Berechnet aus den Zutatenmengen mit der Schweizer Nährwertdatenbank (BLV), ohne Garverluste. Öl zählt nur, soweit es in den Zutaten steht; Salz zum Würzen ist nicht enthalten.',
            ),
            allergens.length
              ? h(
                  'p',
                  { class: 'small', id: 'detail-allergens' },
                  h('strong', {}, 'Allergene (automatisch erkannt, ohne Gewähr): '),
                  allergens.join(', '),
                  '. Verpackungen prüfen.',
                )
              : h('p', { class: 'small muted', id: 'detail-allergens' }, 'Keine der Hauptallergene in den Zutaten erkannt (ohne Gewähr).'),
            r.steps.length
              ? [h('h3', { class: 'eyebrow' }, 'Zubereitung'), h('ol', { class: 'small' }, ...r.steps.map((st) => h('li', {}, st)))]
              : null,
            r.tip ? h('p', { class: 'note info small' }, r.tip) : null,
            r.principles?.length
              ? h(
                  'div',
                  { class: 'recipe-principles' },
                  ...r.principles.map((pid) => {
                    const p = principle(pid);
                    return p ? badge(p.evidence === 'hoch' ? 'ok' : p.evidence === 'mittel' ? 'info' : 'warn', p.title) : null;
                  }),
                )
              : null,
          ],
    ),
    !isRef && tot && ctx.state.profile ? actionsCard(ctx, r, servings, days) : null,
    h(
      'div',
      { class: 'btn-row' },
      r.source.kind === 'app'
        ? h(
            'button',
            {
              type: 'button',
              class: 'btn',
              id: 'copy-own',
              on: {
                click: () => {
                  view.editing = draftFrom(r, true);
                  ctx.go('rezepte');
                },
              },
            },
            'Als eigenes Rezept anpassen',
          )
        : [
            h(
              'button',
              {
                type: 'button',
                class: 'btn',
                id: 'edit-own',
                on: {
                  click: () => {
                    view.editing = draftFrom(r, false);
                    ctx.go('rezepte');
                  },
                },
              },
              'Bearbeiten',
            ),
            h(
              'button',
              {
                type: 'button',
                class: 'btn danger-outline',
                id: 'delete-own',
                on: {
                  click: () => {
                    const planned = Object.values(ctx.state.mealPlan)
                      .flat()
                      .filter((m) => m.recipeId === r.id).length;
                    if (
                      !window.confirm(
                        `«${r.title}» löschen?${planned ? ` Es ist ${planned}× im Wochenplan; diese Einträge werden ebenfalls entfernt.` : ''} Bereits erfasste Mahlzeiten bleiben im Protokoll.`,
                      )
                    )
                      return;
                    view.detail = '';
                    ctx.commit((s) => {
                      s.recipes = s.recipes.filter((x) => x.id !== r.id);
                      s.favorites = s.favorites.filter((x) => x !== r.id);
                      s.recentRecipes = s.recentRecipes.filter((x) => x !== r.id);
                      for (const d of Object.keys(s.mealPlan)) {
                        s.mealPlan[d] = s.mealPlan[d].filter((m) => m.recipeId !== r.id);
                        if (!s.mealPlan[d].length) delete s.mealPlan[d];
                      }
                      return true;
                    }, 'Rezept gelöscht');
                  },
                },
              },
              'Löschen',
            ),
          ],
    ),
  );
}

/**
 * Als gegessen erfassen (mit Bestätigung der Portionen) oder in den Wochenplan legen.
 * @param {Ctx} ctx
 * @param {Recipe} r
 * @param {number} servings
 * @param {string[]} days
 */
function actionsCard(ctx, r, servings, days) {
  const slotSel = h(
    'select',
    { id: 'plan-slot', name: 'plan-slot', 'aria-label': 'Mahlzeit' },
    ...MEALS.map(([v, l]) => h('option', { value: v }, l)),
  );
  /** @type {HTMLSelectElement} */ (slotSel).value = r.meals[0] ?? 'mittag';
  return h(
    'section',
    { class: 'card stack-sm', id: 'detail-actions' },
    h('h3', {}, 'Verwenden'),
    view.confirmLog
      ? h(
          'form',
          {
            class: 'stack-sm',
            id: 'log-confirm',
            on: {
              submit: (e) => {
                e.preventDefault();
                const v = Number(String(new FormData(/** @type {HTMLFormElement} */ (e.target)).get('log-servings')).replace(',', '.'));
                if (!(v > 0 && v <= 20)) return ctx.toast('Bitte zwischen 0.5 und 20 Portionen angeben.', 'error');
                const fields = entryFromRecipe(r, v, ctx.date === ctx.today ? nowTime() : '12:00');
                if (!fields) return ctx.toast('Nährwerte nicht berechenbar.', 'error');
                view.confirmLog = false;
                ctx.commit(
                  (s) => {
                    if (!addFood(s, ctx.date, fields)) return false;
                    touchRecent(s, r.id);
                    return true;
                  },
                  `${r.title} erfasst (${fmt(fields.kcal)} kcal)`,
                );
              },
            },
          },
          h(
            'label',
            { for: 'log-servings', class: 'small' },
            `Tatsächlich gegessen ${ctx.date === ctx.today ? 'heute' : `am ${fmtDate(ctx.date)}`}, Portionen:`,
          ),
          h('input', { id: 'log-servings', name: 'log-servings', inputmode: 'decimal', value: '1', class: 'serv-input' }),
          h(
            'div',
            { class: 'btn-row' },
            h('button', { type: 'submit', class: 'btn primary', id: 'log-save' }, 'Erfassen'),
            h(
              'button',
              {
                type: 'button',
                class: 'btn',
                on: {
                  click: () => {
                    view.confirmLog = false;
                    ctx.go('rezepte');
                  },
                },
              },
              'Abbrechen',
            ),
          ),
        )
      : h(
          'button',
          {
            type: 'button',
            class: 'btn primary',
            id: 'log-open',
            on: {
              click: () => {
                view.confirmLog = true;
                ctx.go('rezepte');
              },
            },
          },
          'Als gegessen erfassen …',
        ),
    h(
      'form',
      {
        class: 'stack-sm',
        id: 'plan-add',
        on: {
          submit: (e) => {
            e.preventDefault();
            const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
            const date = String(fd.get('plan-date'));
            const slot = /** @type {any} */ (String(fd.get('plan-slot')));
            const s2 = Number(String(fd.get('plan-servings')).replace(',', '.'));
            if (!(s2 > 0 && s2 <= 20)) return ctx.toast('Bitte zwischen 0.5 und 20 Portionen angeben.', 'error');
            ctx.commit(
              (s) => {
                addPlanned(s.mealPlan, date, { recipeId: r.id, slot, servings: s2 }, uid());
                touchRecent(s, r.id);
                return true;
              },
              `Geplant: ${date === ctx.today ? 'heute' : fmtDate(date, 'dm')}, ${MEALS.find((m) => m[0] === slot)?.[1]}`,
            );
          },
        },
      },
      h('label', { for: 'plan-date', class: 'small' }, 'In den Wochenplan legen'),
      h(
        'div',
        { class: 'plan-add-row' },
        h(
          'select',
          { id: 'plan-date', name: 'plan-date' },
          ...days.map((d) => h('option', { value: d }, d === ctx.today ? 'Heute' : fmtDate(d, 'dm'))),
        ),
        slotSel,
        h('input', {
          id: 'plan-servings',
          name: 'plan-servings',
          inputmode: 'decimal',
          value: String(servings),
          'aria-label': 'Portionen',
          class: 'serv-input',
        }),
        h('button', { type: 'submit', class: 'btn', id: 'plan-save' }, 'Planen'),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------------------
// Editor

function blankDraft() {
  return {
    id: '',
    title: '',
    description: '',
    meals: ['mittag'],
    servings: 1,
    minutes: '',
    veg: false,
    kind: 'eigen',
    url: '',
    publisher: '',
    steps: '',
    ingredients: [{ foodKey: null, amount: '', unit: 'g', label: '' }],
  };
}

/**
 * @param {Recipe} r
 * @param {boolean} asCopy als neues eigenes Rezept (Kopie bzw. aus Referenz)
 */
function draftFrom(r, asCopy) {
  return {
    id: asCopy ? '' : r.id,
    title: asCopy && r.source.kind === 'app' ? `${r.title} (angepasst)` : r.title,
    description: r.description ?? '',
    meals: [...r.meals],
    servings: r.servings,
    minutes: r.minutes ?? '',
    veg: isVegetarian(r),
    kind: asCopy ? 'eigen' : r.source.kind,
    url: r.source.url ?? '',
    publisher: r.source.kind === 'app' ? '' : (r.source.publisher ?? ''),
    steps: r.steps.join('\n'),
    createdAt: asCopy ? undefined : r.createdAt,
    replaceId: asCopy && r.source.kind === 'referenz' ? r.id : undefined,
    ingredients: r.ingredients.length
      ? r.ingredients.map((i) => ({ ...i, amount: i.amount ?? '' }))
      : [{ foodKey: null, amount: '', unit: 'g', label: '' }],
  };
}

/**
 * Formularwerte in den Entwurf übernehmen (vor Neuzeichnen und Speichern).
 * @param {HTMLFormElement | null} form
 */
function collect(form) {
  if (!form) return;
  const d = /** @type {Record<string, any>} */ (view.editing);
  const fd = new FormData(form);
  d.title = String(fd.get('r-title') ?? '');
  d.description = String(fd.get('r-desc') ?? '');
  d.servings = Number(String(fd.get('r-servings') ?? '1').replace(',', '.'));
  d.minutes = String(fd.get('r-minutes') ?? '');
  d.veg = fd.get('r-veg') === 'on';
  d.url = String(fd.get('r-url') ?? '');
  d.publisher = String(fd.get('r-publisher') ?? '');
  d.steps = String(fd.get('r-steps') ?? '');
  d.meals = MEALS.map(([m]) => m).filter((m) => fd.get(`r-meal-${m}`) === 'on');
  d.ingredients = d.ingredients.map((/** @type {any} */ i, /** @type {number} */ k) => ({
    ...i,
    amount: String(fd.get(`ing-amount-${k}`) ?? ''),
    unit: String(fd.get(`ing-unit-${k}`) ?? 'g'),
    label: String(fd.get(`ing-label-${k}`) ?? ''),
  }));
}

/** Entwurf als Rezept-Rohdaten für die Prüfung. */
function draftToRaw() {
  const d = /** @type {Record<string, any>} */ (view.editing);
  return {
    id: d.id || undefined,
    title: d.title,
    description: d.description,
    meals: d.meals,
    servings: d.servings,
    minutes: d.minutes ? Number(d.minutes) : undefined,
    veg: d.veg,
    steps: String(d.steps)
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean),
    ingredients: d.ingredients
      .filter((/** @type {any} */ i) => i.label.trim() || i.foodKey)
      .map((/** @type {any} */ i) => ({
        foodKey: i.foodKey,
        amount: i.amount === '' ? null : Number(String(i.amount).replace(',', '.')),
        unit: i.unit,
        label: i.label,
      })),
    source: { kind: d.kind, url: d.url || undefined, publisher: d.publisher || undefined },
    createdAt: d.createdAt,
  };
}

/** @param {Ctx} ctx */
function editorView(ctx) {
  const d = /** @type {Record<string, any>} */ (view.editing);
  const isRef = d.kind === 'referenz';
  /** @type {Recipe | null} */
  let preview = null;
  try {
    preview = validateRecipe(draftToRaw(), { id: () => 'preview', now: new Date().toISOString() });
  } catch {
    preview = null;
  }
  const n = preview && preview.ingredients.length ? recipeNutrition(preview, preview.servings) : null;
  const form = h(
    'form',
    {
      class: 'stack',
      id: 'recipe-editor',
      on: {
        submit: (e) => {
          e.preventDefault();
          collect(/** @type {HTMLFormElement} */ (e.target));
          try {
            const rec = validateRecipe(draftToRaw(), { id: uid, now: new Date().toISOString() });
            const dup = allRecipes(ctx.state).find(
              (x) => x.id !== rec.id && x.id !== d.replaceId && x.title.toLowerCase() === rec.title.toLowerCase(),
            );
            if (dup) return ctx.toast('Es gibt schon ein Rezept mit diesem Titel.', 'error');
            const replaceId = d.replaceId;
            view.editing = null;
            view.detail = rec.id;
            view.servings = rec.servings;
            ctx.commit((s) => {
              const i = s.recipes.findIndex((x) => x.id === rec.id);
              if (i >= 0) s.recipes[i] = rec;
              else s.recipes.push(rec);
              // Referenz mit eingetragenen Zutaten: das neue Rezept ersetzt die Referenz in Favoriten und Plan
              if (replaceId) {
                s.recipes = s.recipes.filter((x) => x.id !== replaceId);
                s.favorites = s.favorites.map((x) => (x === replaceId ? rec.id : x));
                for (const list of Object.values(s.mealPlan)) for (const m of list) if (m.recipeId === replaceId) m.recipeId = rec.id;
              }
              return true;
            }, 'Rezept gespeichert');
          } catch (err) {
            ctx.toast(`Nicht gespeichert: ${err instanceof Error ? err.message : String(err)}`, 'error');
          }
        },
      },
    },
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'r-title' }, 'Titel'),
      h('input', { id: 'r-title', name: 'r-title', value: d.title, required: true, maxlength: '120' }),
    ),
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'r-desc' }, 'Kurzbeschreibung (optional)'),
      h('input', { id: 'r-desc', name: 'r-desc', value: d.description, maxlength: '400' }),
    ),
    h(
      'fieldset',
      { class: 'meal-checks' },
      h('legend', { class: 'small' }, 'Passt als'),
      ...MEALS.map(([m, l]) =>
        h(
          'label',
          { class: 'check' },
          h('input', { type: 'checkbox', name: `r-meal-${m}`, id: `r-meal-${m}`, checked: d.meals.includes(m) }),
          h('span', {}, l),
        ),
      ),
    ),
    h(
      'div',
      { class: 'grid-2' },
      h(
        'div',
        { class: 'field' },
        h('label', { for: 'r-servings' }, 'Portionen'),
        h('input', { id: 'r-servings', name: 'r-servings', inputmode: 'decimal', value: String(d.servings) }),
      ),
      h(
        'div',
        { class: 'field' },
        h('label', { for: 'r-minutes' }, 'Zeit (Minuten)'),
        h('input', { id: 'r-minutes', name: 'r-minutes', inputmode: 'numeric', value: String(d.minutes) }),
      ),
    ),
    h(
      'label',
      { class: 'check' },
      h('input', { type: 'checkbox', id: 'r-veg', name: 'r-veg', checked: Boolean(d.veg) }),
      h('span', {}, 'Vegetarisch'),
    ),
    h(
      'div',
      { class: 'grid-2' },
      h(
        'div',
        { class: 'field' },
        h('label', { for: 'r-url' }, isRef ? 'Link zum Original (https)' : 'Quelle/Vorlage (optional, https)'),
        h('input', { id: 'r-url', name: 'r-url', type: 'url', value: d.url, required: isRef }),
      ),
      h(
        'div',
        { class: 'field' },
        h('label', { for: 'r-publisher' }, 'Herausgeber (optional)'),
        h('input', { id: 'r-publisher', name: 'r-publisher', value: d.publisher }),
      ),
    ),
    isRef
      ? h('p', { class: 'small muted' }, 'Eine Referenz speichert nur Titel und Link. Zutaten und Zubereitung bleiben beim Original.')
      : [
          h('h2', { class: 'eyebrow' }, 'Zutaten'),
          h(
            'p',
            { class: 'hint' },
            'Lebensmittel aus der Datenbank wählen (für die Nährwerte), Menge und Einheit angeben. Stück und Löffel rechnet die App nur um, wenn die Datenbank ein Gewicht dafür kennt. Gewürze ohne Menge sind erlaubt.',
          ),
          h(
            'ul',
            { class: 'editor-ings', id: 'editor-ings' },
            ...d.ingredients.map((/** @type {any} */ i, /** @type {number} */ k) => ingredientRow(ctx, i, k)),
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'btn small-btn',
              id: 'ing-add',
              on: {
                click: (e) => {
                  collect(/** @type {HTMLElement} */ (e.currentTarget).closest('form'));
                  d.ingredients.push({ foodKey: null, amount: '', unit: 'g', label: '' });
                  ctx.go('rezepte');
                },
              },
            },
            '+ Zutat',
          ),
          h(
            'div',
            { class: 'field' },
            h('label', { for: 'r-steps' }, 'Zubereitung (ein Schritt pro Zeile)'),
            h('textarea', { id: 'r-steps', name: 'r-steps', rows: '4' }, d.steps),
          ),
          n
            ? h(
                'p',
                { class: 'small', id: 'editor-preview' },
                badge(n.status === 'berechnet' ? 'ok' : 'warn', STATUS_LABEL[n.status]),
                n.perServing
                  ? ` Pro Portion: ${fmt(n.perServing.kcal)} kcal · ${fmt(n.perServing.protein, 1)} g Protein · ${fmt(n.perServing.fiber, 1)} g Ballaststoffe.`
                  : '',
                n.missing.length ? ` Nicht berechnet: ${n.missing.map((m) => `${m.label} (${m.reason})`).join(', ')}.` : '',
              )
            : null,
        ],
    h(
      'div',
      { class: 'btn-row' },
      h('button', { type: 'submit', class: 'btn primary', id: 'recipe-save' }, 'Speichern'),
      h(
        'button',
        {
          type: 'button',
          class: 'btn',
          id: 'recipe-cancel',
          on: {
            click: () => {
              view.editing = null;
              ctx.go('rezepte');
            },
          },
        },
        'Abbrechen',
      ),
    ),
  );
  return h(
    'div',
    { class: 'stack' },
    h('h1', {}, d.id ? 'Rezept bearbeiten' : isRef ? 'Referenz hinzufügen' : 'Eigenes Rezept'),
    moduleNav('rezepte'),
    h('section', { class: 'card' }, form),
  );
}

/**
 * Eine Zutatenzeile mit Lebensmittelsuche.
 * @param {Ctx} ctx
 * @param {any} i
 * @param {number} k
 */
function ingredientRow(ctx, i, k) {
  const d = /** @type {Record<string, any>} */ (view.editing);
  const results = h('div', { class: 'search-results', id: `ing-results-${k}` });
  const chosen = i.foodKey ? BY_KEY.get(i.foodKey) : undefined;
  const unitSel = h(
    'select',
    { id: `ing-unit-${k}`, name: `ing-unit-${k}`, 'aria-label': 'Einheit' },
    ...UNITS.map((u) => h('option', { value: u }, u)),
  );
  /** @type {HTMLSelectElement} */ (unitSel).value = i.unit;
  return h(
    'li',
    { class: 'editor-ing' },
    h(
      'div',
      { class: 'editor-ing-row' },
      h('input', {
        id: `ing-amount-${k}`,
        name: `ing-amount-${k}`,
        inputmode: 'decimal',
        value: String(i.amount),
        'aria-label': 'Menge',
        class: 'serv-input',
        placeholder: 'Menge',
      }),
      unitSel,
      h('input', {
        id: `ing-label-${k}`,
        name: `ing-label-${k}`,
        value: i.label,
        'aria-label': 'Bezeichnung',
        placeholder: 'Bezeichnung, z. B. Rüebli',
      }),
      h(
        'button',
        {
          type: 'button',
          class: 'icon-btn',
          'aria-label': `Zutat ${k + 1} entfernen`,
          on: {
            click: (e) => {
              collect(/** @type {HTMLElement} */ (e.currentTarget).closest('form'));
              d.ingredients.splice(k, 1);
              if (!d.ingredients.length) d.ingredients.push({ foodKey: null, amount: '', unit: 'g', label: '' });
              ctx.go('rezepte');
            },
          },
        },
        '×',
      ),
    ),
    h(
      'div',
      { class: 'editor-ing-food small' },
      chosen
        ? h('span', { class: 'muted', id: `ing-food-${k}` }, `Datenbank: ${chosen.n}`)
        : h('span', { class: 'fast-tag', id: `ing-food-${k}` }, 'Kein Lebensmittel gewählt (keine Nährwerte)'),
      h('input', {
        type: 'search',
        id: `ing-search-${k}`,
        placeholder: 'Lebensmittel suchen',
        'aria-label': `Lebensmittel für Zutat ${k + 1} suchen`,
        on: {
          input: (e) => {
            const q = /** @type {HTMLInputElement} */ (e.target).value;
            results.replaceChildren(
              ...searchFoods(FOODS, q)
                .slice(0, 6)
                .map((f) =>
                  h(
                    'button',
                    {
                      type: 'button',
                      class: 'chip',
                      on: {
                        click: (ev) => {
                          collect(/** @type {HTMLElement} */ (ev.currentTarget).closest('form'));
                          d.ingredients[k].foodKey = f.k;
                          if (!d.ingredients[k].label.trim()) d.ingredients[k].label = f.n;
                          ctx.go('rezepte');
                        },
                      },
                    },
                    f.n,
                    h('small', {}, `${f.p} = ${f.g} g`),
                  ),
                ),
            );
          },
        },
      }),
    ),
    results,
  );
}

// ---------------------------------------------------------------------------------------
// Import/Export, Quellen, Prinzipien

/** @param {Ctx} ctx */
function importExportCard(ctx) {
  const own = ctx.state.recipes;
  /** @param {string} text @param {string} name */
  const doImport = (text, name) => {
    try {
      const data = /\.csv$/i.test(name) ? parseReferenceCsv(text) : JSON.parse(text);
      const res = importRecipes(data, allRecipes(ctx.state), { id: uid, now: new Date().toISOString() });
      view.report = { added: res.added.length, skipped: res.skipped };
      if (!res.added.length) return ctx.go('rezepte');
      ctx.commit((s) => {
        s.recipes.push(...res.added);
        return true;
      }, `${res.added.length} Rezepte importiert`);
    } catch (e) {
      view.report = null;
      ctx.toast(`Import fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };
  return h(
    'section',
    { class: 'card stack-sm', 'aria-labelledby': 'imp-h', id: 'import-card' },
    h('h2', { id: 'imp-h' }, 'Import und Export'),
    h(
      'p',
      { class: 'small' },
      'JSON mit Rezepten (Format siehe Doku) oder CSV mit Referenzen: Titel;Link;Herausgeber;Mahlzeit;geprüft am (JJJJ-MM-TT). Ungültige Einträge werden übersprungen, bestehende Rezepte nie überschrieben.',
    ),
    h('label', { for: 'recipe-import', class: 'small' }, 'Datei wählen (.json oder .csv)'),
    h('input', {
      type: 'file',
      id: 'recipe-import',
      accept: '.json,.csv,application/json,text/csv',
      on: {
        change: async (e) => {
          const input = /** @type {HTMLInputElement} */ (e.target);
          const file = input.files?.[0];
          if (!file) return;
          if (file.size > 2_000_000) return ctx.toast('Datei zu gross (max. 2 MB).', 'error');
          doImport(await file.text(), file.name);
          input.value = '';
        },
      },
    }),
    view.report
      ? h(
          'div',
          { class: 'note info small', id: 'import-report' },
          h('p', {}, `${view.report.added} importiert, ${view.report.skipped.length} übersprungen.`),
          view.report.skipped.length
            ? h('ul', {}, ...view.report.skipped.slice(0, 20).map((s) => h('li', {}, `${s.title}: ${s.reason}`)))
            : null,
        )
      : null,
    h(
      'button',
      {
        type: 'button',
        class: 'btn small-btn',
        id: 'recipe-export',
        disabled: !own.length,
        on: {
          click: () => {
            const url = URL.createObjectURL(new Blob([exportRecipes(own)], { type: 'application/json' }));
            const a = h('a', { href: url, download: `rezepte-${ctx.today}.json` });
            document.body.append(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          },
        },
      },
      `Eigene Rezepte exportieren (${own.length})`,
    ),
  );
}

function sourcesCard() {
  return h(
    'section',
    { class: 'card stack-sm', 'aria-labelledby': 'src-h', id: 'sources-card' },
    h('h2', { id: 'src-h' }, 'Quellen'),
    h(
      'p',
      { class: 'small' },
      'Die Originalrezepte der Ernährungs-Docs stehen beim NDR. Die App übernimmt keine fremden Rezepttexte oder Bilder; einzelne Rezepte kannst du als Referenz mit Link speichern und die Zutaten selbst eintragen.',
    ),
    h(
      'ul',
      { class: 'small' },
      ...SOURCE_COLLECTIONS.map((s) =>
        h(
          'li',
          {},
          h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', class: 'source-link' }, `${s.publisher}: ${s.title}`),
          ' (Inhalte nicht übernommen)',
        ),
      ),
    ),
  );
}

function principlesCard() {
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'princ-h', id: 'principles-card' },
    h('h2', { id: 'princ-h' }, 'Die Prinzipien und was die Studien sagen'),
    h('p', { class: 'small' }, 'Grün: gut belegt. Blau: teilweise belegt. Gelb: schwach belegt oder nur unter Bedingungen.'),
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
  );
}
