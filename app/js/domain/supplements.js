// @ts-check
// Nahrungsergänzungsmittel: eigene Produkte, Einnahme pro Tag, Nährstoffe aus Präparaten
// und Prüfung gegen die tolerierbaren Höchstmengen (UL) der EFSA.
//
// Grundsätze: Nur deklarierte Werte zählen, unbekannte Angaben bleiben unbekannt. Präparate
// erscheinen in den Nährstoffsummen als eigene Quelle, verbessern aber nicht die «Abdeckung»
// der Ernährung. Folsäure zählt als Folat-Äquivalent (1 µg Folsäure mit dem Essen = 1.7 µg),
// die Höchstmenge gilt aber für die synthetische Folsäure allein.

import { SUPPLEMENT_TEMPLATES } from '../data/supplements.js';

/**
 * @typedef {import('./micros.js').NutrientKey} NutrientKey
 * @typedef {import('./micros.js').Amounts} Amounts
 * @typedef {import('../data/supplements.js').OtherIngredient} OtherIngredient
 * @typedef {{
 *   id: string, name: string, brand?: string, serving: string, perDay: number,
 *   nutrients: Partial<Record<NutrientKey, number>>, folicAcid?: number, nicotinamide?: boolean, suppMagnesium?: boolean,
 *   other: OtherIngredient[], unknown: string[], templateId?: string, templateRev?: number, source: string, checked?: string,
 *   active: boolean, createdAt: string,
 * }} Supplement
 * @typedef {{ id: string, sid: string, servings: number, time: string, dose?: number }} Intake
 */

/** Folsäure mit dem Essen in Folat-Äquivalente (IOM/D-A-CH-Konvention). */
export const FOLIC_TO_DFE = 1.7;

/**
 * Tolerierbare Höchstmengen für Erwachsene. scope: «gesamt» = Essen + Präparate,
 * «praeparat» = nur aus Präparaten. Quellen: EFSA Tolerable Upper Intake Levels (2006,
 * Aktualisierungen Vitamin D 2023, B6 2023, Selen 2023, Folsäure 2023, Eisen 2024).
 */
export const UPPER_LIMITS =
  /** @type {{ key: string, label: string, unit: string, limit: number, scope: 'gesamt' | 'praeparat', note?: string }[]} */ ([
    { key: 'vitD', label: 'Vitamin D', unit: 'µg', limit: 100, scope: 'gesamt' },
    { key: 'b6', label: 'Vitamin B6', unit: 'mg', limit: 12, scope: 'gesamt', note: 'Zu viel B6 über längere Zeit kann Nerven schädigen.' },
    { key: 'folicAcid', label: 'Folsäure (synthetisch)', unit: 'µg', limit: 1000, scope: 'praeparat' },
    { key: 'nicotinamide', label: 'Niacin als Nicotinamid', unit: 'mg', limit: 900, scope: 'praeparat' },
    { key: 'vitE', label: 'Vitamin E', unit: 'mg', limit: 300, scope: 'gesamt' },
    { key: 'zinc', label: 'Zink', unit: 'mg', limit: 25, scope: 'gesamt', note: 'Dauerhaft zu viel Zink verdrängt Kupfer.' },
    { key: 'selenium', label: 'Selen', unit: 'µg', limit: 255, scope: 'gesamt' },
    { key: 'iodine', label: 'Jod', unit: 'µg', limit: 600, scope: 'gesamt' },
    { key: 'calcium', label: 'Calcium', unit: 'mg', limit: 2500, scope: 'gesamt' },
    {
      key: 'suppMagnesium',
      label: 'Magnesium aus Präparaten',
      unit: 'mg',
      limit: 250,
      scope: 'praeparat',
      note: 'Darüber häufig Durchfall.',
    },
    {
      key: 'iron',
      label: 'Eisen',
      unit: 'mg',
      limit: 40,
      scope: 'gesamt',
      note: 'Sicherheitsgrenze der EFSA (2024); ohne Mangel kein Eisen zusätzlich.',
    },
  ]);

/**
 * Produkt aus einer Vorlage.
 * @param {string} templateId
 * @param {{ id: string, now: string }} o
 * @returns {Supplement | null}
 */
