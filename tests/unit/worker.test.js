import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { normalize, localDateTime } from '../../worker/garmin-worker.js';

const APP = 'https://acortese-wq.github.io';
const W = 'https://garmin-cockpit.example.workers.dev';

function kv() {
  /** @type {Map<string, string>} */
  const m = new Map();
  return {
    m,
    get: async (/** @type {string} */ k) => m.get(k) ?? null,
    put: async (/** @type {string} */ k, /** @type {string} */ v) => void m.set(k, v),
    delete: async (/** @type {string} */ k) => void m.delete(k),
    list: async (/** @type {{ prefix: string }} */ o) => ({
      keys: [...m.keys()].filter((k) => k.startsWith(o.prefix)).map((name) => ({ name })),
      list_complete: true,
    }),
  };
}

const env = () => ({ GARMIN: kv(), GARMIN_CLIENT_ID: 'cid', GARMIN_CLIENT_SECRET: 'secret', WEBHOOK_SECRET: 'hook123', APP_ORIGIN: APP });

test('Umrechnung: Tageswerte, Schlaf, HRV, VO₂max, Aktivität; unbekannt bleibt leer', () => {
  assert.deepEqual(
    normalize('dailies', { calendarDate: '2026-10-25', steps: 9512.4, restingHeartRateInBeatsPerMinute: 48, averageStressLevel: 31 }),
    {
      date: '2026-10-25',
      values: { steps: 9512, restingHr: 48, stress: 31 },
    },
  );
  assert.deepEqual(normalize('sleeps', { calendarDate: '2026-10-25', durationInSeconds: 26700 }), {
    date: '2026-10-25',
    values: { sleepH: 7.5 },
  });
  assert.equal(normalize('sleeps', { calendarDate: '2026-10-25' }), null);
  assert.deepEqual(normalize('hrv', { calendarDate: '2026-10-25', lastNightAvg: 52 }), { date: '2026-10-25', values: { hrvMs: 52 } });
  assert.deepEqual(normalize('userMetrics', { calendarDate: '2026-10-25', vo2Max: 44 }), { date: '2026-10-25', values: { vo2max: 44 } });
  const a = normalize('activities', {
    summaryId: '123',
    activityType: 'RUNNING',
    activityName: 'Intervalle 4x4',
    startTimeInSeconds: Date.UTC(2026, 9, 25, 16, 30) / 1000,
    startTimeOffsetInSeconds: 7200,
    durationInSeconds: 2100,
    distanceInMeters: 5800,
    averageHeartRateInBeatsPerMinute: 154,
  });
  assert.deepEqual(a?.activity, {
    id: 'garmin-123',
    date: '2026-10-25',
    time: '18:30',
    type: 'running',
    minutes: 35,
    title: 'Intervalle 4x4',
    km: 5.8,
    avgHr: 154,
  });
  assert.equal(normalize('unbekannt', {}), null);
  assert.deepEqual(localDateTime(0, 3600), { date: '1970-01-01', time: '01:00' });
});

