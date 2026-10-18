// @ts-check
// Blue Zones: Gewohnheiten der Regionen mit vielen Hundertjährigen (Okinawa, Sardinien,
// Ikaria, Nicoya, Loma Linda; «Power 9» nach Buettner D, Am J Lifestyle Med 2016;10:318–321).
//
// Ehrliche Einordnung: Ob die Regionen wirklich so alt werden, ist umstritten (Kritik an
// Geburtsregistern und Altersangaben, u. a. Newman 2019/2024, nicht begutachtet; die
// Blue-Zones-Forschenden widersprechen). Die einzelnen Gewohnheiten sind aber grösstenteils
// unabhängig belegt (Bewegung, Hülsenfrüchte, Pflanzenbetonung, soziale Bindungen, Sinn).
// «Ein Glas Wein am Tag» übernimmt die App bewusst nicht: Neuere Daten zeigen keinen Schutz.

/** @typedef {'auto' | 'self'} Kind */
/**
 * @typedef {{ id: string, title: string, text: string, kind: Kind, evidence: string }} BlueItem
 */

/** @type {BlueItem[]} */
export const BLUE_ITEMS = [
  {
    id: 'move',
    title: 'Natürlich bewegen',
    text: 'Viel Alltagsbewegung statt nur Sport: zu Fuss, Treppe, Garten. Ziel: im Schnitt 8000 Schritte.',
    kind: 'auto',
    evidence: 'Paluch AE et al., Lancet Public Health 2022;7:e219–e228',
  },
  {
    id: 'plant',
    title: 'Pflanzenbetont essen',
    text: 'Gemüse, Früchte, Vollkorn als Basis; Fleisch eher Beilage, wenige Male pro Woche.',
    kind: 'auto',
    evidence: 'SGE-Lebensmittelpyramide; Beobachtungsstudien',
  },
  {
    id: 'beans',
    title: 'Hülsenfrüchte fast täglich',
    text: 'Bohnen, Linsen, Kichererbsen, Tofu: in allen Blue Zones ein Grundnahrungsmittel. Ziel: mindestens 4 Portionen pro Woche.',
    kind: 'auto',
    evidence: 'Dosis-Wirkungs-Metaanalyse, Adv Nutr 2023 (PMID 36811595): +50 g/Tag ≈ 6 % geringere Gesamtsterblichkeit',
  },
  {
    id: 'eighty',
    title: '80-Prozent-Regel (Hara hachi bu)',
    text: 'Aufhören, wenn du dich zu 80 % satt fühlst; langsam essen, kleiner Teller, die grösste Mahlzeit früher am Tag.',
    kind: 'self',
    evidence: 'Plausibel über geringere Energiezufuhr; direkte Studien klein',
  },
  {
    id: 'purpose',
    title: 'Sinn (Ikigai, Plan de vida)',
    text: 'Wissen, wofür du morgens aufstehst: Aufgabe, Familie, Projekt, Engagement.',
    kind: 'self',
    evidence: 'Alimujiang A et al., JAMA Netw Open 2019;2:e194270',
  },
  {
    id: 'downshift',
    title: 'Täglich herunterfahren',
    text: 'Eine bewusste Pause pro Tag: Spaziergang, Gebet, Meditation, kurzer Mittagsschlaf, Musik.',
    kind: 'self',
    evidence: 'Chronischer Stress fördert Heisshunger und Bluthochdruck; Interventionsstudien heterogen',
  },
  {
    id: 'loved',
    title: 'Familie zuerst',
    text: 'Regelmässig echte Zeit mit Partnerin, Kindern, Eltern: gemeinsam essen, reden, unterwegs sein.',
    kind: 'self',
    evidence: 'Holt-Lunstad J et al., PLoS Med 2010;7:e1000316',
  },
  {
    id: 'tribe',
    title: 'Das richtige Umfeld',
    text: 'Freunde, die gesund leben, stecken an: gemeinsam laufen, kochen, wandern.',
    kind: 'self',
    evidence: 'Christakis NA, Fowler JH, N Engl J Med 2007;357:370–379',
  },
  {
    id: 'belong',
    title: 'Zugehörigkeit',
    text: 'Teil einer Gemeinschaft sein: Verein, Kirche, Nachbarschaft, Team, Freiwilligenarbeit.',
    kind: 'self',
    evidence: 'Holt-Lunstad J et al., PLoS Med 2010;7:e1000316',
  },
];

/**
 * Wochenstatus der Gewohnheiten. Messbare Punkte rechnet die App selbst aus,
 * die übrigen hakt man einmal pro Woche ab.
 * @param {{
 *   steps7: number | null, weekEquivalent: number,
 *   fvPerDay: number | null, meatWeek: number, beansWeek: number,
 *   checks: string[],
 * }} p
 */
export function blueZoneWeek({ steps7, weekEquivalent, fvPerDay, meatWeek, beansWeek, checks }) {
  const set = new Set(checks);
  const r1 = (/** @type {number} */ v) => Math.round(v * 10) / 10;
  /** @type {Record<string, { ok: boolean, detail: string } | null>} */
  const auto = {
    move:
      steps7 === null
        ? weekEquivalent > 0
          ? { ok: weekEquivalent >= 150, detail: `${Math.round(weekEquivalent)} Bewegungsminuten diese Woche (Schritte fehlen)` }
          : null
        : { ok: steps7 >= 8000, detail: `Ø ${Math.round(steps7).toLocaleString('de-CH')} Schritte` },
    plant:
      fvPerDay === null
        ? null
        : {
            ok: fvPerDay >= 4 && meatWeek <= 3,
            detail: `Ø ${r1(fvPerDay)} Portionen Gemüse/Früchte, ${r1(meatWeek)} Portionen Fleisch pro Woche`,
          },
    beans: { ok: beansWeek >= 4, detail: `${r1(beansWeek)} Portionen in 7 Tagen` },
  };
  const items = BLUE_ITEMS.map((it) => {
    if (it.kind === 'auto') {
      const a = auto[it.id];
      return { ...it, ok: a ? a.ok : false, detail: a ? a.detail : 'Noch zu wenige Daten', measured: Boolean(a) };
    }
    return { ...it, ok: set.has(it.id), detail: '', measured: false };
  });
  return { items, score: items.filter((i) => i.ok).length, total: items.length };
}
