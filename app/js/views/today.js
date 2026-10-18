// @ts-check
import { h, field, meter, badge, fmt, fmtSigned, num, str, nowTime } from '../ui/dom.js';
import { uid, extraNutrients, recentFoods } from '../store.js';
import { FIBER_TARGET_G, SALT_LIMIT_G } from '../domain/foodvision.js';
import { plannedSession } from '../domain/training.js';
import { photoBlock } from './photo.js';
import { healthPasteBlock } from './garmin.js';
import { waterPace, waterFact, reminderTimes, buildReminderIcs } from '../domain/hydration.js';
import { reviewCard } from './review.js';

/** @typedef {import('../app.js').Ctx} Ctx */

/**
 * Heute: Stand auf einen Blick, das Wichtigste vom Coach, schnelle Erfassung, Rückblick.
 * @param {Ctx} ctx
 */
export function viewToday(ctx) {
  const snap = /** @type {NonNullable<Ctx['snap']>} */ (ctx.snap);
  return h(
    'div',
    { class: 'stack' },
    h('h1', { class: 'sr-only' }, 'Heute'),
    summary(ctx, snap),
    hints(snap),
    h('div', { class: 'grid-2' }, weightCard(ctx, snap), waterCard(ctx, snap), caffeineCard(ctx, snap), recoveryCard(ctx, snap)),
    reviewCard(ctx),
  );
}

/**
 * Ernährung: Tagesbilanz, Erfassung (KI, Schnellwahl, frei), Einträge.
 * @param {Ctx} ctx
 */
export function viewNutrition(ctx) {
  const snap = /** @type {NonNullable<Ctx['snap']>} */ (ctx.snap);
  return h('div', { class: 'stack' }, h('h1', {}, 'Ernährung'), nutritionCard(ctx, snap));
}

/**
 * @param {Ctx} ctx
 * @param {NonNullable<Ctx['snap']>} snap
 */
function summary(ctx, snap) {
  const perWeek = snap.slope ? snap.slope.slopeKgPerDay * 7 : null;
  const kcalLeft = snap.kcalTarget - snap.kcal;
  const nextTraining = plannedSession(ctx.date, snap.profile.trainingMode);
  const toGoal = snap.weightKg - snap.profile.goalWeightKg;
  return h(
    'div',
    { class: 'stack-sm' },
    h(
      'section',
      { class: 'summary', 'aria-label': 'Tagesübersicht' },
      stat(
        'Trendgewicht',
        snap.slope ? fmt(snap.slope.levelKg, 1) : snap.avg7 ? fmt(snap.avg7.kg, 1) : '–',
        'kg',
        [
          perWeek !== null ? `${fmtSigned(perWeek, 2)} kg/Woche` : 'Trend ab 7 Messungen',
          toGoal > 0 ? `noch ${fmt(toGoal, 1)} kg bis Ziel` : 'Ziel erreicht',
        ].join(' · '),
        '',
        '#fortschritt',
      ),
      stat('Kalorien übrig', fmt(kcalLeft), 'kcal', `Ziel ${fmt(snap.kcalTarget)} kcal`, kcalLeft < 0 ? 'neg' : '', '#ernaehrung'),
      stat(
        'Protein',
        fmt(snap.proteinG),
        'g',
        `Ziel ${fmt(snap.protein.grams)} g`,
        snap.proteinG >= snap.protein.grams ? 'pos' : '',
        '#ernaehrung',
      ),
      stat(ctx.date === ctx.today ? 'Heute geplant' : 'Geplant', nextTraining.title, '', nextTraining.detail, '', '#training'),
    ),
    h(
      'div',
      { class: 'quick-actions' },
      h('a', { href: '#ernaehrung', class: 'btn primary', id: 'cta-meal' }, '+ Mahlzeit erfassen'),
      h('a', { href: '#training', class: 'btn', id: 'cta-run' }, '+ Training erfassen'),
    ),
  );
}

/**
 * @param {string} label
 * @param {string} value
 * @param {string} unit
 * @param {string} sub
 * @param {string} [tone]
 * @param {string} [href] Ziel, wenn die Kennzahl antippbar ist
 */
