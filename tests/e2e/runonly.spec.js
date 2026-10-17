// @ts-check
import { test, expect } from '@playwright/test';

test('Profil auf «Nur Laufen»: keine Krafteinheiten, Läufe zählen, Hinweis sichtbar', async ({ page }) => {
  await page.goto('/');
  await page.click('#load-demo');
  await page.goto('/#profil');
  await page.selectOption('#p-training', 'laufen');
  await page.click('#profile-save');
  await page.goto('/#training');
  await expect(page.locator('#tpl-A-toggle')).toHaveCount(0);
  await expect(page.locator('#run-save')).toBeVisible();
  await expect(page.locator('.summary .stat').first()).toContainText('Läufe');
  await expect(page.locator('#run-only-note')).toBeVisible();
  await expect(page.locator('#plan-h')).toHaveText('Wochenplan: nur Laufen');
  // Frühere Krafteinheiten bleiben in der Historie
  await expect(page.locator('.entries')).toContainText('Kraft');
  await page.goto('/#heute');
  await expect(page.locator('.hint-item', { hasText: 'Krafttraining diese Woche' })).toHaveCount(0);
  // Zurückwechseln jederzeit möglich
  await page.goto('/#profil');
  await page.selectOption('#p-training', 'kombi');
  await page.click('#profile-save');
  await page.goto('/#training');
  await expect(page.locator('#tpl-A-toggle')).toBeVisible();
});
