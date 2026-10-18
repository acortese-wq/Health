// @ts-check
// KI-Erfassung: Mahlzeit fotografieren, beschreiben oder Packung scannen (Nährwerttabelle /
// Barcode) → prüfen, Mengen anpassen → übernehmen.

import { h, badge, fmt, num, str, nowTime } from '../ui/dom.js';
import { uid } from '../store.js';
import { totals, macrosConsistent, isHighProtein, scaleItem, productPortion, isValidGtin } from '../domain/foodvision.js';
import { scaleMicros } from '../domain/micros.js';
import { activeProvider, analyzeMeal, detectBarcode, lookupBarcode, prepareImage, readLabel, PROVIDERS } from '../vision.js';

/** @typedef {import('../app.js').Ctx} Ctx */
/** @typedef {import('../domain/foodvision.js').MealEstimate} MealEstimate */
/** @typedef {import('../domain/foodvision.js').Product} Product */
/** @typedef {import('../domain/foodvision.js').Nutrients} Nutrients */

const FACTORS = [
  { v: 0.5, label: '½' },
  { v: 0.75, label: '¾' },
  { v: 1, label: '1' },
  { v: 1.25, label: '1¼' },
  { v: 1.5, label: '1½' },
];

const MODES = /** @type {const} */ ([
  ['foto', 'Foto'],
  ['text', 'Beschreiben'],
  ['packung', 'Packung'],
]);

/**
 * Zustand des laufenden Vorgangs (überlebt das Neuzeichnen der Ansicht).
 * @type {{
 *   mode: 'foto' | 'text' | 'packung',
 *   status: 'idle' | 'loading' | 'done' | 'error',
 *   previewUrl: string, base64: string, hint: string, description: string, error: string,
 *   result: MealEstimate | null, excluded: Set<number>, factor: number,
 *   product: Product | null, productGrams: number, barcode: string,
 *   controller: AbortController | null, date: string, loadingText: string,
 * }}
 */
const st = {
  mode: 'foto',
  status: 'idle',
  previewUrl: '',
  base64: '',
  hint: '',
  description: '',
  error: '',
  result: null,
  excluded: new Set(),
  factor: 1,
  product: null,
  productGrams: 100,
  barcode: '',
  controller: null,
  date: '',
  loadingText: '',
};

/** @param {boolean} [keepMode] */
function reset(keepMode = true) {
  st.controller?.abort();
  if (st.previewUrl) URL.revokeObjectURL(st.previewUrl);
  Object.assign(st, {
    mode: keepMode ? st.mode : 'foto',
    status: 'idle',
    previewUrl: '',
    base64: '',
    hint: '',
    description: '',
    error: '',
    result: null,
    excluded: new Set(),
    factor: 1,
    product: null,
    productGrams: 100,
    barcode: '',
    controller: null,
    date: '',
    loadingText: '',
  });
}

/** @param {Ctx} ctx */
const redraw = (ctx) => ctx.go('ernaehrung');

/**
 * Lauf mit Ladeanzeige, Abbruch und Fehlertext.
 * @param {Ctx} ctx
 * @param {string} loadingText
 * @param {(signal: AbortSignal) => Promise<void>} job
 */
async function run(ctx, loadingText, job) {
  st.controller?.abort();
  const controller = new AbortController();
  Object.assign(st, { status: 'loading', error: '', loadingText, controller, date: ctx.date });
  redraw(ctx);
  try {
    await job(controller.signal);
    if (controller.signal.aborted) return;
    Object.assign(st, { status: 'done', controller: null });
  } catch (err) {
    if (controller.signal.aborted) return;
    Object.assign(st, { status: 'error', error: err instanceof Error ? err.message : String(err), controller: null });
  }
  redraw(ctx);
}

/**
 * @param {Ctx} ctx
 * @param {NonNullable<Ctx['snap']>} snap
 */
