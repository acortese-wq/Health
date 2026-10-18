// @ts-check
// KI-Anbindung für die Mahlzeitenerfassung (Claude oder GPT) und Barcode-Abfrage bei
// Open Food Facts. Bilder werden auf dem Gerät verkleinert und direkt an den gewählten
// Anbieter geschickt; es gibt keinen eigenen Server. Schlüssel und Anbieterwahl liegen
// nur im Browser-Speicher dieses Geräts und sind nie Teil eines Backups.

import {
  LABEL_SCHEMA,
  LABEL_SYSTEM_PROMPT,
  MEAL_SCHEMA,
  MEAL_SYSTEM_PROMPT,
  parseEstimate,
  parseLabel,
  parseOpenFoodFacts,
  parseOffSearch,
  offSearchUrl,
  offSearchaliciousUrl,
  offSearchCodes,
  userPrompt,
} from './domain/foodvision.js';

/** @typedef {'anthropic' | 'openai'} Provider */
/** @typedef {{ provider: Provider, models: Record<Provider, string>, keys: Record<Provider, string> }} AiSettings */

const SETTINGS_KEY = 'gesundheitscockpit.ki';
const LEGACY_KEY = 'gesundheitscockpit.apikey';
/** Längste Bildkante; grössere Bilder verbessern die Erkennung nicht, kosten aber mehr. */
const MAX_EDGE = 1568;

export const PROVIDERS = /** @type {const} */ ({
  anthropic: {
    label: 'Claude (Anthropic)',
    defaultModel: 'claude-opus-5-5',
    keyPattern: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
    console: 'console.anthropic.com',
  },
  openai: { label: 'GPT (OpenAI)', defaultModel: 'gpt-5.5', keyPattern: /^sk-[A-Za-z0-9_-]{20,}$/, console: 'platform.openai.com' },
});

/** @returns {AiSettings} */
export function getAiSettings() {
  /** @type {AiSettings} */
  const s = {
    provider: 'anthropic',
    models: { anthropic: PROVIDERS.anthropic.defaultModel, openai: PROVIDERS.openai.defaultModel },
    keys: { anthropic: '', openai: '' },
  };
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
    if (raw && typeof raw === 'object') {
      if (raw.provider === 'openai') s.provider = 'openai';
      for (const p of /** @type {Provider[]} */ (['anthropic', 'openai'])) {
        if (typeof raw.models?.[p] === 'string' && /^[\w.:-]{2,80}$/.test(raw.models[p])) s.models[p] = raw.models[p];
        if (typeof raw.keys?.[p] === 'string') s.keys[p] = raw.keys[p];
      }
    }
    // Frühere Version speicherte nur einen Anthropic-Schlüssel.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy && !s.keys.anthropic) s.keys.anthropic = legacy;
  } catch {
    /* Speicher gesperrt oder defekt: Standardwerte */
  }
  return s;
}

/**
 * @param {AiSettings} s
 * @returns {boolean}
 */
export function saveAiSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    localStorage.removeItem(LEGACY_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Aktiver Anbieter mit Schlüssel, sonst null. */
export function activeProvider() {
  const s = getAiSettings();
  return s.keys[s.provider] ? { provider: s.provider, model: s.models[s.provider], key: s.keys[s.provider] } : null;
}

/**
 * Bild verkleinern und als JPEG kodieren.
 * @param {Blob} file
 * @returns {Promise<{ base64: string, previewUrl: string, blob: Blob }>}
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
  /** @type {Blob} */
  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild konnte nicht kodiert werden.'))), 'image/jpeg', 0.85),
  );
  /** @type {string} */
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Bild konnte nicht gelesen werden.'));
    r.readAsDataURL(blob);
  });
  return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), previewUrl: URL.createObjectURL(blob), blob };
}

/** @type {Record<Provider, Promise<any> | null>} */
const sdkCache = { anthropic: null, openai: null };

