// @ts-check
import { test, expect } from '@playwright/test';

test('Trinken: Glas und Flasche erfassen, korrigieren, bleibt nach Neuladen', async ({ page }) => {
  await page.goto('/');
  await page.fill('#p-birth', '1977-05-09');
  await page.fill('#p-height', '172');
  await page.fill('#p-startkg', '95');
  await page.fill('#p-goalkg', '80');
  await page.fill('#p-goaldate', '2027-03-31');
  await page.click('#profile-save');
  const card = page.locator('section[aria-labelledby="water-h"]');
  await expect(card).toContainText('0 / 2’000 ml');
  await expect(page.locator('#water-minus')).toBeDisabled();
  await page.click('#water-250');
  await page.click('#water-500');
  await page.click('#water-750');
  await expect(card).toContainText('1’500 / 2’000 ml');
  await page.click('#water-minus');
  await expect(card).toContainText('1’250 / 2’000 ml');
  await page.reload();
  await expect(card).toContainText('1’250 / 2’000 ml');
  await expect(card).toContainText('5 Gläser');
});