function estimate(ctx, snap) {
  return run(ctx, st.mode === 'text' ? 'Schätze die Mahlzeit …' : 'Analysiere Foto …', async (signal) => {
    const result = await analyzeMeal({
      imageBase64: st.mode === 'foto' ? st.base64 : undefined,
      description: st.mode === 'text' ? st.description : undefined,
      hint: st.hint,
      kcalLeft: snap.kcalTarget - snap.kcal,
      proteinLeft: snap.protein.grams - snap.proteinG,
      signal,
    });
    Object.assign(st, { result, excluded: new Set(), factor: 1 });
  });
}

/**
 * Packungsfoto: zuerst Barcode im Browser, sonst KI liest Tabelle und Barcode; mit Barcode
 * zusätzlich Open Food Facts befragen.
 * @param {Ctx} ctx
 * @param {Blob} blob
 */
function scanPackage(ctx, blob) {
  return run(ctx, 'Lese Packung …', async (signal) => {
    // 1. Barcode direkt im Browser (schnell, kostenlos) → Open Food Facts.
    let barcode = await detectBarcode(blob);
    /** @type {Product | null} */
    let product = barcode ? await lookupBarcode(barcode, signal).catch(() => null) : null;
    // 2. Sonst liest die KI Nährwerttabelle und Barcode-Ziffern vom Foto.
    if (!product && activeProvider()) {
      const label = await readLabel({ imageBase64: st.base64, signal });
      if (label.readable) product = label.product;
      if (!barcode && label.product.barcode) {
        barcode = label.product.barcode;
        const off = await lookupBarcode(barcode, signal).catch(() => null);
        // Die abgelesene Tabelle hat Vorrang; Open Food Facts ergänzt nur Name und Marke.
        if (off && !product) product = off;
        else if (off && product)
          product = { ...product, name: product.name === 'Produkt' ? off.name : product.name, brand: product.brand || off.brand };
      }
    }
    if (!product) {
      if (!activeProvider() && !barcode)
        throw new Error(
          'Kein Barcode erkannt. Gib die Ziffern ein oder hinterlege einen KI-Schlüssel, damit die Nährwerttabelle gelesen werden kann.',
        );
      throw new Error(
        barcode
          ? `Produkt ${barcode} nicht gefunden. Fotografiere die Nährwerttabelle.`
          : 'Weder Nährwerttabelle noch Barcode lesbar. Bitte näher und scharf fotografieren.',
      );
    }
    Object.assign(st, { product: { ...product, barcode: barcode || product.barcode }, productGrams: product.servingG || 100, barcode });
  });
}

/**
 * @param {Ctx} ctx
 * @param {string} code
 */
function lookupTyped(ctx, code) {
  return run(ctx, 'Suche Produkt …', async (signal) => {
    const p = await lookupBarcode(code, signal);
    if (!p) throw new Error(`Produkt ${code} ist in Open Food Facts nicht erfasst. Fotografiere die Nährwerttabelle.`);
    Object.assign(st, { product: p, productGrams: p.servingG || 100, barcode: code });
  });
}

/**
 * Eintrag speichern.
 * @param {Ctx} ctx
 * @param {{ name: string, values: Nutrients, grams?: number, source: import('../store.js').FoodSource, asPreset: boolean }} e
 */
function save(ctx, e) {
  const date = ctx.date;
  const v = e.values;
  const nutrients = { carbs: v.carbs, fat: v.fat, sugar: v.sugar, satFat: v.satFat, fiber: v.fiber, salt: v.salt };
  const micros = v.micros && Object.keys(v.micros).length ? { micros: v.micros, microSrc: v.microSrc ?? 'ki' } : {};
  reset();
  ctx.commit((s) => {
    const d = (s.days[date] = s.days[date] ?? {});
    d.food = [
      ...(d.food ?? []),
      {
        id: uid(),
        name: e.name,
        kcal: Math.round(v.kcal),
        protein: Math.round(v.protein),
        time: nowTime(),
        ...nutrients,
        ...micros,
        ...(e.grams ? { grams: e.grams } : {}),
        source: e.source,
      },
    ];
    if (e.asPreset)
      s.presets.food = [
        ...s.presets.food,
        { id: uid(), name: e.name, kcal: Math.round(v.kcal), protein: Math.round(v.protein), ...nutrients },
      ];
  }, `${e.name} erfasst`);
}

