// @ts-check
// Bericht für die Ernährungsberatung: kompakte Zusammenfassung der letzten Wochen zum
// Ausdrucken oder als PDF speichern. Bei Adipositas (BMI ≥ 30) übernimmt die
// Grundversicherung Ernährungsberatung durch anerkannte Ernährungsberater/innen auf
// ärztliche Verordnung (KLV Art. 9b).

import { h, fmt, fmtDate } from '../ui/dom.js';
import { addDays } from '../domain/util.js';
import { dailyTargets, averageAmounts, NUTRIENTS } from '../domain/micros.js';
import { addGroups } from '../domain/foodgroups.js';
import { mealSlots, cravingPatterns, TRIGGERS } from '../domain/meals.js';
import { LABS } from '../domain/clinical.js';
import { CYCLE_OPTIONS } from '../domain/cycle.js';

/** @typedef {import('../app.js').Ctx} Ctx */

/**
 * @param {string} label
 * @param {import('../ui/dom.js').Child[]} rows
 */
const table = (label, rows) =>
  h('table', { class: 'report-table' }, h('caption', { class: 'sr-only' }, label), h('tbody', {}, ...rows.filter(Boolean)));

/** @param {string} k @param {import('../ui/dom.js').Child} v */
const tr = (k, v) => h('tr', {}, h('th', { scope: 'row' }, k), h('td', {}, v));

