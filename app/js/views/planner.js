// @ts-check
// Wochenplan und Einkaufsliste. Geplante Mahlzeiten gelten erst als gegessen, wenn sie mit
// bestätigter Portionenzahl übernommen werden.

import { h, fmt, fmtDate, nowTime } from '../ui/dom.js';
import { uid } from '../store.js';
import { addDays, weekStart } from '../domain/util.js';
import { MEALS } from '../domain/recipes.js';
import {
  weekDates,
  plannedTotals,
  addPlanned,
  movePlanned,
  removePlanned,
  copyDay,
  logPlanned,
  isLogged,
  buildShoppingList,
  aggregateIngredients,
  CATEGORY_ORDER,
} from '../domain/planner.js';
import { UNITS } from '../domain/units.js';
import { recipeMap, moduleNav, touchRecent } from './recipes.js';

/** @typedef {import('../app.js').Ctx} Ctx */
/** @typedef {import('../domain/planner.js').PlannedMeal} PlannedMeal */

/** Ansicht merken, solange die App offen ist. */
const view = {
  week: '',
  tab: /** @type {'plan' | 'einkauf'} */ ('plan'),
  moveId: '',
  swapId: '',
  logId: '',
  logAgain: false,
  changes: /** @type {string[]} */ ([]),
};

const DOW = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
/** @param {string} d */
const dayLabel = (d) => `${DOW[new Date(`${d}T00:00:00Z`).getUTCDay()]} ${fmtDate(d, 'dm')}`;

/** @param {Ctx} ctx */
export function viewPlanner(ctx) {
  if (!view.week) view.week = weekStart(ctx.today);
  const dates = weekDates(view.week);
  return h(
    'div',
    { class: 'stack' },
    h('h1', {}, 'Wochenplan und Einkauf'),
    moduleNav('planung'),
    h(
      'div',
      { class: 'week-nav' },
      h(
        'button',
        {
          type: 'button',
          class: 'icon-btn',
          id: 'week-prev',
          'aria-label': 'Vorherige Woche',
          on: { click: () => setWeek(ctx, addDays(view.week, -7)) },
        },
        '‹',
      ),
      h('strong', { id: 'week-label' }, `${dayLabel(dates[0])} bis ${dayLabel(dates[6])}`),
      h(
        'button',
        {
          type: 'button',
          class: 'icon-btn',
          id: 'week-next',
          'aria-label': 'Nächste Woche',
          on: { click: () => setWeek(ctx, addDays(view.week, 7)) },
        },
        '›',
      ),
      view.week !== weekStart(ctx.today)
        ? h(
            'button',
            { type: 'button', class: 'link-btn', id: 'week-today', on: { click: () => setWeek(ctx, weekStart(ctx.today)) } },
            'Diese Woche',
          )
        : null,
    ),
    h(
      'div',
      { class: 'segmented', role: 'group', 'aria-label': 'Ansicht' },
      ...[
        ['plan', 'Wochenplan'],
        ['einkauf', 'Einkaufsliste'],
      ].map(([id, label]) =>
        h(
          'button',
          {
            type: 'button',
            id: `tab-${id}`,
            'aria-pressed': String(view.tab === id),
            on: {
              click: () => {
                view.tab = /** @type {any} */ (id);
                ctx.go('planung');
              },
            },
          },
          label,
        ),
      ),
    ),
    view.tab === 'plan' ? planView(ctx, dates) : shoppingView(ctx),
  );
}

/** @param {Ctx} ctx @param {string} w */
function setWeek(ctx, w) {
  view.week = w;
  view.moveId = view.swapId = view.logId = '';
  ctx.go('planung');
}

/**
 * @param {Ctx} ctx
 * @param {string[]} dates
 */
