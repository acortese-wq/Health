// @ts-check
// Minimaler DOM-Baukasten. Inhalte werden ausschliesslich als Textknoten eingefügt
// (kein innerHTML), damit Nutzereingaben nie als Markup interpretiert werden.

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * @typedef {Node | string | number | null | undefined | false | unknown[]} Child
 * @typedef {{
 *   class?: string, text?: string, on?: Record<string, EventListener>,
 *   [attr: string]: unknown,
 * }} Props
 */

/**
 * @param {Element} el
 * @param {Props} props
 */
function applyProps(el, props) {
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.setAttribute('class', String(v));
    else if (k === 'text') el.textContent = String(v);
    else if (k === 'on')
      for (const [ev, fn] of Object.entries(/** @type {Record<string, EventListener>} */ (v))) el.addEventListener(ev, fn);
    else if (k === 'value' && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
      // Auch den Ausgangswert setzen, damit erkennbar bleibt, was der Benutzer geändert hat.
      el.defaultValue = String(v);
      el.value = String(v);
    } else if (k === 'value' && el instanceof HTMLSelectElement) el.value = String(v);
    else if (k === 'checked' && el instanceof HTMLInputElement) el.checked = Boolean(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
}

/**
 * @param {Element} el
 * @param {Child[]} children
 */
function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, /** @type {Child[]} */ (c));
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/**
 * HTML-Element erzeugen.
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Props} [props]
 * @param {...Child} children
 * @returns {HTMLElementTagNameMap[K]}
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  applyProps(el, props);
  append(el, children);
  return el;
}

/**
 * SVG-Element erzeugen.
 * @param {string} tag
 * @param {Props} [props]
 * @param {...Child} children
 * @returns {SVGElement}
 */
export function s(tag, props = {}, ...children) {
  const el = /** @type {SVGElement} */ (document.createElementNS(SVG_NS, tag));
  applyProps(el, props);
  append(el, children);
  return el;
}

/**
 * Zahl aus einem Eingabefeld (Komma oder Punkt), sonst null.
 * @param {FormData} fd
 * @param {string} name
 * @returns {number | null}
 */
export function num(fd, name) {
  const raw = fd.get(name);
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const v = Number(raw.replace(',', '.').replace(/[’'\s]/g, ''));
  return Number.isFinite(v) ? v : null;
}

/**
 * @param {FormData} fd
 * @param {string} name
 * @returns {string}
 */
export function str(fd, name) {
  const raw = fd.get(name);
  return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * Beschriftetes Eingabefeld.
 * @param {{ id: string, label: string, name?: string, type?: string, value?: unknown, hint?: string,
 *   step?: string, min?: string, max?: string, required?: boolean, inputmode?: string, placeholder?: string,
 *   suffix?: string }} o
 */
export function field(o) {
  const input = h('input', {
    id: o.id,
    name: o.name ?? o.id,
    type: o.type ?? 'text',
    value: o.value ?? '',
    step: o.step,
    min: o.min,
    max: o.max,
    required: o.required,
    inputmode: o.inputmode,
    placeholder: o.placeholder,
    'aria-describedby': o.hint ? `${o.id}-hint` : undefined,
  });
  return h(
    'div',
    { class: 'field' },
    h('label', { for: o.id }, o.label),
    o.suffix ? h('div', { class: 'with-suffix' }, input, h('span', { class: 'suffix' }, o.suffix)) : input,
    o.hint ? h('p', { class: 'hint', id: `${o.id}-hint` }, o.hint) : null,
  );
}

/**
 * @param {{ id: string, label: string, name?: string, value: string, options: { value: string, label: string }[], hint?: string }} o
 */
export function select(o) {
  const el = h('select', { id: o.id, name: o.name ?? o.id }, ...o.options.map((op) => h('option', { value: op.value }, op.label)));
  el.value = o.value;
  return h('div', { class: 'field' }, h('label', { for: o.id }, o.label), el, o.hint ? h('p', { class: 'hint' }, o.hint) : null);
}

/**
 * Statusabzeichen.
 * @param {'ok' | 'info' | 'warn' | 'alert'} severity
 * @param {string} label
 */
export function badge(severity, label) {
  return h('span', { class: `badge badge-${severity}` }, label);
}

/**
 * Fortschrittsbalken mit Beschriftung.
 * @param {{ value: number, target: number, label: string, unit: string, over?: 'bad' | 'good' }} o
 */
export function meter({ value, target, label, unit, over = 'bad' }) {
  const pct = target > 0 ? Math.min(value / target, 1.25) : 0;
  const state = value > target ? (over === 'bad' ? 'over' : 'done') : value >= target * 0.9 ? 'near' : '';
  // Breite über CSSOM setzen: Inline-style-Attribute blockiert die Content-Security-Policy.
  const fill = h('div', { class: 'meter-fill' });
  fill.style.width = `${(Math.min(pct, 1) * 100).toFixed(1)}%`;
  return h(
    'div',
    { class: `meter ${state}` },
    h(
      'div',
      { class: 'meter-head' },
      h('span', { class: 'meter-label' }, label),
      h('span', { class: 'meter-value' }, h('strong', {}, fmt(value)), ` / ${fmt(target)} ${unit}`),
    ),
    h(
      'div',
      {
        class: 'meter-track',
        role: 'progressbar',
        'aria-valuenow': String(Math.round(value)),
        'aria-valuemax': String(Math.round(target)),
        'aria-label': label,
      },
      fill,
    ),
  );
}

const nf0 = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('de-CH', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Zahl im Schweizer Format.
 * @param {number} v
 * @param {0 | 1 | 2} [digits]
 * @returns {string}
 */
export function fmt(v, digits = 0) {
  if (!Number.isFinite(v)) return '–';
  return (digits === 2 ? nf2 : digits === 1 ? nf1 : nf0).format(v);
}

/**
 * Vorzeichenbehaftete Zahl.
 * @param {number} v
 * @param {0 | 1 | 2} [digits]
 */
export function fmtSigned(v, digits = 1) {
  const r = fmt(Math.abs(v), digits);
  return v > 0 ? `+${r}` : v < 0 ? `−${r}` : r;
}

const dateLong = new Intl.DateTimeFormat('de-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const dateShort = new Intl.DateTimeFormat('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const dateDM = new Intl.DateTimeFormat('de-CH', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * @param {string} iso
 * @param {'long' | 'short' | 'dm'} [style]
 */
export function fmtDate(iso, style = 'short') {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (style === 'long' ? dateLong : style === 'dm' ? dateDM : dateShort).format(dt);
}

/**
 * Aktuelle Uhrzeit HH:MM.
 * @returns {string}
 */
export function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
