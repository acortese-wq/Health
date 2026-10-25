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

/** @param {import('@playwright/test').Page} page */
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('gesundheitscockpit') ?? '{}'));
/** @param {import('@playwright/test').Page} page */
const foodToday = async (page) => Object.values((await stored(page)).days).flatMap((/** @type {any} */ d) => d.food ?? []);

test('Bibliothek: Suche, Filter, Favoriten, Detail mit Portionsregler und Nährwerten, Quellen', async ({ page }) => {
  await createProfile(page);
  await page.goto('/#ernaehrung');
  await page.click('#open-recipes');
  await expect(page.locator('h1')).toHaveText('Rezepte und Ernährungsplanung');
  const all = await page.locator('#recipe-list > li').count();
  expect(all).toBeGreaterThanOrEqual(15);
  await page.fill('#recipe-search', 'quark');
  await page.press('#recipe-search', 'Enter');
  await expect(page.locator('#recipe-list > li')).not.toHaveCount(all);
  await expect(page.locator('#recipe-list')).toContainText('Quark mit Apfel und Zimt');
  await page.click('#fav-app-quark-bowl');
  await page.fill('#recipe-search', '');
  await page.press('#recipe-search', 'Enter');
  await page.click('#rf-fav');
  await expect(page.locator('#recipe-list > li')).toHaveCount(1);
  await page.click('#rf-fav');
  await page.click('#rm-abend');
  await page.click('#rf-veg');
  const veg = await page.locator('#recipe-list > li').count();
  expect(veg).toBeGreaterThan(0);
  expect(veg).toBeLessThan(all);
  await page.click('#rm-alle');
  await page.click('#rf-veg');
  // Quellen: NDR-Sammlungen nur verlinkt
  await expect(page.locator('#sources-card a.source-link')).toHaveCount(2);
  await expect(page.locator('#sources-card')).toContainText('Inhalte nicht übernommen');

  // Detail: 2 Portionen → Zutaten und Gesamtwerte verdoppelt, pro Portion gleich
  await page.click('#open-app-quark-bowl');
  await expect(page.locator('#detail-title')).toHaveText('Quark mit Apfel und Zimt');
  await expect(page.locator('#detail-status')).toContainText('Nährwerte berechnet');
  const per1 = await page.locator('#detail-nutrition tbody tr').first().locator('td').nth(0).textContent();
  await page.click('#serv-plus');
  await page.click('#serv-plus');
  await expect(page.locator('#serv-value')).toHaveText('2');
  await expect(page.locator('#detail-ingredients')).toContainText('500 g Magerquark');
  const row = page.locator('#detail-nutrition tbody tr').first();
  await expect(row.locator('td').nth(0)).toHaveText(per1 ?? '');
  const kcal = (/** @type {string | null} */ t) => Number((t ?? '').split(' kcal')[0].replace(/\D/g, ''));
  expect(Math.abs(kcal(await row.locator('td').nth(1).textContent()) - 2 * kcal(per1))).toBeLessThanOrEqual(1);
  await expect(page.locator('#detail-allergens')).toContainText('Milch/Laktose');
  await expect(page.locator('#detail-allergens')).toContainText('Schalenfrüchte');
});

test('Rezept als gegessen erfassen (mit Bestätigung) und in den Wochenplan legen', async ({ page }) => {
  await createProfile(page);
  await page.goto('/#rezepte');
  await page.click('#open-app-kabeljau-paeckli');
  await page.click('#log-open');
  await page.fill('#log-servings', '1,5');
  await page.click('#log-save');
  await expect(page.locator('#toast')).toContainText('erfasst');
  const food = await foodToday(page);
  expect(food).toHaveLength(1);
  expect(food[0].name).toBe('Fisch im Päckli mit Zucchetti und Zitrone (1.5 Portionen)');
  expect(food[0].source).toBe('rezept');
  // In den Plan (heute, Abendessen)
  await page.selectOption('#plan-slot', 'abend');
  await page.click('#plan-save');
  await expect(page.locator('#toast')).toContainText('Geplant: heute');
  await page.goto('/#heute');
  await expect(page.locator('#plan-today')).toContainText('Fisch im Päckli');
  await expect(page.locator('#plan-today-sum')).toContainText('Davon erfasst: 0 von 1');
  // Zuletzt verwendet
  await page.goto('/#rezepte');
  await page.click('#detail-back');
  await expect(page.locator('#recent-recipes')).toContainText('Fisch im Päckli');
});