function planView(ctx, dates) {
  const recipes = recipeMap(ctx.state);
  const empty = dates.every((d) => !(ctx.state.mealPlan[d] ?? []).length);
  return h(
    'div',
    { class: 'stack' },
    empty
      ? h(
          'p',
          { class: 'note info small', id: 'plan-empty' },
          'Noch nichts geplant. Wähle unten pro Tag ein Rezept oder öffne ein Rezept und tippe «Planen». Geplante Mahlzeiten zählen erst, wenn du sie als gegessen übernimmst.',
        )
      : null,
    ...dates.map((d) => dayCard(ctx, d, recipes)),
    h(
      'p',
      { class: 'hint' },
      'Geplante Werte stammen aus den Rezepten (Schweizer Nährwertdatenbank). Die Tagesbilanz auf «Heute» zählt nur, was du tatsächlich erfasst hast.',
    ),
  );
}

/**
 * Ein Tag im Wochenplan.
 * @param {Ctx} ctx
 * @param {string} date
 * @param {Map<string, import('../domain/recipes.js').Recipe>} recipes
 */
function dayCard(ctx, date, recipes) {
  const meals = ctx.state.mealPlan[date] ?? [];
  const t = plannedTotals(meals, recipes);
  const eaten = (ctx.state.days[date]?.food ?? []).reduce((a, f) => a + f.kcal, 0);
  const target = ctx.snap?.kcalTarget ?? 0;
  const proteinTarget = ctx.snap?.protein.grams ?? 0;
  const sorted = [...recipes.values()].sort(
    (a, b) =>
      Number(ctx.state.favorites.includes(b.id)) - Number(ctx.state.favorites.includes(a.id)) || a.title.localeCompare(b.title, 'de'),
  );
  const others = weekDates(view.week).filter((x) => x !== date);
  return h(
    'section',
    { class: `card plan-day${date === ctx.today ? ' is-today' : ''}`, id: `day-${date}`, 'aria-labelledby': `dh-${date}` },
    h(
      'div',
      { class: 'card-head' },
      h('h2', { id: `dh-${date}` }, date === ctx.today ? `Heute, ${dayLabel(date)}` : dayLabel(date)),
      meals.length
        ? h(
            'span',
            { class: 'small', id: `totals-${date}` },
            `Geplant ${fmt(t.kcal)}${target ? ` / ${fmt(target)}` : ''} kcal · ${fmt(t.protein)}${proteinTarget ? ` / ${fmt(proteinTarget)}` : ''} g Protein`,
            t.partial ? ' (unvollständig)' : '',
          )
        : null,
    ),
    date <= ctx.today && (eaten || meals.length)
      ? h('p', { class: 'small muted', id: `eaten-${date}` }, `Tatsächlich erfasst: ${fmt(eaten)} kcal`)
      : null,
    ...MEALS.map(([slot, label]) => {
      const inSlot = meals.filter((m) => m.slot === slot);
      if (!inSlot.length) return null;
      return h(
        'div',
        { class: 'plan-slot' },
        h('h3', { class: 'eyebrow' }, label),
        h('ul', { class: 'entries' }, ...inSlot.map((m) => plannedRow(ctx, date, m, recipes, sorted))),
      );
    }),
    h(
      'form',
      {
        class: 'plan-add-row',
        id: `add-${date}`,
        on: {
          submit: (e) => {
            e.preventDefault();
            const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
            const recipeId = String(fd.get('recipe'));
            const r = recipes.get(recipeId);
            if (!r) return ctx.toast('Bitte ein Rezept wählen.', 'error');
            const slot = /** @type {any} */ (String(fd.get('slot')));
            ctx.commit((s) => {
              addPlanned(s.mealPlan, date, { recipeId, slot, servings: 1 }, uid());
              touchRecent(s, recipeId);
              return true;
            }, `${r.title} geplant`);
          },
        },
      },
      h(
        'select',
        { name: 'recipe', id: `add-recipe-${date}`, 'aria-label': 'Rezept' },
        h('option', { value: '' }, '+ Rezept wählen …'),
        ...sorted.map((r) => h('option', { value: r.id }, `${ctx.state.favorites.includes(r.id) ? '★ ' : ''}${r.title}`)),
      ),
      h(
        'select',
        { name: 'slot', id: `add-slot-${date}`, 'aria-label': 'Mahlzeit' },
        ...MEALS.map(([v, l]) => h('option', { value: v }, l)),
      ),
      h('button', { type: 'submit', class: 'btn small-btn', id: `add-go-${date}` }, 'Planen'),
    ),
    meals.length
      ? h(
          'form',
          {
            class: 'plan-add-row',
            on: {
              submit: (e) => {
                e.preventDefault();
                const to = String(new FormData(/** @type {HTMLFormElement} */ (e.target)).get('to'));
                ctx.commit((s) => copyDay(s.mealPlan, date, to, uid) > 0, `Tag kopiert nach ${dayLabel(to)}`);
              },
            },
          },
          h(
            'select',
            { name: 'to', id: `copy-to-${date}`, 'aria-label': 'Tag kopieren nach' },
            h('option', { value: addDays(date, 1) }, `Morgen wiederholen (${dayLabel(addDays(date, 1))})`),
            ...others.filter((x) => x !== addDays(date, 1)).map((x) => h('option', { value: x }, `Kopieren nach ${dayLabel(x)}`)),
            h('option', { value: addDays(date, 7) }, `Nächste Woche (${dayLabel(addDays(date, 7))})`),
          ),
          h('button', { type: 'submit', class: 'btn small-btn', id: `copy-go-${date}` }, 'Kopieren'),
        )
      : null,
  );
}

