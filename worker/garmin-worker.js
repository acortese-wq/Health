// @ts-check
// Cloudflare Worker: Brücke zwischen Garmin Health API und dem Gesundheitscockpit.
//
// Warum ein Server? Garmin liefert Daten per Webhook (Push/Ping) an eine feste Adresse, und der
// Client-Secret darf nie in die Web-App. Der Worker
//   1. führt die Anmeldung bei Garmin durch (OAuth 2.0 mit PKCE),
//   2. nimmt Garmins Push-/Ping-Nachrichten entgegen und speichert kompakte Tageswerte (KV),
//   3. gibt der App ihre eigenen Werte zurück (nur mit dem persönlichen Sync-Schlüssel),
//   4. löscht alles beim Trennen oder wenn Garmin eine Abmeldung meldet.
//
// Gespeichert werden nur: Schritte, Ruhepuls, Schlafdauer, HRV, Stress, Body Battery, VO₂max und
// Aktivitäten (Art, Start, Dauer, Distanz, Ø-Puls). Aufbewahrung: 120 Tage.
//
// Einstellungen (wrangler.toml / Secrets): GARMIN_CLIENT_ID, GARMIN_CLIENT_SECRET (Secret),
// WEBHOOK_SECRET (Secret, Teil der Webhook-Adresse), APP_ORIGIN (z. B. https://acortese-wq.github.io),
// KV-Namespace GARMIN. Die Garmin-Adressen lassen sich überschreiben (GARMIN_AUTH_URL, GARMIN_TOKEN_URL,
// GARMIN_API), falls Garmins Unterlagen andere nennen.

const DEFAULTS = {
  GARMIN_AUTH_URL: 'https://connect.garmin.com/oauth2Confirm',
  GARMIN_TOKEN_URL: 'https://diauth.garmin.com/di-oauth2-service/oauth/token',
  GARMIN_API: 'https://apis.garmin.com',
};
const TTL_DAYS = 120;
const DAY = 86400;

/**
 * @typedef {{ get: (k: string) => Promise<string | null>, put: (k: string, v: string, o?: { expirationTtl?: number }) => Promise<void>,
 *   delete: (k: string) => Promise<void>, list: (o: { prefix: string, cursor?: string }) => Promise<{ keys: { name: string }[], list_complete: boolean, cursor?: string }> }} KV
 * @typedef {{ GARMIN: KV, GARMIN_CLIENT_ID: string, GARMIN_CLIENT_SECRET: string, WEBHOOK_SECRET: string, APP_ORIGIN: string,
 *   GARMIN_AUTH_URL?: string, GARMIN_TOKEN_URL?: string, GARMIN_API?: string }} Env
 * @typedef {{ steps?: number, restingHr?: number, sleepH?: number, hrvMs?: number, stress?: number, bodyBatteryHigh?: number,
 *   bodyBatteryLow?: number, vo2max?: number }} DayValues
 * @typedef {{ id: string, date: string, time: string, type: string, minutes: number, km?: number, avgHr?: number, title: string }} Activity
 */

/** @param {Env} env @param {'GARMIN_AUTH_URL' | 'GARMIN_TOKEN_URL' | 'GARMIN_API'} k */
const conf = (env, k) => env[k] || DEFAULTS[k];

// ---------- Umrechnung der Garmin-Nachrichten (rein, getestet) ----------

/** @param {unknown} v */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/**
 * Unix-Sekunden plus Zeitzonen-Versatz → lokales Datum und Uhrzeit.
 * @param {number} startSec
 * @param {number} offsetSec
 */
export function localDateTime(startSec, offsetSec = 0) {
  const d = new Date((startSec + offsetSec) * 1000);
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) };
}

/**
 * Eine Garmin-Push-Nachricht in Tageswerte und Aktivitäten umrechnen. Unbekannte Felder werden
 * ignoriert, fehlende bleiben leer (nie 0).
 * @param {string} kind z. B. dailies, sleeps, hrv, stressDetails, userMetrics, activities
 * @param {Record<string, any>} item
 * @returns {{ date: string, values?: DayValues, activity?: Activity } | null}
 */
