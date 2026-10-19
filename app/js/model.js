// @ts-check
// Abgeleitete Kennzahlen aus dem gespeicherten Zustand für ein Datum.

import { ageOn, adaptiveTdee, bmrMifflin, formulaTdee, planTarget, proteinTarget } from './domain/energy.js';
import { emaTrend, projectGoalDate, rolling7, trendSlope, planWeightOn } from './domain/trend.js';
import { allowedCups, dayAssessment, taperPlan } from './domain/caffeine.js';
import { weekSummary } from './domain/training.js';
import { bmi, bmiClass, bpSeriesMean, bpCategory, whtr, waistRisk } from './domain/clinical.js';
import { coachHints } from './domain/coach.js';
import { nutritionAdvice } from './domain/advice.js';
import { plannedSession } from './domain/training.js';
import { lifeStage, periodStarts, cycleLength, cycleInfo } from './domain/cycle.js';
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

  // Adaptiver Bedarf aus den vollständig erfassten Tagen der 21 Tage davor. Der Tag selbst
  // zählt nicht mit, sonst würde jede Mahlzeit das Ziel desselben Tages verschieben.
  const intakes = [];
  for (let i = 1; i <= 21; i++) {
    const d = state.days[addDays(date, -i)];
    if (d?.complete && d.food?.length) intakes.push(d.food.reduce((a, f) => a + f.kcal, 0));
  }
  const adaptive = adaptiveTdee({ intakes, slopeKgPerDay: slope?.slopeKgPerDay ?? null });
  const tdee = adaptive?.tdee ?? tdeeFormula;

  const plan = planTarget({ sex: p.sex, tdee, bmr, weightKg, goalWeightKg: p.goalWeightKg, today: date, goalDate: p.goalDate });
  // Diätpause: Erhaltung (Gesamtumsatz) statt Defizit
  const dietBreak = Boolean(p.dietBreakUntil && p.dietBreakUntil >= date);
  // Schwangerschaft und Stillzeit: kein Defizit, Erhaltung als Untergrenze
  const stage = lifeStage(p.sex, p.cycleStatus);
  const noDeficit = stage === 'schwanger' || stage === 'stillend';
  const kcalTarget = p.kcalOverride ?? (dietBreak || noDeficit ? Math.round(tdee / 10) * 10 : plan.kcal);
  // Zyklus (nur bei natürlichem Zyklus bzw. hormoneller Verhütung mit Blutung)
  const tracksCycle = p.sex === 'f' && (p.cycleStatus === 'natuerlich' || p.cycleStatus === 'hormonell');
  const starts = tracksCycle ? periodStarts(state.days, p.lastPeriodStart) : [];
  const cLen = cycleLength(starts, p.cycleLength ?? 28);
  const cycle = tracksCycle ? cycleInfo(date, starts, cLen, state.days) : null;
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
  const runsToday = state.workouts
    .filter((w) => w.date === date && w.kind === 'run')
    .map((w) => ({ minutes: /** @type {any} */ (w).minutes ?? 0, runType: /** @type {any} */ (w).runType ?? 'z2' }));
  const advice = nutritionAdvice({
    date,
    session: plannedSession(date, p.trainingMode),
    runsToday,
    ratePctPerWeek: slope && slope.n >= 7 ? ((-slope.slopeKgPerDay * 7) / weightKg) * 100 : null,
    rhrDelta: rhr7 && rhrBase && rhr7.n >= 3 && rhrBase.n >= 10 ? rhr7.value - rhrBase.value : null,
    sleep7: sleep7 && sleep7.n >= 4 ? sleep7.value : null,
    deficit7: kcal7 && kcal7.n >= 4 ? tdee - kcal7.value : null,
    days: state.days,
    vitDSupplementUg: p.vitDSupplementUg ?? 0,
    dietBreakUntil: p.dietBreakUntil ?? '',
    cycle: {
      status: p.sex === 'f' ? (p.cycleStatus ?? 'keine') : 'keine',
      lastStart: starts.length ? starts[starts.length - 1] : '',
      phase: cycle?.phase ?? null,
      trainingHeavy: week.equivalent >= 150,
    },
    startDate: p.startDate,
    maintenance: plan.maintenance || noDeficit,
  });
  const order = { alert: 0, warn: 1, info: 2, ok: 3 };
  const hints = [...coachHints(snap), ...advice].sort((a, b) => order[a.severity] - order[b.severity]);
  return { ...snap, dietBreak, lifeStage: stage, noDeficit, cycle, cycleStarts: starts, cycleLength: cLen, hints };
}
