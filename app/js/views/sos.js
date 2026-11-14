// @ts-check
// Heisshunger-Notfall: vier Fragen (eine pro Bildschirm, grosse Knöpfe), dann ein Plan mit
// Timer, um die Welle abzuwarten, und am Schluss: Wie stark ist es jetzt? Geschafft?

import { h, fmt, nowTime } from '../ui/dom.js';
import { uid } from '../store.js';
import { QUESTIONS, cravingPlan, cravingStats, pickTips } from '../domain/craving.js';
import { CRAVING_TIPS } from '../data/cravingtips.js';
import { addDays } from '../domain/util.js';

/** @typedef {import('../app.js').Ctx} Ctx */
/** @typedef {import('../domain/craving.js').CravingAnswers} CravingAnswers */

/**
 * Ablauf (überlebt das Neuzeichnen, solange die App offen ist).
 * @type {{ step: number, answers: Partial<CravingAnswers>, logId: string, date: string, timerEnd: number, timerDone: boolean, after: number | null, tips: import('../data/cravingtips.js').CravingTip[] }}
 */
const flow = { step: 0, answers: {}, logId: '', date: '', timerEnd: 0, timerDone: false, after: null, tips: [] };
let tick = 0;

function restart() {
  Object.assign(flow, { step: 0, answers: {}, logId: '', date: '', timerEnd: 0, timerDone: false, after: null, tips: [] });
  window.clearInterval(tick);
}

/**
 * Eintrag des laufenden Notfalls im Speicher ändern.
 * @param {Ctx} ctx
 * @param {(l: import('../domain/craving.js').CravingLog) => void} change
 * @param {string} [message]
 */
function updateLog(ctx, change, message) {
  ctx.commit((st) => {
    const l = (st.days[flow.date]?.cravings ?? []).find((x) => x.id === flow.logId);
    if (!l) return false;
    change(l);
    return true;
  }, message);
}

/** Gesehene Ideen (nur auf diesem Gerät, damit nicht immer dasselbe kommt). */
const SEEN_KEY = 'gesundheitscockpit.tipsSeen';

/**
 * Neue Ideen ziehen und als gesehen merken.
 * @param {string} trigger
 */
function drawTips(trigger) {
  /** @type {string[]} */
  let seen = [];
  try {
    seen = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]');
  } catch {
    seen = [];
  }
  const r = pickTips(CRAVING_TIPS, { seen: Array.isArray(seen) ? seen : [], trigger, hour: new Date().getHours() });
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(r.seen));
  } catch {
    // ohne Speicher wiederholen sich Ideen eher
  }
  flow.tips = r.tips;
}

const KIND_LABEL = /** @type {Record<string, string>} */ ({
  ablenkung: 'Ablenkung',
  bewegung: 'Bewegung',
  trinken: 'Trinken und Geniessen',
  kopf: 'Im Kopf',
  umgebung: 'Umgebung und Plan',
  fakt: 'Gut zu wissen',
});

/**
 * Wechselnde Ideen mit «Andere Ideen».
 * @param {Ctx} ctx
 */
function ideasBlock(ctx) {
  if (!flow.tips.length) drawTips(String(flow.answers.trigger ?? ''));
  return h(
    'div',
    { class: 'stack-sm sos-ideas', id: 'sos-ideas' },
    h('h3', { class: 'eyebrow' }, 'Ideen für jetzt'),
    h(
      'ul',
      { class: 'sos-idea-list' },
      ...flow.tips.map((t) =>
        h(
          'li',
          { class: `sos-idea idea-${t.kind}`, 'data-id': t.id },
          h('span', { class: 'idea-kind' }, KIND_LABEL[t.kind] ?? t.kind),
          h('span', { class: 'idea-text' }, t.text),
          t.ref ? h('small', { class: 'hint' }, t.ref) : null,
        ),
      ),
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'btn small-btn',
        id: 'sos-more-ideas',
        on: {
          click: () => {
            drawTips(String(flow.answers.trigger ?? ''));
            ctx.go('sos');
          },
        },
      },
      '↻ Andere Ideen',
    ),
  );
}

/**
 * Knopf zum Öffnen (auf «Heute» und im Coach).
 * @param {string} id
 */
export function sosButton(id) {
  return h('a', { href: '#sos', class: 'btn sos-btn', id }, 'Heisshunger? Notfall-Hilfe');
}

/** @param {Ctx} ctx */
export function viewSos(ctx) {
  if (flow.date && flow.date !== ctx.today) restart();
  const done = flow.step >= QUESTIONS.length;
  return h(
    'div',
    { class: 'stack sos-page' },
    h('h1', {}, 'Heisshunger-Notfall'),
    done ? planView(ctx) : questionView(ctx),
    statsLine(ctx),
  );
}