export function fromTemplate(templateId, { id, now }) {
  const t = SUPPLEMENT_TEMPLATES.find((x) => x.id === templateId);
  if (!t) return null;
  return {
    id,
    name: t.name,
    brand: t.brand,
    serving: t.serving,
    perDay: t.perDay,
    nutrients: { ...t.nutrients },
    ...(t.folicAcid ? { folicAcid: t.folicAcid } : {}),
    ...(t.nicotinamide ? { nicotinamide: true } : {}),
    ...(t.suppMagnesium ? { suppMagnesium: true } : {}),
    other: t.other.map((o) => ({ ...o })),
    unknown: [...t.unknown],
    templateId: t.id,
    templateRev: t.rev,
    source: t.source,
    checked: t.checked,
    active: true,
    createdAt: now,
  };
}

/**
 * Neuere Vorlage verfügbar (z. B. nach Abgleich mit der Packung)? Nur für unveränderte Produkte.
 * @param {Supplement} s
 */
export function templateUpdate(s) {
  const t = SUPPLEMENT_TEMPLATES.find((x) => x.id === s.templateId);
  if (!t || (s.templateRev ?? 1) >= t.rev || s.source.includes('eigene Ergänzung')) return null;
  return t;
}

/**
 * Produkt auf die neue Vorlage bringen; Name, Aktiv-Status, ID und Einnahmen bleiben.
 * @param {Supplement} s
 * @returns {Supplement}
 */
export function applyTemplate(s) {
  const fresh = s.templateId ? fromTemplate(s.templateId, { id: s.id, now: s.createdAt }) : null;
  return fresh ? { ...fresh, active: s.active } : s;
}

/**
 * Faktor alte Portion / neue Portion, gemessen an einem Nährstoff, den beide enthalten.
 * @param {Supplement} from
 * @param {Supplement} to
 */
export function servingFactor(from, to) {
  for (const [k, v] of Object.entries(from.nutrients)) {
    const w = to.nutrients[/** @type {NutrientKey} */ (k)];
    if (v && w) return Math.round((v / w) * 100) / 100;
  }
  return 1;
}

/**
 * Unveränderte Produkte aus Vorlagen auf die aktuelle Vorlage bringen. Ändert sich die Portion
 * (z. B. Mood: «2 Kapseln» → «1 Kapsel»), werden die gespeicherten Einnahmen so umgerechnet,
 * dass die Nährstoffmenge gleich bleibt.
 * @param {{ supplements: Supplement[], days: Record<string, { supps?: Intake[] }> }} state
 */
export function upgradeTemplates(state) {
  state.supplements = state.supplements.map((s) => {
    if (!templateUpdate(s)) return s;
    const next = applyTemplate(s);
    const f = servingFactor(s, next);
    if (f !== 1)
      for (const d of Object.values(state.days))
        if (d.supps) d.supps = d.supps.map((i) => (i.sid === s.id ? { ...i, servings: Math.round(i.servings * f * 100) / 100 } : i));
    return next;
  });
}

/**
 * Einnahmezeitpunkte: Bei 2–4 ganzen Portionen pro Tag einzeln abhakbar (z. B. Mood: morgens und
 * abends je 1 Kapsel), sonst eine Tagesdosis.
 * @param {Supplement} s
 * @returns {string[]}
 */
export function doseSlots(s) {
  if (!Number.isInteger(s.perDay) || s.perDay < 2 || s.perDay > 4) return [];
  if (s.perDay === 2) return ['Morgens', 'Abends'];
  if (s.perDay === 3) return ['Morgens', 'Mittags', 'Abends'];
  return ['1.', '2.', '3.', '4.'];
}

/**
 * Welche Einzeldosen eines Tages genommen sind. Einnahmen ohne Dosis (ältere Daten, «alle»)
 * füllen die Plätze der Reihe nach.
 * @param {Supplement} s
 * @param {Intake[] | undefined} intakes
 * @returns {boolean[]}
 */
export function takenDoses(s, intakes) {
  const slots = doseSlots(s);
  const mine = (intakes ?? []).filter((i) => i.sid === s.id);
  const taken = slots.map((_, k) => mine.some((i) => i.dose === k + 1));
  let rest = mine.filter((i) => !i.dose).reduce((a, i) => a + i.servings, 0);
  for (let k = 0; k < taken.length && rest >= 1; k++)
    if (!taken[k]) {
      taken[k] = true;
      rest -= 1;
    }
  return taken;
}

