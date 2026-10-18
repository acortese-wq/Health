// @ts-check
// Nährstoffe nach dem Vorbild von MyFitnessPal: Makro-Ring, Balken mit «% vom Tagesbedarf»
// (Tag oder 7-Tage-Schnitt), Vorschläge für die nächste Mahlzeit und Lebensmittelsuche.

import { h, s, fmt, fmtDate, nowTime } from '../ui/dom.js';
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
  contributions,
} from '../domain/micros.js';
import { addDays } from '../domain/util.js';
import { productPortion } from '../domain/foodvision.js';
import { pyramid } from '../domain/foodgroups.js';
import { mealSlots, proteinPerMeal, cravingPatterns, TRIGGERS, HUNGER, TRIGGER_TIPS } from '../domain/meals.js';
import { suggestMeals, nextSlot, CANTEEN_TIPS } from '../domain/mealplans.js';
import { addGroups } from '../domain/foodgroups.js';
import { isPremenstrual } from '../domain/cycle.js';
import { searchProducts } from '../vision.js';

/** @typedef {import('../app.js').Ctx} Ctx */
/** @typedef {import('../domain/micros.js').NutrientDef} NutrientDef */

/** Ansicht merken, solange die App offen ist. */
const view = { period: /** @type {'tag' | 'woche'} */ ('tag'), store: '' };

/** Händler-Filter für die Produktsuche (Tags in Open Food Facts). */
const STORES = [
  ['', 'Alle'],
  ['migros', 'Migros'],
  ['coop', 'Coop'],
  ['denner', 'Denner'],
  ['aldi', 'Aldi'],
  ['lidl', 'Lidl'],
];

/** @type {AbortController | null} */
let offAbort = null;

/**
 * Produkt aus Open Food Facts mit Grammzahl speichern (Etikettwerte).
 * @param {Ctx} ctx
 * @param {import('../domain/foodvision.js').Product} p
 * @param {number} grams
 */
function addProduct(ctx, p, grams) {
  const v = productPortion(p, grams);
  const name = `${p.name}${p.brand ? ` (${p.brand})` : ''}, ${Math.round(grams)} ${p.unit}`;
  ctx.commit((st) => {
    const d = (st.days[ctx.date] = st.days[ctx.date] ?? {});
    d.food = [
      ...(d.food ?? []),
      {
        id: uid(),
        time: nowTime(),
        name,
        kcal: v.kcal,
        protein: Math.round(v.protein),
        carbs: v.carbs,
        fat: v.fat,
        sugar: v.sugar,
        satFat: v.satFat,
        fiber: v.fiber,
        salt: v.salt,
        ...(v.micros && Object.keys(v.micros).length ? { micros: v.micros, microSrc: v.microSrc ?? 'etikett' } : {}),
        grams: Math.round(grams),
        ...(p.nova ? { nova: p.nova } : {}),
        source: 'barcode',
      },
    ];
  }, `${p.name} erfasst`);
}

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
    productSearch(ctx, () => /** @type {HTMLInputElement | null} */ (document.getElementById('food-search'))?.value ?? ''),
  );
}

/**
 * Produkte aus der Schweiz (Migros, Coop …) über Open Food Facts suchen. Werte stammen von
 * den Etiketten; Vitamine nur, wenn sie auf der Packung stehen.
 * @param {Ctx} ctx
 * @param {() => string} query
 */