/** @param {Ctx} ctx */
function questionView(ctx) {
  const q = QUESTIONS[flow.step];
  /** @param {string} value */
  const answer = (value) => {
    if (q.id === 'lastMeal') flow.answers.lastMeal = /** @type {CravingAnswers['lastMeal']} */ (value);
    else if (q.id === 'apple') flow.answers.apple = value === 'ja';
    else if (q.id === 'trigger') flow.answers.trigger = /** @type {CravingAnswers['trigger']} */ (value);
    else flow.answers.intensity = Number(value);
    flow.step++;
    if (flow.step < QUESTIONS.length) return ctx.go('sos');
    // Fertig: Moment speichern (für die Muster und die Bilanz)
    const id = uid();
    Object.assign(flow, { logId: id, date: ctx.today });
    ctx.commit((st) => {
      const d = (st.days[ctx.today] = st.days[ctx.today] ?? {});
      d.cravings = [
        ...(d.cravings ?? []),
        {
          id,
          time: nowTime(),
          trigger: /** @type {CravingAnswers['trigger']} */ (flow.answers.trigger),
          intensity: /** @type {number} */ (flow.answers.intensity),
        },
      ];
      return true;
    });
  };
  // Hinweis zur letzten Mahlzeit aus dem Protokoll
  const last = [...(ctx.state.days[ctx.today]?.food ?? [])].filter((f) => f.kcal >= 150).sort((a, b) => (a.time < b.time ? 1 : -1))[0];
  return h(
    'section',
    { class: 'card stack-sm sos-q', 'aria-labelledby': 'sos-q-h', id: 'sos-question' },
    h('p', { class: 'eyebrow', id: 'sos-progress' }, `Frage ${flow.step + 1} von ${QUESTIONS.length}`),
    h('h2', { id: 'sos-q-h' }, q.text),
    q.id === 'lastMeal' && last ? h('p', { class: 'small muted' }, `Letzte Mahlzeit im Protokoll: ${last.time} (${last.name}).`) : null,
    q.id === 'intensity'
      ? h(
          'div',
          { class: 'sos-scale', role: 'group', 'aria-label': 'Stärke von 1 (kaum) bis 10 (unerträglich)' },
          ...Array.from({ length: 10 }, (_, i) =>
            h(
              'button',
              { type: 'button', class: 'btn sos-num', id: `sos-int-${i + 1}`, on: { click: () => answer(String(i + 1)) } },
              String(i + 1),
            ),
          ),
          h('p', { class: 'small muted sos-scale-legend' }, h('span', {}, '1 = kaum'), h('span', {}, '10 = unerträglich')),
        )
      : h(
          'div',
          { class: 'sos-options' },
          ...q.options.map(([value, label]) =>
            h('button', { type: 'button', class: 'btn sos-opt', id: `sos-${q.id}-${value}`, on: { click: () => answer(value) } }, label),
          ),
        ),
    flow.step > 0
      ? h(
          'button',
          {
            type: 'button',
            class: 'link-btn',
            id: 'sos-back',
            on: {
              click: () => {
                flow.step--;
                ctx.go('sos');
              },
            },
          },
          '‹ Zurück',
        )
      : null,
  );
}

