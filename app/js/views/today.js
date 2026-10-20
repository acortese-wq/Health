// @ts-check
import { h, field, select, meter, badge, fmt, fmtSigned, fmtDate, num, str, nowTime } from '../ui/dom.js';
import { uid, extraNutrients, recentFoods, addFood } from '../store.js';
import { repeatEntry, scaleEntry, possibleDuplicates, dayStatus, foodQuality } from '../domain/entries.js';
import { dailyTargets } from '../domain/micros.js';
import { FIBER_TARGET_G, SALT_LIMIT_G } from '../domain/foodvision.js';
import { plannedSession } from '../domain/training.js';
import { photoBlock } from './photo.js';
import { healthPasteBlock } from './garmin.js';
import { waterPace, waterFact, reminderTimes, buildReminderIcs } from '../domain/hydration.js';
import { reviewCard } from './review.js';
import { foodSearchBlock, nutrientsCard, suggestCard, pyramidCard, rhythmCard } from './nutrients.js';
import { scaleGroups } from '../domain/foodgroups.js';
import { TRIGGERS, HUNGER } from '../domain/meals.js';
import { PHASE_TIPS } from '../domain/cycle.js';
import {
  eatingWindow,
  windowLabel,
  inWindow,
  fastingStatus,
  overnightFastH,
  outsideWindow,
  proteinPlan,
  SMALL_KCAL,
} from '../domain/fasting.js';
import { addDays, isNum } from '../domain/util.js';

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
    h(
      'div',
      { class: 'grid-2' },
      weightCard(ctx, snap),
      cycleCard(ctx, snap),
      fastingCard(ctx, snap),
      waterCard(ctx, snap),
      caffeineCard(ctx, snap),
      recoveryCard(ctx, snap),
    ),
    reviewCard(ctx),
  );
}

/**
 * Ernährung: Tagesbilanz, Erfassung (KI, Schnellwahl, frei), Einträge.
 * @param {Ctx} ctx
 */
export function viewNutrition(ctx) {
  const snap = /** @type {NonNullable<Ctx['snap']>} */ (ctx.snap);
  return h(
    'div',
    { class: 'stack' },
    h('h1', {}, 'Ernährung'),
    nutritionCard(ctx, snap),
    suggestCard(ctx, snap),
    rhythmCard(ctx, snap),
    pyramidCard(ctx, snap),
    nutrientsCard(ctx, snap),
  );
}

/**
 * Kopfbereich «Heute»: Tagesstatus, wichtigste Kennzahlen, Makros, Schnellaktionen.
 * Fehlende Werte heissen «Noch nicht erfasst», nie 0.
 * @param {Ctx} ctx
 * @param {NonNullable<Ctx['snap']>} snap
 */
