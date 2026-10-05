"""Posen-Katalog aus dem Stilbuch (resources/stilbuecher/minecraft.json, Abschnitt 3.1). Winkel in Grad, Mitte der dort
genannten Bereiche. Die Nummer entspricht der Zeile im Stilbuch."""

POSEN = {
    # 1 Blick zum Ding (Nahaufnahme): Kopf 20–35° zum Objekt, 5–10° nach unten, Rumpf 30–45° gedreht
    "blick_zum_ding": {
        "koerper": {"drehen": 35},
        "kopf": {"drehen": 25, "nicken": 8, "neigen": 6},
        "arm_r": {"heben": 40, "seitlich": 8, "beugen": 25},
        "arm_l": {"heben": 8, "seitlich": 6, "beugen": 10},
    },
    # 2 Präsentator / Zeigen: Zeigearm 70–95° vor, 30–60° zur Bildmitte; anderer Arm hängt
    "zeigen": {
        "koerper": {"drehen": 30},
        "kopf": {"drehen": 22, "nicken": 4, "neigen": 8},
        "arm_l": {"heben": 85, "seitlich": 0, "drehen": 20, "beugen": 8},
        "arm_r": {"heben": 10, "seitlich": 10, "beugen": 12},
    },
    # 3 Schwert oder Axt zur Kamera: Schwertarm 40–80° vor und 20–40° nach innen, zweiter Arm 20–40° vor
    "schwert": {
        "koerper": {"drehen": 15},
        "kopf": {"drehen": 8, "nicken": 3, "neigen": 16},
        # Waffenhand auf der Themenseite (+X), damit die Klinge in die freie Bildhälfte zeigt
        "arm_l": {"heben": 62, "seitlich": 8, "drehen": 10, "beugen": 30},
        "arm_r": {"heben": 28, "seitlich": 14, "beugen": 35},
    },
    # 7 Neutral frontal: Arme 10–25° seitlich, 10–20° nach vorn, Beine gerade
    "neutral": {
        "kopf": {"neigen": 3},
        "arm_r": {"heben": 14, "seitlich": 16, "beugen": 8},
        "arm_l": {"heben": 12, "seitlich": 14, "beugen": 8},
        "bein_r": {"seitlich": 3},
        "bein_l": {"seitlich": 3},
    },
    # 8 Heldenstand: Arme verschränkt vor der Brust, Beine 5–10° gespreizt. Oberarme nur leicht vor, Unterarme
    # waagerecht – mit 80° Oberarm und 70° Beugung lagen die Hände vor dem Gesicht (Test 01.10.)
    "held": {
        "kopf": {"nicken": -3, "neigen": 3},
        "arm_r": {"heben": 32, "seitlich": -38, "beugen": 62},
        "arm_l": {"heben": 28, "seitlich": -38, "beugen": 66},
        "bein_r": {"seitlich": 6},
        "bein_l": {"seitlich": 6},
    },
    # 20 (Variante stehend) Blick in den Abgrund: Kopf 30–40° nach unten, Rumpf leicht vorgebeugt, Arme zur Balance
    "blick_runter": {
        "koerper": {"drehen": 20, "vor": 12},
        "kopf": {"drehen": 12, "nicken": 36, "neigen": 6},
        "arm_r": {"heben": 22, "seitlich": 24, "beugen": 20},
        "arm_l": {"heben": 12, "seitlich": 30, "beugen": 15},
    },
    # 21 Fallen/Taumeln an der Kante: Körper 15–25° nach hinten gekippt, beide Arme 120–160° hoch und gespreizt,
    # ein Bein angehoben (große Geste nur hier erlaubt, Stilbuch 3.2)
    "taumeln": {
        "kippen": 20,
        "koerper": {"vor": -8, "neigen": 6},
        "kopf": {"nicken": -14, "neigen": -8},
        # Arme weit seitlich, damit das Gesicht frei bleibt (Abnahme-Checkliste)
        "arm_r": {"heben": 140, "seitlich": 72, "beugen": 25},
        "arm_l": {"heben": 115, "seitlich": 80, "beugen": 20},
        "bein_l": {"vor": 34, "beugen": 35},
        "bein_r": {"vor": -4},
    },
    # 14 Schreck: Hand vor dem Mund (Arm 110–130° hoch, nach innen)
    "schreck": {  # zurückweichen, beide Hände neben dem Kopf – das Gesicht bleibt frei
        "koerper": {"vor": -7},
        "kopf": {"nicken": 4},
        "arm_r": {"heben": 165, "seitlich": 22, "beugen": 95},
        "arm_l": {"heben": 165, "seitlich": 22, "beugen": 95},
        "bein_r": {"vor": -14, "beugen": 15},
        "bein_l": {"vor": 10},
    },
    # --- Kampf (GommeHD „Minecraft Helden“): Körper zum Gegner (+X), Kopf zur Kamera gedreht, weiter Ausfallschritt,
    # ungleiche Arme. Die Figur bekommt dafür blick ≈ 60–75 (zum Gegner); die Posen drehen Brust und Kopf zurück zur Kamera.
    # Sturmangriff: nach vorn geneigt, freier Arm greift zum Gegner, Schwertarm holt hinten tief aus
    "sturmangriff": {
        "kippen": -16,
        "koerper": {"vor": 20, "drehen": -28, "neigen": -8},
        "kopf": {"drehen": -38, "nicken": -4, "neigen": -10},
        "arm_l": {"heben": 100, "seitlich": 8, "drehen": 30, "beugen": 28},
        # Schwertarm tief nach vorn zum Gegner: die Klinge zeigt zur Bildmitte (Recherche: Waffen treffen sich in der Mitte)
        "arm_r": {"heben": 40, "seitlich": 30, "drehen": 30, "beugen": 30},
        "bein_r": {"vor": 38, "beugen": 38},
        "bein_l": {"vor": -46, "beugen": 18},
    },
    # Hieb von oben: Schwert hoch über dem Kopf, anderer Arm nach vorn, Ausfallschritt
    "hieb": {
        "kippen": -6,
        "koerper": {"vor": 10, "drehen": -24, "neigen": 8},
        "kopf": {"drehen": -12, "nicken": -6, "neigen": -6},
        # Schwertarm hoch und nach außen (zur Kamera-Seite), damit er nie vor dem Gesicht liegt
        "arm_r": {"heben": 172, "seitlich": 48, "drehen": -25, "beugen": 35},
        "arm_l": {"heben": 72, "seitlich": -6, "drehen": 20, "beugen": 30},
        "bein_r": {"vor": 30, "beugen": 30},
        "bein_l": {"vor": -34, "beugen": 15},
    },
    # Parieren / Gegenangriff: Schwert quer vor dem Körper zum Gegner, geduckt
    "parieren": {
        "kippen": -4,
        "koerper": {"vor": 14, "drehen": -12},
        "kopf": {"drehen": -18, "nicken": 4, "neigen": 6},
        "arm_r": {"heben": 84, "seitlich": -24, "drehen": -18, "beugen": 40},
        "arm_l": {"heben": 48, "seitlich": 16, "beugen": 55},
        "bein_r": {"vor": 26, "beugen": 35},
        "bein_l": {"vor": -30, "beugen": 25},
    },
    # Gleiten mit der Elytra: Körper fast waagerecht nach vorn, Kopf hebt den Blick, Arme eng am Körper nach hinten, Beine gestreckt – mit "elytra": "offen" und Höhe
    "gleiten": {
        "kippen": -72,
        "koerper": {"vor": 4},
        "kopf": {"nicken": -58},
        "arm_r": {"heben": -12, "seitlich": 14, "beugen": 8},
        "arm_l": {"heben": -12, "seitlich": 14, "beugen": 8},
        "bein_r": {"vor": -6, "seitlich": 4},
        "bein_l": {"vor": -2, "seitlich": 4},
    },
    # Kriechen/Bauchlage wie BastiGHG P4 (Bedrock-Wand, Klippenrand): liegt zur Kamera, Arme nach vorn auf dem Boden, Kopf hebt sich – Kamera nah und tief
    "kriechen": {
        "kippen": -84,
        "kopf": {"nicken": -62, "drehen": 14, "neigen": 8},
        "arm_r": {"heben": 172, "seitlich": 14, "beugen": 18},
        "arm_l": {"heben": 158, "seitlich": 20, "beugen": 30},
        "bein_r": {"seitlich": 6},
        "bein_l": {"seitlich": 8, "beugen": 12},
    },
    # Gegenstand zur Kamera wie BastiGHG P5 (Taschenlampe, Diamant): beide Arme 80–90° nach vorn, leicht nach innen, Kopf zur Bildmitte gedreht
    "zur_kamera": {
        "koerper": {"vor": 6, "drehen": -12},
        "kopf": {"drehen": 18, "neigen": 6},
        "arm_r": {"heben": 70, "seitlich": -14, "beugen": 12},
        "arm_l": {"heben": 64, "seitlich": -20, "beugen": 22},
        "bein_r": {"vor": 6},
        "bein_l": {"vor": -6},
    },
    # Hervorlugen wie BastiGHG P6 (hinter Baum, Kiste, Heuballen): seitlich geneigt, eine Hand an der Kante, Kopf schief, ängstlich zur Seite
    "hervorlugen": {
        "kippen_seite": 18,
        "koerper": {"neigen": 12, "vor": 8},
        "kopf": {"neigen": 16, "drehen": 24},
        "arm_r": {"heben": 88, "seitlich": 30, "beugen": 50},
        "arm_l": {"heben": 20, "seitlich": 8, "beugen": 40},
        "bein_r": {"beugen": 20},
        "bein_l": {"beugen": 30, "vor": 10},
    },
    # Getroffen: nach hinten geworfen, Arme hoch, Beine vorn – mit Höhe (in der Luft) in der Szene
    "getroffen": {
        "kippen": 30,
        "koerper": {"vor": -10, "neigen": -8},
        "kopf": {"nicken": -18, "neigen": 10, "drehen": -20},
        "arm_l": {"heben": 128, "seitlich": 46, "beugen": 30},
        "arm_r": {"heben": 105, "seitlich": 58, "beugen": 35},
        "bein_r": {"vor": 38, "beugen": 45},
        "bein_l": {"vor": 12, "beugen": 25},
    },
    # Rennen / Fliehen: vorgeneigt, Arme und Beine gegengleich
    "rennen": {
        "kippen": -10,
        "koerper": {"vor": 12, "drehen": -16},
        "kopf": {"drehen": -34, "nicken": -4},
        "arm_l": {"heben": 72, "seitlich": 8, "beugen": 80},
        "arm_r": {"heben": -48, "seitlich": 10, "beugen": 85},
        "bein_r": {"vor": -40, "beugen": 55},
        "bein_l": {"vor": 42, "beugen": 35},
    },
    # Aus der Action-Recherche (72 Thumbnails, Posen P3, P4, P5, P7, P9); Waffe weiter in der kameranahen rechten Hand
    # Schwerter kreuzen (Face-off): Klinge schräg vor dem Körper zum Gegner, zweite Hand als Faust
    "kreuzen": {
        "kippen": -4,
        "koerper": {"drehen": -30, "vor": 6},
        "kopf": {"drehen": -28, "neigen": 4},
        "arm_r": {"heben": 58, "seitlich": 12, "drehen": 30, "beugen": 30},
        "arm_l": {"heben": 20, "seitlich": 14, "beugen": 70},
        "bein_r": {"vor": 14, "seitlich": 6, "beugen": 15},
        "bein_l": {"vor": -12, "seitlich": 6, "beugen": 10},
    },
    # Sprungangriff (in der Szene mit Höhe ~1 Block): Waffe hoch, Beine angezogen
    "sprungangriff": {
        "kippen": -18,
        "kippen_seite": 6,
        "koerper": {"drehen": -16, "vor": 16},
        "kopf": {"drehen": -20, "nicken": 10},
        # Ausnahme: Waffe im hinteren Arm (arm_l) hoch über dem Kopf – so steht sie mittig über der Figur und ragt
        # nicht seitlich aus dem Bild; der vordere Arm greift zum Gegner (GommeHD Helden 2, Sprungangriff)
        "arm_l": {"heben": 150, "seitlich": 14, "drehen": 20, "beugen": 50},
        "arm_r": {"heben": 55, "seitlich": 34, "drehen": 25, "beugen": 35},
        "bein_r": {"vor": 45, "seitlich": 8, "beugen": 70},
        "bein_l": {"vor": -40, "seitlich": 12, "beugen": 50},
    },
    # Stoß: Klinge gerade nach vorn zum Gegner, zweiter Arm hinten zum Schwung
    "stoss": {
        "kippen": -12,
        "koerper": {"drehen": -18, "vor": 16},
        "kopf": {"drehen": -26, "nicken": 8},
        "arm_r": {"heben": 68, "seitlich": 14, "drehen": 12, "beugen": 15},
        "arm_l": {"heben": -28, "seitlich": 32, "drehen": -8, "beugen": 40},
        "bein_r": {"vor": 34, "seitlich": 8, "beugen": 35},
        "bein_l": {"vor": -32, "seitlich": 8, "beugen": 15},
    },
    # Weggeschleudert (X-Pose in der Luft, Höhe 1–2 Blöcke)
    "weggeschleudert": {
        "kippen": 38,
        "kippen_seite": 16,
        "koerper": {"vor": -10, "neigen": 8},
        "kopf": {"nicken": -22, "neigen": 10},
        "arm_r": {"heben": 128, "seitlich": 82, "beugen": 25},
        "arm_l": {"heben": 150, "seitlich": 72, "beugen": 30},
        "bein_r": {"vor": 24, "seitlich": 26, "beugen": 35},
        "bein_l": {"vor": -20, "seitlich": 26, "beugen": 20},
    },
    # Bogen spannen: Bogenarm gestreckt zum Gegner, Zughand am Kinn
    "bogen": {
        "kippen": -4,
        "koerper": {"drehen": -30, "vor": 4},
        "kopf": {"drehen": -12, "neigen": 8},
        "arm_r": {"heben": 90, "seitlich": 0, "drehen": 6, "beugen": 5},
        "arm_l": {"heben": 88, "seitlich": -34, "drehen": 26, "beugen": 110},
        "bein_r": {"vor": 16, "seitlich": 8},
        "bein_l": {"vor": -16, "seitlich": 8},
    },
    # Pistole beidhändig zielen (Shooter- und Agenten-Spiele, Spiele-Vorlagen): Waffenarm quer zum Thema gestreckt,
    # zweite Hand stützt, Kopf bleibt zur Kamera
    "pistole": {
        "blick": 45,
        "koerper": {"vor": 4},
        "kopf": {"drehen": -34, "nicken": 4, "neigen": -4},
        "arm_r": {"heben": 82, "seitlich": -4, "drehen": 6, "beugen": 4},
        "arm_l": {"heben": 78, "seitlich": -14, "drehen": -18, "beugen": 30},
    },
    # Gesten (Reactions und Stimmung, die Hauptfigur 29.09.): Gesicht bleibt frei
    # Jubeln: beide Arme hoch, angewinkelt
    "jubeln": {
        "kopf": {"nicken": -10},
        "arm_r": {"heben": 165, "seitlich": 32, "beugen": 35},
        "arm_l": {"heben": 165, "seitlich": 32, "beugen": 35},
        "bein_r": {"seitlich": 6},
        "bein_l": {"seitlich": 6},
    },
    # Kopfkratzen: eine Hand hinten am Kopf, Kopf schief (ratlos)
    "kopfkratzen": {
        "kopf": {"neigen": 12, "drehen": 10},
        "arm_l": {"heben": 150, "seitlich": 28, "drehen": -35, "beugen": 115},
        "arm_r": {"heben": 10, "seitlich": 8, "beugen": 10},
    },
    # Achselzucken: Unterarme nach vorn, Hände offen, Kopf schief
    "achselzucken": {
        "kopf": {"neigen": 14},
        "koerper": {"neigen": -4},
        "arm_r": {"heben": 25, "seitlich": 38, "beugen": 75},
        "arm_l": {"heben": 25, "seitlich": 38, "beugen": 75},
    },
    # Müde: zusammengesackt, Kopf hängt schief nach vorn, Arme schlaff (dazu Mimik „muede“)
    "muede": {
        "kippen": -4,
        "koerper": {"vor": 14, "neigen": 6},
        "kopf": {"nicken": 16, "neigen": 14},
        "arm_r": {"heben": 6, "seitlich": 6, "beugen": 8},
        "arm_l": {"heben": 4, "seitlich": 4, "beugen": 6},
        "bein_r": {"vor": 4, "beugen": 8},
        "bein_l": {"vor": -2, "beugen": 12},
    },
    # Winken: ein Arm hoch zur Seite, Unterarm aufrecht
    "winken": {
        "kopf": {"neigen": 6},
        "arm_l": {"heben": 110, "seitlich": 55, "drehen": 10, "beugen": 70},
        "arm_r": {"heben": 8, "seitlich": 8, "beugen": 10},
    },
    # Nachdenken: Hand am Kinn (unter dem Mund), anderer Arm stützt den Ellbogen, Blick schräg nach oben
    "nachdenken": {
        "kopf": {"nicken": -10, "drehen": 14, "neigen": 8},
        "arm_l": {"heben": 60, "seitlich": -18, "drehen": -20, "beugen": 115},
        "arm_r": {"heben": 40, "seitlich": -30, "drehen": 30, "beugen": 90},
    },
    # Panik: beide Hände seitlich am Kopf (Gesicht bleibt frei), Kopf zurück
    "panik": {
        "koerper": {"vor": -6},
        "kopf": {"nicken": -8},
        "arm_r": {"heben": 150, "seitlich": 40, "drehen": 15, "beugen": 120},
        "arm_l": {"heben": 150, "seitlich": 40, "drehen": 15, "beugen": 120},
    },
    # Siegesfaust: ein Arm angewinkelt hoch, Faust neben dem Kopf
    "siegesfaust": {
        "kopf": {"nicken": -6, "neigen": -6},
        "koerper": {"neigen": -4},
        "arm_l": {"heben": 125, "seitlich": 40, "beugen": 95},
        "arm_r": {"heben": 14, "seitlich": 12, "beugen": 20},
    },
    # Genervt: Arme verschränkt, Kopf schief weg (dazu Mimik „skeptisch“)
    "genervt": {
        "kopf": {"neigen": -12, "drehen": -10, "nicken": 4},
        "arm_r": {"heben": 34, "seitlich": -38, "beugen": 58},
        "arm_l": {"heben": 30, "seitlich": -38, "beugen": 62},
        "bein_r": {"seitlich": 6},
        "bein_l": {"seitlich": 4},
    },
    # Ganzkörperposen aus Spiele-Thumbnails (Spiele-Vorlage, MoinStudio, 30.09.: „alles können“)
    # Klettern an einer Wand: Arme hoch und versetzt, ein Knie hochgezogen, das andere Bein gestreckt nach unten
    "klettern": {
        "koerper": {"vor": 8},
        "kopf": {"nicken": 18},
        "arm_r": {"heben": 165, "seitlich": 12, "beugen": 35},
        "arm_l": {"heben": 125, "seitlich": 18, "beugen": 55},
        "bein_r": {"vor": 70, "seitlich": 10, "beugen": 95},
        "bein_l": {"vor": -8, "seitlich": 6, "beugen": 15},
    },
    # Hechtsprung / Sprung nach etwas greifen: Körper nach vorn geneigt in der Luft, ein Arm weit vorgestreckt,
    # der andere schwingt nach hinten, Beine ziehen nach
    "hechtsprung": {
        "kippen": -38,
        "koerper": {"drehen": -12, "vor": 10},
        "kopf": {"nicken": -30, "drehen": 10},
        "arm_r": {"heben": 125, "seitlich": 28, "beugen": 8},
        "arm_l": {"heben": 60, "seitlich": 75, "drehen": -20, "beugen": 12},
        "bein_r": {"vor": -35, "seitlich": 10, "beugen": 60},
        "bein_l": {"vor": 20, "seitlich": 14, "beugen": 35},
    },
    # Hängen: an einer oder beiden Händen, Arme gestreckt nach oben, Beine baumeln locker
    "haengen": {
        "koerper": {"vor": -4},
        "kopf": {"nicken": 22},
        "arm_r": {"heben": 172, "seitlich": 10, "beugen": 6},
        "arm_l": {"heben": 168, "seitlich": 16, "beugen": 10},
        "bein_r": {"vor": 12, "seitlich": 4, "beugen": 25},
        "bein_l": {"vor": -6, "seitlich": 8, "beugen": 10},
    },
    # Sitzen (Stuhl, Kante, Couch): Oberschenkel waagerecht nach vorn, Unterschenkel hängen senkrecht
    "sitzen": {
        "kopf": {"nicken": 4},
        "arm_r": {"heben": 38, "seitlich": 8, "beugen": 40},
        "arm_l": {"heben": 34, "seitlich": 8, "beugen": 45},
        "bein_r": {"vor": 90, "seitlich": 6, "beugen": 90},
        "bein_l": {"vor": 88, "seitlich": 8, "beugen": 88},
    },
    # Knien: ein Knie am Boden, das andere Bein aufgestellt
    "knien": {
        "koerper": {"vor": 6},
        "arm_r": {"heben": 30, "seitlich": 10, "beugen": 40},
        "arm_l": {"heben": 20, "seitlich": 10, "beugen": 30},
        "bein_r": {"vor": 85, "seitlich": 6, "beugen": 90},
        "bein_l": {"vor": -5, "seitlich": 6, "beugen": 95},
    },
    # Fallen (nach hinten, Arme rudern hoch, Beine strampeln)
    "fallen": {
        "kippen": 30,
        "kippen_seite": -10,
        "koerper": {"vor": -12},
        "kopf": {"nicken": -10},
        "arm_r": {"heben": 150, "seitlich": 55, "beugen": 30},
        "arm_l": {"heben": 120, "seitlich": 70, "beugen": 40},
        "bein_r": {"vor": 40, "seitlich": 14, "beugen": 55},
        "bein_l": {"vor": 5, "seitlich": 18, "beugen": 20},
    },
    # Liegen auf dem Rücken (verletzt, erschöpft, schlafend)
    "liegen": {
        "kippen": 88,
        "kopf": {"nicken": 20, "drehen": 20},
        "arm_r": {"heben": 20, "seitlich": 30, "beugen": 10},
        "arm_l": {"heben": 10, "seitlich": 20},
        "bein_r": {"seitlich": 8, "vor": 10, "beugen": 20},
        "bein_l": {"seitlich": 6},
    },
    # Thumbnail-Posen nach Recherche (MoinStudio, 01.10.: „schau dir bei anderen an … Posen“): nie symmetrisch, Kopf geneigt,
    # Oberkörper gegen die Hüfte verdreht
    # Hände in die Hüften (selbstsicher): Ellbogen nach außen, Fäuste an der Hüfte
    "haende_hueften": {
        "koerper": {"drehen": 8},
        "kopf": {"neigen": 6, "nicken": -4},
        "arm_r": {"heben": 0, "seitlich": 40, "rollen": 85, "beugen": 100},
        "arm_l": {"heben": 0, "seitlich": 40, "rollen": 85, "beugen": 100},
        "bein_r": {"seitlich": 7},
        "bein_l": {"seitlich": 5, "vor": 6},
    },
    # Facepalm: eine Hand vor dem Gesicht, Kopf nach unten (Fail, Peinlich)
    "facepalm": {
        "koerper": {"vor": 6, "drehen": 6},
        "kopf": {"nicken": 16, "neigen": -6},
        "arm_l": {"heben": 105, "seitlich": -12, "drehen": -20, "beugen": 125},
        "arm_r": {"heben": 12, "seitlich": 10, "beugen": 15},
    },
    # Ausschau halten: Hand flach über den Augen, Blick in die Ferne
    "ausschau": {
        "koerper": {"drehen": 12},
        "kopf": {"drehen": 18, "nicken": -6},
        "arm_l": {"heben": 125, "seitlich": 8, "drehen": -30, "beugen": 115},
        "arm_r": {"heben": 14, "seitlich": 12, "beugen": 20},
        "bein_r": {"vor": -6},
        "bein_l": {"vor": 10, "beugen": 6},
    },
    # Gegenstand zur Kamera hochhalten (Item zeigen): Arm nach vorn, leicht gebeugt
    "hochhalten": {
        "koerper": {"drehen": 10},
        "kopf": {"neigen": 8, "drehen": 6},
        "arm_l": {"heben": 95, "seitlich": 10, "drehen": 15, "beugen": 25},
        "arm_r": {"heben": 20, "seitlich": 14, "beugen": 30},
        "bein_r": {"seitlich": 5},
        "bein_l": {"vor": 8},
    },
    # Ängstlich zurücklehnen: Oberkörper zurück, beide Hände abwehrend vorn, ein Bein vor
    "abwehr": {
        "kippen": 8,
        "koerper": {"vor": -14, "drehen": -8},
        "kopf": {"nicken": -6, "drehen": -10},
        "arm_r": {"heben": 75, "seitlich": 6, "drehen": 10, "beugen": 60},
        "arm_l": {"heben": 68, "seitlich": 10, "drehen": -6, "beugen": 55},
        "bein_r": {"vor": 28, "beugen": 18},
        "bein_l": {"vor": -6},
    },
    # Spitzhacke (oder Schwert) locker über der Schulter: Oberarm hoch, Ellbogen spitz, Werkzeug hinter der Schulter
    "schulter": {
        "koerper": {"drehen": 10},
        "kopf": {"neigen": 5, "drehen": 8},
        "arm_l": {"heben": 100, "seitlich": 20, "drehen": -10, "beugen": 115},
        "arm_r": {"heben": 14, "seitlich": 12, "beugen": 15},
        "bein_r": {"seitlich": 5},
        "bein_l": {"vor": 8},
    },
    # Axt zum Schlag erhoben: Arm hoch über den Kopf, Oberkörper zurückgedreht, Schrittstellung
    "ausholen": {
        "koerper": {"drehen": -18, "vor": -6},
        "kopf": {"drehen": 14, "nicken": -4},
        "arm_l": {"heben": 135, "seitlich": 18, "drehen": 10, "beugen": 50},
        "arm_r": {"heben": 40, "seitlich": 20, "beugen": 40},
        "bein_r": {"vor": -22, "beugen": 10},
        "bein_l": {"vor": 24, "beugen": 22},
    },
}