function productSearch(ctx, query) {
  const out = h('div', { class: 'search-results', id: 'off-results', 'aria-live': 'polite' });
  /** @param {import('../domain/foodvision.js').Product} p */
  const pick = (p) => {
    const grams = h('input', {
      id: 'off-grams',
      inputmode: 'numeric',
      value: String(p.servingG || 100),
      'aria-label': `Menge in ${p.unit}`,
    });
    const micros = p.per100.micros ? Object.keys(p.per100.micros).filter((k) => k !== 'sodium').length : 0;
    out.replaceChildren(
      h(
        'form',
        {
          class: 'search-pick',
          on: {
            submit: (e) => {
              e.preventDefault();
              const g = Number(/** @type {HTMLInputElement} */ (grams).value.replace(',', '.'));
              if (!Number.isFinite(g) || g <= 0 || g > 3000) return ctx.toast('Bitte eine Menge zwischen 1 und 3000 eingeben.', 'error');
              addProduct(ctx, p, g);
            },
          },
        },
        h('strong', {}, p.name),
        h('span', { class: 'small muted' }, [p.brand, p.stores].filter(Boolean).join(' · ')),
        h(
          'span',
          { class: 'small' },
          `Pro 100 ${p.unit}: ${fmt(p.per100.kcal)} kcal · ${fmt(p.per100.protein, 1)} g Protein · ${fmt(p.per100.carbs, 1)} g KH · ${fmt(p.per100.fat, 1)} g Fett`,
          micros ? ` · ${micros} Vitamine/Mineralstoffe vom Etikett` : '',
        ),
        p.nova === 4
          ? h(
              'span',
              { class: 'note warn small', id: 'off-nova' },
              'Stark verarbeitet (NOVA 4): macht weniger satt; in Studien wurde damit mehr gegessen.',
            )
          : null,
        h('div', { class: 'with-suffix' }, grams, h('span', { class: 'suffix' }, p.unit)),
        h('button', { type: 'submit', class: 'btn primary', id: 'off-add' }, 'Erfassen'),
      ),
    );
  };
  const run = async () => {
    const q = query().trim();
    if (q.length < 2) return ctx.toast('Bitte zuerst einen Suchbegriff eingeben.', 'error');
    offAbort?.abort();
    offAbort = new AbortController();
    out.replaceChildren(h('p', { class: 'small muted' }, 'Suche bei Open Food Facts …'));
    try {
      const list = await searchProducts(q, view.store, offAbort.signal);
      out.replaceChildren(
        ...(list.length
          ? list
              .slice(0, 12)
              .map((p, i) =>
                h(
                  'button',
                  { type: 'button', class: 'chip', id: `off-${i}`, on: { click: () => pick(p) } },
                  p.name,
                  h(
                    'small',
                    {},
                    [p.brand, p.stores?.split(',')[0]].filter(Boolean).join(' · '),
                    ` · ${fmt(p.per100.kcal)} kcal/100 ${p.unit}`,
                    p.per100.micros ? ' · mit Vitaminen' : '',
                    p.nova === 4 ? ' · stark verarbeitet' : '',
                  ),
                ),
              )
          : [h('p', { class: 'small muted' }, 'Keine Produkte gefunden. Anderer Begriff, anderer Händler oder Barcode scannen.')]),
      );
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      out.replaceChildren(h('p', { class: 'small note warn' }, e instanceof Error ? e.message : String(e)));
    }
  };
  return h(
    'div',
    { class: 'off-search stack-sm' },
    h(
      'div',
      { class: 'segmented wrap', role: 'group', 'aria-label': 'Händler' },
      ...STORES.map(([id, label]) =>
        h(
          'button',
          {
            type: 'button',
            id: `store-${id || 'alle'}`,
            'aria-pressed': String(view.store === id),
            on: {
              click: (e) => {
                view.store = id;
                const group = /** @type {HTMLElement} */ (e.currentTarget).parentElement;
                group?.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.id === `store-${id || 'alle'}`)));
              },
            },
          },
          label,
        ),
      ),
    ),
    h('button', { type: 'button', class: 'btn', id: 'off-search', on: { click: run } }, 'In Produkten von Migros, Coop & Co. suchen'),
    out,
    h(
      'p',
      { class: 'hint' },
      'Quelle: Open Food Facts (offene Datenbank, ODbL), Werte von den Packungen. Vitamine nur, wenn sie auf dem Etikett stehen. Die Suchanfrage geht an Open Food Facts, keine weiteren Daten.',
    ),
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

/** Aufgeklappte Zeilen merken, damit sie nach dem Neuzeichnen offen bleiben. */
const openRows = new Set();

/**
 * Antippbare Zeile: Zusammenfassung (Name, Wert, Balken) und darunter die Einträge,
 * die dazu beitragen.
 * @param {string} id
 * @param {string} cls
 * @param {import('../ui/dom.js').Child[]} summary
 * @param {() => import('../ui/dom.js').Child} body wird erst beim Aufklappen gebraucht, aber immer erzeugt (klein)
 */
