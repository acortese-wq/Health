// @ts-check
import { test, expect } from '@playwright/test';

/** @param {import('@playwright/test').Page} page */
function collectErrors(page) {
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    // Google Fonts kann in abgeschotteten Umgebungen fehlen; das ist kein App-Fehler.
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text()) && !m.text().includes('ERR_')) errors.push(m.text());
  });
  return errors;
}

/** @param {import('@playwright/test').Page} page */
async function createProfile(page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Willkommen im Gesundheitscockpit' })).toBeVisible();
  await page.fill('#p-name', 'Alessandro');
  await page.fill('#p-birth', '1977-05-09');
  await page.fill('#p-height', '172');
  await page.fill('#p-startkg', '95');
  await page.fill('#p-goalkg', '80');
  await page.fill('#p-goaldate', '2027-03-31');
  await page.fill('#p-cafstart', '7');
  await page.click('#profile-save');
}

test('Onboarding: Profil anlegen führt zur Tagesansicht mit Zielen', async ({ page }) => {
  const errors = collectErrors(page);
  await createProfile(page);
  await expect(page).toHaveURL(/#heute$/);
  await expect(page.locator('.stat').nth(0)).toContainText('95');
  await expect(page.locator('.stat').nth(2)).toContainText('Ziel 130 g');
  await expect(page.locator('main')).toContainText('Kalibrierung läuft');
  expect(errors).toEqual([]);
});

test('Profilformular meldet ungültige Eingaben verständlich', async ({ page }) => {
  await page.goto('/');
  await page.click('#profile-save');
  const box = page.locator('#profile-errors');
  await expect(box).toBeVisible();
  await expect(box).toContainText('Geburtsdatum');
  await expect(box).toContainText('Grösse');
});

test('Tageserfassung: Gewicht, Mahlzeit, Koffein, Werte bleiben nach Neuladen erhalten', async ({ page }) => {
  const errors = collectErrors(page);
  await createProfile(page);
  await page.fill('#weight', '94,6');
  await page.click('#weight-save');
  await expect(page.locator('#weight')).toHaveValue('94.6');

  await page.click('#cta-meal');
  await expect(page).toHaveURL(/#ernaehrung(\/erfassen)?$/);
  await page.click('#preset-skyr');
  await expect(page.locator('.entries').first()).toContainText('Skyr');
  await page.fill('#food-name', 'Kantine');
  await page.fill('#food-kcal', '650');
  await page.fill('#food-protein', '40');
  await page.click('#food-add');
  await expect(page.locator('#diary-eaten')).toContainText('860');

  await page.click('#nav-profil');
  await page.goto('/#heute');
  await page.click('#caf-kaffee');
  await expect(page.locator('#c-h').locator('..')).toContainText('90');

  await page.fill('#steps', '9500');
  await page.fill('#sleep', '7,5');
  await page.fill('#rhr', '48');
  await page.click('#recovery-save');

  await page.reload();
  await expect(page.locator('#weight')).toHaveValue('94.6');
  await expect(page.locator('#steps')).toHaveValue('9500');
  await page.goto('/#ernaehrung');
  await expect(page.locator('#diary-eaten')).toContainText('860');
  expect(errors).toEqual([]);
});

test('Eingaben werden nie als HTML interpretiert', async ({ page }) => {
  await createProfile(page);
  await page.goto('/#ernaehrung');
  await page.fill('#food-name', '<img src=x onerror="window.__xss=1">');
  await page.fill('#food-kcal', '100');
  await page.click('#food-add');
  await expect(page.locator('.entries').first()).toContainText('<img src=x');
  expect(await page.evaluate(() => /** @type {any} */ (window).__xss)).toBeUndefined();
});

test('Beispieldaten: alle Ansichten rendern ohne Fehler und ohne horizontales Scrollen', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await page.click('#load-demo');
  for (const route of ['heute', 'ernaehrung', 'fortschritt', 'training', 'gesundheit', 'wissen', 'profil']) {
    await page.goto(`/#${route}`);
    await expect(page.locator('main h1, main .summary').first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontales Scrollen auf #${route}`).toBeLessThanOrEqual(0);
  }
  await page.goto('/#gewicht'); // alte Adresse leitet auf Fortschritt
  await expect(page.locator('svg.chart .trend-line')).toBeVisible();
  await expect(page.locator('svg.chart .dots circle').first()).toBeAttached();
  await page.goto('/#gesundheit');
  await page.locator('.fold-summary', { hasText: 'Laborwerte' }).click();
  await expect(page.getByText('eGFR (CKD-EPI 2021)')).toBeVisible();
  await expect(page.getByText('FIB-4 (Leberfibrose)')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Krafttraining erfassen schlägt beim nächsten Mal die Progression vor', async ({ page }) => {
  await createProfile(page);
  await page.goto('/#training');
  await page.click('#tpl-A-toggle');
  for (let i = 0; i < 3; i++) {
    await page.fill(`#brustpresse-${i}-kg`, '40');
    await page.fill(`#brustpresse-${i}-reps`, '12');
  }
  await page.click('#tpl-A-save');
  await expect(page.locator('.entries')).toContainText('Kraft A');
  await page.click('#tpl-A-toggle');
  await expect(page.locator('#brustpresse-0-kg')).toHaveValue('42.5');
});

test('Blutdruck: stark erhöhter Wert wird deutlich markiert', async ({ page }) => {
  await createProfile(page);
  await page.goto('/#gesundheit');
  // Bereiche sind eingeklappt; der Status steht in der Kopfzeile
  await expect(page.locator('#bp-sys')).toBeHidden();
  await page.locator('.fold-summary', { hasText: 'Blutdruck' }).click();
  await page.fill('#bp-sys', '185');
  await page.fill('#bp-dia', '105');
  await page.click('#bp-save');
  await expect(page.locator('.callout .badge-alert')).toHaveText('Stark erhöht');
  await expect(page.locator('.fold-summary', { hasText: 'Blutdruck' }).locator('.badge-alert')).toHaveText('Stark erhöht');
  // Offener Bereich bleibt nach dem Neuladen offen
  await page.reload();
  await expect(page.locator('#bp-sys')).toBeVisible();
  await page.goto('/#heute');
  await expect(page.locator('.hint-item.sev-alert')).toContainText('Blutdruck');
});

test('Backup: Export und Import ergeben dieselben Daten', async ({ page }) => {
  await page.goto('/');
  await page.click('#load-demo');
  await page.goto('/#profil');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-json')]);
  const path = await download.path();
  await expect(page.getByText(/Letztes Backup:/)).toBeVisible();
  const before = await page.evaluate(() => localStorage.getItem('gesundheitscockpit'));
  await page.click('#delete-all');
  await page.click('#delete-confirm');
  await expect(page.getByRole('heading', { name: 'Willkommen im Gesundheitscockpit' })).toBeVisible();
  await page.setInputFiles('#import-file', path);
  await expect(page.getByText('Daten importiert')).toBeVisible();
  const after = await page.evaluate(() => localStorage.getItem('gesundheitscockpit'));
  expect(JSON.parse(after ?? '{}')).toEqual(JSON.parse(before ?? '{}'));
});

test('Datumsnavigation: Vortage nachtragen, keine Zukunft', async ({ page }) => {
  await createProfile(page);
  await expect(page.locator('#date-next')).toBeDisabled();
  // Startgewicht wird beim Anlegen des Profils für heute übernommen
  await expect(page.locator('#weight')).toHaveValue('95');
  await page.click('#date-prev');
  await expect(page.locator('#date-today')).toBeVisible();
  await expect(page.locator('#weight')).toHaveValue('');
  await page.fill('#weight', '95,4');
  await page.click('#weight-save');
  await page.click('#date-today');
  await expect(page.locator('#weight')).toHaveValue('95');
  await page.click('#date-prev');
  await expect(page.locator('#weight')).toHaveValue('95.4');
});
