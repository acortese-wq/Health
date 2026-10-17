// @ts-check
// Mahlzeit fotografieren → Gericht, Bestandteile und Kalorien schätzen lassen → prüfen → übernehmen.

import { h, badge, fmt, num, str, nowTime } from '../ui/dom.js';
import { uid } from '../store.js';
import { totals, macrosConsistent } from '../domain/foodvision.js';
import { analyzeMeal, getApiKey, prepareImage } from '../vision.js';

/** @typedef {import('../app.js').Ctx} Ctx */
/** @typedef {import('../domain/foodvision.js').MealEstimate} MealEstimate */

const FACTORS = [
  { v: 0.5, label: '½' },
  { v: 0.75, label: '¾' },
  { v: 1, label: '1' },
  { v: 1.25, label: '1¼' },
  { v: 1.5, label: '1½' },
];

/**
 * Zustand des laufenden Fotovorgangs (überlebt das Neuzeichnen der Ansicht).
 * @type {{
 *   status: 'idle' | 'loading' | 'done' | 'error',
 *   previewUrl: string, base64: string, hint: string, error: string,
 *   result: MealEstimate | null, excluded: Set<number>, factor: number,
 *   controller: AbortController | null, date: string,
 * }}
 */
const photo = {
  status: 'idle',
  previewUrl: '',
  base64: '',
  hint: '',
  error: '',
  result: null,
  excluded: new Set(),
  factor: 1,
  controller: null,
  date: '',
};

function reset() {
  photo.controller?.abort();
  if (photo.previewUrl) URL.revokeObjectURL(photo.previewUrl);
  Object.assign(photo, {
    status: 'idle',
    previewUrl: '',
    base64: '',
    hint: '',
    error: '',
    result: null,
    excluded: new Set(),
    factor: 1,
    controller: null,
    date: '',
  });
}

/**
 * @param {Ctx} ctx
 * @param {NonNullable<Ctx['snap']>} snap
 */
async function run(ctx, snap) {
  const apiKey = getApiKey();
  if (!apiKey) {
    photo.status = 'error';
    photo.error = 'Für die Foto-Erkennung braucht es einen API-Schlüssel. Hinterlege ihn unter Profil → Foto-Erkennung.';
    ctx.go('heute');
    return;
  }
  photo.controller?.abort();
  const controller = new AbortController();
  Object.assign(photo, { status: 'loading', error: '', result: null, excluded: new Set(), factor: 1, controller });
  ctx.go('heute');
  try {
    const result = await analyzeMeal({
      apiKey,
      base64: photo.base64,
      hint: photo.hint,
      kcalLeft: snap.kcalTarget - snap.kcal,
      proteinLeft: snap.protein.grams - snap.proteinG,
      signal: controller.signal,
    });
    if (controller.signal.aborted) return;
    Object.assign(photo, { status: 'done', result, controller: null });
  } catch (err) {
    if (controller.signal.aborted) return;
    Object.assign(photo, { status: 'error', error: err instanceof Error ? err.message : String(err), controller: null });
  }
  ctx.go('heute');
}

/**
 * @param {Ctx} ctx
 * @param {NonNullable<Ctx['snap']>} snap
 */
export function photoBlock(ctx, snap) {
  // Ein Ergebnis gehört zum Tag, an dem es aufgenommen wurde.
  if (photo.status !== 'idle' && photo.date && photo.date !== ctx.date) reset();

  const input = h('input', {
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
          if (photo.previewUrl) URL.revokeObjectURL(photo.previewUrl);
          Object.assign(photo, { previewUrl: img.previewUrl, base64: img.base64, date: ctx.date });
          await run(ctx, snap);
        } catch (err) {
          Object.assign(photo, { status: 'error', error: err instanceof Error ? err.message : String(err) });
          ctx.go('heute');
        }
      },
    },
  });
  const trigger = h(
    'label',
    { for: 'photo-input', class: 'btn photo-btn', id: 'photo-trigger', role: 'button', tabindex: '0' },
    cameraIcon(),
    photo.status === 'idle' ? 'Mahlzeit fotografieren' : 'Neues Foto',
  );
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });

  if (photo.status === 'idle') {
    return h(
      'div',
      { class: 'photo' },
      input,
      trigger,
      h('p', { class: 'hint' }, 'Claude erkennt das Gericht und schätzt Kalorien und Protein. Du prüfst und bestätigst vor dem Speichern.'),
    );
  }

  return h(
    'div',
    { class: 'photo photo-active', 'aria-live': 'polite' },
    h(
      'div',
      { class: 'photo-head' },
      photo.previewUrl ? h('img', { src: photo.previewUrl, alt: 'Foto der Mahlzeit', class: 'photo-thumb' }) : null,
      h(
        'div',
        { class: 'photo-meta' },
        photo.status === 'loading'
          ? [h('strong', {}, 'Analysiere Foto …'), h('span', { class: 'hint' }, 'Das dauert meist 10–30 Sekunden.')]
          : photo.status === 'error'
            ? [h('strong', {}, 'Keine Schätzung möglich'), h('span', { class: 'small', id: 'photo-error' }, photo.error)]
            : resultHead(/** @type {MealEstimate} */ (photo.result)),
      ),
    ),
    photo.status === 'done' && photo.result ? resultBody(ctx, photo.result) : null,
    photo.status !== 'loading' && photo.base64 ? hintForm(ctx, snap) : null,
    h(
      'div',
      { class: 'btn-row' },
      input,
      photo.status === 'loading' ? null : trigger,
      h(
        'button',
        {
          type: 'button',
          class: 'btn',
          id: 'photo-cancel',
          on: {
            click: () => {
              reset();
              ctx.go('heute');
            },
          },
        },
        photo.status === 'loading' ? 'Abbrechen' : 'Verwerfen',
      ),
      photo.status === 'error' && !getApiKey() ? h('a', { href: '#profil', class: 'btn primary' }, 'Schlüssel hinterlegen') : null,
    ),
  );
}

