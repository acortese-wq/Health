// @ts-check
// Nahrungsergänzung: eigene Produkte, Einnahme heute abhaken, Inhalt mit Quelle und Belegen,
// Prüfung gegen Höchstmengen und Überschneidungen.

import { h, fmt, fmtDate, nowTime } from '../ui/dom.js';
import { uid } from '../store.js';
import { SUPPLEMENT_TEMPLATES } from '../data/supplements.js';
import { NUTRIENTS, dailyTargets, dayAmounts } from '../domain/micros.js';
import {
  fromTemplate,
  supplementAmounts,
  intakeTotals,
  plannedTotals,
  upperLimitCheck,
  overlaps,
  UPPER_LIMITS,
  FOLIC_TO_DFE,
} from '../domain/supplements.js';

/** @typedef {import('../app.js').Ctx} Ctx */
/** @typedef {import('../domain/supplements.js').Supplement} Supplement */

/** Ansicht merken, solange die App offen ist. */
const view = { editId: '', custom: false, showPaused: false };

const MICRO_DEFS = NUTRIENTS.filter((n) => n.group !== 'makro' && n.key !== 'sodium' && n.key !== 'cholesterol');
/** @param {string} key */
const def = (key) => NUTRIENTS.find((n) => n.key === key);

/**
 * Heute eingenommen?
 * @param {Ctx} ctx
 * @param {string} sid
 */
function takenToday(ctx, sid) {
  return (ctx.state.days[ctx.date]?.supps ?? []).filter((i) => i.sid === sid).reduce((a, i) => a + i.servings, 0);
}

/**
 * Einnahme abhaken bzw. zurücknehmen (ein Tipp; zweiter Tipp nimmt zurück).
 * @param {Ctx} ctx
 * @param {Supplement} s
 */
function toggleIntake(ctx, s) {
  const taken = takenToday(ctx, s.id) > 0;
  ctx.commit(
    (st) => {
      const d = (st.days[ctx.date] = st.days[ctx.date] ?? {});
      if (taken) {
        d.supps = (d.supps ?? []).filter((i) => i.sid !== s.id);
        if (!d.supps.length) delete d.supps;
      } else
        d.supps = [...(d.supps ?? []), { id: uid(), sid: s.id, servings: s.perDay, time: ctx.date === ctx.today ? nowTime() : '08:00' }];
      return true;
    },
    taken ? `${s.name}: Einnahme zurückgenommen` : `${s.name} eingenommen`,
  );
}

/**
 * Schnell abhaken auf «Heute».
 * @param {Ctx} ctx
 */
export function supplementTodayCard(ctx) {
  const active = ctx.state.supplements.filter((s) => s.active);
  if (!active.length) return null;
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'supp-today-h', id: 'supp-today' },
    h(
      'div',
      { class: 'card-head' },
      h('h2', { id: 'supp-today-h' }, 'Präparate heute'),
      h('a', { href: '#ernaehrung', class: 'link-btn', id: 'supp-more' }, 'Details'),
    ),
    h(
      'div',
      { class: 'chips' },
      ...active.map((s) => {
        const n = takenToday(ctx, s.id);
        return h(
          'button',
          {
            type: 'button',
            class: n ? 'chip chip-done' : 'chip',
            id: `supp-take-${s.id}`,
            'aria-pressed': String(n > 0),
            on: { click: () => toggleIntake(ctx, s) },
          },
          `${n ? '✓ ' : ''}${s.name}`,
          h('small', {}, n ? 'eingenommen' : s.serving),
        );
      }),
    ),
  );
}

/**
 * Karte unter «Ernährung».
 * @param {Ctx} ctx
 * @param {NonNullable<Ctx['snap']>} snap
 */
