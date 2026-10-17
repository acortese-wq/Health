// @ts-check
// Klinische Einordnungen. Jede Funktion nennt ihre Quelle. Die App stellt keine
// Diagnosen; sie ordnet Werte nach publizierten Grenzwerten ein und empfiehlt bei
// Auffälligkeiten die ärztliche Abklärung.

import { addDays, isNum, mean } from './util.js';

/** @typedef {'m' | 'f'} Sex */
/** @typedef {'ok' | 'info' | 'warn' | 'alert'} Severity */
/** @typedef {{ label: string, severity: Severity, note?: string }} Rating */

/**
 * @param {number} kg
 * @param {number} cm
 * @returns {number}
 */
export function bmi(kg, cm) {
  return kg / (cm / 100) ** 2;
}

/**
 * WHO-Klassifikation des BMI (Erwachsene).
 * @param {number} v
 * @returns {Rating}
 */
export function bmiClass(v) {
  if (v < 18.5) return { label: 'Untergewicht', severity: 'warn' };
  if (v < 25) return { label: 'Normalgewicht', severity: 'ok' };
  if (v < 30) return { label: 'Übergewicht (Präadipositas)', severity: 'info' };
  if (v < 35) return { label: 'Adipositas Grad I', severity: 'warn' };
  if (v < 40) return { label: 'Adipositas Grad II', severity: 'warn' };
  return { label: 'Adipositas Grad III', severity: 'alert' };
}

/**
 * Taillenumfang nach WHO (2008) / IDF, Europäer.
 * @param {Sex} sex
 * @param {number} cm
 * @returns {Rating}
 */
export function waistRisk(sex, cm) {
  const [inc, high] = sex === 'm' ? [94, 102] : [80, 88];
  if (cm >= high) return { label: 'Stark erhöhtes Risiko', severity: 'warn', note: `ab ${high} cm` };
  if (cm >= inc) return { label: 'Erhöhtes Risiko', severity: 'info', note: `ab ${inc} cm` };
  return { label: 'Kein erhöhtes Risiko', severity: 'ok', note: `unter ${inc} cm` };
}

/**
 * Taille-zu-Grösse-Verhältnis nach NICE (Leitlinie Adipositas, Update 2022).
 * @param {number} waistCm
 * @param {number} heightCm
 * @returns {{ ratio: number } & Rating}
 */
export function whtr(waistCm, heightCm) {
  const ratio = waistCm / heightCm;
  if (ratio >= 0.6) return { ratio, label: 'Hohes Risiko', severity: 'warn' };
  if (ratio >= 0.5) return { ratio, label: 'Erhöhtes Risiko', severity: 'info' };
  if (ratio >= 0.4) return { ratio, label: 'Gesunder Bereich', severity: 'ok' };
  return { ratio, label: 'Sehr niedrig', severity: 'info' };
}

/**
 * Blutdruck nach ESC-Leitlinie 2024 (McEvoy JW et al., Eur Heart J 2024;45:3912–4018).
 * Heimmessung: erhöht ab 120/70, Hypertonie ab 135/85. Praxis: Hypertonie ab 140/90.
 * @param {number} sys
 * @param {number} dia
 * @param {'home' | 'office'} setting
 * @returns {Rating}
 */
export function bpCategory(sys, dia, setting = 'home') {
  if (sys >= 180 || dia >= 110) {
    return {
      label: 'Stark erhöht',
      severity: 'alert',
      note: 'Nach 5 Min. Ruhe nachmessen. Bleibt der Wert so hoch: noch heute ärztlich abklären. Bei Brustschmerz, Atemnot, Lähmung, Sprach- oder Sehstörung: Notruf 144.',
    };
  }
  const [hs, hd] = setting === 'home' ? [135, 85] : [140, 90];
  if (sys >= hs || dia >= hd)
    return { label: 'Hypertonie-Bereich', severity: 'warn', note: 'Ärztlich bestätigen lassen (Messserie über 7 Tage).' };
  if (sys >= 120 || dia >= 70)
    return { label: 'Erhöht', severity: 'info', note: 'Lebensstil wirkt hier messbar: Gewicht, Bewegung, Salz, Schlaf.' };
  return { label: 'Nicht erhöht', severity: 'ok' };
}