function drillRow(id, cls, summary, body) {
  const d = h(
    'details',
    {
      class: 'ndetails',
      open: openRows.has(id),
      on: {
        toggle: (e) => {
          if (/** @type {HTMLDetailsElement} */ (e.currentTarget).open) openRows.add(id);
          else openRows.delete(id);
        },
      },
    },
    h('summary', { class: `nrow ${cls}` }, ...summary),
    body(),
  );
  return h('li', { id }, d);
}

/**
 * Liste der Einträge, die zu einem Wert beitragen.
 * @param {{ label: string, value: string, share?: number }[]} items
 * @param {string} [empty]
 * @param {string} [note]
 */
function contribList(items, empty = 'Kein Eintrag trägt dazu bei.', note = '') {
  return h(
    'div',
    { class: 'contrib' },
    items.length
      ? h(
          'ul',
          {},
          ...items.map((it) =>
            h(
              'li',
              {},
              h('span', { class: 'contrib-name' }, it.label),
              h(
                'span',
                { class: 'contrib-val' },
                it.value,
                it.share !== undefined ? h('small', {}, ` ${Math.round(it.share * 100)} %`) : null,
              ),
            ),
          ),
        )
      : h('p', { class: 'small muted' }, empty),
    note ? h('p', { class: 'small muted' }, note) : null,
  );
}

/**
 * Eine Zeile: Name, Wert / Ziel, Balken, Prozent.
 * @param {NutrientDef} n
 * @param {number} value
 * @param {number | undefined} target
 * @param {{ food: (import('../store.js').FoodEntry & { day?: string })[], week: boolean, extra?: string }} src
 */
function nutrientRow(n, value, target, src) {
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
  const c = contributions(src.food, n.key);
  const fmtV = (/** @type {number} */ v) => `${fmt(v, n.digits)} ${n.unit}`;
  return drillRow(
    `n-${n.key}`,
    `n-${state}`,
    [
      h('span', { class: 'nrow-label' }, n.label, n.note ? h('small', {}, n.note) : null),
      h(
        'span',
        { class: 'nrow-val' },
        h('strong', {}, fmt(value, n.digits)),
        target ? ` / ${n.kind === 'limit' ? 'max. ' : ''}${fmt(target, n.digits)} ${n.unit}` : ` ${n.unit}`,
      ),
      pct !== null ? h('span', { class: 'nbar', 'aria-hidden': 'true' }, fill) : null,
      h('span', { class: 'nrow-pct' }, pct !== null ? `${Math.round(pct * 100)} %` : ''),
    ],
    () =>
      contribList(
        c.items.slice(0, 12).map((x) => ({
          label: `${src.week && x.f.day ? `${fmtDate(x.f.day, 'dm')} ` : ''}${x.f.time} ${x.f.name}`,
          value: fmtV(x.value),
          share: x.share,
        })),
        'Kein erfasster Eintrag liefert diesen Nährstoff.',
        [
          src.week ? 'Summe über 7 Tage, der Balken zeigt den Tagesschnitt.' : '',
          c.unknown.length
            ? `Ohne Angabe: ${c.unknown.length} ${c.unknown.length === 1 ? 'Eintrag' : 'Einträge'} (${c.unknown
                .map((f) => f.name)
                .slice(0, 3)
                .join(', ')}${c.unknown.length > 3 ? ' …' : ''}).`
            : '',
          src.extra ?? '',
        ]
          .filter(Boolean)
          .join(' '),
      ),
  );
}

/**
 * Nährstoffkarte.
 * @param {Ctx} ctx
 * @param {NonNullable<Ctx['snap']>} snap
 */