function stat(label, value, unit, sub, tone = '', href = '') {
  return h(
    href ? 'a' : 'div',
    { class: `stat ${tone} ${href ? 'stat-link' : ''}`, href: href || undefined },
    h('span', { class: 'stat-label' }, label),
    h('span', { class: 'stat-value' }, value, unit ? h('small', {}, ` ${unit}`) : null),
    h('span', { class: 'stat-sub' }, sub),
  );
}

/** @param {NonNullable<Ctx['snap']>} snap */
function hints(snap) {
  if (!snap.hints.length) return null;
  // Dringendes immer zeigen, sonst die zwei wichtigsten; der Rest aufklappbar.
  const shown = Math.max(2, snap.hints.filter((x) => x.severity === 'alert' || x.severity === 'warn').length);
  const rest = snap.hints.slice(shown);
  return h(
    'section',
    { class: 'card hints', 'aria-labelledby': 'hints-h' },
    h('h2', { id: 'hints-h' }, 'Coach'),
    hintList(snap.hints.slice(0, shown)),
    rest.length ? h('details', { class: 'more-hints' }, h('summary', {}, `${rest.length} weitere Hinweise`), hintList(rest)) : null,
  );
}

const SEVERITY_LABEL = { alert: 'Dringend', warn: 'Wichtig', info: 'Tipp', ok: 'Info' };

