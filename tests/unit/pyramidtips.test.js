// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pyramidTips, dayContextText } from '../../app/js/domain/pyramidtips.js';
import { pyramid } from '../../app/js/domain/foodgroups.js';
import { clipText, userPrompt, parseEstimate } from '../../app/js/domain/foodvision.js';
import { FOODS } from '../../app/js/data/foods.js';

const prefs = { fisch: true, milch: true, fleisch: true, kantine: true };

test('KI-Tipp wird am Satzende gekürzt, nie mitten im Wort', () => {
  const long = `${'Für Fettabbau sind Nüsse nährstoffreich, aber kaloriendicht. '.repeat(8)}Als Nächstes eher mageres Protein, z. B. Magerquark.`;
  const c = clipText(long, 300);
  assert.ok(c.length <= 300);
  assert.ok(c.endsWith('.'), c);
  const noStop = clipText('wort '.repeat(100), 50);
  assert.ok(noStop.endsWith('…'));
  assert.equal(clipText('Kurz.', 300), 'Kurz.');
  const est = parseEstimate({ is_food: true, dish: 'Nüsse', items: [], assumptions: [], confidence: 'mittel', tip: long });
  assert.ok(est && est.tip.length > 300 && est.tip.length <= 600, 'langer Tipp bleibt vollständig bis 600 Zeichen');
});

test('Tageskontext geht in den Prompt (Gegessenes, Pyramide, Lücken)', () => {
  const pyr = pyramid({ today: [{ kcal: 500, groups: { staerke: 1 } }], week: [[{ kcal: 500, groups: { staerke: 1 } }]] });
  const ctx = dayContextText({ names: ['08:00 Brot'], pyramid: pyr, gaps: ['Vitamin C'] });
  assert.match(ctx, /Heute schon gegessen: 08:00 Brot/);
  assert.match(ctx, /Gemüse und Früchte/);
  assert.match(ctx, /Vitamin C/);
  const prompt = userPrompt({ hint: '', description: 'Nüsse', kcalLeft: -50, proteinLeft: 55, dayContext: ctx });
  assert.match(prompt, /Tageskontext: Heute schon gegessen/);
});

test('Pyramiden-Tipps: Protein und Gemüse zuerst, Budget wird eingehalten', () => {
  const pyr = pyramid({ today: [{ kcal: 900, groups: { staerke: 2 } }], week: [[{ kcal: 900, groups: { staerke: 2 } }]] });
  const r = pyramidTips({ pyramid: pyr, kcalLeft: 700, proteinLeft: 55, prefs, foods: FOODS, date: '2026-10-20' });
  assert.equal(r.budgetSpent, false);
  assert.equal(r.tips[0].id, 'protein');
  assert.ok(r.tips.some((t) => t.id === 'gemuese'));
  assert.ok(r.tips.reduce((a, t) => a + t.kcal, 0) <= 700);
  assert.equal(new Set(r.tips.map((t) => t.food.k)).size, r.tips.length, 'jedes Lebensmittel nur einmal');
});

test('Budget ausgeschöpft: nur noch kalorienarmes Gemüse', () => {
  const pyr = pyramid({ today: [{ kcal: 2100, groups: { staerke: 3 } }], week: [[{ kcal: 2100, groups: { staerke: 3 } }]] });
  const r = pyramidTips({ pyramid: pyr, kcalLeft: -50, proteinLeft: 10, prefs, foods: FOODS, date: '2026-10-20' });
  assert.equal(r.budgetSpent, true);
  assert.ok(r.tips.length >= 1);
  assert.ok(
    r.tips.every((t) => t.kcal <= 60 && t.food.gr?.[0] === 'gemuese'),
    JSON.stringify(r.tips.map((t) => [t.food.k, t.kcal])),
  );
});

test('Vorlieben: ohne Fisch und Milch keine solchen Vorschläge', () => {
  const pyr = pyramid({ today: [], week: [[]] });
  const r = pyramidTips({
    pyramid: pyr,
    kcalLeft: 1500,
    proteinLeft: 100,
    prefs: { fisch: false, milch: false, fleisch: true, kantine: true },
    foods: FOODS,
    date: '2026-10-20',
    limit: 10,
  });
  assert.ok(r.tips.length >= 4);
  assert.ok(r.tips.every((t) => !t.food.t.includes('fisch') && !t.food.t.includes('milch')));
});

test('Budget knapp überschritten, viel Protein offen: mageres Protein bis 120 kcal', () => {
  const pyr = pyramid({ today: [{ kcal: 2000, groups: { staerke: 3 } }], week: [[{ kcal: 2000, groups: { staerke: 3 } }]] });
  const r = pyramidTips({ pyramid: pyr, kcalLeft: -40, proteinLeft: 55, prefs, foods: FOODS, date: '2026-10-20' });
  const p = r.tips.find((t) => t.id === 'protein');
  assert.ok(p, 'Protein-Tipp vorhanden');
  assert.ok(p.kcal <= 120 && p.protein >= 15, `${p.food.k} ${p.kcal} kcal ${p.protein} g`);
  const far = pyramidTips({ pyramid: pyr, kcalLeft: -500, proteinLeft: 55, prefs, foods: FOODS, date: '2026-10-20' });
  assert.equal(
    far.tips.find((t) => t.id === 'protein'),
    undefined,
    'bei grosser Überschreitung nicht',
  );
});
