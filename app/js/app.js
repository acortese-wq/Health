// @ts-check
// App-Schale: Zustand, Navigation, Speichern, Rückmeldungen.

import { h, s } from './ui/dom.js';
import { load, save, safeStorage } from './store.js';
import { snapshot } from './model.js';
import { addDays, daysBetween, toISODate } from './domain/util.js';
import { shouldNudge } from './domain/hydration.js';
import { viewToday, viewNutrition } from './views/today.js';
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

/** Hauptbereiche (Tab-Leiste). Wissen und Profil sind über die Kopfzeile erreichbar. */
const ROUTES = [
  { id: 'heute', label: 'Heute', icon: 'M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 100 8 4 4 0 000-8z', render: viewToday, dated: true },
  { id: 'ernaehrung', label: 'Ernährung', icon: 'M7 3v8a3 3 0 006 0V3M10 3v18M17 3c-2 2-2 6 0 8v10', render: viewNutrition, dated: true },
  { id: 'fortschritt', label: 'Fortschritt', icon: 'M4 18l5-6 4 3 7-9', render: viewWeight, dated: false },
  { id: 'training', label: 'Training', icon: 'M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12', render: viewTraining, dated: false },
  { id: 'gesundheit', label: 'Gesundheit', icon: 'M3 12h4l2-5 4 10 2-5h6', render: viewHealth, dated: false },
];
const SECONDARY = [
  {
    id: 'wissen',
    label: 'Wissen',
    icon: 'M5 4h10a4 4 0 014 4v12H9a4 4 0 01-4-4zM5 16a4 4 0 014-4h10',
    render: viewKnowledge,
    dated: false,
  },
  { id: 'profil', label: 'Profil', icon: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 20a8 8 0 0116 0', render: viewProfile, dated: false },
];
/** Frühere Adressen weiter unterstützen (Lesezeichen, Home-Bildschirm). */
const ALIASES = /** @type {Record<string, string>} */ ({ gewicht: 'fortschritt' });

const root = /** @type {HTMLElement} */ (document.getElementById('app'));
const storage = safeStorage();
const loaded = load(storage);
let state = loaded.state;
let date = toISODate();
let lastFocusId = '';

// Rückmeldungen leben ausserhalb der neu gezeichneten Ansicht, damit sie nicht verschwinden.
const toastRegion = h('div', { id: 'toast', class: 'toast-region', role: 'status', 'aria-live': 'polite' });
document.body.append(toastRegion);

/**
 * @param {string} message
 * @param {'ok' | 'error'} [kind]
 * @param {(() => void) | null} [undo] Rückgängig-Aktion (5 Sekunden verfügbar)
 */
function toast(message, kind = 'ok', undo = null) {
  toastRegion.replaceChildren(
    h(
      'div',
      { class: `toast toast-${kind}` },
      h('span', {}, message),
      undo
        ? h(
            'button',
            {
              type: 'button',
              class: 'toast-undo',
              id: 'toast-undo',
              on: {
                click: () => {
                  toastRegion.replaceChildren();
                  undo();
                },
              },
            },
            'Rückgängig',
          )
        : null,
    ),
  );
  window.clearTimeout(Number(toastRegion.dataset.timer));
  toastRegion.dataset.timer = String(window.setTimeout(() => toastRegion.replaceChildren(), undo ? 5000 : 3200));
}

function currentRoute() {
  const raw = location.hash.replace('#', '');
  const id = ALIASES[raw] ?? raw;
  if (!state.profile) return SECONDARY[1];
  return [...ROUTES, ...SECONDARY].find((r) => r.id === id) ?? ROUTES[0];
}

/** @param {State} previous */
function undoTo(previous) {
  state = previous;
  persist();
  render();
  toast('Rückgängig gemacht');
}

// Ungespeicherte Eingaben überstehen das Neuzeichnen (z. B. wenn zwischendurch Wasser
// erfasst wird). Ausgenommen ist das Formular, das gerade abgeschickt wurde.
/** @type {Set<string>} */
let submittedIds = new Set();
document.addEventListener(
  'submit',
  (e) => {
    const form = /** @type {HTMLFormElement} */ (e.target);
    submittedIds = new Set([...form.elements].map((el) => /** @type {HTMLElement} */ (el).id).filter(Boolean));
  },
  true,
);

/** Nach Datums- oder Seitenwechsel gehören offene Eingaben nicht mehr zum Inhalt. */
let discardDirty = false;

/** @returns {Map<string, string>} */
function dirtyInputs() {
  const out = new Map();
  if (discardDirty) {
    discardDirty = false;
    return out;
  }
  for (const el of root.querySelectorAll('input[id], textarea[id]')) {
    const input = /** @type {HTMLInputElement | HTMLTextAreaElement} */ (el);
    if (input.type === 'file' || input.type === 'checkbox' || input.type === 'password') continue;
    if (input.value !== input.defaultValue && !submittedIds.has(input.id)) out.set(input.id, input.value);
  }
  return out;
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
      const previous = structuredClone(state);
      mutate(state);
      persist();
      render();
      if (message) toast(message, 'ok', () => undoTo(previous));
    },
    replace(next, message) {
      const previous = state;
      state = next;
      persist();
      render();
      if (message) toast(message, 'ok', () => undoTo(previous));
    },
    setDate(d) {
      date = d > today ? today : d;
      discardDirty = true;
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
    { class: 'tabs', 'aria-label': 'Hauptnavigation', hidden: !state.profile },
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
    h(
      'a',
      { class: 'brand', href: '#heute' },
      h('span', { class: 'brand-mark', 'aria-hidden': 'true' }),
      h('span', {}, 'Gesundheitscockpit'),
    ),
    state.profile && route.dated ? dateNav(ctx) : null,
    state.profile
      ? h(
          'nav',
          { class: 'top-links', 'aria-label': 'Weitere Bereiche' },
          ...SECONDARY.map((r) =>
            h(
              'a',
              {
                href: `#${r.id}`,
                class: r === route ? 'top-link active' : 'top-link',
                'aria-current': r === route ? 'page' : undefined,
                id: `nav-${r.id}`,
              },
              s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', class: 'tab-icon' }, s('path', { d: r.icon })),
              h('span', {}, r.label),
            ),
          ),
        )
      : null,
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

  const dirty = dirtyInputs();
  submittedIds = new Set();
  const main = h('main', { id: 'main', class: `view view-${route.id}`, tabindex: '-1' }, ...banners, route.render(ctx));
  root.replaceChildren(header, main, nav);
  document.title = `${route.label} · Gesundheitscockpit`;
  for (const [id, value] of dirty) {
    const el = /** @type {HTMLInputElement | null} */ (document.getElementById(id));
    if (el && el.value === el.defaultValue) el.value = value;
  }

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
  discardDirty = true;
  render();
  window.scrollTo(0, 0);
  document.getElementById('main')?.focus({ preventScroll: true });
});
// Datumswechsel um Mitternacht: beim Zurückkehren in die App aktualisieren.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (date < toISODate() && date === addDays(toISODate(), -1)) {
    date = toISODate();
    render();
  }
  waterNudge();
});

