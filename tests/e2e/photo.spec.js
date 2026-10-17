// @ts-check
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const IMAGE = fileURLToPath(new URL('../../app/icons/icon-192.png', import.meta.url));
const KEY = 'sk-ant-test-0123456789abcdefghijklmnop';

const ESTIMATE = {
  is_food: true,
  dish: 'Älplermagronen mit Apfelmus',
  items: [
    {
      name: 'Älplermagronen',
      portion: '1 Teller',
      grams: 350,
      kcal: 650,
      kcal_low: 520,
      kcal_high: 800,
      protein_g: 24,
      carbs_g: 70,
      fat_g: 30,
    },
    { name: 'Apfelmus', portion: '1 Schälchen', grams: 100, kcal: 80, kcal_low: 60, kcal_high: 100, protein_g: 0, carbs_g: 20, fat_g: 0 },
  ],
  assumptions: ['Mit Rahm und Röstzwiebeln zubereitet'],
  confidence: 'mittel',
  tip: 'Heute Abend proteinreich ergänzen.',
};

/** @param {import('@playwright/test').Page} page */
async function setup(page) {
  await page.goto('/');
  await page.fill('#p-birth', '1977-05-09');
  await page.fill('#p-height', '172');
  await page.fill('#p-startkg', '95');
  await page.fill('#p-goalkg', '80');
  await page.fill('#p-goaldate', '2027-03-31');
  await page.click('#profile-save');
  await expect(page).toHaveURL(/#heute$/);
}

/**
 * Anthropic-API simulieren; gibt die abgefangenen Anfragen zurück.
 * @param {import('@playwright/test').Page} page
 * @param {{ status?: number, body?: unknown }} [opts]
 */
async function mockApi(page, opts = {}) {
  /** @type {any[]} */
  const requests = [];
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
  await page.route('https://api.anthropic.com/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    requests.push({ url: req.url(), headers: req.headers(), body: req.postDataJSON() });
    const body = opts.body ?? {
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-5-5',
      content: [{ type: 'text', text: JSON.stringify(ESTIMATE) }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      stop_details: null,
      usage: { input_tokens: 2400, output_tokens: 600 },
    };
    return route.fulfill({
      status: opts.status ?? 200,
      headers: { ...cors, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  });
  return requests;
}

test('Ohne Schlüssel: verständlicher Hinweis statt Anfrage', async ({ page }) => {
  const requests = await mockApi(page);
  await setup(page);
  await page.setInputFiles('#photo-input', IMAGE);
  await expect(page.locator('#photo-error')).toContainText('API-Schlüssel');
  expect(requests).toHaveLength(0);
});

test('Foto → Gericht, Kalorien, Portion anpassen → übernehmen', async ({ page }) => {
  const requests = await mockApi(page);
  await setup(page);
  await page.goto('/#profil');
  await page.fill('#api-key', KEY);
  await page.click('#api-key-save');
  await expect(page.locator('label[for="api-key"]')).toContainText('mnop');
  // Schlüssel ist nicht Teil der App-Daten (und damit nie im Backup)
  expect(await page.evaluate(() => localStorage.getItem('gesundheitscockpit'))).not.toContain('sk-ant');

  await page.goto('/#heute');
  await page.setInputFiles('#photo-input', IMAGE);
  await expect(page.locator('#photo-dish')).toHaveText('Älplermagronen mit Apfelmus');
  await expect(page.locator('#photo-total-kcal')).toHaveText('730 kcal');

  // Anfrage: richtiges Modell, Bild, Schema, Fallback, Schlüssel nur im Header
  expect(requests).toHaveLength(1);
  const { body, headers } = requests[0];
  expect(body.model).toBe('claude-opus-5-5');
  expect(body.fallbacks).toBe('default');
  expect(headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01');
  expect(headers['x-api-key']).toBe(KEY);
  expect(body.output_config.format.type).toBe('json_schema');
  const img = body.messages[0].content[0];
  expect(img.type).toBe('image');
  expect(img.source.media_type).toBe('image/jpeg');
  expect(img.source.data.length).toBeGreaterThan(100);

  // Apfelmus abwählen, halbe Portion
  await page.uncheck('#photo-item-1');
  await expect(page.locator('#photo-total-kcal')).toHaveText('650 kcal');
  await page.click('#portion-0_5');
  await expect(page.locator('#photo-total-kcal')).toHaveText('325 kcal');
  await expect(page.locator('#photo-kcal')).toHaveValue('325');
  await expect(page.locator('#photo-protein')).toHaveValue('12');

  await page.check('#photo-preset');
  await page.click('#photo-save');
  await expect(page.locator('.entries').first()).toContainText('Älplermagronen mit Apfelmus');
  await expect(page.locator('.meter').first()).toContainText('325');
  await expect(page.locator('#photo-trigger')).toContainText('Mahlzeit fotografieren');
  await expect(page.locator('.chips .chip', { hasText: 'Älplermagronen' })).toBeVisible();
});

test('Ungültiger Schlüssel: klare Fehlermeldung', async ({ page }) => {
  await mockApi(page, { status: 401, body: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } });
  await setup(page);
  await page.goto('/#profil');
  await page.fill('#api-key', KEY);
  await page.click('#api-key-save');
  await page.goto('/#heute');
  await page.setInputFiles('#photo-input', IMAGE);
  await expect(page.locator('#photo-error')).toContainText('API-Schlüssel ist ungültig');
});

test('Kein Essen auf dem Foto', async ({ page }) => {
  await mockApi(page, {
    body: {
      id: 'msg_x',
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-5-5',
      content: [{ type: 'text', text: JSON.stringify({ ...ESTIMATE, is_food: false, items: [], dish: 'Keine Mahlzeit' }) }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      stop_details: null,
      usage: { input_tokens: 10, output_tokens: 10 },
    },
  });
  await setup(page);
  await page.evaluate((k) => localStorage.setItem('gesundheitscockpit.apikey', k), KEY);
  await page.setInputFiles('#photo-input', IMAGE);
  await expect(page.getByText('Kein Essen erkannt')).toBeVisible();
  await expect(page.locator('#photo-save')).toHaveCount(0);
});
