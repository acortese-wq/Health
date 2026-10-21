// @ts-check
// Coaching-Hinweise und Warnsignale aus den Kennzahlen. Reihenfolge nach Dringlichkeit.

import { KCAL_FLOOR } from './energy.js';
import { formatDate } from './util.js';

/** @typedef {'alert' | 'warn' | 'info' | 'ok'} Severity */
/** @typedef {{ id: string, severity: Severity, title: string, text: string }} Hint */

/**
 * @typedef {{
 *   profile: { trainingMode?: 'kombi' | 'laufen', sex: 'm' | 'f', goalWeightKg: number, sleepTargetH: number, stepsTarget: number, caffeineMaxMg: number, proteinPerKg?: number },
 *   weightKg: number,
 *   slope: { slopeKgPerDay: number, n: number } | null,
 *   plan: { goalDatePassed: boolean, feasible: boolean, requiredRateKgPerWeek: number, maxRateKgPerWeek: number, projectedGoalDate: string | null, belowBmr: boolean, maintenance: boolean },
 *   kcalTarget: number,
 *   kcal7: { value: number, n: number } | null,
 *   proteinG: number,
 *   protein: { grams: number, referenceKg?: number },
 *   kcal: number,
 *   caffeine: { total: number, late: unknown[], atBedtime: number, cutoff: string, largeSingle: boolean },
 *   caffeine7: { value: number, n: number } | null,
 *   sleep7: { value: number, n: number } | null,
 *   steps7: { value: number, n: number } | null,
 *   rhr7: { value: number, n: number } | null,
 *   rhrBase: { value: number, n: number } | null,
 *   week: { strengthDays: number, aerobicMet: boolean, intervalDone: boolean },
 *   bpMean: { sys: number, dia: number, n: number, reliable: boolean, category: { severity: string, label: string, note?: string } } | null,
 *   adaptive: { tdee: number, days: number } | null,
 * }} CoachInput
 */

/**
 * @param {CoachInput} s
 * @returns {Hint[]}
 */
