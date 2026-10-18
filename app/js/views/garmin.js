// @ts-check
// Garmin-Anbindung ohne Server: Aktivitäten per CSV-Export, Tageswerte per iPhone-Kurzbefehl
// (Garmin Connect → Apple Health → Kurzbefehl → Zwischenablage → App).

import { h, fmt, fmtDate, str } from '../ui/dom.js';
import { isDuplicate, parseGarminActivities, parseHealthPaste } from '../domain/importers.js';

/** @typedef {import('../app.js').Ctx} Ctx */
/** @typedef {import('../domain/importers.js').ImportedActivity} ImportedActivity */

/** @type {{ items: ImportedActivity[], skipped: number, file: string } | null} */
let preview = null;

/** @param {Ctx} ctx */
export function garminImportCard(ctx) {
  const fresh = preview ? preview.items.filter((a) => !isDuplicate(a, ctx.state.workouts)) : [];
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'garmin-h' },
    h('h2', { id: 'garmin-h' }, 'Von Garmin importieren'),
    h(
      'ol',
      { class: 'small steps-list' },
      h('li', {}, 'Am Computer connect.garmin.com öffnen → Aktivitäten → Alle Aktivitäten.'),
      h('li', {}, 'Bis zum gewünschten Zeitraum scrollen, dann oben rechts «Export CSV» wählen.'),
      h('li', {}, 'Die Datei auf das iPhone legen (z. B. iCloud Drive) und hier auswählen.'),
    ),
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'garmin-file' }, 'Garmin-CSV auswählen'),
      h('input', {
        type: 'file',
        id: 'garmin-file',
        accept: '.csv,text/csv,text/comma-separated-values',
        on: {
          change: async (e) => {
            const f = /** @type {HTMLInputElement} */ (e.target).files?.[0];
            if (!f) return;
            const res = parseGarminActivities(await f.text());
            if (res.error) {
              preview = null;
              ctx.toast(res.error, 'error');
            } else preview = { items: res.activities, skipped: res.skipped, file: f.name };
            ctx.go('training');
          },
        },
      }),
    ),
    preview
      ? h(
          'div',
          { class: 'stack-sm', id: 'garmin-preview' },
          h(
            'p',
            { class: 'small' },
            `${preview.items.length} Läufe/Krafteinheiten erkannt, davon ${fresh.length} neu`,
            preview.items.length - fresh.length ? `, ${preview.items.length - fresh.length} schon vorhanden` : '',
            preview.skipped ? `. ${preview.skipped} andere Aktivitäten übersprungen.` : '.',
          ),
          fresh.length
            ? h(
                'ul',
                { class: 'entries' },
                ...fresh
                  .slice(0, 8)
                  .map((a) =>
                    h(
                      'li',
                      {},
                      h('span', { class: 'entry-time' }, fmtDate(a.date, 'dm')),
                      h('span', { class: 'entry-name' }, a.title || (a.kind === 'run' ? 'Lauf' : 'Kraft')),
                      h(
                        'span',
                        { class: 'entry-num' },
                        `${fmt(a.minutes)} Min.${a.km ? ` · ${fmt(a.km, 1)} km` : ''}${a.avgHr ? ` · Ø ${a.avgHr}` : ''}`,
                      ),
                    ),
                  ),
              )
            : null,
          fresh.length > 8 ? h('p', { class: 'hint' }, `… und ${fresh.length - 8} weitere`) : null,
          h(
            'div',
            { class: 'btn-row' },
            h(
              'button',
              {
                type: 'button',
                class: 'btn primary',
                id: 'garmin-import',
                disabled: !fresh.length,
                on: {
                  click: () => {
                    const n = fresh.length;
                    preview = null;
                    ctx.commit((s) => {
                      for (const a of fresh) {
                        if (a.kind === 'run') {
                          s.workouts.push({
                            id: a.id,
                            date: a.date,
                            kind: 'run',
                            runType: a.runType ?? 'z2',
                            minutes: a.minutes,
                            ...(a.km ? { km: a.km } : {}),
                            ...(a.avgHr ? { avgHr: a.avgHr } : {}),
                            note: 'Garmin',
                          });
                        } else s.workouts.push({ id: a.id, date: a.date, kind: 'strength', template: 'Garmin', sets: [], note: 'Garmin' });
                      }
                    }, `${n} Einheiten von Garmin übernommen`);
                  },
                },
              },
              fresh.length ? `${fresh.length} übernehmen` : 'Nichts Neues',
            ),
            h(
              'button',
              {
                type: 'button',
                class: 'btn',
                on: {
                  click: () => {
                    preview = null;
                    ctx.go('training');
                  },
                },
              },
              'Abbrechen',
            ),
          ),
          h(
            'p',
            { class: 'hint' },
            'Intervalle erkennt die App am Titel (z. B. «Intervall» oder «4x4»), Läufe ab 60 Minuten gelten als langer Lauf. Doppelte werden übersprungen.',
          ),
        )
      : null,
  );
}