test('Anmeldung: PKCE, nur eigene Rückkehradresse, Sync-Schlüssel im Fragment, nur Hash gespeichert', async (t) => {
  const e = env();
  const bad = await worker.fetch(new Request(`${W}/auth/start?return=${encodeURIComponent('https://evil.example/')}`), e);
  assert.equal(bad.status, 400);
  const start = await worker.fetch(new Request(`${W}/auth/start?return=${encodeURIComponent(`${APP}/Health/`)}`), e);
  assert.equal(start.status, 302);
  const auth = new URL(String(start.headers.get('location')));
  assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(auth.searchParams.get('redirect_uri'), `${W}/auth/callback`);
  assert.ok(!auth.toString().includes('secret'));
  const state = String(auth.searchParams.get('state'));

  const calls = /** @type {string[]} */ ([]);
  t.mock.method(globalThis, 'fetch', async (/** @type {string} */ url, /** @type {any} */ init) => {
    calls.push(String(url));
    if (String(url).includes('/oauth/token')) {
      assert.match(String(init.body), /code_verifier=/);
      return new Response(JSON.stringify({ access_token: 'acc', refresh_token: 'ref', expires_in: 3600 }));
    }
    return new Response(JSON.stringify({ userId: 'u1' }));
  });
  const cb = await worker.fetch(new Request(`${W}/auth/callback?code=abc&state=${state}`), e);
  assert.equal(cb.status, 302);
  const back = String(cb.headers.get('location'));
  assert.match(back, /^https:\/\/acortese-wq\.github\.io\/Health\/#garmin-connected=[A-Za-z0-9_-]{40,}$/);
  const sync = back.split('=')[1];
  assert.ok(![...e.GARMIN.m.values()].includes(sync), 'Sync-Schlüssel nie im Klartext gespeichert');
  // Wiederverwendung des state schlägt fehl
  const again = await worker.fetch(new Request(`${W}/auth/callback?code=abc&state=${state}`), e);
  assert.equal(again.status, 400);

  // Webhook nur mit Geheimnis; Push speichert, App holt ab
  const wrong = await worker.fetch(new Request(`${W}/webhook/falsch/dailies`, { method: 'POST', body: '{}' }), e);
  assert.equal(wrong.status, 404);
  const push = await worker.fetch(
    new Request(`${W}/webhook/hook123/dailies`, {
      method: 'POST',
      body: JSON.stringify({
        dailies: [
          { userId: 'u1', calendarDate: '2026-10-25', steps: 8000 },
          { userId: 'fremd', calendarDate: '2026-10-25', steps: 1 },
        ],
      }),
    }),
    e,
  );
  assert.equal(push.status, 200);
  await worker.fetch(
    new Request(`${W}/webhook/hook123/sleeps`, {
      method: 'POST',
      body: JSON.stringify({ sleeps: [{ userId: 'u1', calendarDate: '2026-10-25', durationInSeconds: 25200 }] }),
    }),
    e,
  );
  assert.equal([...e.GARMIN.m.keys()].filter((k) => k.startsWith('day:fremd')).length, 0, 'unbekannte Benutzer werden ignoriert');

  const noAuth = await worker.fetch(new Request(`${W}/data`, { headers: { origin: APP } }), e);
  assert.equal(noAuth.status, 401);
  const data = await worker.fetch(
    new Request(`${W}/data?since=2026-10-01`, { headers: { origin: APP, authorization: `Bearer ${sync}` } }),
    e,
  );
  assert.equal(data.headers.get('access-control-allow-origin'), APP);
  assert.deepEqual(await data.json(), { days: { '2026-10-25': { steps: 8000, sleepH: 7 } } });
  const other = await worker.fetch(
    new Request(`${W}/data`, { headers: { origin: 'https://evil.example', authorization: `Bearer ${sync}` } }),
    e,
  );
  assert.equal(other.headers.get('access-control-allow-origin'), null);

  // Trennen löscht alles
  const del = await worker.fetch(
    new Request(`${W}/me`, { method: 'DELETE', headers: { origin: APP, authorization: `Bearer ${sync}` } }),
    e,
  );
  assert.equal(del.status, 200);
  assert.equal(e.GARMIN.m.size, 0);
});

test('Abmeldung durch Garmin löscht die Daten des Benutzers', async () => {
  const e = env();
  await e.GARMIN.put('usr:u2', 'h');
  await e.GARMIN.put('sync:h', 'u2');
  await e.GARMIN.put('tok:u2', '{}');
  await e.GARMIN.put('day:u2:2026-10-25', '{"steps":1}');
  const r = await worker.fetch(
    new Request(`${W}/webhook/hook123/deregistrations`, { method: 'POST', body: JSON.stringify({ deregistrations: [{ userId: 'u2' }] }) }),
    e,
  );
  assert.equal(r.status, 200);
  assert.equal(e.GARMIN.m.size, 0);
});
