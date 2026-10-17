// @ts-check
// Fotobasierte Mahlzeitenschätzung: Prompt, Antwortschema, Prüfung und Umrechnung.
// Ohne DOM und ohne Netzwerk, damit alles testbar bleibt.
//
// Genauigkeit: Auch Fachleute liegen bei Kalorienschätzungen von Fotos oft 20–40 %
// daneben, vor allem wegen unsichtbarer Fette (Öl, Butter, Rahm) und der Portionsgrösse.
// Die App zeigt deshalb immer eine Spanne und die getroffenen Annahmen.

import { clamp, isNum } from './util.js';

export const VISION_MODEL = 'claude-opus-5-5';

/**
 * @typedef {{
 *   name: string, portion: string, grams: number,
 *   kcal: number, kcalLow: number, kcalHigh: number,
 *   protein: number, carbs: number, fat: number,
 * }} MealItem
 * @typedef {{
 *   isFood: boolean, dish: string, items: MealItem[], assumptions: string[],
 *   confidence: 'hoch' | 'mittel' | 'niedrig', tip: string,
 * }} MealEstimate
 */

const ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'portion', 'grams', 'kcal', 'kcal_low', 'kcal_high', 'protein_g', 'carbs_g', 'fat_g'],
  properties: {
    name: { type: 'string', description: 'Bestandteil auf Deutsch, z. B. «Spaghetti, gekocht»' },
    portion: { type: 'string', description: 'Sichtbare Menge in Alltagssprache, z. B. «1 Teller, ca. 2 Schöpfkellen»' },
    grams: { type: 'number', description: 'Geschätztes Gewicht in Gramm (verzehrfertig)' },
    kcal: { type: 'number', description: 'Beste Schätzung in kcal' },
    kcal_low: { type: 'number', description: 'Untere plausible Grenze in kcal' },
    kcal_high: { type: 'number', description: 'Obere plausible Grenze in kcal' },
    protein_g: { type: 'number' },
    carbs_g: { type: 'number' },
    fat_g: { type: 'number' },
  },
};

/** JSON-Schema für strukturierte Ausgabe (output_config.format). */
export const MEAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['is_food', 'dish', 'items', 'assumptions', 'confidence', 'tip'],
  properties: {
    is_food: { type: 'boolean', description: 'false, wenn auf dem Bild keine Mahlzeit oder kein Getränk zu sehen ist' },
    dish: { type: 'string', description: 'Name des Gerichts auf Deutsch, z. B. «Spaghetti bolognese»' },
    items: { type: 'array', items: ITEM_SCHEMA },
    assumptions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Annahmen, die das Ergebnis stark beeinflussen (Öl, Sauce, Portionsgrösse, Zubereitung)',
    },
    confidence: { type: 'string', enum: ['hoch', 'mittel', 'niedrig'] },
    tip: { type: 'string', description: 'Ein kurzer, konkreter Tipp passend zu den Zielen der Person, oder leer' },
  },
};

export const SYSTEM_PROMPT = `Du bist Ernährungswissenschaftler und schätzt Mahlzeiten anhand von Fotos für ein persönliches Ernährungsprotokoll in der Schweiz.

Vorgehen:
- Erkenne das Gericht und zerlege es in die wichtigsten Bestandteile (höchstens 8), inklusive Saucen, Toppings und Getränke, die sichtbar sind.
- Schätze die Portion anhand von Bezugsgrössen im Bild (Tellergrösse ca. 26–28 cm, Besteck, Glas, Hand). Nenne die Grösse in Gramm (verzehrfertiges Gewicht).
- Verwende Nährwerte, wie sie in der Schweizer Nährwertdatenbank bzw. auf Schweizer Produkten üblich sind. Typische Schweizer Gerichte (z. B. Älplermagronen, Rösti, Capuns, Zürcher Geschnetzeltes) erkennst du als solche.
- Rechne unsichtbare Energie ein: Bratöl, Butter, Rahm, Dressing, Käse. Das ist die häufigste Fehlerquelle; nenne deine Annahme dazu ausdrücklich.
- Gib für jeden Bestandteil eine beste Schätzung und eine realistische Spanne an. Die Spanne soll die Unsicherheit ehrlich zeigen (bei Saucen und Frittiertem breiter).
- Wenn eine Angabe der Person vorliegt (z. B. «halbe Portion», «ohne Sauce»), hat sie Vorrang vor dem, was du im Bild vermutest.
- Erfinde nichts. Wenn das Bild unscharf oder kein Essen ist, setze is_food auf false bzw. confidence auf «niedrig».
- Schreibe auf Deutsch (Schweizer Rechtschreibung, «ss» statt «ß»).`;