export function supplementCard(ctx, snap) {
  const all = ctx.state.supplements;
  const active = all.filter((s) => s.active);
  const paused = all.filter((s) => !s.active);
  const intakes = ctx.state.days[ctx.date]?.supps ?? [];
  const food = dayAmounts(snap.day.food ?? []).amounts;
  const today = upperLimitCheck(intakeTotals(all, intakes), food);
  // Bei üblicher Einnahme aller aktiven Produkte (für Hinweise auch an Tagen ohne Abhaken)
  const planned = upperLimitCheck(plannedTotals(all), {});
  const ov = overlaps(all);
  const targets = dailyTargets({ kcalTarget: snap.kcalTarget, proteinG: snap.protein.grams, sex: snap.profile.sex, stage: snap.lifeStage });
  return h(
    'section',
    { class: 'card stack-sm', 'aria-labelledby': 'supp-h', id: 'supplement-card' },
    h('h2', { id: 'supp-h' }, 'Nahrungsergänzung'),
    h(
      'p',
      { class: 'small muted' },
      'Essen zuerst: Präparate ersetzen keine ausgewogene Ernährung und lohnen sich vor allem bei einem nachgewiesenen Mangel oder in besonderen Phasen (z. B. Vitamin D im Winter). Ihre Nährstoffe zählen in der Übersicht oben als eigene Quelle mit.',
    ),
    [...today.filter((w) => !w.near), ...planned.filter((w) => !w.near && !today.some((t) => t.key === w.key))].map((w) =>
      h(
        'p',
        { class: 'note alert small', id: `ul-${w.key}` },
        h('strong', {}, `${w.label}: ${fmt(w.total, w.total % 1 ? 1 : 0)} ${w.unit} über der Höchstmenge von ${fmt(w.limit)} ${w.unit}`),
        ` (davon ${fmt(w.fromSupp, w.fromSupp % 1 ? 1 : 0)} ${w.unit} aus Präparaten). `,
        w.note ?? '',
        ' Dosis reduzieren oder ein Produkt weglassen; im Zweifel in der Apotheke fragen.',
      ),
    ),
    today
      .filter((w) => w.near)
      .map((w) =>
        h(
          'p',
          { class: 'note warn small', id: `ul-near-${w.key}` },
          `${w.label}: ${fmt(w.total, 1)} von höchstens ${fmt(w.limit)} ${w.unit} pro Tag (über 80 %).`,
        ),
      ),
    ov.length
      ? h(
          'p',
          { class: 'small', id: 'supp-overlap' },
          h('strong', {}, 'Doppelt enthalten: '),
          ov.map((o) => `${o.key === 'folicAcid' ? 'Folsäure' : (def(o.key)?.label ?? o.key)} (${o.names.join(' + ')})`).join(', '),
          '. Die Summe zählt gegen die Höchstmengen.',
        )
      : null,
    active.length
      ? h('ul', { class: 'supp-list', id: 'supp-list' }, ...active.map((s) => productItem(ctx, s, targets)))
      : h('p', { class: 'small', id: 'supp-none' }, 'Noch kein Präparat erfasst.'),
    paused.length
      ? h(
          'details',
          { class: 'small', id: 'supp-paused' },
          h('summary', {}, `Pausiert (${paused.length})`),
          h('ul', { class: 'supp-list' }, ...paused.map((s) => productItem(ctx, s, targets))),
        )
      : null,
    addForm(ctx),
    view.custom ? customForm(ctx) : null,
    h(
      'p',
      { class: 'hint' },
      `Höchstmengen nach EFSA für Erwachsene (${UPPER_LIMITS.map((u) => u.label).join(', ')}). Folsäure zählt als Folat mit dem Faktor ${FOLIC_TO_DFE}; die Höchstmenge gilt für die Folsäure aus Präparaten. Präparate verbessern nicht die «Abdeckung» der Ernährung.`,
    ),
  );
}

/**
 * Ein Produkt mit Inhalt, Quelle, Belegen und Aktionen.
 * @param {Ctx} ctx
 * @param {Supplement} s
 * @param {Partial<Record<import('../domain/micros.js').NutrientKey, number>>} targets
 */
