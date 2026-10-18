// @ts-check
import { test, expect } from '@playwright/test';

test('Trinken: Glas und Flasche erfassen, korrigieren, bleibt nach Neuladen', async ({ page }) => {
  await page.goto('/');
  await page.fill('#p-birth', '1977-05-09');
  await page.fill('#p-height', '172');
  await page.fill('#p-startkg', '95');
  await page.fill('#p-goalkg', '80');
  await page.fill('#p-goaldate', '2027-03-31');
  await page.click('#profile-save');
  const card = page.locator('section[aria-labelledby="water-h"]');
  await expect(card).toContainText('0 / 2’000 ml');
  await expect(page.locator('#water-minus')).toBeDisabled();
  await page.click('#water-250');
  await page.click('#water-500');
  await page.click('#water-750');
  await expect(card).toContainText('1’500 / 2’000 ml');
  await page.click('#water-minus');
  await expect(card).toContainText('1’250 / 2’000 ml');
  await page.reload();
  await expect(card).toContainText('1’250 / 2’000 ml');
  await expect(card).toContainText('5 Gläser');
});

test('Gesundheit: Lebenserwartung, Risiken und Nutzen von Bewegung', async ({ page }) => {
  await page.goto('/');
  await page.click('#load-demo');
  await page.goto('/#gesundheit');
  await expect(page.locator('#mot-h')).toHaveText('Warum es sich lohnt');
  await expect(page.locator('#life-activity')).toContainText('Durch Bewegung bereits gewonnen');
  await expect(page.locator('#life-weight')).toContainText('Jahre');
  await page.locator('#risk-details summary').click();
  await expect(page.locator('#risk-details')).toContainText('Typ-2-Diabetes');
  await page.goto('/#heute');
  await expect(page.locator('#water-pace')).toBeVisible();
});

test('Trink-Erinnerungen als Kalenderdatei', async ({ page }) => {
  await page.goto('/');
  await page.fill('#p-birth', '1977-05-09');
  await page.fill('#p-height', '172');
  await page.fill('#p-startkg', '95');
  await page.fill('#p-goalkg', '80');
  await page.fill('#p-goaldate', '2027-03-31');
  await page.click('#profile-save');
  await page.locator('#water-reminders summary').click();
  await expect(page.locator('#rem-preview')).toContainText('6 Erinnerungen');
  await page.selectOption('#rem-every', '180');
  await expect(page.locator('#rem-preview')).toContainText('4 Erinnerungen');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#rem-create')]);
  expect(download.suggestedFilename()).toBe('trink-erinnerungen.ics');
  const fs = await import('node:fs/promises');
  const ics = await fs.readFile(await download.path(), 'utf8');
  expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(4);
  expect(ics).toContain('RRULE:FREQ=DAILY');
  expect(ics).toContain('Trinken: 500 ml Wasser');
});
