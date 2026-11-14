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

test('Hunger und Sättigung 1–10 notieren, Auswertung unter Intuitives Essen', async ({ page }) => {
  await createProfile(page);
  await page.goto('/#ernaehrung');
  await page.fill('#food-name', 'Pasta');
  await page.fill('#food-kcal', '650');
  await page.fill('#food-protein', '25');
  await page.click('#food-add');
  const tag = page.locator('#quick-tag');
  await tag.locator('#qt-hb8').click();
  await expect(page.locator('#qt-hb8')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#qt-fa9').click();
  // Hunger und Sättigung notiert → Block geschlossen
  await expect(page.locator('#quick-tag')).toHaveCount(0);
  const food = await page.evaluate(() =>
    Object.values(JSON.parse(localStorage.getItem('gesundheitscockpit') ?? '{}').days).flatMap((/** @type {any} */ d) => d.food ?? []),
  );
  expect(food[0]).toMatchObject({ hungerBefore: 8, hunger: 3, fullAfter: 9 });

  await page.goto('/#ernaehrung/coach');
  await page.click('#coach-intuitiv');
  await expect(page).toHaveURL(/#intuitiv$/);
  await expect(page.locator('#ie-avg')).toContainText('Hunger vorher im Schnitt 8.0');
  await expect(page.locator('#ie-principles li')).toHaveCount(10);
  await expect(page.locator('#ie-evidence')).toContainText('Linardon');
});

test('Gelüste und Mangel: nur belegte Zusammenhänge, mit eigenen Werten', async ({ page }) => {
  await page.goto('/');
  await page.click('#load-demo');
  await page.goto('/#gelueste/eis');
  await expect(page.locator('#cc-evidence')).toContainText('Eisenmangel');
  await expect(page.locator('#cc-evidence .badge')).toHaveText('belegt');
  await expect(page.locator('#cc-mine')).toContainText('Eisen');
  await expect(page.locator('#cc-mine')).toContainText('keinen Bluttest');
  await page.click('#cc-schokolade');
  await expect(page).toHaveURL(/#gelueste\/schokolade$/);
  await expect(page.locator('#cc-none')).toContainText('kein Zusammenhang mit einem Nährstoffmangel belegt');
  await expect(page.locator('#cc-evidence')).toHaveCount(0);
  await expect(page.locator('#cc-mine')).toContainText('Magnesium');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