export function coachHints(s) {
  /** @type {Hint[]} */
  const out = [];
  const pct = (/** @type {number} */ x) => (x * 100).toFixed(1);

  if (s.bpMean && (s.bpMean.category.severity === 'alert' || s.bpMean.category.severity === 'warn')) {
    out.push({
      id: 'bp',
      severity: s.bpMean.category.severity === 'alert' ? 'alert' : 'warn',
      title: `Blutdruck ${s.bpMean.sys}/${s.bpMean.dia} mmHg (Mittel aus ${s.bpMean.n} Messungen)`,
      text: s.bpMean.category.note ?? 'Ärztlich abklären.',
    });
  }

  if (s.slope && s.slope.n >= 7) {
    const perWeek = -s.slope.slopeKgPerDay * 7;
    const ratePct = perWeek / s.weightKg;
    if (ratePct > 0.012) {
      out.push({
        id: 'too-fast',
        severity: 'warn',
        title: `Sehr schnelle Abnahme: ${pct(ratePct)} % pro Woche`,
        text: 'Über ca. 1 % pro Woche steigt der Muskelverlust, und das Gallensteinrisiko nimmt zu. Iss 150–200 kcal mehr pro Tag. In den ersten 2 Wochen ist ein schneller Verlust durch Wasser normal.',
      });
    }
  }

  if (s.kcal7 && s.kcal7.n >= 4 && s.kcal7.value < KCAL_FLOOR[s.profile.sex]) {
    out.push({
      id: 'too-low',
      severity: 'warn',
      title: `Zufuhr im Schnitt ${Math.round(s.kcal7.value)} kcal`,
      text: `Unter ${KCAL_FLOOR[s.profile.sex]} kcal pro Tag ist die Versorgung mit Nährstoffen und Protein schwer zu sichern. Ohne ärztliche Begleitung nicht empfohlen.`,
    });
  }

  if (!s.plan.maintenance && s.plan.goalDatePassed) {
    out.push({
      id: 'goal-date',
      severity: 'info',
      title: 'Zieldatum ist vorbei',
      text: `Das ist kein Scheitern: Lege im Profil ein neues Zieldatum fest. Bei gesundem Tempo wäre ${s.plan.projectedGoalDate ? formatDate(s.plan.projectedGoalDate) : 'ein späteres Datum'} realistisch.`,
    });
  } else if (!s.plan.maintenance && !s.plan.feasible) {
    out.push({
      id: 'goal-date',
      severity: 'info',
      title: 'Zieldatum zu ehrgeizig',
      text: `Benötigt wären ${s.plan.requiredRateKgPerWeek.toFixed(2)} kg pro Woche. Sinnvoll sind höchstens ${s.plan.maxRateKgPerWeek.toFixed(2)} kg pro Woche. Realistisches Zieldatum: ${s.plan.projectedGoalDate ? formatDate(s.plan.projectedGoalDate) : 'offen'}.`,
    });
  }

  if (s.rhr7 && s.rhrBase && s.rhr7.n >= 3 && s.rhrBase.n >= 10 && s.rhr7.value - s.rhrBase.value >= 7) {
    out.push({
      id: 'rhr',
      severity: 'info',
      title: `Ruhepuls ${Math.round(s.rhr7.value - s.rhrBase.value)} Schläge über deinem Durchschnitt`,
      text: 'Mögliche Ursachen: Infekt, Schlafmangel, Stress, zu viel Training oder ein zu grosses Defizit. Nimm 2–3 Tage leichter und beobachte, wie sich der Puls entwickelt. Bei Fieber gilt: kein Training.',
    });
  }

  // Schlaf-Regel: Bei kurzem Schlaf geht im Defizit mehr Muskel- statt Fettmasse verloren
  // (Nedeltcheva AV et al., Ann Intern Med 2010;153:435–441: 5.5 statt 8.5 h → 55 % weniger
  // Fettverlust bei gleichem Gewichtsverlust). Mehr Schlaf senkte die Zufuhr um ca. 270 kcal/Tag
  // (Tasali E et al., JAMA Intern Med 2022;182:365–374).
  if (s.sleep7 && s.sleep7.n >= 4 && s.sleep7.value < 6.5) {
    const inDeficit = !s.plan.maintenance;
    out.push({
      id: 'sleep',
      severity: inDeficit ? 'warn' : 'info',
      title: `Schlaf im Schnitt ${s.sleep7.value.toFixed(1)} h${inDeficit ? ': Defizit jetzt nicht vergrössern' : ''}`,
      text: `${inDeficit ? 'Mit wenig Schlaf verliert man im Defizit bei gleichem Gewichtsverlust deutlich weniger Fett und mehr Muskeln, und man isst mehr. Diese Woche das Kalorienziel nicht weiter senken und Schlaf zuerst verbessern. ' : 'Wer zu wenig schläft, isst messbar mehr (in einer Studie ca. 270 kcal pro Tag). '}So gelingt mehr Schlaf: feste Aufstehzeit auch am Wochenende, ${s.profile.sleepTargetH} h im Bett einplanen, Bildschirm 30–60 Min. vorher weg, Koffein nur bis zur Grenzzeit, Schlafzimmer kühl und dunkel.`,
    });
  }

  // Protein: 1.6 g/kg Referenzgewicht genügt für die meisten (Morton RW et al., Br J Sports Med 2018).
  // Frühere Voreinstellung war 1.9; wer sie nie geändert hat, bekommt einmal den Hinweis.
  if (s.profile.proteinPerKg === 1.9) {
    out.push({
      id: 'protein-default',
      severity: 'info',
      title: `Neue Empfehlung: Protein 1,6 statt 1,9 g/kg (≈ ${Math.round(((s.protein.referenceKg ?? s.protein.grams / 1.9) * 1.6) / 5) * 5} statt ${s.protein.grams} g)`,
      text: 'Die grösste Auswertung (49 Studien) findet ab ca. 1,6 g/kg kaum zusätzlichen Nutzen für die Muskeln. Mehr lohnt sich nur bei grossem Defizit oder viel Training. Anpassen unter Profil → Protein.',
    });
  }

  if (s.caffeine.late.length) {
    out.push({
      id: 'caffeine-late',
      severity: 'info',
      title: 'Koffein nach der Grenzzeit',
      text: `Beim Zubettgehen sind noch ca. ${Math.round(s.caffeine.atBedtime)} mg im Körper. Empfohlene Grenze: ${s.caffeine.cutoff} Uhr.`,
    });
  }
  if (s.caffeine7 && s.caffeine7.n >= 3 && s.caffeine7.value > s.profile.caffeineMaxMg) {
    out.push({
      id: 'caffeine-high',
      severity: 'info',
      title: `Koffein im Schnitt ${Math.round(s.caffeine7.value)} mg pro Tag`,
      text: `Über der Obergrenze von ${s.profile.caffeineMaxMg} mg. Reduziere langsam, eine Tasse weniger pro Woche, um Entzugskopfschmerzen zu vermeiden.`,
    });
  }

  if (s.profile.trainingMode !== 'laufen' && s.week.strengthDays < 2) {
    out.push({
      id: 'strength',
      severity: 'info',
      title: `Krafttraining diese Woche: ${s.week.strengthDays} von 2`,
      text: 'Krafttraining ist der wichtigste Schutz der Muskelmasse beim Abnehmen und im Alter.',
    });
  }

  if (s.steps7 && s.steps7.n >= 4 && s.steps7.value < s.profile.stepsTarget) {
    out.push({
      id: 'steps',
      severity: 'info',
      title: `Schritte im Schnitt ${Math.round(s.steps7.value).toLocaleString('de-CH')}`,
      text: `Ziel: ${s.profile.stepsTarget.toLocaleString('de-CH')}. Telefonate im Gehen, Treppe statt Lift, Wege zu Fuss.`,
    });
  }

  if (s.kcal > 0 && s.proteinG < s.protein.grams * 0.6 && s.kcal >= s.kcalTarget * 0.7) {
    out.push({
      id: 'protein',
      severity: 'info',
      title: 'Protein liegt zurück',
      text: `Heute ${Math.round(s.proteinG)} g von ${s.protein.grams} g. Iss als Nächstes proteinreich: Skyr, Quark, Fisch, Poulet, Eier, Hülsenfrüchte.`,
    });
  }

  if (!s.adaptive) {
    out.push({
      id: 'calibrate',
      severity: 'ok',
      title: 'Kalibrierung läuft',
      text: 'Wiege dich täglich und markiere Tage als «vollständig erfasst». Nach etwa 2–3 Wochen rechnet die App mit deinem tatsächlichen Verbrauch statt mit der Formel.',
    });
  }

  const order = { alert: 0, warn: 1, info: 2, ok: 3 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}
