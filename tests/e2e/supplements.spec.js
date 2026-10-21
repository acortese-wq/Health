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

/** @param {import('@playwright/test').Page} page */
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('gesundheitscockpit') ?? '{}'));

test('Präparate: Vorlage hinzufügen, abhaken, Nährstoffe zählen mit, Warnung, Neuladen', async ({ page }) => {
  await createProfile(page);
  // Ohne Präparate keine Karte auf «Heute»
  await expect(page.locator('#supp-today')).toHaveCount(0);
  await page.goto('/#ernaehrung');
  await expect(page.locator('#supp-none')).toBeVisible();
  await page.selectOption('#supp-template', 'burgerstein-mood');
  await page.click('#supp-add-go');
  await expect(page.locator('#supp-list > li')).toHaveCount(1);
  // Zweites Produkt: Folsäure zusammen 930 µg (unter 1000), keine Rückfrage nötig
  await page.selectOption('#supp-template', 'supradyn-pro-energy');
  await page.click('#supp-add-go');
  await expect(page.locator('#supp-list > li')).toHaveCount(2);
  await expect(page.locator('#supp-overlap')).toContainText('Folsäure');

  let st = await stored(page);
  expect(st.schema).toBe(4);
  const mood = st.supplements.find((/** @type {any} */ s) => s.templateId === 'burgerstein-mood');
  // Abhaken auf «Heute»
  await page.goto('/#heute');
  await page.click(`#supp-take-${mood.id}`);
  await expect(page.locator(`#supp-take-${mood.id}`)).toHaveAttribute('aria-pressed', 'true');
  // Zweiter Tipp nimmt zurück, dritter hakt wieder ab (keine Doppelbuchung)
  await page.click(`#supp-take-${mood.id}`);
  await expect(page.locator(`#supp-take-${mood.id}`)).toHaveAttribute('aria-pressed', 'false');
  await page.click(`#supp-take-${mood.id}`);
  st = await stored(page);
  const day = Object.values(st.days).find((/** @type {any} */ d) => d.supps);
  expect(/** @type {any} */ (day).supps).toHaveLength(1);

  // Vitamin D aus dem Präparat erscheint in den Nährstoffen als Quelle
  await page.reload();
  await page.goto('/#ernaehrung');
  await expect(page.locator(`#supp-toggle-${mood.id}`)).toHaveText(/Heute eingenommen/);
  await expect(page.locator('#nutrients-card')).toContainText('Vitamin D');

  // Supradyn: B6 unbekannt, Hinweis in der Detailansicht
  const supra = st.supplements.find((/** @type {any} */ s) => s.templateId === 'supradyn-pro-energy');
  await page.locator(`#supp-${supra.id} summary`).click();
  await expect(page.locator(`#supp-${supra.id}`)).toContainText('Menge unbekannt');
  await expect(page.locator(`#supp-${supra.id}`)).toContainText('Mangione');

  // Drittes, eigenes Produkt mit Folsäure: Summe über der Höchstmenge → deutliche Warnung
  await page.selectOption('#supp-template', 'eigen');
  await page.click('#supp-add-go');
  await page.fill('#supp-name', 'B-Komplex');
  await page.locator('#supp-custom select[name="n-key-0"]').selectOption('folicAcid');
  await page.fill('#supp-custom input[name="n-val-0"]', '400');
  await page.click('#supp-custom-save');
  await expect(page.locator('#supp-list > li')).toHaveCount(3);
  await expect(page.locator('#ul-folicAcid')).toContainText('über der Höchstmenge');

  // Pausieren nimmt es aus der Warnung
  const custom = (await stored(page)).supplements.find((/** @type {any} */ s) => s.name === 'B-Komplex');
  await page.locator(`#supp-${custom.id} summary`).click();
  await page.click(`#supp-pause-${custom.id}`);
  await expect(page.locator('#ul-folicAcid')).toHaveCount(0);
  await expect(page.locator('#supp-paused')).toContainText('Pausiert (1)');

  // Kein horizontales Scrollen
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('Präparat: fehlenden Wert von der Packung ergänzen', async ({ page }) => {
  await createProfile(page);
  await page.goto('/#ernaehrung');
  await page.selectOption('#supp-template', 'supradyn-pro-energy');
  await page.click('#supp-add-go');
  const s = (await stored(page)).supplements[0];
  await page.locator(`#supp-${s.id} summary`).click();
  await page.click(`#supp-edit-${s.id}`);
  const form = page.locator(`#supp-editform-${s.id}`);
  // Leere Zeile für das unbekannte B6 ist vorbelegt
  const b6 = form.locator('select').filter({ has: page.locator('option[value="b6"]:checked') });
  const name = await b6.getAttribute('name');
  await form.locator(`input[name="${String(name).replace('key', 'val')}"]`).fill('2.1');
  await page.click(`#supp-save-${s.id}`);
  const after = (await stored(page)).supplements[0];
  expect(after.nutrients.b6).toBe(2.1);
  expect(after.unknown).toEqual([]);
  expect(after.source).toContain('eigene Ergänzung');
});
