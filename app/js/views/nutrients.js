// @ts-check
// Nährstoffe nach dem Vorbild von MyFitnessPal: Makro-Ring, Balken mit «% vom Tagesbedarf»
// (Tag oder 7-Tage-Schnitt), Vorschläge für die nächste Mahlzeit und Lebensmittelsuche.

import { h, s, fmt, nowTime } from '../ui/dom.js';
import { uid } from '../store.js';
import { FOODS, FOOD_SOURCE } from '../data/foods.js';
import {
  NUTRIENTS,
  dailyTargets,
  dayAmounts,
  averageAmounts,
  macroSplit,
  suggestions,
  searchFoods,
  entryFromFood,
} from '../domain/micros.js';
import { addDays } from '../domain/util.js';

/** @typedef {import('../app.js').Ctx} Ctx */
/** @typedef {import('../domain/micros.js').NutrientDef} NutrientDef */

/** Ansicht merken, solange die App offen ist. */
const view = { period: /** @type {'tag' | 'woche'} */ ('tag') };

/**
 * Datenbank-Lebensmittel als Eintrag speichern.
 * @param {Ctx} ctx
 * @param {import('../data/foods.js').Food} food
 * @param {number} grams
 */
function addFood(ctx, food, grams) {
  const e = entryFromFood(food, grams);
  ctx.commit((st) => {
    const d = (st.days[ctx.date] = st.days[ctx.date] ?? {});
    d.food = [...(d.food ?? []), { id: uid(), time: nowTime(), ...e }];
  }, `${e.name} erfasst`);
}

/**
 * Lebensmittel aus der Datenbank suchen und mit Grammzahl erfassen. Die Trefferliste
 * wird lokal aktualisiert, damit das Suchfeld beim Tippen den Fokus behält.
 * @param {Ctx} ctx
 */
export function foodSearchBlock(ctx) {
  const results = h('div', { class: 'search-results', id: 'food-search-results', 'aria-live': 'polite' });
  /** @param {import('../data/foods.js').Food} food */
  const pick = (food) => {
    const grams = h('input', { id: 'food-search-grams', inputmode: 'numeric', value: String(food.g), 'aria-label': 'Menge in Gramm' });
    results.replaceChildren(
      h(
        'form',
        {
          class: 'search-pick',
          on: {
            submit: (e) => {
              e.preventDefault();
              const g = Number(/** @type {HTMLInputElement} */ (grams).value.replace(',', '.'));
              if (!Number.isFinite(g) || g <= 0 || g > 3000) return ctx.toast('Bitte eine Menge zwischen 1 und 3000 g eingeben.', 'error');
              addFood(ctx, food, g);
            },
          },
        },
        h('strong', {}, food.n),
        h('span', { class: 'small muted' }, `${food.p} = ${fmt(food.g)} g · ${fmt(food.v.kcal ?? 0)} kcal pro 100 g`),
        h('div', { class: 'with-suffix' }, grams, h('span', { class: 'suffix' }, 'g')),
        h('button', { type: 'submit', class: 'btn primary', id: 'food-search-add' }, 'Erfassen'),
      ),
    );
  };
  return h(
    'div',
    { class: 'food-search' },
    h('label', { for: 'food-search', class: 'eyebrow' }, 'Lebensmittel suchen (mit Vitaminen und Mineralstoffen)'),
    h('input', {
      type: 'search',
      id: 'food-search',
      autocomplete: 'off',
      placeholder: 'z. B. Kiwi, Lachs, Haferflocken',
      on: {
        input: (e) => {
          const q = /** @type {HTMLInputElement} */ (e.target).value;
          const hits = searchFoods(FOODS, q).slice(0, 6);
          results.replaceChildren(
            ...(q.trim() && !hits.length ? [h('p', { class: 'small muted' }, 'Nicht in der Liste. Nutze Foto oder Beschreiben.')] : []),
            ...hits.map((f) =>
              h(
                'button',
                { type: 'button', class: 'chip', on: { click: () => pick(f) } },
                f.n,
                h('small', {}, `${f.p} · ${fmt(((f.v.kcal ?? 0) * f.g) / 100)} kcal`),
              ),
            ),
          );
        },
      },
    }),
    results,
  );
}