/**
 * Mittelwert einer Heim-Messserie der letzten 7 Tage. ESC empfiehlt 7 Tage mit je
 * 2 Messungen morgens und abends; mind. 12 Messungen für eine verlässliche Aussage.
 * @param {{ date: string, sys: number, dia: number }[]} readings
 * @param {string} today
 * @returns {{ sys: number, dia: number, n: number, reliable: boolean } | null}
 */
export function bpSeriesMean(readings, today) {
  const from = addDays(today, -6);
  const win = readings.filter((r) => r.date >= from && r.date <= today);
  if (!win.length) return null;
  return {
    sys: Math.round(mean(win.map((r) => r.sys))),
    dia: Math.round(mean(win.map((r) => r.dia))),
    n: win.length,
    reliable: win.length >= 12,
  };
}

/**
 * eGFR nach CKD-EPI 2021 ohne Ethnie-Koeffizient (Inker LA et al., N Engl J Med
 * 2021;385:1737–1749).
 * @param {number} creatUmolL Serum-Kreatinin in µmol/l
 * @param {number} age
 * @param {Sex} sex
 * @returns {number} ml/min/1.73 m²
 */
export function egfrCkdEpi2021(creatUmolL, age, sex) {
  const scr = creatUmolL / 88.42;
  const k = sex === 'f' ? 0.7 : 0.9;
  const a = sex === 'f' ? -0.241 : -0.302;
  const r = scr / k;
  return 142 * Math.min(r, 1) ** a * Math.max(r, 1) ** -1.2 * 0.9938 ** age * (sex === 'f' ? 1.012 : 1);
}

/**
 * KDIGO-Stadium der Nierenfunktion.
 * @param {number} egfr
 * @returns {Rating}
 */
export function ckdStage(egfr) {
  if (egfr >= 90) return { label: 'G1 – normal', severity: 'ok' };
  if (egfr >= 60) return { label: 'G2 – leicht vermindert', severity: 'ok', note: 'Ohne Eiweiss im Urin meist keine Nierenerkrankung.' };
  if (egfr >= 45) return { label: 'G3a – leicht bis mässig vermindert', severity: 'warn' };
  if (egfr >= 30) return { label: 'G3b – mässig bis stark vermindert', severity: 'warn' };
  if (egfr >= 15) return { label: 'G4 – stark vermindert', severity: 'alert' };
  return { label: 'G5 – Nierenversagen', severity: 'alert' };
}

/**
 * FIB-4-Index zur Einschätzung einer Leberfibrose (Sterling RK et al., Hepatology
 * 2006;43:1317–1325). Grenzwerte nach EASL-EASD-EASO-Leitlinie MASLD 2024.
 * @param {{ age: number, ast: number, alt: number, plateletsG: number }} p
 * @returns {{ value: number } & Rating}
 */
export function fib4({ age, ast, alt, plateletsG }) {
  const value = (age * ast) / (plateletsG * Math.sqrt(alt));
  const low = age >= 65 ? 2.0 : 1.3;
  if (value < low) return { value, label: 'Niedriges Fibroserisiko', severity: 'ok' };
  if (value <= 2.67)
    return {
      value,
      label: 'Unklarer Bereich',
      severity: 'info',
      note: 'Weiterabklärung (z. B. Elastographie) mit dem Hausarzt besprechen.',
    };
  return { value, label: 'Erhöhtes Fibroserisiko', severity: 'warn', note: 'Ärztliche Abklärung empfohlen.' };
}

/**
 * STOP-BANG-Fragebogen für obstruktive Schlafapnoe (Chung F et al., Anesthesiology
 * 2008;108:812–821).
 * @param {Record<string, boolean>} answers
 * @returns {{ score: number } & Rating}
 */
export function stopBang(answers) {
  const score = STOP_BANG_ITEMS.reduce((n, it) => n + (answers[it.id] ? 1 : 0), 0);
  if (score >= 5) return { score, label: 'Hohes Risiko', severity: 'warn', note: 'Hausärztlich abklären lassen (Schlafuntersuchung).' };
  if (score >= 3)
    return { score, label: 'Mittleres Risiko', severity: 'info', note: 'Mit dem Hausarzt besprechen, besonders bei Tagesmüdigkeit.' };
  return { score, label: 'Niedriges Risiko', severity: 'ok' };
}