function summary(ctx, snap) {
  const perWeek = snap.slope ? snap.slope.slopeKgPerDay * 7 : null;
  const food = snap.day.food ?? [];
  const kcalLeft = snap.kcalTarget - snap.kcal;
  const nextTraining = plannedSession(ctx.date, snap.profile.trainingMode);
  const toGoal = snap.weightKg - snap.profile.goalWeightKg;
  const p = snap.profile;
  const d = snap.day;
  const NA = 'Noch nicht erfasst';
  const runs = ctx.state.workouts.filter((w) => w.date === ctx.date);
  const runMin = runs.reduce((a, w) => a + (w.kind === 'run' ? w.minutes : 0), 0);
  const trainingDone = runs.length
    ? runs.map((w) => (w.kind === 'run' ? `Lauf ${fmt(w.minutes)} min` : `Kraft ${w.template}`)).join(', ')
    : '';
  return h(
    'div',
    { class: 'stack-sm' },
    statusList(ctx, snap),
    quickActions(ctx),
    h(
      'section',
      { class: 'summary', 'aria-label': 'Tagesübersicht' },
      stat(
        'Trendgewicht',
        snap.slope ? fmt(snap.slope.levelKg, 1) : snap.avg7 ? fmt(snap.avg7.kg, 1) : fmt(p.startWeightKg, 1),
        'kg',
        [
          perWeek !== null
            ? `${fmtSigned(perWeek, 2)} kg/Woche`
            : snap.series.length
              ? 'Trend ab 7 Messungen'
              : 'Startgewicht, noch keine Messung',
          toGoal > 0 ? `noch ${fmt(toGoal, 1)} kg bis Ziel` : 'Ziel erreicht',
        ].join(' · '),
        '',
        '#fortschritt',
      ),
      stat(
        kcalLeft < 0 ? 'Über dem Ziel' : 'Kalorien übrig',
        fmt(Math.abs(kcalLeft)),
        'kcal',
        `${food.length ? `${fmt(snap.kcal)} gegessen · ` : 'Noch nichts erfasst · '}Ziel ${fmt(snap.kcalTarget)} kcal`,
        kcalLeft < 0 ? 'neg' : '',
        '#ernaehrung',
      ),
      stat(
        'Protein',
        food.length ? fmt(snap.proteinG) : '–',
        food.length ? 'g' : '',
        `${food.length ? '' : `${NA} · `}Ziel ${fmt(snap.protein.grams)} g`,
        snap.proteinG >= snap.protein.grams ? 'pos' : '',
        '#ernaehrung',
      ),
      stat(
        trainingDone ? 'Training heute' : ctx.date === ctx.today ? 'Heute geplant' : 'Geplant',
        trainingDone || nextTraining.title,
        '',
        trainingDone ? (runMin ? `${fmt(runMin)} min Laufen` : 'erfasst') : nextTraining.detail,
        trainingDone ? 'pos' : '',
        '#training',
      ),
    ),
    h(
      'section',
      { class: 'summary summary-small', 'aria-label': 'Aktivität und Erholung' },
      stat(
        'Gewicht heute',
        isNum(d.weightKg) ? fmt(/** @type {number} */ (d.weightKg), 1) : '–',
        isNum(d.weightKg) ? 'kg' : '',
        isNum(d.weightKg) ? 'morgens gemessen' : NA,
        '',
      ),
      stat(
        'Schritte',
        isNum(d.steps) ? fmt(/** @type {number} */ (d.steps)) : '–',
        '',
        `${isNum(d.steps) ? '' : `${NA} · `}Ziel ${fmt(p.stepsTarget)}`,
        isNum(d.steps) && /** @type {number} */ (d.steps) >= p.stepsTarget ? 'pos' : '',
      ),
      stat(
        'Schlaf',
        isNum(d.sleepH) ? fmt(/** @type {number} */ (d.sleepH), 1) : '–',
        isNum(d.sleepH) ? 'h' : '',
        `${isNum(d.sleepH) ? '' : `${NA} · `}Ziel ${fmt(p.sleepTargetH, 1)} h`,
        isNum(d.sleepH) && /** @type {number} */ (d.sleepH) >= p.sleepTargetH ? 'pos' : '',
      ),
      stat(
        'Wasser',
        isNum(d.waterMl) ? fmt(/** @type {number} */ (d.waterMl) / 1000, 1) : '–',
        isNum(d.waterMl) ? 'l' : '',
        `${isNum(d.waterMl) ? '' : `${NA} · `}Ziel ${fmt(p.waterTargetMl / 1000, 1)} l`,
        isNum(d.waterMl) && /** @type {number} */ (d.waterMl) >= p.waterTargetMl ? 'pos' : '',
      ),
    ),
    macroCard(snap),
  );
}

/**
 * Tagesstatus als Plaketten (Regeln in domain/entries.js).
 * @param {Ctx} ctx
 * @param {NonNullable<Ctx['snap']>} snap
 */
export function statusList(ctx, snap) {
  const st = dayStatus({
    food: snap.day.food ?? [],
    complete: Boolean(snap.day.complete),
    isToday: ctx.date === ctx.today,
    kcalTarget: snap.kcalTarget,
  });
  return h(
    'ul',
    { class: 'day-status', id: 'day-status', 'aria-label': 'Status des Tages' },
    ...st.items.map((i) => h('li', { title: i.detail, 'data-status': i.id }, badge(i.tone, i.label))),
  );
}

/**
 * Kalorien und Makros mit Ziel. Kohlenhydrate und Fett nur aus Einträgen, für die sie
 * bekannt sind; dann als Untergrenze gekennzeichnet.
 * @param {NonNullable<Ctx['snap']>} snap
 */
