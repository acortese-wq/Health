// @ts-check
import { test, expect } from '@playwright/test';

/** @param {import('@playwright/test').Page} page */
async function createProfile(page) {
  await page.goto('/');
  await page.fill('#p-birth', '1977-05-09');
  await page.fill('#p-height', '172');
  await page.fill('#p-startkg', '95');
  await page.fill('#p-goalkg', '80');
  await page.fill('#p-goaldate', '2027-06-30');
  await page.click('#profile-save');
  await expect(page).toHaveURL(/#heute$/);
}

/** @param {import('@playwright/test').Page} page @param {string} name @param {string} kcal @param {string} [protein] */
async function addCustom(page, name, kcal, protein = '') {
  await page.fill('#food-name', name);
  await page.fill('#food-kcal', kcal);
  if (protein) await page.fill('#food-protein', protein);
  await page.click('#food-add');
}

/** Gespeicherte Einträge des Tages direkt aus dem Speicher. @param {import('@playwright/test').Page} page */
async function stored(page) {
  return page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('gesundheitscockpit') ?? '{}');
    const days = Object.values(st.days ?? {});
    return days.flatMap((/** @type {any} */ d) => d.food ?? []);
  });
}

test('1/2/8: Apfel dreimal am selben Tag – mit einem Tipp wiederholt, separat gespeichert, korrekt summiert', async ({ page }) => {
  await createProfile(page);
  await page.goto('/#ernaehrung');
  await addCustom(page, 'Apfel', '78', '0.5');
  await page.waitForTimeout(700);
  const again = page.getByRole('button', { name: 'Apfel erneut erfassen' });
  await expect(again).toHaveCount(1);
  await again.click();
  await expect(page.locator('#toast')).toContainText('Apfel erneut erfasst (78 kcal)');
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Apfel erneut erfassen' }).first().click();
  await expect(page.getByRole('button', { name: 'Apfel erneut erfassen' })).toHaveCount(3);
  // Kein Seitenwechsel
  await expect(page).toHaveURL(/#ernaehrung(\/erfassen)?$/);
  await expect(page.locator('#diary-eaten')).toContainText('234');
  const food = await stored(page);
  expect(food).toHaveLength(3);
  expect(new Set(food.map((/** @type {any} */ f) => f.id)).size).toBe(3);
  expect(food.reduce((/** @type {number} */ a, /** @type {any} */ f) => a + f.kcal, 0)).toBe(234);
  expect(food.filter((/** @type {any} */ f) => f.repeatOf)).toHaveLength(2);
  // Neueste Mahlzeit steht oben
  const times = await page.locator('#food-entries .entry .entry-time').allTextContents();
  expect([...times].sort().reverse()).toEqual(times);
  // Keine Markierung als Doppelbuchung
  await expect(page.locator('.dup-flag')).toHaveCount(0);
  // Dashboard zählt mit
  await page.goto('/#heute');
  await expect(page.locator('.summary .stat').nth(1)).toContainText('234 gegessen');
});

test('14: Doppelklick und Speicherfehler erzeugen keine unkontrollierten Doppelbuchungen', async ({ page }) => {
  await createProfile(page);
  await page.goto('/#ernaehrung');
  await addCustom(page, 'Joghurt', '120', '6');
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Joghurt erneut erfassen' }).dblclick();
  await expect(page.getByRole('button', { name: 'Joghurt erneut erfassen' })).toHaveCount(2);
  expect(await stored(page)).toHaveLength(2);

  // Speicher fällt aus: keine Erfolgsmeldung, deutlicher Hinweis
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('voll', 'QuotaExceededError');
    };
  });
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Joghurt erneut erfassen' }).first().click();
  await expect(page.locator('#toast')).toContainText('Nicht gespeichert');
  await expect(page.locator('#toast')).not.toContainText('erneut erfasst');
  await expect(page.locator('#unsaved-banner')).toBeVisible();
  expect(await stored(page)).toHaveLength(2);
});

