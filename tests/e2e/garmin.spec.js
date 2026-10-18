// @ts-check
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const CSV = fileURLToPath(new URL('../fixtures/garmin-en.csv', import.meta.url));

/** @param {import('@playwright/test').Page} page */
async function setup(page) {
  await page.goto('/');
  await page.fill('#p-birth', '1977-05-09');
  await page.fill('#p-height', '172');
  await page.fill('#p-startkg', '95');
  await page.fill('#p-goalkg', '80');
  await page.fill('#p-goaldate', '2027-03-31');
  await page.click('#profile-save');
}

test('Garmin-CSV importieren, beim zweiten Mal keine Doppel', async ({ page }) => {
  await setup(page);
  await page.goto('/#training');
  await page.setInputFiles('#garmin-file', CSV);
  await expect(page.locator('#garmin-preview')).toContainText('4 Läufe/Krafteinheiten erkannt, davon 4 neu');
  await expect(page.locator('#garmin-preview')).toContainText('1 andere Aktivitäten übersprungen');
  await page.click('#garmin-import');
  await expect(page.getByText('4 Einheiten von Garmin übernommen')).toBeVisible();
  await expect(page.locator('section[aria-labelledby="hist-h"] .entries li')).toHaveCount(4);
  await page.setInputFiles('#garmin-file', CSV);
  await expect(page.locator('#garmin-preview')).toContainText('davon 0 neu, 4 schon vorhanden');
  await expect(page.locator('#garmin-import')).toBeDisabled();
});

test('Werte aus Apple Health über den Kurzbefehl-Text übernehmen', async ({ page }) => {
  await setup(page);
  await page.locator('#health-manual summary').click();
  await page.fill('#health-text', 'cockpit;schritte=9512;ruhepuls=47;schlaf=7.4;gewicht=94.2');
  await page.click('#health-text-go');
  await expect(page.locator('#steps')).toHaveValue('9512');
  await expect(page.locator('#rhr')).toHaveValue('47');
  await expect(page.locator('#sleep')).toHaveValue('7.5');
  // Gewicht vom Profilstart (95) bleibt, weil heute schon gewogen
  await expect(page.locator('#weight')).toHaveValue('95');
});
