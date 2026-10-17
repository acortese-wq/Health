// @ts-check
import { h, field, meter, badge, fmt, fmtSigned, num, str, nowTime } from '../ui/dom.js';
import { uid } from '../store.js';
import { RUN_TYPES } from '../domain/training.js';

/** @typedef {import('../app.js').Ctx} Ctx */

/** @param {Ctx} ctx */
export function viewToday(ctx) {
  const snap = /** @type {NonNullable<Ctx['snap']>} */ (ctx.snap);
  return h(
    'div',
    { class: 'stack' },
    summary(ctx, snap),
    hints(snap),
    h('div', { class: 'grid-2' }, weightCard(ctx, snap), nutritionCard(ctx, snap), caffeineCard(ctx, snap), recoveryCard(ctx, snap)),
  );
}

/**
 * @param {Ctx} ctx
 * @param {NonNullable<Ctx['snap']>} snap
 */
function summary(ctx, snap) {
  const perWeek = snap.slope ? snap.slope.slopeKgPerDay * 7 : null;
  const kcalLeft = snap.kcalTarget - snap.kcal;
  const nextTraining = plannedSession(ctx.date);
  return h(
    'section',
    { class: 'summary', 'aria-label': 'Tagesübersicht' },
    stat(
      'Trendgewicht',
      snap.slope ? fmt(snap.slope.levelKg, 1) : snap.avg7 ? fmt(snap.avg7.kg, 1) : '–',
      'kg',
      perWeek !== null ? `${fmtSigned(perWeek, 2)} kg/Woche` : 'Trend ab 7 Messungen',
    ),
    stat('Kalorien übrig', fmt(kcalLeft), 'kcal', `Ziel ${fmt(snap.kcalTarget)} kcal`, kcalLeft < 0 ? 'neg' : ''),
    stat('Protein', fmt(snap.proteinG), 'g', `Ziel ${fmt(snap.protein.grams)} g`, snap.proteinG >= snap.protein.grams ? 'pos' : ''),
    stat('Heute geplant', nextTraining.title, '', nextTraining.detail),
  );
}

/**
 * Wochenplan: Mo Kraft A, Di locker, Do Kraft B, Sa Intervalle, So lang.
 * @param {string} iso
 */
export function plannedSession(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  /** @type {Record<number, { title: string, detail: string }>} */
  const plan = {
    1: { title: 'Kraft A', detail: '45 Min. Geschäfts-Gym' },
    2: { title: 'Lauf locker', detail: `${RUN_TYPES.z2.label}, 40–50 Min.` },
    3: { title: 'Pause', detail: 'Schritte sammeln' },
    4: { title: 'Kraft B', detail: '45 Min. Geschäfts-Gym' },
    5: { title: 'Pause', detail: 'Schritte sammeln' },
    6: { title: 'Intervalle', detail: '4 × 4 Min. zügig, 3 Min. locker' },
    0: { title: 'Langer Lauf', detail: '60–75 Min. locker' },
  };
  return plan[dow];
}

/**
 * @param {string} label
 * @param {string} value
 * @param {string} unit
 * @param {string} sub
 * @param {string} [tone]
 */
function stat(label, value, unit, sub, tone = '') {
  return h(
    'div',
    { class: `stat ${tone}` },
    h('span', { class: 'stat-label' }, label),
    h('span', { class: 'stat-value' }, value, unit ? h('small', {}, ` ${unit}`) : null),
    h('span', { class: 'stat-sub' }, sub),
  );
}

/** @param {NonNullable<Ctx['snap']>} snap */
function hints(snap) {
  if (!snap.hints.length) return null;
  return h(
    'section',
    { class: 'card hints', 'aria-labelledby': 'hints-h' },
    h('h2', { id: 'hints-h' }, 'Coach'),
    h(
      'ul',
      { class: 'hint-list' },
      ...snap.hints.map((x) => h('li', { class: `hint-item sev-${x.severity}` }, h('strong', {}, x.title), h('p', {}, x.text))),
    ),
  );
}