/**
 * Eine geplante Mahlzeit: Portionen, übernehmen, verschieben, tauschen, entfernen.
 * @param {Ctx} ctx
 * @param {string} date
 * @param {PlannedMeal} m
 * @param {Map<string, import('../domain/recipes.js').Recipe>} recipes
 * @param {import('../domain/recipes.js').Recipe[]} sorted
 */
export function plannedRow(ctx, date, m, recipes, sorted = []) {
  const r = recipes.get(m.recipeId);
  const t = r ? plannedTotals([m], recipes) : null;
  const logged = isLogged(ctx.state, date, m);
  const future = date > ctx.today;
  const update = (/** @type {(x: PlannedMeal) => void} */ fn, /** @type {string} */ msg) =>
    ctx.commit((s) => {
      const x = (s.mealPlan[date] ?? []).find((y) => y.id === m.id);
      if (!x) return false;
      fn(x);
      return true;
    }, msg);
  const route = location.hash.slice(1) || 'heute';
  return h(
    'li',
    { class: 'planned', id: `pm-${m.id}`, 'data-recipe': m.recipeId },
    h(
      'div',
      { class: 'planned-main' },
      h('strong', {}, r ? r.title : 'Rezept nicht mehr vorhanden'),
      h(
        'span',
        { class: 'small muted' },
        `${fmt(m.servings, m.servings % 1 ? 1 : 0)} ${m.servings === 1 ? 'Portion' : 'Portionen'}`,
        t && t.kcal ? ` · ${fmt(t.kcal)} kcal · ${fmt(t.protein)} g Protein` : '',
        t?.partial ? ' (Nährwerte unvollständig)' : '',
      ),
      logged ? h('span', { class: 'small ok-text', id: `logged-${m.id}` }, '✓ als gegessen erfasst') : null,
    ),
    h(
      'div',
      { class: 'planned-actions' },
      h(
        'button',
        {
          type: 'button',
          class: 'icon-btn',
          'aria-label': `Weniger Portionen ${r?.title ?? ''}`,
          disabled: m.servings <= 0.5,
          on: { click: () => update((x) => void (x.servings = Math.max(0.5, x.servings - 0.5)), 'Portionen geändert') },
        },
        '−',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'icon-btn',
          'aria-label': `Mehr Portionen ${r?.title ?? ''}`,
          on: { click: () => update((x) => void (x.servings = Math.min(20, x.servings + 0.5)), 'Portionen geändert') },
        },
        '+',
      ),
      r && !future
        ? h(
            'button',
            {
              type: 'button',
              class: logged ? 'btn small-btn' : 'btn primary small-btn',
              id: `log-${m.id}`,
              on: {
                click: () => {
                  view.logId = m.id;
                  view.logAgain = logged;
                  ctx.go(route);
                },
              },
            },
            logged ? 'Weitere Portion …' : 'Gegessen …',
          )
        : null,
      sorted.length
        ? [
            h(
              'button',
              {
                type: 'button',
                class: 'btn small-btn',
                id: `move-${m.id}`,
                on: {
                  click: () => {
                    view.moveId = view.moveId === m.id ? '' : m.id;
                    view.swapId = '';
                    ctx.go(route);
                  },
                },
              },
              'Verschieben',
            ),
            h(
              'button',
              {
                type: 'button',
                class: 'btn small-btn',
                id: `swap-${m.id}`,
                on: {
                  click: () => {
                    view.swapId = view.swapId === m.id ? '' : m.id;
                    view.moveId = '';
                    ctx.go(route);
                  },
                },
              },
              'Tauschen',
            ),
          ]
        : null,
      h(
        'button',
        {
          type: 'button',
          class: 'icon-btn',
          'aria-label': `${r?.title ?? 'Mahlzeit'} aus dem Plan entfernen`,
          id: `remove-${m.id}`,
          on: { click: () => ctx.commit((s) => removePlanned(s.mealPlan, m.id), 'Aus dem Plan entfernt') },
        },
        '×',
      ),
    ),
    view.logId === m.id && r
      ? h(
          'form',
          {
            class: 'plan-add-row log-form',
            id: `logform-${m.id}`,
            on: {
              submit: (e) => {
                e.preventDefault();
                const v = Number(String(new FormData(/** @type {HTMLFormElement} */ (e.target)).get('servings')).replace(',', '.'));
                if (!(v > 0 && v <= 20)) return ctx.toast('Bitte zwischen 0.5 und 20 Portionen angeben.', 'error');
                const again = view.logAgain;
                view.logId = '';
                /** @type {string} */
                let status = '';
                ctx.commit((s) => {
                  const res = logPlanned(s, m.id, {
                    servings: v,
                    time: date === ctx.today ? nowTime() : '12:00',
                    now: new Date(),
                    id: uid(),
                    recipes,
                    again,
                  });
                  status = res.status;
                  if (res.status !== 'created') return false;
                  touchRecent(s, m.recipeId);
                  return true;
                }, `${r.title} als gegessen erfasst`);
                if (status === 'already') ctx.toast('Diese Mahlzeit ist schon erfasst.');
                else if (status === 'not-computable') ctx.toast('Nährwerte nicht berechenbar, bitte direkt erfassen.', 'error');
              },
            },
          },
          h(
            'label',
            { for: `servings-${m.id}`, class: 'small' },
            view.logAgain ? 'Weitere Portionen:' : 'Tatsächlich gegessen, Portionen:',
          ),
          h('input', {
            id: `servings-${m.id}`,
            name: 'servings',
            inputmode: 'decimal',
            value: String(view.logAgain ? 1 : m.servings),
            class: 'serv-input',
          }),
          h('button', { type: 'submit', class: 'btn primary small-btn', id: `logsave-${m.id}` }, 'Erfassen'),
          h(
            'button',
            {
              type: 'button',
              class: 'btn small-btn',
              on: {
                click: () => {
                  view.logId = '';
                  ctx.go(route);
                },
              },
            },
            'Abbrechen',
          ),
        )
      : null,
    view.moveId === m.id
      ? h(
          'form',
          {
            class: 'plan-add-row',
            id: `moveform-${m.id}`,
            on: {
              submit: (e) => {
                e.preventDefault();
                const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
                view.moveId = '';
                ctx.commit(
                  (s) => movePlanned(s.mealPlan, m.id, String(fd.get('date')), /** @type {any} */ (String(fd.get('slot')))),
                  'Verschoben',
                );
              },
            },
          },
          (() => {
            const sel = h(
              'select',
              { name: 'date', 'aria-label': 'Neuer Tag' },
              ...weekDates(view.week || weekStart(date)).map((d) => h('option', { value: d }, dayLabel(d))),
            );
            /** @type {HTMLSelectElement} */ (sel).value = date;
            return sel;
          })(),
          (() => {
            const sel = h(
              'select',
              { name: 'slot', 'aria-label': 'Neue Mahlzeit' },
              ...MEALS.map(([v, l]) => h('option', { value: v }, l)),
            );
            /** @type {HTMLSelectElement} */ (sel).value = m.slot;
            return sel;
          })(),
          h('button', { type: 'submit', class: 'btn small-btn', id: `movego-${m.id}` }, 'OK'),
        )
      : null,
    view.swapId === m.id
      ? h(
          'form',
          {
            class: 'plan-add-row',
            id: `swapform-${m.id}`,
            on: {
              submit: (e) => {
                e.preventDefault();
                const id = String(new FormData(/** @type {HTMLFormElement} */ (e.target)).get('recipe'));
                if (!recipes.has(id)) return;
                view.swapId = '';
                update((x) => {
                  x.recipeId = id;
                  delete x.entryId;
                }, 'Rezept getauscht');
              },
            },
          },
          h(
            'select',
            { name: 'recipe', 'aria-label': 'Anderes Rezept' },
            ...sorted.filter((x) => x.id !== m.recipeId).map((x) => h('option', { value: x.id }, x.title)),
          ),
          h('button', { type: 'submit', class: 'btn small-btn', id: `swapgo-${m.id}` }, 'Tauschen'),
        )
      : null,
  );
}

