// @ts-check
import { test, expect } from '@playwright/test';

/** @param {import('@playwright/test').Page} page */
async function createProfile(page) {
  await page.goto('/');
  await page.fill('#p-birth', '1977-05-09');
  await page.fill('#p-height', '172');
  await page.fill('#p-startkg', '95');
  await page.fill('#p-goalkg', '80');
  await page.fill('#p-goaldate', '2027-03-31');
  await page.click('#profile-save');
  await expect(page).toHaveURL(/#heute$/);
}

test('Halb ausgefülltes Feld übersteht das Beenden der App', async ({ page }) => {
  await createProfile(page);
  await page.fill('#weight', '93,8');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.reload();
  await expect(page.locator('#weight')).toHaveValue('93,8');
  // Nach dem Speichern ist der Wert regulär gespeichert und bleibt nach dem Neuladen
  await page.click('#weight-save');
  await page.reload();
  await expect(page.locator('#weight')).toHaveValue('93.8');
});

test('Automatische Sicherung: Tagesstand wiederherstellen', async ({ page }) => {
  await createProfile(page);
  await page.fill('#weight', '94');
  await page.click('#weight-save');
  await expect(page.locator('#weight')).toHaveValue('94');

  await page.goto('/#profil');
  await page.locator('#safety summary').click();
  await expect(page.locator('#snapshot-list li')).toHaveCount(1);
  await expect(page.locator('#snapshot-list')).toContainText('Tagesstand');
  await page.click('#restore-0');
  await expect(page.locator('#toast')).toContainText('wiederhergestellt');

  await page.goto('/#heute');
  await expect(page.locator('#weight')).toHaveValue('95');
  // Vor dem Ersetzen wurde der vorherige Stand zusätzlich gesichert
  await page.goto('/#profil');
  await page.locator('#safety summary').click();
  await expect(page.locator('#snapshot-list li')).toHaveCount(2);
});

test('Unlesbare Daten werden nicht überschrieben', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('gesundheitscockpit', '{kaputt'));
  await page.reload();
  await expect(page.locator('#corrupt-banner')).toBeVisible();
  const kept = await page.evaluate(() => localStorage.getItem('gesundheitscockpit.defekt'));
  expect(kept).toBe('{kaputt');
});