/**
 * @param {Ctx} ctx
 * @param {NonNullable<Ctx['snap']>} snap
 */
function weightCard(ctx, snap) {
  const day = snap.day;
  const form = h(
    'form',
    {
      class: 'inline-form',
      on: {
        submit: (e) => {
          e.preventDefault();
          const v = num(new FormData(/** @type {HTMLFormElement} */ (e.target)), 'weight');
          if (v === null || v < 30 || v > 300) return ctx.toast('Bitte ein Gewicht zwischen 30 und 300 kg eingeben.', 'error');
          ctx.commit((s) => {
            s.days[ctx.date] = { ...s.days[ctx.date], weightKg: Math.round(v * 10) / 10 };
          }, 'Gewicht gespeichert');
        },
      },
    },
    field({
      id: 'weight',
      label: 'Gewicht morgens, nüchtern',
      type: 'text',
      inputmode: 'decimal',
      value: day.weightKg ?? '',
      placeholder: 'z. B. 94.6',
      suffix: 'kg',
    }),
    h('button', { class: 'btn primary', type: 'submit', id: 'weight-save' }, 'Speichern'),
  );
  const diffPlan = snap.slope ? snap.slope.levelKg - snap.planKgToday : null;
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'w-h' },
    h('h2', { id: 'w-h' }, 'Gewicht'),
    form,
    h(
      'dl',
      { class: 'kv' },
      h('dt', {}, '7-Tage-Schnitt'),
      h('dd', {}, snap.avg7 ? `${fmt(snap.avg7.kg, 1)} kg (${snap.avg7.n} Messungen)` : '–'),
      h('dt', {}, 'Plan heute'),
      h('dd', {}, `${fmt(snap.planKgToday, 1)} kg`),
      h('dt', {}, 'Abweichung zum Plan'),
      h('dd', {}, diffPlan === null ? 'ab 7 Messungen' : `${fmtSigned(diffPlan, 1)} kg`),
    ),
    h('p', { class: 'muted small' }, 'Einzelwerte schwanken durch Wasser und Salz um 1–2 kg. Aussagekräftig ist nur der Trend.'),
  );
}

/**
 * @param {Ctx} ctx
 * @param {NonNullable<Ctx['snap']>} snap
 */