/**
 * Makro-Ring: Anteil der Energie aus Kohlenhydraten, Fett und Protein, mit Ziel daneben.
 * Die Anteile stammen nur aus Einträgen mit vollständigen Makros.
 * @param {import('../domain/micros.js').Amounts} a
 * @param {import('../domain/micros.js').Amounts} known
 * @param {Partial<Record<import('../domain/micros.js').NutrientKey, number>>} targets
 */
function macroRing(a, known, targets) {
  const split = macroSplit(known);
  const goal = macroSplit({ protein: targets.protein, carbs: targets.carbs, fat: targets.fat });
  const r = 40;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const parts = /** @type {const} */ ([
    ['carbs', 'Kohlenhydrate', 'ring-carbs'],
    ['fat', 'Fett', 'ring-fat'],
    ['protein', 'Protein', 'ring-protein'],
  ]);
  const arcs = parts.map(([k, , cls]) => {
    const len = split[k] * c;
    const el = s('circle', {
      cx: 50,
      cy: 50,
      r,
      class: `ring-arc ${cls}`,
      'stroke-dasharray': `${len.toFixed(2)} ${(c - len).toFixed(2)}`,
      'stroke-dashoffset': (-offset).toFixed(2),
    });
    offset += len;
    return el;
  });
  const empty = !(split.protein + split.carbs + split.fat);
  return h(
    'div',
    { class: 'macro-ring' },
    s(
      'svg',
      {
        viewBox: '0 0 100 100',
        class: 'ring',
        role: 'img',
        'aria-label': empty
          ? 'Noch keine Einträge mit Kohlenhydraten und Fett'
          : `Energieanteile: Kohlenhydrate ${Math.round(split.carbs * 100)} %, Fett ${Math.round(split.fat * 100)} %, Protein ${Math.round(split.protein * 100)} %`,
      },
      s('circle', { cx: 50, cy: 50, r, class: 'ring-track' }),
      ...(empty ? [] : arcs),
      s('text', { x: 50, y: 48, class: 'ring-num', 'text-anchor': 'middle' }, fmt(a.kcal ?? 0)),
      s('text', { x: 50, y: 62, class: 'ring-unit', 'text-anchor': 'middle' }, 'kcal'),
    ),
    h(
      'table',
      { class: 'macro-legend' },
      h('thead', {}, h('tr', {}, h('th', {}, h('span', { class: 'sr-only' }, 'Makronährstoff')), h('th', {}, 'Ist'), h('th', {}, 'Ziel'))),
      h(
        'tbody',
        {},
        ...parts.map(([k, label, cls]) =>
          h(
            'tr',
            {},
            h('th', { scope: 'row' }, h('span', { class: `dot ${cls}`, 'aria-hidden': 'true' }), label),
            h('td', {}, `${Math.round(split[k] * 100)} %`, h('small', {}, ` ${fmt(a[k] ?? 0)} g`)),
            h('td', {}, `${Math.round(goal[k] * 100)} %`, h('small', {}, ` ${fmt(targets[k] ?? 0)} g`)),
          ),
        ),
      ),
    ),
  );
}

/**
 * Eine Zeile: Name, Wert / Ziel, Balken, Prozent.
 * @param {NutrientDef} n
 * @param {number} value
 * @param {number | undefined} target
 */
