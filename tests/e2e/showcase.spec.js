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

test('Vorführung −17 kg: zeigt Beispieljahr, speichert nichts, eigene Daten danach unverändert', async ({ page }) => {
  await createProfile(page);
  await page.goto('/#ernaehrung');
  await page.fill('#food-name', 'Eigenes Frühstück');
  await page.fill('#food-kcal', '400');
  await page.fill('#food-protein', '25');
  await page.click('#food-add');
  const before = await page.evaluate(() => localStorage.getItem('gesundheitscockpit'));

  await page.goto('/#profil');
  await page.click('#showcase-start');
  await expect(page.locator('#showcase-banner')).toContainText('−17 kg in einem Jahr');
  await expect(page).toHaveURL(/#fortschritt$/);
  await expect(page.locator('#range-plan')).toHaveAttribute('aria-pressed', 'true');
  const weight = page.locator('#balance-card tbody tr', { hasText: 'Gewicht' });
  await expect(weight).toContainText('97.0 kg');
  // Trend am Stichtag schwankt je nach Wochentag leicht um −17 kg
  await expect(weight).toContainText(/−(16\.[5-9]|17\.[0-5]) kg/);
  await expect(page.locator('#balance-card')).toContainText('HbA1c');

  // Änderungen während der Vorführung bleiben im Speicher, nicht im Gerät
  await page.goto('/#heute');
  await page.click('#cta-water');
  await page.goto('/#ernaehrung/coach');
  await expect(page.locator('#behavior-card')).toBeVisible();
  await page.goto('/#profil');
  await page.setInputFiles('#import-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"schema":1}') });
  await expect(page.locator('#toast')).toContainText('Während der Vorführung nicht möglich');
  expect(await page.evaluate(() => localStorage.getItem('gesundheitscockpit'))).toBe(before);

  await page.click('#showcase-end');
  await expect(page.locator('#showcase-banner')).toHaveCount(0);
  await page.goto('/#ernaehrung');
  await expect(page.locator('#food-entries')).toContainText('Eigenes Frühstück');
  expect(await page.evaluate(() => localStorage.getItem('gesundheitscockpit'))).toBe(before);
});

test('Vorführung auch ohne eigenes Profil startbar; Neuladen beendet sie', async ({ page }) => {
  await page.goto('/');
  await page.click('#showcase-start');
  await expect(page.locator('#showcase-banner')).toBeVisible();
  await page.reload();
  await expect(page.locator('#showcase-banner')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Willkommen im Gesundheitscockpit' })).toBeVisible();
});

test('Verhaltens-Check: Kritik mit Alternative und Quelle', async ({ page }) => {
  await createProfile(page);
  // 6 Tage mit Fast Food am Mittag direkt in den Speicher schreiben
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('gesundheitscockpit') ?? '{}');
    const iso = (/** @type {number} */ n) => {
      const d = new Date();
      d.setDate(d.getDate() - n);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    for (let n = 1; n <= 6; n++)
      st.days[iso(n)] = {
        complete: true,
        food: [
          { id: `a${n}`, name: 'Gipfeli', kcal: 300, protein: 6, time: '07:30' },
          { id: `b${n}`, name: "McDonald's Big Mac Menü", kcal: 1100, protein: 30, time: '12:30' },
          { id: `c${n}`, name: 'Pasta', kcal: 800, protein: 25, time: '19:00' },
        ],
      };
    localStorage.setItem('gesundheitscockpit', JSON.stringify(st));
  });
  await page.goto('/#ernaehrung/coach');
  await page.reload();
  const card = page.locator('#behavior-card');
  await expect(card.locator('#beh-traps')).toContainText("McDonald's Big Mac Menü");
  await expect(card.locator('#beh-traps')).toContainText('Salat mit grilliertem Poulet');
  await expect(card.locator('#beh-traps')).toContainText('Hall KD');
  await expect(card.locator('#beh-protein-morning')).toContainText('Leidy');
});
