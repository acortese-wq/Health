// @ts-check
// Mahlzeit-Check (wie Foodvisor): 1–5 Sterne pro Mahlzeit mit Lob und einem konkreten Tipp.
// Transparente Kriterien statt Blackbox; eine Orientierung, keine Diagnose.
//
// Kriterien und Belege:
// - Protein pro Hauptmahlzeit 25–30 g (Paddon-Jones D, Rasmussen BB, Curr Opin Clin Nutr Metab Care
//   2009;12:86–90), Zwischenmahlzeit ≥ 10 g.
// - Gemüse/Früchte: 5 Portionen pro Tag (SGE-Lebensmittelpyramide) → mind. 1 Portion pro Hauptmahlzeit.
// - Ballaststoffe ≥ 30 g pro Tag (SGE) → ca. 8 g pro Hauptmahlzeit; Vollkorn zählt ebenfalls.
// - Stark verarbeitete Lebensmittel (NOVA 4): im Versuch rund 500 kcal mehr pro Tag
//   (Hall KD et al., Cell Metab 2019;30:67–77).
// - Zucker: WHO < 10 % der Energie, besser < 5 % → mehr als 25 g in einer Mahlzeit ist viel.
// - Verarbeitetes Fleisch (Wurst): möglichst wenig (WCRF/AICR 2018).
// - Portionsgrösse: Hauptmahlzeit über 900 kcal, Zwischenmahlzeit über 350 kcal.

/**
 * @typedef {import('../store.js').FoodEntry} FoodEntry
 * @typedef {{ stars: number, good: string[], tip: string | null, main: boolean }} MealCheck
 */

/** @param {number} v */
const r0 = (v) => Math.round(v);

/**
 * Bewertung einer Mahlzeit (alle Einträge einer Mahlzeitgruppe).
 * @param {FoodEntry[]} entries
 * @param {boolean} main Hauptmahlzeit (Frühstück, Mittag, Abend) oder Zwischenmahlzeit
 * @returns {MealCheck | null} null ohne Einträge
 */
export function mealCheck(entries, main) {
  if (!entries.length) return null;
  const sum = (/** @type {(f: FoodEntry) => number | undefined} */ pick) => entries.reduce((a, f) => a + (pick(f) ?? 0), 0);
  const kcal = sum((f) => f.kcal);
  const protein = sum((f) => f.protein);
  const proteinKnown = entries.every((f) => f.proteinKnown !== false);
  const groupsKnown = entries.some((f) => f.groups && Object.keys(f.groups).length);
  const veg = sum((f) => (f.groups?.gemuese ?? 0) + (f.groups?.frucht ?? 0));
  const wholegrain = sum((f) => f.groups?.vollkorn ?? 0);
  const fiberKnown = entries.some((f) => typeof f.fiber === 'number');
  const fiber = sum((f) => f.fiber);
  const sugarKnown = entries.some((f) => typeof f.sugar === 'number');
  const sugar = sum((f) => f.sugar);
  const ultra = entries.filter((f) => f.nova === 4);
  const sausage = sum((f) => f.groups?.wurst ?? 0);

  let score = 3;
  /** @type {string[]} */
  const good = [];
  /** @type {{ weight: number, tip: string }[]} */
  const bad = [];

  if (main) {
    if (proteinKnown && protein >= 25) {
      score++;
      good.push(`Proteinreich (${r0(protein)} g)`);
    } else if (proteinKnown && protein < 15) {
      score--;
      bad.push({ weight: 3, tip: `Nur ${r0(protein)} g Protein: Quark, Ei, Hülsenfrüchte, Fisch oder Poulet dazu (Ziel 25–30 g).` });
    }
    if (groupsKnown && veg >= 1) {
      score++;
      good.push(veg >= 2 ? 'Viel Gemüse/Früchte' : 'Gemüse/Früchte dabei');
    } else if (groupsKnown) bad.push({ weight: 2, tip: 'Gemüse oder Salat dazu: ein halber Teller sättigt mit wenig Kalorien.' });
    if ((fiberKnown && fiber >= 8) || wholegrain > 0) {
      score++;
      good.push(wholegrain > 0 ? 'Vollkorn' : 'Ballaststoffreich');
    }
    if (kcal > 900) {
      score--;
      bad.push({ weight: 2, tip: `Grosse Portion (${r0(kcal)} kcal): Teller-Modell nutzen, ½ Gemüse, ¼ Protein, ¼ Beilage.` });
    }
  } else {
    if (proteinKnown && protein >= 10) {
      score++;
      good.push(`Mit Protein (${r0(protein)} g)`);
    }
    if (groupsKnown && (veg > 0 || entries.some((f) => (f.groups?.nuss ?? 0) > 0))) {
      score++;
      good.push(veg > 0 ? 'Frucht/Gemüse' : 'Nüsse');
    }
    if (kcal > 350) {
      score--;
      bad.push({ weight: 2, tip: `Grosser Snack (${r0(kcal)} kcal): eine Handvoll Nüsse, Joghurt oder Obst reicht meist.` });
    }
  }
  if (ultra.length) {
    score--;
    bad.push({
      weight: 3,
      tip: `Stark verarbeitet (${ultra[0].name}): Solche Produkte verleiten zum Mehressen; eine einfache Alternative mit wenigen Zutaten wählen.`,
    });
  } else if (good.length) good.push('Wenig verarbeitet');
  if (sugarKnown && sugar > (main ? 25 : 20)) {
    score--;
    bad.push({ weight: 1, tip: `Viel Zucker (${r0(sugar)} g): Süsses eher zum Essen als einzeln, ungesüsste Varianten wählen.` });
  }
  if (sausage > 0) {
    score--;
    bad.push({ weight: 1, tip: 'Wurstwaren: lieber Poulet, Fisch, Ei oder Hülsenfrüchte.' });
  }
  bad.sort((a, b) => b.weight - a.weight);
  // «Wenig verarbeitet» allein ist kein Lob, wenn sonst nichts gut war
  const praise = good.filter((g) => g !== 'Wenig verarbeitet' || good.length > 1);
  return { stars: Math.max(1, Math.min(5, score)), good: praise, tip: bad[0]?.tip ?? null, main };
}

/**
 * Durchschnittliche Sterne über mehrere Tage (nur Mahlzeiten mit Einträgen).
 * @param {MealCheck[]} checks
 * @returns {number | null}
 */
export function averageStars(checks) {
  if (!checks.length) return null;
  return Math.round((checks.reduce((a, c) => a + c.stars, 0) / checks.length) * 10) / 10;
}

/**
 * Sterne als Text (für Anzeige und Screenreader).
 * @param {number} n
 */
export function starText(n) {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}
