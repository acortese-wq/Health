// @ts-check
// Geführte Achtsamkeitsübungen bei Heisshunger, Schritt für Schritt mit Zeitangabe.
//
// Grundlagen:
// - Urge Surfing: Bowen S, Marlatt GA, Psychol Addict Behav 2009;23:666–671.
// - Achtsamkeits-Training senkt Essanfälle und emotionales Essen: Katterman SN et al., Eat Behav 2014;15:197–204.
// - RAIN in einer App gegen craving-bedingtes Essen: Mason AE et al., J Behav Med 2018;41:160–173.
// - Selbstmitgefühl nach einem «Ausrutscher» verringerte das Weiteressen: Adams CE, Leary MR, J Soc Clin
//   Psychol 2007;26:1120–1144.
// - Gedanken mit Abstand betrachten (Defusion, Akzeptanz-basierte Therapie): Forman EM et al., Obesity
//   2016;24:2050–2056.
// - Langes Ausatmen und langsames Atmen beruhigen das Nervensystem: Zaccaro A et al., Front Hum Neurosci
//   2018;12:353.

/**
 * @typedef {{ text: string, sec: number }} MindStep
 * @typedef {{ id: string, title: string, minutes: number, for: string[], intro: string, ref: string, steps: MindStep[] }} MindExercise
 */