export function nutrientsCard(ctx, snap) {
  const targets = dailyTargets({ kcalTarget: snap.kcalTarget, proteinG: snap.protein.grams, sex: snap.profile.sex, stage: snap.lifeStage });
  const week = view.period === 'woche';
  const days = Array.from({ length: 7 }, (_, i) => ctx.state.days[addDays(ctx.date, -i)]?.food ?? []);
  const r = week ? averageAmounts(days) : { ...dayAmounts(snap.day.food ?? []), days: 1 };
  const supp = snap.profile.vitDSupplementUg ?? 0;
  // Vitamin-D-Präparat aus dem Profil mitzählen
  const a = supp > 0 ? { ...r.amounts, vitD: (r.amounts.vitD ?? 0) + supp } : r.amounts;
  const anyKi = (week ? days.flat() : (snap.day.food ?? [])).some((f) => f.microSrc === 'ki' || f.microSrc === 'mix');
  /** @param {NutrientDef['group']} g */
  const src = {
    food: week
      ? Array.from({ length: 7 }, (_, i) => addDays(ctx.date, -i)).flatMap((d) =>
          (ctx.state.days[d]?.food ?? []).map((f) => ({ ...f, day: d })),
        )
      : (snap.day.food ?? []),
    week,
  };
  const rows = (/** @type {NutrientDef['group']} */ g) =>
    NUTRIENTS.filter((n) => n.group === g).map((n) =>
      nutrientRow(
        n,
        a[n.key] ?? 0,
        targets[n.key],
        n.key === 'vitD' && supp > 0 ? { ...src, extra: `Dazu Präparat ${fmt(supp, 1)} µg pro Tag.` } : src,
      ),
    );
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
    supp > 0
      ? h('p', { class: 'hint', id: 'nut-vitd' }, `Vitamin D inklusive Präparat (${fmt(supp, 1)} µg pro Tag, aus dem Profil).`)
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
  const targets = dailyTargets({ kcalTarget: snap.kcalTarget, proteinG: snap.protein.grams, sex: snap.profile.sex, stage: snap.lifeStage });
  const { amounts } = dayAmounts(snap.day.food ?? []);
  const kcalLeft = snap.kcalTarget - snap.kcal;
  const list = suggestions({ foods: FOODS, amounts, targets, kcalLeft, prefs: snap.profile.foodPrefs, limit: 3 });
  const now = new Date();
  const slot = ctx.date === ctx.today ? nextSlot(now.getHours() * 60 + now.getMinutes()) : 'mittag';
  const weekFish = Array.from({ length: 7 }, (_, i) => ctx.state.days[addDays(ctx.date, -i)]?.food ?? [])
    .flat()
    .reduce((a, f) => a + (f.groups?.fisch ?? 0), 0);
  const meals = suggestMeals({
    slot,
    kcalLeft,
    proteinLeft: snap.protein.grams - snap.proteinG,
    amounts,
    targets,
    prefs: snap.profile.foodPrefs,
    dayGroups: addGroups(...(snap.day.food ?? []).map((f) => f.groups)),
    weekFish,
  });
  const slotLabel = { morgen: 'Morgenessen', mittag: 'Mittagessen', zvieri: 'Zvieri', abend: 'Znacht' }[slot];
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'sug-h', id: 'suggest-card' },
    h('h2', { id: 'sug-h' }, 'Vorschlag fürs nächste Essen'),
    meals.length && kcalLeft >= 120
      ? [
          h('h3', { class: 'eyebrow' }, `Passend als ${slotLabel}`),
          h(
            'ul',
            { class: 'suggestions' },
            ...meals.map((m, i) =>
              h(
                'li',
                { class: 'suggestion meal', id: `meal-${i}` },
                h('strong', {}, m.template.name),
                h('span', { class: 'small' }, `${fmt(m.entry.kcal)} kcal · ${m.highlights.join(' · ')}`),
                m.template.note ? h('span', { class: 'small muted' }, m.template.note) : null,
                h(
                  'span',
                  { class: 'small muted' },
                  m.template.parts.map(([k, g]) => `${FOODS.find((f) => f.k === k)?.n ?? k} ${g} g`).join(', '),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'btn small-btn',
                    id: `meal-add-${i}`,
                    on: {
                      click: () => {
                        const { tags: _t, ...e } = m.entry;
                        ctx.commit((st) => {
                          const d = (st.days[ctx.date] = st.days[ctx.date] ?? {});
                          d.food = [...(d.food ?? []), { id: uid(), time: nowTime(), ...e }];
                        }, `${m.template.name} erfasst`);
                      },
                    },
                  },
                  '+ Erfassen',
                ),
              ),
            ),
          ),
          h('h3', { class: 'eyebrow' }, 'Gezielt ergänzen'),
        ]
      : null,
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
    h(
      'details',
      { id: 'canteen' },
      h('summary', {}, 'Im Personalrestaurant oder auswärts'),
      h('ul', { class: 'small' }, ...CANTEEN_TIPS.map((t) => h('li', {}, t))),
    ),
  );
}