/**
 * Eine Einzeldosis abhaken oder zurücknehmen. Gibt die neuen Einnahmen des Tages zurück.
 * @param {Supplement} s
 * @param {Intake[] | undefined} intakes
 * @param {number} dose 1-basiert
 * @param {{ id: () => string, time: string }} o
 * @returns {Intake[]}
 */
export function toggleDose(s, intakes, dose, { id, time }) {
  const taken = takenDoses(s, intakes);
  const others = (intakes ?? []).filter((i) => i.sid !== s.id);
  const mine = (intakes ?? []).filter((i) => i.sid === s.id && i.dose);
  // Einnahmen ohne Dosis in Einzeldosen auflösen, damit jede einzeln zurückgenommen werden kann
  const explicit = taken.flatMap((t, k) =>
    t ? [mine.find((i) => i.dose === k + 1) ?? { id: id(), sid: s.id, servings: 1, time, dose: k + 1 }] : [],
  );
  const next = taken[dose - 1] ? explicit.filter((i) => i.dose !== dose) : [...explicit, { id: id(), sid: s.id, servings: 1, time, dose }];
  return [...others, ...next.sort((a, b) => (a.dose ?? 0) - (b.dose ?? 0))];
}

/**
 * Nährstoffe für eine Anzahl Portionen.
 * @param {Supplement} s
 * @param {number} servings
 */
export function supplementAmounts(s, servings) {
  /** @type {Amounts} */
  const micros = {};
  for (const [k, v] of Object.entries(s.nutrients)) micros[/** @type {NutrientKey} */ (k)] = round(v * servings);
  if (s.folicAcid) micros.folate = round((micros.folate ?? 0) + s.folicAcid * FOLIC_TO_DFE * servings);
  return {
    micros,
    folicAcid: (s.folicAcid ?? 0) * servings,
    nicotinamide: s.nicotinamide ? (s.nutrients.niacin ?? 0) * servings : 0,
    suppMagnesium: s.suppMagnesium || s.nutrients.magnesium ? (s.nutrients.magnesium ?? 0) * servings : 0,
    other: s.other.map((o) => ({ ...o, amount: round(o.amount * servings) })),
  };
}

/** @param {number} v */
function round(v) {
  return Math.round(v * 100) / 100;
}

/**
 * Einnahmen eines Tages als Einträge für die Nährstoffsummen (0 kcal, Quelle «etikett»).
 * @param {Supplement[]} supplements
 * @param {Intake[] | undefined} intakes
 */
export function intakeEntries(supplements, intakes) {
  const by = new Map(supplements.map((s) => [s.id, s]));
  return (intakes ?? []).flatMap((i) => {
    const s = by.get(i.sid);
    if (!s) return [];
    const a = supplementAmounts(s, i.servings);
    return [
      {
        id: `supp-${i.id}`,
        name: `${s.name} (Präparat)`,
        kcal: 0,
        protein: 0,
        time: i.time,
        micros: a.micros,
        microSrc: /** @type {const} */ ('etikett'),
        supplement: true,
      },
    ];
  });
}

/**
 * Summen aus Präparaten (für die Höchstmengen-Prüfung).
 * @param {Supplement[]} supplements
 * @param {Intake[] | undefined} intakes
 */
export function intakeTotals(supplements, intakes) {
  const by = new Map(supplements.map((s) => [s.id, s]));
  /** @type {Record<string, number>} */
  const t = {};
  for (const i of intakes ?? []) {
    const s = by.get(i.sid);
    if (!s) continue;
    const a = supplementAmounts(s, i.servings);
    for (const [k, v] of Object.entries(a.micros)) t[k] = (t[k] ?? 0) + v;
    t.folicAcid = (t.folicAcid ?? 0) + a.folicAcid;
    t.nicotinamide = (t.nicotinamide ?? 0) + a.nicotinamide;
    t.suppMagnesium = (t.suppMagnesium ?? 0) + a.suppMagnesium;
  }
  return t;
}

/**
 * Was die aktiven Produkte bei üblicher Einnahme zusammen liefern (für Warnungen beim Hinzufügen).
 * @param {Supplement[]} supplements
 */
export function plannedTotals(supplements) {
  return intakeTotals(
    supplements,
    supplements.filter((s) => s.active).map((s) => ({ id: s.id, sid: s.id, servings: s.perDay, time: '08:00' })),
  );
}

