# Produkt-Audit Oktober 2026

Ausgangsstand: Git-Tag `audit-ausgangsstand`. Gemessen mit Playwright (Pixel 7 und Desktop 1280 px), Beispieldaten.

## Befunde und Massnahmen

| # | Befund | Schwere | Massnahme | Status |
| - | ------ | ------- | --------- | ------ |
| 1 | «Heute» überladen: 4638 px Seitenlänge mobil, 37 Bedienelemente, Erfassung und Auswertung vermischt | hoch | Eigener Bereich «Ernährung»; Heute zeigt antippbare Kennzahlen, Schnellaktionen, max. 2 Hinweise (Rest einklappbar) | erledigt, getestet (3074 px) |
| 2 | 7 gleichrangige Tabs, mobil gedrängt | mittel | 5 Hauptbereiche, Wissen und Profil oben rechts; alte Adresse `#gewicht` leitet weiter | erledigt, getestet |
| 3 | Schriften von Google Fonts: IP-Adresse geht an Google (revDSG) | hoch | Schriften lokal (`app/fonts`, OFL), CSP ohne Fremdhosts | erledigt, getestet (0 externe Anfragen) |
| 4 | Kein Rückgängig nach Löschen oder Erfassen | mittel | Hinweis mit «Rückgängig» (5 s) für jede Änderung | erledigt, getestet |
| 5 | Begonnene Eingaben gingen bei jedem Neuzeichnen verloren | hoch | Ungespeicherte Felder werden wiederhergestellt, beim Datums- oder Seitenwechsel verworfen | erledigt, getestet |
| 6 | Mahlzeiten nur löschbar, nicht korrigierbar | mittel | Bearbeiten direkt in der Liste; weitere Nährwerte werden mitskaliert | erledigt, getestet |
| 7 | 11 Bedienelemente kleiner als 24 px (WCAG 2.2, 2.5.8) | mittel | Icon-Buttons 44 px | erledigt, getestet |
| 8 | Dringlichkeit nur über Farbe | mittel | Textlabel (Dringend, Wichtig, Tipp) | erledigt |
| 9 | Diagramm ohne Einheit und ohne aussagekräftige Textalternative | niedrig | Achse «kg», aria-label mit Zeitraum, Trend und Ziel | erledigt |
| 10 | Kontraste nur geschätzt | mittel | Automatischer Test: 21 Farbpaare ≥ 4.5:1 hell und dunkel | erledigt, getestet |
| 11 | Datenschutzhinweise verstreut | mittel | Abschnitt «Datenschutz und Hinweise» im Profil | erledigt |
| 12 | Doppelte Überschrift «Ernährung» | niedrig | Karte heisst «Tagesbilanz» | erledigt |
| 13 | «Gesundheit» mobil sehr lang (zuletzt 7598 px) | mittel | Bereiche einklappbar mit Status in der Kopfzeile, Zustand wird gemerkt (SCOFF ausgenommen): 1304 px | erledigt, getestet |

## Nicht automatisiert prüfbar

- Echte Antworten von Claude, GPT und Open Food Facts (Tests nutzen Attrappen; Anfrageformat ist gegen die SDK-Typen geprüft).
- Kalender-Erinnerungen (ICS) auf iOS, Bezeichnungen im iPhone-Kurzbefehl, echter Garmin-Export.
- Screenreader-Bedienung (VoiceOver/TalkBack) von Hand.

# Daten- und Dashboard-Audit (19.10.2026)

Vor der Arbeit gesichert: Git-Stand `61b7446`. Nutzerdaten werden beim Laden migriert, nie gelöscht (Schema 1 → 2, siehe unten).

## Befunde nach Priorität