/** Beim Öffnen an das Trinken erinnern, wenn man hinter dem Tagesplan liegt (höchstens alle 90 Min.). */
function waterNudge() {
  if (!state.profile || state.demo) return;
  const today = toISODate();
  const now = new Date();
  /** @type {number | null} */
  let last = null;
  try {
    last = Number(sessionStorage.getItem('cockpit.waterNudge')) || null;
  } catch {
    /* ohne Speicher: trotzdem erinnern */
  }
  const msg = shouldNudge({
    ml: state.days[today]?.waterMl ?? 0,
    target: state.profile.waterTargetMl,
    minutes: now.getHours() * 60 + now.getMinutes(),
    lastNudge: last,
    now: now.getTime(),
  });
  if (!msg) return;
  try {
    sessionStorage.setItem('cockpit.waterNudge', String(now.getTime()));
  } catch {
    /* ignorieren */
  }
  toast(`Trinken: ${msg}`);
}

// Diagramme an neue Breite anpassen (z. B. Drehen des Telefons), Eingaben nicht stören.
let resizeTimer = 0;
let lastWidth = window.innerWidth;
window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    if (Math.abs(window.innerWidth - lastWidth) < 40 || currentRoute().id !== 'fortschritt') return;
    lastWidth = window.innerWidth;
    render();
  }, 200);
});

render();
waterNudge();

// Browser bitten, die Daten nicht automatisch zu löschen (v. a. Safari nach 7 Tagen Inaktivität).
navigator.storage?.persist?.().catch(() => {
  /* nicht unterstützt: Backup-Erinnerung bleibt der Schutz */
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    /* Offline-Modus nicht verfügbar; App funktioniert trotzdem. */
  });
}
