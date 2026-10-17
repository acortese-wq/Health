// @ts-check
import { h, field, select, fmt, fmtDate, num, str } from '../ui/dom.js';
import { ACTIVITY_LEVELS } from '../domain/energy.js';
import { emptyState, exportCSV, exportJSON, importJSON } from '../store.js';
import { demoState } from '../demo.js';
import { isISODate } from '../domain/util.js';
import { getAiSettings, saveAiSettings, listModels, PROVIDERS } from '../vision.js';

/** @typedef {import('../app.js').Ctx} Ctx */
/** @typedef {import('../store.js').Profile} Profile */

let confirmDelete = false;

/** @param {Ctx} ctx */
export function viewProfile(ctx) {
  const p = ctx.state.profile;
  return h(
    'div',
    { class: 'stack' },
    p
      ? h('h1', {}, 'Profil und Ziele')
      : h(
          'div',
          { class: 'onboarding' },
          h('h1', {}, 'Willkommen im Gesundheitscockpit'),
          h(
            'p',
            { class: 'lead' },
            'Dein persönliches Cockpit für Gewicht, Ernährung, Training, Schlaf und Vorsorge. Es arbeitet evidenzbasiert und ohne Crash-Diät. Alle Daten bleiben auf diesem Gerät.',
          ),
          h(
            'div',
            { class: 'onboarding-actions' },
            h('a', { href: '#profil-form', class: 'btn primary' }, 'Mit eigenen Daten starten'),
            h(
              'button',
              {
                type: 'button',
                class: 'btn',
                id: 'load-demo',
                on: { click: () => ctx.replace(demoState(ctx.today), 'Beispieldaten geladen') },
              },
              'Erst mit Beispieldaten ansehen',
            ),
          ),
        ),
    profileForm(ctx, p),
    p ? visionCard(ctx) : null,
    dataCard(ctx),
    h(
      'section',
      { class: 'card', 'aria-labelledby': 'about-h' },
      h('h2', { id: 'about-h' }, 'Über diese App'),
      h(
        'p',
        { class: 'small' },
        'Die App ersetzt keine ärztliche Beratung. Alle Berechnungen beruhen auf publizierten Formeln und Leitlinien. Die Quellen findest du unter «Wissen». Bei Brustschmerz, Atemnot, Lähmungen oder Sprachstörungen wähle den Notruf 144.',
      ),
    ),
  );
}

/**
 * @param {Ctx} ctx
 * @param {Profile | null} p
 */