function productItem(ctx, s, targets) {
  const n = takenToday(ctx, s.id);
  const a = supplementAmounts(s, 1);
  const tpl = SUPPLEMENT_TEMPLATES.find((t) => t.id === s.templateId);
  if (view.editId === s.id) return h('li', { class: 'supp-item editing' }, editForm(ctx, s));
  return h(
    'li',
    { class: 'supp-item', id: `supp-${s.id}` },
    h(
      'div',
      { class: 'supp-head' },
      h(
        'div',
        { class: 'supp-title' },
        h('strong', {}, s.name),
        h('span', { class: 'small muted' }, `${s.serving}${s.perDay !== 1 ? ` × ${fmt(s.perDay)}` : ''} pro Tag`),
      ),
      s.active
        ? h(
            'button',
            {
              type: 'button',
              class: n ? 'btn small-btn' : 'btn primary small-btn',
              id: `supp-toggle-${s.id}`,
              'aria-pressed': String(n > 0),
              on: { click: () => toggleIntake(ctx, s) },
            },
            n ? '✓ Heute eingenommen' : 'Eingenommen',
          )
        : null,
    ),
    h(
      'details',
      { class: 'supp-details' },
      h('summary', { class: 'small' }, 'Inhalt, Quelle und Belege'),
      h(
        'table',
        { class: 'nutrition-table small' },
        h('thead', {}, h('tr', {}, h('th', {}, `Pro ${s.serving}`), h('th', {}, 'Menge'), h('th', {}, '% Tagesbedarf'))),
        h(
          'tbody',
          {},
          ...Object.entries(s.nutrients).map(([k, v]) => {
            const d = def(k);
            const t = targets[/** @type {import('../domain/micros.js').NutrientKey} */ (k)];
            return h(
              'tr',
              {},
              h('th', {}, d?.label ?? k),
              h('td', {}, `${fmt(v, v % 1 ? 1 : 0)} ${d?.unit ?? ''}`),
              h('td', {}, t ? `${Math.round((v / t) * 100)} %` : '–'),
            );
          }),
          s.folicAcid
            ? h(
                'tr',
                {},
                h('th', {}, 'Folsäure'),
                h('td', {}, `${fmt(s.folicAcid)} µg`),
                h('td', {}, targets.folate ? `${Math.round(((a.micros.folate ?? 0) / targets.folate) * 100)} % (als Folat)` : '–'),
              )
            : null,
          ...s.other.map((o) =>
            h('tr', {}, h('th', {}, o.label), h('td', {}, `${fmt(o.amount, o.amount % 1 ? 2 : 0)} ${o.unit}`), h('td', {}, '–')),
          ),
          ...s.unknown.map((u) =>
            h(
              'tr',
              { class: 'unknown' },
              h('th', {}, u),
              h('td', { colspan: '2' }, 'Menge unbekannt, zählt nicht. Bitte von der Packung ergänzen.'),
            ),
          ),
        ),
      ),
      h(
        'p',
        { class: 'hint' },
        `Quelle: ${s.source}${s.checked ? `, Stand ${fmtDate(s.checked)}` : ''}. Rezepturen ändern sich: mit der eigenen Packung abgleichen.`,
      ),
      ...(tpl?.notes ?? []).map((t) => h('p', { class: 'small' }, t)),
      tpl?.evidence.length
        ? h(
            'div',
            { class: 'stack-sm' },
            h('h3', { class: 'eyebrow' }, 'Was die Studien sagen'),
            ...tpl.evidence.map((e) => h('p', { class: 'small' }, e.text, h('br', {}), h('span', { class: 'hint' }, e.ref))),
          )
        : null,
      h(
        'div',
        { class: 'btn-row' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn small-btn',
            id: `supp-edit-${s.id}`,
            on: {
              click: () => {
                view.editId = s.id;
                ctx.go('ernaehrung');
              },
            },
          },
          'Werte bearbeiten',
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'btn small-btn',
            id: `supp-pause-${s.id}`,
            on: {
              click: () =>
                ctx.commit(
                  (st) => {
                    const x = st.supplements.find((y) => y.id === s.id);
                    if (!x) return false;
                    x.active = !x.active;
                    return true;
                  },
                  s.active ? `${s.name} pausiert` : `${s.name} wieder aktiv`,
                ),
            },
          },
          s.active ? 'Pausieren' : 'Wieder aktivieren',
        ),
        !Object.values(ctx.state.days).some((d) => d.supps?.some((i) => i.sid === s.id))
          ? h(
              'button',
              {
                type: 'button',
                class: 'btn danger-outline small-btn',
                id: `supp-remove-${s.id}`,
                on: {
                  click: () =>
                    ctx.commit((st) => {
                      st.supplements = st.supplements.filter((y) => y.id !== s.id);
                      return true;
                    }, `${s.name} entfernt`),
                },
              },
              'Entfernen',
            )
          : null,
      ),
    ),
  );
}

/**
 * Produkt aus Vorlage hinzufügen; warnt, wenn die Summe aller aktiven Produkte eine Höchstmenge überschreitet.
 * @param {Ctx} ctx
 */