/**
 * @param {Ctx} ctx
 * @param {NonNullable<Ctx['snap']>} snap
 */
export function photoBlock(ctx, snap) {
  // Ein Ergebnis gehört zum Tag, an dem es erstellt wurde.
  if (st.status !== 'idle' && st.date && st.date !== ctx.date) reset();

  const fileInput = h('input', {
    type: 'file',
    id: 'photo-input',
    accept: 'image/*',
    capture: 'environment',
    class: 'sr-only',
    on: {
      change: async (e) => {
        const el = /** @type {HTMLInputElement} */ (e.target);
        const file = el.files?.[0];
        el.value = '';
        if (!file) return;
        try {
          const img = await prepareImage(file);
          if (st.previewUrl) URL.revokeObjectURL(st.previewUrl);
          Object.assign(st, { previewUrl: img.previewUrl, base64: img.base64, result: null, product: null });
          if (st.mode === 'packung') await scanPackage(ctx, img.blob);
          else if (!activeProvider()) {
            Object.assign(st, { status: 'error', error: 'noKey' });
            redraw(ctx);
          } else await estimate(ctx, snap);
        } catch (err) {
          Object.assign(st, { status: 'error', error: err instanceof Error ? err.message : String(err) });
          redraw(ctx);
        }
      },
    },
  });

  const modeTabs = h(
    'div',
    { class: 'segmented', role: 'group', 'aria-label': 'Art der Erfassung' },
    ...MODES.map(([id, label]) =>
      h(
        'button',
        {
          type: 'button',
          id: `capture-${id}`,
          'aria-pressed': String(st.mode === id),
          on: {
            click: () => {
              reset();
              st.mode = id;
              redraw(ctx);
            },
          },
        },
        label,
      ),
    ),
  );

  return h(
    'div',
    { class: `photo ${st.status === 'idle' ? '' : 'photo-active'}`, 'aria-live': 'polite' },
    h('div', { class: 'capture-head' }, h('span', { class: 'eyebrow' }, 'Erfassen mit KI'), modeTabs),
    fileInput,
    st.status === 'idle' ? idleBody(ctx, snap) : null,
    st.status === 'loading' ? loadingBody() : null,
    st.status === 'error' ? errorBody(ctx) : null,
    st.status === 'done' && st.result ? mealBody(ctx, snap, st.result) : null,
    st.status === 'done' && st.product ? productBody(ctx, st.product) : null,
    st.status !== 'idle' ? actions(ctx) : null,
  );
}

/**
 * @param {Ctx} ctx
 * @param {NonNullable<Ctx['snap']>} snap
 */
function idleBody(ctx, snap) {
  if (st.mode === 'text') {
    return h(
      'form',
      {
        class: 'stack-sm',
        on: {
          submit: (e) => {
            e.preventDefault();
            st.description = str(new FormData(/** @type {HTMLFormElement} */ (e.target)), 'meal-text');
            if (st.description.length < 3) return ctx.toast('Bitte beschreiben, was du gegessen hast.', 'error');
            if (!activeProvider()) return (Object.assign(st, { status: 'error', error: 'noKey' }), redraw(ctx));
            estimate(ctx, snap);
          },
        },
      },
      h('label', { for: 'meal-text', class: 'sr-only' }, 'Mahlzeit beschreiben'),
      h('textarea', {
        id: 'meal-text',
        name: 'meal-text',
        rows: '2',
        placeholder: 'z. B. 2 Scheiben Ruchbrot mit Butter und Konfitüre, 1 Café crème',
      }),
      h('button', { type: 'submit', class: 'btn photo-btn', id: 'meal-text-go' }, 'Schätzen'),
      h('p', { class: 'hint' }, 'Tipp: Mit dem Mikrofon der iPhone-Tastatur kannst du einfach diktieren.'),
    );
  }
  if (st.mode === 'packung') {
    return h(
      'div',
      { class: 'stack-sm' },
      trigger('Packung fotografieren'),
      h(
        'p',
        { class: 'hint' },
        'Nährwerttabelle oder Barcode fotografieren. Bei Fertigprodukten ist das deutlich genauer als ein Foto vom Teller.',
      ),
      h(
        'form',
        {
          class: 'inline-form',
          on: {
            submit: (e) => {
              e.preventDefault();
              const code = str(new FormData(/** @type {HTMLFormElement} */ (e.target)), 'barcode').replace(/\D/g, '');
              if (!isValidGtin(code)) return ctx.toast('Ungültiger Barcode. Bitte alle 8 oder 13 Ziffern eingeben.', 'error');
              lookupTyped(ctx, code);
            },
          },
        },
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'barcode' }, 'oder Barcode-Ziffern'),
          h('input', { id: 'barcode', name: 'barcode', inputmode: 'numeric', placeholder: '7610…' }),
        ),
        h('button', { type: 'submit', class: 'btn', id: 'barcode-go' }, 'Suchen'),
      ),
    );
  }
  return h(
    'div',
    { class: 'stack-sm' },
    trigger('Mahlzeit fotografieren'),
    h('p', { class: 'hint' }, 'Die KI erkennt das Gericht und schätzt Kalorien und Nährwerte. Du prüfst alles, bevor es gespeichert wird.'),
  );
}