/**
 * Karte «Plan heute» für das Dashboard (nur wenn für den Tag etwas geplant ist).
 * @param {Ctx} ctx
 */
export function planTodayCard(ctx) {
  const meals = ctx.state.mealPlan[ctx.date] ?? [];
  if (!meals.length) return null;
  const recipes = recipeMap(ctx.state);
  const t = plannedTotals(meals, recipes);
  const logged = meals.filter((m) => isLogged(ctx.state, ctx.date, m)).length;
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'plan-today-h', id: 'plan-today' },
    h(
      'div',
      { class: 'card-head' },
      h('h2', { id: 'plan-today-h' }, ctx.date === ctx.today ? 'Plan heute' : `Plan ${fmtDate(ctx.date, 'dm')}`),
      h('a', { href: '#planung', class: 'btn small-btn' }, 'Wochenplan'),
    ),
    h(
      'p',
      { class: 'small', id: 'plan-today-sum' },
      `Geplant ${fmt(t.kcal)} kcal · ${fmt(t.protein)} g Protein${t.partial ? ' (unvollständig)' : ''}. Davon erfasst: ${logged} von ${meals.length} Mahlzeiten. `,
      h('span', { class: 'muted' }, 'Geplant zählt erst, wenn du es als gegessen übernimmst.'),
    ),
    h(
      'ul',
      { class: 'entries' },
      ...[...meals]
        .sort((a, b) => MEALS.findIndex((x) => x[0] === a.slot) - MEALS.findIndex((x) => x[0] === b.slot))
        .map((m) => plannedRow(ctx, ctx.date, m, recipes)),
    ),
  );
}