export const STOP_BANG_ITEMS = [
  { id: 's', text: 'Schnarchen Sie laut (durch geschlossene Türen hörbar)?' },
  { id: 't', text: 'Sind Sie tagsüber oft müde oder schläfrig?' },
  { id: 'o', text: 'Wurden Atemaussetzer im Schlaf beobachtet?' },
  { id: 'p', text: 'Haben Sie Bluthochdruck oder werden Sie dafür behandelt?' },
  { id: 'b', text: 'BMI über 35?' },
  { id: 'a', text: 'Alter über 50?' },
  { id: 'n', text: 'Halsumfang über 40 cm?' },
  { id: 'g', text: 'Männlich?' },
];

/**
 * @typedef {{
 *   id: string, name: string, unit: string, units?: string[],
 *   rate: (v: number, ctx: { sex: Sex, unit: string }) => Rating,
 *   source: string,
 * }} LabDef
 */

/** @type {LabDef[]} */
export const LABS = [
  {
    id: 'hba1c',
    name: 'HbA1c',
    unit: '%',
    units: ['%', 'mmol/mol'],
    source: 'ADA Standards of Care 2025, Diabetes Care 2025;48(Suppl 1)',
    rate(v, { unit }) {
      const pct = unit === 'mmol/mol' ? v / 10.929 + 2.15 : v;
      if (pct >= 6.5)
        return { label: 'Diabetes-Bereich', severity: 'alert', note: 'Bestätigung durch zweite Messung und ärztliche Beurteilung nötig.' };
      if (pct >= 5.7)
        return { label: 'Prädiabetes-Bereich', severity: 'warn', note: 'Gewichtsabnahme von 5–7 % senkt das Diabetesrisiko deutlich.' };
      return { label: 'Normal', severity: 'ok' };
    },
  },
  {
    id: 'glucose',
    name: 'Nüchternglukose',
    unit: 'mmol/l',
    source: 'ADA Standards of Care 2025',
    rate(v) {
      if (v >= 7.0) return { label: 'Diabetes-Bereich', severity: 'alert', note: 'Bestätigung und ärztliche Beurteilung nötig.' };
      if (v >= 5.6) return { label: 'Gestörte Nüchternglukose', severity: 'warn' };
      return { label: 'Normal', severity: 'ok' };
    },
  },
  {
    id: 'ldl',
    name: 'LDL-Cholesterin',
    unit: 'mmol/l',
    source: 'Mach F et al., ESC/EAS-Leitlinie Dyslipidämie, Eur Heart J 2020;41:111–188',
    rate(v) {
      if (v >= 4.9) return { label: 'Stark erhöht', severity: 'alert', note: 'Familiäre Hypercholesterinämie ärztlich abklären lassen.' };
      if (v >= 3.0)
        return {
          label: 'Über dem Zielwert bei niedrigem Risiko',
          severity: 'warn',
          note: 'Zielwert hängt vom Gesamtrisiko ab (AGLA-Risikorechner beim Hausarzt).',
        };
      return {
        label: 'Je nach Gesamtrisiko im Zielbereich',
        severity: 'info',
        note: 'Ziele: niedriges Risiko < 3.0, moderat < 2.6, hoch < 1.8, sehr hoch < 1.4 mmol/l.',
      };
    },
  },
  {
    id: 'apob',
    name: 'Apolipoprotein B',
    unit: 'g/l',
    source: 'ESC/EAS-Leitlinie Dyslipidämie 2019',
    rate(v) {
      if (v >= 1.0)
        return { label: 'Über den Zielwerten', severity: 'warn', note: 'Ziele: moderat < 1.0, hoch < 0.8, sehr hoch < 0.65 g/l.' };
      if (v >= 0.8)
        return { label: 'Bei moderatem Risiko im Ziel', severity: 'info', note: 'Ziele: moderat < 1.0, hoch < 0.8, sehr hoch < 0.65 g/l.' };
      return { label: 'Günstig', severity: 'ok' };
    },
  },
  {
    id: 'hdl',
    name: 'HDL-Cholesterin',
    unit: 'mmol/l',
    source: 'ESC/EAS-Leitlinie Dyslipidämie 2019',
    rate(v, { sex }) {
      const low = sex === 'm' ? 1.0 : 1.2;
      return v < low
        ? { label: 'Niedrig', severity: 'info', note: 'Bewegung und Gewichtsabnahme heben HDL leicht an.' }
        : { label: 'Unauffällig', severity: 'ok' };
    },
  },
  {
    id: 'tg',
    name: 'Triglyceride (nüchtern)',
    unit: 'mmol/l',
    source: 'ESC/EAS-Leitlinie Dyslipidämie 2019',
    rate(v) {
      if (v >= 10) return { label: 'Sehr stark erhöht', severity: 'alert', note: 'Pankreatitisrisiko, rasch ärztlich abklären.' };
      if (v >= 1.7) return { label: 'Erhöht', severity: 'warn' };
      return { label: 'Normal', severity: 'ok' };
    },
  },
  {
    id: 'lpa',
    name: 'Lipoprotein(a)',
    unit: 'nmol/l',
    units: ['nmol/l', 'mg/dl'],
    source: 'Kronenberg F et al., EAS-Konsensus, Eur Heart J 2022;43:3925–3946',
    rate(v, { unit }) {
      // Keine Umrechnung zwischen den Einheiten: der Faktor hängt von der Isoform ab.
      const [low, high, veryHigh] = unit === 'mg/dl' ? [30, 50, 180] : [75, 125, 430];
      if (v > veryHigh)
        return {
          label: 'Sehr stark erhöht',
          severity: 'alert',
          note: 'Risiko vergleichbar mit familiärer Hypercholesterinämie. Kardiologisch besprechen.',
        };
      if (v > high)
        return {
          label: 'Erhöht',
          severity: 'warn',
          note: 'Genetisch bedingt. Übrige Risikofaktoren konsequent senken, Familie informieren.',
        };
      if (v >= low) return { label: 'Grauzone', severity: 'info' };
      return { label: 'Niedrig', severity: 'ok', note: 'Einmalige Messung genügt in der Regel.' };
    },
  },
  {
    id: 'creatinine',
    name: 'Kreatinin',
    unit: 'µmol/l',
    source: 'Für eGFR (CKD-EPI 2021)',
    rate() {
      return { label: 'Siehe eGFR', severity: 'info' };
    },
  },
  {
    id: 'alt',
    name: 'ALT (GPT)',
    unit: 'U/l',
    source: 'Für FIB-4; Referenzbereich laborabhängig',
    rate() {
      return { label: 'Siehe FIB-4 und Laborbefund', severity: 'info' };
    },
  },
  {
    id: 'ast',
    name: 'AST (GOT)',
    unit: 'U/l',
    source: 'Für FIB-4; Referenzbereich laborabhängig',
    rate() {
      return { label: 'Siehe FIB-4 und Laborbefund', severity: 'info' };
    },
  },
  {
    id: 'platelets',
    name: 'Thrombozyten',
    unit: 'G/l',
    source: 'Für FIB-4',
    rate(v) {
      if (v < 150) return { label: 'Erniedrigt', severity: 'warn', note: 'Ärztlich beurteilen lassen.' };
      if (v > 450) return { label: 'Erhöht', severity: 'warn', note: 'Ärztlich beurteilen lassen.' };
      return { label: 'Im üblichen Bereich', severity: 'ok' };
    },
  },
  {
    id: 'vitd',
    name: '25-OH-Vitamin D',
    unit: 'nmol/l',
    source: 'Ross AC et al., J Clin Endocrinol Metab 2011;96:53–58 (IOM)',
    rate(v) {
      if (v < 30) return { label: 'Mangel', severity: 'warn', note: 'Supplementierung ärztlich besprechen.' };
      if (v < 50) return { label: 'Möglicherweise unzureichend', severity: 'info' };
      return { label: 'Ausreichend', severity: 'ok', note: 'Kein Nutzen zusätzlicher Supplemente belegt.' };
    },
  },
  {
    id: 'tsh',
    name: 'TSH',
    unit: 'mU/l',
    source: 'Referenzbereich laborabhängig',
    rate() {
      return { label: 'Referenzbereich des Labors beachten', severity: 'info' };
    },
  },
  {
    id: 'psa',
    name: 'PSA',
    unit: 'ng/ml',
    source: 'Bewertung nur ärztlich (Alter, Prostatavolumen, Verlauf)',
    rate() {
      return { label: 'Ärztlich beurteilen', severity: 'info' };
    },
  },
];

