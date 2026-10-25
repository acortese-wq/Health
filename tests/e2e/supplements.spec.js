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

test('Präparate: Vorlage hinzufügen, einzelne Kapsel abhaken, Nährstoffe zählen mit, Warnung, Neuladen', async ({ page }) => {
  await createProfile(page);
  // Ohne Präparate keine Karte auf «Heute»
  await expect(page.locator('#supp-today')).toHaveCount(0);
  await page.goto('/#ernaehrung/praeparate');
  await expect(page.locator('#supp-none')).toBeVisible();
  await page.selectOption('#supp-template', 'burgerstein-mood');
  await page.click('#supp-add-go');
  await expect(page.locator('#supp-list > li')).toHaveCount(1);
  // Zweites Produkt: Folsäure zusammen 930 µg (unter 1000), keine Rückfrage nötig
  await page.selectOption('#supp-template', 'supradyn-pro-energy');
  await page.click('#supp-add-go');
  await expect(page.locator('#supp-list > li')).toHaveCount(2);
  await expect(page.locator('#supp-overlap')).toContainText('Folsäure');
  await expect(page.locator('#sub-praeparate')).toContainText('2');

  let st = await stored(page);
  expect(st.schema).toBe(4);
  const mood = st.supplements.find((/** @type {any} */ s) => s.templateId === 'burgerstein-mood');
  const supra = st.supplements.find((/** @type {any} */ s) => s.templateId === 'supradyn-pro-energy');
  // Mood: 1 Kapsel, morgens und abends
  expect(mood.serving).toBe('1 Kapsel');
  expect(mood.perDay).toBe(2);

  // Nicht abgehakt: zählt nicht, Hinweis und Nennung im Vitamin-D-Drilldown
  await page.click('#sub-analyse');
  await expect(page).toHaveURL(/#ernaehrung\/analyse$/);
  await expect(page.locator('#supp-pending')).toContainText('Noch nicht abgehakt');
  await expect(page.locator('#n-vitD')).toContainText('0.0');
  await page.locator('#n-vitD').click();
  await expect(page.locator('#nutrients-card')).toContainText('Noch nicht abgehakt (zählt nicht): Burgerstein Mood 15.0 µg');
  // «Alle eingenommen» hakt beide ab, Vitamin D 15 + 5 µg zählt; die Unterseite bleibt
  await page.click('#supp-take-all');
  await expect(page).toHaveURL(/#ernaehrung\/analyse$/);
  await expect(page.locator('#supp-pending')).toHaveCount(0);
  await expect(page.locator('#n-vitD')).toContainText('20.0');
  await page.locator('#n-vitD').click();
  await expect(page.locator('#nutrients-card')).toContainText('Burgerstein Mood (Präparat)');

  // Zurücknehmen einzeln
  await page.goto('/#ernaehrung/praeparate');
  await expect(page.locator(`#supp-toggle-${mood.id}-1`)).toHaveAttribute('aria-pressed', 'true');
  await page.click(`#supp-toggle-${mood.id}-1`);
  await page.click(`#supp-toggle-${mood.id}-2`);
  await page.click(`#supp-toggle-${supra.id}`);
  await expect(page.locator(`#supp-toggle-${supra.id}`)).toHaveAttribute('aria-pressed', 'false');

  // Auf «Heute» nur 1 Kapsel (morgens) abhaken
  await page.goto('/#heute');
  await page.click(`#supp-take-${mood.id}-1`);
  await expect(page.locator(`#supp-take-${mood.id}-1`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(`#supp-take-${mood.id}-2`)).toHaveAttribute('aria-pressed', 'false');
  // Zweiter Tipp nimmt zurück, dritter hakt wieder ab (keine Doppelbuchung)
  await page.click(`#supp-take-${mood.id}-1`);
  await expect(page.locator(`#supp-take-${mood.id}-1`)).toHaveAttribute('aria-pressed', 'false');
  await page.click(`#supp-take-${mood.id}-1`);
  st = await stored(page);
  const day = /** @type {any} */ (Object.values(st.days).find((/** @type {any} */ d) => d.supps));
  expect(day.supps).toHaveLength(1);
  expect(day.supps[0]).toMatchObject({ servings: 1, dose: 1 });

  // Halbe Tagesportion: Vitamin D 7.5 µg, Hinweis «1 von 2»
  await page.reload();
  await page.goto('/#ernaehrung/analyse');
  await expect(page.locator('#n-vitD')).toContainText('7.5');
  await expect(page.locator('#supp-pending')).toContainText('Burgerstein Mood (1 von 2)');

  // Supradyn: Packungswerte und Belege in der Detailansicht
  await page.goto('/#ernaehrung/praeparate');
  await expect(page.locator(`#supp-toggle-${mood.id}-1`)).toHaveText(/✓ Morgens/);
  await page.locator(`#supp-${supra.id} summary`).click();
  await expect(page.locator(`#supp-${supra.id}`)).toContainText('Vitamin B6');
  await expect(page.locator(`#supp-${supra.id}`)).toContainText('Mangione');

  // Drittes, eigenes Produkt mit Folsäure: Summe über der Höchstmenge → deutliche Warnung
  await page.selectOption('#supp-template', 'eigen');
  await page.click('#supp-add-go');
  await page.fill('#supp-name', 'B-Komplex');
  await page.locator('#supp-custom select[name="n-key-0"]').selectOption('folicAcid');
  await page.fill('#supp-custom input[name="n-val-0"]', '400');
  await page.click('#supp-custom-save');
  await expect(page.locator('#supp-list > li')).toHaveCount(3);
  await expect(page.locator('#ul-folicAcid')).toContainText('über der Höchstmenge');

  // Pausieren nimmt es aus der Warnung
  const custom = (await stored(page)).supplements.find((/** @type {any} */ s) => s.name === 'B-Komplex');
  await page.locator(`#supp-${custom.id} summary`).click();
  await page.click(`#supp-pause-${custom.id}`);
  await expect(page.locator('#ul-folicAcid')).toHaveCount(0);
  await expect(page.locator('#supp-paused')).toContainText('Pausiert (1)');

  // Kein horizontales Scrollen
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('Präparat: ältere Daten werden beim Laden auf die Packung gebracht, Ergänzung von Hand', async ({ page }) => {
  await createProfile(page);
  await page.goto('/#ernaehrung/praeparate');
  await page.selectOption('#supp-template', 'supradyn-pro-energy');
  await page.click('#supp-add-go');
  await page.selectOption('#supp-template', 'burgerstein-mood');
  await page.click('#supp-add-go');
  // Stand vor dem Packungsabgleich simulieren: Supradyn ohne B6, Mood als «2 Kapseln» mit einer Tageseinnahme
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('gesundheitscockpit') ?? '{}');
    const [supra, mood] = st.supplements;
    delete supra.templateRev;
    delete supra.nutrients.b6;
    supra.unknown = ['Vitamin B6'];
    Object.assign(mood, {
      templateRev: 2,
      serving: '2 Kapseln',
      perDay: 1,
      nutrients: { b6: 3.5, niacin: 40, b5: 15, b12: 7, vitD: 15, zinc: 5 },
      folicAcid: 500,
    });
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    st.days[iso] = { ...(st.days[iso] ?? {}), supps: [{ id: 'alt', sid: mood.id, servings: 1, time: '08:00' }] };
    localStorage.setItem('gesundheitscockpit', JSON.stringify(st));
  });
  await page.reload();
  // IDs aus dem Speicher; die Umstellung selbst passiert beim Laden (gespeichert wird beim nächsten Ändern)
  const [s, m] = (await stored(page)).supplements;
  await page.locator(`#supp-${s.id} summary`).click();
  await expect(page.locator(`#supp-${s.id} tr`, { hasText: 'Vitamin B6' })).toContainText('4 mg');
  await expect(page.locator(`#supp-${s.id}`)).not.toContainText('Menge unbekannt');
  await expect(page.locator(`#supp-${m.id}`)).toContainText('1 Kapsel × 2 pro Tag');
  // Die alte Tagesportion gilt als beide Kapseln, Vitamin D bleibt 15 µg
  await expect(page.locator(`#supp-toggle-${m.id}-1`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(`#supp-toggle-${m.id}-2`)).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/#ernaehrung/analyse');
  await expect(page.locator('#n-vitD')).toContainText('15.0');

  // Eigene Ergänzung in einer leeren Zeile
  await page.goto('/#ernaehrung/praeparate');
  await page.locator(`#supp-${s.id} summary`).click();
  await page.click(`#supp-edit-${s.id}`);
  const form = page.locator(`#supp-editform-${s.id}`);
  const last = form.locator('select').last();
  const name = await last.getAttribute('name');
  await last.selectOption('vitA');
  await form.locator(`input[name="${String(name).replace('key', 'val')}"]`).fill('100');
  await page.click(`#supp-save-${s.id}`);
  const after = (await stored(page)).supplements[0];
  expect(after.nutrients.vitA).toBe(100);
  expect(after.nutrients.b6).toBe(4);
  expect(after.source).toContain('eigene Ergänzung');
});
