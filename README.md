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
| **Intervallfasten** | Optional im Profil (12:12, 14:10, 16:8): Karte auf Heute mit Fastenzeit, Countdown, Proteinplan im Fenster, Markierung von Mahlzeiten ausserhalb, Einordnung im Tagesrückblick. Einträge bis 50 kcal (Milch im Kaffee) zählen nicht als Mahlzeit |
| **Ernährung**   | **Mahlzeit fotografieren, beschreiben oder Packung scannen** (Claude oder GPT, Open Food Facts), **Lebensmittelsuche** in der **Schweizer Nährwertdatenbank des BLV** (über 1200 Lebensmittel mit Vitaminen, Mineralstoffen, Jod und Omega-3) und **Produktsuche Migros, Coop, Denner, Aldi, Lidl** (Open Food Facts, Etikettwerte inkl. Vitaminen, wo angegeben), Zuletzt gegessen, Schnellerfassung, Einträge direkt bearbeiten. **Nährstoffe** wie bei MyFitnessPal: Makro-Ring und Balken für 30 Nährstoffe mit % vom Tagesbedarf (D-A-CH), Tag oder 7-Tage-Schnitt. **Vorschlag fürs nächste Essen** (z. B. Vitamin C → Kiwi, B12 → Fisch) |
| **Ernährungsberatung** | **Lebensmittelpyramide** (SGE-Portionen Tag/Woche), **Essrhythmus** (Energie und Protein je Mahlzeit), **Heisshunger-Analyse** (Hunger und Grund pro Eintrag, Muster mit Schlaf, Protein, Koffein), **ganze Mahlzeiten** als Vorschlag (Teller-Modell, Pasta light, Kantine), NOVA-Markierung, Sporternährung, Warnung bei zu wenig Energie (RED-S), Kaffee und Eisen, Vitamin D im Winter, Diätpause, Vergessen-Check, Hand-Methode, SCOFF-Check (nicht gespeichert), **Bericht für die Ernährungsberatung** (Druck/PDF, Hinweis KLV Art. 9b) |
| **Zyklus (Frauen, freiwillig)** | Profil: natürlicher Zyklus, hormonelle Verhütung, Wechseljahre, schwanger, stillend. «Periode heute» auf Heute, Zyklustag und geschätzte Phase mit Tipps, Gewichtshinweis vor der Periode, Faktor in der Heisshunger-Analyse, **Warnung bei ausbleibender Periode** (> 90 Tage, RED-S). Schwangerschaft/Stillzeit: kein Defizit, kein Fasten, angepasste Nährstoffziele (Folat, Jod, B12, Eisen). Bleibt auf dem Gerät, nie an die KI; im Bericht nur auf Wunsch |
| **Blue Zones** | Gesundheit: Wochen-Check der «Power 9» (Bewegung, Pflanzenbetonung, Hülsenfrüchte automatisch gemessen; Sinn, Pausen, 80-%-Regel, Familie, Umfeld, Zugehörigkeit zum Abhaken), ehrliche Einordnung der umstrittenen Altersdaten, «Wein» bewusst nicht übernommen. Vier Blue-Zones-Mahlzeiten (Sardinien, Ikaria, Okinawa, Nicoya), bevorzugt bei wenig Hülsenfrüchten |
| **Fortschritt** | Robuster Trend (Theil-Sen und exponentielle Glättung), Planlinie, Zwischenziele, Prognose, **adaptiver Energiebedarf** aus den eigenen Daten |
| **Training**    | Laufplan (oder Lauf plus Kraft mit **doppelter Progression**), Wochenbilanz nach WHO, Garmin-CSV-Import, Lebenserwartung durch Bewegung |
| **Gesundheit**  | Blutdruck (ESC 2024), Taille, VO₂max, Laborwerte, **eGFR (CKD-EPI 2021)**, **FIB-4**, STOP-BANG, Schweizer Vorsorge |
| **Wissen**      | Aussagen mit Evidenzgrad und Originalquellen |
| **Profil**      | Ziele, KI-Anbieter, Backup (JSON), CSV-Export, Import, Löschen, Datenschutzhinweise |

Jede Änderung lässt sich 5 Sekunden lang über «Rückgängig» zurücknehmen. Begonnene, nicht gespeicherte Eingaben bleiben beim Neuzeichnen erhalten.

Die Methodik und alle Grenzwerte mit Quellen stehen in [docs/MEDIZIN.md](docs/MEDIZIN.md).

