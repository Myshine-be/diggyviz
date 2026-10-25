# Review DiggyViz — 25 oktober 2026

Basis: Claude's `real-audio` op `b59e041`, inclusief zijn verslag; vergelijking met live `b3f1962`. Werk op `codex/thorough-review`, PR #4. Deze review publiceert niets naar `main`.

## Bevindingen en herstel

| Prioriteit | Bevinding | Aanpassing |
|---|---|---|
| Hoog | Deezer JSONP werd als script uitgevoerd in de pagina die de Spotify-sessie opslaat. | JSONP draait nu in een iframe met een ondoorzichtige oorsprong (`sandbox="allow-scripts"`, zonder `allow-same-origin`). Berichten worden gecontroleerd op venster en nonce. Browserproef bevestigt dat het script de opslag van de hoofdpagina niet kan lezen. |
| Hoog | Een geschorste AudioContext kon dezelfde oude spectrum- en golfwaarden blijven leveren. | Verbinding en werkelijk ontvangen audio zijn aparte toestanden; onderbroken audio levert stilte, geen oude golf of simulatie. Hervatten wordt opnieuw geprobeerd bij terugkeer/tik. |
| Middel | De alien vertrok rond 118 s, hoewel Mo een blijvende achtervolging vroeg. | Eén UFO-aankomst vanaf 90 s; de alien blijft na het uitstappen. Met Auto uit geen reset bij 120 s. Bij wisselen van visual begint het verhaal opnieuw. |
| Middel | Konvooi-attributen kwamen deels buiten beeld in portret. | Camera opent geleidelijk tijdens de scène; schaal houdt rekening met de beschikbare breedte, sway en het breedste attribuut. Vier extra auto's plus de hoofdauto passen in de gecontroleerde beelden. |
| Middel | Alleen BPM integreren lijnt sprongen niet uit op de beatfase. De alien liep bovendien een fractionele beat achter. | De storyklok corrigeert de fase geleidelijk, met begrensde snelheid en zonder terug te springen. De alien volgt exact één beat achter Bloop, zodat beiden op dezelfde beats landen. Dit verbetert uitlijning, maar bewijst geen perfecte detectie van echte muziek. |
| Middel | Onbekend tempo en servicefouten lieten ongemerkt 120 BPM staan. API-foutobjecten werden een week als 'niet gevonden' gecachet. | Zichtbare labels/meldingen voor demo, zoeken, gevonden, handmatig, microfoon, onderbreking en schatting. Servicefouten blijven opnieuw opvraagbaar; ongeldige caches worden genegeerd. |
| Middel | Wisselen naar de microfoon behield eerst gesimuleerde spectrumgeschiedenis en release-enveloppen. | Geschiedenis, golf en band-enveloppen worden gewist bij bronwisseling. |
| Middel | Warp kreeg via de gedeelde `uTravel` nog snelheidsstoten op kicks; Tunnel draaide zijn hele feedbackbeeld op de snare. | Vaste cameravoortgang en rustige, tijdgestuurde draaiing. Muziekreactie blijft in de objectdetails. |
| Middel | Strings had onbegrensde slope-correctie en opgetelde lijnhelderheid. De temporele stresstest liet relatief grote helderheidsverschillen zien. | Slope begrensd zoals bij andere lijn-visuals; de opgetelde gloed verzadigt geleidelijk in plaats van onbeperkt helderder te worden. |
| Laag | Een synchrone microfoonfout kon een afgeronde startaanvraag als 'pending' achterlaten. Frequentieanalyse las bij lage samplerates voorbij het spectrum. | Afgeronde aanvragen worden ook bij synchrone fouten opgeruimd; frequentiebereiken worden begrensd. |

Chrome, Moiré en Glass Orb zijn daadwerkelijk uit de registry en bestanden verwijderd. Browsercontrole laadt elk van hun oude voorkeuren en controleert de terugval naar Night Drive. Geen bestaande personages opnieuw toegevoegd.

## Validatie

- 41 lokale regressietests: authenticatie, PKCE, koppeling, oude/verlate bronreacties, rate limits, Last.fm, microfoonraces, onderbreking, golfvorm, geschiedenis, tempo-fouten, storytijd en fasecorrectie.
- Browser: alle 13 productievisuals compileren/renderen; snelle overgangen, portret/landschap, contextherstel, verwijderde voorkeuren en storypauze/nummerwissels.
- Echte GPU-shaderinterface via SwiftShader: JavaScript schrijft 70 rijen in de 64-rijen-ring; de productie-GLSL leest nieuwste/oudste band en golfvorm correct terug, ook na WebGL-herstel. Dit test de interface, geen fysieke GPU.
- JSONP wordt in een echte browser uitgevoerd met een lokale fixture; toegang tot parent-opslag wordt geweigerd. Tempo-labels en handmatige voorrang zijn getest.
- Een lokale oscillator levert een MediaStream aan de productie-Web-Audio-keten. Niet-vlakke golf en spectrum gemeten; stoppen getest. Dit vervangt geen echte microfoon of kamer.
- Beelden op 35, 89.9, 94.5, 96, 100, 106, 118, 121 en 180 s, plus landschap. Night Drive en Bloop zijn visueel geïnspecteerd.
- Opeenvolgende-framecontrole: 13 visuals, 120×214, 30 samples/s, harde synthetische 150 BPM-pulsen; 2 s per visual en 8 s voor de twee verhaalwerelden. `motion.json` rapporteert gemiddelde lineaire luminantie en veranderde pixeloppervlakte. Dit is **geen** WCAG-flitstelling, PEAT/Harding-certificatie, comfortgarantie of FPS-meting.
- Een aparte live Deezer-proef gebruikt alleen een publieke fixture-ISRC, zonder gebruikersgegevens. De uitkomst staat in `deezer-probe.json`; falen blokkeert de offline tests niet.

Twee fouten in nieuwe testfixtures zijn tijdens deze review gecorrigeerd: de verwachte waarde moest dezelfde Float32-kwantisatie als de bandbuffer gebruiken; een CDP-evaluatie moest geen DOM-prototype als JSON proberen terug te geven. De testcriteria voor de productiecode zijn niet verlaagd.

## Grenzen en resterend werk vóór definitieve vrijgave

1. Fysieke iPhone/Safari: echte Spotify-login, muziek op hetzelfde toestel/externe speaker, microfoontoestemming, telefoongesprek/Siri, vergrendelen/ontgrendelen, rotatie en langdurige belasting/temperatuur zijn niet in deze omgeving geverifieerd.
2. Tempo uit metadata geeft geen audiofase en kan half/dubbel tempo of een andere uitvoering betreffen. Microfoonbeatdetectie blijft een schatting bij ruis en complexe ritmes. De UI claimt daarom geen perfecte synchronisatie.
3. De framescan is laag-resolutie en gebruikt één testsignaal en één palet. Geen claim dat de visuals fotosensitiviteitsveilig zijn. Het eerdere verslag kon met alleen gemiddelde luminantie geen volledige WCAG 2.3.1-conformiteit aantonen.
4. Shaderkosten (vooral Landscape en Urchin) blijven een risico op telefoons. Automatische resolutie bestaat; 60 FPS op iPhone is niet aangetoond.
5. Native iOS gebruikt nog v1. De aparte Android-TV-branch/APK/keystore is niet opgenomen in deze webreview of gewijzigd. Oude branches en pakketten zijn niet verwijderd.
6. Laat PR #4 eerst op de doeltelefoon bekijken; merge/publicatie blijft bij Mo. Claude's verslag is als historisch verslag behouden, niet herschreven alsof alle oorspronkelijke claims bewezen zijn.
