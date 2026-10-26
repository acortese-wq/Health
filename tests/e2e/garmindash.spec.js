// @ts-check
import { test, expect } from '@playwright/test';

test('Garmin-Dashboard: Kennzahlen, Erholung, Diagramme, Aktivitäten, Tageswerte einfügen', async ({ page }) => {
  await page.goto('/');
  await page.click('#load-demo');
  await page.goto('/#training');
  await page.click('#open-garmin');
  await expect(page).toHaveURL(/#garmin$/);
  await expect(page.locator('h1')).toHaveText('Garmin-Dashboard');
  await expect(page.locator('#garmin-tiles .stat')).toHaveCount(6);
  await expect(page.locator('#g-steps .stat-value')).not.toHaveText('–');
  await expect(page.locator('#g-intensity')).toContainText('/ 150');
  await expect(page.locator('#garmin-recovery .badge')).toBeVisible();
  await expect(page.locator('.bar-chart')).toHaveCount(2);
  await expect(page.locator('#garmin-freshness')).toContainText('Tageswerte bis');

  // Tageswerte aus dem Kurzbefehl einfügen
  await page.locator('#health-manual summary').click();
  await page.fill('#health-text', 'cockpit;schritte=12345;ruhepuls=49;schlaf=7.5');
  await page.click('#health-text-go');
  await expect(page.locator('#g-steps .stat-value')).toHaveText(/12[’']345/);
  await expect(page.locator('#g-rhr .stat-value')).toContainText('49');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('Garmin-Dashboard ohne Daten: Hinweis statt leerer Kacheln', async ({ page }) => {
  await page.goto('/');
  await page.fill('#p-birth', '1977-05-09');
  await page.fill('#p-height', '172');
  await page.fill('#p-startkg', '95');
  await page.fill('#p-goalkg', '80');
  await page.fill('#p-goaldate', '2027-06-30');
  await page.click('#profile-save');
  await page.goto('/#garmin');
  await expect(page.locator('#garmin-freshness')).toContainText('Noch keine Tageswerte');
  await expect(page.locator('#g-steps')).toContainText('Noch nicht erfasst');
  await expect(page.locator('#garmin-recovery')).toContainText('Offen');
  await expect(page.locator('#garmin-activities')).toContainText('Noch keine Aktivitäten');
});