function nutrientRow(n, value, target) {
  const pct = target ? value / target : null;
  // Kohlenhydrate und Fett sind Verteilungs-Richtwerte: neutral darstellen, nicht «erreicht»
  const neutral = n.key === 'carbs' || n.key === 'fat';
  const state =
    pct === null
      ? 'info'
      : neutral
        ? 'mid'
        : n.kind === 'limit'
          ? pct > 1
            ? 'over'
            : 'ok'
          : pct >= 1
            ? 'done'
            : pct >= 0.5
              ? 'mid'
              : 'low';
  const fill = h('span', { class: 'nbar-fill' });
  if (pct !== null) fill.style.width = `${Math.min(pct, 1) * 100}%`;
  return h(
    'li',
    { class: `nrow n-${state}`, id: `n-${n.key}` },
    h('span', { class: 'nrow-label' }, n.label, n.note ? h('small', {}, n.note) : null),
    h(
      'span',
      { class: 'nrow-val' },
      h('strong', {}, fmt(value, n.digits)),
      target ? ` / ${n.kind === 'limit' ? 'max. ' : ''}${fmt(target, n.digits)} ${n.unit}` : ` ${n.unit}`,
    ),
    pct !== null ? h('span', { class: 'nbar', 'aria-hidden': 'true' }, fill) : null,
    h('span', { class: 'nrow-pct' }, pct !== null ? `${Math.round(pct * 100)} %` : ''),
  );
}

/**
 * Nährstoffkarte.
 * @param {Ctx} ctx
 * @param {NonNullable<Ctx['snap']>} snap
 */
export function nutrientsCard(ctx, snap) {
  const targets = dailyTargets({ kcalTarget: snap.kcalTarget, proteinG: snap.protein.grams, sex: snap.profile.sex });
  const week = view.period === 'woche';
  const days = Array.from({ length: 7 }, (_, i) => ctx.state.days[addDays(ctx.date, -i)]?.food ?? []);
  const r = week ? averageAmounts(days) : { ...dayAmounts(snap.day.food ?? []), days: 1 };
  const a = r.amounts;
  const anyKi = (week ? days.flat() : (snap.day.food ?? [])).some((f) => f.microSrc === 'ki' || f.microSrc === 'mix');
  /** @param {NutrientDef['group']} g */
  const rows = (g) => NUTRIENTS.filter((n) => n.group === g).map((n) => nutrientRow(n, a[n.key] ?? 0, targets[n.key]));
  const reached = (/** @type {NutrientDef['group']} */ g) =>
    NUTRIENTS.filter((n) => n.group === g && n.kind === 'target' && n.ref && (a[n.key] ?? 0) >= (targets[n.key] ?? Infinity)).length;
  const total = (/** @type {NutrientDef['group']} */ g) => NUTRIENTS.filter((n) => n.group === g && n.kind === 'target' && n.ref).length;
  const coverage = Math.round(r.coverage * 100);

  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'nut-h', id: 'nutrients-card' },
    h(
      'div',
      { class: 'card-head' },
      h('h2', { id: 'nut-h' }, 'Nährstoffe'),
      h(
        'div',
        { class: 'segmented', role: 'group', 'aria-label': 'Zeitraum' },
        ...[
          ['tag', 'Tag'],
          ['woche', '7 Tage'],
        ].map(([id, label]) =>
          h(
            'button',
            {
              type: 'button',
              id: `nut-${id}`,
              'aria-pressed': String(view.period === id),
              on: {
                click: () => {
                  view.period = /** @type {'tag' | 'woche'} */ (id);
                  ctx.go('ernaehrung');
                },
              },
            },
            label,
          ),
        ),
      ),
    ),
    week ? h('p', { class: 'small muted' }, `Durchschnitt pro Tag über ${r.days} ${r.days === 1 ? 'Tag' : 'Tage'} mit Einträgen.`) : null,
    macroRing(a, r.macroKnown, targets),
    r.macroCoverage < 0.95
      ? h(
          'p',
          { class: 'small muted', id: 'nut-macro-coverage' },
          `Kohlenhydrate und Fett sind für ${Math.round(r.macroCoverage * 100)} % der Kalorien bekannt. Die Verteilung im Ring stammt nur aus diesen Einträgen.`,
        )
      : null,
    h('h3', { class: 'eyebrow' }, 'Makronährstoffe'),
    h('ul', { class: 'nlist' }, ...rows('makro')),
    h(
      'details',
      { class: 'ngroup', open: true },
      h('summary', {}, `Vitamine · ${reached('vitamin')} von ${total('vitamin')} erreicht`),
      h('ul', { class: 'nlist' }, ...rows('vitamin')),
    ),
    h(
      'details',
      { class: 'ngroup', open: true },
      h('summary', {}, `Mineralstoffe · ${reached('mineral')} von ${total('mineral')} erreicht`),
      h('ul', { class: 'nlist' }, ...rows('mineral')),
    ),
    coverage < 95
      ? h(
          'p',
          { class: 'note info small', id: 'nut-coverage' },
          `Vitamine und Mineralstoffe sind für ${coverage} % der Kalorien bekannt. Einträge ohne diese Angaben (z. B. Schnellerfassung, Packung) fehlen, die Werte sind also Mindestwerte. Mit «Lebensmittel suchen» oder Foto werden sie vollständig.`,
        )
      : null,
    anyKi
      ? h(
          'p',
          { class: 'hint' },
          'Bei Foto und Beschreibung stammen die Werte aus der Datenbank, wenn der Bestandteil erkannt wurde, sonst aus einer KI-Schätzung (bei Vitaminen oft ±30–50 %).',
        )
      : null,
    h(
      'p',
      { class: 'hint' },
      `Referenzwerte: D-A-CH (DGE, ÖGE, SGE) für Erwachsene, Natrium und gesättigte Fette nach WHO. Nährwerte: ${FOOD_SOURCE}, unangereicherte Lebensmittel. Bei Vitaminen zählt der Wochenschnitt mehr als ein einzelner Tag.`,
    ),
  );
}