/** @param {string} label */
function trigger(label) {
  const t = h(
    'label',
    { for: 'photo-input', class: 'btn photo-btn', id: 'photo-trigger', role: 'button', tabindex: '0' },
    cameraIcon(),
    label,
  );
  t.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      document.getElementById('photo-input')?.click();
    }
  });
  return t;
}

function loadingBody() {
  return h(
    'div',
    { class: 'photo-head' },
    st.previewUrl ? h('img', { src: st.previewUrl, alt: 'Foto', class: 'photo-thumb' }) : null,
    h('div', { class: 'photo-meta' }, h('strong', {}, st.loadingText), h('span', { class: 'hint' }, 'Das dauert meist 10–30 Sekunden.')),
  );
}

/** @param {Ctx} ctx */
function errorBody(ctx) {
  if (st.error === 'noKey') {
    return h(
      'div',
      { class: 'photo-meta' },
      h('strong', {}, 'KI-Schlüssel fehlt'),
      h(
        'span',
        { class: 'small', id: 'photo-error' },
        'Für Foto und Beschreibung braucht es einen API-Schlüssel von Anthropic (Claude) oder OpenAI (GPT). Barcodes funktionieren auch ohne.',
      ),
      h('a', { href: '#profil', class: 'btn primary' }, 'Schlüssel hinterlegen'),
    );
  }
  void ctx;
  return h(
    'div',
    { class: 'photo-head' },
    st.previewUrl ? h('img', { src: st.previewUrl, alt: 'Foto', class: 'photo-thumb' }) : null,
    h(
      'div',
      { class: 'photo-meta' },
      h('strong', {}, 'Keine Schätzung möglich'),
      h('span', { class: 'small', id: 'photo-error' }, st.error),
    ),
  );
}

/**
 * Mahlzeit: Bestandteile mit Grammangaben, Portion, Nährwerte, Übernehmen.
 * @param {Ctx} ctx
 * @param {NonNullable<Ctx['snap']>} snap
 * @param {MealEstimate} r
 */