function profileForm(ctx, p) {
  const v = p ?? {
    name: '',
    sex: 'm',
    birthDate: '',
    heightCm: '',
    startDate: ctx.today,
    startWeightKg: '',
    goalWeightKg: '',
    goalDate: '',
    activity: 'mittel',
    proteinPerKg: 1.9,
    kcalOverride: null,
    stepsTarget: 9000,
    sleepTargetH: 7.5,
    waterTargetMl: 2000,
    bedtime: '22:30',
    caffeineHalfLifeH: 5,
    caffeineCutoffH: 8,
    caffeineMaxMg: 400,
    caffeineStartCups: 0,
    caffeineTargetCups: 4,
    caffeineTaperStart: ctx.today,
  };

  /** @param {SubmitEvent} e */
  const onSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
    /** @type {string[]} */
    const errors = [];
    /**
     * @param {string} name @param {string} label @param {number} lo @param {number} hi @param {number | null} [fallback]
     * @returns {number}
     */
    const need = (name, label, lo, hi, fallback = null) => {
      const x = num(fd, name) ?? fallback;
      if (x === null || x < lo || x > hi) {
        errors.push(`${label}: ${fmt(lo, lo % 1 ? 1 : 0)}–${fmt(hi, hi % 1 ? 1 : 0)}`);
        return lo;
      }
      return x;
    };
    /** @param {string} name @param {string} label */
    const day = (name, label) => {
      const x = str(fd, name);
      if (!isISODate(x)) errors.push(`${label}: Datum fehlt`);
      return x;
    };
    const kcalOverride = num(fd, 'p-kcal');
    /** @type {Profile} */
    const next = {
      name: str(fd, 'p-name'),
      sex: str(fd, 'p-sex') === 'f' ? 'f' : 'm',
      birthDate: day('p-birth', 'Geburtsdatum'),
      heightCm: need('p-height', 'Grösse (cm)', 120, 230),
      startDate: day('p-start', 'Startdatum'),
      startWeightKg: need('p-startkg', 'Startgewicht (kg)', 35, 300),
      goalWeightKg: need('p-goalkg', 'Zielgewicht (kg)', 35, 300),
      goalDate: day('p-goaldate', 'Zieldatum'),
      activity: str(fd, 'p-activity') || 'mittel',
      proteinPerKg: need('p-protein', 'Protein (g/kg)', 1.2, 2.4, 1.9),
      kcalOverride: kcalOverride === null ? null : need('p-kcal', 'Kalorienziel', 1200, 5000),
      stepsTarget: need('p-steps', 'Schrittziel', 2000, 30000, 9000),
      sleepTargetH: need('p-sleep', 'Schlafziel (h)', 5, 10, 7.5),
      waterTargetMl: need('p-water', 'Trinkziel (ml)', 1000, 5000, 2000),
      bedtime: str(fd, 'p-bed') || '22:30',
      caffeineHalfLifeH: need('p-cafhl', 'Koffein-Halbwertszeit (h)', 2, 10, 5),
      caffeineCutoffH: need('p-cafcut', 'Koffein-Abstand zum Schlaf (h)', 4, 12, 8),
      caffeineMaxMg: need('p-cafmax', 'Koffein-Obergrenze (mg)', 0, 600, 400),
      caffeineStartCups: need('p-cafstart', 'Tassen heute', 0, 20, 0),
      caffeineTargetCups: need('p-caftarget', 'Tassen Ziel', 0, 20, 4),
      caffeineTaperStart: str(fd, 'p-caftaper') || ctx.today,
    };
    if (!errors.length && next.goalDate <= next.startDate) errors.push('Zieldatum muss nach dem Startdatum liegen');
    if (!errors.length && next.birthDate >= next.startDate) errors.push('Geburtsdatum prüfen');
    if (errors.length) {
      const box = document.getElementById('profile-errors');
      if (box) {
        box.replaceChildren(h('strong', {}, 'Bitte prüfen:'), h('ul', {}, ...errors.map((x) => h('li', {}, x))));
        box.hidden = false;
        box.focus();
      }
      return;
    }
    const first = !ctx.state.profile;
    ctx.commit(
      (s) => {
        s.profile = next;
        if (first && !s.days[next.startDate]?.weightKg)
          s.days[next.startDate] = { ...s.days[next.startDate], weightKg: next.startWeightKg };
      },
      first ? 'Profil angelegt' : 'Profil gespeichert',
    );
    if (first) ctx.go('heute');
  };

  return h(
    'form',
    { class: 'card stack-sm', id: 'profil-form', on: { submit: /** @type {EventListener} */ (onSubmit) }, novalidate: true },
    h('h2', {}, p ? 'Persönliche Angaben' : 'Dein Profil'),
    h('div', { id: 'profile-errors', class: 'note warn', tabindex: '-1', role: 'alert', hidden: true }),
    h(
      'div',
      { class: 'form-grid' },
      field({ id: 'p-name', label: 'Vorname', value: v.name }),
      select({
        id: 'p-sex',
        label: 'Geschlecht (für Formeln)',
        value: v.sex,
        options: [
          { value: 'm', label: 'männlich' },
          { value: 'f', label: 'weiblich' },
        ],
      }),
      field({ id: 'p-birth', label: 'Geburtsdatum', type: 'date', value: v.birthDate, required: true }),
      field({ id: 'p-height', label: 'Grösse', inputmode: 'numeric', value: v.heightCm, suffix: 'cm', required: true }),
    ),
    h('h3', {}, 'Ziel'),
    h(
      'div',
      { class: 'form-grid' },
      field({ id: 'p-start', label: 'Startdatum', type: 'date', value: v.startDate, required: true }),
      field({ id: 'p-startkg', label: 'Startgewicht', inputmode: 'decimal', value: v.startWeightKg, suffix: 'kg', required: true }),
      field({ id: 'p-goalkg', label: 'Zielgewicht', inputmode: 'decimal', value: v.goalWeightKg, suffix: 'kg', required: true }),
      field({
        id: 'p-goaldate',
        label: 'Zieldatum',
        type: 'date',
        value: v.goalDate,
        required: true,
        hint: 'Die App begrenzt das Tempo auf höchstens 1 % des Körpergewichts pro Woche.',
      }),
      select({
        id: 'p-activity',
        label: 'Aktivität (Startschätzung)',
        value: v.activity,
        options: ACTIVITY_LEVELS.map((a) => ({ value: a.id, label: a.label })),
      }),
      field({
        id: 'p-protein',
        label: 'Protein',
        inputmode: 'decimal',
        value: v.proteinPerKg,
        suffix: 'g/kg',
        hint: '1.6–2.2 g pro kg Zielgewicht',
      }),
      field({
        id: 'p-kcal',
        label: 'Kalorienziel manuell (optional)',
        inputmode: 'numeric',
        value: v.kcalOverride ?? '',
        suffix: 'kcal',
        hint: 'Leer lassen, dann rechnet die App automatisch.',
      }),
    ),
    h('h3', {}, 'Alltag'),
    h(
      'div',
      { class: 'form-grid' },
      field({ id: 'p-steps', label: 'Schrittziel', inputmode: 'numeric', value: v.stepsTarget }),
      field({ id: 'p-sleep', label: 'Schlafziel', inputmode: 'decimal', value: v.sleepTargetH, suffix: 'h' }),
      field({
        id: 'p-water',
        label: 'Trinkziel (Getränke)',
        inputmode: 'numeric',
        value: v.waterTargetMl,
        suffix: 'ml',
        hint: 'Richtwert Männer ca. 2000 ml, Frauen ca. 1600 ml (EFSA)',
      }),
      field({ id: 'p-bed', label: 'Übliche Schlafenszeit', type: 'time', value: v.bedtime }),
    ),
    h('h3', {}, 'Koffein'),
    h(
      'div',
      { class: 'form-grid' },
      field({ id: 'p-cafstart', label: 'Tassen pro Tag aktuell', inputmode: 'numeric', value: v.caffeineStartCups }),
      field({
        id: 'p-caftarget',
        label: 'Tassen pro Tag Ziel',
        inputmode: 'numeric',
        value: v.caffeineTargetCups,
        hint: 'Eine Tasse weniger pro Woche',
      }),
      field({ id: 'p-caftaper', label: 'Ausschleichen ab', type: 'date', value: v.caffeineTaperStart }),
      field({ id: 'p-cafcut', label: 'Abstand letzte Tasse bis Schlaf', inputmode: 'decimal', value: v.caffeineCutoffH, suffix: 'h' }),
      field({
        id: 'p-cafhl',
        label: 'Halbwertszeit',
        inputmode: 'decimal',
        value: v.caffeineHalfLifeH,
        suffix: 'h',
        hint: 'Typisch 3–7 h',
      }),
      field({ id: 'p-cafmax', label: 'Obergrenze pro Tag', inputmode: 'numeric', value: v.caffeineMaxMg, suffix: 'mg' }),
    ),
    h('button', { class: 'btn primary', type: 'submit', id: 'profile-save' }, p ? 'Profil speichern' : 'Profil anlegen'),
  );
}