/** Gruppen hinter jeder Pyramidenzeile (für die Aufschlüsselung). */
const PYRAMID_KEYS = /** @type {Record<string, import('../domain/foodgroups.js').GroupKey[]>} */ ({
  fv: ['gemuese', 'frucht'],
  staerke: ['staerke'],
  milch: ['milch'],
  protein: ['fleisch', 'wurst', 'fisch', 'ei', 'pflanzlProtein', 'huelsen'],
  nuss: ['nuss'],
  suess: ['suess'],
  fisch: ['fisch'],
  fleisch: ['fleisch', 'wurst'],
  huelsen: ['huelsen'],
});

/** Zahl für den Balken einer Pyramidenzeile (Ziel bzw. Obergrenze). */
const PYRAMID_SCALE = /** @type {Record<string, number>} */ ({
  fv: 5,
  staerke: 3,
  milch: 3,
  protein: 1,
  nuss: 25,
  suess: 1,
  fisch: 2,
  fleisch: 3,
  huelsen: 1,
});

/**
 * Schweizer Lebensmittelpyramide: Portionen heute und in den letzten 7 Tagen.
 * @param {Ctx} ctx
 * @param {NonNullable<Ctx['snap']>} snap
 */
export function pyramidCard(ctx, snap) {
  const week = Array.from({ length: 7 }, (_, i) => ctx.state.days[addDays(ctx.date, -i)]?.food ?? []);
  const p = pyramid({ today: snap.day.food ?? [], week });
  const todayFood = snap.day.food ?? [];
  const weekFood = Array.from({ length: 7 }, (_, i) => addDays(ctx.date, -i)).flatMap((d) =>
    (ctx.state.days[d]?.food ?? []).map((f) => ({ ...f, day: d })),
  );
  /**
   * @param {import('../domain/foodgroups.js').PyramidRow} r
   * @param {boolean} weekly
   */
  const row = (r, weekly) => {
    const scale = PYRAMID_SCALE[r.id] ?? 1;
    const pct = Math.min(r.value / scale, 1);
    const fill = h('span', { class: 'nbar-fill' });
    fill.style.width = `${pct * 100}%`;
    const state = r.status === 'over' ? 'over' : r.status === 'ok' ? 'done' : pct >= 0.5 ? 'mid' : 'low';
    const keys = PYRAMID_KEYS[r.id] ?? [];
    const items = (weekly ? weekFood : todayFood)
      .map((f) => {
        const portions = keys.reduce((a, k) => a + (f.groups?.[k] ?? 0), 0);
        return { f, portions };
      })
      .filter((x) => x.portions > 0)
      .sort((a, b) => b.portions - a.portions);
    const untagged = (weekly ? weekFood : todayFood).filter((f) => !f.groups || !Object.keys(f.groups).length);
    return drillRow(
      `pyr-${r.id}`,
      `n-${state}`,
      [
        h('span', { class: 'nrow-label' }, r.label, h('small', {}, r.detail ? `${r.target} · ${r.detail}` : r.target)),
        h('span', { class: 'nrow-val' }, h('strong', {}, fmt(r.value, r.unit === 'g' ? 0 : 1)), ` ${r.unit}`),
        h('span', { class: 'nbar', 'aria-hidden': 'true' }, fill),
        h('span', { class: 'nrow-pct' }, r.status === 'ok' ? '✓' : r.status === 'over' ? '!' : ''),
      ],
      () =>
        contribList(
          items.map((x) => ({
            label: `${weekly && 'day' in x.f && x.f.day ? `${fmtDate(String(x.f.day), 'dm')} ` : ''}${x.f.time} ${x.f.name}`,
            value: r.unit === 'g' ? `${fmt(x.portions * 25)} g` : `${fmt(x.portions, 1)} ${x.portions === 1 ? 'Portion' : 'Portionen'}`,
          })),
          'Kein Eintrag zählt hierzu.',
          untagged.length
            ? `Ohne Zuordnung: ${untagged.length} ${untagged.length === 1 ? 'Eintrag' : 'Einträge'} (z. B. Schnellerfassung).`
            : '',
        ),
    );
  };
  const coverage = Math.round(p.coverage * 100);
  const novaKcal = (snap.day.food ?? []).filter((f) => f.nova === 4).reduce((a, f) => a + f.kcal, 0);
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'pyr-h', id: 'pyramid-card' },
    h('h2', { id: 'pyr-h' }, 'Lebensmittelpyramide'),
    h(
      'p',
      { class: 'small muted' },
      'Portionen nach der Schweizer Lebensmittelpyramide (SGE). Wichtiger als einzelne Vitamine ist die Mischung über die Woche.',
    ),
    h('h3', { class: 'eyebrow' }, 'Heute'),
    h('ul', { class: 'nlist' }, ...p.daily.map((r) => row(r, false))),
    h('h3', { class: 'eyebrow' }, 'Letzte 7 Tage'),
    h('ul', { class: 'nlist' }, ...p.weekly.map((r) => row(r, true))),
    novaKcal > 0
      ? h(
          'p',
          { class: 'small', id: 'pyr-nova' },
          `Stark verarbeitete Produkte (NOVA 4) heute: ${fmt(novaKcal)} kcal (${Math.round((novaKcal / Math.max(snap.kcal, 1)) * 100)} %). Weniger davon hilft beim Sattwerden.`,
        )
      : null,
    coverage < 90
      ? h(
          'p',
          { class: 'note info small', id: 'pyr-coverage' },
          `Gruppen bekannt für ${coverage} % der heutigen Kalorien. Schnellerfassungen und Packungen ohne Zuordnung fehlen; Foto, Beschreibung und Lebensmittelsuche ordnen automatisch zu.`,
        )
      : null,
  );
}

