// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blueZoneWeek, BLUE_ITEMS } from '../../app/js/domain/bluezones.js';
import { MEAL_TEMPLATES, mealEntry, suggestMeals } from '../../app/js/domain/mealplans.js';
import { dailyTargets } from '../../app/js/domain/micros.js';
import { EVIDENCE } from '../../app/js/domain/evidence.js';
import { sanitize } from '../../app/js/store.js';

test('Blue Zones: messbare Gewohnheiten automatisch, übrige abgehakt; kein Wein', () => {
  const r = blueZoneWeek({ steps7: 9100, weekEquivalent: 120, fvPerDay: 4.5, meatWeek: 2, beansWeek: 5, checks: ['purpose', 'loved'] });
  const ok = Object.fromEntries(r.items.map((i) => [i.id, i.ok]));
  assert.deepEqual(ok, {
    move: true,
    plant: true,
    beans: true,
    eighty: false,
    purpose: true,
    downshift: false,
    loved: true,
    tribe: false,
    belong: false,
  });
  assert.equal(r.score, 5);
  assert.equal(r.total, 9);
  const low = blueZoneWeek({ steps7: 6000, weekEquivalent: 0, fvPerDay: 2, meatWeek: 6, beansWeek: 1, checks: [] });
  assert.equal(low.score, 0);
  assert.match(low.items.find((i) => i.id === 'plant')?.detail ?? '', /6 Portionen Fleisch/);
  // Ohne Schritte: Bewegungsminuten als Ersatz
  assert.equal(
    blueZoneWeek({ steps7: null, weekEquivalent: 160, fvPerDay: null, meatWeek: 0, beansWeek: 0, checks: [] }).items[0].ok,
    true,
  );
  assert.ok(!BLUE_ITEMS.some((i) => /wein/i.test(i.title)));
  assert.ok(EVIDENCE.some((e) => e.id === 'alcohol' && e.level === 'unbelegt'));
  assert.ok(EVIDENCE.some((e) => e.id === 'blue-zones' && e.level === 'unsicher'));
});

test('Blue-Zones-Mahlzeiten: Hülsenfrüchte, genug Protein; bevorzugt bei wenig Hülsenfrüchten in der Woche', () => {
  for (const id of ['minestrone', 'ikaria', 'okinawa', 'nicoya']) {
    const t = MEAL_TEMPLATES.find((x) => x.id === id);
    assert.ok(t, id);
    const e = mealEntry(t);
    assert.ok((e.groups.huelsen ?? 0) + (e.groups.pflanzlProtein ?? 0) >= 1, id);
    assert.ok(e.protein >= 25, `${id}: ${e.protein}`);
  }
  const targets = dailyTargets({ kcalTarget: 1900, proteinG: 150, sex: 'm' });
  const base = {
    slot: /** @type {const} */ ('abend'),
    kcalLeft: 700,
    proteinLeft: 40,
    amounts: { protein: 110 },
    targets,
    prefs: { fisch: true, milch: true, fleisch: true, kantine: true },
    dayGroups: { gemuese: 3 },
    weekFish: 2,
    limit: 3,
  };
  const few = suggestMeals({ ...base, weekBeans: 0 });
  assert.ok(few.some((m) => m.highlights.includes('Hülsenfrüchte (Blue Zones)')));
  const many = suggestMeals({ ...base, weekBeans: 6 });
  assert.ok(!many.some((m) => m.highlights.includes('Hülsenfrüchte (Blue Zones)')));
});

test('Speicher: Blue-Zones-Häkchen pro Woche, nur bekannte Gewohnheiten', () => {
  const s = sanitize({ schema: 1, blueZones: { '2026-10-12': ['purpose', 'move', 'gift'], kaputt: ['purpose'] } });
  assert.deepEqual(s.blueZones, { '2026-10-12': ['purpose'] });
});
