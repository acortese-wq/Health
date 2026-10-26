// @ts-check
import { h, field, select, badge, fmt, fmtDate, num, str } from '../ui/dom.js';
import { TEMPLATES, RUN_TYPES, suggestNext, exerciseHistory, findExercise, weekSummary, weekPlan } from '../domain/training.js';
import { uid } from '../store.js';
import { addDays } from '../domain/util.js';
import { garminImportCard } from './garmin.js';

/** @typedef {import('../app.js').Ctx} Ctx */

let openTemplate = '';

/** @param {Ctx} ctx */
export function viewTraining(ctx) {
  const w = weekSummary(ctx.state.workouts, ctx.today);
  const prev = weekSummary(ctx.state.workouts, addDays(ctx.today, -7));
  const runOnly = ctx.state.profile?.trainingMode === 'laufen';
  const plan = weekPlan(runOnly ? 'laufen' : 'kombi');
  const runsPlanned = plan.filter(([, p]) => p.kind === 'run').length;
  return h(
    'div',
    { class: 'stack' },
    h('h1', {}, 'Training'),
    h('a', { href: '#garmin', class: 'btn', id: 'open-garmin' }, 'Garmin-Dashboard: Schritte, Schlaf, Ruhepuls, VO₂max'),
    h(
      'section',
      { class: 'summary', 'aria-label': 'Wochenbilanz' },
      runOnly
        ? weekStat('Läufe', `${w.runs} / ${runsPlanned}`, '', w.runs >= runsPlanned)
        : weekStat('Kraft', `${w.strengthDays} / 2`, 'Tage', w.strengthMet),
      weekStat('Ausdauer', `${fmt(w.equivalent)} / 150`, 'Min.', w.aerobicMet, 'intensiv zählt doppelt'),
      weekStat('Intervalle', w.intervalDone ? 'erledigt' : 'offen', '', w.intervalDone),
      runOnly
        ? weekStat('Vorwoche', `${prev.runs} Läufe`, '', prev.aerobicMet, `${fmt(prev.equivalent)} Min. Ausdauer`)
        : weekStat(
            'Vorwoche',
            `${prev.strengthDays} × Kraft`,
            '',
            prev.strengthMet && prev.aerobicMet,
            `${fmt(prev.equivalent)} Min. Ausdauer`,
          ),
    ),
    h(
      'section',
      { class: 'card', 'aria-labelledby': 'plan-h' },
      h('h2', { id: 'plan-h' }, runOnly ? 'Wochenplan: nur Laufen' : 'Wochenplan'),
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          {},
          h(
            'tbody',
            {},
            ...plan.map(([d, p]) =>
              h(
                'tr',
                {},
                h('th', { scope: 'row' }, d),
                h(
                  'td',
                  {},
                  p.runType === 'interval'
                    ? 'Intervalle: 10 Min. einlaufen, 4 × 4 Min. zügig / 3 Min. locker, auslaufen'
                    : `${p.title}, ${p.detail}`,
                ),
              ),
            ),
          ),
        ),
      ),
      h(
        'p',
        { class: 'muted small' },
        'Zone 2 heisst: Du kannst dabei noch ganze Sätze sprechen. Intervalle sind hart, aber kontrolliert, etwa 85–95 % der maximalen Herzfrequenz.',
      ),
      runOnly
        ? h(
            'p',
            { class: 'note info small', id: 'run-only-note' },
            'Ehrlicher Hinweis: Ohne Krafttraining verlierst du beim Abnehmen mehr Muskelmasse. Schon 2 × 15 Minuten pro Woche helfen, auch ohne Gym: Kniebeugen, Liegestütze an der Wand oder am Tisch, Ausfallschritte, Unterarmstütz. Umstellen kannst du jederzeit unter Profil → Training.',
          )
        : null,
    ),
    h(
      'div',
      { class: 'grid-2' },
      ...(runOnly ? [] : Object.entries(TEMPLATES).map(([id, t]) => strengthCard(ctx, id, t))),
      runCard(ctx),
      garminImportCard(ctx),
    ),
    historyCard(ctx),
  );
}

/**
 * @param {string} label
 * @param {string} value
 * @param {string} unit
 * @param {boolean} met
 * @param {string} [sub]
 */
