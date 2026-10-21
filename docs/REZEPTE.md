# Rezepte und Ernährungsplanung

Stand: 22.10.2026, Schema-Version 3.

## Ist-Zustand vor der Erweiterung

- Statische PWA (Vanilla-JavaScript-Module, JSDoc, `tsc --checkJs`), ausgeliefert über **GitHub Pages**.
- **Keine Datenbank, kein Server, kein Supabase, keine Authentifizierung.** Alle Daten liegen im `localStorage`
  des Geräts (`store.js`, Prüfung beim Laden und Import mit `sanitize`, Backup als JSON-Datei, automatische
  Sicherungen in `safety.js`).
- Vorhanden und wiederverwendet: Schweizer Nährwertdatenbank (`data/foods.js`, 1253 Lebensmittel),
  Nährwertberechnung (`domain/micros.js`), Lebensmittelpyramide (`domain/foodgroups.js`), Einträge mit
  Doppeltipp-Schutz (`domain/entries.js`, `store.addFood`), Tagesbilanz (`model.js`), 16 App-Rezepte
  (`data/recipes.js`).

Punkte des Auftrags, die auf dieser Architektur **nicht** zutreffen und deshalb nicht umgesetzt sind:
Datenbanktabellen und Migrationen in PostgreSQL, Row Level Security, serverseitige Validierung, API-Routen,
Geheimnisverwaltung auf dem Server, Deployment auf Vercel. Entsprechend gilt: Die Prüfung findet im Browser
statt (gleiche Regeln beim Laden, Importieren und Speichern), jede Person sieht nur die Daten ihres eigenen Geräts.

## Datenmodell (Schema 3)

Neue Felder im gespeicherten Zustand (ältere Daten werden ohne Änderung übernommen, die Sammlungen sind dann leer):

| Feld | Inhalt |
| ---- | ------ |
| `recipes` | eigene Rezepte, Referenzen, Importe (eingebaute Rezepte sind nicht gespeichert, sondern Teil der App) |
| `favorites`, `recentRecipes` | Rezept-IDs |
| `mealPlan` | `{ "JJJJ-MM-TT": [{ id, recipeId, slot, servings, entryId? }] }` |
| `shopping` | `{ weekStart, updatedAt, items: [{ id, key, label, amount, unit, category, checked, manual, edited?, planAmount?, stale? }] }` |
| Mahlzeit `planId`, Quelle `rezept` | Verknüpfung einer Protokoll-Mahlzeit mit der geplanten Mahlzeit |

Rezept: `id, title, description?, meals[], minutes?, servings, ingredients[{ foodKey, amount, unit, label, note? }],
steps[], veg?, allergens?, principles?, tip?, source{ kind, publisher?, url?, checkedAt?, rights }, createdAt, updatedAt`.

Herkunft (`source.kind`): `app` (eingebaut, eigene Texte), `eigen`, `referenz` (nur Titel und Link), `lizenz`,
`ki`. Rechte (`rights`) werden daraus abgeleitet: `eigen`, `nur-link`, `lizenziert`, `ungeprueft`.

Eine ältere App-Version lehnt Schema-3-Daten mit klarer Meldung ab, statt die Rezepte stillschweigend zu verwerfen.
Darum alle Geräte aktualisieren (App neu öffnen).

## Einheiten (`domain/units.js`)

| Einheit | Umrechnung in Gramm |
| ------- | ------------------- |
| g, kg | direkt |
| ml, l | nur mit hinterlegter Dichte (Milch 1.03, Öle 0.91–0.92, Bouillon, Saft, Kaffee); sonst nicht umgerechnet |
| Stück | nur, wenn die Datenbank-Portion ein Stück beschreibt («1 Ei» = 60 g, «4 Stück» Zwetschgen = 120 g) |
| EL, TL | nur, wenn die Datenbank-Portion in EL angegeben ist («1 EL Rapsöl» = 10 g); TL = EL / 3 |

Nicht umrechenbare Zutaten zählen nicht zu den Nährwerten. Das Rezept gilt dann als **teilweise berechnet**, die
Werte als Untergrenze; die fehlenden Zutaten werden mit Grund angezeigt.

## Nährwerte

Pro Portion und gesamt: Energie (kcal und kJ = kcal × 4.184), Eiweiss, Kohlenhydrate, Zucker, Fett, gesättigte
Fettsäuren, Ballaststoffe, Salz (aus Natrium × 2.5) und Mikronährstoffe, soweit die Datenbank sie führt.
Status: `berechnet` (alle Zutaten), `teilweise`, `nicht verfügbar` (z. B. Referenz ohne Zutaten).
Nicht berücksichtigt: Garverluste, essbarer Anteil (die Datenbank-Werte beziehen sich auf den verzehrbaren Teil
bzw. die angegebene Zubereitung), Salz zum Würzen.

Allergene werden aus den Zutaten abgeleitet (Milch, Ei, Fisch, Krebstiere, Schalenfrüchte, Erdnüsse, Gluten, Soja,
Sesam, Senf, Sellerie) und als «automatisch erkannt, ohne Gewähr» gekennzeichnet.

## Planung und Übernahme

- Geplant ist nicht gegessen: Die Tagesbilanz zählt nur Einträge im Protokoll.
- «Gegessen …» fragt die tatsächliche Portionenzahl ab und legt **einen** Eintrag an (`logPlanned`). Ein zweiter Versuch
  (Doppelklick, erneutes Absenden) findet die gespeicherte `entryId` und legt nichts an. «Weitere Portion …» erfasst
  bewusst einen zusätzlichen Eintrag. Wird der Eintrag im Protokoll gelöscht, gilt die Mahlzeit wieder als offen.
