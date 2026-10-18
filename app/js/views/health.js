// @ts-check
import { h, field, select, badge, fmt, fmtDate, num, str, nowTime } from '../ui/dom.js';
import { uid } from '../store.js';
import {
  LABS,
  findLab,
  latestLabs,
  derivedLabs,
  stopBang,
  STOP_BANG_ITEMS,
  preventionItems,
  bpCategory,
  waistRisk,
  whtr,
} from '../domain/clinical.js';
import { ageOn } from '../domain/energy.js';
import { addDays } from '../domain/util.js';
import { motivationCard } from './motivation.js';

/** @typedef {import('../app.js').Ctx} Ctx */

let labKey = 'hba1c';

/** @param {Ctx} ctx */
export function viewHealth(ctx) {
  return h(
    'div',
    { class: 'stack' },
    h('h1', {}, 'Gesundheit'),
    h(
      'p',
      { class: 'lead' },
      'Die App ordnet deine Werte nach publizierten Leitlinien ein. Sie stellt keine Diagnose. Auffällige Werte gehören in die hausärztliche Sprechstunde.',
    ),
    motivationCard(ctx),
    h('div', { class: 'grid-2' }, bpCard(ctx), bodyCard(ctx)),
    labCard(ctx),
    h('div', { class: 'grid-2' }, stopBangCard(ctx), preventionCard(ctx)),
  );
}

/** @param {Ctx} ctx */
function bpCard(ctx) {
  const snap = /** @type {NonNullable<Ctx['snap']>} */ (ctx.snap);
  const recent = [...ctx.state.bp].sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1)).slice(0, 8);
  const m = snap.bpMean;
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'bp-h' },
    h('h2', { id: 'bp-h' }, 'Blutdruck'),
    m
      ? h(
          'div',
          { class: 'callout' },
          h('span', { class: 'big' }, h('strong', {}, `${m.sys}/${m.dia}`), ' mmHg'),
          badge(/** @type {any} */ (m.category.severity), m.category.label),
          h(
            'p',
            { class: 'small' },
            `Mittel der Heimmessungen der letzten 7 Tage (${m.n} Messungen).`,
            m.reliable ? '' : ' Für eine verlässliche Aussage braucht es mindestens 12 Messungen.',
          ),
          m.category.note ? h('p', { class: 'small' }, m.category.note) : null,
        )
      : h(
          'p',
          { class: 'empty' },
          'Noch keine Heimmessungen. Protokoll: 7 Tage lang morgens vor dem Frühstück und abends je 2 Messungen. Vorher 5 Min. sitzen, Arm auf Herzhöhe, nicht sprechen.',
        ),
    h(
      'form',
      {
        class: 'form-grid',
        on: {
          submit: (e) => {
            e.preventDefault();
            const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
            const sys = num(fd, 'bp-sys');
            const dia = num(fd, 'bp-dia');
            const pulse = num(fd, 'bp-pulse');
            if (sys === null || dia === null || sys < 60 || sys > 260 || dia < 30 || dia > 160 || dia >= sys) {
              return ctx.toast('Bitte plausible Werte eingeben (oberer Wert grösser als unterer).', 'error');
            }
            const setting = str(fd, 'bp-setting') === 'office' ? 'office' : 'home';
            const cat = bpCategory(sys, dia, setting);
            ctx.commit(
              (s) =>
                void s.bp.push({
                  id: uid(),
                  date: str(fd, 'bp-date') || ctx.today,
                  time: str(fd, 'bp-time') || nowTime(),
                  sys: Math.round(sys),
                  dia: Math.round(dia),
                  ...(pulse !== null ? { pulse: Math.round(pulse) } : {}),
                  setting,
                }),
              cat.severity === 'alert' ? `Gespeichert. ${cat.note}` : 'Messung gespeichert',
            );
          },
        },
      },
      field({ id: 'bp-sys', label: 'Oberer Wert', inputmode: 'numeric', suffix: 'mmHg', required: true }),
      field({ id: 'bp-dia', label: 'Unterer Wert', inputmode: 'numeric', suffix: 'mmHg', required: true }),
      field({ id: 'bp-pulse', label: 'Puls', inputmode: 'numeric', suffix: '/min' }),
      select({
        id: 'bp-setting',
        label: 'Ort',
        value: 'home',
        options: [
          { value: 'home', label: 'Zu Hause' },
          { value: 'office', label: 'Arztpraxis / Apotheke' },
        ],
      }),
      field({ id: 'bp-date', label: 'Datum', type: 'date', value: ctx.today, max: ctx.today }),
      field({ id: 'bp-time', label: 'Zeit', type: 'time', value: nowTime() }),
      h('button', { class: 'btn primary', type: 'submit', id: 'bp-save' }, 'Messung speichern'),
    ),
    recent.length
      ? h(
          'ul',
          { class: 'entries' },
          ...recent.map((b) => {
            const c = bpCategory(b.sys, b.dia, b.setting);
            return h(
              'li',
              {},
              h('span', { class: 'entry-time' }, `${fmtDate(b.date, 'dm')} ${b.time}`),
              h(
                'span',
                { class: 'entry-name' },
                `${b.sys}/${b.dia}`,
                b.pulse ? h('small', { class: 'muted' }, ` · ${b.pulse}/min`) : null,
                b.setting === 'office' ? h('small', { class: 'muted' }, ' · Praxis') : null,
              ),
              badge(c.severity, c.label),
              h(
                'button',
                {
                  type: 'button',
                  class: 'icon-btn',
                  'aria-label': 'Messung löschen',
                  on: { click: () => ctx.commit((s) => void (s.bp = s.bp.filter((x) => x.id !== b.id)), 'Messung gelöscht') },
                },
                '×',
              ),
            );
          }),
        )
      : null,
    h(
      'p',
      { class: 'muted small' },
      'Grenzwerte nach ESC-Leitlinie 2024: zu Hause erhöht ab 120/70, Hypertonie ab 135/85 mmHg. In der Praxis gilt Hypertonie ab 140/90 mmHg.',
    ),
  );
}