/**
 * Nutzertext für die Anfrage.
 * @param {{ hint: string, proteinLeft: number | null, kcalLeft: number | null }} p
 * @returns {string}
 */
export function userPrompt({ hint, proteinLeft, kcalLeft }) {
  const lines = ['Schätze diese Mahlzeit.'];
  if (hint.trim()) lines.push(`Angabe der Person: «${hint.trim().slice(0, 300)}»`);
  if (kcalLeft !== null && proteinLeft !== null) {
    lines.push(
      `Kontext für den Tipp: Heute noch ca. ${Math.round(kcalLeft)} kcal und ${Math.round(proteinLeft)} g Protein bis zum Tagesziel. Ziel ist Fettabbau bei Muskelerhalt.`,
    );
  }
  return lines.join('\n');
}

/**
 * @param {unknown} v
 * @param {number} max
 */
function num(v, max) {
  return isNum(v) ? clamp(v, 0, max) : 0;
}

/**
 * Prüft und normalisiert die Modellantwort. Wirft bei unbrauchbarer Struktur.
 * @param {unknown} raw
 * @returns {MealEstimate}
 */
export function parseEstimate(raw) {
  if (typeof raw !== 'object' || raw === null) throw new Error('Die Antwort enthält keine Schätzung.');
  const r = /** @type {Record<string, unknown>} */ (raw);
  const items = Array.isArray(r.items) ? r.items : [];
  /** @type {MealItem[]} */
  const parsed = [];
  for (const it of items.slice(0, 12)) {
    if (typeof it !== 'object' || it === null) continue;
    const x = /** @type {Record<string, unknown>} */ (it);
    const kcal = num(x.kcal, 5000);
    // Spanne sicher um den Schätzwert legen, auch wenn das Modell sie vertauscht.
    const lo = Math.min(num(x.kcal_low, 5000) || kcal, kcal);
    const hi = Math.max(num(x.kcal_high, 5000) || kcal, kcal);
    parsed.push({
      name: typeof x.name === 'string' && x.name.trim() ? x.name.trim().slice(0, 80) : 'Bestandteil',
      portion: typeof x.portion === 'string' ? x.portion.trim().slice(0, 120) : '',
      grams: Math.round(num(x.grams, 3000)),
      kcal: Math.round(kcal),
      kcalLow: Math.round(lo),
      kcalHigh: Math.round(hi),
      protein: Math.round(num(x.protein_g, 300)),
      carbs: Math.round(num(x.carbs_g, 600)),
      fat: Math.round(num(x.fat_g, 300)),
    });
  }
  const confidence = r.confidence === 'hoch' || r.confidence === 'niedrig' ? r.confidence : 'mittel';
  return {
    isFood: r.is_food !== false,
    dish: typeof r.dish === 'string' && r.dish.trim() ? r.dish.trim().slice(0, 80) : 'Mahlzeit',
    items: parsed,
    assumptions: Array.isArray(r.assumptions)
      ? r.assumptions
          .filter((a) => typeof a === 'string' && a.trim())
          .map((a) => a.trim().slice(0, 200))
          .slice(0, 6)
      : [],
    confidence,
    tip: typeof r.tip === 'string' ? r.tip.trim().slice(0, 300) : '',
  };
}

/**
 * Summen über die gewählten Bestandteile, skaliert mit dem Portionsfaktor.
 * @param {MealItem[]} items
 * @param {number} factor z. B. 0.5 für eine halbe Portion
 */
export function totals(items, factor = 1) {
  const f = clamp(factor, 0.1, 3);
  const sum = (/** @type {(i: MealItem) => number} */ pick) => Math.round(items.reduce((a, i) => a + pick(i), 0) * f);
  return {
    kcal: sum((i) => i.kcal),
    kcalLow: sum((i) => i.kcalLow),
    kcalHigh: sum((i) => i.kcalHigh),
    protein: sum((i) => i.protein),
    carbs: sum((i) => i.carbs),
    fat: sum((i) => i.fat),
  };
}

/**
 * Plausibilitätsprüfung: Energie aus Makronährstoffen (Atwater 4/4/9) gegen die
 * angegebenen kcal. Grosse Abweichung → Hinweis anzeigen.
 * @param {{ kcal: number, protein: number, carbs: number, fat: number }} t
 * @returns {boolean} true, wenn die Angaben stimmig sind (±25 %)
 */
export function macrosConsistent(t) {
  if (t.kcal < 50) return true;
  const fromMacros = 4 * t.protein + 4 * t.carbs + 9 * t.fat;
  return Math.abs(fromMacros - t.kcal) / t.kcal <= 0.25;
}
