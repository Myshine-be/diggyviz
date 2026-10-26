# Afronding DiggyViz 2.5.0

Basis: Claude's overdracht in HANDOFF.md, branch v2 op 9b77f3d. Live vóór deze afwerking: 2.4.0.

## Afgewerkt

- Het hulpvenster voor tabgeluid gebruikt zijn eigen mediaDevices. Een benodigde extra klik toont de knop. Dubbele klikken starten geen tweede aanvraag. Bij succes, weigering, annuleren of sluiten worden de wachtlus en handlers opgeruimd; een late stream wordt gestopt. De actieve stream en het venster stoppen samen. Bij een geblokkeerde popup werkt de oude picker als terugval. Ook Web-Audio-setupfouten sluiten het hulpvenster.
- Meldingen leggen uit dat het venster geminimaliseerd mag worden, maar open moet blijven. Verouderde setTab-aanvragen kunnen een nieuwere uit-keuze niet overschrijven.
- De nieuwe bandcontrast-, flux-, hit- en clapvelden blijven behouden. Tests controleren aanhoudende klank versus nieuwe tonen, afzonderlijke claps en de gesimuleerde modus.
- Sterkere lokale reacties van Claude behouden; Urchin selecteert andere stekelgroepen bij nieuwe hits. De kern blijft binnen het oorspronkelijke maximum en de raymarch gebruikt maximaal 110 stappen volgens AGENTS.md.
- Globale zoom-, exposure- en bloomflits verwijderd. Dit wijkt bewust af van het WIP-plan: het botste met de bestaande projectregel tegen schermbrede beatschokken en met de eerdere klachten van Mo. Er is geen globale punch-instelling gedocumenteerd alsof die wel bestaat.
- Versie 2.5.0 en project-/testdocumentatie bijgewerkt. Geen framework, dependencies of nieuwe opslagkeys.

## Controles

Geslaagd: 59 Node-tests, syntax- en whitespacechecks en 26 browsercontroles in [GitHub Actions](https://github.com/Myshine-be/diggyviz/actions/runs/40357324798), voor commit `34b491a`. De browserworkflow controleert alle 13 shaders, audio/history, tempo-isolatie, overgangen, context restoration en storyklokken; aanvullend een stream uit een echt tweede venster naar Web Audio in het hoofdvenster en 39 rust/kick/clapbeelden. Alle 39 rust/kick/clapbeelden zijn bekeken: geen grote wit uitgebrande vlakken; Urchin blijft binnen beeld zonder zichtbare onderbroken stekels. De resultaten en beelden staan bij [PR #5](https://github.com/Myshine-be/diggyviz/pull/5) en GitHub Actions. De synthetische stressmeting toont nog stevige helderheidswissels bij onder andere Strings, Vanish en Urchin (maximale gemiddelde frameverschillen circa 0,19 / 0,15 / 0,15); dit is diagnostiek, geen bewijs van kijkcomfort.

De scripts uit `/home/claude/qa` waren niet beschikbaar in deze omgeving. De controles zijn daarom als reproduceerbare tests in de repo toegevoegd. Er zijn geen screenshots of meetresultaten uit die map aangenomen als eigen bewijs.

## Grenzen

- Een headless browser kan niet bewijzen waar Chrome/Edge zijn eigen deelbalk toont. Het hulpvenster verplaatst de aanvraag; browserbrede privacy-indicatoren worden niet verborgen of omzeild. Test op de laptop: Tab-geluid → Spotify-tabblad selecteren → tabblad-audio delen → hulpvenster minimaliseren → hoofdvenster volledig scherm.
- Geen test op een fysieke iPhone, echte Bluetooth-latentie of laptop-GPU; 60 FPS op native resolutie is niet aangetoond. De temporele luminantiemeting is geen veiligheids-/WCAG-certificering.
- De bekende kickdetectie kan offbeat-basnoten als extra kicks tellen. Niet ingrijpend veranderd, zoals de overdracht vroeg. Sterkere onsets zijn geen bewijs van perfecte BPM-detectie.
- Browserdeling van Spotify op een telefoon blijft niet ondersteund; eigen muziek en microfoon zijn afzonderlijke invoeropties.