| # | Prio | Befund | Massnahme | Status |
| - | ---- | ------ | --------- | ------ |
| D1 | P0 | Speicherfehler: Nach «Nicht gespeichert» erschien trotzdem die Erfolgsmeldung (überschrieb die Fehlermeldung) | `commit` meldet Erfolg nur nach erfolgreichem Speichern; roter Dauerhinweis «Letzte Änderung nicht gespeichert» | erledigt, getestet |
| D2 | P1 | Doppelte Mahlzeiten-IDs (z. B. Datei zweimal zusammenkopiert) wurden übernommen; Bearbeiten/Löschen hätte beide Einträge getroffen | Beim Laden/Import erhält eine doppelte ID eine neue ID und die Markierung `dupOf`; die App zeigt «Mögliche Doppelbuchung», löscht nichts | erledigt, getestet |
| D3 | P1 | Leeres Proteinfeld wurde als 0 g gespeichert | Feld leer = unbekannt (`proteinKnown: false`), Anzeige «? g Protein», Tagesstatus «Nährwerte unvollständig» | erledigt, getestet |
| D4 | P1 | Kalorienziel des Tages hing vom Verzehr desselben Tages ab (adaptiver Bedarf zählte den abgeschlossenen Tag selbst mit): jede Mahlzeit verschob das Ziel | Adaptiver Bedarf nur aus den 21 Tagen **davor** | erledigt |
| D5 | P1 | Bearbeiten: Kalorien geändert, Protein blieb stehen, Kohlenhydrate/Fett wurden skaliert (inkonsistent); Protein wurde auf ganze Gramm gerundet | Unverändertes Protein wird mitskaliert, geändertes gilt; Rundung auf 0.1 g; Menge (g) direkt änderbar, skaliert alle Werte | erledigt, getestet |
| D6 | P1 | Schnellwahl «Zuletzt gegessen» verlor Menge, Quelle und Nährwertherkunft | Übernimmt jetzt die komplette Portion (wie «Erneut erfassen») | erledigt |
| D7 | P1 | Doppeltipp auf Schnellwahl/Absenden legte zwei Einträge an | Gleiche Aktion innerhalb von 0.6 s wird ignoriert; Einträge haben Zeitstempel `at` | erledigt, getestet |
| D8 | P1 | «Vollständig» war ein reines Häkchen ohne Plausibilität | Tagesstatus mit festen Regeln (siehe unten), Warnung bei abgeschlossenen Tagen unter 50 % des Ziels | erledigt, getestet |
| D9 | P2 | Dashboard: fehlende Werte als «–», keine Makros, keine Schlaf-/Wasser-/Schrittekacheln, Kalorien «übrig» auch bei Überschreitung negativ | Kacheln mit Ist/Ziel/Einheit, «Noch nicht erfasst», «Über dem Ziel», Makro-Balken inkl. sichtbarer Überschreitung, Hinweis auf Untergrenzen und kcal-Abweichung | erledigt, getestet |
| D10 | P2 | Kein Verlauf für Kalorien, Protein, Schritte, Schlaf, Wasser, Training | Karte «Tageswerte» (7 Tage / 30 Tage / Alles), Lücken sichtbar, vorläufige Tage heller, Tabelle | erledigt, getestet |
| D11 | P2 | Mahlzeitenliste ohne Gruppierung | Gruppen Frühstück/Mittag/Zwischenmahlzeit/Abend mit Summe (ab zwei Gruppen) | erledigt |
| D12 | P3 | Kohlenhydrat-/Fett-Richtwerte rot bei geringer Überschreitung | Richtwerte erst ab +10 % als Überschreitung | erledigt |

## Regeln

**Erneut erfassen vs. Doppelbuchung**

- Jeder Verzehr ist ein Eintrag mit eigener ID (`id`) und Erfassungszeitpunkt (`at`, ISO, UTC). `time` ist die Essenszeit (HH:MM, Ortszeit), der Tag der Schlüssel `YYYY-MM-DD` in Ortszeit.
- «↻ Nochmal» kopiert Lebensmittel, Menge, Nährwerte und Quelle, nie die ID; `repeatOf` verweist auf das Original. Hunger und Auslöser gehören zum Essmoment und werden nicht kopiert.
- Mögliche Doppelbuchung (nur Markierung): gleiche ID beim Import (`dupOf`) oder gleicher Name, gleiche kcal, gleiches Protein, gleiche Menge und gleiche Uhrzeit innerhalb von 90 s, ohne `repeatOf`. «Beide behalten» setzt `keep`.
- Doppeltipp: dieselbe Aktion (gleiche Merkmale und gleiches `repeatOf`) innerhalb von 0.6 s wird nicht gespeichert.
- Import ersetzt den gesamten Stand (vorher automatische Sicherung). Zweimal dieselbe Datei importieren ergibt denselben Stand (idempotent). Garmin-Import übernimmt nur Aktivitäten mit neuer ID.

**Tagesstatus** (`domain/entries.js → dayStatus`)