function mealBody(ctx, snap, r) {
  const head = h(
    'div',
    { class: 'photo-head' },
    st.previewUrl ? h('img', { src: st.previewUrl, alt: 'Foto der Mahlzeit', class: 'photo-thumb' }) : null,
    h(
      'div',
      { class: 'photo-meta' },
      r.isFood
        ? [
            h('strong', { class: 'photo-dish', id: 'photo-dish' }, r.dish),
            r.confidence === 'hoch'
              ? badge('ok', 'Sicherheit hoch')
              : r.confidence === 'mittel'
                ? badge('info', 'Sicherheit mittel')
                : badge('warn', 'Sicherheit niedrig'),
          ]
        : [
            h('strong', {}, 'Kein Essen erkannt'),
            h('span', { class: 'small' }, 'Bitte die Mahlzeit von schräg oben und gut beleuchtet fotografieren oder beschreiben.'),
          ],
    ),
  );
  if (!r.isFood || !r.items.length) return head;

  const chosen = r.items.filter((_, i) => !st.excluded.has(i));
  const t = totals(chosen, st.factor);
  const source = st.mode === 'text' ? 'text' : 'foto';

  return h(
    'div',
    { class: 'stack-sm' },
    head,
    h(
      'ul',
      { class: 'photo-items' },
      ...r.items.map((it, i) =>
        h(
          'li',
          {},
          h(
            'label',
            { class: 'check' },
            h('input', {
              type: 'checkbox',
              id: `photo-item-${i}`,
              checked: !st.excluded.has(i),
              on: {
                change: (e) => {
                  if (/** @type {HTMLInputElement} */ (e.target).checked) st.excluded.delete(i);
                  else st.excluded.add(i);
                  redraw(ctx);
                },
              },
            }),
            h('span', {}, it.name, it.portion ? h('small', {}, it.portion) : null),
          ),
          h(
            'div',
            { class: 'item-grams' },
            h('label', { for: `photo-grams-${i}`, class: 'sr-only' }, `Gramm ${it.name}`),
            h('input', {
              id: `photo-grams-${i}`,
              inputmode: 'numeric',
              value: String(it.grams),
              disabled: !it.baseGrams,
              on: {
                change: (e) => {
                  const v = Number(/** @type {HTMLInputElement} */ (e.target).value.replace(',', '.'));
                  if (!Number.isFinite(v) || v < 0) return;
                  r.items[i] = scaleItem(it, v);
                  redraw(ctx);
                },
              },
            }),
            h('span', { class: 'suffix-inline' }, 'g'),
          ),
          h(
            'span',
            { class: 'entry-num' },
            `${fmt(it.kcal)} kcal`,
            h('small', { class: 'muted' }, ` (${fmt(it.kcalLow)}–${fmt(it.kcalHigh)})`),
            ` · ${fmt(it.protein)} g P`,
          ),
        ),
      ),
    ),
    h(
      'div',
      { class: 'portion' },
      h('span', { class: 'small muted', id: 'portion-label' }, 'Gegessen'),
      h(
        'div',
        { class: 'segmented', role: 'group', 'aria-labelledby': 'portion-label' },
        ...FACTORS.map((f) =>
          h(
            'button',
            {
              type: 'button',
              id: `portion-${String(f.v).replace('.', '_')}`,
              'aria-pressed': String(st.factor === f.v),
              'aria-label': `${f.label} Portion`,
              on: {
                click: () => {
                  st.factor = f.v;
                  redraw(ctx);
                },
              },
            },
            f.label,
          ),
        ),
      ),
    ),
    totalsView(t, `Spanne ${fmt(t.kcalLow)}–${fmt(t.kcalHigh)}`),
    !macrosConsistent(t)
      ? h('p', { class: 'note warn small' }, 'Kalorien und Nährstoffe passen nicht ganz zusammen. Werte bitte prüfen.')
      : null,
    r.assumptions.length
      ? h(
          'div',
          { class: 'small' },
          h('p', { class: 'eyebrow' }, 'Annahmen'),
          h('ul', { class: 'assumptions' }, ...r.assumptions.map((a) => h('li', {}, a))),
        )
      : null,
    r.tip ? h('p', { class: 'note info small' }, r.tip) : null,
    saveForm(ctx, r.dish, t, source),
    h(
      'p',
      { class: 'hint' },
      'Schätzungen liegen oft 20–40 % daneben, vor allem wegen Öl, Butter und Saucen. Im Zweifel den oberen Wert nehmen.',
    ),
    st.mode === 'foto' ? hintForm(ctx, snap) : null,
  );
}

/**
 * Packung: Nährwerte pro 100 g, gegessene Menge, Übernehmen.
 * @param {Ctx} ctx
 * @param {Product} p
 */