/**
 * SDK erst bei Bedarf laden (ca. 300–380 KB), damit die App schnell startet.
 * @param {Provider} p
 */
function loadSdk(p) {
  // Pfade als Variable, damit die Typprüfung die gebündelten SDKs nicht analysiert.
  const path = p === 'openai' ? '../vendor/openai-sdk.js' : '../vendor/anthropic-sdk.js';
  sdkCache[p] ??= import(path);
  return sdkCache[p];
}

/**
 * Eine strukturierte JSON-Antwort vom gewählten Anbieter holen.
 * @param {{ system: string, schema: Record<string, unknown>, schemaName: string, text: string, imageBase64?: string, signal?: AbortSignal }} req
 * @returns {Promise<unknown>}
 */
async function requestJson(req) {
  const active = activeProvider();
  if (!active) throw new Error('Für diese Funktion braucht es einen KI-Schlüssel. Hinterlege ihn unter Profil → KI-Erfassung.');
  const text = active.provider === 'openai' ? await viaOpenAI(active, req) : await viaAnthropic(active, req);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Die Antwort konnte nicht gelesen werden. Bitte erneut versuchen.');
  }
}

/**
 * @param {{ model: string, key: string }} a
 * @param {Parameters<typeof requestJson>[0]} req
 * @returns {Promise<string>}
 */
