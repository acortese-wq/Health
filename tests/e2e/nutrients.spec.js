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
  const sug = page.locator('#suggest-card .suggestion:not(.meal)');
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
  const text = (await page.locator('#suggest-card .suggestion').allTextContents()).join(' ');
  for (const n of ['Lachs', 'Sardinen', 'Thon', 'Forelle', 'Poulet', 'Skyr', 'Joghurt', 'Käse', 'Emmentaler', 'Gruyère']) {
    expect(text).not.toContain(n);
  }
  await page.goto('/#profil');
  await expect(page.locator('#p-pref-fisch')).not.toBeChecked();
  await expect(page.locator('#p-pref-kantine')).toBeChecked();
});

test('Essrhythmus: Kurznotiz zu Hunger und Grund, Muster, Lebensmittelpyramide', async ({ page }) => {
  await page.goto('/');
  await page.click('#load-demo');
  await page.goto('/#ernaehrung');
  await expect(page.locator('#quick-tag')).toContainText('19:15 Pasta-Teller');
  await page.click('#qt-stress');
  await expect(page.locator('#quick-tag')).not.toContainText('19:15');
  await expect(page.locator('#food-entries li', { hasText: 'Pasta-Teller' })).toContainText('Stress');
  await expect(page.locator('#slot-zmittag')).toContainText('kcal');
  await expect(page.locator('#patterns')).toBeVisible();
  await expect(page.locator('#trigger-top')).toContainText('Häufigster Grund abends');
  // Pyramide aus den Beispieldaten
  await expect(page.locator('#pyr-fv')).toContainText('Portionen');
  await expect(page.locator('#pyr-milch .nrow-val strong')).not.toHaveText('0.0');
  await expect(page.locator('#pyr-fisch')).toBeVisible();
  // Grund im Bearbeiten-Formular ändern
  await page
    .locator('#food-entries li', { hasText: 'Pasta-Teller' })
    .getByRole('button', { name: /bearbeiten/ })
    .click();
  await expect(page.locator('#edit-trigger')).toHaveValue('stress');
  await page.selectOption('#edit-trigger', 'muede');
  await page.click('#edit-save');
  await expect(page.locator('#food-entries li', { hasText: 'Pasta-Teller' })).toContainText('Müdigkeit');
});

test('Ganze Mahlzeit vorschlagen und erfassen, Tipps fürs Personalrestaurant', async ({ page }) => {
  await page.goto('/');
  await page.click('#load-demo');
  await page.goto('/#ernaehrung');
  // Am Beispieltag ist das Budget aufgebraucht: Pasta-Teller entfernen schafft Platz
  await page
    .locator('#food-entries li', { hasText: 'Pasta-Teller' })
    .getByRole('button', { name: /entfernen/ })
    .click();
  await expect(page.locator('#meal-0')).toBeVisible();
  const name = await page.locator('#meal-0 strong').textContent();
  await page.click('#meal-add-0');
  await expect(page.locator('#food-entries')).toContainText(name ?? '');
  await page.locator('#canteen summary').click();
  await expect(page.locator('#canteen')).toContainText('Teller-Modell');
});

test('Bericht für die Ernährungsberatung, SCOFF ohne Speicherung, Hand-Methode', async ({ page }) => {
  await page.goto('/');
  await page.click('#load-demo');
  await page.goto('/#profil');
  await page.click('#open-report');
  await expect(page).toHaveURL(/#bericht$/);
  const r = page.locator('#report');
  await expect(r).toContainText('Bericht für die Ernährungsberatung');
  await expect(r).toContainText('Energiebedarf');
  await expect(r).toContainText('Lebensmittelpyramide');
  await expect(r).toContainText('KLV Art. 9b');
  await expect(page.locator('#report-print')).toBeVisible();
  // SCOFF: Auswertung, aber nichts gespeichert
  await page.goto('/#gesundheit');
  await page.check('#scoff-c');
  await page.check('#scoff-f2');
  await expect(page.locator('#scoff-result')).toContainText('Abklärung empfohlen');
  const stored = await page.evaluate(() => JSON.stringify(localStorage));
  expect(stored).not.toContain('scoff');
  await page.goto('/#ernaehrung');
  await page.locator('#hand-method summary').click();
  await expect(page.locator('#hand-method')).toContainText('Handfläche');
  await expect(page.locator('#forgotten')).toContainText('Öl, Butter');
});