function weekStat(label, value, unit, met, sub) {
  return h(
    'div',
    { class: `stat ${met ? 'pos' : ''}` },
    h('span', { class: 'stat-label' }, label),
    h('span', { class: 'stat-value' }, value, unit ? h('small', {}, ` ${unit}`) : null),
    h('span', { class: 'stat-sub' }, sub ?? (met ? 'Ziel erreicht' : 'diese Woche')),
  );
}

/**
 * @param {Ctx} ctx
 * @param {string} id
 * @param {typeof TEMPLATES[string]} t
 */
function strengthCard(ctx, id, t) {
  const open = openTemplate === id;
  const head = h(
    'div',
    { class: 'card-head' },
    h('h2', { id: `tpl-${id}-h` }, t.name),
    h(
      'button',
      {
        type: 'button',
        class: open ? 'btn' : 'btn primary',
        id: `tpl-${id}-toggle`,
        'aria-expanded': String(open),
        on: {
          click: () => {
            openTemplate = open ? '' : id;
            ctx.go('training');
          },
        },
      },
      open ? 'Schliessen' : 'Einheit erfassen',
    ),
  );
  if (!open) {
    return h(
      'section',
      { class: 'card', 'aria-labelledby': `tpl-${id}-h` },
      head,
      h(
        'ul',
        { class: 'ex-list' },
        ...t.exercises.map((ex) => {
          const sug = suggestNext(ex, exerciseHistory(ctx.state.workouts, ex.id));
          return h(
            'li',
            {},
            h('span', {}, ex.name),
            h('span', { class: 'muted' }, `${ex.sets} × ${ex.repMin}–${ex.repMax}${ex.timed ? ' s' : ''}`),
            h('span', { class: 'num' }, sug.kg === null ? 'neu' : ex.timed ? `${sug.reps} s` : `${fmt(sug.kg, 1)} kg`),
          );
        }),
      ),
    );
  }
  const form = h(
    'form',
    {
      class: 'stack-sm',
      on: {
        submit: (e) => {
          e.preventDefault();
          const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
          /** @type {import('../domain/training.js').SetLog[]} */
          const sets = [];
          for (const ex of t.exercises) {
            for (let i = 0; i < ex.sets; i++) {
              const reps = num(fd, `${ex.id}-${i}-reps`);
              const kg = ex.timed ? 0 : num(fd, `${ex.id}-${i}-kg`);
              if (reps !== null && reps > 0 && kg !== null && kg >= 0) sets.push({ ex: ex.id, kg, reps: Math.round(reps) });
            }
          }
          if (!sets.length) return ctx.toast('Bitte mindestens einen Satz mit Wiederholungen eintragen.', 'error');
          const date = str(fd, 'session-date') || ctx.today;
          openTemplate = '';
          ctx.commit((s) => void s.workouts.push({ id: uid(), date, kind: 'strength', template: id, sets }), `${t.name} gespeichert`);
        },
      },
    },
    field({ id: `session-date`, label: 'Datum', type: 'date', value: ctx.today, max: ctx.today }),
    ...t.exercises.map((ex) => {
      const sug = suggestNext(ex, exerciseHistory(ctx.state.workouts, ex.id));
      return h(
        'fieldset',
        { class: 'ex' },
        h('legend', {}, ex.name),
        h('p', { class: 'muted small' }, sug.reason, ' ', ex.cue),
        h(
          'div',
          { class: 'sets' },
          ...Array.from({ length: ex.sets }, (_, i) =>
            h(
              'div',
              { class: 'set-row' },
              h('span', { class: 'set-no' }, `Satz ${i + 1}`),
              ex.timed
                ? null
                : field({ id: `${ex.id}-${i}-kg`, label: 'kg', inputmode: 'decimal', value: sug.kg ?? '', placeholder: 'kg' }),
              field({
                id: `${ex.id}-${i}-reps`,
                label: ex.timed ? 'Sekunden' : 'Wdh.',
                inputmode: 'numeric',
                placeholder: String(sug.reps),
              }),
            ),
          ),
        ),
      );
    }),
    h(
      'p',
      { class: 'muted small' },
      'Höre jeden Satz auf, wenn noch 1–3 saubere Wiederholungen möglich wären. Bei Schmerzen statt Muskelbrennen brichst du die Übung ab.',
    ),
    h('button', { class: 'btn primary', type: 'submit', id: `tpl-${id}-save` }, 'Einheit speichern'),
  );
  return h('section', { class: 'card wide', 'aria-labelledby': `tpl-${id}-h` }, head, form);
}

