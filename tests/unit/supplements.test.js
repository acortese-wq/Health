import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fromTemplate,
  supplementAmounts,
  intakeEntries,
  intakeTotals,
  plannedTotals,
  upperLimitCheck,
  overlaps,
  sanitizeSupplement,
  FOLIC_TO_DFE,
  templateUpdate,
  applyTemplate,
} from '../../app/js/domain/supplements.js';
import { SUPPLEMENT_TEMPLATES } from '../../app/js/data/supplements.js';
import { dayAmounts, MICRO_KEYS } from '../../app/js/domain/micros.js';
import { emptyState, sanitize, SCHEMA_VERSION } from '../../app/js/store.js';

const now = '2026-10-22T08:00:00.000Z';
const mood = /** @type {NonNullable<ReturnType<typeof fromTemplate>>} */ (fromTemplate('burgerstein-mood', { id: 'm', now }));
const supra = /** @type {NonNullable<ReturnType<typeof fromTemplate>>} */ (fromTemplate('supradyn-pro-energy', { id: 's', now }));

test('Vorlagen: nur bekannte Nährstoffschlüssel, Quelle und Belege vorhanden', () => {
  for (const t of SUPPLEMENT_TEMPLATES) {
    for (const k of Object.keys(t.nutrients)) assert.ok(MICRO_KEYS.includes(/** @type {any} */ (k)), `${t.id}: ${k}`);
    assert.ok(t.source && t.checked && t.evidence.length, t.id);
  }
  assert.equal(fromTemplate('gibt-es-nicht', { id: 'x', now }), null);
});

test('Mengen: Folsäure zählt als Folat-Äquivalent, Portionen skalieren', () => {
  const a = supplementAmounts(mood, 1);
  assert.equal(a.micros.folate, 500 * FOLIC_TO_DFE);
  assert.equal(a.folicAcid, 500);
  assert.equal(a.nicotinamide, 40);
  const b = supplementAmounts(supra, 2);
  assert.equal(b.micros.iron, 16);
  assert.equal(b.suppMagnesium, 160);
});

test('Packungswerte: Supradyn B6 4 mg, Mood Zink 5 mg; ältere Produkte bekommen ein Update-Angebot', () => {
  assert.equal(supra.nutrients.b6, 4);
  assert.deepEqual(supra.unknown, []);
  assert.equal(mood.nutrients.zinc, 5);
  const old = {
    ...supra,
    templateRev: undefined,
    nutrients: { ...supra.nutrients, b6: undefined },
    unknown: ['Vitamin B6'],
    active: false,
  };
  assert.ok(templateUpdate(old));
  const fresh = applyTemplate(old);
  assert.equal(fresh.nutrients.b6, 4);
  assert.equal(fresh.id, 's');
  assert.equal(fresh.active, false);
  assert.equal(templateUpdate(fresh), null);
  // Von Hand ergänzte Produkte werden nicht überschrieben
  assert.equal(templateUpdate({ ...old, source: 'x; eigene Ergänzung' }), null);
});

test('Pseudo-Einträge: 0 kcal, Etikettwerte, ändern die Abdeckung nicht', () => {
  const food = [{ kcal: 500, protein: 20, micros: { vitC: 10 }, microSrc: 'blv' }];
  const e = intakeEntries([mood], [{ id: 'i1', sid: 'm', servings: 1, time: '08:00' }]);
  assert.equal(e.length, 1);
  assert.equal(e[0].kcal, 0);
  assert.equal(e[0].microSrc, 'etikett');
  const r = dayAmounts([...food, ...e]);
  assert.equal(r.amounts.vitD, 15);
  assert.equal(r.coverage, 1);
  assert.equal(r.kcal, 500);
  // gelöschtes Produkt: Einnahme verfällt still
  assert.equal(intakeEntries([], [{ id: 'i1', sid: 'm', servings: 1, time: '08:00' }]).length, 0);
});

test('Mood + Supradyn: 930 µg Folsäure liegt nahe an der Höchstmenge, ein drittes Produkt darüber', () => {
  const t = plannedTotals([mood, supra]);
  assert.equal(t.folicAcid, 930);
  const w = upperLimitCheck(t, {}).find((x) => x.key === 'folicAcid');
  assert.ok(w && w.near);
  const extra = { ...mood, id: 'm2', name: 'Noch ein B-Komplex' };
  const w2 = upperLimitCheck(plannedTotals([mood, supra, extra]), {}).find((x) => x.key === 'folicAcid');
  assert.ok(w2 && !w2.near && w2.total === 1430);
  assert.deepEqual(
    overlaps([mood, supra])
      .map((o) => o.key)
      .sort(),
    ['b12', 'b5', 'b6', 'folicAcid', 'niacin', 'vitD', 'zinc'],
  );
});

test('Höchstmenge «gesamt» rechnet das Essen dazu, «Präparat» nicht', () => {
  const supp = intakeTotals([supra], [{ id: 'i', sid: 's', servings: 1, time: '08:00' }]);
  assert.equal(
    upperLimitCheck(supp, { zinc: 10 }).find((w) => w.key === 'zinc'),
    undefined,
  );
  assert.ok(upperLimitCheck(supp, { zinc: 25 }).find((w) => w.key === 'zinc' && !w.near));
  // Magnesium aus dem Essen zählt nicht gegen die Präparate-Grenze
  assert.equal(
    upperLimitCheck(supp, { magnesium: 600 }).find((w) => w.key === 'suppMagnesium'),
    undefined,
  );
  // Pausierte Produkte zählen nicht
  assert.equal(plannedTotals([{ ...supra, active: false }]).iron, undefined);
});

test('Speichern: Schema 4, ungültige Produkte und Einnahmen fallen weg, alte Daten bleiben lesbar', () => {
  assert.equal(SCHEMA_VERSION, 4);
  const st = emptyState();
  const raw = JSON.parse(
    JSON.stringify({
      ...st,
      supplements: [mood, { name: '' }, { ...supra, nutrients: { iron: -1, foo: 3, vitC: 180 } }],
      days: {
        '2026-10-22': {
          supps: [
            { id: 'a', sid: 'm', servings: 1, time: '08:00' },
            { sid: 'm', servings: 99, time: 'x' },
          ],
        },
      },
    }),
  );
  const s = sanitize(raw);
  assert.equal(s.supplements.length, 2);
  assert.deepEqual(s.supplements[1].nutrients, { vitC: 180 });
  assert.equal(s.days['2026-10-22'].supps?.length, 1);
  const old = sanitize({ ...JSON.parse(JSON.stringify(st)), schema: 3, supplements: undefined });
  assert.deepEqual(old.supplements, []);
  assert.equal(sanitizeSupplement(null, { id: () => 'x', now, microKeys: MICRO_KEYS }), null);
});