test('3: Gleicher Eintrag kurz hintereinander wird markiert, nicht zusammengeführt; «Beide behalten»', async ({ page }) => {
  await createProfile(page);
  await page.goto('/#ernaehrung');
  await addCustom(page, 'Brot', '250', '8');
  await page.waitForTimeout(700);
  await addCustom(page, 'Brot', '250', '8');
  await expect(page.getByRole('button', { name: 'Brot erneut erfassen' })).toHaveCount(2);
  await expect(page.locator('.dup-flag')).toHaveCount(1);
  await page.getByRole('button', { name: 'Brot behalten, keine Doppelbuchung' }).click();
  await expect(page.locator('.dup-flag')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Brot erneut erfassen' })).toHaveCount(2);
});

test('5/6: Bearbeiten und Löschen rechnen Tag und Dashboard neu; andere Menge erneut erfassen', async ({ page }) => {
  await createProfile(page);
  await page.goto('/#ernaehrung');
  await page.fill('#food-search', 'kiw');
  await page.locator('#food-search-results .chip', { hasText: 'Kiwi' }).click();
  await page.fill('#food-search-grams', '200');
  await page.click('#food-search-add');
  const name = (await page.locator('#food-entries .entry .entry-name').first().textContent()) ?? '';
  expect(name).toContain('200 g');
  const kcal200 = Number((await page.locator('#kcal-eaten').textContent())?.replace(/\D/g, ''));
  expect(kcal200).toBeGreaterThan(50);

  // Andere Menge: ½ → neuer Eintrag mit 100 g
  await page
    .locator('#food-entries .entry')
    .first()
    .getByRole('button', { name: /mit anderer Menge/ })
    .click();
  await page.click('#amount-0-5');
  await expect(page.locator('#amount-preview')).toContainText('100 g');
  await page.click('#amount-save');
  await expect(page.locator('#food-entries .entry')).toHaveCount(2);
  await expect(page.locator('#food-entries')).toContainText('100 g');
  const total = Number((await page.locator('#kcal-eaten').textContent())?.replace(/\D/g, ''));
  expect(Math.abs(total - kcal200 * 1.5)).toBeLessThanOrEqual(1);

  // Bearbeiten: Menge 200 → 400 g verdoppelt alle Werte dieses Eintrags
  await page
    .locator('#food-entries .entry', { hasText: '200 g' })
    .getByRole('button', { name: /bearbeiten/ })
    .click();
  await page.fill('#edit-grams', '400');
  await page.click('#edit-save');
  const afterEdit = Number((await page.locator('#kcal-eaten').textContent())?.replace(/\D/g, ''));
  expect(Math.abs(afterEdit - kcal200 * 2.5)).toBeLessThanOrEqual(2);
  await expect(page.locator('#food-entries')).toContainText('400 g');

  // Löschen: nur der gewählte Eintrag
  await page
    .locator('#food-entries .entry', { hasText: '400 g' })
    .getByRole('button', { name: /entfernen/ })
    .click();
  await expect(page.locator('#food-entries .entry')).toHaveCount(1);
  const afterDelete = Number((await page.locator('#kcal-eaten').textContent())?.replace(/\D/g, ''));
  const food = await stored(page);
  expect(afterDelete).toBe(food.reduce((/** @type {number} */ a, /** @type {any} */ f) => a + f.kcal, 0));
  await page.goto('/#heute');
  await expect(page.locator('.summary .stat').nth(1)).toContainText(`${afterDelete} gegessen`);
});

test('7/12: Fehlende Werte heissen «Noch nicht erfasst», unbekanntes Protein ist keine Null', async ({ page }) => {
  await createProfile(page);
  await expect(page.locator('.summary-small .stat', { hasText: 'Schritte' })).toContainText('Noch nicht erfasst');
  await expect(page.locator('.summary-small .stat', { hasText: 'Schlaf' })).toContainText('Noch nicht erfasst');
  await expect(page.locator('.summary-small .stat', { hasText: 'Wasser' })).toContainText('Noch nicht erfasst');
  await expect(page.locator('.summary .stat', { hasText: 'Protein' })).toContainText('Noch nicht erfasst');
  await expect(page.locator('#day-status')).toContainText('Noch keine Mahlzeit');
  await page.goto('/#ernaehrung');
  await addCustom(page, 'Kantine Menü 1', '750');
  await expect(page.locator('#food-entries')).toContainText('? g Protein');
  await expect(page.locator('#food-entries')).toContainText('Nährwerte unvollständig');
  await expect(page.locator('#day-status')).toContainText('Nährwerte unvollständig');
  const [e] = await stored(page);
  expect(e.proteinKnown).toBe(false);
  await page.goto('/#heute');
  await expect(page.locator('#macro-partial')).toContainText('1 von 1');
  await expect(page.locator('#macro-facts')).toContainText('unbekannt');
});

test('10: Fehlerhafter Import verändert keine bestehenden Daten', async ({ page }) => {
  await createProfile(page);
  await page.goto('/#ernaehrung');
  await addCustom(page, 'Apfel', '78', '0.5');
  const before = await page.evaluate(() => localStorage.getItem('gesundheitscockpit'));
  await page.goto('/#profil');
  await page.setInputFiles('#import-file', {
    name: 'kaputt.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schema": 1, "days": '),
  });
  await expect(page.locator('#toast')).toContainText('kein gültiges JSON');
  await page.setInputFiles('#import-file', { name: 'neu.json', mimeType: 'application/json', buffer: Buffer.from('{"schema": 99}') });
  await expect(page.locator('#toast')).toContainText('neueren');
  expect(await page.evaluate(() => localStorage.getItem('gesundheitscockpit'))).toBe(before);
});