function addForm(ctx) {
  const have = new Set(ctx.state.supplements.map((s) => s.templateId).filter(Boolean));
  const options = SUPPLEMENT_TEMPLATES.filter((t) => !have.has(t.id));
  return h(
    'form',
    {
      class: 'plan-add-row',
      id: 'supp-add',
      on: {
        submit: (e) => {
          e.preventDefault();
          const id = String(new FormData(/** @type {HTMLFormElement} */ (e.target)).get('template'));
          if (id === 'eigen') {
            view.custom = true;
            return ctx.go('ernaehrung');
          }
          const sp = fromTemplate(id, { id: uid(), now: new Date().toISOString() });
          if (!sp) return ctx.toast('Bitte ein Produkt wählen.', 'error');
          const over = upperLimitCheck(plannedTotals([...ctx.state.supplements, sp]), {}).filter((w) => !w.near);
          if (
            over.length &&
            !window.confirm(
              `Zusammen mit deinen anderen Präparaten über der Höchstmenge: ${over.map((w) => w.label).join(', ')}. Trotzdem hinzufügen?`,
            )
          )
            return;
          ctx.commit((st) => {
            st.supplements.push(sp);
            return true;
          }, `${sp.name} hinzugefügt`);
        },
      },
    },
    h(
      'select',
      { name: 'template', id: 'supp-template', 'aria-label': 'Präparat wählen' },
      ...options.map((t) => h('option', { value: t.id }, t.name)),
      h('option', { value: 'eigen' }, 'Eigenes Präparat erfassen …'),
    ),
    h('button', { type: 'submit', class: 'btn small-btn', id: 'supp-add-go' }, 'Hinzufügen'),
  );
}

/**
 * Nährstoffzeilen zum Bearbeiten (bekannte, unbekannte und eine leere Zeile).
 * @param {Partial<Record<string, number>>} nutrients
 * @param {number | undefined} folicAcid
 * @param {string[]} unknown
 * @param {number} [blanks] leere Zeilen
 */
function nutrientRows(nutrients, folicAcid, unknown, blanks = 1) {
  /** @type {[string, number | ''][]} */
  const rows = [...Object.entries(nutrients).map(([k, v]) => /** @type {[string, number]} */ ([k, v ?? 0]))];
  if (folicAcid) rows.push(['folicAcid', folicAcid]);
  for (const u of unknown) {
    const d = MICRO_DEFS.find((x) => x.label.toLowerCase() === u.toLowerCase());
    if (d) rows.push([d.key, '']);
  }
  for (let i = 0; i < blanks; i++) rows.push(['', '']);
  return rows.map(([k, v], i) => {
    const sel = h(
      'select',
      { name: `n-key-${i}`, 'aria-label': 'Nährstoff' },
      h('option', { value: '' }, '–'),
      h('option', { value: 'folicAcid' }, 'Folsäure (µg)'),
      ...MICRO_DEFS.map((d) => h('option', { value: d.key }, `${d.label} (${d.unit})`)),
    );
    /** @type {HTMLSelectElement} */ (sel).value = k;
    return h(
      'div',
      { class: 'plan-add-row' },
      sel,
      h('input', {
        name: `n-val-${i}`,
        inputmode: 'decimal',
        value: v === '' ? '' : String(v),
        placeholder: 'Menge',
        'aria-label': 'Menge',
        class: 'serv-input',
      }),
    );
  });
}

/**
 * Formularwerte lesen.
 * @param {FormData} fd
 */
function readNutrients(fd) {
  /** @type {Record<string, number>} */
  const nutrients = {};
  let folicAcid = 0;
  for (let i = 0; i < 40; i++) {
    const k = String(fd.get(`n-key-${i}`) ?? '');
    const raw = String(fd.get(`n-val-${i}`) ?? '').trim();
    if (!k || raw === '') continue;
    const v = Number(raw.replace(',', '.'));
    if (!(v >= 0 && v < 100000)) throw new Error('Ungültige Menge');
    if (k === 'folicAcid') folicAcid = v;
    else nutrients[k] = v;
  }
  return { nutrients, folicAcid };
}

/**
 * Werte eines Produkts bearbeiten (z. B. fehlendes B6 von der Packung ergänzen).
 * @param {Ctx} ctx
 * @param {Supplement} s
 */
