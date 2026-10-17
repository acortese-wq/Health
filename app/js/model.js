// @ts-check
// Abgeleitete Kennzahlen aus dem gespeicherten Zustand für ein Datum.

import { ageOn, adaptiveTdee, bmrMifflin, formulaTdee, planTarget, proteinTarget } from './domain/energy.js';
import { emaTrend, projectGoalDate, rolling7, trendSlope, planWeightOn } from './domain/trend.js';
import { allowedCups, dayAssessment, taperPlan } from './domain/caffeine.js';
import { weekSummary } from './domain/training.js';
import { bmi, bmiClass, bpSeriesMean, bpCategory, whtr, waistRisk } from './domain/clinical.js';
import { coachHints } from './domain/coach.js';
import { addDays, isNum, mean } from './domain/util.js';
import { weightSeries } from './store.js';

/** @typedef {import('./store.js').State} State */
/** @typedef {import('./store.js').Profile} Profile */

/**
 * @param {State} state
 * @param {string} date
 */
export function snapshot(state, date) {
  const p = /** @type {Profile} */ (state.profile);
  const age = ageOn(p.birthDate, date);
  const series = weightSeries(state).filter((w) => w.date <= date);
  const trend = emaTrend(series);
  const lastTrend = trend.length ? trend[trend.length - 1].kg : null;
  const slope = trendSlope(series, date);
  const avg7 = rolling7(series, date);
  // Referenzgewicht für Berechnungen: robuster Trendwert, sonst letzte Messung, sonst Start.
  const weightKg = slope?.levelKg ?? lastTrend ?? p.startWeightKg;

  const bmr = bmrMifflin({ sex: p.sex, weightKg, heightCm: p.heightCm, age });
  const tdeeFormula = formulaTdee({ sex: p.sex, weightKg, heightCm: p.heightCm, age, activity: p.activity });

  // Adaptiver Bedarf aus den vollständig erfassten Tagen der letzten 21 Tage.
  const intakes = [];
  for (let i = 0; i < 21; i++) {
    const d = state.days[addDays(date, -i)];
    if (d?.complete && d.food?.length) intakes.push(d.food.reduce((a, f) => a + f.kcal, 0));
  }
  const adaptive = adaptiveTdee({ intakes, slopeKgPerDay: slope?.slopeKgPerDay ?? null });
  const tdee = adaptive?.tdee ?? tdeeFormula;

  const plan = planTarget({ sex: p.sex, tdee, bmr, weightKg, goalWeightKg: p.goalWeightKg, today: date, goalDate: p.goalDate });
  const kcalTarget = p.kcalOverride ?? plan.kcal;
  const protein = proteinTarget({ weightKg, goalWeightKg: p.goalWeightKg, heightCm: p.heightCm, gPerKg: p.proteinPerKg });

  const day = state.days[date] ?? {};
  const food = day.food ?? [];
  const kcal = food.reduce((a, f) => a + f.kcal, 0);
  const proteinG = food.reduce((a, f) => a + f.protein, 0);

  const doses = (day.caffeine ?? []).map((c) => ({ time: c.time, mg: c.mg }));
  const caffeine = dayAssessment(doses, {
    bedtime: p.bedtime,
    cutoffH: p.caffeineCutoffH,
    halfLifeH: p.caffeineHalfLifeH,
    maxMg: p.caffeineMaxMg,
  });
  const taper =
    p.caffeineStartCups > p.caffeineTargetCups
      ? taperPlan({ startDate: p.caffeineTaperStart, startCups: p.caffeineStartCups, targetCups: p.caffeineTargetCups })
      : [];
  const cupsAllowed = allowedCups(taper, date);

  const week = weekSummary(state.workouts, date);

  const planLine = { startDate: p.startDate, startKg: p.startWeightKg, goalDate: p.goalDate, goalKg: p.goalWeightKg };
  const planKgToday = planWeightOn(planLine, date);
  const projected = slope
    ? projectGoalDate({ levelKg: slope.levelKg, slopeKgPerDay: slope.slopeKgPerDay, goalKg: p.goalWeightKg, today: date })
    : null;

  // 7-Tage-Mittel für Schlaf, Schritte, Ruhepuls; Ruhepuls-Basis aus den 28 Tagen davor.
  /** @param {(d: import('./store.js').Day) => number | undefined} pick @param {number} from @param {number} to */
  const avg = (pick, from, to) => {
    const xs = [];
    for (let i = from; i < to; i++) {
      const v = state.days[addDays(date, -i)] ? pick(state.days[addDays(date, -i)]) : undefined;
      if (isNum(v)) xs.push(v);
    }
    return xs.length ? { value: mean(xs), n: xs.length } : null;
  };
  const sleep7 = avg((d) => d.sleepH, 0, 7);
  const water7 = avg((d) => d.waterMl, 0, 7);
  const steps7 = avg((d) => d.steps, 0, 7);
  const rhr7 = avg((d) => d.restingHr, 0, 7);
  const rhrBase = avg((d) => d.restingHr, 7, 35);
  const caffeine7 = avg((d) => (d.caffeine?.length ? d.caffeine.reduce((a, c) => a + c.mg, 0) : undefined), 0, 7);
  const kcal7 = avg((d) => (d.complete && d.food?.length ? d.food.reduce((a, f) => a + f.kcal, 0) : undefined), 0, 7);

  const bmiValue = bmi(weightKg, p.heightCm);
  const waistLast = [...state.waist].sort((a, b) => (a.date < b.date ? 1 : -1))[0] ?? null;
  const bpMean = bpSeriesMean(
    state.bp.filter((b) => b.setting === 'home'),
    date,
  );

  const snap = {
    profile: p,
    date,
    age,
    series,
    trend,
    avg7,
    slope,
    weightKg,
    bmi: { value: bmiValue, ...bmiClass(bmiValue) },
    bmr,
    tdeeFormula,
    adaptive,
    tdee,
    plan,
    kcalTarget,
    protein,
    day,
    kcal,
    proteinG,
    caffeine,
    taper,
    cupsAllowed,
    cupsToday: doses.length,
    week,
    planKgToday,
    projected,
    sleep7,
    water7,
    steps7,
    rhr7,
    rhrBase,
    caffeine7,
    kcal7,
    waist: waistLast ? { ...waistLast, risk: waistRisk(p.sex, waistLast.cm), whtr: whtr(waistLast.cm, p.heightCm) } : null,
    bpMean: bpMean ? { ...bpMean, category: bpCategory(bpMean.sys, bpMean.dia, 'home') } : null,
  };
  return { ...snap, hints: coachHints(snap) };
}
