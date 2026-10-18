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
| 13 | «Gesundheit» mobil sehr lang (rund 6150 px) | mittel | Noch nicht umgebaut; Vorschlag: Abschnitte einklappbar, Labor als eigene Unterseite | offen |

## Nicht automatisiert prüfbar

- Echte Antworten von Claude, GPT und Open Food Facts (Tests nutzen Attrappen; Anfrageformat ist gegen die SDK-Typen geprüft).
- Kalender-Erinnerungen (ICS) auf iOS, Bezeichnungen im iPhone-Kurzbefehl, echter Garmin-Export.
- Screenreader-Bedienung (VoiceOver/TalkBack) von Hand.
