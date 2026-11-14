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

test('Heisshunger-Notfall: 4 Fragen, Plan, Timer, Stärke danach, geschafft', async ({ page }) => {
  await page.clock.install();
  await createProfile(page);
  await page.click('#cta-sos');
  await expect(page).toHaveURL(/#sos$/);
  await expect(page.locator('#sos-progress')).toHaveText('Frage 1 von 4');
  await page.click('#sos-lastMeal-2bis4');
  await expect(page.locator('#sos-progress')).toHaveText('Frage 2 von 4');
  // Zurück und neu beantworten
  await page.click('#sos-back');
  await page.click('#sos-lastMeal-2bis4');
  await page.click('#sos-apple-nein');
  await page.click('#sos-trigger-tv');
  await expect(page.locator('#sos-progress')).toHaveText('Frage 4 von 4');
  await page.click('#sos-int-8');

  await expect(page.locator('#sos-plan h2')).toContainText('Welle');
  await expect(page.locator('#sos-plan')).toContainText('Teller');
  await expect(page.locator('#sos-plan')).toContainText('Bowen');
  // Wechselnde Ideen: drei pro Mal, «Andere Ideen» bringt neue, ohne Wiederholung
  await expect(page.locator('#sos-ideas .sos-idea')).toHaveCount(3);
  const ids = new Set();
  for (let i = 0; i < 8; i++) {
    for (const id of await page.locator('#sos-ideas .sos-idea').evaluateAll((els) => els.map((e) => e.getAttribute('data-id'))))
      (expect(ids.has(id)).toBeFalsy(), ids.add(id));
    await page.click('#sos-more-ideas');
  }
  expect(ids.size).toBe(24);
  // Gespeichert für die Bilanz
  let st = await page.evaluate(() => JSON.parse(localStorage.getItem('gesundheitscockpit') ?? '{}'));
  const day = /** @type {any} */ (Object.values(st.days).find((/** @type {any} */ d) => d.cravings));
  expect(day.cravings[0]).toMatchObject({ trigger: 'tv', intensity: 8 });

  // 15-Minuten-Timer (stark), Zeit vorspulen
  await page.click('#sos-timer-start');
  await expect(page.locator('#sos-timer')).toHaveText('15:00');
  await page.clock.fastForward('15:01');
  await expect(page.locator('#sos-after')).toBeVisible();
  await page.click('#sos-after-3');
  await expect(page.locator('#sos-drop')).toContainText('Von 8 auf 3');
  await page.click('#sos-done');
  await expect(page).toHaveURL(/#heute$/);
  await expect(page.locator('#toast')).toContainText('Welle überstanden');
  st = await page.evaluate(() => JSON.parse(localStorage.getItem('gesundheitscockpit') ?? '{}'));
  const log = /** @type {any} */ (Object.values(st.days).find((/** @type {any} */ d) => d.cravings)).cravings[0];
  expect(log).toMatchObject({ after: 3, outcome: 'geschafft' });

  // Bilanz beim nächsten Mal
  await page.goto('/#sos');
  await expect(page.locator('#sos-stats')).toContainText('1 Heisshunger-Moment, 1 ohne Essen überstanden');
  await expect(page.locator('#sos-stats')).toContainText('um 5.0 Punkte');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('Heisshunger-Notfall: echter Hunger → essen und erfassen', async ({ page }) => {
  await createProfile(page);
  await page.goto('/#ernaehrung/coach');
  await page.click('#coach-sos');
  await page.click('#sos-lastMeal-ueber4');
  await page.click('#sos-apple-ja');
  await page.click('#sos-trigger-nichts');
  await page.click('#sos-int-6');
  await expect(page.locator('#sos-plan h2')).toContainText('echter Hunger');
  await expect(page.locator('#sos-snacks')).toContainText('Skyr');
  await expect(page.locator('#sos-timer-start')).toHaveCount(0);
  await page.click('#sos-ate');
  await expect(page).toHaveURL(/#ernaehrung\/erfassen$/);
});
