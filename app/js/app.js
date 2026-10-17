// @ts-check
// App-Schale: Zustand, Navigation, Speichern, Rückmeldungen.

import { h, s } from './ui/dom.js';
import { load, save, safeStorage } from './store.js';
import { snapshot } from './model.js';
import { addDays, daysBetween, toISODate } from './domain/util.js';
import { viewToday } from './views/today.js';
import { viewWeight } from './views/weight.js';
import { viewTraining } from './views/training.js';
import { viewHealth } from './views/health.js';
import { viewKnowledge } from './views/knowledge.js';
import { viewProfile } from './views/profile.js';

/** @typedef {import('./store.js').State} State */
/** @typedef {ReturnType<typeof snapshot>} Snapshot */
/**
 * @typedef {{
 *   state: State,
 *   date: string,
 *   today: string,
 *   snap: Snapshot | null,
 *   commit: (mutate: (s: State) => void, message?: string) => void,
 *   replace: (s: State, message?: string) => void,
 *   setDate: (d: string) => void,
 *   go: (route: string) => void,
 *   toast: (message: string, kind?: 'ok' | 'error') => void,
 *   persistent: boolean,
 * }} Ctx
 */

const ROUTES = [
  { id: 'heute', label: 'Heute', icon: 'M4 12h16M12 4v16', render: viewToday },
  { id: 'gewicht', label: 'Gewicht', icon: 'M4 18l5-6 4 3 7-9', render: viewWeight },
  { id: 'training', label: 'Training', icon: 'M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12', render: viewTraining },
  { id: 'gesundheit', label: 'Gesundheit', icon: 'M3 12h4l2-5 4 10 2-5h6', render: viewHealth },
  { id: 'wissen', label: 'Wissen', icon: 'M5 4h10a4 4 0 014 4v12H9a4 4 0 01-4-4zM5 16a4 4 0 014-4h10', render: viewKnowledge },
  { id: 'profil', label: 'Profil', icon: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 20a8 8 0 0116 0', render: viewProfile },
];

const root = /** @type {HTMLElement} */ (document.getElementById('app'));
const storage = safeStorage();
const loaded = load(storage);
let state = loaded.state;
let date = toISODate();
let lastFocusId = '';

/** @param {string} message @param {'ok' | 'error'} [kind] */
function toast(message, kind = 'ok') {
  const region = document.getElementById('toast');
  if (!region) return;
  region.textContent = '';
  region.append(h('div', { class: `toast toast-${kind}` }, message));
  window.clearTimeout(Number(region.dataset.timer));
  region.dataset.timer = String(window.setTimeout(() => (region.textContent = ''), 3200));
}

function currentRoute() {
  const id = location.hash.replace('#', '');
  if (!state.profile) return ROUTES[5];
  return ROUTES.find((r) => r.id === id) ?? ROUTES[0];
}

function persist() {
  if (!save(state, storage)) toast('Speichern nicht möglich. Bitte regelmässig exportieren.', 'error');
}

function render() {
  const active = document.activeElement;
  lastFocusId = active instanceof HTMLElement && active.id ? active.id : '';
  const scrollY = window.scrollY;
  const route = currentRoute();
  const today = toISODate();
  /** @type {Ctx} */
  const ctx = {
    state,
    date,
    today,
    snap: state.profile ? snapshot(state, date) : null,
    commit(mutate, message) {
      mutate(state);
      persist();
      render();
      if (message) toast(message);
    },
    replace(next, message) {
      state = next;
      persist();
      render();
      if (message) toast(message);
    },
    setDate(d) {
      date = d > today ? today : d;
      render();
    },
    go(id) {
      if (location.hash === `#${id}`) render();
      else location.hash = id;
    },
    toast,
    persistent: Boolean(storage),
  };

  const nav = h(
    'nav',
    { class: 'tabs', 'aria-label': 'Hauptnavigation' },
    ...ROUTES.map((r) =>
      h(
        'a',
        { href: `#${r.id}`, class: r === route ? 'tab active' : 'tab', 'aria-current': r === route ? 'page' : undefined },
        s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', class: 'tab-icon' }, s('path', { d: r.icon })),
        h('span', {}, r.label),
      ),
    ),
  );
  const header = h(
    'header',
    { class: 'top' },
    h('div', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }), h('span', {}, 'Gesundheitscockpit')),
    state.profile && ['heute'].includes(route.id) ? dateNav(ctx) : null,
  );

  const banners = [];
  if (!storage)
    banners.push(
      h(
        'div',
        { class: 'banner banner-warn', role: 'status' },
        'Dieser Browser erlaubt kein dauerhaftes Speichern (z. B. privater Modus). Daten gehen beim Schliessen verloren.',
      ),
    );
  if (loaded.error)
    banners.push(
      h('div', { class: 'banner banner-alert', role: 'alert' }, `Gespeicherte Daten konnten nicht gelesen werden: ${loaded.error}`),
    );
  const dataDays = Object.keys(state.days).length;
  if (state.profile && !state.demo && dataDays >= 7 && (!state.lastBackup || daysBetween(state.lastBackup, today) > 14)) {
    banners.push(
      h(
        'div',
        { class: 'banner banner-warn', role: 'status' },
        state.lastBackup ? `Letztes Backup vor ${daysBetween(state.lastBackup, today)} Tagen. ` : 'Noch kein Backup vorhanden. ',
        h('a', { href: '#profil' }, 'Jetzt unter Profil → Daten sichern'),
        '. Die Daten liegen nur auf diesem Gerät.',
      ),
    );
  }
  if (state.demo) {
    banners.push(
      h(
        'div',
        { class: 'banner banner-info', role: 'status' },
        'Beispieldaten aktiv. Die Werte sind erfunden. Unter Profil → Daten kannst du sie löschen und mit deinen eigenen Werten starten.',
      ),
    );
  }

  const main = h('main', { id: 'main', class: `view view-${route.id}`, tabindex: '-1' }, ...banners, route.render(ctx));
  root.replaceChildren(header, main, nav, h('div', { id: 'toast', class: 'toast-region', role: 'status', 'aria-live': 'polite' }));
  document.title = `${route.label} · Gesundheitscockpit`;

  if (lastFocusId) document.getElementById(lastFocusId)?.focus({ preventScroll: true });
  window.scrollTo(0, scrollY);
}

