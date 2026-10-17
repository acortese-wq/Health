# Medizinische Methodik

Dieses Dokument beschreibt jede Berechnung und jeden Grenzwert der App mit Quelle. Jede Formel ist in
`tests/unit/` mit Referenzwerten abgesichert.

## Energie und Gewicht

| Thema               | Umsetzung                                                                                                                                                                                                                                    | Quelle                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Grundumsatz         | Mifflin-St Jeor: 10 × kg + 6.25 × cm − 5 × Alter + 5 (Männer) bzw. − 161 (Frauen)                                                                                                                                                            | Mifflin MD et al., Am J Clin Nutr 1990;51:241–247                            |
| Startbedarf         | Grundumsatz × Aktivitätsfaktor (1.2–1.725). Genauigkeit ca. ±10–15 %                                                                                                                                                                         | –                                                                            |
| Adaptiver Bedarf    | Mittlere Zufuhr der vollständig erfassten Tage (mind. 10 in 21 Tagen) − Trendsteigung × 7700 kcal/kg. Unplausible Werte (< 1200 oder > 5000 kcal) werden verworfen.                                                                            | Energiebilanz nach Hall KD et al., Lancet 2011;378:826–837                   |
| Gewichtstrend       | Steigung: Theil-Sen-Schätzer (Median der paarweisen Steigungen) über 21 Tage, mind. 7 Messungen über ≥ 10 Tage. Anzeige: exponentielle Glättung (α = 0.15).                                                                                    | Robuste Statistik; unempfindlich gegen Wasserschwankungen                    |
| Abnahmetempo        | Benötigtes Tempo bis zum Zieldatum, begrenzt auf **1 % des Körpergewichts pro Woche** und ein Defizit von **höchstens 750 kcal oder 25 % des Bedarfs**                                                                                         | Jensen MD et al., AHA/ACC/TOS-Leitlinie, Circulation 2014;129:S102–S138      |
| Untergrenze         | 1500 kcal (Männer) bzw. 1200 kcal (Frauen) ohne ärztliche Begleitung                                                                                                                                                                          | Jensen MD et al. 2014                                                        |
| Protein             | 1.9 g/kg (einstellbar 1.2–2.4) bezogen auf ein **Referenzgewicht**: Zielgewicht, mindestens Gewicht bei BMI 25, höchstens aktuelles Gewicht. Anzeige des Bereichs 1.6–2.2 g/kg                                                                 | Morton RW et al., Br J Sports Med 2018;52:376–384                            |
| Warnung zu schnell  | Trendverlust > 1.2 % pro Woche                                                                                                                                                                                                               | Muskelverlust, Gallensteinrisiko bei schneller Abnahme                       |

## Koffein

- Restmenge: Einkompartiment-Modell, Halbwertszeit einstellbar (Standard 5 h, typisch 3–7 h). Vollständige Aufnahme wird angenommen.
- Grenzzeit: Standard 8 h vor der Schlafenszeit (Gardiner C et al., Sleep Med Rev 2023;69:101764; Drake C et al., J Clin Sleep Med 2013;9:1195–1200).
- Obergrenze 400 mg pro Tag, 200 mg pro Einzeldosis (EFSA Journal 2015;13(5):4102).
- Ausschleichen: eine Tasse weniger pro Woche, um Entzugskopfschmerzen zu vermeiden.

## Training

- WHO 2020: 150–300 Min. moderat oder 75–150 Min. intensiv pro Woche, an ≥ 2 Tagen Kraft (Bull FC et al., Br J Sports Med 2020;54:1451–1462). Intensive Minuten (Intervalle) zählen doppelt. Lockere Läufe in Zone 2 zählen nach relativer Intensität als moderat (konservativ).
- Doppelte Progression: Alle Sätze am oberen Ende des Wiederholungsbereichs → Gewicht erhöhen (2.5 bzw. 5 kg). Zweimal in Folge unter dem Bereich → 10 % reduzieren.
- Kraft- plus Ausdauertraining beim Abnehmen: Villareal DT et al., N Engl J Med 2017;376:1943–1955.

## Klinische Einordnung

