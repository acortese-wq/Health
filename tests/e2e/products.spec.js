// @ts-check
import { test, expect } from '@playwright/test';

test('Produktsuche Migros/Coop über Open Food Facts: Händlerfilter, Etikettwerte, Erfassen', async ({ page }) => {
  /** @type {string[]} */
  const urls = [];
  // Neue Suche überlastet → Rückfall auf die klassische Suche
  await page.route('https://search.openfoodfacts.org/**', (route) => route.fulfill({ status: 503, body: '' }));
  await page.route('https://world.openfoodfacts.org/cgi/search.pl**', (route) => {
    urls.push(route.request().url());
    return route.fulfill({
      json: {
        products: [
          {
            code: '7610200000001',
            product_name_de: 'Skyr nature',
            brands: 'M-Classic',
            stores: 'Migros',
            quantity: '450 g',
            serving_quantity: 150,
            nutriments: {
              'energy-kcal_100g': 63,
              proteins_100g: 11,
              carbohydrates_100g: 4,
              fat_100g: 0.2,
              salt_100g: 0.1,
              calcium_100g: 0.12,
            },
          },
        ],
      },
    });
  });
  await page.goto('/');
  await page.click('#load-demo');
  await page.goto('/#ernaehrung');
  await page.fill('#food-search', 'Skyr');
  await page.click('#store-migros');
  await expect(page.locator('#store-migros')).toHaveAttribute('aria-pressed', 'true');
  await page.click('#off-search');
  await expect(page.locator('#off-0')).toContainText('Skyr nature');
  await expect(page.locator('#off-0')).toContainText('mit Vitaminen');
  const u = new URL(urls[0]);
  expect(u.searchParams.get('search_terms')).toBe('Skyr');
  expect(u.searchParams.get('tag_0')).toBe('switzerland');
  expect(u.searchParams.get('tag_1')).toBe('migros');
  await page.click('#off-0');
  await expect(page.locator('#off-grams')).toHaveValue('150');
  const before = await page.locator('#n-calcium .nrow-val strong').textContent();
  await page.click('#off-add');
  await expect(page.locator('#food-entries')).toContainText('Skyr nature (M-Classic), 150 g');
  const after = await page.locator('#n-calcium .nrow-val strong').textContent();
  const n = (/** @type {string | null} */ t) => Number((t ?? '0').replace(/[’']/g, ''));
  expect(n(after) - n(before)).toBe(180);
});

test('Produktsuche: neue Suche, Treffer ohne Nährwerte werden per Strichcode nachgeladen', async ({ page }) => {
  /** @type {string[]} */
  const urls = [];
  await page.route('https://search.openfoodfacts.org/**', (route) => {
    urls.push(route.request().url());
    return route.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      json: { hits: [{ code: '7613404235658', product_name: { de: 'Vollkornbrot', main: 'Pain complet' } }] },
    });
  });
  await page.route('https://world.openfoodfacts.org/api/v2/product/**', (route) =>
    route.fulfill({
      json: {
        status: 1,
        product: { product_name_de: 'Vollkornbrot', brands: 'Coop', nutriments: { 'energy-kcal_100g': 230, proteins_100g: 8 } },
      },
    }),
  );
  await page.goto('/');
  await page.click('#load-demo');
  await page.goto('/#ernaehrung');
  await page.fill('#food-search', 'Vollkornbrot (dunkel)');
  await page.click('#store-coop');
  await page.click('#off-search');
  await expect(page.locator('#off-0')).toContainText('Vollkornbrot');
  await expect(page.locator('#off-0')).toContainText('230 kcal');
  const q = new URL(urls[0]).searchParams.get('q') ?? '';
  expect(q).toContain('Vollkornbrot dunkel');
  expect(q).toContain('countries_tags:"en:switzerland"');
  expect(q).toContain('stores_tags:"coop"');
});

test('Produktsuche: Server nicht erreichbar → verständliche Meldung mit Ausweg', async ({ page }) => {
  await page.route('https://search.openfoodfacts.org/**', (route) => route.abort('failed'));
  await page.route('https://world.openfoodfacts.org/**', (route) => route.abort('failed'));
  await page.goto('/');
  await page.click('#load-demo');
  await page.goto('/#ernaehrung');
  await page.fill('#food-search', 'Brot');
  await page.click('#off-search');
  await expect(page.locator('#off-results')).toContainText('neuer Versuch 2 von 3');
  await expect(page.locator('#off-results')).toContainText('überlastet oder nicht erreichbar', { timeout: 15000 });
  await expect(page.locator('#off-results')).toContainText('Schweizer Nährwertdatenbank');
});

test('Produktsuche: Fehler von Open Food Facts verständlich anzeigen', async ({ page }) => {
  await page.route('https://search.openfoodfacts.org/**', (route) => route.fulfill({ status: 429, body: '' }));
  await page.route('https://world.openfoodfacts.org/cgi/search.pl**', (route) => route.fulfill({ status: 429, body: '' }));
  await page.goto('/');
  await page.click('#load-demo');
  await page.goto('/#ernaehrung');
  await page.fill('#food-search', 'Brot');
  await page.click('#off-search');
  await expect(page.locator('#off-results')).toContainText('Zu viele Suchen');
});

test('Produktsuche: App wiederholt selbst, wenn Open Food Facts zeitweise nicht antwortet', async ({ page }) => {
  let calls = 0;
  await page.route('https://world.openfoodfacts.org/cgi/search.pl**', (route) => route.abort('failed'));
  await page.route('https://search.openfoodfacts.org/**', (route) => {
    calls++;
    if (calls === 1) return route.abort('failed');
    return route.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      json: { hits: [{ code: '7610000000002', product_name: 'Hüttenkäse', nutriments: { 'energy-kcal_100g': 95, proteins_100g: 12 } }] },
    });
  });
  await page.goto('/');
  await page.click('#load-demo');
  await page.goto('/#ernaehrung');
  await page.fill('#food-search', 'Hüttenkäse');
  await page.click('#off-search');
  await expect(page.locator('#off-0')).toContainText('Hüttenkäse', { timeout: 10000 });
  // Zweite Suche kommt aus dem Zwischenspeicher, ohne neue Anfrage
  await page.click('#off-search');
  await expect(page.locator('#off-0')).toContainText('Hüttenkäse');
  expect(calls).toBe(2);
});