/**
 * Vorschläge für das nächste Essen, passend zu den Lücken von heute.
 * @param {Ctx} ctx
 * @param {NonNullable<Ctx['snap']>} snap
 */
export function suggestCard(ctx, snap) {
  const targets = dailyTargets({ kcalTarget: snap.kcalTarget, proteinG: snap.protein.grams, sex: snap.profile.sex });
  const { amounts } = dayAmounts(snap.day.food ?? []);
  const kcalLeft = snap.kcalTarget - snap.kcal;
  const list = suggestions({ foods: FOODS, amounts, targets, kcalLeft, prefs: snap.profile.foodPrefs, limit: 3 });
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'sug-h', id: 'suggest-card' },
    h('h2', { id: 'sug-h' }, 'Vorschlag fürs nächste Essen'),
    list.length
      ? h(
          'ul',
          { class: 'suggestions' },
          ...list.map((sg, i) =>
            h(
              'li',
              { class: 'suggestion', id: `sug-${i}` },
              h('span', { class: 'eyebrow' }, sg.label),
              h('strong', {}, `${sg.food.n}: ${sg.portion}`),
              h(
                'span',
                { class: 'small' },
                `${fmt(sg.grams)} g · ${fmt(sg.kcal)} kcal${sg.protein >= 5 ? ` · ${fmt(sg.protein)} g Protein` : ''}. Schliesst ${Math.round(sg.pct * 100)} % der Lücke bei ${sg.label}`,
                sg.also.length ? `, dazu ${sg.also.map((o) => `${Math.round(o.pct * 100)} % ${o.label}`).join(' und ')}` : '',
                '.',
              ),
              h(
                'button',
                { type: 'button', class: 'btn small-btn', id: `sug-add-${i}`, on: { click: () => addFood(ctx, sg.food, sg.grams) } },
                '+ Erfassen',
              ),
            ),
          ),
        )
      : h(
          'p',
          { class: 'small', id: 'sug-none' },
          kcalLeft < 100
            ? 'Das Tagesbudget ist ausgeschöpft. Morgen geht es weiter.'
            : 'Heute sind alle wichtigen Nährstoffe gut gedeckt. Stark!',
        ),
    h(
      'p',
      { class: 'hint' },
      'Berechnet aus deinen heutigen Einträgen, dem restlichen Kalorienbudget und deinen Vorlieben (Profil). Vitamin D ist ausgenommen: Es kommt vor allem aus der Sonne, im Winter ist ein Präparat oft sinnvoll (ärztlich besprechen).',
    ),
  );
}