### Schnell erfassen und wiederholen

- **↻ Nochmal** bei jedem Eintrag erfasst dieselbe Portion mit einem Tipp erneut (neuer Eintrag, gleiche Menge und
  Nährwertquelle). Drei Äpfel = dreimal tippen; alle Portionen zählen.
- **±** erfasst dasselbe Lebensmittel mit anderer Menge (½, ¾, 1½, 2× oder Gramm), **✎** ändert den Eintrag selbst
  (Menge, Zeit, Werte), **×** löscht nur diesen Eintrag. Jede Änderung lässt sich 5 Sekunden rückgängig machen.
- Auf «Heute» wiederholt **«↻ … nochmal»** das zuletzt erfasste Lebensmittel.
- Ein Doppeltipp legt nichts doppelt an. Gleiche Einträge kurz hintereinander werden als «Mögliche Doppelbuchung»
  markiert (nie automatisch gelöscht). Regeln und Tagesstatus: [docs/AUDIT.md](docs/AUDIT.md).

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

Zusätzlich schützt die App den Tagesstand selbst:

- **Jede Eingabe wird sofort gespeichert.** Ist der Speicher voll, opfert die App zuerst ihre Sicherungen, nie die Hauptdaten;
  klappt das Speichern trotzdem nicht, erscheint eine Warnung.
- **Automatische Sicherungen** (Profil → Daten → «Automatische Sicherungen»): ein Tagesstand pro Tag (höchstens alle
  15 Minuten aktualisiert) sowie ein Stand vor jedem Import, Löschen oder Wiederherstellen; die letzten 7 bleiben erhalten
  und lassen sich mit einem Tipp zurückholen.
- **Halb ausgefüllte Felder** werden gesichert, wenn das Handy die App in den Hintergrund schickt oder beendet, und beim
  nächsten Öffnen wieder eingesetzt (gleiche Seite, gleicher Tag, höchstens 12 Stunden).
- **Unlesbare Daten** werden beiseitegelegt statt überschrieben; ein Hinweis erscheint.
- **Mehrere Fenster:** Änderungen in einem anderen Tab werden übernommen statt später überschrieben.
- **Mitternacht:** Bleibt die App offen, springt die Ansicht auf den neuen Tag; Einträge landen nie unbemerkt beim Vortag.
- **iPhone:** Safari kann Website-Daten nach 7 Tagen ohne Nutzung löschen, und Safari und Home-Bildschirm haben getrennte
  Speicher. Die App weist im Safari-Browser darauf hin: immer über das Symbol auf dem Home-Bildschirm öffnen.

Grenze: Alle Sicherungen liegen im selben Browser. Gegen das Löschen der Website-Daten, Geräteverlust oder Handywechsel hilft
nur die Backup-Datei; die App erinnert nach 7 Tagen ohne Backup daran.

## Deployment (GitHub Pages)

**Live:** https://acortese-wq.github.io/Health/app/ (Veröffentlichung über «Deploy from branch» bei jedem Push auf `main`; `_config.yml` schliesst persönliche Dateien aus).
Alternative: Source «GitHub Actions» und den push-Auslöser in `.github/workflows/pages.yml` aktivieren; dann wird nur `app/` veröffentlicht.


Hinweis: GitHub Pages ist für **private** Repositories nur mit einem kostenpflichtigen Plan (z. B. GitHub Pro) verfügbar.
Die veröffentlichte Seite ist öffentlich erreichbar, enthält aber keine Gesundheitsdaten: Diese liegen ausschliesslich
auf dem Gerät. Die Seite ist mit `noindex` markiert.

## Entwicklung

Nährwertdatenbank neu erzeugen (nach Änderungen an `scripts/foods-de.mjs` oder einer neuen BLV-Version in `daten/blv/`): `npm run foods`. Quellen: Schweizer Nährwertdatenbank (BLV, naehrwertdaten.ch) und ergänzend USDA SR28 (gemeinfrei, Paket `fda-nutrient-database`).


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
- Netzwerkanfragen nur, wenn du sie auslöst: Foto- oder Texterkennung an `api.anthropic.com` bzw. `api.openai.com` (Foto oder Text plus Resttagesziel), Barcode bzw. Suchbegriff und Händler an Open Food Facts.
- Ein automatischer Test prüft 21 Farbpaare auf WCAG-Kontrast ≥ 4.5:1 im hellen und dunklen Modus.

## Urheber

Alessandro Cortese
