// @ts-check
// Lust auf ein bestimmtes Essen, das man zuhause weiss (z. B. Kuchen im Kühlschrank): Erklärung und
// Strategien mit Anleitung. Quellen wurden am 14.11.2026 geprüft; «Beweislage» ist eine Einordnung
// (stark = Meta-Analyse/mehrere Studien, mittel = einzelne kontrollierte Studien, vorläufig =
// einzelner Befund oder widersprüchliche Wiederholungen).

/**
 * @typedef {{ title: string, text: string, ref: string }} Explanation
 * @typedef {{ id: string, title: string, steps: string[], why: string, ref: string, strength: 'stark' | 'mittel' | 'vorläufig', link?: { href: string, label: string } }} Strategy
 */

/** Was gerade passiert. */
export const EXPLAIN = /** @type {Explanation[]} */ ([
  {
    title: 'Das Bild im Kopf macht die Lust',
    text: 'Du weisst, dass der Kuchen da ist, und stellst dir Geschmack, Geruch und das Gefühl im Mund vor. Je lebhafter dieses innere Bild, desto stärker das Verlangen. In einer Studie hing die Stärke des Verlangens deutlich mit der Lebhaftigkeit der Vorstellung zusammen.',
    ref: 'Tiggemann M, Kemps E, Appetite 2005;45:305–313; Kavanagh DJ et al., Psychol Rev 2005;112:446–467',
  },
  {
    title: 'Der Körper bereitet sich schon vor',
    text: 'Schon der Gedanke an Essen kann Speichelfluss und Verdauungssignale auslösen («kephale Phase»). Das ist das Gefühl im Mund, das du kennst. Es ist eine erlernte Vorbereitung, kein Zeichen, dass du Energie brauchst.',
    ref: 'Power ML, Schulkin J, Appetite 2008;50:194–206',
  },
  {
    title: 'Erlernte Signale sagen Essen voraus',
    text: 'Reize wie der Gedanke an den Kühlschrank lösen eine Reaktion aus, die das Essen tatsächlich wahrscheinlicher macht. Eine Meta-Analyse zeigt: Wer stark auf solche Reize reagiert, isst mehr und nimmt eher zu. Darum hilft es, den Reiz zu entschärfen, statt nur auf Willenskraft zu setzen.',
    ref: 'Boswell RG, Kober H, Obes Rev 2016;17:159–177',
  },
  {
    title: 'Verbieten macht es lauter',
    text: 'Wer sich sagt «Ich darf nicht an den Kuchen denken», denkt oft erst recht daran. Annehmen und mit Abstand beobachten wirkt besser als Unterdrücken.',
    ref: 'Wegner DM et al., J Pers Soc Psychol 1987;53:5–13; Hooper N et al., Eat Behav 2012;13:62–64',
  },
  {
    title: 'Es wird mit der Zeit leiser',
    text: 'Bei Menschen, die über Wochen weniger essen, nehmen Heisshunger auf Süsses, Fettiges und Fast Food im Schnitt ab. Das Gehirn verlernt die Verknüpfung, wenn sie seltener bestätigt wird. Dranbleiben lohnt sich also.',
    ref: 'Kahathuduwa CN et al., Obes Rev 2017;18:1122–1135',
  },
]);

