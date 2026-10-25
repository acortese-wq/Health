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

test('Emotionales Essen: Grund direkt nach dem Erfassen notieren, Hunger-Check mit Soforthilfe', async ({ page }) => {
  await createProfile(page);
  await page.goto('/#ernaehrung');
  await page.fill('#food-name', 'Chips');
  await page.fill('#food-kcal', '330');
  await page.fill('#food-protein', '4');
  await page.click('#food-add');
  // Notiz-Leiste steht direkt unter «Heute gegessen»
  const tag = page.locator('#eaten-card #quick-tag');
  await expect(tag).toContainText('Chips');
  await tag.locator('#qt-tv').click();
  await expect(page.locator('#quick-tag')).toHaveCount(0);
  const stored = await page.evaluate(() =>
    Object.values(JSON.parse(localStorage.getItem('gesundheitscockpit') ?? '{}').days).flatMap((/** @type {any} */ d) => d.food ?? []),
  );
  expect(stored[0].trigger).toBe('tv');

  await page.click('#sub-coach');
  const card = page.locator('#emotional-card');
  await expect(card.locator('#emo-none')).toContainText('1 von mindestens 5');
  await card.locator('#hunger-check summary').click();
  await expect(card).toContainText('Körperlicher Hunger');
  await card.locator('#sos-stress').click();
  await expect(page.locator('#sos-tip')).toContainText('10 Minuten raus');
  await expect(page.locator('#sos-tip')).toContainText('Adam TC');
});
