# Gesundheitscockpit

Persönliche, evidenzbasierte Web-App für Gewicht, Ernährung, Training, Schlaf, Blutdruck, Laborwerte und Vorsorge.
Sie läuft im Browser, ist auf dem Handy installierbar (PWA) und funktioniert offline.
**Alle Gesundheitsdaten bleiben auf dem Gerät.** Es gibt keinen Server, kein Konto und kein Tracking.

> Die App ersetzt keine ärztliche Beratung. Sie ordnet Werte nach publizierten Leitlinien ein und empfiehlt bei
> Auffälligkeiten die Abklärung. Notfall: 144.

## Funktionen

Navigation: fünf Hauptbereiche unten (mobil) bzw. links (Desktop), dazu **Wissen** und **Profil** oben rechts.

| Bereich         | Was die App macht |
| --------------- | ----------------- |
| **Heute**       | Antippbare Kennzahlen (Trendgewicht, Kalorien übrig, Protein, Plan), Schnellaktionen, Coach-Hinweise nach Dringlichkeit, Gewicht, **Trinkmenge** mit Erinnerungen, Koffein mit Restmenge beim Schlafengehen, Erholung (Schritte, Schlaf, Ruhepuls), Tagesrückblick |
| **Ernährung**   | **Mahlzeit fotografieren, beschreiben oder Packung scannen** (Claude oder GPT, Open Food Facts), Zuletzt gegessen, Schnellerfassung, Einträge direkt bearbeiten |
| **Fortschritt** | Robuster Trend (Theil-Sen und exponentielle Glättung), Planlinie, Zwischenziele, Prognose, **adaptiver Energiebedarf** aus den eigenen Daten |
| **Training**    | Laufplan (oder Lauf plus Kraft mit **doppelter Progression**), Wochenbilanz nach WHO, Garmin-CSV-Import, Lebenserwartung durch Bewegung |
| **Gesundheit**  | Blutdruck (ESC 2024), Taille, VO₂max, Laborwerte, **eGFR (CKD-EPI 2021)**, **FIB-4**, STOP-BANG, Schweizer Vorsorge |
| **Wissen**      | Aussagen mit Evidenzgrad und Originalquellen |
| **Profil**      | Ziele, KI-Anbieter, Backup (JSON), CSV-Export, Import, Löschen, Datenschutzhinweise |

Jede Änderung lässt sich 5 Sekunden lang über «Rückgängig» zurücknehmen. Begonnene, nicht gespeicherte Eingaben bleiben beim Neuzeichnen erhalten.

Die Methodik und alle Grenzwerte mit Quellen stehen in [docs/MEDIZIN.md](docs/MEDIZIN.md).

## Nutzung

### Auf dem Handy installieren

1. App-URL in Safari (iPhone) oder Chrome (Android) öffnen.
2. iPhone: Teilen → «Zum Home-Bildschirm». Android: Menü → «App installieren».
3. Profil anlegen. Danach läuft die App auch ohne Internet.

### Mahlzeiten erfassen (inspiriert von Foodvisor und PlateLens)

Unter «Ernährung» → «Erfassen mit KI» gibt es drei Wege:

| Modus | Ablauf | Genauigkeit |
| --- | --- | --- |
| **Foto** | Teller fotografieren → Gericht, Bestandteile mit Gramm, kcal-Spanne, Makros, Zucker, gesättigte Fette, Ballaststoffe, Salz | Schätzung (± 20–40 %) |
| **Beschreiben** | z. B. «2 Scheiben Ruchbrot mit Butter» tippen oder per iPhone-Tastatur diktieren | Schätzung |
| **Packung** | Nährwerttabelle oder Barcode fotografieren bzw. Ziffern eingeben → Menge in Gramm wählen | genau (Packungsangabe) |

Danach: Bestandteile abwählen, **Gramm pro Bestandteil** korrigieren (alle Werte rechnen mit), Portion ½–1½, Werte prüfen, übernehmen,
optional als Schnellknopf speichern. Dazu: **Zuletzt gegessen** als Schnellwahl, **Ballaststoffe und Salz** im Tagesüberblick,
Kennzeichnung **«proteinreich»** (≥ 20 % der Energie aus Protein, EU-Verordnung 1924/2006).