- Erfassung: «Abgeschlossen» (Häkchen gesetzt), sonst «Vorläufig» (heute) bzw. «Nicht abgeschlossen» (Vortag). Nur abgeschlossene Tage zählen für den adaptiven Verbrauch und für Ø-Kalorien im Verlauf.
- Pflichtangabe: mindestens eine Mahlzeit.
- Nährwerte vollständig: jeder Eintrag hat Protein, Kohlenhydrate und Fett. Sonst «Nährwerte unvollständig (x von y)»; Summen sind Untergrenzen.
- Schätzungen: Einträge aus Foto oder Text werden ausgewiesen.
- Plausibilität: abgeschlossen, aber unter 50 % des Kalorienziels → «Ungewöhnlich wenig».

**Einheiten**: Gewicht kg, Grösse cm, Wasser intern ml (Anzeige l), Energie kcal, Koffein mg, Makros g, Salz g, Blutdruck mmHg, VO₂max ml/kg/min.

**Protein-Ziel**: g/kg × Referenzgewicht; Referenz = aktuelles Trendgewicht, höchstens bis zum grösseren Wert aus Zielgewicht und Gewicht bei BMI 25 (verhindert überhöhte Ziele bei Übergewicht).

## Schema-Migration

Schema 2 ergänzt optionale Felder je Mahlzeit: `at`, `repeatOf`, `dupOf`, `keep`, `proteinKnown`. Version-1-Daten und -Backups werden unverändert gelesen (ohne `at` keine zeitbasierte Doppelbuchungs-Prüfung). Ältere App-Versionen lehnen Schema-2-Backups mit einer klaren Meldung ab; deshalb alle Geräte aktualisieren (App neu öffnen).

## Tests (Pflichtszenarien)

| # | Szenario | Test | Ergebnis |
| - | -------- | ---- | -------- |
| 1 | Apfel dreimal, separate Einträge, korrekte Summe | unit `entries` 1/8, e2e `entries` 1/2/8 | bestanden |
| 2 | Erneut erfassen → neue eindeutige ID | unit 2, e2e 1/2/8 | bestanden |
| 3 | Legitime identische Einträge nicht zusammengeführt | unit 3, 3b; e2e 3 | bestanden |
| 4 | Doppelt importierter Datensatz erkannt | unit 4 | bestanden |
| 5 | Bearbeiten aktualisiert Tag und Dashboard | unit 5, e2e 5/6 | bestanden |
| 6 | Löschen rechnet neu | e2e 5/6 | bestanden |
| 7 | Unvollständige Nährwerte nicht als vollständig | unit 7, e2e 7/12 | bestanden |
| 8 | Tagesbilanz = Summe der Einzelwerte nach Wiederholungen | unit 1/8, e2e 1/2/8 | bestanden |
| 9 | Tageswechsel/Zeitzone | unit 9, e2e 9 (Uhr 23:58 → 00:01, Europe/Zurich) | bestanden |
| 10 | Fehlerhafter Import ändert nichts | unit 10, e2e 10 | bestanden |
| 11 | Export/Import erhält IDs und Nährwerte; Schema 1 lesbar | unit 11, e2e Backup | bestanden |
| 12 | Fehlende Daten «Noch nicht erfasst», nicht 0 | e2e 7/12 | bestanden |
| 13 | Dashboard iPhone und Desktop | alle E2E-Tests laufen auf Pixel 7 und Desktop 1280 px; kein horizontales Scrollen (app.spec) | bestanden |
| 14 | Doppelklick/Speicherfehler ohne Doppelbuchung | unit 14, e2e 14 | bestanden |

## Offen / bekannte Grenzen

- Doppelbuchungs-Erkennung ist bewusst konservativ: Zwei identische Einträge mehr als 90 s auseinander gelten als legitim.
- Einträge an Vortagen erhalten 12:00 (bzw. die Zeit des Originals) als Essenszeit; anpassbar über Bearbeiten.
- Protein aus Produkt-, Datenbank- und Foto-Erfassung wird auf ganze Gramm gerundet (Abweichung ≤ 0.5 g je Eintrag).
- Verlauf zeigt Körpermasse (Taille), Blutdruck, VO₂max und Laborwerte weiterhin im Bereich «Gesundheit», nicht in «Tageswerte».
- Diagramm-Tooltips nutzen die Browser-Standardanzeige (auf dem iPhone nur über die Tabelle sichtbar).
- Alle Daten bleiben im Browser: gegen Löschen der Website-Daten oder Gerätewechsel hilft nur die Backup-Datei.