/** @param {Ctx} ctx */
function bodyCard(ctx) {
  const p = /** @type {NonNullable<typeof ctx.state.profile>} */ (ctx.state.profile);
  const waist = [...ctx.state.waist].sort((a, b) => (a.date < b.date ? 1 : -1));
  const vo2 = [...ctx.state.vo2max].sort((a, b) => (a.date < b.date ? 1 : -1));
  const w = waist[0];
  const firstW = waist[waist.length - 1];
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'body-h' },
    h('h2', { id: 'body-h' }, 'Taille und Fitness'),
    w
      ? h(
          'dl',
          { class: 'kv' },
          h('dt', {}, 'Taillenumfang'),
          h('dd', {}, `${fmt(w.cm, 1)} cm `, badge(waistRisk(p.sex, w.cm).severity, waistRisk(p.sex, w.cm).label)),
          h('dt', {}, 'Taille / Grösse'),
          h('dd', {}, `${fmt(whtr(w.cm, p.heightCm).ratio, 2)} `, badge(whtr(w.cm, p.heightCm).severity, whtr(w.cm, p.heightCm).label)),
          h('dt', {}, 'Zielumfang (Verhältnis < 0.5)'),
          h('dd', {}, `unter ${fmt(p.heightCm * 0.5, 1)} cm`),
          waist.length > 1 ? [h('dt', {}, `Seit ${fmtDate(firstW.date)}`), h('dd', {}, `${fmt(w.cm - firstW.cm, 1)} cm`)] : null,
        )
      : h(
          'p',
          { class: 'empty' },
          'Miss die Taille alle 2 Wochen morgens: auf Höhe des Bauchnabels, nach dem Ausatmen, Massband waagrecht.',
        ),
    h(
      'form',
      {
        class: 'inline-form',
        on: {
          submit: (e) => {
            e.preventDefault();
            const cm = num(new FormData(/** @type {HTMLFormElement} */ (e.target)), 'waist-cm');
            if (cm === null || cm < 40 || cm > 250) return ctx.toast('Bitte einen Umfang zwischen 40 und 250 cm eingeben.', 'error');
            ctx.commit((s) => void s.waist.push({ id: uid(), date: ctx.today, cm: Math.round(cm * 10) / 10 }), 'Taille gespeichert');
          },
        },
      },
      field({ id: 'waist-cm', label: 'Taille heute', inputmode: 'decimal', suffix: 'cm' }),
      h('button', { class: 'btn', type: 'submit', id: 'waist-save' }, 'Speichern'),
    ),
    h(
      'dl',
      { class: 'kv' },
      h('dt', {}, 'VO₂max (Garmin)'),
      h(
        'dd',
        {},
        vo2[0] ? `${fmt(vo2[0].value)} ml/kg/min` : '–',
        vo2[1] ? h('small', { class: 'muted' }, ` (vorher ${fmt(vo2[1].value)})`) : null,
      ),
    ),
    h(
      'form',
      {
        class: 'inline-form',
        on: {
          submit: (e) => {
            e.preventDefault();
            const v = num(new FormData(/** @type {HTMLFormElement} */ (e.target)), 'vo2');
            if (v === null || v < 10 || v > 90) return ctx.toast('VO₂max zwischen 10 und 90 eingeben.', 'error');
            ctx.commit((s) => void s.vo2max.push({ id: uid(), date: ctx.today, value: Math.round(v) }), 'VO₂max gespeichert');
          },
        },
      },
      field({ id: 'vo2', label: 'VO₂max heute', inputmode: 'numeric', suffix: 'ml/kg/min' }),
      h('button', { class: 'btn', type: 'submit', id: 'vo2-save' }, 'Speichern'),
    ),
    h('p', { class: 'muted small' }, 'Der Garmin-Wert ist eine Schätzung. Entscheidend ist der Verlauf über Monate.'),
  );
}

