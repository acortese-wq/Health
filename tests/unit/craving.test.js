import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cravingPlan, cravingStats, QUESTIONS, pickTips, pickKind, cravingReasons } from '../../app/js/domain/craving.js';
import { emptyState, sanitize, SCHEMA_VERSION } from '../../app/js/store.js';

const ctx = { kcalLeft: 600, hour: 16 };

test('Vier Fragen', () => {
  assert.equal(QUESTIONS.length, 4);
  assert.deepEqual(
    QUESTIONS.map((q) => q.id),
    ['lastMeal', 'apple', 'trigger', 'intensity'],
  );
});

test('Echter Hunger: lange nichts gegessen und offen für «irgendwas» → essen, proteinreich, kein Timer', () => {
  const p = cravingPlan({ lastMeal: 'ueber4', apple: true, trigger: 'nichts', intensity: 6 }, ctx);
  assert.equal(p.kind, 'hunger');
  assert.equal(p.timerMin, 0);
  assert.ok(p.snacks.some((s) => s.includes('Skyr')));
  // Spätabends: Küche schliessen
  assert.ok(
    cravingPlan({ lastMeal: '2bis4', apple: true, trigger: 'nichts', intensity: 5 }, { kcalLeft: 600, hour: 22 }).steps.some((s) =>
      s.includes('Zähne'),
    ),
  );
});

test('Gerade gegessen: 10 Minuten abwarten, Strategie zum Auslöser', () => {
  const p = cravingPlan({ lastMeal: 'unter2', apple: true, trigger: 'muede', intensity: 4 }, ctx);
  assert.equal(p.kind, 'unklar');
  assert.equal(p.timerMin, 10);
  assert.ok(p.steps.some((s) => s.includes('Müdigkeit')));
  assert.ok(p.refs.some((r) => r.includes('Greer')));
});

test('Lust auf etwas Bestimmtes: Welle abwarten; stark → 15 Minuten und gehen', () => {
  const weak = cravingPlan({ lastMeal: '2bis4', apple: false, trigger: 'tv', intensity: 4 }, ctx);
  assert.equal(weak.kind, 'emotional');
  assert.equal(weak.timerMin, 10);
  assert.ok(weak.steps[0].includes('Teller'));
  const strong = cravingPlan({ lastMeal: '2bis4', apple: false, trigger: 'stress', intensity: 9 }, ctx);
  assert.equal(strong.timerMin, 15);
  assert.ok(strong.steps.some((s) => s.includes('zügig gehen')));
  assert.ok(strong.steps.some((s) => s.includes('kein Rückfall')));
  // Kaum Budget übrig: nur sehr leichte Snacks
  assert.ok(
    cravingPlan({ lastMeal: 'ueber4', apple: true, trigger: 'nichts', intensity: 5 }, { kcalLeft: 80, hour: 15 }).snacks.every(
      (s) => !s.includes('Skyr'),
    ),
  );
});

test('Bilanz und Speichern (Schema 6)', () => {
  assert.ok(SCHEMA_VERSION >= 6);
  const raw = JSON.parse(
    JSON.stringify({
      ...emptyState(),
      days: {
        '2026-11-14': {
          cravings: [
            { id: 'a', time: '21:10', trigger: 'tv', intensity: 8, after: 3, outcome: 'geschafft' },
            { id: 'b', time: '16:00', trigger: 'stress', intensity: 6, outcome: 'bewusst' },
            { id: 'c', time: '16:00', trigger: 'erfunden', intensity: 6 },
            { id: 'd', time: '16:00', trigger: 'stress', intensity: 11 },
          ],
        },
      },
    }),
  );
  const s = sanitize(raw);
  assert.equal(s.days['2026-11-14'].cravings?.length, 2);
  assert.deepEqual(cravingStats(['2026-11-14', '2026-11-13'], s.days), { n: 2, done: 1, avgDrop: 5 });
});

test('Ideen-Sammlung: über 300 Einträge, eindeutig, alle Arten, Belege im Zitierformat', async () => {
  const { CRAVING_TIPS } = await import('../../app/js/data/cravingtips.js');
  assert.ok(CRAVING_TIPS.length >= 300, `${CRAVING_TIPS.length}`);
  assert.equal(new Set(CRAVING_TIPS.map((t) => t.id)).size, CRAVING_TIPS.length);
  assert.equal(new Set(CRAVING_TIPS.map((t) => t.text)).size, CRAVING_TIPS.length);
  const kinds = new Set(CRAVING_TIPS.map((t) => t.kind));
  assert.deepEqual([...kinds].sort(), ['ablenkung', 'bewegung', 'fakt', 'kopf', 'trinken', 'umgebung', 'vorbeugen', 'warum']);
  for (const t of CRAVING_TIPS) {
    assert.ok(t.text.length > 15 && t.text.length < 260, t.id);
    if (t.ref) assert.match(t.ref, /\d{4}/, t.id);
  }
});