/** @param {Ctx} ctx */
function dateNav(ctx) {
  const isToday = ctx.date === ctx.today;
  return h(
    'div',
    { class: 'date-nav' },
    h(
      'button',
      {
        type: 'button',
        class: 'icon-btn',
        id: 'date-prev',
        'aria-label': 'Vorheriger Tag',
        on: { click: () => ctx.setDate(addDays(ctx.date, -1)) },
      },
      '‹',
    ),
    h('input', {
      type: 'date',
      id: 'date-pick',
      value: ctx.date,
      max: ctx.today,
      'aria-label': 'Datum wählen',
      on: {
        change: (e) => {
          const v = /** @type {HTMLInputElement} */ (e.target).value;
          if (v) ctx.setDate(v);
        },
      },
    }),
    h(
      'button',
      {
        type: 'button',
        class: 'icon-btn',
        id: 'date-next',
        'aria-label': 'Nächster Tag',
        disabled: isToday,
        on: { click: () => ctx.setDate(addDays(ctx.date, 1)) },
      },
      '›',
    ),
    isToday
      ? null
      : h('button', { type: 'button', class: 'link-btn', id: 'date-today', on: { click: () => ctx.setDate(ctx.today) } }, 'Heute'),
  );
}

window.addEventListener('hashchange', () => {
  render();
  window.scrollTo(0, 0);
  document.getElementById('main')?.focus({ preventScroll: true });
});
// Datumswechsel um Mitternacht: beim Zurückkehren in die App aktualisieren.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && date < toISODate() && date === addDays(toISODate(), -1)) {
    date = toISODate();
    render();
  }
});

// Diagramme an neue Breite anpassen (z. B. Drehen des Telefons), Eingaben nicht stören.
let resizeTimer = 0;
let lastWidth = window.innerWidth;
window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    if (Math.abs(window.innerWidth - lastWidth) < 40 || currentRoute().id !== 'gewicht') return;
    lastWidth = window.innerWidth;
    render();
  }, 200);
});

render();

// Browser bitten, die Daten nicht automatisch zu löschen (v. a. Safari nach 7 Tagen Inaktivität).
navigator.storage?.persist?.().catch(() => {
  /* nicht unterstützt: Backup-Erinnerung bleibt der Schutz */
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    /* Offline-Modus nicht verfügbar; App funktioniert trotzdem. */
  });
}
