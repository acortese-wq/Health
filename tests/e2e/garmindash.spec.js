// @ts-check
import { test, expect } from '@playwright/test';

test('Garmin-Dashboard: Kennzahlen, Erholung, Diagramme, Aktivitäten, Tageswerte einfügen', async ({ page }) => {
  await page.goto('/');
  await page.click('#load-demo');
  await page.goto('/#training');
  await page.click('#open-garmin');
  await expect(page).toHaveURL(/#garmin$/);
  await expect(page.locator('h1')).toHaveText('Garmin-Dashboard');
  await expect(page.locator('#garmin-tiles .stat')).toHaveCount(6);
  await expect(page.locator('#g-steps .stat-value')).not.toHaveText('–');
  await expect(page.locator('#g-intensity')).toContainText('/ 150');
  await expect(page.locator('#garmin-recovery .badge')).toBeVisible();
  await expect(page.locator('.bar-chart')).toHaveCount(2);
  await expect(page.locator('#garmin-freshness')).toContainText('Tageswerte bis');

  // Tageswerte aus dem Kurzbefehl einfügen
  await page.locator('#health-manual summary').click();
  await page.fill('#health-text', 'cockpit;schritte=12345;ruhepuls=49;schlaf=7.5');
  await page.click('#health-text-go');
  await expect(page.locator('#g-steps .stat-value')).toHaveText(/12[’']345/);
  await expect(page.locator('#g-rhr .stat-value')).toContainText('49');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('Garmin-Dashboard ohne Daten: Hinweis statt leerer Kacheln', async ({ page }) => {
  await page.goto('/');
  await page.fill('#p-birth', '1977-05-09');
  await page.fill('#p-height', '172');
  await page.fill('#p-startkg', '95');
  await page.fill('#p-goalkg', '80');
  await page.fill('#p-goaldate', '2027-06-30');
  await page.click('#profile-save');
  await page.goto('/#garmin');
  await expect(page.locator('#garmin-freshness')).toContainText('Noch keine Tageswerte');
  await expect(page.locator('#g-steps')).toContainText('Noch nicht erfasst');
  await expect(page.locator('#garmin-recovery')).toContainText('Offen');
  await expect(page.locator('#garmin-activities')).toContainText('Noch keine Aktivitäten');
});

test('Garmin Health API über eigenen Worker: verbinden, automatisch abgleichen, trennen', async ({ page }) => {
  const W = 'https://garmin-test.example.workers.dev';
  /** @type {string[]} */
  const calls = [];
  await page.route(`${W}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    calls.push(`${req.method()} ${url.pathname}`);
    const cors = {
      'access-control-allow-origin': 'http://localhost:4173',
      'access-control-allow-headers': 'authorization',
      'access-control-allow-methods': 'GET, DELETE, OPTIONS',
    };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === '/auth/start')
      return route.fulfill({ status: 302, headers: { location: `${url.searchParams.get('return')}#garmin-connected=${'a'.repeat(43)}` } });
    if (url.pathname === '/data') {
      if (req.headers().authorization !== `Bearer ${'a'.repeat(43)}`) return route.fulfill({ status: 401, headers: cors, body: '{}' });
      const d = new Date();
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return route.fulfill({
        status: 200,
        headers: { ...cors, 'content-type': 'application/json' },
        body: JSON.stringify({
          days: {
            [iso]: {
              steps: 10432,
              restingHr: 51,
              sleepH: 7.5,
              hrvMs: 48,
              bodyBatteryHigh: 82,
              bodyBatteryLow: 20,
              stress: 28,
              vo2max: 44,
              activities: [
                { id: 'garmin-99', date: iso, time: '07:10', type: 'running', minutes: 40, title: 'Morgenlauf', km: 6.5, avgHr: 141 },
              ],
            },
          },
        }),
      });
    }
    if (url.pathname === '/me' && req.method() === 'DELETE') return route.fulfill({ status: 200, headers: cors, body: '{"ok":true}' });
    return route.fulfill({ status: 404, headers: cors });
  });
  await page.goto('/');
  await page.fill('#p-birth', '1977-05-09');
  await page.fill('#p-height', '172');
  await page.fill('#p-startkg', '95');
  await page.fill('#p-goalkg', '80');
  await page.fill('#p-goaldate', '2027-06-30');
  await page.click('#profile-save');
  await page.goto('/#garmin');
  await page.fill('#garmin-worker', 'http://unsicher.example');
  await page.click('#garmin-connect-go');
  await expect(page.locator('#toast')).toContainText('https-Adresse');
  await page.fill('#garmin-worker', `${W}/`);
  await page.click('#garmin-connect-go');

  // Zurück in der App: verbunden, Schlüssel aus der Adresse entfernt, Daten automatisch übernommen
  await expect(page).toHaveURL(/#garmin$/);
  await expect(page.locator('#garmin-connect .badge')).toHaveText('Verbunden');
  await expect(page.locator('#g-steps .stat-value')).toHaveText(/10[’']432/);
  await expect(page.locator('#g-hrv')).toContainText('48');
  await expect(page.locator('#g-bb')).toContainText('82');
  await expect(page.locator('#garmin-activities')).toContainText('6.5 km');
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('gesundheitscockpit') ?? '{}'));
  expect(st.workouts.some((/** @type {any} */ w) => w.id === 'garmin-99')).toBeTruthy();
  expect(st.vo2max.some((/** @type {any} */ v) => v.value === 44)).toBeTruthy();
  // Schlüssel und Zusatzwerte nicht im Zustand (und damit nicht im Backup)
  expect(JSON.stringify(st)).not.toContain('a'.repeat(43));
  expect(JSON.stringify(st)).not.toContain('bodyBattery');

  // Manuell abgleichen: nichts Neues
  await page.click('#garmin-sync');
  await expect(page.locator('#toast')).toContainText('nichts Neues');

  // Trennen löscht im Worker und lokal
  page.once('dialog', (d) => d.accept());
  await page.click('#garmin-disconnect');
  await expect(page.locator('#garmin-connect h2')).toHaveText('Mit Garmin verbinden');
  expect(calls).toContain('DELETE /me');
  expect(await page.evaluate(() => localStorage.getItem('gesundheitscockpit.garmin'))).toBeNull();
});