export function normalize(kind, item) {
  const date = typeof item.calendarDate === 'string' ? item.calendarDate : null;
  switch (kind) {
    case 'dailies': {
      if (!date) return null;
      /** @type {DayValues} */
      const values = {};
      const steps = num(item.steps);
      const rhr = num(item.restingHeartRateInBeatsPerMinute);
      const stress = num(item.averageStressLevel);
      if (steps !== undefined && steps >= 0) values.steps = Math.round(steps);
      if (rhr !== undefined && rhr > 25 && rhr < 150) values.restingHr = Math.round(rhr);
      if (stress !== undefined && stress >= 0 && stress <= 100) values.stress = Math.round(stress);
      const bbHigh = num(item.bodyBatteryHighestValue);
      const bbLow = num(item.bodyBatteryLowestValue);
      if (bbHigh !== undefined) values.bodyBatteryHigh = Math.round(bbHigh);
      if (bbLow !== undefined) values.bodyBatteryLow = Math.round(bbLow);
      return { date, values };
    }
    case 'sleeps': {
      const sec = num(item.durationInSeconds);
      if (!date || sec === undefined || sec <= 0 || sec > 16 * 3600) return null;
      return { date, values: { sleepH: Math.round((sec / 3600) * 4) / 4 } };
    }
    case 'hrv': {
      const v = num(item.lastNightAvg);
      if (!date || v === undefined || v <= 0 || v > 300) return null;
      return { date, values: { hrvMs: Math.round(v) } };
    }
    case 'stressDetails': {
      const bb =
        item.timeOffsetBodyBatteryValues && typeof item.timeOffsetBodyBatteryValues === 'object'
          ? Object.values(item.timeOffsetBodyBatteryValues)
          : [];
      const vals = bb.filter((v) => typeof v === 'number');
      if (!date || !vals.length) return null;
      return { date, values: { bodyBatteryHigh: Math.max(...vals), bodyBatteryLow: Math.min(...vals) } };
    }
    case 'userMetrics': {
      const v = num(item.vo2Max);
      if (!date || v === undefined || v < 10 || v > 90) return null;
      return { date, values: { vo2max: Math.round(v) } };
    }
    case 'activities':
    case 'activityDetails': {
      const s = item.summary && typeof item.summary === 'object' ? item.summary : item;
      const start = num(s.startTimeInSeconds);
      const dur = num(s.durationInSeconds);
      if (start === undefined || dur === undefined || dur <= 0) return null;
      const when = localDateTime(start, num(s.startTimeOffsetInSeconds) ?? 0);
      const km = num(s.distanceInMeters);
      const hr = num(s.averageHeartRateInBeatsPerMinute);
      /** @type {Activity} */
      const activity = {
        id: `garmin-${String(s.summaryId ?? item.summaryId ?? `${when.date}-${when.time.replace(':', '')}`)}`,
        date: when.date,
        time: when.time,
        type: String(s.activityType ?? '').toLowerCase(),
        minutes: Math.round(dur / 60),
        title: String(s.activityName ?? ''),
        ...(km !== undefined && km > 0 ? { km: Math.round(km / 10) / 100 } : {}),
        ...(hr !== undefined && hr > 40 && hr < 230 ? { avgHr: Math.round(hr) } : {}),
      };
      return { date: when.date, activity };
    }
    default:
      return null;
  }
}

// ---------- Hilfen ----------

/** @param {number} bytes */
function randomToken(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return b64url(a);
}

/** @param {Uint8Array} a */
function b64url(a) {
  let s = '';
  for (const b of a) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** @param {string} verifier */
async function challenge(verifier) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(d));
}

/** SHA-256 des Sync-Schlüssels (im KV steht nie der Schlüssel selbst). @param {string} token */
async function tokenHash(token) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return b64url(new Uint8Array(d));
}

/**
 * @param {Env} env
 * @param {Request} req
 * @returns {Record<string, string>}
 */
function cors(env, req) {
  const origin = req.headers.get('origin') ?? '';
  return origin === env.APP_ORIGIN
    ? {
        'access-control-allow-origin': origin,
        'access-control-allow-headers': 'authorization, content-type',
        'access-control-allow-methods': 'GET, DELETE, OPTIONS',
        'access-control-max-age': '600',
        vary: 'origin',
      }
    : {};
}

/** @param {unknown} body @param {number} [status] @param {Record<string, string>} [headers] */
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });

/**
 * Rückkehr-Adresse nur zur eigenen App erlauben (kein offener Redirect).
 * @param {Env} env
 * @param {string | null} url
 */
function safeReturn(env, url) {
  try {
    const u = new URL(url ?? '');
    return u.origin === env.APP_ORIGIN ? `${u.origin}${u.pathname}` : null;
  } catch {
    return null;
  }
}

/**
 * Gültiges Zugriffs-Token eines Benutzers (bei Bedarf erneuert).
 * @param {Env} env
 * @param {string} userId
 */