/** @param {Ctx} ctx */
export function viewReport(ctx) {
  const snap = /** @type {NonNullable<Ctx['snap']>} */ (ctx.snap);
  const p = snap.profile;
  const end = ctx.today;
  const from = addDays(end, -27);
  const days = Array.from({ length: 28 }, (_, i) => addDays(end, -i));
  const complete = days.map((d) => ctx.state.days[d]).filter((d) => d?.complete && d.food?.length);
  const n = complete.length;
  const avg = (/** @type {(d: import('../store.js').Day) => number} */ pick) => (n ? complete.reduce((a, d) => a + pick(d), 0) / n : 0);
  const kcalAvg = avg((d) => (d.food ?? []).reduce((a, f) => a + f.kcal, 0));
  const protAvg = avg((d) => (d.food ?? []).reduce((a, f) => a + f.protein, 0));
  const slotAvg = Object.fromEntries(
    ['zmorge', 'zmittag', 'zvieri', 'znacht', 'spaet'].map((id) => [
      id,
      {
        kcal: avg((d) => mealSlots(d.food ?? []).find((s) => s.id === id)?.kcal ?? 0),
        protein: avg((d) => mealSlots(d.food ?? []).find((s) => s.id === id)?.protein ?? 0),
      },
    ]),
  );
  const eveningShare = kcalAvg ? (slotAvg.znacht.kcal + slotAvg.spaet.kcal) / kcalAvg : 0;
  const patterns = cravingPatterns(ctx.state.days, end, snap.protein.grams);
  const week = Array.from({ length: 7 }, (_, i) => ctx.state.days[addDays(end, -i)]?.food ?? []);
  const loggedDays = week.filter((d) => d.length).length || 1;
  const groups = addGroups(...week.flat().map((f) => f.groups));
  const per = (/** @type {keyof typeof groups} */ k) => fmt((groups[k] ?? 0) / loggedDays, 1);
  const targets = dailyTargets({ kcalTarget: snap.kcalTarget, proteinG: snap.protein.grams, sex: p.sex, stage: snap.lifeStage });
  const nut = averageAmounts(week);
  const low = NUTRIENTS.filter((x) => x.kind === 'target' && x.ref && x.key !== 'vitK')
    .map((x) => ({ x, pct: (nut.amounts[x.key] ?? 0) / (targets[x.key] ?? 1) }))
    .filter((r) => r.pct < 0.7)
    .sort((a, b) => a.pct - b.pct);
  const startKg = snap.series[0]?.kg ?? p.startWeightKg;
  const trendKg = snap.trend.length ? snap.trend[snap.trend.length - 1].kg : null;
  const latestLabs = LABS.map((def) => {
    const l = [...ctx.state.labs].filter((x) => x.key === def.id).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    return l ? tr(def.name, `${fmt(l.value, l.value % 1 ? 1 : 0)} ${l.unit} (${fmtDate(l.date)})`) : null;
  }).filter(Boolean);

  return h(
    'div',
    { class: 'stack report', id: 'report' },
    h(
      'div',
      { class: 'report-head' },
      h('h1', {}, 'Bericht für die Ernährungsberatung'),
      h(
        'p',
        { class: 'small muted' },
        `${p.name || 'Ohne Namen'} · ${snap.age} Jahre · ${p.sex === 'f' ? 'weiblich' : 'männlich'} · ${p.heightCm} cm · Zeitraum ${fmtDate(from)}–${fmtDate(end)} · erstellt ${fmtDate(ctx.today)}`,
      ),
      h(
        'div',
        { class: 'btn-row no-print' },
        h(
          'button',
          { type: 'button', class: 'btn primary', id: 'report-print', on: { click: () => window.print() } },
          'Drucken oder als PDF speichern',
        ),
        h('a', { class: 'btn', href: '#profil' }, 'Zurück'),
      ),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Gewicht und Ziel'),
      table('Gewicht', [
        tr('Start', `${fmt(startKg, 1)} kg (${fmtDate(p.startDate)})`),
        tr('Aktuell (Trend)', trendKg !== null ? `${fmt(trendKg, 1)} kg` : '–'),
        tr('Tempo', snap.slope ? `${fmt(snap.slope.slopeKgPerDay * 7, 2)} kg pro Woche` : 'noch zu wenige Messungen'),
        tr('Ziel', `${fmt(p.goalWeightKg, 1)} kg bis ${fmtDate(p.goalDate)}`),
        tr('BMI', `${fmt(snap.bmi.value, 1)} (${snap.bmi.label})`),
        snap.waist ? tr('Taille', `${fmt(snap.waist.cm)} cm (${fmtDate(snap.waist.date)})`) : null,
      ]),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Energie und Protein'),
      table('Energie', [
        tr(
          'Energiebedarf',
          `${fmt(snap.tdee)} kcal${snap.adaptive ? ` (aus ${snap.adaptive.days} Tagen Protokoll und Gewichtsverlauf)` : ' (Formel)'}`,
        ),
        tr('Kalorienziel', `${fmt(snap.kcalTarget)} kcal`),
        tr('Zufuhr Ø', n ? `${fmt(kcalAvg)} kcal an ${n} vollständig erfassten Tagen` : 'keine vollständigen Tage'),
        tr('Protein Ø', n ? `${fmt(protAvg)} g (Ziel ${snap.protein.grams} g)` : '–'),
        tr('Anteil ab 17:30 Uhr', n ? `${Math.round(eveningShare * 100)} %` : '–'),
        tr(
          'Protein je Mahlzeit Ø',
          n
            ? `Mittag ${fmt(slotAvg.zmittag.protein)} g · Nachmittag ${fmt(slotAvg.zvieri.protein)} g · Abend ${fmt(slotAvg.znacht.protein + slotAvg.spaet.protein)} g`
            : '–',
        ),
      ]),
      h(
        'p',
        { class: 'small muted' },
        'Selbstprotokolle unterschätzen die Zufuhr häufig; der Energiebedarf ist deshalb aus Protokoll und Gewichtsverlauf berechnet.',
      ),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Essverhalten (28 Tage)'),
      h(
        'p',
        {},
        patterns.enough
          ? `${patterns.highDays} von ${patterns.days} Tagen mit mehr als der Hälfte der Kalorien am Abend.`
          : 'Zu wenige vollständig erfasste Tage für eine Musteranalyse.',
      ),
      ...patterns.insights.map((i) => h('p', { class: 'small' }, i.text)),
      patterns.triggers.length
        ? h(
            'p',
            { class: 'small' },
            'Notierte Gründe abends: ',
            patterns.triggers.map((t) => `${TRIGGERS.find((x) => x[0] === t.id)?.[1]} ${t.n}×`).join(', '),
            `; starker Hunger ${patterns.hungerStrong}×.`,
          )
        : null,
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Lebensmittelpyramide (Ø pro Tag, letzte 7 Tage)'),
      table('Pyramide', [
        tr('Gemüse / Früchte', `${per('gemuese')} / ${per('frucht')} Portionen (Richtwert 3 / 2)`),
        tr('Getreide, Kartoffeln', `${per('staerke')} Portionen, davon Vollkorn ${per('vollkorn')} (Richtwert 3)`),
        tr('Milchprodukte', `${per('milch')} Portionen (Richtwert 3)`),
        tr(
          'Fisch / Fleisch / Wurst pro Woche',
          `${fmt(groups.fisch ?? 0, 1)} / ${fmt(groups.fleisch ?? 0, 1)} / ${fmt(groups.wurst ?? 0, 1)} Portionen`,
        ),
        tr('Hülsenfrüchte pro Woche', `${fmt(groups.huelsen ?? 0, 1)} Portionen`),
        tr('Süsses, Salziges, Alkohol', `${per('suess')} kleine Portionen pro Tag (Richtwert ≤ 1)`),
      ]),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Nährstoffe unter 70 % der Referenz (Ø 7 Tage)'),
      low.length
        ? h(
            'ul',
            {},
            ...low.map((r) =>
              h('li', {}, `${r.x.label}: ${fmt(nut.amounts[r.x.key] ?? 0, r.x.digits)} ${r.x.unit} (${Math.round(r.pct * 100)} %)`),
            ),
          )
        : h('p', {}, 'Keine.'),
      h(
        'p',
        { class: 'small muted' },
        `Abdeckung mit Mikronährstoff-Daten: ${Math.round(nut.coverage * 100)} % der Kalorien. Referenzwerte D-A-CH; Nährwerte Schweizer Nährwertdatenbank (BLV).`,
      ),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Bewegung, Schlaf, Koffein'),
      table('Alltag', [
        tr('Training diese Woche', `${snap.week.equivalent ?? '–'} Ausdauer-Minuten (WHO-Äquivalent), Kraft ${snap.week.strengthDays}×`),
        tr('Schritte Ø 7 Tage', snap.steps7 ? fmt(snap.steps7.value) : '–'),
        tr('Schlaf Ø 7 Tage', snap.sleep7 ? `${fmt(snap.sleep7.value, 1)} h` : '–'),
        tr('Ruhepuls Ø 7 Tage', snap.rhr7 ? `${fmt(snap.rhr7.value)} /min` : '–'),
        tr('Koffein Ø 7 Tage', snap.caffeine7 ? `${fmt(snap.caffeine7.value)} mg` : '–'),
        p.vitDSupplementUg ? tr('Vitamin-D-Präparat', `${fmt(p.vitDSupplementUg, 1)} µg pro Tag`) : null,
        p.fastingWindowH ? tr('Essensfenster', `${p.fastingWindowH} h ab ${p.eatStart}`) : null,
        p.sex === 'f' && p.shareCycle && p.cycleStatus !== 'keine'
          ? tr(
              'Zyklus',
              `${CYCLE_OPTIONS.find((c) => c[0] === p.cycleStatus)?.[1] ?? ''}${snap.cycleStarts.length ? ` · Ø ${snap.cycleLength} Tage · letzte Periode ${fmtDate(snap.cycleStarts[snap.cycleStarts.length - 1])}` : ''}`,
            )
          : null,
      ]),
    ),
    latestLabs.length || snap.bpMean
      ? h(
          'section',
          { class: 'card' },
          h('h2', {}, 'Blutdruck und Labor'),
          table('Labor', [
            snap.bpMean ? tr('Blutdruck (Heim, Ø)', `${snap.bpMean.sys}/${snap.bpMean.dia} mmHg aus ${snap.bpMean.n} Messungen`) : null,
            ...latestLabs,
          ]),
        )
      : null,
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Hinweise'),
      h(
        'p',
        { class: 'small' },
        'Selbst erfasste Daten aus einer persönlichen App, keine Diagnose. Mahlzeiten aus Foto oder Beschreibung sind KI-Schätzungen (±20–40 %).',
      ),
      snap.bmi.value >= 30
        ? h(
            'p',
            { class: 'small' },
            'Ernährungsberatung durch anerkannte Ernährungsberaterinnen und Ernährungsberater (SVDE) wird bei Adipositas auf ärztliche Verordnung von der Grundversicherung übernommen (KLV Art. 9b), Franchise und Selbstbehalt vorbehalten.',
          )
        : null,
    ),
  );
}