// ---------------------------------------------------------------------------------------
// Einkaufsliste

/** @param {Ctx} ctx */
function shoppingView(ctx) {
  const list = ctx.state.shopping;
  const recipes = recipeMap(ctx.state);
  const forWeek = list && list.weekStart === view.week ? list : null;
  const planned = weekDates(view.week).some((d) => (ctx.state.mealPlan[d] ?? []).length);
  // Hat sich der Plan seit der letzten Aktualisierung geändert?
  const fresh = aggregateIngredients(ctx.state.mealPlan, weekDates(view.week), recipes);
  const auto = (forWeek?.items ?? []).filter((x) => !x.manual && !x.stale);
  const outdated =
    forWeek &&
    (fresh.length !== auto.length ||
      fresh.some((f) => {
        const x = auto.find((y) => y.key === f.key);
        return !x || (x.edited ? x.planAmount !== f.amount : x.amount !== f.amount || x.unit !== f.unit);
      }));
  const build = () => {
    const other = list && list.weekStart !== view.week ? list : null;
    if (other && other.items.some((x) => x.manual || x.checked)) {
      if (
        !window.confirm(
          `Die bestehende Einkaufsliste gehört zur Woche ab ${fmtDate(other.weekStart, 'dm')} und enthält eigene oder abgehakte Artikel. Durch die neue Liste ersetzen?`,
        )
      )
        return;
    }
    const res = buildShoppingList(ctx.state.shopping, ctx.state.mealPlan, view.week, recipes, { id: uid, now: new Date().toISOString() });
    view.changes = res.changes;
    ctx.commit(
      (s) => {
        s.shopping = res.list;
        return true;
      },
      forWeek ? 'Einkaufsliste mit dem Plan abgeglichen' : 'Einkaufsliste erstellt',
    );
  };
  /** @param {string} id @param {(x: import('../domain/planner.js').ShoppingItem) => void} fn @param {string} [msg] */
  const update = (id, fn, msg) =>
    ctx.commit((s) => {
      const x = s.shopping?.items.find((y) => y.id === id);
      if (!x) return false;
      fn(x);
      return true;
    }, msg);
  const groups = CATEGORY_ORDER.map((c) => ({
    c,
    items: (forWeek?.items ?? []).filter((x) => (x.manual ? 'Eigene Artikel' : x.category) === c),
  })).filter((g) => g.items.length);
  const open = (forWeek?.items ?? []).filter((x) => !x.checked).length;
  return h(
    'section',
    { class: 'card stack-sm', 'aria-labelledby': 'shop-h', id: 'shopping' },
    h(
      'div',
      { class: 'card-head' },
      h('h2', { id: 'shop-h' }, 'Einkaufsliste'),
      forWeek ? h('span', { class: 'small muted', id: 'shop-open' }, `${open} offen`) : null,
    ),
    !planned && !forWeek
      ? h(
          'p',
          { class: 'small', id: 'shop-empty' },
          'Für diese Woche ist noch nichts geplant. Plane zuerst Rezepte, dann entsteht hier die Liste.',
        )
      : null,
    planned
      ? h(
          'button',
          { type: 'button', class: forWeek ? 'btn' : 'btn primary', id: 'shop-build', on: { click: build } },
          forWeek ? 'Mit dem Wochenplan abgleichen' : 'Aus dem Wochenplan erstellen',
        )
      : null,
    outdated
      ? h(
          'p',
          { class: 'note warn small', id: 'shop-outdated' },
          'Der Wochenplan hat sich seit der letzten Aktualisierung geändert. Abgleichen übernimmt die neuen Mengen; deine Häkchen, eigenen Artikel und geänderten Mengen bleiben.',
        )
      : null,
    view.changes.length
      ? h(
          'div',
          { class: 'note info small', id: 'shop-changes' },
          h('p', {}, 'Beim Abgleich beachtet:'),
          h('ul', {}, ...view.changes.map((c) => h('li', {}, c))),
        )
      : null,
    ...groups.map((g) =>
      h(
        'div',
        { class: 'shop-group' },
        h('h3', { class: 'eyebrow' }, g.c),
        h(
          'ul',
          { class: 'shop-list' },
          ...g.items.map((x) =>
            h(
              'li',
              { class: x.checked ? 'shop-item done' : 'shop-item', id: `item-${x.id}` },
              h(
                'label',
                { class: 'check' },
                h('input', {
                  type: 'checkbox',
                  id: `check-${x.id}`,
                  checked: x.checked,
                  on: { change: (e) => update(x.id, (y) => void (y.checked = /** @type {HTMLInputElement} */ (e.target).checked)) },
                }),
                h(
                  'span',
                  {},
                  x.label,
                  x.stale ? h('small', { class: 'fast-tag' }, ' · nicht mehr im Plan') : null,
                  x.edited ? h('small', { class: 'muted' }, ' · von dir geändert') : null,
                ),
              ),
              h(
                'span',
                { class: 'shop-amount' },
                h('input', {
                  id: `amount-${x.id}`,
                  inputmode: 'decimal',
                  value: x.amount === null ? '' : String(x.amount),
                  placeholder: 'nach Bedarf',
                  'aria-label': `Menge ${x.label}`,
                  class: 'serv-input',
                  on: {
                    change: (e) => {
                      const raw = /** @type {HTMLInputElement} */ (e.target).value.trim();
                      const v = raw === '' ? null : Number(raw.replace(',', '.'));
                      if (v !== null && !(v >= 0 && v < 100000)) return ctx.toast('Ungültige Menge.', 'error');
                      update(
                        x.id,
                        (y) => {
                          if (!y.manual && !y.edited) y.planAmount = y.amount;
                          y.amount = v;
                          if (!y.manual) y.edited = true;
                        },
                        'Menge geändert',
                      );
                    },
                  },
                }),
                h('span', { class: 'small' }, x.unit),
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: 'icon-btn',
                  'aria-label': `${x.label} von der Liste entfernen`,
                  on: {
                    click: () => {
                      if (x.manual && !window.confirm(`«${x.label}» von der Liste entfernen?`)) return;
                      ctx.commit((s) => {
                        if (!s.shopping) return false;
                        s.shopping.items = s.shopping.items.filter((y) => y.id !== x.id);
                        return true;
                      }, 'Entfernt');
                    },
                  },
                },
                '×',
              ),
            ),
          ),
        ),
      ),
    ),
    forWeek || planned
      ? h(
          'form',
          {
            class: 'plan-add-row',
            id: 'shop-add',
            on: {
              submit: (e) => {
                e.preventDefault();
                const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
                const label = String(fd.get('label') ?? '')
                  .trim()
                  .slice(0, 80);
                if (!label) return ctx.toast('Bitte einen Artikel eingeben.', 'error');
                const raw = String(fd.get('amount') ?? '').trim();
                const amount = raw === '' ? null : Number(raw.replace(',', '.'));
                if (amount !== null && !(amount >= 0 && amount < 100000)) return ctx.toast('Ungültige Menge.', 'error');
                const unit = /** @type {any} */ (String(fd.get('unit') ?? ''));
                ctx.commit((s) => {
                  if (!s.shopping || s.shopping.weekStart !== view.week)
                    s.shopping = {
                      weekStart: view.week,
                      updatedAt: new Date().toISOString(),
                      items: s.shopping?.weekStart === view.week ? s.shopping.items : [],
                    };
                  s.shopping.items.push({
                    id: uid(),
                    key: `txt:${label.toLowerCase()}`,
                    label,
                    amount,
                    unit,
                    category: 'Eigene Artikel',
                    checked: false,
                    manual: true,
                  });
                  return true;
                }, `${label} hinzugefügt`);
              },
            },
          },
          h('input', { name: 'label', id: 'shop-label', placeholder: 'Eigener Artikel, z. B. Kaffee', 'aria-label': 'Artikel' }),
          h('input', {
            name: 'amount',
            id: 'shop-amount',
            inputmode: 'decimal',
            placeholder: 'Menge',
            'aria-label': 'Menge',
            class: 'serv-input',
          }),
          h(
            'select',
            { name: 'unit', id: 'shop-unit', 'aria-label': 'Einheit' },
            h('option', { value: '' }, '–'),
            ...UNITS.map((u) => h('option', { value: u }, u)),
          ),
          h('button', { type: 'submit', class: 'btn small-btn', id: 'shop-add-go' }, 'Hinzufügen'),
        )
      : null,
    h(
      'p',
      { class: 'hint' },
      'Gleiche Zutaten werden zusammengezählt, wenn die Einheiten zusammenpassen (z. B. g und kg); sonst stehen sie getrennt. Gewürze ohne Menge stehen als «nach Bedarf».',
    ),
  );
}