function productBody(ctx, p) {
  const v = productPortion(p, st.productGrams);
  const quick = [
    p.servingG ? { g: p.servingG, label: `1 Portion (${fmt(p.servingG)} ${p.unit})` } : null,
    { g: 100, label: `100 ${p.unit}` },
  ].filter(Boolean);
  return h(
    'div',
    { class: 'stack-sm' },
    h(
      'div',
      { class: 'photo-head' },
      st.previewUrl ? h('img', { src: st.previewUrl, alt: 'Foto der Packung', class: 'photo-thumb' }) : null,
      h(
        'div',
        { class: 'photo-meta' },
        h('strong', { class: 'photo-dish', id: 'photo-dish' }, p.name),
        p.brand ? h('span', { class: 'small muted' }, p.brand) : null,
        badge(p.source === 'etikett' ? 'ok' : 'info', p.source === 'etikett' ? 'Von der Nährwerttabelle' : 'Open Food Facts'),
        st.barcode ? h('span', { class: 'small muted' }, `Barcode ${st.barcode}`) : null,
      ),
    ),
    h(
      'p',
      { class: 'small muted' },
      `Pro 100 ${p.unit}: ${fmt(p.per100.kcal)} kcal · ${fmt(p.per100.protein, 1)} g Protein · ${fmt(p.per100.carbs, 1)} g KH (Zucker ${fmt(p.per100.sugar, 1)} g) · ${fmt(p.per100.fat, 1)} g Fett · ${fmt(p.per100.fiber, 1)} g Ballaststoffe · ${fmt(p.per100.salt, 2)} g Salz`,
    ),
    h(
      'div',
      { class: 'inline-form' },
      h(
        'div',
        { class: 'field' },
        h('label', { for: 'product-grams' }, 'Gegessene Menge'),
        h(
          'div',
          { class: 'with-suffix' },
          h('input', {
            id: 'product-grams',
            inputmode: 'numeric',
            value: String(st.productGrams),
            on: {
              change: (e) => {
                const g = Number(/** @type {HTMLInputElement} */ (e.target).value.replace(',', '.'));
                if (Number.isFinite(g) && g >= 0 && g <= 5000) st.productGrams = Math.round(g);
                redraw(ctx);
              },
            },
          }),
          h('span', { class: 'suffix' }, p.unit),
        ),
      ),
      ...quick.map((q) =>
        h(
          'button',
          {
            type: 'button',
            class: 'btn',
            on: {
              click: () => {
                st.productGrams = /** @type {{ g: number }} */ (q).g;
                redraw(ctx);
              },
            },
          },
          /** @type {{ label: string }} */ (q).label,
        ),
      ),
    ),
    totalsView(v, ''),
    saveForm(ctx, p.brand && !p.name.includes(p.brand) ? `${p.name} (${p.brand})` : p.name, v, p.source, st.productGrams),
    p.source === 'barcode'
      ? h('p', { class: 'hint' }, 'Daten aus Open Food Facts (Community-Datenbank). Bei Abweichungen gilt die Packung.')
      : null,
  );
}

/**
 * @param {Nutrients} t
 * @param {string} extra
 */
function totalsView(t, extra) {
  return h(
    'div',
    { class: 'stack-sm' },
    h(
      'p',
      { class: 'photo-total' },
      h('strong', { id: 'photo-total-kcal' }, `${fmt(t.kcal)} kcal`),
      extra ? h('span', { class: 'muted' }, ` ${extra}`) : null,
      isHighProtein(t) ? [' ', badge('ok', 'proteinreich')] : null,
    ),
    h(
      'dl',
      { class: 'nutri' },
      ...[
        ['Protein', t.protein, 'g'],
        ['Kohlenhydrate', t.carbs, 'g'],
        ['davon Zucker', t.sugar, 'g'],
        ['Fett', t.fat, 'g'],
        ['davon gesättigt', t.satFat, 'g'],
        ['Ballaststoffe', t.fiber, 'g'],
        ['Salz', t.salt, 'g'],
      ].map(([label, value, unit]) =>
        h('div', {}, h('dt', {}, String(label)), h('dd', {}, `${fmt(Number(value), Number(value) < 10 ? 1 : 0)} ${unit}`)),
      ),
    ),
  );
}

/**
 * @param {Ctx} ctx
 * @param {string} name
 * @param {Nutrients} t
 * @param {import('../store.js').FoodSource} source
 * @param {number} [grams]
 */
