// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RECIPES, PRINCIPLES } from '../../app/js/data/recipes.js';
import { mealEntry } from '../../app/js/domain/mealplans.js';
import { emotionalSummary, STRATEGIES, EMOTIONAL } from '../../app/js/domain/emotional.js';
import { behaviorCheck } from '../../app/js/domain/behavior.js';
import { TRIGGERS, TRIGGER_TIPS } from '../../app/js/domain/meals.js';
import { sanitize } from '../../app/js/store.js';
import { addDays } from '../../app/js/domain/util.js';

const nutrition = (/** @type {import('../../app/js/data/recipes.js').Recipe} */ r) =>
  mealEntry({
    id: r.id,
    name: r.name,
    slots: [],
    parts: r.ingredients.filter((i) => i.k && i.g).map((i) => [/** @type {string} */ (i.k), i.g]),
  });

test('Rezepte: alle Zutaten in der Datenbank, plausible Werte, höchstens 2.5 g Salz', () => {
  const ids = new Set();
  for (const r of RECIPES) {
    assert.ok(!ids.has(r.id), `doppelte ID ${r.id}`);
    ids.add(r.id);
    const n = nutrition(r);
    assert.ok(n.kcal >= 150 && n.kcal <= 700, `${r.id}: ${n.kcal} kcal`);
    assert.ok(n.salt <= 2.5, `${r.id}: ${n.salt} g Salz`);
    assert.ok(r.steps.length >= 1);
    for (const p of r.principles)
      assert.ok(
        PRINCIPLES.some((x) => x.id === p),
        `${r.id}: Prinzip ${p}`,
      );
  }
  assert.ok(RECIPES.length >= 15);
  assert.ok(PRINCIPLES.every((p) => p.ref.length > 10 && ['hoch', 'mittel', 'schwach'].includes(p.evidence)));
});

test('Rezept-Tipps stimmen mit den berechneten Werten überein', () => {
  const by = (/** @type {string} */ id) => nutrition(/** @type {any} */ (RECIPES.find((r) => r.id === id)));
  const kab = by('kabeljau-paeckli');
  assert.ok(kab.protein >= 32 && kab.kcal <= 340, `Kabeljau ${kab.protein} g / ${kab.kcal} kcal`);
  assert.ok(by('quark-bowl').protein >= 27);
  assert.ok(by('hummus-sticks').kcal <= 330 * 0.6, 'gut die Hälfte einer Tüte Chips');
  assert.ok(by('salat-bohnen-ei').kcal <= 1080 * 0.6, 'rund die Hälfte des Burger-Menüs');
});

test('Emotionales Essen: Auslöser inkl. Fernseher und Frust, Strategien mit Quelle', () => {
  assert.ok(TRIGGERS.some((t) => t[0] === 'tv') && TRIGGERS.some((t) => t[0] === 'frust'));
  for (const t of EMOTIONAL) {
    assert.ok(STRATEGIES[t].ref.length > 10);
    assert.ok(TRIGGER_TIPS[t]);
  }
  const st = sanitize({
    schema: 2,
    days: { '2026-10-20': { food: [{ id: 'a', name: 'Chips', kcal: 300, protein: 4, time: '21:00', trigger: 'tv', hunger: 1 }] } },
  });
  assert.equal(st.days['2026-10-20'].food?.[0].trigger, 'tv', 'neuer Auslöser bleibt beim Laden erhalten');
});

test('Muster und Verhaltens-Check erkennen Essen vor dem Fernseher', () => {
  /** @type {Record<string, any>} */
  const days = {};
  const today = '2026-10-21';
  for (let i = 1; i <= 8; i++) {
    days[addDays(today, -i)] = {
      complete: true,
      food: [
        { id: `a${i}`, name: 'Skyr', kcal: 300, protein: 30, time: '07:30', hunger: 3, trigger: 'hunger' },
        { id: `b${i}`, name: 'Poulet, Reis', kcal: 700, protein: 45, time: '12:30', hunger: 2 },
        { id: `c${i}`, name: 'Gemüse, Fisch', kcal: 600, protein: 40, time: '18:30' },
        ...(i % 2 ? [{ id: `d${i}`, name: 'Nüsse', kcal: 350, protein: 8, time: '21:00', hunger: 1, trigger: 'tv' }] : []),
      ],
    };
  }
  // Gewohnheits-Znacht mit mittlerem Hunger ist kein emotionales Essen
  days[addDays(today, -1)].food.push({ id: 'z', name: 'Pasta', kcal: 700, protein: 30, time: '19:00', hunger: 2, trigger: 'gewohnheit' });
  const r = emotionalSummary(days, today);
  assert.equal(r.enough, true);
  assert.equal(r.top[0].trigger, 'tv');
  assert.equal(r.emotionalN, 4);
  assert.equal(r.emotionalKcal, 1400);
  assert.equal(r.eveningShare, 1);
  const b = behaviorCheck({ days, date: today, kcalTarget: 1900, proteinTarget: 130, bedtime: '23:30', fastingWindowH: 0 });
  const f = b.findings.find((x) => x.id === 'emotional');
  assert.ok(f, b.findings.map((x) => x.id).join(','));
  assert.match(f.title, /Fernseher/);
  assert.match(f.ref, /Robinson/);
});
