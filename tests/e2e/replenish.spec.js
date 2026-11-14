// @ts-check
import { test, expect } from '@playwright/test';

test('Gezielt auffüllen: Nährstoff wählen, Lebensmittel erfassen, Rezept öffnen, Aufnahme-Tipps', async ({ page }) => {
  await page.goto('/');
  await page.click('#load-demo');
  await page.goto('/#ernaehrung/analyse');
  await page.click('#nut-fill');
  await expect(page).toHaveURL(/#auffuellen$/);
  await expect(page.locator('#fill-foods .fill-item').first()).toBeVisible();
  await page.selectOption('#fill-pick', 'epaDha');
  await expect(page).toHaveURL(/#auffuellen\/epaDha$/);
  await expect(page.locator('#fill-foods')).toContainText(/Lachs|Hering|Makrele|Sardine|Forelle/);
  await expect(page.locator('#fill-tips')).toContainText('Burdge');
  await page.click('#fill-add-0');
  await expect(page.locator('#toast')).toContainText('erfasst');

  await page.goto('/#auffuellen/iron');
  await expect(page.locator('#fill-have')).toContainText('Dein Schnitt');
  await expect(page.locator('#fill-tips')).toContainText('Kaffee');
  await page.goto('/#auffuellen/protein');
  const rec = page.locator('#fill-recipes button').first();
  await rec.click();
  await expect(page).toHaveURL(/#rezepte$/);
  await expect(page.locator('h1, h2').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('Gelüste: bei knappem Nährstoff Link zum gezielten Auffüllen', async ({ page }) => {
  await page.goto('/');
  await page.fill('#p-birth', '1977-05-09');
  await page.fill('#p-height', '172');
  await page.fill('#p-startkg', '95');
  await page.fill('#p-goalkg', '80');
  await page.fill('#p-goaldate', '2027-06-30');
  await page.click('#profile-save');
  await page.goto('/#ernaehrung');
  await page.fill('#food-search', 'apfel');
  await page.locator('#food-search-results .chip').first().click();
  await page.click('#food-search-add');
  await page.goto('/#gelueste/fleisch');
  await page.click('#fill-iron');
  await expect(page).toHaveURL(/#auffuellen\/iron$/);
});
