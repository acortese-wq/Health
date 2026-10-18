// @ts-check
import { test, expect } from '@playwright/test';

test('Intervallfasten 16:8: aus per Standard, Karte, Markierung, Wissen', async ({ page }) => {
  await page.goto('/');
  await page.click('#load-demo');
  await expect(page.locator('#fasting-card')).toHaveCount(0);
  await page.goto('/#profil');
  await page.selectOption('#p-fasting', '8');
  await page.fill('#p-eatstart', '11:00');
  await page.click('#profile-save');
  await page.goto('/#heute');
  const card = page.locator('#fasting-card');
  await expect(card).toBeVisible();
  await expect(card.locator('h2')).toHaveText('Essensfenster 16:8');
  await expect(card).toContainText('Heute 11:00–19:00');
  await expect(card).toContainText('Proteinplan: 3 Portionen');
  // Beispieldaten: Milch 07:00 (60 kcal), Apfel 10:00 und Pasta 19:15 liegen ausserhalb
  await expect(page.locator('#fast-outside')).toContainText('3 Mahlzeiten, 1');
  await page.goto('/#ernaehrung');
  await expect(page.locator('.entries li', { hasText: 'Apfel' })).toContainText('ausserhalb Fenster');
  await expect(page.locator('.entries li', { hasText: 'Mittagsteller' })).not.toContainText('ausserhalb Fenster');
  // Einstellung bleibt nach Neuladen
  await page.goto('/#profil');
  await page.reload();
  await expect(page.locator('#p-fasting')).toHaveValue('8');
  await page.goto('/#wissen');
  await expect(page.locator('main')).toContainText('frühes Essensfenster');
});
