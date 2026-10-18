// @ts-check
import { test, expect } from '@playwright/test';

/** Datum relativ zu heute (Ortszeit) als YYYY-MM-DD */
const iso = (/** @type {number} */ offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('Frauenprofil: Zyklus erfassen, Phase und Hinweise; Schwangerschaft ohne Defizit', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#cycle-section')).toBeHidden();
  await page.selectOption('#p-sex', 'f');
  await expect(page.locator('#cycle-section')).toBeVisible();
  await page.fill('#p-birth', '1980-03-12');
  await page.fill('#p-height', '165');
  await page.fill('#p-startkg', '72');
  await page.fill('#p-goalkg', '65');
  await page.fill('#p-goaldate', '2027-06-30');
  await page.selectOption('#p-cycle', 'natuerlich');
  await page.fill('#p-lastperiod', iso(-24));
  await page.click('#profile-save');
  await expect(page).toHaveURL(/#heute$/);

  const card = page.locator('#cycle-card');
  await expect(card).toContainText('Tag 25');
  await expect(card).toContainText('Tage vor der Periode');
  await expect(page.locator('#cycle-tip')).toContainText('kein Fett');
  await expect(page.locator('main')).toContainText('Tage vor der Periode');
  // Eisenziel für Frauen
  await page.goto('/#ernaehrung');
  await expect(page.locator('#n-iron .nrow-val')).toContainText('/ 16');

  // Periode heute eintragen → Tag 1
  await page.goto('/#heute');
  await page.click('#period-toggle');
  await expect(page.locator('#period-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(card).toContainText('Tag 1');
  await expect(card).toContainText('Periode');
  await page.reload();
  await expect(page.locator('#cycle-card')).toContainText('Tag 1');

  // Schwangerschaft: Zyklus-Karte weg, kein Defizit, Hinweis, Nährstoffziele angepasst
  await page.goto('/#profil');
  await page.selectOption('#p-cycle', 'schwanger');
  await page.click('#profile-save');
  await page.goto('/#heute');
  await expect(page.locator('#cycle-card')).toHaveCount(0);
  await expect(page.locator('main')).toContainText('Schwangerschaft: kein Kaloriendefizit');
  await page.goto('/#ernaehrung');
  await expect(page.locator('#n-folate .nrow-val')).toContainText('/ 550');
  await expect(page.locator('#n-iron .nrow-val')).toContainText('/ 27');
});

test('Männerprofil: kein Zyklusbereich', async ({ page }) => {
  await page.goto('/');
  await page.click('#load-demo');
  await expect(page.locator('#cycle-card')).toHaveCount(0);
  await page.goto('/#profil');
  await expect(page.locator('#cycle-section')).toBeHidden();
});