function macroCard(snap) {
  const food = snap.day.food ?? [];
  const t = dailyTargets({ kcalTarget: snap.kcalTarget, proteinG: snap.protein.grams, sex: snap.profile.sex, stage: snap.lifeStage });
  const q = foodQuality(food);
  const sum = (/** @type {'carbs' | 'fat' | 'fiber' | 'sugar' | 'satFat' | 'salt'} */ k) => {
    const known = food.filter((f) => typeof f[k] === 'number');
    return { value: known.reduce((a, f) => a + /** @type {number} */ (f[k]), 0), known: known.length, all: food.length };
  };
  const carbs = sum('carbs');
  const fat = sum('fat');
  const partial = (/** @type {{ known: number, all: number }} */ x) =>
    x.all && x.known < x.all ? ` (aus ${x.known} von ${x.all} Einträgen)` : '';
  const fromMacros = snap.proteinG * 4 + carbs.value * 4 + fat.value * 9;
  /** @param {string} label @param {'fiber' | 'sugar' | 'satFat' | 'salt'} k @param {string} ref @param {number} digits */
  const small = (label, k, ref, digits) => {
    const x = sum(k);
    return h(
      'li',
      {},
      h('span', { class: 'muted' }, label),
      ' ',
      x.known
        ? h('strong', {}, `${fmt(x.value, /** @type {0 | 1} */ (digits))} g`)
        : h('span', { class: 'muted' }, food.length ? 'unbekannt' : '–'),
      h('small', { class: 'muted' }, ` ${ref}${partial(x)}`),
    );
  };
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'macro-h', id: 'macro-card' },
    h('h2', { id: 'macro-h' }, 'Energie und Makros'),
    meter({ value: snap.kcal, target: snap.kcalTarget, label: 'Energie', unit: 'kcal' }),
    meter({ value: snap.proteinG, target: snap.protein.grams, label: 'Protein', unit: 'g', over: 'good' }),
    meter({ value: carbs.value, target: t.carbs ?? 0, label: `Kohlenhydrate${partial(carbs)}`, unit: 'g', over: 'neutral' }),
    meter({ value: fat.value, target: t.fat ?? 0, label: `Fett${partial(fat)}`, unit: 'g', over: 'neutral' }),
    h(
      'ul',
      { class: 'macro-facts', id: 'macro-facts' },
      small('Ballaststoffe', 'fiber', `Ziel ${FIBER_TARGET_G} g`, 0),
      small('Zucker', 'sugar', 'gesamt', 0),
      small('Gesättigte Fette', 'satFat', `max. ${fmt(t.satFat ?? 0)} g`, 0),
      small('Salz', 'salt', `max. ${SALT_LIMIT_G} g`, 1),
    ),
    food.length && q.noMacros
      ? h(
          'p',
          { class: 'hint', id: 'macro-partial' },
          `${q.noMacros} von ${q.entries} Einträgen ohne vollständige Makros: Die Summen sind Untergrenzen.`,
        )
      : null,
    food.length && !q.noMacros && Math.abs(fromMacros - snap.kcal) > Math.max(60, snap.kcal * 0.08)
      ? h(
          'p',
          { class: 'hint' },
          `Aus Protein, Kohlenhydraten und Fett ergeben sich ${fmt(fromMacros)} kcal statt ${fmt(snap.kcal)} kcal. Abweichungen entstehen durch Rundung, Ballaststoffe (≈ 2 kcal/g), Alkohol und unterschiedliche Berechnungsmethoden der Quellen.`,
        )
      : null,
  );
}

/**
 * Häufige Aktionen mit einem Tipp.
 * @param {Ctx} ctx
 */
function quickActions(ctx) {
  const last = lastEntry(ctx);
  const water = () =>
    ctx.commit((s) => {
      const d = { ...s.days[ctx.date] };
      d.waterMl = Math.min(10000, (d.waterMl ?? 0) + 250);
      s.days[ctx.date] = d;
    }, '+250 ml Wasser');
  const jump = (/** @type {string} */ id) => () => {
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.focus({ preventScroll: true });
  };
  return h(
    'div',
    { class: 'quick-actions' },
    h('a', { href: '#ernaehrung', class: 'btn primary', id: 'cta-meal' }, '+ Mahlzeit erfassen'),
    last
      ? h(
          'button',
          {
            type: 'button',
            class: 'btn',
            id: 'cta-repeat',
            title: `${last.name}: ${last.grams ? `${fmt(last.grams)} g, ` : ''}${fmt(last.kcal)} kcal`,
            on: { click: () => repeat(ctx, last) },
          },
          `↻ ${shortName(last.name)} nochmal`,
          h('small', { class: 'btn-sub' }, `${last.grams ? `${fmt(last.grams)} g · ` : ''}${fmt(last.kcal)} kcal`),
        )
      : h('a', { href: '#training', class: 'btn', id: 'cta-run' }, '+ Training erfassen'),
    h('button', { type: 'button', class: 'btn', id: 'cta-water', on: { click: water } }, '+ Glas Wasser'),
    h('button', { type: 'button', class: 'btn', id: 'cta-weight', on: { click: jump('weight') } }, 'Gewicht eintragen'),
    h('button', { type: 'button', class: 'btn', id: 'cta-sleep', on: { click: jump('sleep') } }, 'Schlaf und Schritte'),
    last ? h('a', { href: '#training', class: 'btn', id: 'cta-run' }, '+ Training erfassen') : null,
  );
}