/** @param {Ctx} ctx */
function labCard(ctx) {
  const p = /** @type {NonNullable<typeof ctx.state.profile>} */ (ctx.state.profile);
  const latest = latestLabs(ctx.state.labs);
  const derived = derivedLabs(ctx.state.labs, (d) => ageOn(p.birthDate, d), p.sex);
  const def = findLab(labKey) ?? LABS[0];
  const units = def.units ?? [def.unit];

  const rows = LABS.filter((l) => latest[l.id]).map((l) => {
    const e = latest[l.id];
    const r = l.rate(e.value, { sex: p.sex, unit: e.unit });
    return h(
      'tr',
      {},
      h('th', { scope: 'row' }, l.name),
      h('td', { class: 'num' }, `${fmt(e.value, e.value < 10 ? 2 : e.value < 100 ? 1 : 0)} ${e.unit}`),
      h('td', {}, badge(r.severity, r.label), r.note ? h('div', { class: 'small muted' }, r.note) : null),
      h('td', { class: 'small muted' }, fmtDate(e.date)),
      h(
        'td',
        {},
        h(
          'button',
          {
            type: 'button',
            class: 'icon-btn',
            'aria-label': `${l.name} löschen`,
            on: { click: () => ctx.commit((s) => void (s.labs = s.labs.filter((x) => x.id !== e.id)), 'Wert gelöscht') },
          },
          '×',
        ),
      ),
    );
  });
  if (derived.egfr) {
    rows.push(
      h(
        'tr',
        { class: 'derived' },
        h('th', { scope: 'row' }, 'eGFR (CKD-EPI 2021)'),
        h('td', { class: 'num' }, `${fmt(derived.egfr.value)} ml/min/1.73 m²`),
        h(
          'td',
          {},
          badge(derived.egfr.severity, derived.egfr.label),
          derived.egfr.note ? h('div', { class: 'small muted' }, derived.egfr.note) : null,
        ),
        h('td', { class: 'small muted' }, fmtDate(derived.egfr.date)),
        h('td', {}),
      ),
    );
  }
  if (derived.fib4) {
    rows.push(
      h(
        'tr',
        { class: 'derived' },
        h('th', { scope: 'row' }, 'FIB-4 (Leberfibrose)'),
        h('td', { class: 'num' }, fmt(derived.fib4.value, 2)),
        h(
          'td',
          {},
          badge(derived.fib4.severity, derived.fib4.label),
          derived.fib4.note ? h('div', { class: 'small muted' }, derived.fib4.note) : null,
        ),
        h('td', { class: 'small muted' }, fmtDate(derived.fib4.date)),
        h('td', {}),
      ),
    );
  }

  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'lab-h' },
    h('h2', { id: 'lab-h' }, 'Laborwerte'),
    rows.length
      ? h(
          'div',
          { class: 'table-wrap' },
          h(
            'table',
            { class: 'lab-table' },
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                h('th', { scope: 'col' }, 'Wert'),
                h('th', { scope: 'col' }, 'Ergebnis'),
                h('th', { scope: 'col' }, 'Einordnung'),
                h('th', { scope: 'col' }, 'Datum'),
                h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, 'Aktion')),
              ),
            ),
            h('tbody', {}, ...rows),
          ),
        )
      : h(
          'p',
          { class: 'empty' },
          'Noch keine Laborwerte. Für den Check-up empfohlen: HbA1c, LDL, HDL, Triglyceride, ApoB, einmalig Lp(a), Kreatinin, ALT, AST, Thrombozyten und TSH. Aus Kreatinin berechnet die App die eGFR, aus AST, ALT und Thrombozyten den FIB-4-Index.',
        ),
    h(
      'form',
      {
        class: 'form-grid',
        on: {
          submit: (e) => {
            e.preventDefault();
            const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
            const v = num(fd, 'lab-value');
            if (v === null || v < 0) return ctx.toast('Bitte einen gültigen Wert eingeben.', 'error');
            const unit = str(fd, 'lab-unit') || def.unit;
            ctx.commit(
              (s) => void s.labs.push({ id: uid(), date: str(fd, 'lab-date') || ctx.today, key: def.id, value: v, unit }),
              `${def.name} gespeichert`,
            );
          },
        },
      },
      h(
        'div',
        { class: 'field' },
        h('label', { for: 'lab-key' }, 'Parameter'),
        h(
          'select',
          {
            id: 'lab-key',
            name: 'lab-key',
            on: {
              change: (e) => {
                labKey = /** @type {HTMLSelectElement} */ (e.target).value;
                ctx.go('gesundheit');
              },
            },
          },
          ...LABS.map((l) => h('option', { value: l.id, selected: l.id === def.id }, l.name)),
        ),
      ),
      field({ id: 'lab-value', label: 'Wert', inputmode: 'decimal', required: true }),
      select({ id: 'lab-unit', label: 'Einheit', value: units[0], options: units.map((u) => ({ value: u, label: u })) }),
      field({ id: 'lab-date', label: 'Datum der Blutentnahme', type: 'date', value: ctx.today, max: ctx.today }),
      h('button', { class: 'btn primary', type: 'submit', id: 'lab-save' }, 'Wert speichern'),
    ),
    h('p', { class: 'muted small' }, `Quelle für ${def.name}: ${def.source}.`),
  );
}