test('9: Tageswechsel um Mitternacht ordnet Einträge dem richtigen Tag zu', async ({ page }) => {
  // Browser läuft in Europe/Zurich (playwright.config.js)
  await page.clock.install({ time: new Date('2026-10-19T23:58:00+02:00') });
  await createProfile(page);
  await page.goto('/#ernaehrung');
  await expect(page.locator('#date-pick')).toHaveValue('2026-10-19');
  await addCustom(page, 'Spätsnack', '150', '5');
  await page.clock.fastForward('03:00');
  await expect(page.locator('#date-pick')).toHaveValue('2026-10-20');
  await expect(page.locator('#food-entries')).toHaveCount(0);
  await addCustom(page, 'Mitternachtsapfel', '78', '0.5');
  const days = await page.evaluate(() => JSON.parse(localStorage.getItem('gesundheitscockpit') ?? '{}').days);
  expect(days['2026-10-19'].food.map((/** @type {any} */ f) => f.name)).toEqual(['Spätsnack']);
  expect(days['2026-10-20'].food.map((/** @type {any} */ f) => f.name)).toEqual(['Mitternachtsapfel']);
});

test('Schnellaktion: letztes Lebensmittel vom Dashboard aus erneut erfassen', async ({ page }) => {
  await createProfile(page);
  await page.goto('/#ernaehrung');
  await addCustom(page, 'Espresso mit Milch', '25', '1');
  await page.waitForTimeout(700);
  await page.goto('/#heute');
  await expect(page.locator('#cta-repeat')).toContainText('Espresso mit Milch nochmal');
  await page.click('#cta-repeat');
  await expect(page.locator('#toast')).toContainText('Espresso mit Milch erneut erfasst');
  expect(await stored(page)).toHaveLength(2);
});

test('Verlauf: Tageswerte mit Lücken, umschaltbar', async ({ page }) => {
  await page.goto('/');
  await page.click('#load-demo');
  await page.goto('/#fortschritt');
  await expect(page.locator('#history-card svg.bar-chart')).toBeVisible();
  await page.click('#hist-range-30');
  await page.click('#hist-metric-steps');
  await expect(page.locator('#hist-summary')).toContainText('von 30 Tagen');
  await page.click('#hist-range-alle');
  await page.click('#hist-metric-sleep');
  await expect(page.locator('#history-card .bar').first()).toBeVisible();
  await page.locator('#history-card summary').click();
  await expect(page.locator('#history-card table')).toBeVisible();
});

test('Pyramiden-Tipps: konkrete Ergänzungen mit Menge, direkt erfassbar', async ({ page }) => {
  await createProfile(page);
  await page.goto('/#ernaehrung');
  await addCustom(page, 'Gipfeli', '250', '5');
  const tips = page.locator('#pyr-tips');
  await expect(tips).toContainText('Für die Lebensmittelpyramide noch offen');
  await expect(tips.locator('li').first()).toContainText(' g');
  const before = (await stored(page)).length;
  await page.click('#pyr-tips-add-0');
  expect(await stored(page)).toHaveLength(before + 1);
});