/** Einträge, bei denen «Später» gewählt wurde (nur für diese Sitzung). */
const skippedTag = new Set();

/**
 * Essrhythmus und Heisshunger: Verteilung über den Tag, Protein pro Mahlzeit,
 * Kurznotiz zu Hunger und Grund, Muster der letzten 28 Tage.
 * @param {Ctx} ctx
 * @param {NonNullable<Ctx['snap']>} snap
 */
export function rhythmCard(ctx, snap) {
  const food = snap.day.food ?? [];
  const ppm = proteinPerMeal(food, snap.profile.goalWeightKg);
  const slots = mealSlots(food);
  const maxKcal = Math.max(1, ...slots.map((s) => s.kcal));
  const total = slots.reduce((a, s) => a + s.kcal, 0);
  const evening = slots.filter((s) => s.id === 'znacht' || s.id === 'spaet').reduce((a, s) => a + s.kcal, 0);
  const patterns = cravingPatterns(
    ctx.state.days,
    ctx.date,
    snap.protein.grams,
    snap.profile.sex === 'f' && snap.profile.cycleStatus === 'natuerlich' && snap.cycleStarts.length
      ? (d) => isPremenstrual(d, snap.cycleStarts, snap.cycleLength)
      : undefined,
  );
  const okIds = new Set(ppm.slots.filter((s) => s.ok).map((s) => s.id));
  const mainIds = new Set(ppm.slots.map((s) => s.id));

  // Neuester Eintrag von heute ohne Notiz (ab 100 kcal)
  const open = [...food]
    .filter((f) => f.kcal >= 100 && !f.trigger && !f.hunger && !skippedTag.has(f.id))
    .sort((a, b) => (a.time < b.time ? 1 : -1))[0];
  /** @param {Partial<import('../store.js').FoodEntry>} patch */
  const tag = (patch) =>
    ctx.commit((st) => {
      const list = st.days[ctx.date].food ?? [];
      const i = list.findIndex((x) => x.id === open?.id);
      if (i >= 0) list[i] = { ...list[i], ...patch };
    }, 'Notiert');

  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'rhy-h', id: 'rhythm-card' },
    h('h2', { id: 'rhy-h' }, 'Essrhythmus und Heisshunger'),
    open
      ? h(
          'div',
          { class: 'quick-tag', id: 'quick-tag' },
          h('p', { class: 'small' }, h('strong', {}, `${open.time} ${open.name}`), ' – kurz notieren hilft, Muster zu erkennen:'),
          h(
            'div',
            { class: 'segmented wrap', role: 'group', 'aria-label': 'Wie hungrig warst du?' },
            h('span', { class: 'small muted' }, 'Hunger:'),
            ...HUNGER.map(([v, label]) => h('button', { type: 'button', id: `qt-h${v}`, on: { click: () => tag({ hunger: v }) } }, label)),
          ),
          h(
            'div',
            { class: 'segmented wrap', role: 'group', 'aria-label': 'Warum gegessen?' },
            h('span', { class: 'small muted' }, 'Grund:'),
            ...TRIGGERS.map(([id, label]) =>
              h('button', { type: 'button', id: `qt-${id}`, on: { click: () => tag({ trigger: id }) } }, label),
            ),
            h(
              'button',
              {
                type: 'button',
                id: 'qt-skip',
                on: {
                  click: () => {
                    skippedTag.add(open.id);
                    ctx.go('ernaehrung');
                  },
                },
              },
              'Später',
            ),
          ),
        )
      : null,
    h('h3', { class: 'eyebrow' }, 'Heute über den Tag'),
    h(
      'ul',
      { class: 'nlist' },
      ...slots
        .filter((s) => s.n > 0)
        .map((s) => {
          const fill = h('span', { class: 'nbar-fill' });
          fill.style.width = `${(s.kcal / maxKcal) * 100}%`;
          const main = mainIds.has(s.id);
          return h(
            'li',
            { class: `nrow ${main ? (okIds.has(s.id) ? 'n-done' : 'n-low') : 'n-mid'}`, id: `slot-${s.id}` },
            h('span', { class: 'nrow-label' }, s.label),
            h('span', { class: 'nrow-val' }, h('strong', {}, fmt(s.kcal)), ` kcal · ${fmt(s.protein)} g Protein`),
            h('span', { class: 'nbar', 'aria-hidden': 'true' }, fill),
            h('span', { class: 'nrow-pct' }, main ? (okIds.has(s.id) ? '✓' : `<${ppm.target}`) : ''),
          );
        }),
    ),
    total
      ? h(
          'p',
          { class: 'small' },
          `Ab 17:30 Uhr: ${Math.round((evening / total) * 100)} % der Kalorien. Ziel pro Hauptmahlzeit: mindestens ${ppm.target} g Protein. Viel Protein und Energie in der ersten Tageshälfte macht den Abend ruhiger.`,
        )
      : h('p', { class: 'small muted' }, 'Noch keine Einträge.'),
    h('h3', { class: 'eyebrow' }, 'Muster der letzten 4 Wochen'),
    !patterns.enough
      ? h(
          'p',
          { class: 'small muted', id: 'pattern-wait' },
          `Noch ${7 - patterns.days} vollständig erfasste Tage, dann zeigt die App, was deinen Heisshunger am Abend begünstigt.`,
        )
      : h(
          'div',
          { class: 'stack-sm', id: 'patterns' },
          h('p', { class: 'small' }, `${patterns.highDays} von ${patterns.days} Tagen mit mehr als der Hälfte der Kalorien am Abend.`),
          ...patterns.insights.map((i) => h('p', { class: 'note info small' }, i.text)),
          !patterns.insights.length
            ? h('p', { class: 'small muted' }, 'Kein klarer Zusammenhang mit Schlaf, Protein, Mittagessen oder Koffein erkennbar.')
            : null,
        ),
    patterns.triggers.length
      ? h(
          'div',
          { class: 'stack-sm', id: 'trigger-top' },
          h(
            'p',
            { class: 'small' },
            'Häufigster Grund abends: ',
            h('strong', {}, TRIGGERS.find((t) => t[0] === patterns.triggers[0].id)?.[1] ?? ''),
            ` (${patterns.triggers[0].n} von ${patterns.tagged} Notizen).`,
          ),
          h('p', { class: 'note ok small' }, TRIGGER_TIPS[patterns.triggers[0].id]),
        )
      : null,
    h('p', { class: 'hint' }, 'Zusammenhänge im eigenen Alltag, keine Beweise. Eine Ernährungsberatung kann sie mit dir vertiefen.'),
  );
}