/** @param {MealEstimate} r */
function resultHead(r) {
  if (!r.isFood)
    return [
      h('strong', {}, 'Kein Essen erkannt'),
      h('span', { class: 'small' }, 'Bitte die Mahlzeit von schräg oben und gut beleuchtet fotografieren.'),
    ];
  const conf =
    r.confidence === 'hoch'
      ? badge('ok', 'Sicherheit hoch')
      : r.confidence === 'mittel'
        ? badge('info', 'Sicherheit mittel')
        : badge('warn', 'Sicherheit niedrig');
  return [h('strong', { class: 'photo-dish', id: 'photo-dish' }, r.dish), conf];
}

/**
 * @param {Ctx} ctx
 * @param {MealEstimate} r
 */
function resultBody(ctx, r) {
  if (!r.isFood || !r.items.length) return null;
  const chosen = r.items.filter((_, i) => !photo.excluded.has(i));
  const t = totals(chosen, photo.factor);

  const save = (/** @type {SubmitEvent} */ e) => {
    e.preventDefault();
    const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
    const kcal = num(fd, 'photo-kcal');
    const protein = num(fd, 'photo-protein') ?? 0;
    const name = str(fd, 'photo-name') || r.dish;
    if (kcal === null || kcal < 0 || kcal > 5000) return ctx.toast('Bitte Kalorien zwischen 0 und 5000 eingeben.', 'error');
    const asPreset = fd.get('photo-preset') === 'on';
    const date = ctx.date;
    reset();
    ctx.commit((s) => {
      const d = (s.days[date] = s.days[date] ?? {});
      d.food = [...(d.food ?? []), { id: uid(), name, kcal: Math.round(kcal), protein: Math.round(protein), time: nowTime() }];
      if (asPreset) s.presets.food = [...s.presets.food, { id: uid(), name, kcal: Math.round(kcal), protein: Math.round(protein) }];
    }, `${name} erfasst`);
  };

  return h(
    'div',
    { class: 'stack-sm' },
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
              checked: !photo.excluded.has(i),
              on: {
                change: (e) => {
                  if (/** @type {HTMLInputElement} */ (e.target).checked) photo.excluded.delete(i);
                  else photo.excluded.add(i);
                  ctx.go('heute');
                },
              },
            }),
            h('span', {}, it.name, h('small', {}, [it.portion, it.grams ? `ca. ${fmt(it.grams)} g` : ''].filter(Boolean).join(' · '))),
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
              'aria-pressed': String(photo.factor === f.v),
              'aria-label': `${f.label} Portion`,
              on: {
                click: () => {
                  photo.factor = f.v;
                  ctx.go('heute');
                },
              },
            },
            f.label,
          ),
        ),
      ),
    ),
    h(
      'p',
      { class: 'photo-total' },
      h('strong', { id: 'photo-total-kcal' }, `${fmt(t.kcal)} kcal`),
      h('span', { class: 'muted' }, ` Spanne ${fmt(t.kcalLow)}–${fmt(t.kcalHigh)}`),
      h('span', {}, ` · ${fmt(t.protein)} g Protein · ${fmt(t.carbs)} g KH · ${fmt(t.fat)} g Fett`),
    ),
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
    h(
      'form',
      { class: 'stack-sm', on: { submit: /** @type {EventListener} */ (save) } },
      h(
        'div',
        { class: 'mini-form' },
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'photo-name' }, 'Eintrag'),
          h('input', { id: 'photo-name', name: 'photo-name', value: r.dish }),
        ),
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'photo-kcal' }, 'kcal'),
          h('input', { id: 'photo-kcal', name: 'photo-kcal', inputmode: 'numeric', value: String(t.kcal) }),
        ),
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'photo-protein' }, 'Protein g'),
          h('input', { id: 'photo-protein', name: 'photo-protein', inputmode: 'numeric', value: String(t.protein) }),
        ),
      ),
      h(
        'label',
        { class: 'check' },
        h('input', { type: 'checkbox', id: 'photo-preset', name: 'photo-preset' }),
        h('span', {}, 'Zusätzlich als Schnellknopf speichern'),
      ),
      h('button', { type: 'submit', class: 'btn primary', id: 'photo-save' }, 'Übernehmen'),
    ),
    h(
      'p',
      { class: 'hint' },
      'Schätzungen von Fotos liegen oft 20–40 % daneben, vor allem wegen Öl, Butter und Saucen. Im Zweifel den oberen Wert nehmen.',
    ),
  );
}

/**
 * Zusatzangabe und erneute Analyse.
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
          photo.hint = str(new FormData(/** @type {HTMLFormElement} */ (e.target)), 'photo-hint');
          run(ctx, snap);
        },
      },
    },
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'photo-hint' }, 'Ergänzung (optional)'),
      h('input', { id: 'photo-hint', name: 'photo-hint', value: photo.hint, placeholder: 'z. B. mit Rahmsauce, halbe Portion gegessen' }),
    ),
    h('button', { type: 'submit', class: 'btn', id: 'photo-retry' }, 'Neu schätzen'),
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
