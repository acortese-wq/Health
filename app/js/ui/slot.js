// @ts-check
// Gewählte Mahlzeit beim Erfassen (wie «+ Frühstück» in Ernährungs-Apps): Einträge erhalten die
// typische Uhrzeit dieser Mahlzeit statt der aktuellen Zeit. Gilt nur für den gewählten Tag.

import { nowTime } from './dom.js';

/** Mahlzeiten mit typischer Uhrzeit; die Zeiten liegen in den Gruppen der Eintragsliste. */
export const MEAL_SLOTS = /** @type {const} */ ([
  { id: 'fruehstueck', label: 'Frühstück', time: '07:30' },
  { id: 'mittag', label: 'Mittagessen', time: '12:30' },
  { id: 'snack', label: 'Zwischenmahlzeit', time: '16:00' },
  { id: 'abend', label: 'Abendessen', time: '19:00' },
]);

/** @type {{ date: string, id: string }} */
export const captureSlot = { date: '', id: '' };

/**
 * Aktive Mahlzeit für einen Tag.
 * @param {string} date
 */
export function activeSlot(date) {
  return captureSlot.date === date ? (MEAL_SLOTS.find((m) => m.id === captureSlot.id) ?? null) : null;
}

/**
 * @param {string} date
 * @param {string} id leer = keine Mahlzeit gewählt
 */
export function setSlot(date, id) {
  captureSlot.date = id ? date : '';
  captureSlot.id = id;
}

/**
 * Uhrzeit für einen neuen Eintrag: gewählte Mahlzeit, sonst jetzt (heute) bzw. fallback.
 * @param {{ date: string, today: string }} ctx
 * @param {string} [fallback]
 */
export function captureTime(ctx, fallback = '12:00') {
  return activeSlot(ctx.date)?.time ?? (ctx.date === ctx.today ? nowTime() : fallback);
}