/** @param {Ctx} ctx */
function planView(ctx) {
  const a = /** @type {CravingAnswers} */ (flow.answers);
  const snap = ctx.snap;
  const plan = cravingPlan(a, { kcalLeft: snap ? snap.kcalTarget - snap.kcal : 500, hour: new Date().getHours() });
  const remaining = Math.max(0, flow.timerEnd - Date.now());
  const running = flow.timerEnd > 0 && remaining > 0 && !flow.timerDone;
  const timerOver = flow.timerDone || (flow.timerEnd > 0 && remaining === 0);
  if (running) {
    window.clearInterval(tick);
    tick = window.setInterval(() => {
      const el = document.getElementById('sos-timer');
      if (!el) return window.clearInterval(tick);
      const left = Math.max(0, flow.timerEnd - Date.now());
      el.textContent = mmss(left);
      if (left === 0) {
        window.clearInterval(tick);
        flow.timerDone = true;
        ctx.go('sos');
      }
    }, 1000);
  }
  const outcome = h(
    'div',
    { class: 'btn-row', id: 'sos-outcome' },
    h(
      'button',
      {
        type: 'button',
        class: 'btn primary',
        id: 'sos-done',
        on: {
          click: () => {
            updateLog(ctx, (l) => void (l.outcome = 'geschafft'), 'Stark! Welle überstanden.');
            restart();
            ctx.go('heute');
          },
        },
      },
      plan.kind === 'hunger' ? 'Gegessen, alles gut' : 'Geschafft, ohne zu essen',
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'btn',
        id: 'sos-ate',
        on: {
          click: () => {
            updateLog(ctx, (l) => void (l.outcome = 'bewusst'), 'Bewusst gegessen ist kein Rückfall. Gleich erfassen.');
            restart();
            ctx.go('ernaehrung/erfassen');
          },
        },
      },
      'Ich esse bewusst etwas → erfassen',
    ),
  );
  return h(
    'section',
    { class: `card stack-sm sos-plan sos-${plan.kind}`, 'aria-labelledby': 'sos-plan-h', id: 'sos-plan' },
    h('h2', { id: 'sos-plan-h' }, plan.title),
    h('p', {}, plan.lead),
    h('ol', { class: 'sos-steps' }, ...plan.steps.map((s) => h('li', {}, s))),
    ideasBlock(ctx),
    plan.snacks.length
      ? h(
          'div',
          { class: 'stack-sm' },
          h('h3', { class: 'eyebrow' }, 'Gute Wahl jetzt'),
          h('ul', { class: 'small', id: 'sos-snacks' }, ...plan.snacks.map((s) => h('li', {}, s))),
        )
      : null,
    plan.timerMin && !flow.timerEnd
      ? h(
          'button',
          {
            type: 'button',
            class: 'btn primary sos-timer-btn',
            id: 'sos-timer-start',
            on: {
              click: () => {
                flow.timerEnd = Date.now() + plan.timerMin * 60000;
                ctx.go('sos');
                window.setTimeout(() => document.getElementById('sos-timer')?.scrollIntoView({ block: 'center' }), 0);
              },
            },
          },
          `Welle abwarten: ${plan.timerMin}-Minuten-Timer starten`,
        )
      : null,
    running
      ? h(
          'div',
          { class: 'sos-timer', role: 'timer', 'aria-live': 'off' },
          h('strong', { id: 'sos-timer' }, mmss(remaining)),
          h('span', { class: 'small muted' }, 'Bleib dran. Das Verlangen ist am Abklingen, auch wenn es sich nicht so anfühlt.'),
          h(
            'button',
            {
              type: 'button',
              class: 'link-btn',
              id: 'sos-timer-skip',
              on: {
                click: () => {
                  flow.timerDone = true;
                  ctx.go('sos');
                },
              },
            },
            'Timer beenden',
          ),
        )
      : null,
    timerOver && flow.after === null
      ? h(
          'div',
          { class: 'stack-sm', id: 'sos-after' },
          h('h3', {}, 'Wie stark ist das Verlangen jetzt?'),
          h(
            'div',
            { class: 'sos-scale' },
            ...Array.from({ length: 10 }, (_, i) =>
              h(
                'button',
                {
                  type: 'button',
                  class: 'btn sos-num',
                  id: `sos-after-${i + 1}`,
                  on: {
                    click: () => {
                      flow.after = i + 1;
                      updateLog(ctx, (l) => void (l.after = i + 1));
                      ctx.go('sos');
                    },
                  },
                },
                String(i + 1),
              ),
            ),
          ),
        )
      : null,
    flow.after !== null
      ? h(
          'p',
          { class: 'note small', id: 'sos-drop' },
          flow.after < a.intensity
            ? `Von ${a.intensity} auf ${flow.after}: Die Welle ist abgeflacht. Genau so funktioniert es.`
            : 'Noch gleich stark? Das ist normal. Noch einmal 10 Minuten oder bewusst eine kleine Portion, beides ist in Ordnung.',
        )
      : null,
    plan.kind === 'hunger' || flow.after !== null || timerOver || !plan.timerMin ? outcome : null,
    h('p', { class: 'hint' }, `Belege: ${plan.refs.join('; ')}.`),
    h(
      'button',
      {
        type: 'button',
        class: 'link-btn',
        id: 'sos-restart',
        on: {
          click: () => {
            restart();
            ctx.go('sos');
          },
        },
      },
      'Neu beginnen',
    ),
  );
}

/** @param {number} ms */
function mmss(ms) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** @param {Ctx} ctx */
function statsLine(ctx) {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(ctx.today, -i));
  const s = cravingStats(dates, ctx.state.days);
  if (!s.n) return h('p', { class: 'hint' }, 'Tipp: Den Knopf früh drücken, wenn das Verlangen beginnt, nicht erst vor dem Kühlschrank.');
  return h(
    'p',
    { class: 'small', id: 'sos-stats' },
    `Letzte 7 Tage: ${s.n} ${s.n === 1 ? 'Heisshunger-Moment' : 'Heisshunger-Momente'}, ${s.done} ohne Essen überstanden`,
    s.avgDrop !== null ? `, Verlangen im Schnitt um ${fmt(s.avgDrop, 1)} Punkte gesunken.` : '.',
  );
}