/**
 * Tageswerte aus Apple Health übernehmen (Kurzbefehl kopiert sie in die Zwischenablage).
 * @param {Ctx} ctx
 */
export function healthPasteBlock(ctx) {
  /** @param {string} text */
  const apply = (text) => {
    const v = parseHealthPaste(text);
    if (!v) return ctx.toast('Keine Werte gefunden. Der Text muss mit «cockpit;» beginnen, siehe Anleitung.', 'error');
    ctx.commit(
      (s) => {
        const d = { ...s.days[ctx.date] };
        if (v.steps !== undefined) d.steps = v.steps;
        if (v.restingHr !== undefined) d.restingHr = v.restingHr;
        if (v.sleepH !== undefined) d.sleepH = v.sleepH;
        // Gewicht nur übernehmen, wenn heute noch keines erfasst ist (Waage morgens hat Vorrang).
        if (v.weightKg !== undefined && d.weightKg === undefined) d.weightKg = v.weightKg;
        s.days[ctx.date] = d;
      },
      `Übernommen: ${[v.steps !== undefined && 'Schritte', v.restingHr !== undefined && 'Ruhepuls', v.sleepH !== undefined && 'Schlaf', v.weightKg !== undefined && 'Gewicht'].filter(Boolean).join(', ')}`,
    );
  };
  return h(
    'div',
    { class: 'health-paste stack-sm' },
    h(
      'button',
      {
        type: 'button',
        class: 'btn photo-btn',
        id: 'health-paste',
        on: {
          click: async () => {
            try {
              apply(await navigator.clipboard.readText());
            } catch {
              ctx.toast('Zwischenablage nicht lesbar. Füge den Text unten ein.', 'error');
              const ta = /** @type {HTMLDetailsElement | null} */ (document.getElementById('health-manual'));
              if (ta) ta.open = true;
            }
          },
        },
      },
      'Werte aus Garmin / Apple Health einfügen',
    ),
    h(
      'details',
      { id: 'health-manual' },
      h('summary', {}, 'Text von Hand einfügen'),
      h(
        'form',
        {
          class: 'inline-form',
          on: {
            submit: (e) => {
              e.preventDefault();
              apply(str(new FormData(/** @type {HTMLFormElement} */ (e.target)), 'health-text'));
            },
          },
        },
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'health-text', class: 'sr-only' }, 'Text aus dem Kurzbefehl'),
          h('input', { id: 'health-text', name: 'health-text', placeholder: 'cockpit;schritte=9512;ruhepuls=48;…' }),
        ),
        h('button', { type: 'submit', class: 'btn', id: 'health-text-go' }, 'Übernehmen'),
      ),
    ),
    h(
      'details',
      {},
      h('summary', {}, 'Einrichten (einmalig, ca. 10 Minuten)'),
      h(
        'ol',
        { class: 'small steps-list' },
        h('li', {}, 'Garmin-Connect-App → Mehr → Einstellungen → Verbundene Apps → Apple Health: Übertragung einschalten.'),
        h('li', {}, 'App «Kurzbefehle» → neuer Kurzbefehl «Cockpit».'),
        h('li', {}, 'Aktion «Health-Samples suchen»: Typ Schritte, Startdatum ist heute. Danach «Statistik berechnen»: Summe.'),
        h('li', {}, 'Aktion «Health-Samples suchen»: Typ Ruhepuls, sortiert nach Startdatum, neuestes zuerst, Limit 1.'),
        h('li', {}, 'Optional ebenso: Gewicht (neuestes, Limit 1) und Schlaf (Schlafanalyse der letzten Nacht, Dauer in Stunden).'),
        h(
          'li',
          {},
          'Aktion «Text»: cockpit;schritte=[Summe];ruhepuls=[Ruhepuls];gewicht=[Gewicht];schlaf=[Schlaf]. Die Werte in Klammern als Variablen einsetzen.',
        ),
        h('li', {}, 'Aktion «In Zwischenablage kopieren». Den Kurzbefehl als Widget auf den Home-Bildschirm legen.'),
        h('li', {}, 'Täglich: Widget antippen, Cockpit öffnen, «Werte einfügen» tippen.'),
      ),
      h(
        'p',
        { class: 'hint' },
        'Welche Werte Garmin an Apple Health überträgt, hängt von Uhr und Einstellungen ab. Fehlende Werte lässt die App einfach leer.',
      ),
    ),
  );
}