/** Name ohne Mengenangabe, gekürzt für Knöpfe. @param {string} name */
function shortName(name) {
  const n = name.replace(/ \(\d.*\)$|, \d+ (g|ml)$/, '');
  return n.length > 22 ? `${n.slice(0, 21)}…` : n;
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
  /** Vorlage oder freie Eingabe erfassen. @param {{ name: string, kcal: number, protein: number, proteinKnown?: false }} f */
  const add = (f) =>
    ctx.commit((s) => {
      const { grams: _g, source: _s, ...nutrients } = extraNutrients(/** @type {Record<string, unknown>} */ (f));
      return (
        addFood(s, ctx.date, {
          name: f.name,
          kcal: f.kcal,
          protein: f.protein,
          time: entryTimeFor(ctx),
          ...nutrients,
          ...(f.proteinKnown === false ? { proteinKnown: false } : {}),
        }) !== null
      );
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
          const proteinIn = num(fd, 'food-protein');
          const protein = proteinIn ?? 0;
          if (kcal === null || kcal < 0 || kcal > 5000) return ctx.toast('Bitte Kalorien zwischen 0 und 5000 eingeben.', 'error');
          if (protein < 0 || protein > 300) return ctx.toast('Protein muss zwischen 0 und 300 g liegen.', 'error');
          // Leeres Proteinfeld heisst «unbekannt», nicht 0 g
          add({
            name,
            kcal: Math.round(kcal),
            protein: Math.round(protein * 10) / 10,
            ...(proteinIn === null ? { proteinKnown: false } : {}),
          });
        },
      },
    },
    field({ id: 'food-name', label: 'Was', placeholder: 'z. B. Kantine Menü 1' }),
    field({ id: 'food-kcal', label: 'kcal', inputmode: 'numeric', required: true }),
    field({ id: 'food-protein', label: 'Protein g', inputmode: 'numeric' }),
    h('button', { class: 'btn', type: 'submit', id: 'food-add' }, 'Hinzufügen'),
  );
  const handMethod = h(
    'details',
    { class: 'hand-method', id: 'hand-method' },
    h('summary', {}, 'Portionen ohne Waage schätzen (Hand-Methode)'),
    h(
      'ul',
      { class: 'small' },
      h('li', {}, h('strong', {}, 'Handfläche'), ' (ohne Finger, so dick wie die Hand): Fleisch, Fisch, Tofu ≈ 100–120 g, 25–30 g Protein'),
      h('li', {}, h('strong', {}, 'Faust'), ': Teigwaren, Reis, Kartoffeln gekocht ≈ 150–200 g, 200–250 kcal'),
      h('li', {}, h('strong', {}, 'Zwei offene Hände'), ': Gemüse oder Salat ≈ 1 Portion (120 g)'),
      h('li', {}, h('strong', {}, 'Daumen'), ': Butter, Öl, Nussmus ≈ 1 EL, 90–100 kcal'),
      h('li', {}, h('strong', {}, 'Hohle Hand'), ': Nüsse ≈ 25–30 g, 170 kcal'),
    ),
  );

  // Zuerst, was heute gegessen wurde (ohne Scrollen), darunter die Erfassung.
  const eaten = h(
    'section',
    { class: 'card', 'aria-labelledby': 'n-h', id: 'eaten-card' },
    h(
      'div',
      { class: 'card-head' },
      h('h2', { id: 'n-h' }, 'Heute gegessen'),
      h(
        'button',
        {
          type: 'button',
          class: 'btn small-btn',
          id: 'jump-capture',
          on: { click: () => document.getElementById('capture-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) },
        },
        '+ Erfassen',
      ),
    ),
    statusList(ctx, snap),
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
    food.length ? entryList(ctx, food) : h('p', { class: 'muted small' }, 'Noch nichts erfasst.'),
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
    h(
      'details',
      {
        class: 'forgotten',
        id: 'forgotten',
        open: !snap.day.complete && food.length > 0 && ctx.date === ctx.today && new Date().getHours() >= 19,
      },
      h('summary', {}, 'Vor dem Abschliessen: oft vergessen'),
      h(
        'ul',
        { class: 'small' },
        h('li', {}, 'Öl, Butter oder Rahm beim Kochen (1 EL Öl = 90 kcal)'),
        h('li', {}, 'Saucen, Dressing, Mayonnaise'),
        h('li', {}, 'Getränke: Süssgetränke, Saft, Milch im Kaffee, Alkohol'),
        h('li', {}, 'Probieren beim Kochen, Reste der Kinder, Snacks zwischendurch'),
        h('li', {}, 'Zweite Portion und Brot zur Suppe'),
      ),
      h(
        'p',
        { class: 'hint' },
        'Protokolle unterschätzen die Zufuhr typischerweise um 20–40 %. Die App gleicht das über deinen Gewichtsverlauf teilweise aus.',
      ),
    ),
  );
  const captureCard = h(
    'section',
    { class: 'card', 'aria-labelledby': 'cap-h', id: 'capture-card' },
    h('h2', { id: 'cap-h' }, 'Erfassen'),
    photoBlock(ctx, snap),
    foodSearchBlock(ctx),
    recent.length
      ? [
          h('p', { class: 'eyebrow' }, 'Zuletzt gegessen'),
          h(
            'div',
            { class: 'chips' },
            ...recent.map((f, i) =>
              h(
                'button',
                { type: 'button', class: 'chip', id: `recent-${i}`, on: { click: () => repeat(ctx, f) } },
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
    handMethod,
  );
  return [eaten, captureCard];
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

/**
 * Zyklus (nur bei weiblich mit natürlichem Zyklus oder hormoneller Verhütung): Periode
 * eintragen, Zyklustag, geschätzte Phase und ein passender Hinweis.
 * @param {Ctx} ctx
 * @param {NonNullable<Ctx['snap']>} snap
 */
function cycleCard(ctx, snap) {
  const st = snap.profile.cycleStatus;
  if (snap.profile.sex !== 'f' || (st !== 'natuerlich' && st !== 'hormonell')) return null;
  const natural = st === 'natuerlich';
  const on = Boolean(snap.day.period);
  const c = snap.cycle;
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'cyc-h', id: 'cycle-card' },
    h('h2', { id: 'cyc-h' }, 'Zyklus'),
    c
      ? h(
          'p',
          { id: 'cycle-day' },
          h('strong', {}, `Tag ${c.day}`),
          natural ? ` von ca. ${c.length} · ${c.label}` : ` seit der letzten Blutung`,
        )
      : h(
          'p',
          { class: 'small muted' },
          natural ? 'Noch kein Periodenbeginn eingetragen.' : 'Blutungstage eintragen, wenn du sie festhalten willst.',
        ),
    c && natural ? h('p', { class: 'small muted' }, `Nächste Periode etwa am ${fmtDate(c.nextStart)} (Schätzung).`) : null,
    c && natural ? h('p', { class: 'note info small', id: 'cycle-tip' }, PHASE_TIPS[c.phase]) : null,
    h(
      'button',
      {
        type: 'button',
        class: on ? 'btn primary' : 'btn',
        id: 'period-toggle',
        'aria-pressed': String(on),
        on: {
          click: () =>
            ctx.commit(
              (s) => {
                const d = { ...s.days[ctx.date] };
                if (on) delete d.period;
                else d.period = true;
                s.days[ctx.date] = d;
              },
              on ? 'Periodentag entfernt' : natural ? 'Periodentag eingetragen' : 'Blutung eingetragen',
            ),
        },
      },
      on ? (natural ? '✓ Periode heute' : '✓ Blutung heute') : natural ? 'Periode heute' : 'Blutung heute',
    ),
    h('p', { class: 'hint' }, 'Bleibt auf dem Gerät, geht nicht an die KI. Schätzungen ersetzen keine Verhütung.'),
  );
}

/**
 * Intervallfasten: Phase jetzt, Fastendauer der Nacht, Proteinplan im Fenster.
 * Nur sichtbar, wenn im Profil ein Essensfenster gewählt ist.
 * @param {Ctx} ctx
 * @param {NonNullable<Ctx['snap']>} snap
 */
function fastingCard(ctx, snap) {
  const w = eatingWindow(snap.profile.eatStart, snap.profile.fastingWindowH);
  // In Schwangerschaft und Stillzeit kein Fasten
  if (!w || snap.noDeficit) return null;
  const food = snap.day.food ?? [];
  const prevFood = ctx.state.days[addDays(ctx.date, -1)]?.food ?? [];
  const now = new Date();
  const isToday = ctx.date === ctx.today;
  const status = isToday ? fastingStatus({ w, food, prevFood, nowMin: now.getHours() * 60 + now.getMinutes() }) : null;
  const night = overnightFastH(prevFood, food);
  const fastTarget = 24 - w.hours;
  const off = outsideWindow(food, w);
  const plan = proteinPlan(snap.protein.grams, w);
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'fast-h', id: 'fasting-card' },
    h('h2', { id: 'fast-h' }, `Essensfenster ${24 - w.hours}:${w.hours}`),
    h('p', { class: 'small muted' }, `Heute ${windowLabel(w)}`),
    status
      ? h('p', { class: `fast-status fast-${status.phase}`, id: 'fast-status' }, h('strong', {}, status.title), h('br', {}), status.detail)
      : null,
    status?.progress !== null && status?.progress !== undefined
      ? meter({ value: Math.round((status.sinceMin ?? 0) / 6) / 10, target: fastTarget, label: 'Fastenzeit', unit: 'h', over: 'good' })
      : null,
    h(
      'dl',
      { class: 'kv' },
      night !== null
        ? [
            h('dt', {}, 'Letzte Nacht gefastet'),
            h('dd', { id: 'fast-night' }, `${fmt(night, 1)} h`, night >= fastTarget ? ' ✓' : ` (Ziel ${fastTarget} h)`),
          ]
        : null,
      off.outside.length
        ? [
            h('dt', {}, 'Ausserhalb des Fensters'),
            h(
              'dd',
              { id: 'fast-outside' },
              `${off.outside.length} ${off.outside.length === 1 ? 'Mahlzeit' : 'Mahlzeiten'}, ${fmt(off.kcal)} kcal`,
            ),
          ]
        : null,
    ),
    h(
      'p',
      { class: 'small' },
      `Proteinplan: ${plan.portions} Portionen à ca. ${plan.gramsEach} g, z. B. um ${plan.times.join(', ')}. So erreichst du dein Proteinziel und schützt die Muskeln.`,
    ),
    h(
      'details',
      {},
      h('summary', {}, 'Was ist während des Fastens erlaubt?'),
      h(
        'ul',
        { class: 'small' },
        h('li', {}, 'Wasser, Mineralwasser, ungesüsster Tee, schwarzer Kaffee (Koffein-Grenze beachten).'),
        h('li', {}, `Ein Schluck Milch im Kaffee ist unproblematisch. Einträge bis ${SMALL_KCAL} kcal zählt die App nicht als Mahlzeit.`),
        h('li', {}, 'Lockere Läufe nüchtern sind kein Problem. Intervalle und lange Läufe besser im Fenster oder nach einer Mahlzeit.'),
        h('li', {}, 'Am Ende zählt die Tagesbilanz: Wer im Fenster alles nachholt, nimmt nicht ab.'),
      ),
    ),
  );
}

/** Eintrag, der gerade bearbeitet wird. */
let editingFoodId = '';
/** Eintrag, für den gerade eine andere Menge erneut erfasst wird. */
let amountFoodId = '';

/**
 * Uhrzeit für einen neuen Eintrag: heute die aktuelle Zeit, an einem früheren Tag Mittag
 * bzw. die Zeit des Originals.
 * @param {Ctx} ctx
 * @param {string} [fallback]
 */
function entryTimeFor(ctx, fallback = '12:00') {
  return ctx.date === ctx.today ? nowTime() : fallback;
}

/**
 * Eine weitere Portion desselben Lebensmittels erfassen (neuer Eintrag, neue ID).
 * @param {Ctx} ctx
 * @param {import('../store.js').FoodEntry} f
 * @param {number} [factor] Menge im Verhältnis zum Original
 */
export function repeat(ctx, f, factor = 1) {
  const fields = scaleEntry(repeatEntry(f, entryTimeFor(ctx, f.time)), factor);
  const amount = fields.grams ? `${fmt(fields.grams)} g, ` : '';
  amountFoodId = '';
  return ctx.commit(
    (s) => addFood(s, ctx.date, fields) !== null,
    `${f.name.replace(/ \(\d.*\)$|, \d+ (g|ml)$/, '')} erneut erfasst (${amount}${fmt(fields.kcal)} kcal)`,
  );
}

/**
 * Zuletzt erfasster Eintrag: zuerst des angezeigten Tages, sonst der jüngste frühere.
 * @param {Ctx} ctx
 * @returns {import('../store.js').FoodEntry | null}
 */
export function lastEntry(ctx) {
  const today = [...(ctx.state.days[ctx.date]?.food ?? [])].sort(byMoment);
  if (today.length) return today[today.length - 1];
  return recentFoods(ctx.state, ctx.date, 1)[0] ?? null;
}

/**
 * Chronologisch, bei gleicher Uhrzeit nach Erfassungszeitpunkt.
 * @param {import('../store.js').FoodEntry} a
 * @param {import('../store.js').FoodEntry} b
 */
function byMoment(a, b) {
  return a.time < b.time ? -1 : a.time > b.time ? 1 : (a.at ?? '').localeCompare(b.at ?? '');
}

/** Mahlzeiten nach Tageszeit. */
const MEAL_GROUPS = /** @type {const} */ ([
  ['10:30', 'Frühstück'],
  ['14:30', 'Mittagessen'],
  ['17:30', 'Zwischenmahlzeit'],
  ['24:00', 'Abendessen'],
]);

/**
 * Liste der Einträge, neueste zuerst und nach Mahlzeit gruppiert.
 * @param {Ctx} ctx
 * @param {import('../store.js').FoodEntry[]} food
 */
function entryList(ctx, food) {
  const dups = possibleDuplicates(food);
  // Neueste Mahlzeit oben (auch innerhalb der Gruppe)
  const sorted = [...food].sort(byMoment).reverse();
  const groupOf = (/** @type {string} */ t) => MEAL_GROUPS.find(([until]) => t < until)?.[1] ?? 'Abendessen';
  const multi = new Set(sorted.map((f) => groupOf(f.time))).size > 1;
  /** @type {HTMLElement[]} */
  const rows = [];
  let last = '';
  for (const f of sorted) {
    const g = groupOf(f.time);
    if (multi && g !== last) {
      const kcal = sorted.filter((x) => groupOf(x.time) === g).reduce((a, x) => a + x.kcal, 0);
      rows.push(h('li', { class: 'entry-group' }, h('span', {}, g), h('span', { class: 'entry-num' }, `${fmt(kcal)} kcal`)));
      last = g;
    }
    rows.push(foodRow(ctx, f, dups.has(f.id)));
  }
  return h('ul', { class: 'entries', id: 'food-entries' }, ...rows);
}

/**
 * Eine Mahlzeit: anzeigen, erneut erfassen, Menge ändern, bearbeiten oder löschen.
 * @param {Ctx} ctx
 * @param {import('../store.js').FoodEntry} f
 * @param {boolean} [suspect] mögliche Doppelbuchung
 */
function foodRow(ctx, f, suspect = false) {
  const remove = () =>
    ctx.commit((s) => void (s.days[ctx.date].food = (s.days[ctx.date].food ?? []).filter((x) => x.id !== f.id)), `${f.name} entfernt`);
  if (amountFoodId === f.id) return amountRow(ctx, f);
  if (editingFoodId !== f.id) {
    const w = ctx.snap ? eatingWindow(ctx.snap.profile.eatStart, ctx.snap.profile.fastingWindowH) : null;
    const outside = w !== null && f.kcal > SMALL_KCAL && !inWindow(f.time, w);
    const proteinText = f.proteinKnown === false ? '? g Protein' : `${fmt(f.protein, f.protein % 1 ? 1 : 0)} g Protein`;
    return h(
      'li',
      { class: suspect ? 'entry suspect' : 'entry', 'data-id': f.id },
      h('span', { class: 'entry-time' }, f.time),
      h(
        'span',
        { class: 'entry-name' },
        f.name,
        f.source === 'foto' || f.source === 'text' ? h('small', { class: 'muted' }, ' · geschätzt') : null,
        f.carbs === undefined || f.fat === undefined || f.proteinKnown === false
          ? h('small', { class: 'muted', title: 'Kohlenhydrate, Fett oder Protein unbekannt' }, ' · Nährwerte unvollständig')
          : null,
        outside ? h('small', { class: 'fast-tag' }, ' · ausserhalb Fenster') : null,
        f.trigger ? h('small', { class: 'muted' }, ` · ${TRIGGERS.find((t) => t[0] === f.trigger)?.[1] ?? ''}`) : null,
        suspect
          ? h(
              'span',
              { class: 'dup-flag', role: 'note' },
              'Mögliche Doppelbuchung: gleicher Eintrag kurz hintereinander. ',
              h(
                'button',
                {
                  type: 'button',
                  class: 'link-btn',
                  'aria-label': `${f.name} behalten, keine Doppelbuchung`,
                  on: {
                    click: () =>
                      ctx.commit((s) => {
                        const e = (s.days[ctx.date].food ?? []).find((x) => x.id === f.id);
                        if (!e) return false;
                        e.keep = true;
                        delete e.dupOf;
                        return true;
                      }, 'Beide Einträge bleiben'),
                  },
                },
                'Beide behalten',
              ),
            )
          : null,
      ),
      h('span', { class: 'entry-num' }, `${f.grams ? `${fmt(f.grams)} g · ` : ''}${fmt(f.kcal)} kcal · ${proteinText}`),
      h(
        'span',
        { class: 'entry-actions' },
        h(
          'button',
          {
            type: 'button',
            class: 'icon-btn repeat-icon',
            'aria-label': `${f.name} erneut erfassen`,
            title: 'Gleiche Portion nochmals erfassen',
            on: { click: () => repeat(ctx, f) },
          },
          '↻',
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'icon-btn',
            'aria-label': `${f.name} mit anderer Menge erneut erfassen`,
            title: 'Andere Menge erfassen',
            on: {
              click: () => {
                amountFoodId = f.id;
                editingFoodId = '';
                ctx.go('ernaehrung');
              },
            },
          },
          '±',
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'icon-btn',
            'aria-label': `${f.name} bearbeiten`,
            title: 'Bearbeiten',
            on: {
              click: () => {
                editingFoodId = f.id;
                amountFoodId = '';
                ctx.go('ernaehrung');
              },
            },
          },
          '✎',
        ),
        h(
          'button',
          { type: 'button', class: 'icon-btn', 'aria-label': `${f.name} entfernen`, title: 'Löschen', on: { click: remove } },
          '×',
        ),
      ),
    );
  }
  const unknownProtein = f.proteinKnown === false;
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
            const grams = f.grams ? num(fd, 'edit-grams') : null;
            const time = str(fd, 'edit-time');
            if (kcal === null || kcal < 0 || kcal > 5000) return ctx.toast('Bitte Kalorien zwischen 0 und 5000 eingeben.', 'error');
            if (protein !== null && (protein < 0 || protein > 300)) return ctx.toast('Protein muss zwischen 0 und 300 g liegen.', 'error');
            if (protein === null && !unknownProtein) return ctx.toast('Bitte Protein angeben (0 ist erlaubt).', 'error');
            if (f.grams && (grams === null || grams <= 0 || grams > 5000))
              return ctx.toast('Bitte eine Menge zwischen 1 und 5000 g eingeben.', 'error');
            editingFoodId = '';
            ctx.commit((s) => {
              const list = s.days[ctx.date].food ?? [];
              const i = list.findIndex((x) => x.id === f.id);
              if (i < 0) return false;
              // Menge geändert → alle Nährwerte im gleichen Verhältnis; sonst Kalorien als Massstab
              const gramsChanged = f.grams && grams !== null && Math.round(grams) !== f.grams;
              const factor = gramsChanged
                ? /** @type {number} */ (grams) / /** @type {number} */ (f.grams)
                : f.kcal > 0
                  ? kcal / f.kcal
                  : 1;
              /** @type {import('../store.js').FoodEntry} */
              const next = { ...scaleEntry(list[i], factor), id: f.id };
              if (gramsChanged) next.grams = Math.round(/** @type {number} */ (grams));
              if (!gramsChanged) next.kcal = Math.round(kcal);
              // Explizit geändertes Protein gilt; unverändertes wird mitskaliert
              const proteinTouched = protein !== null && (unknownProtein || Math.abs(protein - f.protein) > 0.05);
              if (proteinTouched) {
                next.protein = Math.round(/** @type {number} */ (protein) * 10) / 10;
                delete next.proteinKnown;
              }
              next.name = str(fd, 'edit-name') || next.name;
              next.time = /^\d{2}:\d{2}$/.test(time) ? time : f.time;
              const hunger = Number(str(fd, 'edit-hunger'));
              if (hunger === 1 || hunger === 2 || hunger === 3) next.hunger = hunger;
              else delete next.hunger;
              const trig = TRIGGERS.find((t) => t[0] === str(fd, 'edit-trigger'));
              if (trig) next.trigger = trig[0];
              else delete next.trigger;
              list[i] = next;
              return true;
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
      f.grams
        ? h(
            'div',
            { class: 'field' },
            h('label', { for: 'edit-grams' }, 'Menge g'),
            h('input', { id: 'edit-grams', name: 'edit-grams', inputmode: 'decimal', value: String(f.grams) }),
          )
        : null,
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
        h('input', {
          id: 'edit-protein',
          name: 'edit-protein',
          inputmode: 'decimal',
          value: unknownProtein ? '' : String(f.protein),
          placeholder: unknownProtein ? 'unbekannt' : '',
        }),
      ),
      select({
        id: 'edit-hunger',
        label: 'Hunger vorher',
        value: String(f.hunger ?? ''),
        options: [{ value: '', label: '–' }, ...HUNGER.map(([v, l]) => ({ value: String(v), label: l }))],
      }),
      select({
        id: 'edit-trigger',
        label: 'Grund',
        value: f.trigger ?? '',
        options: [{ value: '', label: '–' }, ...TRIGGERS.map(([v, l]) => ({ value: v, label: l }))],
      }),
      f.grams
        ? h(
            'p',
            { class: 'hint full' },
            'Neue Menge passt alle Nährwerte an. Ohne Mengenänderung passen sich die Nährwerte den Kalorien an.',
          )
        : null,
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

/** Portionsfaktoren für «andere Menge». */
const FACTORS = /** @type {const} */ ([
  [0.5, '½'],
  [0.75, '¾'],
  [1, '1×'],
  [1.5, '1½'],
  [2, '2×'],
]);

/**
 * Gleiches Lebensmittel mit anderer Menge erneut erfassen (der bestehende Eintrag bleibt).
 * @param {Ctx} ctx
 * @param {import('../store.js').FoodEntry} f
 */
function amountRow(ctx, f) {
  const preview = h('p', { class: 'small', id: 'amount-preview', 'aria-live': 'polite' });
  let factor = 1;
  const show = () => {
    const x = scaleEntry(f, factor);
    preview.textContent = `Neue Portion: ${x.grams ? `${fmt(x.grams)} g · ` : ''}${fmt(x.kcal)} kcal · ${fmt(x.protein, 1)} g Protein`;
  };
  show();
  const gramsInput = f.grams
    ? h('input', {
        id: 'amount-grams',
        name: 'amount-grams',
        inputmode: 'decimal',
        value: String(f.grams),
        'aria-label': 'Menge in Gramm',
        on: {
          input: (e) => {
            const g = Number(/** @type {HTMLInputElement} */ (e.target).value.replace(',', '.'));
            if (g > 0 && /** @type {number} */ (f.grams) > 0) factor = g / /** @type {number} */ (f.grams);
            show();
          },
        },
      })
    : null;
  return h(
    'li',
    { class: 'editing' },
    h(
      'form',
      {
        class: 'amount-form',
        on: {
          submit: (e) => {
            e.preventDefault();
            if (!(factor > 0 && factor <= 20)) return ctx.toast('Bitte eine gültige Menge wählen.', 'error');
            repeat(ctx, f, factor);
          },
        },
      },
      h('p', { class: 'small' }, h('strong', {}, f.name), ' nochmals erfassen, mit dieser Menge:'),
      h(
        'div',
        { class: 'segmented wrap', role: 'group', 'aria-label': 'Portion' },
        ...FACTORS.map(([v, label]) =>
          h(
            'button',
            {
              type: 'button',
              id: `amount-${String(v).replace('.', '-')}`,
              'aria-pressed': String(v === 1),
              on: {
                click: (e) => {
                  factor = v;
                  const btn = /** @type {HTMLElement} */ (e.currentTarget);
                  btn.parentElement?.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
                  if (gramsInput && f.grams) /** @type {HTMLInputElement} */ (gramsInput).value = String(Math.round(f.grams * v));
                  show();
                },
              },
            },
            label,
          ),
        ),
      ),
      gramsInput ? h('div', { class: 'with-suffix' }, gramsInput, h('span', { class: 'suffix' }, 'g')) : null,
      preview,
      h(
        'div',
        { class: 'btn-row' },
        h('button', { type: 'submit', class: 'btn primary', id: 'amount-save' }, 'Erfassen'),
        h(
          'button',
          {
            type: 'button',
            class: 'btn',
            on: {
              click: () => {
                amountFoodId = '';
                ctx.go('ernaehrung');
              },
            },
          },
          'Abbrechen',
        ),
      ),
    ),
  );
}