/** Schweregrad als Text und Randfarbe, nicht nur als Farbe. @param {NonNullable<Ctx['snap']>['hints']} list */
function hintList(list) {
  return h(
    'ul',
    { class: 'hint-list' },
    ...list.map((x) =>
      h(
        'li',
        { class: `hint-item sev-${x.severity}` },
        h('span', { class: 'sev-label' }, SEVERITY_LABEL[x.severity]),
        h('strong', {}, x.title),
        h('p', {}, x.text),
      ),
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
      const { grams: _g, source: _s, ...nutrients } = extraNutrients(/** @type {Record<string, unknown>} */ (f));
      d.food = [...(d.food ?? []), { id: uid(), name: f.name, kcal: f.kcal, protein: f.protein, time: nowTime(), ...nutrients }];
    }, `${f.name} erfasst`);
  const recent = recentFoods(ctx.state, ctx.date, 6);
  const fiber = food.reduce((a, f) => a + (f.fiber ?? 0), 0);
  const salt = food.reduce((a, f) => a + (f.salt ?? 0), 0);
  const hasMicro = food.some((f) => f.fiber !== undefined || f.salt !== undefined);

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
    h('h2', { id: 'n-h' }, 'Tagesbilanz'),
    meter({ value: snap.kcal, target: snap.kcalTarget, label: 'Energie', unit: 'kcal' }),
    meter({ value: snap.proteinG, target: snap.protein.grams, label: 'Protein', unit: 'g', over: 'good' }),
    hasMicro
      ? h(
          'p',
          { class: 'micro small', id: 'micro' },
          h('span', { class: fiber >= FIBER_TARGET_G ? 'ok' : '' }, `Ballaststoffe ${fmt(fiber, 1)} / ${FIBER_TARGET_G} g`),
          h('span', { class: salt > SALT_LIMIT_G ? 'over' : '' }, `Salz ${fmt(salt, 1)} / max. ${SALT_LIMIT_G} g`),
        )
      : null,
    photoBlock(ctx, snap),
    recent.length
      ? [
          h('p', { class: 'eyebrow' }, 'Zuletzt gegessen'),
          h(
            'div',
            { class: 'chips' },
            ...recent.map((f, i) =>
              h(
                'button',
                { type: 'button', class: 'chip', id: `recent-${i}`, on: { click: () => add(f) } },
                f.name,
                h('small', {}, `${fmt(f.kcal)} kcal · ${fmt(f.protein)} g`),
              ),
            ),
          ),
        ]
      : null,
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
          { class: 'entries', id: 'food-entries' },
          ...[...food].sort((x, y) => (x.time < y.time ? -1 : x.time > y.time ? 1 : 0)).map((f) => foodRow(ctx, f)),
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
          'details',
          { class: 'entry-details' },
          h('summary', {}, `${list.length} ${list.length === 1 ? 'Eintrag' : 'Einträge'} anzeigen`),
          h(
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
    healthPasteBlock(ctx),
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

/**
 * Trinken: Schnellknöpfe für Glas und Flasche, Korrektur nach unten.
 * @param {Ctx} ctx
 * @param {NonNullable<Ctx['snap']>} snap
 */
function waterCard(ctx, snap) {
  const ml = snap.day.waterMl ?? 0;
  const target = snap.profile.waterTargetMl;
  /** @param {number} delta */
  const change = (delta) =>
    ctx.commit(
      (s) => {
        const d = { ...s.days[ctx.date] };
        const next = Math.min(10000, Math.max(0, (d.waterMl ?? 0) + delta));
        if (next) d.waterMl = next;
        else delete d.waterMl;
        s.days[ctx.date] = d;
      },
      delta > 0 ? `+${fmt(delta)} ml` : 'Korrigiert',
    );
  const now = new Date();
  const pace = waterPace({ ml, target, minutes: now.getHours() * 60 + now.getMinutes(), isToday: ctx.date === ctx.today });
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'water-h' },
    h('h2', { id: 'water-h' }, 'Trinken'),
    meter({
      value: ml,
      target,
      label: `${fmt(ml / 250, (ml / 250) % 1 ? 1 : 0)} ${ml === 250 ? 'Glas' : 'Gläser'} à 250 ml`,
      unit: 'ml',
      over: 'good',
    }),
    h(
      'div',
      { class: 'chips' },
      h('button', { type: 'button', class: 'chip', id: 'water-250', on: { click: () => change(250) } }, 'Glas', h('small', {}, '+250 ml')),
      h(
        'button',
        { type: 'button', class: 'chip', id: 'water-500', on: { click: () => change(500) } },
        'Flasche',
        h('small', {}, '+500 ml'),
      ),
      h(
        'button',
        { type: 'button', class: 'chip', id: 'water-750', on: { click: () => change(750) } },
        'Grosse Flasche',
        h('small', {}, '+750 ml'),
      ),
      h(
        'button',
        { type: 'button', class: 'chip', id: 'water-minus', disabled: !ml, on: { click: () => change(-250) } },
        'Korrektur',
        h('small', {}, '−250 ml'),
      ),
    ),
    pace ? h('p', { class: `water-pace pace-${pace.status}`, id: 'water-pace' }, pace.message) : null,
    h(
      'p',
      { class: 'water-fact small', id: 'water-fact' },
      h('strong', {}, ml ? 'Gut gemacht. ' : 'Wusstest du? '),
      waterFact(ctx.date, ml / 250),
    ),
    snap.water7 ? h('p', { class: 'small muted' }, `7-Tage-Schnitt: ${fmt(snap.water7.value)} ml`) : null,
    reminderBlock(ctx, target),
    h('p', { class: 'hint' }, 'Kaffee und Tee zählen mit. Bei Herz- oder Nierenerkrankungen gilt die ärztlich empfohlene Trinkmenge.'),
  );
}

/** Einstellungen der Erinnerungen (nur für die laufende Sitzung, die Termine leben im Kalender). */
const reminder = { start: '09:00', end: '19:00', every: 120, weekdaysOnly: false, open: false };

/**
 * Trink-Erinnerungen als Kalenderdatei: zuverlässige Benachrichtigungen auch bei
 * geschlossener App, ohne Server.
 * @param {Ctx} ctx
 * @param {number} target
 */