- Verschieben, Tauschen, Kopieren übernehmen keine Buchung mit.

## Einkaufsliste

Gleiche Lebensmittel werden addiert, wenn die Einheiten zur gleichen Familie gehören (Masse, Volumen, Stück, Löffel);
sonst stehen sie getrennt. Beim Abgleich mit einem geänderten Plan bleiben eigene Artikel immer, Häkchen bleiben, von
Hand geänderte Mengen bleiben (mit Hinweis auf den neuen Planwert); Artikel, die nicht mehr im Plan sind, fallen nur
weg, wenn sie unberührt waren. Ändert sich der Plan, zeigt die Liste einen Hinweis. Eigene Artikel werden nur nach
Rückfrage gelöscht.

## Import

**JSON** (Liste oder `{ "recipes": [...] }`):

```json
{
  "recipes": [
    {
      "title": "Linsen-Gemüse-Suppe",
      "servings": 4,
      "meals": ["mittag", "abend"],
      "minutes": 30,
      "ingredients": [
        { "foodKey": "linsen", "amount": 400, "unit": "g", "label": "Linsen, gekocht" },
        { "foodKey": "rueebli", "amount": 2, "unit": "Stück", "label": "Rüebli" },
        { "foodKey": null, "amount": null, "unit": "g", "label": "Salz, Pfeffer" }
      ],
      "steps": ["Gemüse schneiden", "Alles 20 Minuten kochen"],
      "source": { "kind": "eigen" }
    }
  ]
}
```

`foodKey` ist der Schlüssel aus `app/js/data/foods.js` (z. B. `ei`, `rapsoel`, `blv-356`). Erlaubte Einheiten:
`g, kg, ml, l, EL, TL, Stück`.

**CSV** für Referenzen (Semikolon oder Komma, Kopfzeile optional):

```
Titel;Link;Herausgeber;Mahlzeit;geprüft am
Rezeptname;https://www.ndr.de/...;NDR;Abendessen;2026-10-22
```

Regeln: Titel Pflicht; Referenzen brauchen einen https-Link; unbekannte Lebensmittel oder Einheiten, Duplikate
(gleiche ID wird umbenannt, gleicher Titel oder Link wird übersprungen) und fehlerhafte Zeilen werden mit Grund
gemeldet. Ein Import fügt nur hinzu; er überschreibt keine bestehenden Rezepte und berührt das Ernährungsprotokoll nicht.

## Quellen und Rechte

Die NDR-Sammlungen «Rezepte von den Ernährungs-Docs» und «Rezepte bei Fettleibigkeit» sind verlinkt. Die Seiten waren
aus der Entwicklungsumgebung nicht erreichbar (Netzwerkrichtlinie); es wurden **keine** NDR-Rezepte, Texte oder Bilder
übernommen und keine NDR-Rezepttitel erfunden. Einzelne NDR-Rezepte lassen sich als Referenz (Titel und Link) erfassen
oder per CSV importieren; die Zutaten kann man selbst eintragen, daraus entsteht ein eigenes Rezept mit Quellenlink.
Die 16 App-Rezepte sind eigene Texte; Nährwerte aus der Schweizer Nährwertdatenbank (BLV).

## Tests (tatsächlich ausgeführt am 22.10.2026)

| Prüfung | Ergebnis |
| ------- | -------- |
| Prettier (Format) | bestanden |
| `tsc --checkJs` (Typen) | bestanden |
| Unit-Tests (node:test), u. a. `planner.test.js`, `recipes.test.js` | 184 bestanden, 0 fehlgeschlagen |
| Ende-zu-Ende (Playwright, Pixel 7 und Desktop 1280 px), u. a. `recipes.spec.js` | 134 bestanden, 0 fehlgeschlagen |
| Produktions-Build | entfällt (kein Build-Schritt; die Dateien werden direkt ausgeliefert) |

Abdeckung der geforderten Szenarien: 1 Nährwerte aus Zutaten, 2 Portionen, 3 Einheiten, 4 fehlende Werte, 5 fehlerhafter
Import, 6 Plan speichern/laden, 7 Einkaufsliste, 8 Übernahme, 9 Doppelklick ohne Doppelbuchung, 10 bewusste weitere
Portion (alle unit und e2e); 11 Datenschutz: keine Netzwerk-Anfragen des Moduls (e2e), Daten nur lokal, keine
Mehrbenutzer-Rechte nötig; 12 mobil ohne horizontales Scrollen (e2e); 13 bestehende Dashboard-Tests laufen weiter.

## Bekannte Grenzen

- Keine Synchronisation zwischen Geräten (nur Backup/Import).
- Kein Drag-and-drop im Wochenplan; Verschieben und Tauschen über Auswahlfelder.
- Bilder für Rezepte sind nicht vorgesehen (keine Rechte an fremden Bildern, eigene Fotos würden den lokalen Speicher belasten).
- Dichte- und Stückgewichte nur für die Lebensmittel mit Datenbank-Portion bzw. Tabelle; alles andere bleibt unberechnet.

## Deployment

Push auf `main` → GitHub Pages veröffentlicht automatisch (`https://acortese-wq.github.io/Health/`). Der Service Worker
(`app/sw.js`, Version erhöhen) lädt die neuen Dateien beim nächsten Öffnen. Kein Vercel, keine Umgebungsvariablen,
keine Migration auf einem Server; die Datenmigration (Schema 2 → 3) läuft beim Laden im Browser.
