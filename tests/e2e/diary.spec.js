// @ts-check
import { test, expect } from '@playwright/test';

/** @param {number} n Tage zurück */
const isoAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

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
const foodOf = (page, /** @type {string} */ date) =>
  page.evaluate((d) => JSON.parse(localStorage.getItem('gesundheitscockpit') ?? '{}').days[d]?.food ?? [], date);

test('Tagebuch: Kalorienring, Mahlzeit wählen, «wie gestern» übernehmen, Unterseiten', async ({ page }) => {
  await createProfile(page);
  // Gestern: Frühstück mit zwei Einträgen
  await page.evaluate(
    ([y]) => {
      const st = JSON.parse(localStorage.getItem('gesundheitscockpit') ?? '{}');
      st.days[y] = {
        food: [
          { id: 'y1', name: 'Skyr mit Beeren', kcal: 250, protein: 25, time: '07:20' },
          { id: 'y2', name: 'Kaffee mit Milch', kcal: 40, protein: 2, time: '07:25' },
          { id: 'y3', name: 'Pasta', kcal: 700, protein: 25, time: '19:00' },
        ],
      };
      localStorage.setItem('gesundheitscockpit', JSON.stringify(st));
    },
    [isoAgo(1)],
  );
  await page.reload();
  await page.click('#cta-meal');
  await expect(page).toHaveURL(/#ernaehrung\/erfassen$/);
  await expect(page.locator('#capture-card')).toBeInViewport();
  // Ring: noch nichts gegessen → ganzes Budget übrig
  await expect(page.locator('#diary-head')).toContainText('kcal übrig');
  const target = Number((await page.locator('#kcal-left').textContent())?.replace(/\D/g, ''));
  expect(target).toBeGreaterThan(1000);

  // «+ Frühstück»: Erfassung mit Uhrzeit 07:30 und Angebot «wie gestern»
  await page.click('#mealslot-fruehstueck');
  await expect(page.locator('#cap-h')).toHaveText('Erfassen: Frühstück');
  await expect(page.locator('#slot-copy')).toContainText('2 Einträge, 290 kcal');
  await page.click('#slot-copy');
  let food = await foodOf(page, isoAgo(0));
  expect(food.map((/** @type {any} */ f) => f.name).sort()).toEqual(['Kaffee mit Milch', 'Skyr mit Beeren']);
  expect(food.every((/** @type {any} */ f) => f.id !== 'y1' && f.id !== 'y2')).toBeTruthy();
  await expect(page.locator('#mealslot-fruehstueck')).toContainText('290 kcal');
  // nur Ziffern vergleichen: das Tausender-Apostroph unterscheidet sich je nach ICU-Version
  await expect(page.locator('#kcal-left')).toHaveText(new RegExp(`^${String(target - 290).replace(/\B(?=(\d{3})+$)/g, '\\D?')}$`));
  // Bereits etwas im Frühstück: kein «wie gestern» mehr
  await expect(page.locator('#slot-copy')).toHaveCount(0);

  // Eigener Eintrag im gewählten Frühstück
  await page.fill('#food-name', 'Banane');
  await page.fill('#food-kcal', '100');
  await page.click('#food-add');
  food = await foodOf(page, isoAgo(0));
  expect(food.find((/** @type {any} */ f) => f.name === 'Banane').time).toBe('07:30');
  // Zurück zur aktuellen Uhrzeit
  await page.click('#slot-clear');
  await expect(page.locator('#cap-h')).toHaveText('Erfassen');

  // Unterseiten: kurze Seiten, Adresse merkt sich die Unterseite
  await page.click('#sub-analyse');
  await expect(page).toHaveURL(/#ernaehrung\/analyse$/);
  await expect(page.locator('#nutrients-card')).toBeVisible();
  await expect(page.locator('#eaten-card')).toHaveCount(0);
  await page.click('#nut-woche');
  await expect(page).toHaveURL(/#ernaehrung\/analyse$/);
  await page.click('#sub-coach');
  await expect(page.locator('#behavior-card')).toBeVisible();
  await page.click('#sub-tagebuch');
  await expect(page.locator('#eaten-card')).toBeVisible();

  // Mobil ohne horizontales Scrollen
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('Wischen wechselt den Tag (nur Touch)', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'nur auf Touch-Geräten');
  await createProfile(page);
  await page.goto('/#ernaehrung');
  const swipe = (/** @type {number} */ dx) =>
    page.evaluate((delta) => {
      const el = /** @type {HTMLElement} */ (document.querySelector('#eaten-card h2'));
      const t = (/** @type {number} */ x) => new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 });
      el.dispatchEvent(new TouchEvent('touchstart', { touches: [t(200)], changedTouches: [t(200)], bubbles: true }));
      el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t(200 + delta)], bubbles: true }));
    }, dx);
  await swipe(150);
  await expect(page.locator('#date-pick')).toHaveValue(isoAgo(1));
  await swipe(-150);
  await expect(page.locator('#date-pick')).toHaveValue(isoAgo(0));
  // Nicht in die Zukunft
  await swipe(-150);
  await expect(page.locator('#date-pick')).toHaveValue(isoAgo(0));
});