/** Strategien, in sinnvoller Reihenfolge. */
export const STRATEGIES = /** @type {Strategy[]} */ ([
  {
    id: 'weg',
    title: 'Aus den Augen, aus der Reichweite',
    steps: [
      'Pack den Kuchen in eine undurchsichtige Dose.',
      'Stell sie ganz nach hinten oder in ein oberes Fach, wo du sie nicht siehst.',
      'Noch besser: Schneide einzelne Stücke ab und friere sie ein. Ein gefrorenes Stück isst niemand spontan.',
      'Geh danach aus der Küche in einen anderen Raum.',
    ],
    why: 'Eine Cochrane-Übersicht fand: Essen, das weiter weg steht, wird deutlich weniger gegessen (mittlerer Effekt; die Autoren stufen die Sicherheit der Evidenz als niedrig ein).',
    ref: 'Hollands GJ et al., Cochrane Database Syst Rev 2019;CD012573',
    strength: 'mittel',
  },
  {
    id: 'spaeter',
    title: '«Später, irgendwann» statt «Nie»',
    steps: [
      'Sag dir bewusst: «Ich kann den Kuchen später essen, irgendwann.»',
      'Leg keinen genauen Zeitpunkt fest. Genau das Unbestimmte macht es wirksam.',
      'Vermeide ein striktes Verbot wie «Ich darf nie wieder Kuchen essen».',
    ],
    why: 'In vier Experimenten senkte unbestimmtes Aufschieben das Verlangen und den Konsum in der folgenden Woche, ein festes Datum dagegen nicht. In einem Versuch assen Teilnehmende mit «später» im Schnitt rund 1-mal Schokolade in der Woche, mit Verbot rund 4.5-mal.',
    ref: 'Mead NL, Patrick VM, J Pers Soc Psychol 2016;110:20–35',
    strength: 'mittel',
  },
  {
    id: 'bild',
    title: 'Das innere Bild stören',
    steps: [
      'Nimm das Handy und spiel 3 Minuten ein Spiel, bei dem du Formen drehen und einordnen musst, z. B. Tetris.',
      'Alternativ: Stell dir einen Ort sehr genau vor, z. B. deinen letzten Ferienort, mit Farben, Geräuschen und Temperatur.',
      'Danach Verlangen von 1 bis 10 bewerten. Meist ist es schwächer und das Bild blasser.',
    ],
    why: 'Bilder im Kopf brauchen Platz im Arbeitsgedächtnis. Wer es mit einer anderen bildhaften Aufgabe füllt, schwächt das Bild vom Essen. Nach 3 Minuten Tetris waren Verlangen und Lebhaftigkeit des inneren Bildes deutlich geringer.',
    ref: 'Skorka-Brown J, Andrade J, May J, Appetite 2014;76:161–165',
    strength: 'mittel',
  },
  {
    id: 'umdenken',
    title: 'Umdenken: an das Später denken',
    steps: [
      'Stell dir vor, wie du dich in einer Stunde fühlst, wenn du jetzt den Kuchen isst. Und wie, wenn nicht.',
      'Denk an die langfristigen Folgen: dein Ziel, dein Gewichtstrend, wie du dich morgen früh fühlen willst.',
      'Oder nimm Abstand: Betrachte den Kuchen wie eine neutrale Fremde, die ihn im Laden sieht.',
    ],
    why: 'Eine kurze Schulung in solchen Denkstrategien verbesserte in sechs Studien mit über 1500 Personen die Essenswahl und senkte in einer Studie die gegessene Menge um rund 100 kcal.',
    ref: 'Boswell RG, Sun W, Suzuki S, Kober H, PNAS 2018;115:E11238–E11247',
    strength: 'mittel',
  },
  {
    id: 'annehmen',
    title: 'Den Gedanken annehmen statt wegdrücken',
    steps: [
      'Sag innerlich: «Ich habe den Gedanken, dass ich Kuchen will.»',
      'Lass den Gedanken da sein, ohne mit ihm zu streiten und ohne ihm zu folgen.',
      'Beschreibe das Gefühl im Mund neugierig: Wie fühlt es sich an? Verändert es sich?',
      'Mehr dazu in der Übung «Gedanken als Wolken».',
    ],
    why: 'Wer Gedanken mit Abstand betrachtete (Defusion), ass im Geschmackstest weniger Schokolade als wer sie unterdrückte. Über die ganze Woche war der Unterschied allerdings nicht mehr messbar.',
    ref: 'Hooper N et al., Eat Behav 2012;13:62–64',
    strength: 'vorläufig',
    link: { href: '#achtsam/wolken', label: 'Übung «Gedanken als Wolken»' },
  },
  {
    id: 'durchspielen',
    title: 'Für Fortgeschrittene: in Gedanken ausführlich essen',
    steps: [
      'Stell dir vor, wie du den Kuchen isst, Bissen für Bissen, sehr langsam.',
      'Spiel 20 bis 30 Bissen in Gedanken durch, jeden einzeln: Gabel, Geschmack, Kauen, Schlucken.',
      'Wichtig: Nicht nur kurz daran denken. Ein kurzes Vorstellen kann die Lust sogar verstärken.',
    ],
    why: 'In fünf Experimenten assen Personen, die sich vorher ausführlich vorgestellt hatten, 30 Stück einer Süssigkeit zu essen, danach weniger davon (Gewöhnung). Eine spätere Wiederholung fand den Effekt allerdings nicht; die Methode ist deshalb unsicher.',
    ref: 'Morewedge CK, Huh YE, Vosgerau J, Science 2010;330:1530–1533',
    strength: 'vorläufig',
  },
  {
    id: 'bewusst',
    title: 'Wenn du dich fürs Essen entscheidest',
    steps: [
      'Ein Stück auf einen Teller, den Rest sofort zurück in die Dose und weg.',
      'Am Tisch sitzen, ohne Bildschirm, langsam essen.',
      'Den ersten Bissen ganz bewusst schmecken (Übung «Ein Bissen in Zeitlupe»).',
      'Im Tagebuch erfassen und weitermachen, ohne schlechtes Gewissen. Ein Stück Kuchen ist kein Rückfall.',
    ],
    why: 'Langsam und aufmerksam essen senkt die Menge; ein Snack bewusst geplant ist kein Kontrollverlust.',
    ref: 'Robinson E et al., Am J Clin Nutr 2014;100:123–151',
    strength: 'stark',
    link: { href: '#achtsam/bissen', label: 'Übung «Ein Bissen in Zeitlupe»' },
  },
]);

/** Fürs nächste Mal. */
export const NEXT_TIME = [
  'Kuchenreste nach einem Fest gleich mitgeben, verschenken oder in Portionen einfrieren.',
  'Kuchen lieber als einzelnes Stück beim Bäcker kaufen als einen ganzen zuhause zu haben.',
  'Was oft lockt, gar nicht erst einkaufen: Was nicht da ist, kann nicht rufen.',
  'Einen festen Genussmoment pro Woche einplanen, z. B. Sonntagskaffee mit einem Stück Kuchen.',
  'Notiere, wann die Lust auf «das Bestimmte» kommt. Nach zwei Wochen erkennst du das Muster.',
];