/** @param {Ctx} ctx */
function stopBangCard(ctx) {
  const snap = /** @type {NonNullable<Ctx['snap']>} */ (ctx.snap);
  // Objektive Angaben direkt aus dem Profil
  /** @type {Record<string, boolean>} */
  const auto = { b: snap.bmi.value > 35, a: snap.age > 50, g: snap.profile.sex === 'm' };
  const answers = { ...ctx.state.stopBang, ...auto };
  const r = stopBang(answers);
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'sb-h' },
    h('h2', { id: 'sb-h' }, 'Schlafapnoe-Check (STOP-BANG)'),
    h(
      'ul',
      { class: 'checklist' },
      ...STOP_BANG_ITEMS.map((it) =>
        h(
          'li',
          {},
          h(
            'label',
            { class: 'check' },
            h('input', {
              type: 'checkbox',
              id: `sb-${it.id}`,
              checked: Boolean(answers[it.id]),
              disabled: it.id in auto,
              on: {
                change: (e) => {
                  const v = /** @type {HTMLInputElement} */ (e.target).checked;
                  ctx.commit((s) => void (s.stopBang[it.id] = v));
                },
              },
            }),
            h('span', {}, it.text, it.id in auto ? h('small', {}, 'aus deinem Profil') : null),
          ),
        ),
      ),
    ),
    h('p', {}, h('strong', {}, `${r.score} von 8 Punkten `), badge(r.severity, r.label)),
    r.note ? h('p', { class: 'small' }, r.note) : null,
  );
}

/** @param {Ctx} ctx */
function preventionCard(ctx) {
  const snap = /** @type {NonNullable<Ctx['snap']>} */ (ctx.snap);
  const items = preventionItems(snap.age, snap.profile.sex);
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'prev-h' },
    h('h2', { id: 'prev-h' }, 'Vorsorge'),
    h(
      'ul',
      { class: 'prevention' },
      ...items.map((it) => {
        const done = ctx.state.prevention[it.id];
        const next = done && it.intervalYears ? addDays(done, Math.round(it.intervalYears * 365.25)) : null;
        const overdue = it.due && (!done || (next !== null && next <= ctx.today));
        const upcoming = !it.due;
        return h(
          'li',
          { class: upcoming ? 'later' : '' },
          h(
            'div',
            { class: 'prev-head' },
            h('strong', {}, it.title),
            upcoming
              ? badge('info', 'später')
              : overdue
                ? badge('warn', done ? 'fällig' : 'offen')
                : badge('ok', next ? `bis ${fmtDate(next)}` : 'erledigt'),
          ),
          h('p', { class: 'small muted' }, it.detail),
          upcoming
            ? null
            : h(
                'label',
                { class: 'inline-date' },
                h('span', {}, 'Zuletzt erledigt'),
                h('input', {
                  type: 'date',
                  id: `prev-${it.id}`,
                  value: done ?? '',
                  max: ctx.today,
                  on: {
                    change: (e) => {
                      const v = /** @type {HTMLInputElement} */ (e.target).value;
                      ctx.commit((s) => {
                        if (v) s.prevention[it.id] = v;
                        else delete s.prevention[it.id];
                      }, 'Vorsorge aktualisiert');
                    },
                  },
                }),
              ),
        );
      }),
    ),
  );
}