function editForm(ctx, s) {
  return h(
    'form',
    {
      class: 'stack-sm',
      id: `supp-editform-${s.id}`,
      on: {
        submit: (e) => {
          e.preventDefault();
          const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
          try {
            const { nutrients, folicAcid } = readNutrients(fd);
            const perDay = Number(String(fd.get('perDay')).replace(',', '.'));
            if (!(perDay > 0 && perDay <= 20)) throw new Error('Portionen pro Tag ungültig');
            view.editId = '';
            ctx.commit((st) => {
              const x = st.supplements.find((y) => y.id === s.id);
              if (!x) return false;
              x.nutrients = nutrients;
              if (folicAcid) x.folicAcid = folicAcid;
              else delete x.folicAcid;
              x.perDay = perDay;
              x.serving = String(fd.get('serving') || x.serving).slice(0, 80);
              // Ergänzte Werte sind nicht mehr unbekannt
              x.unknown = x.unknown.filter((u) => !Object.keys(nutrients).some((k) => def(k)?.label.toLowerCase() === u.toLowerCase()));
              x.source = x.source.includes('eigene Ergänzung') ? x.source : `${x.source}; eigene Ergänzung`;
              return true;
            }, 'Werte gespeichert');
          } catch (err) {
            ctx.toast(err instanceof Error ? err.message : String(err), 'error');
          }
        },
      },
    },
    h('strong', {}, s.name),
    h(
      'div',
      { class: 'grid-2' },
      h(
        'div',
        { class: 'field' },
        h('label', { for: `serving-${s.id}` }, 'Portion'),
        h('input', { id: `serving-${s.id}`, name: 'serving', value: s.serving }),
      ),
      h(
        'div',
        { class: 'field' },
        h('label', { for: `perday-${s.id}` }, 'Portionen pro Tag'),
        h('input', { id: `perday-${s.id}`, name: 'perDay', inputmode: 'decimal', value: String(s.perDay) }),
      ),
    ),
    h('p', { class: 'hint' }, 'Werte pro Portion wie auf der Packung. Leere Menge = unbekannt (zählt nicht).'),
    ...nutrientRows(s.nutrients, s.folicAcid, s.unknown),
    h(
      'div',
      { class: 'btn-row' },
      h('button', { type: 'submit', class: 'btn primary small-btn', id: `supp-save-${s.id}` }, 'Speichern'),
      h(
        'button',
        {
          type: 'button',
          class: 'btn small-btn',
          on: {
            click: () => {
              view.editId = '';
              ctx.go('ernaehrung');
            },
          },
        },
        'Abbrechen',
      ),
    ),
  );
}

/**
 * Eigenes Präparat erfassen.
 * @param {Ctx} ctx
 */
function customForm(ctx) {
  return h(
    'form',
    {
      class: 'stack-sm supp-custom',
      id: 'supp-custom',
      on: {
        submit: (e) => {
          e.preventDefault();
          const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
          try {
            const name = String(fd.get('name') ?? '').trim();
            if (!name) throw new Error('Bitte einen Namen eingeben');
            const { nutrients, folicAcid } = readNutrients(fd);
            if (!Object.keys(nutrients).length && !folicAcid) throw new Error('Bitte mindestens einen Nährstoff mit Menge angeben');
            const perDay = Number(String(fd.get('perDay') || '1').replace(',', '.'));
            /** @type {Supplement} */
            const sp = {
              id: uid(),
              name: name.slice(0, 80),
              serving: String(fd.get('serving') || '1 Portion').slice(0, 80),
              perDay: perDay > 0 && perDay <= 20 ? perDay : 1,
              nutrients,
              ...(folicAcid ? { folicAcid } : {}),
              ...(nutrients.magnesium ? { suppMagnesium: true } : {}),
              other: [],
              unknown: [],
              source: 'eigene Angaben (Packung)',
              active: true,
              createdAt: new Date().toISOString(),
            };
            view.custom = false;
            ctx.commit((st) => {
              st.supplements.push(sp);
              return true;
            }, `${sp.name} hinzugefügt`);
          } catch (err) {
            ctx.toast(err instanceof Error ? err.message : String(err), 'error');
          }
        },
      },
    },
    h('h3', { class: 'eyebrow' }, 'Eigenes Präparat'),
    h('div', { class: 'field' }, h('label', { for: 'supp-name' }, 'Name'), h('input', { id: 'supp-name', name: 'name', required: true })),
    h(
      'div',
      { class: 'grid-2' },
      h(
        'div',
        { class: 'field' },
        h('label', { for: 'supp-serving' }, 'Portion'),
        h('input', { id: 'supp-serving', name: 'serving', placeholder: 'z. B. 1 Tablette' }),
      ),
      h(
        'div',
        { class: 'field' },
        h('label', { for: 'supp-perday' }, 'Portionen pro Tag'),
        h('input', { id: 'supp-perday', name: 'perDay', inputmode: 'decimal', value: '1' }),
      ),
    ),
    h('p', { class: 'hint' }, 'Werte pro Portion wie auf der Packung (Nährwerttabelle).'),
    ...nutrientRows({}, undefined, [], 6),
    h(
      'div',
      { class: 'btn-row' },
      h('button', { type: 'submit', class: 'btn primary small-btn', id: 'supp-custom-save' }, 'Speichern'),
      h(
        'button',
        {
          type: 'button',
          class: 'btn small-btn',
          on: {
            click: () => {
              view.custom = false;
              ctx.go('ernaehrung');
            },
          },
        },
        'Abbrechen',
      ),
    ),
  );
}