/**
 * @param {string} id
 * @returns {LabDef | undefined}
 */
export function findLab(id) {
  return LABS.find((l) => l.id === id);
}

/**
 * @typedef {{ id: string, date: string, key: string, value: number, unit: string }} LabEntry
 */

/**
 * Jeweils neuester Wert pro Laborparameter.
 * @param {LabEntry[]} labs
 * @returns {Record<string, LabEntry>}
 */
export function latestLabs(labs) {
  /** @type {Record<string, LabEntry>} */
  const out = {};
  for (const l of labs) if (!out[l.key] || out[l.key].date < l.date) out[l.key] = l;
  return out;
}

/**
 * Abgeleitete Laborwerte (eGFR, FIB-4), wenn die Rohwerte vorliegen.
 * Werte gelten nur als zusammengehörig, wenn sie höchstens 30 Tage auseinanderliegen.
 * @param {LabEntry[]} labs
 * @param {(date: string) => number} ageAt
 * @param {Sex} sex
 */
export function derivedLabs(labs, ageAt, sex) {
  const latest = latestLabs(labs);
  /** @type {{ egfr?: { value: number, date: string } & Rating, fib4?: { value: number, date: string } & Rating }} */
  const out = {};
  const cr = latest.creatinine;
  if (cr && isNum(cr.value) && cr.value > 0) {
    const value = egfrCkdEpi2021(cr.value, ageAt(cr.date), sex);
    out.egfr = { value, date: cr.date, ...ckdStage(value) };
  }
  const { ast, alt, platelets } = latest;
  if (ast && alt && platelets && alt.value > 0 && platelets.value > 0) {
    const dates = [ast.date, alt.date, platelets.date].sort();
    const spread = (Date.parse(dates[2]) - Date.parse(dates[0])) / 86_400_000;
    if (spread <= 30) {
      const age = ageAt(dates[2]);
      out.fib4 = { date: dates[2], ...fib4({ age, ast: ast.value, alt: alt.value, plateletsG: platelets.value }) };
    }
  }
  return out;
}