/**
 * Höchstmengen prüfen.
 * @param {Record<string, number>} supp Summen aus Präparaten
 * @param {Amounts} food Summen aus dem Essen
 * @returns {{ key: string, label: string, total: number, limit: number, unit: string, fromSupp: number, note?: string, near: boolean }[]}
 */
export function upperLimitCheck(supp, food) {
  /** @type {{ key: string, label: string, total: number, limit: number, unit: string, fromSupp: number, note?: string, near: boolean }[]} */
  const out = [];
  for (const u of UPPER_LIMITS) {
    const fromSupp = supp[u.key] ?? 0;
    if (!fromSupp) continue;
    const total = u.scope === 'gesamt' ? fromSupp + (food[/** @type {NutrientKey} */ (u.key)] ?? 0) : fromSupp;
    if (total >= u.limit * 0.8)
      out.push({
        key: u.key,
        label: u.label,
        total: round(total),
        limit: u.limit,
        unit: u.unit,
        fromSupp: round(fromSupp),
        note: u.note,
        near: total <= u.limit,
      });
  }
  return out;
}

/**
 * Doppelte Wirkstoffe in mehreren aktiven Produkten.
 * @param {Supplement[]} supplements
 */
export function overlaps(supplements) {
  const active = supplements.filter((s) => s.active);
  /** @type {Map<string, string[]>} */
  const by = new Map();
  for (const s of active) {
    const keys = [...Object.keys(s.nutrients), ...(s.folicAcid ? ['folicAcid'] : [])];
    for (const k of keys) by.set(k, [...(by.get(k) ?? []), s.name]);
  }
  return [...by.entries()].filter(([, names]) => names.length > 1).map(([key, names]) => ({ key, names }));
}

/**
 * Gespeichertes Produkt prüfen (Laden, Import).
 * @param {unknown} raw
 * @param {{ id: () => string, now: string, microKeys: readonly string[] }} o
 * @returns {Supplement | null}
 */
export function sanitizeSupplement(raw, { id, now, microKeys }) {
  if (typeof raw !== 'object' || raw === null) return null;
  const x = /** @type {Record<string, any>} */ (raw);
  const name = typeof x.name === 'string' ? x.name.trim().slice(0, 80) : '';
  if (!name) return null;
  const num = (/** @type {unknown} */ v, max = 100000) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : null);
  /** @type {Partial<Record<NutrientKey, number>>} */
  const nutrients = {};
  if (typeof x.nutrients === 'object' && x.nutrients) {
    for (const [k, v] of Object.entries(x.nutrients)) {
      const n = num(v);
      if (microKeys.includes(k) && n !== null) nutrients[/** @type {NutrientKey} */ (k)] = n;
    }
  }
  return {
    id: typeof x.id === 'string' && x.id ? x.id : id(),
    name,
    ...(typeof x.brand === 'string' && x.brand ? { brand: x.brand.slice(0, 80) } : {}),
    serving: typeof x.serving === 'string' && x.serving ? x.serving.slice(0, 80) : '1 Portion',
    perDay: num(x.perDay, 20) || 1,
    nutrients,
    ...(num(x.folicAcid) ? { folicAcid: /** @type {number} */ (num(x.folicAcid)) } : {}),
    ...(x.nicotinamide === true ? { nicotinamide: true } : {}),
    ...(x.suppMagnesium === true ? { suppMagnesium: true } : {}),
    other: Array.isArray(x.other)
      ? x.other.flatMap((/** @type {any} */ o) =>
          o && typeof o.label === 'string' && num(o.amount) !== null && typeof o.unit === 'string'
            ? [{ label: o.label.slice(0, 60), amount: /** @type {number} */ (num(o.amount)), unit: o.unit.slice(0, 10) }]
            : [],
        )
      : [],
    unknown: Array.isArray(x.unknown) ? x.unknown.filter((/** @type {any} */ u) => typeof u === 'string').slice(0, 20) : [],
    ...(typeof x.templateId === 'string' ? { templateId: x.templateId } : {}),
    ...(num(x.templateRev, 1000) ? { templateRev: /** @type {number} */ (num(x.templateRev, 1000)) } : {}),
    source: typeof x.source === 'string' ? x.source.slice(0, 200) : 'eigene Angaben',
    ...(typeof x.checked === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.checked) ? { checked: x.checked } : {}),
    active: x.active !== false,
    createdAt: typeof x.createdAt === 'string' ? x.createdAt : now,
  };
}