test('Wochenplan: planen, Portionen, Übernahme idempotent, bewusst nochmals, verschieben, kopieren, laden', async ({ page }) => {
  await createProfile(page);
  await page.goto('/#planung');
  await expect(page.locator('#plan-empty')).toBeVisible();
  const today = await page.locator('.plan-day.is-today').getAttribute('id');
  const date = (today ?? '').replace('day-', '');
  await page.selectOption(`#add-recipe-${date}`, 'app-poulet-reis');
  await page.selectOption(`#add-slot-${date}`, 'mittag');
  await page.click(`#add-go-${date}`);
  const meal = page.locator(`#day-${date} li.planned`).first();
  await expect(meal).toContainText('Poulet mit Reis');
  await expect(page.locator(`#totals-${date}`)).toContainText('Geplant');
  expect(await foodToday(page)).toHaveLength(0);
  // Portionen
  await meal.getByRole('button', { name: /Mehr Portionen/ }).click();
  await expect(page.locator(`#day-${date} li.planned`).first()).toContainText('1.5 Portionen');
  // Übernehmen: Doppelklick auf «Erfassen» erzeugt nur einen Eintrag
  const id = ((await page.locator(`#day-${date} li.planned`).first().getAttribute('id')) ?? '').replace('pm-', '');
  await page.click(`#log-${id}`);
  await expect(page.locator(`#servings-${id}`)).toHaveValue('1.5');
  await page.fill(`#servings-${id}`, '1');
  await page.locator(`#logsave-${id}`).dblclick();
  await expect(page.locator(`#logged-${id}`)).toBeVisible();
  expect(await foodToday(page)).toHaveLength(1);
  // Bewusst eine weitere Portion
  await page.click(`#log-${id}`);
  await page.fill(`#servings-${id}`, '0.5');
  await page.click(`#logsave-${id}`);
  await expect.poll(async () => (await foodToday(page)).length).toBe(2);
  // Tag kopieren auf morgen, dann verschieben
  await page.click(`#copy-go-${date}`);
  const st = await stored(page);
  const tomorrow = Object.keys(st.mealPlan).find((d) => d > date);
  expect(tomorrow).toBeTruthy();
  expect(st.mealPlan[tomorrow ?? ''][0].entryId).toBeUndefined();
  // Neuladen: Plan bleibt erhalten
  await page.reload();
  await expect(page.locator(`#day-${date} li.planned`).first()).toContainText('Poulet mit Reis');
  await expect(page.locator(`#logged-${id}`)).toBeVisible();
  // Eintrag im Protokoll löschen → wieder offen
  await page.goto('/#ernaehrung');
  await page
    .locator('#food-entries .entry')
    .first()
    .getByRole('button', { name: /entfernen/ })
    .click();
  await page
    .locator('#food-entries .entry')
    .first()
    .getByRole('button', { name: /entfernen/ })
    .click();
  await page.goto('/#planung');
  await expect(page.locator(`#logged-${id}`)).toHaveCount(0);
});

test('Einkaufsliste: aus dem Plan, Häkchen, eigene Artikel, geänderte Mengen bleiben, Hinweis bei Planänderung', async ({ page }) => {
  await createProfile(page);
  await page.goto('/#planung');
  const date = ((await page.locator('.plan-day.is-today').getAttribute('id')) ?? '').replace('day-', '');
  for (const id of ['app-quark-bowl', 'app-overnight-oats']) {
    await page.selectOption(`#add-recipe-${date}`, id);
    await page.click(`#add-go-${date}`);
  }
  await page.click('#tab-einkauf');
  await page.click('#shop-build');
  const shop = page.locator('#shopping');
  await expect(shop).toContainText('Magerquark');
  await expect(shop).toContainText('Baumnüsse');
  // Baumnüsse aus beiden Rezepten zusammengezählt: 15 g + 10 g
  const nuts = shop.locator('li.shop-item', { hasText: 'Baumnüsse' });
  await expect(nuts.locator('input.serv-input')).toHaveValue('25');
  await nuts.locator('input[type=checkbox]').check();
  // Menge ändern und eigenen Artikel ergänzen
  const quark = shop.locator('li.shop-item', { hasText: 'Magerquark' });
  await quark.locator('input.serv-input').fill('500');
  await quark.locator('input.serv-input').press('Enter');
  await quark.locator('input.serv-input').blur();
  await page.fill('#shop-label', 'Kaffee');
  await page.click('#shop-add-go');
  await expect(shop).toContainText('Kaffee');
  // Plan ändern → Hinweis, Abgleich behält Häkchen, eigene Menge und eigenen Artikel
  await page.click('#tab-plan');
  await page.selectOption(`#add-recipe-${date}`, 'app-quark-bowl');
  await page.click(`#add-go-${date}`);
  await page.click('#tab-einkauf');
  await expect(page.locator('#shop-outdated')).toBeVisible();
  await page.click('#shop-build');
  await expect(page.locator('#shop-changes')).toContainText('Magerquark: Plan ergibt jetzt');
  await expect(shop.locator('li.shop-item', { hasText: 'Magerquark' }).locator('input.serv-input')).toHaveValue('500');
  await expect(shop.locator('li.shop-item', { hasText: 'Baumnüsse' }).locator('input[type=checkbox]')).toBeChecked();
  await expect(shop).toContainText('Kaffee');
  await page.reload();
  await page.click('#tab-einkauf');
  await expect(shop).toContainText('Kaffee');
});

