# Garmin Health API anbinden

Das Cockpit ist eine reine Web-App ohne eigenen Server. Für die Garmin Health API braucht es trotzdem einen kleinen
Zwischenserver, weil

- der **Client-Secret** von Garmin nie in die App (also in den Browser) gehören darf, und
- Garmin neue Werte per **Webhook** (Push oder Ping) an eine feste Adresse schickt, sobald die Uhr synchronisiert.

Dafür gibt es `worker/garmin-worker.js`, einen Cloudflare Worker (Gratis-Stufe genügt).

```
Uhr → Garmin Connect App → Garmin ──Webhook──► Worker (KV-Speicher) ◄──Abgleich── Cockpit (App)
                                      ▲                                   │
                                      └────── OAuth 2.0 mit PKCE ─────────┘
```

## Was der Worker speichert

Nur: Schritte, Ruhepuls, Schlafdauer, HRV (Nacht), Stress (Tagesschnitt), Body Battery (höchster/tiefster Wert),
VO₂max und Aktivitäten (Art, Start, Dauer, Distanz, Ø-Puls). Aufbewahrung 120 Tage, danach automatisch gelöscht.
Tokens von Garmin liegen im KV-Speicher; der persönliche Sync-Schlüssel der App wird nur als SHA-256-Hash gespeichert.
«Trennen» in der App und eine Abmeldung bei Garmin (Deregistration) löschen alle Daten des Benutzers.

In der App landen Schritte, Ruhepuls, Schlaf, VO₂max und Läufe/Krafttraining im normalen Speicher (und damit im Backup).
HRV, Stress und Body Battery sowie Adresse und Sync-Schlüssel bleiben in einem eigenen Speicher auf dem Gerät, nicht im
Backup.

## Einrichtung automatisch über GitHub (empfohlen)

Der Ablauf `.github/workflows/garmin-worker.yml` legt den Speicher an, veröffentlicht den Worker und hinterlegt die
Geheimnisse. Einmalig nötig:

1. Cloudflare: My Profile → API Tokens → Create Token → Vorlage **«Edit Cloudflare Workers»** → Account Resources:
   dein Konto, Zone Resources: All zones → Continue → Create Token. Token kopieren.
2. Cloudflare: Account-ID kopieren (Workers & Pages → rechte Spalte «Account ID», oder aus der Adresse
   `dash.cloudflare.com/<account-id>/…`).
3. GitHub: Repository → Settings → Secrets and variables → Actions → **New repository secret**, fünfmal:
   `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `GARMIN_CLIENT_ID`, `GARMIN_CLIENT_SECRET`, `WEBHOOK_SECRET`
   (mind. 32 Zeichen, nur Buchstaben und Ziffern).
4. GitHub: Actions → «Garmin-Worker veröffentlichen» → **Run workflow**. In der Zusammenfassung des Laufs stehen die
   Adressen für das Garmin-Portal.

Danach wie unten ab Punkt 4 (Garmin-Portal) und 5 (App verbinden). Spätere Änderungen am Worker werden bei jedem Push
automatisch veröffentlicht.

## Einrichtung von Hand (Alternative)

Voraussetzungen: Zugang zum Garmin Connect Developer Program (Health API) mit Client-ID und Client-Secret,
ein kostenloses Cloudflare-Konto, Node.js auf dem Computer.

1. **Worker anlegen**
   ```
   cd worker
   npx wrangler login
   npx wrangler kv namespace create GARMIN
   ```
   Die ausgegebene `id` in `worker/wrangler.toml` bei `[[kv_namespaces]]` eintragen, dazu `GARMIN_CLIENT_ID`.
2. **Geheimnisse hinterlegen** (nie in Dateien oder in den Chat schreiben):
   ```
   npx wrangler secret put GARMIN_CLIENT_SECRET
   npx wrangler secret put WEBHOOK_SECRET
   ```
   Für `WEBHOOK_SECRET` eine lange Zufallszeichenkette verwenden (z. B. `openssl rand -hex 24`).
3. **Veröffentlichen**: `npx wrangler deploy`. Die Adresse lautet etwa `https://garmin-cockpit.<konto>.workers.dev`.
4. **Im Garmin-Developer-Portal** eintragen:
   - Redirect-/Callback-URL für OAuth: `https://garmin-cockpit.<konto>.workers.dev/auth/callback`
   - Endpunkte (Push bevorzugt, Ping geht auch) jeweils
     `https://garmin-cockpit.<konto>.workers.dev/webhook/<WEBHOOK_SECRET>/<art>` mit `<art>` =
     `dailies`, `sleeps`, `hrv`, `stressDetails`, `userMetrics`, `activities`, `deregistrations`,
     `userPermissionsChange`.
5. **In der App**: Training › Garmin-Dashboard › Adresse des Workers eingeben › «Mit Garmin verbinden» › bei Garmin
   anmelden und zustimmen. Danach gleicht die App beim Öffnen des Dashboards automatisch ab (höchstens alle
   15 Minuten) oder mit «Jetzt abgleichen».

## Bitte mit den eigenen Garmin-Unterlagen abgleichen

Garmin stellt die Health API derzeit von OAuth 1.0a auf OAuth 2.0 mit PKCE um; die Unterlagen sind nur für Partner
zugänglich und wurden für diesen Code nicht eingesehen. Voreingestellt sind:

| Einstellung | Wert | anpassbar über |
| --- | --- | --- |
| Anmeldeseite | `https://connect.garmin.com/oauth2Confirm` | `GARMIN_AUTH_URL` |
| Token-Adresse | `https://diauth.garmin.com/di-oauth2-service/oauth/token` | `GARMIN_TOKEN_URL` |
| API-Basis (Benutzer-ID, Ping-Abruf) | `https://apis.garmin.com` (`/wellness-api/rest/user/id`) | `GARMIN_API` |

Feldnamen der Push-Nachrichten, die der Worker liest: `calendarDate`, `steps`, `restingHeartRateInBeatsPerMinute`,
`averageStressLevel`, `bodyBatteryHighestValue/LowestValue`, `durationInSeconds` (Schlaf), `lastNightAvg` (HRV),
`vo2Max`, bei Aktivitäten `summaryId`, `activityType`, `activityName`, `startTimeInSeconds`,
`startTimeOffsetInSeconds`, `durationInSeconds`, `distanceInMeters`, `averageHeartRateInBeatsPerMinute`.
Weichen die Namen ab, nur die Funktion `normalize` im Worker anpassen (Tests in `tests/unit/worker.test.js`).

Falls Garmin beim Registrieren eines Endpunkts eine Bestätigung (Challenge) verlangt, steht in den Partner-Unterlagen,
welche Antwort erwartet wird; das lässt sich im Worker bei den Webhook-Routen ergänzen.

## Ohne Health API

Weiterhin möglich: Aktivitäten als CSV aus Garmin Connect importieren (Training) und Tageswerte per iPhone-Kurzbefehl
(Garmin → Apple Health → Zwischenablage) einfügen.