function saveForm(ctx, name, t, source, grams) {
  return h(
    'form',
    {
      class: 'stack-sm',
      on: {
        submit: (e) => {
          e.preventDefault();
          const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
          const kcal = num(fd, 'photo-kcal');
          const protein = num(fd, 'photo-protein') ?? 0;
          if (kcal === null || kcal < 0 || kcal > 5000) return ctx.toast('Bitte Kalorien zwischen 0 und 5000 eingeben.', 'error');
          // Wer kcal von Hand korrigiert, korrigiert die übrigen Nährwerte proportional mit.
          const f = t.kcal > 0 ? kcal / t.kcal : 1;
          /** @param {number} v */
          const sc = (v) => Math.round(v * f * 10) / 10;
          save(ctx, {
            name: str(fd, 'photo-name') || name,
            values: {
              kcal,
              protein,
              carbs: sc(t.carbs),
              fat: sc(t.fat),
              sugar: sc(t.sugar),
              satFat: sc(t.satFat),
              fiber: sc(t.fiber),
              salt: sc(t.salt),
              ...(t.micros ? { micros: scaleMicros(t.micros, f), microSrc: t.microSrc } : {}),
            },
            grams,
            source,
            asPreset: fd.get('photo-preset') === 'on',
          });
        },
      },
    },
    h(
      'div',
      { class: 'mini-form' },
      h(
        'div',
        { class: 'field' },
        h('label', { for: 'photo-name' }, 'Eintrag'),
        h('input', { id: 'photo-name', name: 'photo-name', value: name }),
      ),
      h(
        'div',
        { class: 'field' },
        h('label', { for: 'photo-kcal' }, 'kcal'),
        h('input', { id: 'photo-kcal', name: 'photo-kcal', inputmode: 'numeric', value: String(Math.round(t.kcal)) }),
      ),
      h(
        'div',
        { class: 'field' },
        h('label', { for: 'photo-protein' }, 'Protein g'),
        h('input', { id: 'photo-protein', name: 'photo-protein', inputmode: 'numeric', value: String(Math.round(t.protein)) }),
      ),
    ),
    h(
      'label',
      { class: 'check' },
      h('input', { type: 'checkbox', id: 'photo-preset', name: 'photo-preset' }),
      h('span', {}, 'Zusätzlich als Schnellknopf speichern'),
    ),
    h('button', { type: 'submit', class: 'btn primary', id: 'photo-save' }, 'Übernehmen'),
  );
}

/**
 * Zusatzangabe und erneute Schätzung (nur Foto).
 * @param {Ctx} ctx
 * @param {NonNullable<Ctx['snap']>} snap
 */
function hintForm(ctx, snap) {
  return h(
    'form',
    {
      class: 'inline-form',
      on: {
        submit: (e) => {
          e.preventDefault();
          st.hint = str(new FormData(/** @type {HTMLFormElement} */ (e.target)), 'photo-hint');
          estimate(ctx, snap);
        },
      },
    },
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'photo-hint' }, 'Ergänzung (optional)'),
      h('input', { id: 'photo-hint', name: 'photo-hint', value: st.hint, placeholder: 'z. B. mit Rahmsauce, halbe Portion gegessen' }),
    ),
    h('button', { type: 'submit', class: 'btn', id: 'photo-retry' }, 'Neu schätzen'),
  );
}

/** @param {Ctx} ctx */
function actions(ctx) {
  const ai = activeProvider();
  return h(
    'div',
    { class: 'btn-row' },
    st.status !== 'loading' && st.mode !== 'text' ? trigger('Neues Foto') : null,
    h(
      'button',
      {
        type: 'button',
        class: 'btn',
        id: 'photo-cancel',
        on: {
          click: () => {
            reset();
            redraw(ctx);
          },
        },
      },
      st.status === 'loading' ? 'Abbrechen' : 'Verwerfen',
    ),
    ai && st.status === 'done' && st.mode !== 'packung'
      ? h('span', { class: 'hint provider-note' }, `geschätzt mit ${PROVIDERS[ai.provider].label}`)
      : null,
  );
}

function cameraIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'btn-icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 100-8 4 4 0 000 8z');
  svg.append(path);
  return svg;
}
