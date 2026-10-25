// @ts-check
// Abnahmetests zum Produkt-Audit: Navigation, Rückgängig, Eingaben erhalten, Bearbeiten,
// keine Anfragen an Dritte, keine zu kleinen Bedienelemente.
import { test, expect } from '@playwright/test';

/** @param {import('@playwright/test').Page} page */
async function setup(page) {
  await page.goto('/');
  await page.fill('#p-birth', '1977-05-09');
  await page.fill('#p-height', '172');
  await page.fill('#p-startkg', '95');
  await page.fill('#p-goalkg', '80');
  await page.fill('#p-goaldate', '2027-03-31');
  await page.click('#profile-save');
  await expect(page).toHaveURL(/#heute$/);
}

test('Navigation: 5 Hauptbereiche, Wissen und Profil in der Kopfzeile, alte Adresse funktioniert', async ({ page }) => {
  await setup(page);
  await expect(page.locator('nav.tabs .tab')).toHaveCount(5);
  await expect(page.locator('nav.tabs')).toContainText('Ernährung');
  await page.click('#nav-wissen');
  await expect(page.locator('main h1')).toHaveText('Wissen');
  await page.goto('/#gewicht');
  await expect(page.locator('main h1')).toHaveText('Fortschritt');
  await expect(page.locator('nav.tabs .tab.active')).toHaveText('Fortschritt');
});

test('Rückgängig nach einer Erfassung', async ({ page }) => {
  await setup(page);
  await page.goto('/#ernaehrung');
  await page.click('#preset-skyr');
  await expect(page.locator('#food-entries')).toContainText('Skyr');
  await page.click('#toast-undo');
  await expect(page.locator('#food-entries')).toHaveCount(0);
  await expect(page.getByText('Rückgängig gemacht')).toBeVisible();
});

test('Angefangene Eingaben bleiben erhalten, wenn zwischendurch etwas anderes erfasst wird', async ({ page }) => {
  await setup(page);
  await page.goto('/#ernaehrung');
  await page.fill('#food-name', 'Kantine Menü 2');
  await page.fill('#food-kcal', '720');
  await page.click('#preset-skyr');
  await expect(page.locator('#food-name')).toHaveValue('Kantine Menü 2');
  await expect(page.locator('#food-kcal')).toHaveValue('720');
  // Nach dem Abschicken ist das Formular wieder leer
  await page.click('#food-add');
  await expect(page.locator('#food-name')).toHaveValue('');
  // Datumswechsel verwirft angefangene Eingaben
  await page.fill('#food-name', 'Entwurf');
  await page.click('#date-prev');
  await expect(page.locator('#food-name')).toHaveValue('');
});

test('Mahlzeit direkt in der Liste bearbeiten; Summen passen sich an', async ({ page }) => {
  await setup(page);
  await page.goto('/#ernaehrung');
  await page.click('#preset-skyr');
  await page.getByRole('button', { name: /Skyr 250 g mit Beeren bearbeiten/ }).click();
  await page.fill('#edit-kcal', '300');
  await page.fill('#edit-protein', '35');
  await page.click('#edit-save');
  await expect(page.locator('#food-entries')).toContainText('300 kcal · 35 g');
  await expect(page.locator('#diary-eaten')).toContainText('300');
  await expect(page.locator('#diary-head .meter').first()).toContainText('35');
});

test('Keine Anfragen an Dritte beim Laden; keine Bedienelemente unter 24 px', async ({ page }) => {
  /** @type {string[]} */
  const external = [];
  page.on('request', (r) => {
    const host = new URL(r.url()).hostname;
    if (host !== 'localhost') external.push(host);
  });
  await page.goto('/');
  await page.click('#load-demo');
  for (const r of ['heute', 'ernaehrung', 'fortschritt', 'training', 'gesundheit', 'wissen', 'profil']) {
    await page.goto(`/#${r}`);
    await page.waitForTimeout(100);
    const small = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          'main button, main a, main input:not([type=checkbox]):not([type=file]), main select, nav a, header a, header button',
        ),
      ]
        .filter((e) => {
          const b = e.getBoundingClientRect();
          return b.width > 0 && b.height > 0 && (b.width < 24 || b.height < 24);
        })
        .map((e) => e.id || e.textContent?.trim().slice(0, 20)),
    );
    expect(small, `zu kleine Ziele auf #${r}`).toEqual([]);
  }
  expect(external).toEqual([]);
  const fontOk = await page.evaluate(() => document.fonts.check('16px "Source Sans 3"'));
  expect(fontOk).toBe(true);
});
