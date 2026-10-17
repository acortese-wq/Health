// @ts-check
// Fotoanalyse über die Claude-API. Das Bild wird verkleinert und direkt vom Gerät an
// Anthropic geschickt; es gibt keinen eigenen Server. Der API-Schlüssel liegt nur im
// Browser-Speicher dieses Geräts und ist nie Teil eines Backups.

import { MEAL_SCHEMA, SYSTEM_PROMPT, VISION_MODEL, parseEstimate, userPrompt } from './domain/foodvision.js';

const KEY_STORAGE = 'gesundheitscockpit.apikey';
/** Längste Bildkante; grössere Bilder verbessern die Erkennung nicht, kosten aber mehr. */
const MAX_EDGE = 1568;

/** @returns {string} */
export function getApiKey() {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

/** @param {string} key */
export function setApiKey(key) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
    return true;
  } catch {
    return false;
  }
}

/**
 * Bild verkleinern und als JPEG kodieren.
 * @param {Blob} file
 * @returns {Promise<{ base64: string, previewUrl: string }>}
 */
export async function prepareImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('Bitte ein Foto auswählen.');
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('Das Bild konnte nicht gelesen werden. Bitte ein JPEG- oder PNG-Foto verwenden.');
  });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) throw new Error('Bildverarbeitung wird von diesem Browser nicht unterstützt.');
  ctx2d.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild konnte nicht kodiert werden.'))), 'image/jpeg', 0.85),
  );
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Bild konnte nicht gelesen werden.'));
    r.readAsDataURL(blob);
  });
  return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), previewUrl: URL.createObjectURL(blob) };
}

/** @type {Promise<any> | null} */
let sdkPromise = null;

/** SDK erst bei Bedarf laden (ca. 300 KB), damit die App schnell startet. */
function loadSdk() {
  // Pfad als Variable, damit die Typprüfung das gebündelte SDK nicht analysiert.
  const path = '../vendor/anthropic-sdk.js';
  sdkPromise ??= import(path);
  return sdkPromise;
}

/**
 * Mahlzeit auf dem Foto schätzen.
 * @param {{ apiKey: string, base64: string, hint: string, kcalLeft: number | null, proteinLeft: number | null, signal?: AbortSignal }} p
 * @returns {Promise<import('./domain/foodvision.js').MealEstimate>}
 */
export async function analyzeMeal({ apiKey, base64, hint, kcalLeft, proteinLeft, signal }) {
  const mod = await loadSdk();
  /** @type {typeof import('@anthropic-ai/sdk').default} */
  const Anthropic = mod.default;
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 120_000 });
  let response;
  try {
    response = await client.beta.messages.create(
      {
        model: VISION_MODEL,
        max_tokens: 16000,
        // Bei einer Ablehnung durch Sicherheitsfilter übernimmt automatisch ein Ersatzmodell.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: MEAL_SCHEMA } },
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
              { type: 'text', text: userPrompt({ hint, kcalLeft, proteinLeft }) },
            ],
          },
        ],
      },
      { signal },
    );
  } catch (err) {
    throw new Error(explainError(err, Anthropic));
  }
  if (response.stop_reason === 'refusal') throw new Error('Die Anfrage wurde abgelehnt. Bitte ein anderes Foto versuchen.');
  if (response.stop_reason === 'max_tokens') throw new Error('Die Antwort wurde abgeschnitten. Bitte erneut versuchen.');
  const text = response.content
    .filter(/** @returns {b is import('@anthropic-ai/sdk/resources/beta').BetaTextBlock} */ (b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  try {
    return parseEstimate(JSON.parse(text));
  } catch {
    throw new Error('Die Antwort konnte nicht gelesen werden. Bitte erneut versuchen.');
  }
}

/**
 * Verständliche Fehlermeldung aus den typisierten SDK-Fehlern.
 * @param {unknown} err
 * @param {typeof import('@anthropic-ai/sdk').default} Anthropic
 * @returns {string}
 */
function explainError(err, Anthropic) {
  if (err instanceof Anthropic.APIUserAbortError) return 'Abgebrochen.';
  if (err instanceof Anthropic.AuthenticationError) return 'Der API-Schlüssel ist ungültig. Bitte unter Profil → Foto-Erkennung prüfen.';
  if (err instanceof Anthropic.PermissionDeniedError) return 'Der API-Schlüssel hat keine Berechtigung für dieses Modell.';
  if (err instanceof Anthropic.RateLimitError) return 'Zu viele Anfragen oder Guthaben aufgebraucht. Bitte später erneut versuchen.';
  if (err instanceof Anthropic.BadRequestError)
    return 'Die Anfrage wurde abgelehnt. Häufigste Ursache: Guthaben des API-Kontos aufgebraucht.';
  if (err instanceof Anthropic.APIConnectionTimeoutError) return 'Zeitüberschreitung. Bitte erneut versuchen.';
  if (err instanceof Anthropic.APIConnectionError) return 'Keine Verbindung. Die Foto-Erkennung braucht Internet.';
  if (err instanceof Anthropic.APIError)
    return `Dienst nicht verfügbar (Fehler ${err.status ?? 'unbekannt'}). Bitte später erneut versuchen.`;
  return err instanceof Error ? err.message : 'Unbekannter Fehler.';
}