function reminderBlock(ctx, target) {
  const times = reminderTimes(reminder.start, reminder.end, reminder.every);
  const perReminder = times.length ? target / times.length : 0;
  /** @param {Event} e */
  const update = (e) => {
    const form = /** @type {HTMLFormElement} */ (/** @type {HTMLElement} */ (e.target).closest('form'));
    const fd = new FormData(form);
    reminder.start = str(fd, 'rem-start') || reminder.start;
    reminder.end = str(fd, 'rem-end') || reminder.end;
    reminder.every = Number(str(fd, 'rem-every')) || reminder.every;
    reminder.weekdaysOnly = fd.get('rem-weekdays') === 'on';
    ctx.go('heute');
  };
  return h(
    'details',
    {
      class: 'reminders',
      id: 'water-reminders',
      open: reminder.open,
      // Offen bleiben, wenn die Ansicht nach einer Änderung neu gezeichnet wird.
      on: { toggle: (e) => void (reminder.open = /** @type {HTMLDetailsElement} */ (e.target).open) },
    },
    h('summary', {}, 'Erinnerungen einrichten'),
    h(
      'form',
      {
        class: 'stack-sm',
        on: {
          change: update,
          submit: (e) => {
            e.preventDefault();
            if (!times.length) return ctx.toast('Bitte Zeitraum prüfen: «Bis» muss nach «Von» liegen.', 'error');
            const now = new Date();
            const stamp = now
              .toISOString()
              .replace(/[-:]/g, '')
              .replace(/\.\d{3}/, '');
            const ics = buildReminderIcs({
              times,
              mlPerReminder: perReminder,
              weekdaysOnly: reminder.weekdaysOnly,
              startDate: ctx.today,
              stamp,
            });
            const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
            const a = h('a', { href: url, download: 'trink-erinnerungen.ics' });
            document.body.append(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
            ctx.toast('Kalenderdatei erstellt. Im Kalender «Alle hinzufügen» wählen.');
          },
        },
      },
      h(
        'div',
        { class: 'form-grid' },
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'rem-start' }, 'Von'),
          h('input', { id: 'rem-start', name: 'rem-start', type: 'time', value: reminder.start }),
        ),
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'rem-end' }, 'Bis'),
          h('input', { id: 'rem-end', name: 'rem-end', type: 'time', value: reminder.end }),
        ),
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'rem-every' }, 'Alle'),
          h(
            'select',
            { id: 'rem-every', name: 'rem-every' },
            ...[60, 90, 120, 180].map((m) =>
              h('option', { value: String(m), selected: m === reminder.every }, m % 60 ? `${m / 60} Std.` : `${m / 60} Std.`),
            ),
          ),
        ),
      ),
      h(
        'label',
        { class: 'check' },
        h('input', { type: 'checkbox', id: 'rem-weekdays', name: 'rem-weekdays', checked: reminder.weekdaysOnly }),
        h('span', {}, 'Nur Montag bis Freitag'),
      ),
      h(
        'p',
        { class: 'small', id: 'rem-preview' },
        times.length
          ? `${times.length} Erinnerungen täglich (${times.join(', ')}), je etwa ${fmt(Math.round(perReminder / 50) * 50)} ml.`
          : 'Keine Erinnerungen im gewählten Zeitraum.',
      ),
      h('button', { type: 'submit', class: 'btn primary', id: 'rem-create' }, 'In Kalender übernehmen'),
      h(
        'p',
        { class: 'hint' },
        'Die Erinnerungen kommen als Kalender-Benachrichtigung, auch wenn die App geschlossen ist. Tipp: Beim Import einen eigenen Kalender «Trinken» wählen. Dann kannst du die Erinnerungen später einfach ausblenden oder löschen. Zusätzlich erinnert dich die App beim Öffnen, wenn du hinter dem Trinkplan liegst.',
      ),
    ),
  );
}

/** Eintrag, der gerade bearbeitet wird. */
let editingFoodId = '';

/**
 * Eine Mahlzeit: anzeigen oder direkt in der Liste bearbeiten (ohne Dialog).
 * @param {Ctx} ctx
 * @param {import('../store.js').FoodEntry} f
 */