/** @param {Ctx} ctx */
function dataCard(ctx) {
  const json = () => exportJSON(ctx.state);
  /**
   * @param {string} name
   * @param {string} content
   * @param {string} type
   */
  const download = (name, content, type) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  /** @param {string} text */
  const doImport = (text) => {
    try {
      const next = importJSON(text);
      ctx.replace(next, 'Daten importiert');
    } catch (err) {
      ctx.toast(err instanceof Error ? err.message : 'Import fehlgeschlagen', 'error');
    }
  };
  const stamp = ctx.today;
  const markBackup = () => ctx.commit((s) => void (s.lastBackup = ctx.today));
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'data-h' },
    h('h2', { id: 'data-h' }, 'Daten'),
    ctx.state.lastBackup ? h('p', { class: 'small muted' }, `Letztes Backup: ${fmtDate(ctx.state.lastBackup)}`) : null,
    h(
      'p',
      { class: 'small' },
      'Deine Daten sind nur in diesem Browser auf diesem Gerät gespeichert. Es gibt keinen Server und kein Konto. Sichere sie regelmässig, zum Beispiel einmal pro Woche.',
    ),
    h(
      'div',
      { class: 'btn-row' },
      h(
        'button',
        {
          type: 'button',
          class: 'btn',
          id: 'export-json',
          on: {
            click: () => {
              // Erst markieren, damit das Backup selbst das Sicherungsdatum enthält.
              markBackup();
              download(`gesundheitscockpit-${stamp}.json`, json(), 'application/json');
            },
          },
        },
        'Backup herunterladen',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn',
          id: 'export-copy',
          on: {
            click: () => {
              navigator.clipboard?.writeText(json()).then(
                () => {
                  markBackup();
                  ctx.toast('Backup in die Zwischenablage kopiert');
                },
                () => ctx.toast('Kopieren nicht möglich. Bitte «Backup herunterladen» verwenden.', 'error'),
              ) ?? ctx.toast('Kopieren nicht möglich. Bitte «Backup herunterladen» verwenden.', 'error');
            },
          },
        },
        'Backup kopieren',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn',
          id: 'export-csv',
          on: { click: () => download(`gesundheitscockpit-${stamp}.csv`, '﻿' + exportCSV(ctx.state), 'text/csv;charset=utf-8') },
        },
        'Tageswerte als CSV (Excel)',
      ),
    ),
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'import-file' }, 'Backup einspielen (ersetzt die aktuellen Daten)'),
      h('input', {
        type: 'file',
        id: 'import-file',
        accept: 'application/json,.json',
        on: {
          change: async (e) => {
            const f = /** @type {HTMLInputElement} */ (e.target).files?.[0];
            if (f) doImport(await f.text());
          },
        },
      }),
    ),
    h(
      'details',
      {},
      h('summary', {}, 'Backup als Text einfügen'),
      h(
        'form',
        {
          class: 'stack-sm',
          on: {
            submit: (e) => {
              e.preventDefault();
              doImport(str(new FormData(/** @type {HTMLFormElement} */ (e.target)), 'import-text'));
            },
          },
        },
        h('label', { for: 'import-text', class: 'sr-only' }, 'Backup-Text'),
        h('textarea', { id: 'import-text', name: 'import-text', rows: '4' }),
        h('button', { class: 'btn', type: 'submit', id: 'import-text-go' }, 'Einspielen'),
      ),
    ),
    confirmDelete
      ? h(
          'div',
          { class: 'note alert stack-sm', role: 'alert' },
          h('strong', {}, 'Wirklich alle Daten auf diesem Gerät löschen?'),
          h('p', { class: 'small' }, 'Das lässt sich nicht rückgängig machen. Lade vorher ein Backup herunter.'),
          h(
            'div',
            { class: 'btn-row' },
            h(
              'button',
              {
                type: 'button',
                class: 'btn danger',
                id: 'delete-confirm',
                on: {
                  click: () => {
                    confirmDelete = false;
                    ctx.replace(emptyState(), 'Alle Daten gelöscht');
                  },
                },
              },
              'Ja, alles löschen',
            ),
            h(
              'button',
              {
                type: 'button',
                class: 'btn',
                id: 'delete-cancel',
                on: {
                  click: () => {
                    confirmDelete = false;
                    ctx.go('profil');
                  },
                },
              },
              'Abbrechen',
            ),
          ),
        )
      : h(
          'button',
          {
            type: 'button',
            class: 'btn danger-outline',
            id: 'delete-all',
            on: {
              click: () => {
                confirmDelete = true;
                ctx.go('profil');
              },
            },
          },
          ctx.state.demo ? 'Beispieldaten löschen' : 'Alle Daten löschen',
        ),
  );
}