/**
 * Vorsorge-Checkliste (Schweiz). Altersgrenzen gemäss Schweizerischem Impfplan (BAG),
 * Krankenpflege-Leistungsverordnung (Darmkrebsvorsorge 50–69), ESC 2024, AGLA, ADA, EAS.
 * @param {number} age
 * @param {Sex} sex
 * @returns {{ id: string, title: string, detail: string, intervalYears: number | null, due: boolean }[]}
 */
export function preventionItems(age, sex) {
  const items = [
    { id: 'bp', title: 'Blutdruck', detail: 'Ab 40 jährlich messen (ESC 2024).', intervalYears: age >= 40 ? 1 : 3, due: true },
    {
      id: 'lipids',
      title: 'Lipide und Herz-Kreislauf-Risiko',
      detail: 'LDL, HDL, Triglyceride, wenn möglich ApoB. Risikoabschätzung mit dem AGLA-Rechner, alle 5 Jahre oder öfter bei Risiko.',
      intervalYears: 5,
      due: age >= 40,
    },
    {
      id: 'lpa',
      title: 'Lipoprotein(a)',
      detail: 'Einmal im Leben messen (EAS 2022). Genetisch festgelegt.',
      intervalYears: null,
      due: true,
    },
    {
      id: 'diabetes',
      title: 'Diabetes-Screening (HbA1c)',
      detail: 'Ab 35 alle 3 Jahre, bei Übergewicht früher und häufiger (ADA).',
      intervalYears: 3,
      due: age >= 35,
    },
    {
      id: 'colon',
      title: 'Darmkrebsvorsorge',
      detail:
        '50–69 Jahre: Stuhltest (FIT) alle 2 Jahre oder Darmspiegelung alle 10 Jahre. Grundversicherung übernimmt die Kosten (Franchise beachten).',
      intervalYears: 2,
      due: age >= 50 && age <= 69,
    },
    {
      id: 'psa',
      title: 'Prostata (PSA)',
      detail: '50–69 Jahre: kein generelles Screening. Vor- und Nachteile mit dem Hausarzt besprechen.',
      intervalYears: null,
      due: sex === 'm' && age >= 50 && age <= 69,
    },
    {
      id: 'dt',
      title: 'Tetanus/Diphtherie-Auffrischung',
      detail: 'Mit 25, 45 und 65 Jahren (Schweizerischer Impfplan).',
      intervalYears: 20,
      due: true,
    },
    { id: 'zoster', title: 'Gürtelrose-Impfung', detail: 'Ab 65 Jahren empfohlen (BAG).', intervalYears: null, due: age >= 65 },
    { id: 'flu', title: 'Grippeimpfung', detail: 'Ab 65 Jahren und bei Risikofaktoren jährlich.', intervalYears: 1, due: age >= 65 },
  ];
  return items;
}