/** @param {Ctx} ctx */
function runCard(ctx) {
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'run-h' },
    h('h2', { id: 'run-h' }, 'Lauf erfassen'),
    h(
      'form',
      {
        class: 'form-grid',
        on: {
          submit: (e) => {
            e.preventDefault();
            const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
            const minutes = num(fd, 'run-min');
            const km = num(fd, 'run-km');
            const avgHr = num(fd, 'run-hr');
            const runType = /** @type {'z2' | 'interval' | 'long'} */ (str(fd, 'run-type'));
            if (minutes === null || minutes <= 0 || minutes > 600) return ctx.toast('Bitte die Dauer in Minuten eingeben.', 'error');
            const date = str(fd, 'run-date') || ctx.today;
            ctx.commit(
              (s) =>
                void s.workouts.push({
                  id: uid(),
                  date,
                  kind: 'run',
                  runType,
                  minutes: Math.round(minutes),
                  ...(km !== null && km > 0 ? { km } : {}),
                  ...(avgHr !== null && avgHr > 0 ? { avgHr: Math.round(avgHr) } : {}),
                }),
              'Lauf gespeichert',
            );
          },
        },
      },
      field({ id: 'run-date', label: 'Datum', type: 'date', value: ctx.today, max: ctx.today }),
      select({
        id: 'run-type',
        label: 'Art',
        value: 'z2',
        options: Object.entries(RUN_TYPES).map(([value, r]) => ({ value, label: r.label })),
      }),
      field({ id: 'run-min', label: 'Dauer', inputmode: 'numeric', suffix: 'Min.', required: true }),
      field({ id: 'run-km', label: 'Distanz', inputmode: 'decimal', suffix: 'km' }),
      field({ id: 'run-hr', label: 'Ø Puls', inputmode: 'numeric', suffix: '/min' }),
      h('button', { class: 'btn primary', type: 'submit', id: 'run-save' }, 'Lauf speichern'),
    ),
  );
}

/** @param {Ctx} ctx */
function historyCard(ctx) {
  const list = [...ctx.state.workouts].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 15);
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'hist-h' },
    h('h2', { id: 'hist-h' }, 'Letzte Einheiten'),
    list.length
      ? h(
          'ul',
          { class: 'entries' },
          ...list.map((w) =>
            h(
              'li',
              {},
              h('span', { class: 'entry-time' }, fmtDate(w.date, 'dm')),
              h(
                'span',
                { class: 'entry-name' },
                w.kind === 'strength' ? (TEMPLATES[w.template]?.name ?? 'Kraft') : RUN_TYPES[w.runType].label,
                w.kind === 'run' && w.runType === 'interval' ? badge('info', 'intensiv') : null,
              ),
              h(
                'span',
                { class: 'entry-num' },
                w.kind === 'strength'
                  ? `${new Set(w.sets.map((x) => x.ex)).size} Übungen · ${fmt(w.sets.reduce((a, x) => a + (findExercise(x.ex)?.timed ? 0 : x.kg * x.reps), 0))} kg Volumen`
                  : `${fmt(w.minutes)} Min.${w.km ? ` · ${fmt(w.km, 1)} km` : ''}${w.km && w.minutes ? ` · ${pace(w.minutes, w.km)}/km` : ''}`,
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: 'icon-btn',
                  'aria-label': 'Einheit löschen',
                  on: { click: () => ctx.commit((s) => void (s.workouts = s.workouts.filter((x) => x.id !== w.id)), 'Einheit gelöscht') },
                },
                '×',
              ),
            ),
          ),
        )
      : h('p', { class: 'empty' }, 'Noch keine Einheiten. Starte mit Kraft A am Montag.'),
  );
}

/**
 * @param {number} minutes
 * @param {number} km
 */
function pace(minutes, km) {
  const p = minutes / km;
  const m = Math.floor(p);
  const sec = Math.round((p - m) * 60);
  return sec === 60 ? `${m + 1}:00` : `${m}:${String(sec).padStart(2, '0')}`;
}