test('Ideen ziehen: keine Wiederholung, bis eine Art aufgebraucht ist; passende bevorzugt', async () => {
  const { CRAVING_TIPS } = await import('../../app/js/data/cravingtips.js');
  let seed = 1;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  /** @type {string[]} */
  let seen = [];
  const shown = new Set();
  // 25 Mal drei Ideen: 75 verschiedene, ohne Doppel
  for (let i = 0; i < 25; i++) {
    const r = pickTips(CRAVING_TIPS, { seen, trigger: 'tv', hour: 21, rng });
    assert.equal(r.tips.length, 3);
    assert.equal(r.tips[2].kind, 'fakt');
    assert.notEqual(r.tips[0].kind, r.tips[1].kind);
    for (const t of r.tips) {
      assert.ok(!shown.has(t.id), `doppelt: ${t.id}`);
      shown.add(t.id);
    }
    seen = r.seen;
  }
  // Fakten aufgebraucht → beginnt von vorn, ohne Fehler
  const facts = CRAVING_TIPS.filter((t) => t.kind === 'fakt').map((t) => t.id);
  const r = pickTips(CRAVING_TIPS, { seen: facts, rng });
  assert.equal(r.tips[r.tips.length - 1].kind, 'fakt');
  // Am Abend mit Fernseher kommen passende Ideen häufiger
  let fit = 0;
  for (let i = 0; i < 200; i++) {
    const x = pickTips(CRAVING_TIPS, { seen: [], trigger: 'tv', hour: 21, rng });
    fit += x.tips.slice(0, 2).filter((t) => t.tags?.some((g) => g === 'tv' || g === 'abend')).length;
  }
  assert.ok(fit > 150, `${fit}`);
});

test('Warum gerade jetzt: persönliche Gründe aus Tagesdaten, höchstens drei', async () => {
  const { CRAVING_TIPS } = await import('../../app/js/data/cravingtips.js');
  const base = {
    hour: 21,
    kcal: 800,
    kcalTarget: 2200,
    protein: 30,
    proteinTarget: 140,
    premenstrual: false,
    sameTrigger14: 0,
    triggerLabel: 'Fernseher/Handy',
  };
  const r = cravingReasons(
    { ...base, answers: { lastMeal: 'ueber4', apple: false, trigger: 'tv', intensity: 7 }, sleepH: 5.5 },
    CRAVING_TIPS,
  );
  assert.equal(r.length, 3);
  assert.match(r[0].text, /über 4 Stunden/);
  assert.match(r[1].text, /5\.5 h Schlaf/);
  assert.match(r[2].text, /30 g Protein von 140 g/);
  // Muster und Auslöser-Erklärung
  const m = cravingReasons(
    {
      ...base,
      hour: 12,
      kcal: 1500,
      protein: 100,
      sameTrigger14: 4,
      answers: { lastMeal: 'unter2', apple: false, trigger: 'tv', intensity: 5 },
    },
    CRAVING_TIPS,
  );
  assert.match(m[0].text, /4-mal bei «Fernseher\/Handy»/);
  assert.match(m[1].text, /Fernsehen/);
  // Ohne besondere Gründe: allgemeine Erklärung
  const g = cravingReasons(
    { ...base, hour: 12, kcal: 1500, protein: 100, answers: { lastMeal: 'unter2', apple: false, trigger: 'nichts', intensity: 3 } },
    CRAVING_TIPS,
  );
  assert.equal(g.length, 1);
});

test('Fürs nächste Mal: zwei verschiedene Vorbeuge-Tipps, passend bevorzugt, ohne Wiederholung', async () => {
  const { CRAVING_TIPS } = await import('../../app/js/data/cravingtips.js');
  let seen = /** @type {string[]} */ ([]);
  const shown = new Set();
  for (let i = 0; i < 20; i++) {
    const r = pickKind(CRAVING_TIPS, 'vorbeugen', { seen, tags: ['stress'], n: 2 });
    assert.equal(r.tips.length, 2);
    assert.notEqual(r.tips[0].id, r.tips[1].id);
    for (const t of r.tips) {
      assert.equal(t.kind, 'vorbeugen');
      assert.ok(!shown.has(t.id));
      shown.add(t.id);
    }
    seen = r.seen;
  }
  // Nach 50 Tipps beginnt es von vorn
  const again = pickKind(CRAVING_TIPS, 'vorbeugen', { seen, n: 2 });
  assert.equal(again.tips.length, 2);
});