function nutritionCard(ctx, snap) {
  const food = snap.day.food ?? [];
  /** @param {{ name: string, kcal: number, protein: number }} f */
  const add = (f) =>
    ctx.commit((s) => {
      const d = (s.days[ctx.date] = s.days[ctx.date] ?? {});
      d.food = [...(d.food ?? []), { id: uid(), name: f.name, kcal: f.kcal, protein: f.protein, time: nowTime() }];
    }, `${f.name} erfasst`);

  const custom = h(
    'form',
    {
      class: 'mini-form',
      on: {
        submit: (e) => {
          e.preventDefault();
          const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
          const name = str(fd, 'food-name') || 'Mahlzeit';
          const kcal = num(fd, 'food-kcal');
          const protein = num(fd, 'food-protein') ?? 0;
          if (kcal === null || kcal < 0 || kcal > 5000) return ctx.toast('Bitte Kalorien zwischen 0 und 5000 eingeben.', 'error');
          if (protein < 0 || protein > 300) return ctx.toast('Protein muss zwischen 0 und 300 g liegen.', 'error');
          add({ name, kcal: Math.round(kcal), protein: Math.round(protein) });
        },
      },
    },
    field({ id: 'food-name', label: 'Was', placeholder: 'z. B. Kantine Menü 1' }),
    field({ id: 'food-kcal', label: 'kcal', inputmode: 'numeric', required: true }),
    field({ id: 'food-protein', label: 'Protein g', inputmode: 'numeric' }),
    h('button', { class: 'btn', type: 'submit', id: 'food-add' }, 'Hinzufügen'),
  );

  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'n-h' },
    h('h2', { id: 'n-h' }, 'Ernährung'),
    meter({ value: snap.kcal, target: snap.kcalTarget, label: 'Energie', unit: 'kcal' }),
    meter({ value: snap.proteinG, target: snap.protein.grams, label: 'Protein', unit: 'g', over: 'good' }),
    h('p', { class: 'eyebrow' }, 'Schnell erfassen'),
    h(
      'div',
      { class: 'chips' },
      ...ctx.state.presets.food.map((p) =>
        h(
          'button',
          { type: 'button', class: 'chip', id: `preset-${p.id}`, on: { click: () => add(p) } },
          p.name,
          h('small', {}, `${fmt(p.kcal)} kcal · ${fmt(p.protein)} g`),
        ),
      ),
    ),
    custom,
    food.length
      ? h(
          'ul',
          { class: 'entries' },
          ...food.map((f) =>
            h(
              'li',
              {},
              h('span', { class: 'entry-time' }, f.time),
              h('span', { class: 'entry-name' }, f.name),
              h('span', { class: 'entry-num' }, `${fmt(f.kcal)} kcal · ${fmt(f.protein)} g`),
              h(
                'button',
                {
                  type: 'button',
                  class: 'icon-btn',
                  'aria-label': `${f.name} entfernen`,
                  on: {
                    click: () =>
                      ctx.commit(
                        (s) => void (s.days[ctx.date].food = (s.days[ctx.date].food ?? []).filter((x) => x.id !== f.id)),
                        'Eintrag entfernt',
                      ),
                  },
                },
                '×',
              ),
            ),
          ),
        )
      : h('p', { class: 'muted small' }, 'Noch nichts erfasst.'),
    h(
      'label',
      { class: 'check' },
      h('input', {
        type: 'checkbox',
        id: 'day-complete',
        checked: Boolean(snap.day.complete),
        on: {
          change: (e) => {
            const v = /** @type {HTMLInputElement} */ (e.target).checked;
            ctx.commit((s) => {
              const d = { ...s.days[ctx.date] };
              if (v) d.complete = true;
              else delete d.complete;
              s.days[ctx.date] = d;
            });
          },
        },
      }),
      h(
        'span',
        {},
        'Tag vollständig erfasst',
        h('small', {}, 'Nur vollständige Tage fliessen in die Berechnung deines echten Verbrauchs ein.'),
      ),
    ),
  );
}

/**
 * @param {Ctx} ctx
 * @param {NonNullable<Ctx['snap']>} snap
 */
function caffeineCard(ctx, snap) {
  const p = snap.profile;
  const list = snap.day.caffeine ?? [];
  const c = snap.caffeine;
  /** @param {{ label: string, mg: number }} x */
  const add = (x) =>
    ctx.commit((s) => {
      const d = (s.days[ctx.date] = s.days[ctx.date] ?? {});
      d.caffeine = [...(d.caffeine ?? []), { id: uid(), label: x.label, mg: x.mg, time: nowTime() }];
    }, `${x.label} erfasst`);
  const cupsInfo =
    snap.cupsAllowed !== null ? `${snap.cupsToday} von ${snap.cupsAllowed} Tassen (Ausschleichplan)` : `${snap.cupsToday} Tassen`;
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'c-h' },
    h('h2', { id: 'c-h' }, 'Koffein'),
    meter({ value: c.total, target: p.caffeineMaxMg, label: cupsInfo, unit: 'mg' }),
    h(
      'dl',
      { class: 'kv' },
      h('dt', {}, 'Letzte Tasse bis'),
      h('dd', {}, `${c.cutoff} Uhr`, c.late.length ? badge('warn', 'überschritten') : null),
      h('dt', {}, `Rest um ${p.bedtime} Uhr`),
      h(
        'dd',
        {},
        `ca. ${fmt(c.atBedtime)} mg`,
        h('small', { class: 'muted' }, ` (Halbwertszeit ${fmt(p.caffeineHalfLifeH, 1)} h angenommen)`),
      ),
    ),
    h(
      'div',
      { class: 'chips' },
      ...ctx.state.presets.caffeine.map((x) =>
        h(
          'button',
          { type: 'button', class: 'chip', id: `caf-${x.id}`, on: { click: () => add(x) } },
          x.label,
          h('small', {}, `${fmt(x.mg)} mg`),
        ),
      ),
    ),
    list.length
      ? h(
          'ul',
          { class: 'entries' },
          ...list.map((x) =>
            h(
              'li',
              {},
              h('span', { class: 'entry-time' }, x.time),
              h('span', { class: 'entry-name' }, x.label),
              h('span', { class: 'entry-num' }, `${fmt(x.mg)} mg`),
              h(
                'button',
                {
                  type: 'button',
                  class: 'icon-btn',
                  'aria-label': `${x.label} entfernen`,
                  on: {
                    click: () =>
                      ctx.commit(
                        (s) => void (s.days[ctx.date].caffeine = (s.days[ctx.date].caffeine ?? []).filter((y) => y.id !== x.id)),
                        'Eintrag entfernt',
                      ),
                  },
                },
                '×',
              ),
            ),
          ),
        )
      : null,
  );
}

