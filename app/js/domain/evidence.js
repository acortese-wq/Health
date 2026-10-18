// @ts-check
// Wissensbasis mit Evidenzgrad. Nur Quellen, die nachprüfbar publiziert sind.

/** @typedef {'gut belegt' | 'wahrscheinlich sinnvoll' | 'unsicher' | 'unbelegt'} Level */
/** @typedef {{ id: string, topic: string, level: Level, claim: string, detail: string, refs: string[] }} Evidence */

export const LEVELS = /** @type {const} */ (['gut belegt', 'wahrscheinlich sinnvoll', 'unsicher', 'unbelegt']);

/** @type {Evidence[]} */
export const EVIDENCE = [
  {
    id: 'energy',
    topic: 'Ernährung',
    level: 'gut belegt',
    claim: 'Fettverlust entsteht durch ein Energiedefizit.',
    detail:
      'Bei gleicher Kalorien- und Proteinmenge spielt die Verteilung von Kohlenhydraten und Fett für den Gewichtsverlust kaum eine Rolle. Entscheidend ist die Diät, die du dauerhaft durchhältst. Der Körper passt seinen Verbrauch beim Abnehmen an. Deshalb kalibriert die App ihn laufend aus deinen Daten nach.',
    refs: ['Hall KD et al., Lancet 2011;378:826–837', 'Gardner CD et al. (DIETFITS), JAMA 2018;319:667–679'],
  },
  {
    id: 'protein',
    topic: 'Ernährung',
    level: 'gut belegt',
    claim: 'Etwa 1.6 g Protein pro kg Körpergewicht maximieren den Muskelaufbau durch Krafttraining.',
    detail:
      'Die Wirkung flacht oberhalb von 1.6 g/kg ab. Bis etwa 2.2 g/kg bringt mehr Protein noch einen kleinen Zusatznutzen. In einem Kaloriendefizit ist die obere Hälfte dieses Bereichs sinnvoll. Bei Übergewicht rechnet die App mit dem Zielgewicht statt mit dem aktuellen Gewicht. Protein sättigt zudem stärker als Kohlenhydrate und Fett.',
    refs: ['Morton RW et al., Br J Sports Med 2018;52:376–384'],
  },
  {
    id: 'tre',
    topic: 'Ernährung',
    level: 'gut belegt',
    claim: 'Intervallfasten (z. B. 16:8) wirkt über weniger Kalorien, nicht über eine besondere Stoffwechselwirkung.',
    detail:
      'In randomisierten Studien war ein Essensfenster bei gleicher Kalorienmenge nicht wirksamer als normale Kalorienreduktion. In einer 16:8-Studie ohne Kalorienvorgabe ging ein Teil des Gewichtsverlusts auf Muskulatur. Darum zeigt die App im Fenster einen Proteinplan. Sinnvoll ist das Fenster als Struktur, etwa gegen spätes Essen am Abend.',
    refs: ['Lowe DA et al., JAMA Intern Med 2020;180:1491–1499', 'Liu D et al., N Engl J Med 2022;386:1495–1504'],
  },
  {
    id: 'etre',
    topic: 'Ernährung',
    level: 'unsicher',
    claim: 'Ein frühes Essensfenster (z. B. bis 15 oder 17 Uhr) könnte Blutzucker und Blutdruck zusätzlich verbessern.',
    detail:
      'Kleine Studien fanden bei frühem Fenster eine bessere Insulinempfindlichkeit und einen tieferen Blutdruck, teils ohne Gewichtsverlust. Die Studien sind klein und kurz. Praktisch heisst das: Wenn du ein Fenster wählst, lieber früh enden als spät.',
    refs: ['Sutton EF et al., Cell Metab 2018;27:1212–1221', 'Jamshed H et al., JAMA Intern Med 2022;182:953–962'],
  },
  {
    id: 'breakfast',
    topic: 'Ernährung',
    level: 'unbelegt',
    claim: 'Frühstück «kurbelt den Stoffwechsel an».',
    detail:
      'In einer randomisierten Studie hatte das Frühstück keinen Einfluss auf den Ruheumsatz. Ob du frühstückst, ist Geschmackssache. Wichtig sind deine Gesamtkalorien und das Protein.',
    refs: ['Betts JA et al., Am J Clin Nutr 2014;100:539–547'],
  },
  {
    id: 'carbs-evening',
    topic: 'Ernährung',
    level: 'unbelegt',
    claim: '«Kohlenhydrate am Abend machen dick.»',
    detail:
      'Entscheidend ist die Energiebilanz über den ganzen Tag. Pasta am Abend ist kein Problem, wenn Portion und Gesamtkalorien stimmen.',
    refs: [],
  },
  {
    id: 'obesity-mortality',
    topic: 'Lebenserwartung',
    level: 'gut belegt',
    claim: 'Ein BMI von 30–35 verkürzt das Leben im Mittel um 2–4 Jahre, ein BMI von 40–45 um 8–10 Jahre.',
    detail:
      'Das zeigt eine Auswertung von rund 900 000 Erwachsenen aus 57 Studien. Verglichen wurde mit einem BMI von 22.5–25. Die App leitet daraus deine Spanne ab. Es handelt sich um Beobachtungsdaten: Wie viel davon man durch spätere Abnahme zurückgewinnt, ist weniger genau belegt.',
    refs: ['Prospective Studies Collaboration, Whitlock G et al., Lancet 2009;373:1083–1096'],
  },
  {
    id: 'activity-years',
    topic: 'Lebenserwartung',
    level: 'gut belegt',
    claim: 'Wer die WHO-Bewegungsempfehlung erfüllt, lebt im Mittel rund 3.4 Jahre länger als Inaktive.',
    detail:
      'Schon wenig Bewegung bringt etwa 1.8 Jahre. Beim Dreifachen der Empfehlung sind es rund 4.5 Jahre, danach flacht der Nutzen ab. Die Daten stammen aus sechs Kohorten mit über 650 000 Personen.',
    refs: ['Moore SC et al., PLoS Med 2012;9:e1001335'],
  },
  {
    id: 'lifestyle-years',
    topic: 'Lebenserwartung',
    level: 'gut belegt',
    claim: 'Fünf gesunde Gewohnheiten bringen Männern ab 50 rund 12 zusätzliche Lebensjahre und mehr Jahre ohne chronische Krankheit.',
    detail:
      'Die fünf Gewohnheiten: nicht rauchen, Normalgewicht, mindestens 30 Minuten Bewegung pro Tag, mässiger Alkoholkonsum, ausgewogene Ernährung. Mit 4–5 dieser Gewohnheiten bleiben Männer im Mittel rund 7–8 Jahre länger frei von Diabetes, Herz-Kreislauf-Erkrankung und Krebs.',
    refs: ['Li Y et al., Circulation 2018;138:345–355', 'Li Y et al., BMJ 2020;368:l6669'],
  },
  {
    id: 'diabetes-prevention',
    topic: 'Lebenserwartung',
    level: 'gut belegt',
    claim: '5–7 % Gewichtsabnahme plus 150 Minuten Bewegung pro Woche senken das Diabetesrisiko um 58 %.',
    detail:
      'Das zeigte eine randomisierte Studie mit Menschen mit Prädiabetes. Der Lebensstil wirkte dabei stärker als das Medikament Metformin.',
    refs: ['Knowler WC et al. (DPP), N Engl J Med 2002;346:393–403'],
  },
  {
    id: 'bp-weight',
    topic: 'Lebenserwartung',
    level: 'gut belegt',
    claim: 'Pro Kilogramm Gewichtsverlust sinkt der Blutdruck im Mittel um etwa 1 mmHg.',
    detail: 'Das ergab eine Metaanalyse randomisierter Studien. Bei 15 kg Abnahme kann das so viel ausmachen wie ein Blutdruckmedikament.',
    refs: ['Neter JE et al., Hypertension 2003;42:878–884'],
  },
  {
    id: 'cancer-weight',
    topic: 'Lebenserwartung',
    level: 'gut belegt',
    claim: 'Übergewicht erhöht das Risiko für mindestens 13 Krebsarten.',
    detail:
      'Darunter sind Darm-, Nieren-, Speiseröhren-, Bauchspeicheldrüsen- und Leberkrebs. Die Bewertung stammt von der Internationalen Agentur für Krebsforschung (IARC).',
    refs: ['Lauby-Secretan B et al., N Engl J Med 2016;375:794–798'],
  },
  {
    id: 'water',
    topic: 'Ernährung',
    level: 'gut belegt',
    claim: 'Männer brauchen etwa 2.5 Liter Wasser pro Tag, rund 2 Liter davon aus Getränken.',
    detail:
      'Der Rest stammt aus dem Essen. Bei Hitze, Sport und Schwitzen auf der Baustelle steigt der Bedarf deutlich. Die Farbe des Urins ist ein einfacher Alltagstest: hellgelb ist gut.',
    refs: ['EFSA NDA Panel, EFSA Journal 2010;8(3):1459'],
  },
  {
    id: 'water-preload',
    topic: 'Ernährung',
    level: 'wahrscheinlich sinnvoll',
    claim: 'Ein halber Liter Wasser vor den Hauptmahlzeiten kann das Abnehmen leicht unterstützen.',
    detail:
      'In randomisierten Studien nahmen Personen mit diesem Vorgehen etwas mehr ab als die Vergleichsgruppen. Der Effekt ist moderat und kein Ersatz für das Kaloriendefizit.',
    refs: ['Dennis EA et al., Obesity 2010;18:300–307', 'Parretti HM et al., Obesity 2015;23:1785–1791'],
  },
  {
    id: 'coffee-fluid',
    topic: 'Ernährung',
    level: 'unbelegt',
    claim: '«Kaffee entwässert und zählt nicht zur Trinkmenge.»',
    detail:
      'Bei moderatem Konsum hydriert Kaffee in einer kontrollierten Studie gleich gut wie Wasser. Er zählt also zur Trinkmenge. Für die Koffeingrenze gilt trotzdem das Koffeinziel.',
    refs: ['Killer SC et al., PLoS One 2014;9:e84154'],
  },
  {
    id: 'selfmonitoring',
    topic: 'Verhalten',
    level: 'gut belegt',
    claim: 'Regelmässiges Erfassen von Gewicht und Essen ist einer der stärksten Erfolgsfaktoren beim Abnehmen.',
    detail:
      'In der Forschung zeigt sich ein klarer Zusammenhang zwischen regelmässiger Selbstbeobachtung und Gewichtsverlust. Wichtig ist Beständigkeit, nicht Perfektion. Grobe Einträge sind besser als keine. Darauf baut der Rückblick-Coach.',
    refs: ['Burke LE et al., J Am Diet Assoc 2011;111:92–102'],
  },
  {
    id: 'strength',
    topic: 'Training',
    level: 'gut belegt',
    claim: 'Krafttraining beim Abnehmen schützt die Muskelmasse.',
    detail:
      'Bei älteren Menschen mit Adipositas verbesserte die Kombination aus Kraft- und Ausdauertraining während einer Diät die körperliche Funktion am stärksten. Es ging deutlich weniger Muskelmasse verloren als mit Ausdauertraining allein.',
    refs: ['Villareal DT et al., N Engl J Med 2017;376:1943–1955'],
  },
  {
    id: 'who',
    topic: 'Training',
    level: 'gut belegt',
    claim: 'Empfehlung: 150–300 Min. moderate oder 75–150 Min. intensive Ausdauer pro Woche und an mindestens 2 Tagen Krafttraining.',
    detail: 'Mehr Bewegung bringt zusätzlichen Nutzen. Die App zählt intensive Minuten doppelt.',
    refs: ['Bull FC et al., Br J Sports Med 2020;54:1451–1462 (WHO)'],
  },
  {
    id: 'vo2',
    topic: 'Training',
    level: 'gut belegt',
    claim: 'Die Ausdauerleistungsfähigkeit (VO₂max) gehört zu den stärksten Prädiktoren der Sterblichkeit.',
    detail:
      'In Beobachtungsdaten war eine höhere Fitness mit geringerer Sterblichkeit verbunden, ohne erkennbare Obergrenze. Intervalle wie 4 × 4 Minuten steigern die VO₂max wirksam. Der Garmin-Wert ist eine Schätzung. Beachte deshalb den Verlauf, nicht den einzelnen Wert.',
    refs: ['Mandsager K et al., JAMA Netw Open 2018;1:e183605'],
  },
  {
    id: 'steps',
    topic: 'Training',
    level: 'gut belegt',
    claim: 'Mehr Schritte senken die Sterblichkeit. Der Nutzen flacht bei 8000–10 000 Schritten (unter 60 Jahren) ab.',
    detail: 'Ab 60 Jahren liegt die Abflachung bei etwa 6000–8000 Schritten. Das Gehtempo spielt dabei eine geringere Rolle als die Menge.',
    refs: ['Paluch AE et al., Lancet Public Health 2022;7:e219–e228'],
  },
  {
    id: 'sleep',
    topic: 'Schlaf',
    level: 'gut belegt',
    claim: 'Erwachsene brauchen regelmässig mindestens 7 Stunden Schlaf.',
    detail: 'Teilweiser Schlafentzug erhöhte in Studien die Energiezufuhr am Folgetag um mehrere hundert Kilokalorien.',
    refs: ['Watson NF et al., Sleep 2015;38:843–844 (AASM/SRS)', 'Al Khatib HK et al., Eur J Clin Nutr 2017;71:614–624'],
  },
  {
    id: 'caffeine',
    topic: 'Schlaf',
    level: 'gut belegt',
    claim: 'Koffein stört den Schlaf noch viele Stunden nach dem Konsum.',
    detail:
      'Schon 400 mg 6 Stunden vor dem Schlafen verkürzten den Schlaf messbar. Laut einer Metaanalyse sollte eine Tasse Kaffee mindestens etwa 8–9 Stunden vor dem Zubettgehen getrunken werden. Für gesunde Erwachsene gelten höchstens 400 mg pro Tag als unbedenklich.',
    refs: [
      'Drake C et al., J Clin Sleep Med 2013;9:1195–1200',
      'Gardiner C et al., Sleep Med Rev 2023;69:101764',
      'EFSA Journal 2015;13(5):4102',
    ],
  },
  {
    id: 'bp',
    topic: 'Prävention',
    level: 'gut belegt',
    claim: 'Heim-Blutdruck: erhöht ab 120/70, Hypertonie ab 135/85 mmHg.',
    detail:
      'Für die Beurteilung zählt der Mittelwert einer Messserie über 7 Tage, morgens und abends jeweils 2 Messungen, nicht ein Einzelwert. Gewichtsabnahme senkt den Blutdruck messbar.',
    refs: ['McEvoy JW et al., ESC-Leitlinie 2024, Eur Heart J 2024;45:3912–4018'],
  },
  {
    id: 'lpa',
    topic: 'Prävention',
    level: 'gut belegt',
    claim: 'Lipoprotein(a) einmal im Leben messen.',
    detail:
      'Der Wert ist genetisch festgelegt und durch den Lebensstil kaum veränderbar. Ein erhöhter Wert ist ein eigenständiger Risikofaktor für Herz-Kreislauf-Erkrankungen. Er ist ein Grund, die übrigen Risikofaktoren besonders konsequent zu senken.',
    refs: ['Kronenberg F et al., Eur Heart J 2022;43:3925–3946'],
  },
  {
    id: 'apob',
    topic: 'Prävention',
    level: 'wahrscheinlich sinnvoll',
    claim: 'ApoB beschreibt das atherogene Risiko genauer als LDL allein.',
    detail:
      'Das gilt besonders bei erhöhten Triglyceriden, Übergewicht oder Diabetes. Die ESC empfiehlt ApoB als Alternative zum LDL-Wert.',
    refs: ['Mach F et al., Eur Heart J 2020;41:111–188'],
  },
  {
    id: 'masld',
    topic: 'Prävention',
    level: 'gut belegt',
    claim: 'Bei Übergewicht ist eine Fettleber häufig. Der FIB-4-Index ist der empfohlene erste Test.',
    detail:
      'Der FIB-4-Index wird aus Alter, AST, ALT und Thrombozyten berechnet. Eine Gewichtsabnahme von 7–10 % bessert die Fettleber deutlich.',
    refs: ['EASL-EASD-EASO-Leitlinie MASLD, J Hepatol 2024', 'Sterling RK et al., Hepatology 2006;43:1317–1325'],
  },
  {
    id: 'osa',
    topic: 'Prävention',
    level: 'gut belegt',
    claim: 'Schlafapnoe ist bei Männern mit Übergewicht häufig und oft unerkannt.',
    detail: 'Der STOP-BANG-Fragebogen ist ein validiertes Screening. Ab 3 Punkten lohnt sich ein Gespräch mit dem Hausarzt.',
    refs: ['Chung F et al., Anesthesiology 2008;108:812–821'],
  },
  {
    id: 'glp1',
    topic: 'Medikamente',
    level: 'gut belegt',
    claim: 'GLP-1-Medikamente (z. B. Semaglutid) bewirken einen deutlichen Gewichtsverlust.',
    detail:
      'Sie sind eine ärztliche Option bei Adipositas und kein Lifestyle-Produkt. Ohne Krafttraining und genügend Protein geht dabei ein relevanter Teil der Abnahme auf Kosten der Muskeln. Indikation und Kostenübernahme klärt der Hausarzt.',
    refs: ['Wilding JPH et al. (STEP 1), N Engl J Med 2021;384:989–1002'],
  },
  {
    id: 'vitd',
    topic: 'Supplemente',
    level: 'unbelegt',
    claim: 'Vitamin D als Vorbeugung gegen Herz-Kreislauf-Erkrankungen oder Krebs bei Gesunden.',
    detail: 'In einer grossen randomisierten Studie zeigte sich kein Nutzen. Supplementieren solltest du bei nachgewiesenem Mangel.',
    refs: ['Manson JE et al. (VITAL), N Engl J Med 2019;380:33–44'],
  },
  {
    id: 'creatine',
    topic: 'Supplemente',
    level: 'wahrscheinlich sinnvoll',
    claim: 'Kreatin (3–5 g pro Tag) unterstützt Kraft und Muskelaufbau beim Krafttraining.',
    detail:
      'Kreatin ist gut untersucht und sicher bei gesunden Nieren. Es ist optional, kein Muss. Die Waage zeigt anfangs etwa 1 kg mehr, das ist Wasser im Muskel.',
    refs: ['Kreider RB et al., J Int Soc Sports Nutr 2017;14:18'],
  },
  {
    id: 'fatburner',
    topic: 'Supplemente',
    level: 'unbelegt',
    claim: 'Fatburner, Detox-Kuren und Stoffwechsel-Booster.',
    detail: 'Für keines dieser Produkte ist ein relevanter Effekt auf den Fettverlust belegt. Spar dir das Geld.',
    refs: [],
  },
  {
    id: 'hrv',
    topic: 'Schlaf',
    level: 'unsicher',
    claim: 'Wearable-Werte wie HRV und «Body Battery» als Trainingssteuerung.',
    detail:
      'Diese Werte eignen sich, um Trends zu erkennen, etwa einen Infekt oder Übertraining. Einzelne Tageswerte schwanken stark. Ein Ruhepuls, der mehrere Tage lang deutlich erhöht ist, ist das robustere Signal.',
    refs: [],
  },
  {
    id: 'pyramid',
    topic: 'Ernährung',
    level: 'gut belegt',
    claim: 'Eine Ernährung nach der Schweizer Lebensmittelpyramide deckt den Nährstoffbedarf ohne Präparate weitgehend.',
    detail:
      'Täglich 5 Portionen Gemüse und Früchte, 3 Portionen Getreide/Kartoffeln (die Hälfte Vollkorn), 3 Portionen Milchprodukte, 1 Portion Proteinlieferant, 20–30 g Nüsse; Fisch 1–2 Mal pro Woche, Fleisch massvoll. Die App zählt diese Portionen automatisch.',
    refs: ['Schweizerische Gesellschaft für Ernährung (SGE): Schweizer Lebensmittelpyramide'],
  },
  {
    id: 'protein-meal',
    topic: 'Ernährung',
    level: 'wahrscheinlich sinnvoll',
    claim: 'Protein auf die Mahlzeiten verteilt (je ca. 0.4 g/kg) und ein proteinreicher Tagesbeginn helfen gegen Heisshunger am Abend.',
    detail:
      'Pro Mahlzeit etwa 25–40 g Protein nutzen die Muskeln am besten. Eine proteinreiche erste Tageshälfte sättigt stärker und reduziert in Studien das Snacken am Abend.',
    refs: ['Schoenfeld BJ, Aragon AA, J Int Soc Sports Nutr 2018;15:10', 'Leidy HJ et al., Am J Clin Nutr 2015;101:1320S–1329S'],
  },
  {
    id: 'upf',
    topic: 'Ernährung',
    level: 'gut belegt',
    claim: 'Mit stark verarbeiteten Lebensmitteln wird spontan mehr gegessen.',
    detail:
      'In einer kontrollierten Stoffwechselstudie assen dieselben Personen bei stark verarbeiteter Kost rund 500 kcal pro Tag mehr und nahmen zu, bei gleich angebotenen Nährstoffen. Die App markiert Produkte mit NOVA-Gruppe 4.',
    refs: ['Hall KD et al., Cell Metab 2019;30:67–77'],
  },
  {
    id: 'coffee-iron',
    topic: 'Ernährung',
    level: 'gut belegt',
    claim: 'Kaffee zur Mahlzeit senkt die Eisenaufnahme deutlich.',
    detail:
      'In Studien sank die Aufnahme von Eisen aus einer Mahlzeit mit Kaffee um rund 40 %. Abstand von 1 Stunde und Vitamin C zum Essen verbessern die Aufnahme.',
    refs: ['Morck TA et al., Am J Clin Nutr 1983;37:416–420', 'Hallberg L et al., Am J Clin Nutr 1989;49:140–144'],
  },
  {
    id: 'vitamin-d-ch',
    topic: 'Supplemente',
    level: 'wahrscheinlich sinnvoll',
    claim: 'Im Winterhalbjahr ist Vitamin D in der Schweiz über Sonne und Essen kaum zu decken.',
    detail:
      'Das BAG empfiehlt Erwachsenen 15 µg (600 IE) Vitamin D pro Tag, ab 60 Jahren 20 µg (800 IE). Ein Präparat mit der Ärztin oder dem Arzt besprechen.',
    refs: ['BAG / Eidgenössische Ernährungskommission: Vitamin D-Mangel, Bericht 2012'],
  },
  {
    id: 'diet-break',
    topic: 'Ernährung',
    level: 'unsicher',
    claim: 'Geplante Diätpausen von 1–2 Wochen können das Abnehmen langfristig erleichtern.',
    detail:
      'In einer kleinen Studie verloren Männer mit Pausen auf Erhaltung mehr Fett und hielten das Gewicht besser. Andere Studien zeigen keinen Vorteil, aber auch keinen Nachteil. Sinnvoll vor allem gegen Diätmüdigkeit.',
    refs: ['Byrne NM et al., Int J Obes 2018;42:129–138'],
  },
  {
    id: 'dietitian',
    topic: 'Verhalten',
    level: 'gut belegt',
    claim: 'Professionelle Ernährungsberatung verbessert den Abnehmerfolg.',
    detail:
      'Strukturierte Beratung mit Verhaltensansätzen wirkt besser als Abnehmen allein. In der Schweiz übernimmt die Grundversicherung Ernährungsberatung durch anerkannte Fachpersonen (SVDE) bei Adipositas auf ärztliche Verordnung (KLV Art. 9b). Die App erstellt dafür einen Bericht (Profil).',
    refs: ['Krankenpflege-Leistungsverordnung (KLV) Art. 9b', 'Williams LT et al., Healthcare (Basel) 2019;7:20'],
  },
];