| Wert                  | Grenzwerte                                                                                                       | Quelle                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| BMI                   | WHO: < 18.5 / 18.5–24.9 / 25–29.9 / 30–34.9 / 35–39.9 / ≥ 40                                                      | WHO                                                      |
| Taille                | Männer ≥ 94 cm erhöht, ≥ 102 cm stark erhöht; Frauen ≥ 80 / ≥ 88 cm                                              | WHO 2008 / IDF                                           |
| Taille / Grösse       | 0.4–0.49 gesund, 0.5–0.59 erhöht, ≥ 0.6 hoch                                                                     | NICE, Leitlinie Adipositas (Update 2022)                 |
| Blutdruck Heim        | < 120/70 nicht erhöht, 120–134/70–84 erhöht, ≥ 135/85 Hypertonie; Mittel einer 7-Tage-Serie, verlässlich ab 12 Messungen | McEvoy JW et al., ESC 2024, Eur Heart J 2024;45:3912–4018 |
| Blutdruck Praxis      | ≥ 140/90 Hypertonie                                                                                              | ESC 2024                                                 |
| Blutdruck ≥ 180/110   | Nachmessen, gleichentags ärztlich abklären; bei Symptomen 144                                                     | ESC 2024                                                 |
| HbA1c                 | < 5.7 % normal, 5.7–6.4 % Prädiabetes, ≥ 6.5 % Diabetes-Bereich (mmol/mol wird umgerechnet)                        | ADA Standards of Care 2025                               |
| Nüchternglukose       | < 5.6 / 5.6–6.9 / ≥ 7.0 mmol/l                                                                                   | ADA 2025                                                 |
| LDL                   | Ziele risikoabhängig (< 3.0 / 2.6 / 1.8 / 1.4 mmol/l); ≥ 4.9 mmol/l → familiäre Hypercholesterinämie abklären       | Mach F et al., ESC/EAS 2019, Eur Heart J 2020;41:111–188 |
| ApoB                  | Ziele < 1.0 / 0.8 / 0.65 g/l je nach Risiko                                                                      | ESC/EAS 2019                                             |
| HDL                   | Niedrig: Männer < 1.0, Frauen < 1.2 mmol/l                                                                       | ESC/EAS 2019                                             |
| Triglyceride          | ≥ 1.7 erhöht, ≥ 10 mmol/l Pankreatitisrisiko                                                                     | ESC/EAS 2019                                             |
| Lp(a)                 | < 75 / 75–125 / > 125 / > 430 nmol/l bzw. < 30 / 30–50 / > 50 / > 180 mg/dl; keine Umrechnung zwischen Einheiten  | Kronenberg F et al., EAS 2022, Eur Heart J 2022;43:3925–3946 |
| eGFR                  | CKD-EPI 2021 ohne Ethnie-Koeffizient, Kreatinin µmol/l ÷ 88.42; KDIGO-Stadien G1–G5                               | Inker LA et al., N Engl J Med 2021;385:1737–1749         |
| FIB-4                 | Alter × AST / (Thrombozyten × √ALT); < 1.3 (ab 65: < 2.0) niedrig, > 2.67 erhöht; Werte max. 30 Tage auseinander  | Sterling RK et al., Hepatology 2006; EASL-EASD-EASO 2024 |
| Vitamin D             | < 30 Mangel, 30–49 möglicherweise unzureichend, ≥ 50 nmol/l ausreichend                                          | Ross AC et al., JCEM 2011;96:53–58                       |
| STOP-BANG             | 0–2 niedrig, 3–4 mittel, ≥ 5 hoch                                                                                | Chung F et al., Anesthesiology 2008;108:812–821          |
| TSH, PSA, ALT, AST    | Keine automatische Bewertung (laborabhängig bzw. nur ärztlich sinnvoll)                                          | –                                                        |

## Vorsorge (Schweiz)

Blutdruck ab 40 jährlich (ESC 2024) · Lipide/AGLA-Risiko ab 40 alle 5 Jahre · Lp(a) einmal im Leben (EAS 2022) ·
HbA1c ab 35 alle 3 Jahre (ADA) · Darmkrebs 50–69: FIT alle 2 Jahre oder Koloskopie alle 10 Jahre (OKP) ·
PSA 50–69 nur nach Aufklärung · dT mit 25/45/65 · Gürtelrose und Grippe ab 65 (Schweizerischer Impfplan, BAG).

## Bewusste Grenzen

- Die 7700 kcal/kg sind eine Näherung. Der adaptive Bedarf gleicht diesen Fehler aus, weil er auf der tatsächlichen Gewichtsentwicklung beruht.
- Das Koffeinmodell ignoriert die Aufnahmezeit (Spitze nach ca. 45 Min.) und individuelle Faktoren (Rauchen, Medikamente, Genetik).
- Wearable-Werte (VO₂max, Ruhepuls) sind Schätzungen. Die App bewertet Trends, keine Einzelwerte.
- Die App stellt keine Diagnosen und ersetzt keine Risikoberechnung durch den Hausarzt (z. B. AGLA-Score).
