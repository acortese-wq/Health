# Gesundheitscockpit

Persönliche, evidenzbasierte Web-App für Gewicht, Ernährung, Training, Schlaf, Blutdruck, Laborwerte und Vorsorge.
Sie läuft im Browser, ist auf dem Handy installierbar (PWA) und funktioniert offline.
**Alle Gesundheitsdaten bleiben auf dem Gerät.** Es gibt keinen Server, kein Konto und kein Tracking.

> Die App ersetzt keine ärztliche Beratung. Sie ordnet Werte nach publizierten Leitlinien ein und empfiehlt bei
> Auffälligkeiten die Abklärung. Notfall: 144.

## Funktionen

| Bereich        | Was die App macht                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Heute**      | Gewicht, **Mahlzeit fotografieren → Gericht und Kalorien per Claude erkennen**, Mahlzeiten (Schnellerfassung), Protein, Koffein mit Restmenge beim Schlafengehen, Schritte, Schlaf, Ruhepuls, Coach-Hinweise nach Dringlichkeit                                                 |
| **Gewicht**    | Robuster Trend (Theil-Sen und exponentielle Glättung), Planlinie, Zwischenziele, Prognose, **adaptiver Energiebedarf** aus den eigenen Daten statt aus der Formel                                         |
| **Training**   | Ganzkörper-Kraftplan A/B mit **doppelter Progression** (Vorschlag für Gewicht und Wiederholungen), Laufprotokoll mit Pace, Wochenbilanz nach WHO                                                        |
| **Gesundheit** | Blutdruck (ESC 2024, 7-Tage-Serie), Taille und Taille-zu-Grösse, VO₂max, Laborwerte mit Einordnung, **eGFR (CKD-EPI 2021)**, **FIB-4**, STOP-BANG-Schlafapnoe-Check, Schweizer Vorsorge-Checkliste |
| **Wissen**     | Aussagen mit Evidenzgrad (gut belegt / wahrscheinlich sinnvoll / unsicher / unbelegt) und Originalquellen                                                                                              |
| **Profil**     | Ziele, Koffein-Ausschleichplan, Backup (JSON), CSV-Export für Excel, Import, Löschen                                                                                                                      |

Die Methodik und alle Grenzwerte mit Quellen stehen in [docs/MEDIZIN.md](docs/MEDIZIN.md).

## Nutzung

### Auf dem Handy installieren

1. App-URL in Safari (iPhone) oder Chrome (Android) öffnen.
2. iPhone: Teilen → «Zum Home-Bildschirm». Android: Menü → «App installieren».
3. Profil anlegen. Danach läuft die App auch ohne Internet.

### Mahlzeiten erfassen (inspiriert von Foodvisor und PlateLens)

Unter «Heute» → «Erfassen mit KI» gibt es drei Wege:

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
  js/views/    Ansichten (Heute, Gewicht, Training, Gesundheit, Wissen, Profil)
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
- Netzwerkanfragen nur für Schriften (Google Fonts) und, wenn du sie nutzt, für die Foto-Erkennung an `api.anthropic.com` (Foto plus Resttagesziel, keine weiteren Gesundheitsdaten).

## Urheber

Alessandro Cortese