test('Eigenes Rezept mit Lebensmittelsuche, Stück-Umrechnung, Bearbeiten; Import mit Fehlerbericht', async ({ page }) => {
  await createProfile(page);
  await page.goto('/#rezepte');
  await page.click('#recipe-new');
  await page.fill('#r-title', 'Spiegeleier mit Tomate');
  await page.fill('#ing-amount-0', '2');
  await page.selectOption('#ing-unit-0', 'Stück');
  await page.fill('#ing-search-0', 'ei');
  await page.locator('#ing-results-0 .chip', { hasText: /^Ei/ }).first().click();
  await expect(page.locator('#ing-food-0')).toContainText('Datenbank: Ei');
  await page.click('#ing-add');
  await page.fill('#ing-amount-1', '1');
  await page.selectOption('#ing-unit-1', 'Stück');
  await page.fill('#ing-search-1', 'tomate');
  await page.locator('#ing-results-1 .chip', { hasText: 'Tomate' }).first().click();
  await page.click('#ing-add');
  await page.fill('#ing-label-2', 'Salz, Pfeffer');
  await page.fill('#r-steps', 'Eier braten\nTomate dazu');
  await expect(page.locator('#editor-preview')).toContainText('Nährwerte berechnet');
  await page.click('#recipe-save');
  await expect(page.locator('#detail-title')).toHaveText('Spiegeleier mit Tomate');
  await expect(page.locator('#detail-ingredients')).toContainText('2 Stück');
  await expect(page.locator('#detail-ingredients')).toContainText('≈ 120 g');
  await expect(page.locator('#detail-allergens')).toContainText('Ei');
  // Bearbeiten
  await page.click('#edit-own');
  await page.fill('#r-title', 'Spiegeleier mit Tomate und Brot');
  await page.click('#recipe-save');
  await expect(page.locator('#detail-title')).toHaveText('Spiegeleier mit Tomate und Brot');
  const st = await stored(page);
  expect(st.recipes).toHaveLength(1);
  expect(st.schema).toBeGreaterThanOrEqual(3);

  // Import: gültig, ungültig, Duplikat, CSV-Referenz
  await page.click('#detail-back');
  const json = JSON.stringify({
    recipes: [
      {
        title: 'Importiertes Müesli',
        servings: 1,
        ingredients: [{ foodKey: 'haferflocken', amount: 50, unit: 'g', label: 'Haferflocken' }],
      },
      { title: 'Kaputt', ingredients: [{ foodKey: 'gibtsnicht', amount: 1, unit: 'g', label: 'x' }] },
      { title: 'Spiegeleier mit Tomate und Brot', ingredients: [{ foodKey: 'ei', amount: 1, unit: 'Stück', label: 'Ei' }] },
    ],
  });
  await page.setInputFiles('#recipe-import', { name: 'rezepte.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await expect(page.locator('#import-report')).toContainText('1 importiert, 2 übersprungen');
  await expect(page.locator('#import-report')).toContainText('unbekannt');
  await expect(page.locator('#import-report')).toContainText('gleicher Titel');
  const csv =
    'Titel;Link;Herausgeber;Mahlzeit\nBeispiel-Referenz;https://www.ndr.de/ratgeber/kochen/rezepte/beispiel.html;NDR;Abendessen\n';
  await page.setInputFiles('#recipe-import', { name: 'ref.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.locator('#import-report')).toContainText('1 importiert');
  await page.click('#rf-own');
  await page.click('#open-' + (await stored(page)).recipes.find((/** @type {any} */ r) => r.title === 'Beispiel-Referenz').id);
  await expect(page.locator('#detail-source')).toContainText('Externe Referenz');
  await expect(page.locator('#detail-source')).toContainText('nur Link');
  await expect(page.locator('#detail-url')).toHaveAttribute('href', /ndr\.de/);
  await expect(page.locator('#ref-to-own')).toBeVisible();
});

test('Datenschutz: Modul arbeitet ohne Netzwerk-Anfragen; mobil kein horizontales Scrollen', async ({ page }) => {
  /** @type {string[]} */
  const external = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost')) external.push(r.url());
  });
  await page.goto('/');
  await page.click('#load-demo');
  for (const route of ['rezepte', 'planung']) {
    await page.goto(`/#${route}`);
    await expect(page.locator('h1')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontales Scrollen auf #${route}`).toBeLessThanOrEqual(0);
  }
  await page.goto('/#rezepte');
  await page.click('#open-app-linsensalat');
  await page.click('#plan-save');
  await page.goto('/#planung');
  await page.click('#tab-einkauf');
  await page.click('#shop-build');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(external.filter((u) => !/fonts\./.test(u))).toEqual([]);
});
