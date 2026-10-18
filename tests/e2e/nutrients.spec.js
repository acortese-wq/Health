// @ts-check
import { test, expect } from '@playwright/test';

test('Nährstoffe: Ring, Balken, 7 Tage, Vorschlag erfassen, Suche', async ({ page }) => {
  await page.goto('/');
  await page.click('#load-demo');
  await page.goto('/#ernaehrung');
  const card = page.locator('#nutrients-card');
  await expect(card).toBeVisible();
  await expect(card.locator('.ring')).toHaveAttribute('aria-label', /Kohlenhydrate \d+ %, Fett \d+ %, Protein \d+ %/);
  await expect(page.locator('#n-vitC')).toContainText(/\/ 110 mg/);
  await expect(page.locator('#n-b12')).toContainText(/\/ 4\.0 µg/);
  await expect(page.locator('#n-sodium')).toContainText('max.');
  // Beispieldaten haben überall Detailwerte: kein Abdeckungshinweis
  await expect(page.locator('#nut-coverage')).toHaveCount(0);
  await page.click('#nut-woche');
  await expect(card).toContainText('Durchschnitt pro Tag über 7 Tage');
  await expect(page.locator('#nut-woche')).toHaveAttribute('aria-pressed', 'true');

  // Vorschlag direkt erfassen
  const sug = page.locator('#suggest-card .suggestion');
  await expect(sug).toHaveCount(3);
  const name = (await sug.first().locator('strong').textContent())?.split(':')[0] ?? '';
  await page.click('#sug-add-0');
  await expect(page.locator('#food-entries')).toContainText(name);

  // Suche → Menge → erfassen
  await page.fill('#food-search', 'kiw');
  await page.locator('#food-search-results .chip', { hasText: 'Kiwi' }).click();
  await page.fill('#food-search-grams', '150');
  await page.click('#food-search-add');
  await expect(page.locator('#food-entries')).toContainText('Kiwi (150 g)');
});

test('Vorlieben: ohne Fisch, Fleisch und Milch keine solchen Vorschläge; Abdeckungshinweis bei Schnellerfassung', async ({ page }) => {
  await page.goto('/');
  await page.fill('#p-birth', '1977-05-09');
  await page.fill('#p-height', '172');
  await page.fill('#p-startkg', '95');
  await page.fill('#p-goalkg', '80');
  await page.fill('#p-goaldate', '2027-03-31');
  await page.uncheck('#p-pref-fisch');
  await page.uncheck('#p-pref-fleisch');
  await page.uncheck('#p-pref-milch');
  await page.click('#profile-save');
  await page.goto('/#ernaehrung');
  await page.fill('#food-name', 'Kantine');
  await page.fill('#food-kcal', '600');
  await page.click('#food-add');
  await expect(page.locator('#nut-coverage')).toContainText('0 % der Kalorien');
  const text = await page.locator('#suggest-card').textContent();
  for (const n of ['Lachs', 'Sardinen', 'Thon', 'Forelle', 'Poulet', 'Skyr', 'Joghurt', 'Käse', 'Emmentaler', 'Gruyère']) {
    expect(text).not.toContain(n);
  }
  await page.goto('/#profil');
  await expect(page.locator('#p-pref-fisch')).not.toBeChecked();
  await expect(page.locator('#p-pref-kantine')).toBeChecked();
});
