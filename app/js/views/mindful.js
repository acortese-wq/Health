// @ts-check
// Achtsamkeitsübungen bei Heisshunger: Übersicht (#achtsam) und geführter Ablauf (#achtsam/<id>)
// mit grossem Text, Schritt-Timer und automatischem Weiterschalten.

import { h } from '../ui/dom.js';
import { EXERCISES } from '../data/mindfulness.js';

/** @typedef {import('../app.js').Ctx} Ctx */

/** Laufender Ablauf (überlebt das Neuzeichnen). */
const run = { id: '', step: 0, endsAt: 0, paused: true, done: false };
let tick = 0;

/** @param {string} id */
function reset(id) {
  Object.assign(run, { id, step: 0, endsAt: 0, paused: true, done: false });
  window.clearInterval(tick);
}

/** @param {number} ms */
const secs = (ms) => `${Math.ceil(ms / 1000)} s`;

/** @param {Ctx} ctx */
export function viewMindful(ctx) {
  const ex = EXERCISES.find((e) => e.id === ctx.sub);
  return ex ? player(ctx, ex) : library();
}

function library() {
  return h(
    'div',
    { class: 'stack' },
    h('h1', {}, 'Achtsamkeit bei Heisshunger'),
    h(
      'p',
      { class: 'small' },
      'Kurze geführte Übungen, Schritt für Schritt. Am besten übst du sie auch an ruhigen Tagen, dann klappen sie im Ernstfall besser. Achtsamkeits-Training senkt nachweislich emotionales Essen und Essanfälle (Katterman 2014).',
    ),
    h(
      'ul',
      { class: 'mind-list', id: 'mind-list' },
      ...EXERCISES.map((e) =>
        h(
          'li',
          { class: 'card mind-item' },
          h('div', { class: 'card-head' }, h('h2', {}, e.title), h('span', { class: 'badge badge-info' }, `${e.minutes} Min.`)),
          h('p', { class: 'small' }, e.intro),
          h('a', { href: `#achtsam/${e.id}`, class: 'btn primary', id: `mind-open-${e.id}` }, 'Übung starten'),
        ),
      ),
    ),
    h('a', { href: '#sos', class: 'link-btn' }, '‹ Zum Heisshunger-Notfall'),
  );
}

/**
 * Geführte Übung.
 * @param {Ctx} ctx
 * @param {import('../data/mindfulness.js').MindExercise} ex
 */
function player(ctx, ex) {
  if (run.id !== ex.id) reset(ex.id);
  const step = ex.steps[run.step];
  const go = () => ctx.go(`achtsam/${ex.id}`);
  /** @param {number} i */
  const toStep = (i) => {
    if (i >= ex.steps.length) {
      run.done = true;
      run.paused = true;
      window.clearInterval(tick);
      navigator.vibrate?.(150);
      return go();
    }
    run.step = Math.max(0, i);
    run.endsAt = run.paused ? 0 : Date.now() + ex.steps[run.step].sec * 1000;
    navigator.vibrate?.(60);
    go();
  };
  if (!run.paused && !run.done) {
    window.clearInterval(tick);
    tick = window.setInterval(() => {
      const el = document.getElementById('mind-left');
      if (!el) return window.clearInterval(tick);
      const left = Math.max(0, run.endsAt - Date.now());
      el.textContent = secs(left);
      if (left === 0) {
        window.clearInterval(tick);
        toStep(run.step + 1);
      }
    }, 500);
  }
  if (run.done)
    return h(
      'div',
      { class: 'stack' },
      h(
        'section',
        { class: 'card stack-sm mind-done', id: 'mind-done' },
        h('h1', {}, 'Geschafft'),
        h('p', {}, `Du hast «${ex.title}» abgeschlossen. Spür kurz nach: Wie stark ist das Verlangen jetzt, verglichen mit vorher?`),
        h('p', { class: 'small muted' }, 'Jede Übung macht die nächste leichter. Das Gehirn lernt: Auf Verlangen muss nicht Essen folgen.'),
        h(
          'div',
          { class: 'btn-row' },
          h('a', { href: '#sos', class: 'btn primary', id: 'mind-back-sos' }, 'Zurück zum Notfall-Plan'),
          h(
            'button',
            {
              type: 'button',
              class: 'btn',
              id: 'mind-again',
              on: {
                click: () => {
                  reset(ex.id);
                  go();
                },
              },
            },
            'Nochmals',
          ),
          h('a', { href: '#achtsam', class: 'btn', id: 'mind-other' }, 'Andere Übung'),
        ),
      ),
    );
  const remaining = run.paused ? step.sec * 1000 : Math.max(0, run.endsAt - Date.now());
  return h(
    'div',
    { class: 'stack' },
    h('h1', {}, ex.title),
    h('p', { class: 'small muted' }, ex.intro),
    h(
      'section',
      { class: 'card stack-sm mind-player', 'aria-live': 'polite', id: 'mind-player' },
      h(
        'div',
        {
          class: 'mind-progress',
          role: 'progressbar',
          'aria-valuemin': '1',
          'aria-valuemax': String(ex.steps.length),
          'aria-valuenow': String(run.step + 1),
          'aria-label': 'Schritt',
        },
        ...ex.steps.map((_, i) => h('span', { class: i < run.step ? 'done' : i === run.step ? 'now' : '' })),
      ),
      h('p', { class: 'eyebrow', id: 'mind-step' }, `Schritt ${run.step + 1} von ${ex.steps.length}`),
      h('p', { class: 'mind-text', id: 'mind-text' }, step.text),
      h('p', { class: 'mind-time' }, h('span', { id: 'mind-left' }, secs(remaining)), run.paused ? ' · pausiert' : ''),
      h(
        'div',
        { class: 'btn-row mind-controls' },
        h(
          'button',
          { type: 'button', class: 'btn', id: 'mind-prev', disabled: run.step === 0, on: { click: () => toStep(run.step - 1) } },
          '‹ Zurück',
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'btn primary',
            id: 'mind-toggle',
            on: {
              click: () => {
                run.paused = !run.paused;
                run.endsAt = run.paused ? 0 : Date.now() + remaining;
                go();
              },
            },
          },
          run.paused ? (run.step === 0 && remaining === step.sec * 1000 ? '▶ Starten' : '▶ Weiter') : '❚❚ Pause',
        ),
        h(
          'button',
          { type: 'button', class: 'btn', id: 'mind-next', on: { click: () => toStep(run.step + 1) } },
          run.step === ex.steps.length - 1 ? 'Fertig' : 'Nächster ›',
        ),
      ),
      h('p', { class: 'hint' }, 'Mit «Starten» geht es automatisch weiter. Du kannst jederzeit selbst weiterschalten.'),
    ),
    h('p', { class: 'hint' }, `Grundlage: ${ex.ref}.`),
    h('a', { href: '#achtsam', class: 'link-btn', id: 'mind-all' }, '‹ Alle Übungen'),
  );
}
