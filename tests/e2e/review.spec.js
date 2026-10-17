// @ts-check
import { test, expect } from '@playwright/test';

test('Rückblick: Gestern, Heute und 7 Tage mit Erfolgen und Fokus', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.click('#load-demo');
  await page.goto('/#heute');
  const card = page.locator('section.review');
  await expect(card).toBeVisible();

  await page.click('#review-yesterday');
  await expect(page.locator('#review-yesterday')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#review-headline')).not.toBeEmpty();
  await expect(page.locator('#review-wins li').first()).toBeVisible();
  await expect(page.locator('section.review')).toContainText(/Dein Fokus für morgen|Beständigkeit|weitermachen/);

  await page.click('#review-week');
  await expect(page.locator('section.review')).toContainText(/Fokus nächste Woche|Niveau/);
  await expect(page.locator('#review-wins')).toContainText('Proteinziel');
  if (process.env.SHOT) await card.screenshot({ path: `${process.env.SHOT}/review-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