/** Vom Anbieter geladene Modellnamen (nur für die laufende Sitzung). */
/** @type {Record<string, string[]>} */
const modelOptions = { anthropic: [], openai: [] };

/** @param {Ctx} ctx */
function visionCard(ctx) {
  const ai = getAiSettings();
  const p = ai.provider;
  const key = ai.keys[p];
  const meta = PROVIDERS[p];
  const options = modelOptions[p].includes(ai.models[p]) ? modelOptions[p] : [ai.models[p], ...modelOptions[p]];

  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'vision-h' },
    h('h2', { id: 'vision-h' }, 'KI-Erfassung'),
    h(
      'p',
      { class: 'small' },
      'Mahlzeiten fotografieren oder beschreiben und Nährwerttabellen lesen. Dafür braucht es einen eigenen API-Schlüssel, wahlweise von Anthropic (Claude) oder OpenAI (GPT), jeweils mit aufgeladenem Guthaben. Ein ChatGPT- oder Claude-Abo reicht nicht. Ein Foto kostet je nach Modell etwa 1–5 Rappen. Barcodes funktionieren auch ohne Schlüssel.',
    ),
    h(
      'ul',
      { class: 'small muted assumptions' },
      h(
        'li',
        {},
        'Das Foto wird verkleinert und direkt von diesem Gerät an den gewählten Anbieter gesendet, ohne Zwischenserver. Mitgeschickt wird nur dein restliches Tagesziel für den Tipp.',
      ),
      h('li', {}, 'Schlüssel bleiben nur auf diesem Gerät gespeichert und sind nie Teil eines Backups.'),
      h('li', {}, 'Setze beim Anbieter ein Ausgabenlimit für den Schlüssel, zum Beispiel 5 USD pro Monat.'),
    ),
    h(
      'form',
      {
        class: 'stack-sm',
        on: {
          submit: (e) => {
            e.preventDefault();
            const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
            const provider = str(fd, 'ai-provider') === 'openai' ? 'openai' : 'anthropic';
            const newKey = str(fd, 'api-key');
            const model = str(fd, 'ai-model') || PROVIDERS[provider].defaultModel;
            if (newKey && !PROVIDERS[provider].keyPattern.test(newKey)) {
              return ctx.toast(`Das sieht nicht wie ein ${provider === 'openai' ? 'OpenAI' : 'Anthropic'}-Schlüssel aus.`, 'error');
            }
            if (!/^[\w.:-]{2,80}$/.test(model)) return ctx.toast('Ungültiger Modellname.', 'error');
            const next = getAiSettings();
            next.provider = provider;
            next.models[provider] = model;
            if (newKey) next.keys[provider] = newKey;
            if (!saveAiSettings(next)) return ctx.toast('Speichern nicht möglich (Browser-Speicher gesperrt).', 'error');
            ctx.toast('KI-Einstellungen gespeichert');
            ctx.go('profil');
          },
        },
      },
      h(
        'div',
        { class: 'form-grid' },
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'ai-provider' }, 'Anbieter'),
          h(
            'select',
            {
              id: 'ai-provider',
              name: 'ai-provider',
              on: {
                change: (e) => {
                  const next = getAiSettings();
                  next.provider = /** @type {HTMLSelectElement} */ (e.target).value === 'openai' ? 'openai' : 'anthropic';
                  saveAiSettings(next);
                  ctx.go('profil');
                },
              },
            },
            ...Object.entries(PROVIDERS).map(([id, m]) => h('option', { value: id, selected: id === p }, m.label)),
          ),
        ),
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'ai-model' }, 'Modell'),
          h(
            'select',
            { id: 'ai-model', name: 'ai-model' },
            ...options.map((m) => h('option', { value: m, selected: m === ai.models[p] }, m)),
          ),
          h('p', { class: 'hint' }, `Standard: ${meta.defaultModel}. Das Modell muss Bilder verarbeiten können.`),
        ),
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'api-key' }, key ? `Schlüssel hinterlegt (…${key.slice(-4)})` : `API-Schlüssel (${meta.console})`),
          h('input', {
            id: 'api-key',
            name: 'api-key',
            type: 'password',
            autocomplete: 'off',
            spellcheck: 'false',
            placeholder: key ? 'Neuen Schlüssel eingeben zum Ersetzen' : p === 'openai' ? 'sk-…' : 'sk-ant-…',
          }),
        ),
      ),
      h(
        'div',
        { class: 'btn-row' },
        h('button', { class: 'btn primary', type: 'submit', id: 'api-key-save' }, 'Speichern'),
        key
          ? h(
              'button',
              {
                type: 'button',
                class: 'btn',
                id: 'ai-models-load',
                on: {
                  click: async () => {
                    try {
                      modelOptions[p] = await listModels(p, key);
                      ctx.toast(`${modelOptions[p].length} Modelle geladen`);
                    } catch {
                      ctx.toast('Modelle konnten nicht geladen werden. Schlüssel und Verbindung prüfen.', 'error');
                    }
                    ctx.go('profil');
                  },
                },
              },
              'Verfügbare Modelle laden',
            )
          : null,
        key
          ? h(
              'button',
              {
                type: 'button',
                class: 'btn',
                id: 'api-key-delete',
                on: {
                  click: () => {
                    const next = getAiSettings();
                    next.keys[p] = '';
                    saveAiSettings(next);
                    ctx.toast('Schlüssel entfernt');
                    ctx.go('profil');
                  },
                },
              },
              'Schlüssel entfernen',
            )
          : null,
      ),
    ),
  );
}