function foodRow(ctx, f) {
  const remove = () =>
    ctx.commit((s) => void (s.days[ctx.date].food = (s.days[ctx.date].food ?? []).filter((x) => x.id !== f.id)), `${f.name} entfernt`);
  if (editingFoodId !== f.id) {
    return h(
      'li',
      {},
      h('span', { class: 'entry-time' }, f.time),
      h(
        'span',
        { class: 'entry-name' },
        f.name,
        f.source === 'foto' || f.source === 'text' ? h('small', { class: 'muted' }, ' · geschätzt') : null,
      ),
      h('span', { class: 'entry-num' }, `${fmt(f.kcal)} kcal · ${fmt(f.protein)} g`),
      h(
        'span',
        { class: 'entry-actions' },
        h(
          'button',
          {
            type: 'button',
            class: 'icon-btn',
            'aria-label': `${f.name} bearbeiten`,
            on: {
              click: () => {
                editingFoodId = f.id;
                ctx.go('ernaehrung');
              },
            },
          },
          '✎',
        ),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `${f.name} entfernen`, on: { click: remove } }, '×'),
      ),
    );
  }
  return h(
    'li',
    { class: 'editing' },
    h(
      'form',
      {
        class: 'edit-form',
        on: {
          submit: (e) => {
            e.preventDefault();
            const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
            const kcal = num(fd, 'edit-kcal');
            const protein = num(fd, 'edit-protein');
            const time = str(fd, 'edit-time');
            if (kcal === null || kcal < 0 || kcal > 5000) return ctx.toast('Bitte Kalorien zwischen 0 und 5000 eingeben.', 'error');
            if (protein === null || protein < 0 || protein > 300) return ctx.toast('Protein muss zwischen 0 und 300 g liegen.', 'error');
            editingFoodId = '';
            // Weitere Nährwerte im gleichen Verhältnis wie die Kalorien anpassen, damit die Summen stimmig bleiben.
            const factor = f.kcal > 0 ? kcal / f.kcal : 1;
            ctx.commit((s) => {
              const list = s.days[ctx.date].food ?? [];
              const i = list.findIndex((x) => x.id === f.id);
              if (i < 0) return;
              /** @type {import('../store.js').FoodEntry} */
              const next = {
                ...list[i],
                name: str(fd, 'edit-name') || f.name,
                kcal: Math.round(kcal),
                protein: Math.round(protein),
                time: /^\d{2}:\d{2}$/.test(time) ? time : f.time,
              };
              for (const k of /** @type {const} */ (['carbs', 'fat', 'sugar', 'satFat', 'fiber', 'salt'])) {
                const v = list[i][k];
                if (v !== undefined) next[k] = Math.round(v * factor * 10) / 10;
              }
              list[i] = next;
            }, 'Eintrag geändert');
          },
        },
      },
      h(
        'div',
        { class: 'field' },
        h('label', { for: 'edit-name' }, 'Was'),
        h('input', { id: 'edit-name', name: 'edit-name', value: f.name }),
      ),
      h(
        'div',
        { class: 'field' },
        h('label', { for: 'edit-time' }, 'Zeit'),
        h('input', { id: 'edit-time', name: 'edit-time', type: 'time', value: f.time }),
      ),
      h(
        'div',
        { class: 'field' },
        h('label', { for: 'edit-kcal' }, 'kcal'),
        h('input', { id: 'edit-kcal', name: 'edit-kcal', inputmode: 'numeric', value: String(f.kcal) }),
      ),
      h(
        'div',
        { class: 'field' },
        h('label', { for: 'edit-protein' }, 'Protein g'),
        h('input', { id: 'edit-protein', name: 'edit-protein', inputmode: 'numeric', value: String(f.protein) }),
      ),
      h(
        'div',
        { class: 'btn-row' },
        h('button', { type: 'submit', class: 'btn primary', id: 'edit-save' }, 'Speichern'),
        h(
          'button',
          {
            type: 'button',
            class: 'btn',
            on: {
              click: () => {
                editingFoodId = '';
                ctx.go('ernaehrung');
              },
            },
          },
          'Abbrechen',
        ),
        h('button', { type: 'button', class: 'btn danger-outline', on: { click: remove } }, 'Löschen'),
      ),
    ),
  );
}