/** @type {MindExercise[]} */
export const EXERCISES = [
  {
    id: 'welle',
    title: 'Die Welle reiten (Urge Surfing)',
    minutes: 5,
    for: ['stark', 'tv', 'gewohnheit', 'belohnung'],
    intro: 'Du lernst, das Verlangen zu beobachten, statt ihm zu folgen. Es steigt, bricht und flacht ab wie eine Welle.',
    ref: 'Bowen S, Marlatt GA, Psychol Addict Behav 2009;23:666–671',
    steps: [
      { text: 'Setz dich bequem hin, beide Füsse auf den Boden. Schliess die Augen oder richte den Blick auf einen Punkt.', sec: 20 },
      { text: 'Atme dreimal tief ein und langsam aus. Lass die Schultern sinken.', sec: 25 },
      { text: 'Wo im Körper spürst du das Verlangen? Im Mund, im Bauch, in der Brust, in den Händen? Such die Stelle.', sec: 30 },
      {
        text: 'Beschreib es dir innerlich: Ist es warm oder kalt, eng oder weit, ziehend oder kribbelnd? Nur beschreiben, nicht bewerten.',
        sec: 40,
      },
      { text: 'Gib dem Verlangen eine Zahl von 1 bis 10. Merk sie dir.', sec: 15 },
      {
        text: 'Stell dir vor, das Verlangen ist eine Welle. Atme ein, wenn sie steigt. Atme aus, wenn sie bricht. Dein Atem ist das Surfbrett.',
        sec: 60,
      },
      {
        text: 'Bleib auf dem Brett. Wenn Gedanken ans Essen kommen, nimm sie wahr («da ist der Gedanke an Schokolade») und kehr zum Atem zurück.',
        sec: 60,
      },
      { text: 'Spür noch einmal hin: Wo ist das Verlangen jetzt? Hat es sich verändert, verschoben, abgeschwächt?', sec: 30 },
      { text: 'Gib ihm wieder eine Zahl von 1 bis 10. Egal welche: Du hast die Welle beobachtet, ohne ihr zu folgen.', sec: 20 },
    ],
  },
  {
    id: 'rain',
    title: 'RAIN: Erkennen, Zulassen, Erforschen, Freundlich sein',
    minutes: 4,
    for: ['stress', 'frust', 'stark'],
    intro:
      'Vier Schritte, mit denen du dem Verlangen neugierig statt kämpfend begegnest. In einer Studie mit einer App, die RAIN vermittelt, ging das Essen aus Verlangen deutlich zurück.',
    ref: 'Mason AE et al., J Behav Med 2018;41:160–173',
    steps: [
      { text: 'R wie Erkennen: Sag innerlich «Da ist Verlangen» oder «Da ist Lust auf Süsses». Nur benennen.', sec: 30 },
      { text: 'A wie Zulassen: Lass das Verlangen da sein, ohne es wegzudrücken. Sag dir: «Es ist okay, dass es da ist.»', sec: 45 },
      {
        text: 'I wie Erforschen: Wie fühlt es sich im Körper an? Welche Gedanken kommen? Welches Gefühl liegt darunter: Müdigkeit, Stress, Leere?',
        sec: 60,
      },
      {
        text: 'N wie Freundlich sein: Leg eine Hand auf Brust oder Bauch. Sag dir etwas Freundliches, z. B. «Das ist gerade schwer, und ich kümmere mich gut um mich.»',
        sec: 45,
      },
      { text: 'Frag dich zum Schluss: Was brauche ich jetzt wirklich? Ruhe, Bewegung, Gesellschaft, Schlaf?', sec: 30 },
    ],
  },
  {
    id: 'stopp',
    title: 'STOPP: die 1-Minuten-Pause',
    minutes: 1,
    for: ['schnell', 'buero', 'gewohnheit', 'tv'],
    intro: 'Die kürzeste Übung, für unterwegs und vor dem Kühlschrank.',
    ref: 'Katterman SN et al., Eat Behav 2014;15:197–204',
    steps: [
      { text: 'S wie Stopp: Halte inne. Was auch immer du gerade tust, unterbrich es.', sec: 8 },
      { text: 'T wie Tief atmen: Ein tiefer Atemzug durch die Nase, langsam aus durch den Mund.', sec: 12 },
      { text: 'O wie Observieren: Was spüre ich im Körper? Was denke ich? Was fühle ich?', sec: 20 },
      { text: 'P wie Prüfen: Ist das Hunger im Bauch oder Lust im Kopf?', sec: 10 },
      { text: 'P wie Planen: Entscheide jetzt bewusst, was du als Nächstes tust. Beides ist erlaubt, Hauptsache bewusst.', sec: 10 },
    ],
  },
  {
    id: 'atmen46',
    title: 'Ruhig atmen: 4 ein, 6 aus',
    minutes: 3,
    for: ['stress', 'frust', 'abend'],
    intro: 'Langsames Atmen mit langem Ausatmen beruhigt das Nervensystem und nimmt Stresshunger die Spitze.',
    ref: 'Zaccaro A et al., Front Hum Neurosci 2018;12:353',
    steps: [
      { text: 'Setz dich aufrecht, eine Hand auf den Bauch.', sec: 10 },
      { text: 'Atme 4 Sekunden durch die Nase ein, der Bauch hebt sich. Atme 6 Sekunden durch den Mund aus. Wiederhole.', sec: 50 },
      { text: 'Weiter: 4 ein, 6 aus. Zähl leise mit. Wenn Gedanken kommen, kehr zum Zählen zurück.', sec: 60 },
      { text: 'Noch eine Minute. Spür, wie die Schultern weicher werden.', sec: 60 },
      { text: 'Lass den Atem wieder natürlich fliessen. Wie stark ist das Verlangen jetzt?', sec: 15 },
    ],
  },
  {
    id: 'box',
    title: 'Box-Atmung',
    minutes: 2,
    for: ['stress', 'buero', 'schnell'],
    intro: 'Vier gleich lange Phasen. Gut, wenn du dich auf etwas Einfaches konzentrieren willst.',
    ref: 'Zaccaro A et al., Front Hum Neurosci 2018;12:353',
    steps: [
      { text: 'Atme ganz aus. Dann 4 Sekunden einatmen.', sec: 8 },
      { text: '4 Sekunden halten, 4 Sekunden ausatmen, 4 Sekunden halten. Das ist eine Box.', sec: 16 },
      { text: 'Weiter so: ein, halten, aus, halten, je 4 Sekunden. Stell dir dabei ein Quadrat vor, das du nachzeichnest.', sec: 48 },
      { text: 'Noch drei Boxen. Ist es zu anstrengend, nimm 3 statt 4 Sekunden.', sec: 48 },
    ],
  },
  {
    id: 'sinne',
    title: '5-4-3-2-1: zurück ins Hier und Jetzt',
    minutes: 3,
    for: ['langeweile', 'stress', 'tv'],
    intro: 'Lenkt die Aufmerksamkeit vom inneren Bild des Essens auf die Umgebung. Innere Bilder sind der Motor des Verlangens.',
    ref: 'Kavanagh DJ et al., Psychol Rev 2005;112:446–467',
    steps: [
      { text: 'Nenne 5 Dinge, die du gerade siehst. Schau sie dir genau an: Farbe, Form, Licht.', sec: 40 },
      { text: 'Nenne 4 Dinge, die du hörst. Auch leise Geräusche: Kühlschrank, Verkehr, dein Atem.', sec: 35 },
      { text: 'Nenne 3 Dinge, die du spürst: Stuhl, Kleidung, Temperatur der Luft.', sec: 30 },
      { text: 'Nenne 2 Dinge, die du riechst. Wenn nichts: Riech an deinem Handgelenk oder an einer Tasse Tee.', sec: 25 },
      { text: 'Nenne 1 Ding, das du schmeckst. Vielleicht nur den eigenen Mund. Gut gemacht.', sec: 20 },
    ],
  },
  {
    id: 'bissen',
    title: 'Ein Bissen in Zeitlupe (achtsam essen)',
    minutes: 3,
    for: ['bewusst', 'belohnung', 'abend'],
    intro: 'Wenn du dich entscheidest zu essen: Ein Stück, ganz bewusst. Oft reicht dann weniger. Langsames Essen senkt die Menge.',
    ref: 'Robinson E et al., Am J Clin Nutr 2014;100:123–151',
    steps: [
      { text: 'Nimm ein einziges Stück, z. B. ein Stück Schokolade, eine Nuss oder eine Beere. Leg den Rest weg.', sec: 20 },
      { text: 'Schau es an, als hättest du so etwas noch nie gesehen: Farbe, Oberfläche, Form.', sec: 25 },
      { text: 'Riech daran. Was passiert im Mund? Läuft das Wasser zusammen?', sec: 20 },
      { text: 'Leg es auf die Zunge, ohne zu kauen. Wie fühlt es sich an? Wie verändert sich der Geschmack?', sec: 40 },
      { text: 'Kau ganz langsam. Achte darauf, wie sich Geschmack und Konsistenz verändern.', sec: 40 },
      { text: 'Schluck bewusst. Spür nach: Wie lange bleibt der Geschmack? Brauchst du wirklich ein zweites Stück?', sec: 30 },
    ],
  },
  {
    id: 'wolken',
    title: 'Gedanken als Wolken',
    minutes: 3,
    for: ['gewohnheit', 'frust', 'langeweile'],
    intro: 'Gedanken wie «Ich brauche jetzt Chips» sind Gedanken, keine Befehle. Du übst, sie mit Abstand zu betrachten.',
    ref: 'Forman EM et al., Obesity 2016;24:2050–2056',
    steps: [
      { text: 'Schliess die Augen. Stell dir einen weiten Himmel vor, du liegst auf einer Wiese.', sec: 20 },
      { text: 'Jeder Gedanke, der kommt, ist eine Wolke. Setz ihn auf die Wolke, z. B. «Ich will Chips».', sec: 40 },
      { text: 'Schau zu, wie die Wolke weiterzieht. Halte sie nicht fest, schieb sie nicht weg.', sec: 40 },
      { text: 'Sag dir bei jedem Essensgedanken: «Ich habe den Gedanken, dass ich … will.» Merkst du den Abstand?', sec: 40 },
      { text: 'Öffne die Augen. Der Gedanke darf da sein, du entscheidest trotzdem selbst.', sec: 15 },
    ],
  },
  {
    id: 'mitgefuehl',
    title: 'Mitgefühls-Pause nach einem Ausrutscher',
    minutes: 3,
    for: ['frust', 'nachher'],
    intro:
      'Nach einem Ausrutscher kommt oft «jetzt ist es eh egal». Freundlichkeit mit sich selbst verringerte in einer Studie genau dieses Weiteressen.',
    ref: 'Adams CE, Leary MR, J Soc Clin Psychol 2007;26:1120–1144',
    steps: [
      { text: 'Leg eine Hand auf dein Herz oder deinen Bauch. Spür die Wärme.', sec: 20 },
      { text: 'Sag dir: «Das ist gerade ein schwieriger Moment.» Du musst nichts schönreden.', sec: 30 },
      { text: 'Sag dir: «Das geht vielen so. Ich bin damit nicht allein.»', sec: 30 },
      { text: 'Sag dir: «Ich darf freundlich zu mir sein. Ein Snack macht keinen Tag kaputt.»', sec: 30 },
      { text: 'Überleg: Was ist der nächste gute Schritt? Ein Glas Wasser, ein Spaziergang, früh schlafen?', sec: 40 },
    ],
  },
  {
    id: 'koerper',
    title: 'Kurzer Bodyscan',
    minutes: 4,
    for: ['muede', 'stress', 'abend'],
    intro: 'Spürt nach, was der Körper wirklich braucht. Oft ist es Ruhe statt Essen.',
    ref: 'Katterman SN et al., Eat Behav 2014;15:197–204',
    steps: [
      { text: 'Setz oder leg dich bequem hin. Schliess die Augen.', sec: 15 },
      { text: 'Spür in deine Füsse und Beine. Sind sie schwer, leicht, warm, kalt?', sec: 35 },
      { text: 'Wandere zum Bauch. Ist da echter Hunger, ein Knurren, eine Leere? Oder eher Spannung?', sec: 40 },
      { text: 'Spür in Brust, Schultern und Nacken. Wo hältst du Spannung fest? Atme dorthin.', sec: 45 },
      { text: 'Spür ins Gesicht: Kiefer, Stirn, Augen. Lass locker.', sec: 30 },
      { text: 'Frag deinen Körper: Was brauchst du jetzt wirklich? Hör auf die erste Antwort.', sec: 30 },
    ],
  },
  {
    id: 'gehen',
    title: 'Achtsames Gehen',
    minutes: 5,
    for: ['stark', 'stress', 'langeweile', 'buero'],
    intro: 'Bewegung und Achtsamkeit zusammen. Zügiges Gehen senkte in Studien das Verlangen nach Süssem.',
    ref: 'Taylor AH, Oliver AJ, Appetite 2009;52:155–160',
    steps: [
      { text: 'Geh los, drinnen oder draussen. Spür bei jedem Schritt, wie die Fusssohle den Boden berührt.', sec: 60 },
      { text: 'Werde etwas schneller. Achte auf den Rhythmus: links, rechts, links, rechts.', sec: 60 },
      { text: 'Atme im Takt deiner Schritte: 3 Schritte ein, 4 Schritte aus.', sec: 60 },
      { text: 'Schau dich um: Was siehst du, was du sonst übersiehst?', sec: 60 },
      { text: 'Werde langsamer und bleib stehen. Wie geht es dem Verlangen jetzt?', sec: 30 },
    ],
  },
  {
    id: 'hungerskala',
    title: 'Hunger-Check mit der Skala',
    minutes: 2,
    for: ['schnell', 'unklar', 'hunger'],
    intro: 'Unterscheidet körperlichen Hunger von Lust. Hilft vor jedem Griff zum Snack.',
    ref: 'Faustregeln aus der Ernährungsberatung',
    steps: [
      { text: 'Leg eine Hand auf den Bauch und atme zweimal ruhig.', sec: 15 },
      { text: 'Wie hungrig bist du von 1 (gar nicht) bis 10 (sehr)? Spür im Bauch, nicht im Kopf.', sec: 25 },
      { text: 'Wann hast du zuletzt gegessen? Mehr als 3 bis 4 Stunden her spricht für echten Hunger.', sec: 20 },
      { text: 'Würde jetzt auch ein Apfel oder ein Joghurt passen? Wenn ja: echter Hunger, iss etwas Proteinreiches.', sec: 25 },
      { text: 'Wenn nur ein bestimmtes Essen passt: Das ist Lust. Wähl eine andere Übung oder warte 10 Minuten.', sec: 20 },
    ],
  },
];

/**
 * Passende Übung zu Auslöser und Stärke.
 * @param {string} trigger
 * @param {number} intensity
 * @param {string} kind Planart (hunger, unklar, emotional)
 */
export function suggestExercise(trigger, intensity, kind) {
  const want = [kind === 'hunger' ? 'hunger' : kind === 'unklar' ? 'unklar' : '', intensity >= 7 ? 'stark' : '', trigger].filter(Boolean);
  return EXERCISES.find((e) => want.some((w) => e.for.includes(w))) ?? EXERCISES[0];
}
