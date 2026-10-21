// @ts-check
// Mahlzeiten-Einträge als eigenständige Ereignisse: anlegen, erneut erfassen, Menge ändern,
// mögliche Doppelbuchungen erkennen und den Status eines Tages bestimmen.
//
// Regeln:
// - Jeder Verzehr ist ein eigener Eintrag mit eindeutiger ID und Zeitstempel («at»).
// - «Erneut erfassen» kopiert Lebensmittel und Portion, nie die ID («repeatOf» verweist auf das Original).
// - Gleiche Namen, Mengen oder Uhrzeiten sind kein Fehler (drei Äpfel am Tag sind drei Einträge).
// - Als mögliche Doppelbuchung gilt nur, was technisch nach Versehen aussieht: dieselbe ID
//   doppelt (z. B. Import, «dupOf») oder ein identischer Eintrag innerhalb von 90 Sekunden,
//   der nicht bewusst wiederholt wurde. Die App markiert, sie löscht nie selbst.
// - Ein zweiter identischer Tipp innerhalb von 0.6 Sekunden gilt als Doppeltipp und wird ignoriert.

/** @typedef {import('../store.js').FoodEntry} FoodEntry */

/** Doppeltipp-Schutz (ms). */
export const DOUBLE_TAP_MS = 600;
/** Zeitfenster, in dem identische, nicht wiederholte Einträge zur Prüfung markiert werden (ms). */
export const DUPLICATE_WINDOW_MS = 90 * 1000;

/**
 * Merkmale, an denen gleiche Einträge erkannt werden (nicht die ID).
 * @param {Pick<FoodEntry, 'name' | 'kcal' | 'protein'> & { grams?: number }} e
 */
export function signature(e) {
  return [e.name.trim().toLowerCase(), e.kcal, e.protein, e.grams ?? ''].join('|');
}

/**
 * Neuen Eintrag anlegen (eindeutige ID, Zeitstempel). Gibt null zurück, wenn derselbe Eintrag
 * eben erst angelegt wurde (Doppeltipp, doppeltes Absenden).
 * @param {FoodEntry[]} list bisherige Einträge des Tages
 * @param {Omit<FoodEntry, 'id'> & { id?: string }} fields
 * @param {{ id: string, now: Date }} o
 * @returns {FoodEntry | null}
 */
export function createEntry(list, fields, { id, now }) {
  const sig = signature(fields);
  const t = now.getTime();
  // Doppeltipp: gleicher Eintrag innerhalb von 0.6 s aus derselben Aktion. Nach dem Neuzeichnen
  // liegt unter dem Finger oft der eben angelegte Eintrag; dessen «Nochmal» zählt deshalb mit.
  const tapTwice = list.some(
    (x) =>
      x.at &&
      signature(x) === sig &&
      Math.abs(t - Date.parse(x.at)) < DOUBLE_TAP_MS &&
      (x.repeatOf === fields.repeatOf || x.id === fields.repeatOf),
  );
  if (tapTwice) return null;
  return { ...fields, id, at: now.toISOString() };
}

/** Felder, die nur zum ursprünglichen Essmoment gehören und nicht kopiert werden. */
const MOMENT_ONLY = /** @type {const} */ (['id', 'at', 'hunger', 'trigger', 'keep', 'dupOf', 'repeatOf']);

/**
 * Kopie eines Eintrags für eine weitere Portion (gleiches Lebensmittel, gleiche Menge, gleiche
 * Nährwertquelle). Neue ID und Zeit setzt createEntry bzw. der Aufrufer.
 * @param {FoodEntry} e
 * @param {string} time HH:MM
 * @returns {Omit<FoodEntry, 'id'>}
 */
export function repeatEntry(e, time) {
  /** @type {Record<string, unknown>} */
  const copy = { ...e };
  for (const k of MOMENT_ONLY) delete copy[k];
  return /** @type {Omit<FoodEntry, 'id'>} */ ({ ...copy, time, repeatOf: e.id });
}

const r1 = (/** @type {number} */ v) => Math.round(v * 10) / 10;
const r2 = (/** @type {number} */ v) => Math.round(v * 100) / 100;

/**
 * Menge ändern: alle Nährwerte im gleichen Verhältnis. Steht die Menge im Namen
 * («Apfel (150 g)», «Skyr, 150 g»), wird sie dort ebenfalls angepasst.
 * @template {Partial<FoodEntry> & { name: string, kcal: number, protein: number }} T
 * @param {T} e
 * @param {number} factor
 * @returns {T}
 */
export function scaleEntry(e, factor) {
  if (!(factor > 0) || factor === 1) return { ...e };
  /** @type {any} */
  const out = { ...e, kcal: Math.round(e.kcal * factor), protein: r1(e.protein * factor) };
  for (const k of /** @type {const} */ (['carbs', 'fat', 'sugar', 'satFat', 'fiber'])) {
    if (typeof e[k] === 'number') out[k] = r1(/** @type {number} */ (e[k]) * factor);
  }
  if (typeof e.salt === 'number') out.salt = r2(e.salt * factor);
  if (typeof e.grams === 'number') {
    out.grams = Math.round(e.grams * factor);
    out.name = e.name.replace(/(\(|, )(\d+(?:[.,]\d+)?) (g|ml)(\)?)$/, (_m, a, _n, u, b) => `${a}${out.grams} ${u}${b}`);
  }
  if (e.micros) {
    /** @type {Record<string, number>} */
    const m = {};
    for (const [k, v] of Object.entries(e.micros)) m[k] = r2(v * factor);
    out.micros = m;
  }
  if (e.groups) {
    /** @type {Record<string, number>} */
    const g = {};
    for (const [k, v] of Object.entries(e.groups)) g[k] = r2(v * factor);
    out.groups = g;
  }
  return out;
}

