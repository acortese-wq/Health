// @ts-check
import { h, field, select, fmt, fmtDate, num, str } from '../ui/dom.js';
import { ACTIVITY_LEVELS } from '../domain/energy.js';
import { emptyState, exportCSV, exportJSON, importJSON, safeStorage } from '../store.js';
import { listSnapshots, restoreSnapshot } from '../safety.js';
import { demoState } from '../demo.js';
import { isISODate } from '../domain/util.js';
import { FASTING_OPTIONS, FASTING_CAUTION } from '../domain/fasting.js';
import { CYCLE_OPTIONS } from '../domain/cycle.js';
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
            showcaseButton(ctx),
          ),
        ),
    p
      ? h(
          'section',
          { class: 'card', 'aria-labelledby': 'showcase-h', id: 'showcase-card' },
          h('h2', { id: 'showcase-h' }, 'Jemandem zeigen'),
          h(
            'p',
            { class: 'small' },
            'Ein erfundenes Beispieljahr: Marco, 175 cm, von 97 auf 80 kg in 12 Monaten, mit Diätpause, Weihnachten, Krafttraining, besseren Blut- und Laborwerten. Läuft nur vorübergehend; deine Daten werden weder angezeigt noch verändert.',
          ),
          showcaseButton(ctx),
        )
      : null,
    p
      ? h(
          'section',
          { class: 'card', 'aria-labelledby': 'report-h' },
          h('h2', { id: 'report-h' }, 'Bericht für die Ernährungsberatung'),
          h(
            'p',
            { class: 'small' },
            'Zusammenfassung der letzten 4 Wochen (Gewicht, Energie, Essverhalten, Pyramide, Nährstoffe, Labor) zum Ausdrucken oder als PDF. Bei einem BMI ab 30 übernimmt die Grundversicherung Ernährungsberatung auf ärztliche Verordnung (KLV Art. 9b).',
          ),
          h('a', { class: 'btn', href: '#bericht', id: 'open-report' }, 'Bericht erstellen'),
        )
      : null,
    profileForm(ctx, p),
    p ? visionCard(ctx) : null,
    dataCard(ctx),
    h(
      'section',
      { class: 'card', 'aria-labelledby': 'about-h' },
      h('h2', { id: 'about-h' }, 'Datenschutz und Hinweise'),
      h(
        'ul',
        { class: 'small privacy-list' },
        h(
          'li',
          {},
          h('strong', {}, 'Speicherort: '),
          'Alle Gesundheitsdaten liegen nur in diesem Browser auf diesem Gerät. Es gibt kein Konto, keinen Server, kein Tracking und keine Werbung.',
        ),
        h(
          'li',
          {},
          h('strong', {}, 'KI-Erfassung (nur wenn du sie nutzt): '),
          'Foto bzw. Beschreibung und dein restliches Tagesziel gehen direkt an den gewählten Anbieter (Anthropic oder OpenAI, Server in den USA). Es gelten die Datenschutzbestimmungen des Anbieters.',
        ),
        h(
          'li',
          {},
          h('strong', {}, 'Open Food Facts: '),
          'Beim Barcode nur die Nummer, bei der Produktsuche nur Suchbegriff und gewählter Händler.',
        ),
        h(
          'li',
          {},
          h('strong', {}, 'Schriften und Programmcode '),
          'werden von deiner App-Adresse geladen. Andere Dritte erhalten keine Anfragen.',
        ),
        h(
          'li',
          {},
          h('strong', {}, 'Deine Rechte: '),
          'Unter «Daten» kannst du jederzeit alles exportieren (JSON, CSV) oder vollständig löschen.',
        ),
      ),
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
    trainingMode: 'kombi',
    fastingWindowH: 0,
    foodPrefs: { fisch: true, milch: true, fleisch: true, kantine: true },
    vitDSupplementUg: 0,
    dietBreakUntil: '',
    cycleStatus: 'keine',
    cycleLength: 28,
    lastPeriodStart: '',
    shareCycle: false,
    eatStart: '11:00',
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
      trainingMode: str(fd, 'p-training') === 'laufen' ? 'laufen' : 'kombi',
      bedtime: str(fd, 'p-bed') || '22:30',
      cycleStatus: /** @type {import('../domain/cycle.js').CycleStatus} */ (
        str(fd, 'p-sex') === 'f' && CYCLE_OPTIONS.some((c) => c[0] === str(fd, 'p-cycle')) ? str(fd, 'p-cycle') : 'keine'
      ),
      cycleLength: need('p-cyclelen', 'Zykluslänge (Tage)', 21, 45, 28),
      lastPeriodStart: isISODate(str(fd, 'p-lastperiod')) ? str(fd, 'p-lastperiod') : '',
      shareCycle: fd.get('p-sharecycle') === 'on',
      vitDSupplementUg: need('p-vitd', 'Vitamin-D-Präparat (µg)', 0, 100, 0),
      dietBreakUntil: isISODate(str(fd, 'p-dietbreak')) ? str(fd, 'p-dietbreak') : '',
      foodPrefs: {
        fisch: fd.get('p-pref-fisch') === 'on',
        milch: fd.get('p-pref-milch') === 'on',
        fleisch: fd.get('p-pref-fleisch') === 'on',
        kantine: fd.get('p-pref-kantine') === 'on',
      },
      fastingWindowH: [8, 10, 12].includes(Number(str(fd, 'p-fasting'))) ? Number(str(fd, 'p-fasting')) : 0,
      eatStart: /^\d{2}:\d{2}$/.test(str(fd, 'p-eatstart')) ? str(fd, 'p-eatstart') : '11:00',
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
      (() => {
        const el = select({
          id: 'p-sex',
          label: 'Geschlecht (für Formeln)',
          value: v.sex,
          options: [
            { value: 'm', label: 'männlich' },
            { value: 'f', label: 'weiblich' },
          ],
        });
        // Zyklus-Abschnitt sofort ein- bzw. ausblenden
        el.querySelector('select')?.addEventListener('change', (e) => {
          const sec = document.getElementById('cycle-section');
          if (sec) sec.hidden = /** @type {HTMLSelectElement} */ (e.target).value !== 'f';
        });
        return el;
      })(),
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
      select({
        id: 'p-training',
        label: 'Training',
        value: v.trainingMode,
        options: [
          { value: 'kombi', label: 'Laufen und Kraft (empfohlen)' },
          { value: 'laufen', label: 'Nur Laufen' },
        ],
      }),
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
    h('h3', {}, 'Essensvorschläge'),
    h(
      'fieldset',
      { class: 'prefs' },
      h('legend', { class: 'small' }, 'Was darf die App für die nächste Mahlzeit vorschlagen?'),
      ...[
        ['fisch', 'Fisch und Meeresfrüchte'],
        ['milch', 'Milchprodukte'],
        ['fleisch', 'Fleisch'],
        ['kantine', 'Bevorzugt, was es im Geschäft oder unterwegs gibt'],
      ].map(([k, label]) =>
        h(
          'label',
          { class: 'check' },
          h('input', {
            type: 'checkbox',
            id: `p-pref-${k}`,
            name: `p-pref-${k}`,
            checked: v.foodPrefs?.[/** @type {'fisch' | 'milch' | 'fleisch' | 'kantine'} */ (k)] !== false,
          }),
          h('span', {}, label),
        ),
      ),
    ),
    h(
      'div',
      { id: 'cycle-section', hidden: v.sex !== 'f' },
      h('h3', {}, 'Zyklus und Lebensphase (freiwillig)'),
      h(
        'div',
        { class: 'form-grid' },
        select({
          id: 'p-cycle',
          label: 'Situation',
          value: v.cycleStatus ?? 'keine',
          options: CYCLE_OPTIONS.map(([value, label]) => ({ value, label })),
          hint: 'Passt Kalorien (kein Defizit in Schwangerschaft und Stillzeit), Nährstoffziele und Hinweise an.',
        }),
        field({
          id: 'p-cyclelen',
          label: 'Übliche Zykluslänge',
          inputmode: 'numeric',
          value: v.cycleLength ?? 28,
          suffix: 'Tage',
          hint: 'Wird aus den eingetragenen Perioden laufend angepasst.',
        }),
        field({
          id: 'p-lastperiod',
          label: 'Letzte Periode begann am',
          type: 'date',
          value: v.lastPeriodStart ?? '',
          hint: 'Optional, für den Start',
        }),
      ),
      h(
        'label',
        { class: 'check' },
        h('input', { type: 'checkbox', id: 'p-sharecycle', name: 'p-sharecycle', checked: Boolean(v.shareCycle) }),
        h('span', {}, 'Zyklusangaben in den Bericht für die Ernährungsberatung aufnehmen'),
      ),
      h('p', { class: 'hint' }, 'Diese Angaben bleiben auf dem Gerät und werden nie an die KI gesendet.'),
    ),
    h('h3', {}, 'Ergänzung und Pausen'),
    h(
      'div',
      { class: 'form-grid' },
      field({
        id: 'p-vitd',
        label: 'Vitamin-D-Präparat',
        inputmode: 'decimal',
        value: v.vitDSupplementUg ?? 0,
        suffix: 'µg/Tag',
        hint: '15 µg = 600 IE (Empfehlung BAG). Wird in den Nährstoffen mitgezählt.',
      }),
      field({
        id: 'p-dietbreak',
        label: 'Diätpause bis',
        type: 'date',
        value: v.dietBreakUntil ?? '',
        hint: 'Optional, 1–2 Wochen: Kalorienziel auf Erhaltung.',
      }),
    ),
    h('h3', {}, 'Intervallfasten (optional)'),
    h(
      'div',
      { class: 'form-grid' },
      select({
        id: 'p-fasting',
        label: 'Essensfenster',
        value: String(v.fastingWindowH ?? 0),
        options: FASTING_OPTIONS.map((o) => ({ value: String(o.hours), label: o.label })),
        hint: 'Wirkt über weniger Kalorien, nicht über einen Stoffwechseltrick. Sinnvoll, wenn dir feste Zeiten gegen spätes Essen helfen.',
      }),
      field({
        id: 'p-eatstart',
        label: 'Fenster beginnt um',
        type: 'time',
        value: v.eatStart ?? '11:00',
        hint: 'Früh enden ist besser als spät: z. B. 11–19 Uhr statt 13–21 Uhr.',
      }),
    ),
    h('p', { class: 'hint' }, FASTING_CAUTION),
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
    safetyBlock(ctx),
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
        'Das Foto wird verkleinert und direkt von diesem Gerät an den gewählten Anbieter gesendet, ohne Zwischenserver. Für den Tipp gehen zusätzlich dein restliches Tagesziel, die heute erfassten Mahlzeiten (Name und Uhrzeit), offene Gruppen der Lebensmittelpyramide und Nährstofflücken mit, aber kein Name, kein Gewicht und keine Zyklusdaten.',
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

/**
 * Automatische Sicherungen (letzte 7 Tage, vor Import/Löschen) und Speicherschutz.
 * @param {Ctx} ctx
 */
function safetyBlock(ctx) {
  const storage = safeStorage();
  const list = listSnapshots(storage);
  const status = h('p', { class: 'small', id: 'persist-status' }, 'Speicherschutz wird geprüft …');
  navigator.storage?.persisted?.().then(
    (ok) => {
      status.textContent = ok
        ? 'Speicherschutz aktiv: Der Browser löscht die Daten nicht automatisch.'
        : 'Speicherschutz nicht bestätigt: Der Browser könnte die Daten bei Platzmangel oder langer Nichtnutzung löschen. Regelmässige Backups sind wichtig.';
    },
    () => {
      status.textContent = 'Speicherschutz unbekannt.';
    },
  ) ?? (status.textContent = 'Speicherschutz unbekannt (Browser meldet ihn nicht).');
  const reasonLabel = (/** @type {string} */ r) => (r === 'täglich' ? 'Tagesstand' : 'vor Import/Löschen');
  return h(
    'details',
    { class: 'safety', id: 'safety' },
    h('summary', {}, `Automatische Sicherungen (${list.length})`),
    status,
    h(
      'p',
      { class: 'small muted' },
      'Die App sichert jeden Tag automatisch einen Stand und zusätzlich vor jedem Import oder Löschen (die letzten 7 Sicherungen). Sie liegen im selben Browser: gegen das Löschen der Website-Daten oder einen Handywechsel hilft nur das Backup als Datei.',
    ),
    list.length
      ? h(
          'ul',
          { class: 'entries', id: 'snapshot-list' },
          ...list.map((x, i) =>
            h(
              'li',
              {},
              h('span', { class: 'entry-time' }, fmtDate(x.day, 'dm')),
              h(
                'span',
                { class: 'entry-name' },
                `${reasonLabel(x.reason)} · ${new Date(x.savedAt).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })}`,
                h('small', { class: 'muted' }, ` · ${x.days} Tage, ${x.entries} Mahlzeiten`),
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: 'btn small-btn',
                  id: `restore-${i}`,
                  on: {
                    click: () => {
                      try {
                        const st = restoreSnapshot(storage, x.id);
                        if (!st) return ctx.toast('Sicherung nicht gefunden.', 'error');
                        ctx.replace(st, `Stand vom ${fmtDate(x.day)} wiederhergestellt`);
                      } catch {
                        ctx.toast('Sicherung ist beschädigt.', 'error');
                      }
                    },
                  },
                },
                'Wiederherstellen',
              ),
            ),
          ),
        )
      : h('p', { class: 'small muted' }, 'Noch keine Sicherung vorhanden. Sie entsteht beim nächsten Speichern.'),
  );
}

/**
 * Startet die Vorführung «−17 kg in einem Jahr» (nur im Arbeitsspeicher).
 * @param {Ctx} ctx
 */
function showcaseButton(ctx) {
  return ctx.showcase.active
    ? h('button', { type: 'button', class: 'btn', id: 'showcase-stop', on: { click: () => ctx.showcase.end() } }, 'Vorführung beenden')
    : h(
        'button',
        { type: 'button', class: 'btn', id: 'showcase-start', on: { click: () => ctx.showcase.start() } },
        'Vorführung: −17 kg in einem Jahr',
      );
}