async function accessToken(env, userId) {
  const raw = await env.GARMIN.get(`tok:${userId}`);
  if (!raw) return null;
  const t = JSON.parse(raw);
  if (t.expiresAt > Date.now() + 60_000) return /** @type {string} */ (t.access);
  const res = await fetch(conf(env, 'GARMIN_TOKEN_URL'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: t.refresh,
      client_id: env.GARMIN_CLIENT_ID,
      client_secret: env.GARMIN_CLIENT_SECRET,
    }),
  });
  if (!res.ok) return null;
  const n = await res.json();
  await saveTokens(env, userId, n);
  return /** @type {string} */ (n.access_token);
}

/**
 * @param {Env} env
 * @param {string} userId
 * @param {{ access_token: string, refresh_token?: string, expires_in?: number }} t
 */
async function saveTokens(env, userId, t) {
  const old = JSON.parse((await env.GARMIN.get(`tok:${userId}`)) ?? '{}');
  await env.GARMIN.put(
    `tok:${userId}`,
    JSON.stringify({
      access: t.access_token,
      refresh: t.refresh_token ?? old.refresh,
      expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000,
    }),
  );
}

/**
 * Werte eines Tages zusammenführen (neuere Nachrichten überschreiben einzelne Felder).
 * @param {Env} env
 * @param {string} userId
 * @param {{ date: string, values?: DayValues, activity?: Activity }} n
 */
async function store(env, userId, n) {
  const key = `day:${userId}:${n.date}`;
  const cur = JSON.parse((await env.GARMIN.get(key)) ?? '{}');
  if (n.values) Object.assign(cur, n.values);
  if (n.activity) cur.activities = [...(cur.activities ?? []).filter((/** @type {Activity} */ a) => a.id !== n.activity?.id), n.activity];
  await env.GARMIN.put(key, JSON.stringify(cur), { expirationTtl: TTL_DAYS * DAY });
}

/**
 * Alle Daten eines Benutzers löschen.
 * @param {Env} env
 * @param {string} userId
 */