/** @param {string} t HH:MM */
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/**
 * Mögliche Doppelbuchungen eines Tages: ID des verdächtigen Eintrags → ID des früheren.
 * Bewusste Wiederholungen («repeatOf») und bestätigte Einträge («keep») zählen nie.
 * @param {FoodEntry[]} food
 * @returns {Map<string, string>}
 */
export function possibleDuplicates(food) {
  /** @type {Map<string, string>} */
  const out = new Map();
  const byId = new Map(food.map((f) => [f.id, f]));
  const sorted = [...food].sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''));
  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i];
    if (b.keep || b.repeatOf) continue;
    // Technische Kopie (gleiche ID beim Import): immer zur Prüfung
    if (b.dupOf && byId.has(b.dupOf)) {
      out.set(b.id, b.dupOf);
      continue;
    }
    if (!b.at) continue;
    for (let j = i - 1; j >= 0; j--) {
      const a = sorted[j];
      if (!a.at) continue;
      const dt = Date.parse(b.at) - Date.parse(a.at);
      if (dt > DUPLICATE_WINDOW_MS) break;
      // Uhrzeit höchstens 1 Minute auseinander (auch über eine Minutengrenze hinweg)
      if (signature(a) === signature(b) && Math.abs(toMin(a.time) - toMin(b.time)) <= 1) {
        out.set(b.id, a.id);
        break;
      }
    }
  }
  return out;
}

/**
 * Datenqualität der Einträge: welcher Anteil hat vollständige Makros, welche sind geschätzt,
 * bei welchen fehlt Protein.
 * @param {FoodEntry[]} food
 */
export function foodQuality(food) {
  const kcal = food.reduce((a, f) => a + f.kcal, 0);
  const noMacros = food.filter((f) => f.carbs === undefined || f.fat === undefined || f.proteinKnown === false);
  const noProtein = food.filter((f) => f.proteinKnown === false);
  const estimated = food.filter((f) => f.source === 'foto' || f.source === 'text');
  const macroKcal = food.filter((f) => !noMacros.includes(f)).reduce((a, f) => a + f.kcal, 0);
  return {
    kcal,
    entries: food.length,
    noMacros: noMacros.length,
    noProtein: noProtein.length,
    estimated: estimated.length,
    macroShare: kcal > 0 ? macroKcal / kcal : food.length ? 0 : 1,
  };
}

/**
 * @typedef {{ id: string, label: string, tone: 'ok' | 'info' | 'warn', detail: string }} StatusItem
 */

/**
 * Status eines Tages nach festen Regeln:
 * - Erfassung: «abgeschlossen», wenn der Tag als vollständig markiert ist; sonst «vorläufig»
 *   (heute) bzw. «offen» (vergangener Tag).
 * - Pflichtangaben: mindestens eine Mahlzeit mit Kalorien.
 * - Nährwerte: vollständig, wenn jeder Eintrag Protein, Kohlenhydrate und Fett hat.
 * - Plausibilität: Abgeschlossene Tage unter 50 % des Kalorienziels werden zur Prüfung markiert.
 * @param {{ food: FoodEntry[], complete: boolean, isToday: boolean, kcalTarget: number }} p
 * @returns {{ items: StatusItem[], final: boolean, nutrientsComplete: boolean }}
 */
export function dayStatus({ food, complete, isToday, kcalTarget }) {
  const q = foodQuality(food);
  /** @type {StatusItem[]} */
  const items = [];
  items.push(
    complete
      ? { id: 'closed', label: 'Abgeschlossen', tone: 'ok', detail: 'Als vollständig erfasst markiert.' }
      : isToday
        ? { id: 'open', label: 'Vorläufig', tone: 'info', detail: 'Der Tag läuft noch; die Werte können sich ändern.' }
        : {
            id: 'open',
            label: 'Nicht abgeschlossen',
            tone: 'warn',
            detail: 'Nicht als vollständig markiert; zählt nicht für den echten Verbrauch.',
          },
  );
  if (!food.length)
    items.push({ id: 'required', label: 'Noch keine Mahlzeit', tone: 'warn', detail: 'Pflichtangabe: mindestens eine Mahlzeit.' });
  if (food.length && q.noMacros)
    items.push({
      id: 'macros',
      label: 'Nährwerte unvollständig',
      tone: 'info',
      detail: `${q.noMacros} von ${q.entries} Einträgen ohne vollständige Makros${q.noProtein ? ` (${q.noProtein} ohne Protein)` : ''}. Summen sind Untergrenzen.`,
    });
  if (q.estimated)
    items.push({
      id: 'estimated',
      label: 'Enthält Schätzungen',
      tone: 'info',
      detail: `${q.estimated} Einträge per Foto oder Text geschätzt.`,
    });
  if (complete && kcalTarget > 0 && q.kcal < kcalTarget * 0.5)
    items.push({
      id: 'implausible',
      label: 'Ungewöhnlich wenig',
      tone: 'warn',
      detail: 'Abgeschlossen, aber unter der Hälfte des Ziels. Fehlt etwas? Solche Tage verfälschen die Verbrauchsberechnung.',
    });
  return { items, final: complete, nutrientsComplete: food.length > 0 && q.noMacros === 0 };
}