/**
 * @param {Ctx} ctx
 * @param {NonNullable<Ctx['snap']>} snap
 */
function recoveryCard(ctx, snap) {
  const d = snap.day;
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'r-h' },
    h('h2', { id: 'r-h' }, 'Aktivität und Erholung'),
    h(
      'form',
      {
        class: 'form-grid',
        on: {
          submit: (e) => {
            e.preventDefault();
            const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
            const steps = num(fd, 'steps');
            const sleep = num(fd, 'sleep');
            const rhr = num(fd, 'rhr');
            if (steps !== null && (steps < 0 || steps > 100000)) return ctx.toast('Schritte zwischen 0 und 100 000.', 'error');
            if (sleep !== null && (sleep < 0 || sleep > 16)) return ctx.toast('Schlaf zwischen 0 und 16 Stunden.', 'error');
            if (rhr !== null && (rhr < 25 || rhr > 150)) return ctx.toast('Ruhepuls zwischen 25 und 150.', 'error');
            ctx.commit((s) => {
              const day = { ...s.days[ctx.date] };
              /** @type {const} */ ([
                ['steps', steps],
                ['sleepH', sleep],
                ['restingHr', rhr],
              ]).forEach(([k, v]) => {
                if (v === null) delete day[k];
                else day[k] = k === 'sleepH' ? Math.round(v * 4) / 4 : Math.round(v);
              });
              s.days[ctx.date] = day;
            }, 'Werte gespeichert');
          },
        },
      },
      field({ id: 'steps', label: 'Schritte', inputmode: 'numeric', value: d.steps ?? '', hint: `Ziel ${fmt(snap.profile.stepsTarget)}` }),
      field({
        id: 'sleep',
        label: 'Schlaf letzte Nacht',
        inputmode: 'decimal',
        value: d.sleepH ?? '',
        suffix: 'h',
        hint: `Ziel ${fmt(snap.profile.sleepTargetH, 1)} h`,
      }),
      field({ id: 'rhr', label: 'Ruhepuls (Garmin)', inputmode: 'numeric', value: d.restingHr ?? '', suffix: '/min' }),
      h('button', { class: 'btn primary', type: 'submit', id: 'recovery-save' }, 'Speichern'),
    ),
    h(
      'dl',
      { class: 'kv' },
      h('dt', {}, 'Schritte, 7-Tage-Schnitt'),
      h('dd', {}, snap.steps7 ? fmt(snap.steps7.value) : '–'),
      h('dt', {}, 'Schlaf, 7-Tage-Schnitt'),
      h('dd', {}, snap.sleep7 ? `${fmt(snap.sleep7.value, 1)} h` : '–'),
      h('dt', {}, 'Ruhepuls, 7-Tage-Schnitt'),
      h(
        'dd',
        {},
        snap.rhr7 ? `${fmt(snap.rhr7.value)} /min` : '–',
        snap.rhrBase ? h('small', { class: 'muted' }, ` (Basis ${fmt(snap.rhrBase.value)})`) : null,
      ),
    ),
  );
}