async function wipe(env, userId) {
  for (const prefix of [`day:${userId}:`]) {
    let cursor;
    do {
      const page = await env.GARMIN.list({ prefix, cursor });
      for (const k of page.keys) await env.GARMIN.delete(k.name);
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
  }
  const hash = await env.GARMIN.get(`usr:${userId}`);
  if (hash) await env.GARMIN.delete(`sync:${hash}`);
  await env.GARMIN.delete(`usr:${userId}`);
  await env.GARMIN.delete(`tok:${userId}`);
}

// ---------- Routen ----------

/**
 * @param {Request} req
 * @param {Env} env
 */
async function handle(req, env) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env, req) });

  // 1. Anmeldung starten
  if (path === '/auth/start' && req.method === 'GET') {
    const back = safeReturn(env, url.searchParams.get('return'));
    if (!back) return json({ error: 'Rückkehradresse nicht erlaubt' }, 400);
    const verifier = randomToken(48);
    const state = randomToken(16);
    await env.GARMIN.put(`pkce:${state}`, JSON.stringify({ verifier, back }), { expirationTtl: 600 });
    const auth = new URL(conf(env, 'GARMIN_AUTH_URL'));
    auth.search = new URLSearchParams({
      response_type: 'code',
      client_id: env.GARMIN_CLIENT_ID,
      code_challenge: await challenge(verifier),
      code_challenge_method: 'S256',
      redirect_uri: `${url.origin}/auth/callback`,
      state,
    }).toString();
    return Response.redirect(auth.toString(), 302);
  }

  // 2. Rückkehr von Garmin: Code gegen Tokens tauschen, Sync-Schlüssel ausstellen
  if (path === '/auth/callback' && req.method === 'GET') {
    const state = url.searchParams.get('state') ?? '';
    const saved = await env.GARMIN.get(`pkce:${state}`);
    if (!saved) return json({ error: 'Anmeldung abgelaufen, bitte neu starten' }, 400);
    await env.GARMIN.delete(`pkce:${state}`);
    const { verifier, back } = JSON.parse(saved);
    const code = url.searchParams.get('code');
    if (!code) return Response.redirect(`${back}#garmin`, 302);
    const res = await fetch(conf(env, 'GARMIN_TOKEN_URL'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: `${url.origin}/auth/callback`,
        client_id: env.GARMIN_CLIENT_ID,
        client_secret: env.GARMIN_CLIENT_SECRET,
      }),
    });
    if (!res.ok) return json({ error: `Garmin hat die Anmeldung abgelehnt (${res.status})` }, 502);
    const tok = await res.json();
    const me = await fetch(`${conf(env, 'GARMIN_API')}/wellness-api/rest/user/id`, {
      headers: { authorization: `Bearer ${tok.access_token}` },
    });
    if (!me.ok) return json({ error: `Garmin-Benutzer nicht lesbar (${me.status})` }, 502);
    const userId = String((await me.json()).userId ?? '');
    if (!userId) return json({ error: 'Garmin-Benutzer fehlt' }, 502);
    await saveTokens(env, userId, tok);
    // Alten Schlüssel ungültig machen, neuen ausstellen (nur der Hash wird gespeichert)
    const oldHash = await env.GARMIN.get(`usr:${userId}`);
    if (oldHash) await env.GARMIN.delete(`sync:${oldHash}`);
    const sync = randomToken(32);
    const hash = await tokenHash(sync);
    await env.GARMIN.put(`sync:${hash}`, userId);
    await env.GARMIN.put(`usr:${userId}`, hash);
    // Schlüssel im Fragment: landet nicht in Server-Logs oder im Referrer
    return Response.redirect(`${back}#garmin-connected=${sync}`, 302);
  }

  // 3. Garmin-Webhooks: /webhook/<WEBHOOK_SECRET>/<art>
  const hook = path.match(/^\/webhook\/([^/]+)\/([A-Za-z]+)$/);
  if (hook && req.method === 'POST') {
    if (!env.WEBHOOK_SECRET || hook[1] !== env.WEBHOOK_SECRET) return new Response('not found', { status: 404 });
    const kind = hook[2];
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return new Response('bad request', { status: 400 });
    // Abmeldung / entzogene Berechtigung: Daten löschen
    if (kind === 'deregistrations' || kind === 'userPermissionsChange') {
      for (const d of /** @type {any[]} */ (body[kind] ?? body.deregistrations ?? body.userPermissionsChange ?? []))
        if (d?.userId && (kind === 'deregistrations' || !(d.permissions ?? []).length)) await wipe(env, String(d.userId));
      return new Response(null, { status: 200 });
    }
    const items = /** @type {any[]} */ (Array.isArray(body[kind]) ? body[kind] : []);
    for (const it of items) {
      const userId = String(it?.userId ?? '');
      if (!userId || !(await env.GARMIN.get(`usr:${userId}`))) continue;
      // Ping: Daten liegen unter callbackURL und werden mit dem Token des Benutzers abgeholt
      if (typeof it.callbackURL === 'string' && it.callbackURL.startsWith(conf(env, 'GARMIN_API'))) {
        const token = await accessToken(env, userId);
        if (!token) continue;
        const r = await fetch(it.callbackURL, { headers: { authorization: `Bearer ${token}` } });
        if (!r.ok) continue;
        const list = await r.json();
        for (const x of Array.isArray(list) ? list : []) {
          const n = normalize(kind, x);
          if (n) await store(env, userId, n);
        }
        continue;
      }
      const n = normalize(kind, it);
      if (n) await store(env, userId, n);
    }
    // Garmin erwartet eine schnelle Bestätigung
    return new Response(null, { status: 200 });
  }

  // 4. App: eigene Daten abholen bzw. Verbindung trennen
  if (path === '/data' || path === '/me') {
    const h = cors(env, req);
    const auth = req.headers.get('authorization') ?? '';
    const sync = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const userId = sync ? await env.GARMIN.get(`sync:${await tokenHash(sync)}`) : null;
    if (!userId) return json({ error: 'Nicht verbunden' }, 401, h);
    if (path === '/me' && req.method === 'DELETE') {
      await wipe(env, userId);
      return json({ ok: true }, 200, h);
    }
    if (path === '/data' && req.method === 'GET') {
      const since = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('since') ?? '') ? String(url.searchParams.get('since')) : '0000';
      /** @type {Record<string, DayValues & { activities?: Activity[] }>} */
      const days = {};
      let cursor;
      do {
        const page = await env.GARMIN.list({ prefix: `day:${userId}:`, cursor });
        for (const k of page.keys) {
          const date = k.name.slice(k.name.lastIndexOf(':') + 1);
          if (date < since) continue;
          const v = await env.GARMIN.get(k.name);
          if (v) days[date] = JSON.parse(v);
        }
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
      return json({ days }, 200, h);
    }
  }
  return new Response('not found', { status: 404 });
}

export default {
  /**
   * @param {Request} req
   * @param {Env} env
   */
  async fetch(req, env) {
    try {
      return await handle(req, env);
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : 'Fehler' }, 500, cors(env, req));
    }
  },
};
