// Kontrastprüfung nach WCAG 2.2 (AA: mindestens 4.5:1 für normalen Text) für alle
// Farbpaare, die in der App als Text auf Fläche vorkommen, im hellen und dunklen Modus.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../../app/css/app.css', import.meta.url), 'utf8');

/** Token-Block nach Selektor lesen. */
function tokens(selectorStart) {
  const i = css.indexOf(selectorStart);
  assert.ok(i >= 0, `Block ${selectorStart} fehlt`);
  const body = css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
}

const light = tokens(':root {');
const dark = { ...light, ...tokens(":root[data-theme='dark'] {") };

function luminance(hex) {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const PAIRS = [
  ['ink', 'paper'],
  ['ink', 'surface'],
  ['ink', 'surface-2'],
  ['muted', 'surface'],
  ['muted', 'paper'],
  ['muted', 'surface-2'],
  ['petrol-ink', 'petrol'],
  ['petrol', 'surface'],
  ['petrol', 'petrol-soft'],
  ['ink', 'petrol-soft'],
  ['ok', 'ok-soft'],
  ['ok', 'surface'],
  ['info', 'info-soft'],
  ['warn', 'warn-soft'],
  ['warn', 'surface'],
  ['ink', 'ok-soft'],
  ['alert', 'alert-soft'],
  ['alert', 'surface'],
  ['ink', 'warn-soft'],
  ['ink', 'alert-soft'],
  ['ink', 'info-soft'],
  ['paper', 'ink'],
  ['petrol-soft', 'ink'],
];

for (const [name, theme] of [
  ['hell', light],
  ['dunkel', dark],
]) {
  test(`Kontrast ≥ 4.5:1 im ${name}en Modus`, () => {
    const failures = PAIRS.map(([fg, bg]) => [fg, bg, ratio(theme[fg], theme[bg])]).filter(([, , r]) => r < 4.5);
    assert.deepEqual(
      failures.map(([fg, bg, r]) => `${fg} auf ${bg}: ${r.toFixed(2)}`),
      [],
    );
  });
}