async function viaAnthropic(a, req) {
  const mod = await loadSdk('anthropic');
  /** @type {typeof import('@anthropic-ai/sdk').default} */
  const Anthropic = mod.default;
  const client = new Anthropic({ apiKey: a.key, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 120_000 });
  /** @type {import('@anthropic-ai/sdk/resources/beta').BetaContentBlockParam[]} */
  const content = [];
  if (req.imageBase64) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: req.imageBase64 } });
  content.push({ type: 'text', text: req.text });
  let response;
  try {
    response = await client.beta.messages.create(
      {
        model: a.model,
        max_tokens: 16000,
        // Bei einer Ablehnung durch Sicherheitsfilter übernimmt automatisch ein Ersatzmodell.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: req.schema } },
        system: req.system,
        messages: [{ role: 'user', content }],
      },
      { signal: req.signal },
    );
  } catch (err) {
    throw new Error(explainAnthropic(err, Anthropic));
  }
  if (response.stop_reason === 'refusal') throw new Error('Die Anfrage wurde abgelehnt. Bitte ein anderes Foto versuchen.');
  if (response.stop_reason === 'max_tokens') throw new Error('Die Antwort wurde abgeschnitten. Bitte erneut versuchen.');
  return response.content
    .filter(/** @returns {b is import('@anthropic-ai/sdk/resources/beta').BetaTextBlock} */ (b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/**
 * @param {{ model: string, key: string }} a
 * @param {Parameters<typeof requestJson>[0]} req
 * @returns {Promise<string>}
 */
async function viaOpenAI(a, req) {
  const mod = await loadSdk('openai');
  /** @type {typeof import('openai').default} */
  const OpenAI = mod.default;
  const client = new OpenAI({ apiKey: a.key, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 120_000 });
  /** @type {import('openai/resources/responses/responses').ResponseInputContent[]} */
  const content = [];
  if (req.imageBase64) content.push({ type: 'input_image', image_url: `data:image/jpeg;base64,${req.imageBase64}`, detail: 'auto' });
  content.push({ type: 'input_text', text: req.text });
  let response;
  try {
    response = await client.responses.create(
      {
        model: a.model,
        instructions: req.system,
        input: [{ role: 'user', content }],
        text: { format: { type: 'json_schema', name: req.schemaName, schema: req.schema, strict: true } },
      },
      { signal: req.signal },
    );
  } catch (err) {
    throw new Error(explainOpenAI(err, OpenAI));
  }
  if (response.status === 'incomplete') throw new Error('Die Antwort wurde abgeschnitten. Bitte erneut versuchen.');
  const refused = response.output.some((o) => o.type === 'message' && o.content.some((c) => c.type === 'refusal'));
  if (refused) throw new Error('Die Anfrage wurde abgelehnt. Bitte ein anderes Foto versuchen.');
  return response.output_text;
}

/**
 * Mahlzeit per Foto oder Beschreibung schätzen.
 * @param {{ imageBase64?: string, description?: string, hint: string, kcalLeft: number | null, proteinLeft: number | null, signal?: AbortSignal }} p
 */
export async function analyzeMeal(p) {
  const raw = await requestJson({
    system: MEAL_SYSTEM_PROMPT,
    schema: MEAL_SCHEMA,
    schemaName: 'mahlzeit',
    text: userPrompt({ hint: p.hint, description: p.description, kcalLeft: p.kcalLeft, proteinLeft: p.proteinLeft }),
    imageBase64: p.imageBase64,
    signal: p.signal,
  });
  return parseEstimate(raw);
}

/**
 * Nährwerttabelle oder Barcode auf einem Verpackungsfoto lesen.
 * @param {{ imageBase64: string, signal?: AbortSignal }} p
 */
export async function readLabel(p) {
  const raw = await requestJson({
    system: LABEL_SYSTEM_PROMPT,
    schema: LABEL_SCHEMA,
    schemaName: 'naehrwerttabelle',
    text: 'Lies die Nährwerttabelle und, falls vorhanden, den Barcode auf diesem Foto ab.',
    imageBase64: p.imageBase64,
    signal: p.signal,
  });
  return parseLabel(raw);
}

/**
 * Barcode direkt im Browser erkennen (Chrome/Android). iPhone-Safari kann das nicht;
 * dort liest die KI die Ziffern vom Foto.
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export async function detectBarcode(blob) {
  const BD = /** @type {any} */ (globalThis).BarcodeDetector;
  if (!BD) return '';
  try {
    const detector = new BD({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    const bitmap = await createImageBitmap(blob);
    const codes = await detector.detect(bitmap);
    bitmap.close();
    return codes[0]?.rawValue ?? '';
  } catch {
    return '';
  }
}

/** Meldung, wenn Open Food Facts nicht antwortet (offline oder Server überlastet). */
function offUnavailable() {
  return new Error(
    typeof navigator !== 'undefined' && navigator.onLine === false
      ? 'Keine Internetverbindung. Die Schweizer Nährwertdatenbank (Suche oben) funktioniert auch offline.'
      : 'Open Food Facts ist gerade überlastet oder nicht erreichbar. Bitte in einer Minute erneut versuchen. Die Schweizer Nährwertdatenbank (Suche oben) funktioniert weiterhin.',
  );
}

/**
 * fetch mit Zeitlimit; ein Abbruch durch die App (signal) wird als AbortError weitergereicht.
 * @param {string} url
 * @param {AbortSignal | undefined} signal
 * @param {number} ms
 */
async function fetchWithTimeout(url, signal, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** @param {AbortSignal | undefined} signal */
function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException('Abgebrochen', 'AbortError');
}

/**
 * Produkt in Open Food Facts nachschlagen (frei, ohne Schlüssel, Daten aus der Community).
 * Bei Netzfehlern einmal wiederholen (Mobilnetz, kurz überlasteter Server).
 * @param {string} barcode
 * @param {AbortSignal} [signal]
 */
export async function lookupBarcode(barcode, signal) {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,product_name_de,generic_name,brands,quantity,serving_quantity,nutriments,nova_group`;
  for (let attempt = 0; attempt < 2; attempt++) {
    let res;
    try {
      res = await fetchWithTimeout(url, signal, 12000);
    } catch {
      throwIfAborted(signal);
      continue;
    }
    if (res.status === 404) return parseOpenFoodFacts(await res.json().catch(() => null), barcode);
    if (res.status >= 500 || res.status === 429) continue;
    if (!res.ok) throw new Error(`Open Food Facts antwortet nicht (Fehler ${res.status}).`);
    return parseOpenFoodFacts(await res.json().catch(() => null), barcode);
  }
  throw offUnavailable();
}

/**
 * Produkte aus der Schweiz in Open Food Facts suchen (z. B. von Migros oder Coop).
 * Zuerst die neue, schnelle Suche (search-a-licious), bei Fehlern die klassische Suche.
 * Treffer ohne Nährwerte werden einzeln über den Strichcode nachgeladen.
 * Open Food Facts begrenzt Suchen auf wenige pro Minute; die App sucht deshalb nur auf
 * Knopfdruck, nicht bei jedem Tastendruck.
 * @param {string} query
 * @param {string} store
 * @param {AbortSignal} [signal]
 * @param {(attempt: number, of: number) => void} [onRetry] Rückmeldung für die Anzeige
 * @returns {Promise<import('./domain/foodvision.js').Product[]>}
 */
export async function searchProducts(query, store, signal, onRetry) {
  const key = `${store}|${query.trim().toLowerCase()}`;
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.list;
  // Open Food Facts antwortet zeitweise nicht: automatisch bis zu 3 Durchgänge mit Pause,
  // statt den Nutzer mehrmals tippen zu lassen. Bei «zu viele Suchen» nicht nachhaken.
  let last = /** @type {Error} */ (offUnavailable());
  for (let round = 0; round < 3; round++) {
    if (round > 0) {
      onRetry?.(round + 1, 3);
      await wait(round * 2000, signal);
    }
    const r = await searchOnce(query, store, signal);
    if (Array.isArray(r)) {
      searchCache.set(key, { at: Date.now(), list: r });
      return r;
    }
    last = r;
    if (r.message.startsWith('Zu viele')) break;
  }
  throw last;
}

/**
 * Ergebnisse der letzten Suchen (30 Minuten), spart Anfragen bei wiederholter Suche.
 * @type {Map<string, { at: number, list: import('./domain/foodvision.js').Product[] }>}
 */
const searchCache = new Map();

/**
 * @param {number} ms
 * @param {AbortSignal | undefined} signal
 */
function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('Abgebrochen', 'AbortError'));
      },
      { once: true },
    );
  });
}

/**
 * Ein Durchgang: neue Suche, dann klassische Suche. Gibt Produkte oder einen Fehler zurück.
 * @param {string} query
 * @param {string} store
 * @param {AbortSignal | undefined} signal
 * @returns {Promise<import('./domain/foodvision.js').Product[] | Error>}
 */
async function searchOnce(query, store, signal) {
  let limited = false;
  let answered = false;
  for (const [url, ms] of /** @type {const} */ ([
    [offSearchaliciousUrl(query, store), 10000],
    [offSearchUrl(query, store), 20000],
  ])) {
    let res;
    try {
      res = await fetchWithTimeout(url, signal, ms);
    } catch {
      throwIfAborted(signal);
      continue;
    }
    if (res.status === 429) {
      limited = true;
      continue;
    }
    if (!res.ok) continue;
    const json = await res.json().catch(() => null);
    if (json === null) continue;
    const found = parseOffSearch(json);
    if (found.length) return found;
    // Treffer ohne Nährwerte: die ersten 8 einzeln nachladen
    const codes = offSearchCodes(json).slice(0, 8);
    if (!codes.length) {
      // Keine Treffer: die andere Suche könnte anders filtern, daher noch versuchen
      answered = true;
      continue;
    }
    const loaded = await Promise.all(codes.map((c) => lookupBarcode(c, signal).catch(() => null)));
    throwIfAborted(signal);
    return loaded.filter((p) => p !== null);
  }
  if (answered) return [];
  if (limited) return new Error('Zu viele Suchen in kurzer Zeit. Bitte eine Minute warten.');
  return offUnavailable();
}

/**
 * Verfügbare Modelle des Anbieters (für die Auswahl in den Einstellungen).
 * @param {Provider} provider
 * @param {string} key
 * @returns {Promise<string[]>}
 */
export async function listModels(provider, key) {
  const mod = await loadSdk(provider);
  if (provider === 'openai') {
    /** @type {typeof import('openai').default} */
    const OpenAI = mod.default;
    const client = new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 0 });
    const ids = [];
    for await (const m of client.models.list()) if (/^(gpt|o\d)/.test(m.id)) ids.push(m.id);
    return ids.sort().reverse();
  }
  /** @type {typeof import('@anthropic-ai/sdk').default} */
  const Anthropic = mod.default;
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 0 });
  const ids = [];
  for await (const m of client.models.list()) ids.push(m.id);
  return ids;
}

/**
 * Verständliche Fehlermeldung aus den typisierten SDK-Fehlern (Anthropic).
 * @param {unknown} err
 * @param {typeof import('@anthropic-ai/sdk').default} A
 * @returns {string}
 */
function explainAnthropic(err, A) {
  if (err instanceof A.APIUserAbortError) return 'Abgebrochen.';
  if (err instanceof A.AuthenticationError) return 'Der API-Schlüssel ist ungültig. Bitte unter Profil → KI-Erfassung prüfen.';
  if (err instanceof A.PermissionDeniedError) return 'Der API-Schlüssel hat keine Berechtigung für dieses Modell.';
  if (err instanceof A.NotFoundError) return 'Das gewählte Modell gibt es nicht. Bitte unter Profil → KI-Erfassung ein anderes wählen.';
  if (err instanceof A.RateLimitError) return 'Zu viele Anfragen oder Guthaben aufgebraucht. Bitte später erneut versuchen.';
  if (err instanceof A.BadRequestError) return 'Die Anfrage wurde abgelehnt. Häufigste Ursache: Guthaben des API-Kontos aufgebraucht.';
  if (err instanceof A.APIConnectionTimeoutError) return 'Zeitüberschreitung. Bitte erneut versuchen.';
  if (err instanceof A.APIConnectionError) return 'Keine Verbindung. Die KI-Erfassung braucht Internet.';
  if (err instanceof A.APIError) return `Dienst nicht verfügbar (Fehler ${err.status ?? 'unbekannt'}). Bitte später erneut versuchen.`;
  return err instanceof Error ? err.message : 'Unbekannter Fehler.';
}

/**
 * Verständliche Fehlermeldung aus den typisierten SDK-Fehlern (OpenAI).
 * @param {unknown} err
 * @param {typeof import('openai').default} O
 * @returns {string}
 */
function explainOpenAI(err, O) {
  if (err instanceof O.APIUserAbortError) return 'Abgebrochen.';
  if (err instanceof O.AuthenticationError) return 'Der API-Schlüssel ist ungültig. Bitte unter Profil → KI-Erfassung prüfen.';
  if (err instanceof O.PermissionDeniedError) return 'Der API-Schlüssel hat keine Berechtigung für dieses Modell.';
  if (err instanceof O.NotFoundError) return 'Das gewählte Modell gibt es nicht. Bitte unter Profil → KI-Erfassung ein anderes wählen.';
  if (err instanceof O.RateLimitError) return 'Zu viele Anfragen oder Guthaben aufgebraucht. Bitte später erneut versuchen.';
  if (err instanceof O.BadRequestError) return 'Die Anfrage wurde abgelehnt (ungültige Anfrage oder Modell ohne Bildunterstützung).';
  if (err instanceof O.APIConnectionTimeoutError) return 'Zeitüberschreitung. Bitte erneut versuchen.';
  if (err instanceof O.APIConnectionError) return 'Keine Verbindung. Die KI-Erfassung braucht Internet.';
  if (err instanceof O.APIError) return `Dienst nicht verfügbar (Fehler ${err.status ?? 'unbekannt'}). Bitte später erneut versuchen.`;
  return err instanceof Error ? err.message : 'Unbekannter Fehler.';
}