- **Anbieter wählbar:** Claude (Anthropic, Standard `claude-opus-5-5`) oder GPT (OpenAI, Standard `gpt-5.5`), unter Profil → KI-Erfassung. Modelle lassen sich mit dem eigenen Schlüssel beim Anbieter abrufen und auswählen.
- **Eigener API-Schlüssel nötig** (console.anthropic.com bzw. platform.openai.com, mit Guthaben). Ein ChatGPT- oder Claude-Abo reicht nicht. Pro Foto etwa 1–5 Rappen.
- **Barcodes ohne Schlüssel:** Abfrage bei [Open Food Facts](https://world.openfoodfacts.org) (freie Community-Datenbank). Auf Android/Chrome erkennt der Browser den Barcode selbst; auf dem iPhone liest die KI die Ziffern vom Foto oder du tippst sie ein.
- **Datenschutz:** Fotos gehen verkleinert direkt vom Gerät an den gewählten Anbieter, ohne Zwischenserver. Schlüssel bleiben auf dem Gerät und sind nie im Backup.
- **SDKs:** `@anthropic-ai/sdk` und `openai` sind in `app/vendor/` gebündelt (`npm run vendor`) und werden erst bei Bedarf geladen.
- **Bewusst nicht übernommen:** PlateLens' Tiefenmessung (braucht LiDAR-Zugriff, den Web-Apps nicht haben), Rezeptbibliotheken, Abo-Modelle.

### Garmin

- **Läufe:** Garmin Connect (Web) → Aktivitäten → «Export CSV» → in der App unter Training → «Von Garmin importieren». Läufe und Krafttraining werden übernommen, Doppelte übersprungen; Intervalle am Titel erkannt, ab 60 Minuten «langer Lauf».
- **Tageswerte:** Garmin Connect → Apple Health → iPhone-Kurzbefehl kopiert `cockpit;schritte=…;ruhepuls=…;schlaf=…;gewicht=…` → in der App unter Heute → «Werte aus Garmin / Apple Health einfügen». Anleitung in der App.
- Eine direkte Verbindung ist nicht möglich: Garmins Schnittstelle ist nur für zugelassene Firmenpartner mit Server zugänglich, und Web-Apps dürfen Apple Health nicht direkt lesen.

### Datensicherung

Die Daten liegen im Browser-Speicher des Geräts. Wer den Browserverlauf samt Websitedaten löscht, löscht auch die
App-Daten. Deshalb: **Profil → Daten → «Backup herunterladen»**, zum Beispiel einmal pro Woche. Mit dem Backup lassen sich die
Daten auch auf ein neues Gerät übertragen.

## Deployment (GitHub Pages)

**Live:** https://acortese-wq.github.io/Health/app/ (Veröffentlichung über «Deploy from branch» bei jedem Push auf `main`; `_config.yml` schliesst persönliche Dateien aus).
Alternative: Source «GitHub Actions» und den push-Auslöser in `.github/workflows/pages.yml` aktivieren; dann wird nur `app/` veröffentlicht.


Hinweis: GitHub Pages ist für **private** Repositories nur mit einem kostenpflichtigen Plan (z. B. GitHub Pro) verfügbar.
Die veröffentlichte Seite ist öffentlich erreichbar, enthält aber keine Gesundheitsdaten: Diese liegen ausschliesslich
auf dem Gerät. Die Seite ist mit `noindex` markiert.

## Entwicklung

Ohne Build-Schritt: reines HTML, CSS und JavaScript (ES-Module) mit JSDoc-Typen. Zur Laufzeit gibt es keine Abhängigkeiten.

```bash
npm install          # nur Entwicklungswerkzeuge (TypeScript, Playwright, Prettier)
npm start            # http://localhost:4173
npm run check        # Formatierung + Typprüfung (strict) + Unit-Tests
npm run test:e2e     # Browser-Tests auf Mobil- und Desktop-Viewport
```

```
app/
  index.html, manifest.webmanifest, sw.js (Offline-Cache), css/, icons/
  js/domain/   Fachlogik ohne DOM: Energie, Trend, Koffein, Training, Klinik, Coach, Evidenz
  js/views/    Ansichten (Heute, Ernährung, Fortschritt, Training, Gesundheit, Wissen, Profil)
  js/ui/       DOM-Baukasten (nur Textknoten, kein innerHTML) und SVG-Diagramm
  js/store.js  Speicher, Validierung, Import/Export
tests/unit/    Referenzrechnungen für jede Formel und jeden Grenzwert
tests/e2e/     Abläufe im echten Browser (Erfassung, Backup, XSS, Layout ohne Querscrollen)
```

Neue Datei in `app/`? Dann auch in `app/sw.js` eintragen und `VERSION` erhöhen. Ein Test prüft die Vollständigkeit.

### Sicherheit und Datenschutz

- Strikte Content-Security-Policy: nur eigene Skripte, keine Inline-Skripte, kein `eval`.
- Nutzereingaben werden ausschliesslich als Textknoten in die Seite eingefügt (ein Test prüft das auf XSS).
- Importierte Backups werden Feld für Feld validiert. Unbekannte Felder werden verworfen.
- Schriften liegen in der App (`app/fonts`, SIL Open Font License). Ohne KI-Nutzung verlässt keine Anfrage das Gerät (Test `audit.spec.js`).
- Netzwerkanfragen nur, wenn du sie auslöst: Foto- oder Texterkennung an `api.anthropic.com` bzw. `api.openai.com` (Foto oder Text plus Resttagesziel), Barcode an Open Food Facts (nur die Nummer).
- Ein automatischer Test prüft 21 Farbpaare auf WCAG-Kontrast ≥ 4.5:1 im hellen und dunklen Modus.

## Urheber

Alessandro Cortese
