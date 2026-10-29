# DiggyViz 3.0 beta — alternatieve visuele uitwerking

**Stand 29 oktober:** Claude heeft inmiddels een eigen 3.0.1 live gezet. Deze review gaat uitsluitend over
de alternatieve Codex-branch; niet zonder vergelijking met het actuele main mergen. Mo heeft de schermvullende
lyrics van Claudes 3.0.1 afgewezen en vraagt daarvoor een nieuwe, subtiele vormgeving.

Basis: Claude `18c752c`, bovenop live 2.9.1. Reviewbranch: `codex/finish-visuals-3.0`.
[Pull request #8](https://github.com/Myshine-be/diggyviz/pull/8). Geen wijzigingen aan main of deployment.

## Wat is veranderd

| Onderdeel | Resultaat |
|---|---|
| Songtekstlaag | Positiegestuurde zinsmarkering achter de visuals; plaatsing per visual; seek/pauze direct correct; Dunes-tekst beperkt tot de lucht. Orbit houdt zijn bestaande tekstbol. |
| Snake | Acht doorlopende fijne strengen volgen de bestaande route, met lokale spectrum- en onsetreacties. Kop, spel, groei en hart-easter-egg behouden. |
| Soul Beat | Zeven onafhankelijk stromende inktmassa's in een glazen bol. Lokale rek en druppels reageren op muziek. Geen zwaartepunt-aantrekking. |
| Tunnel | Wanden verdwijnen vloeiend in een donkere doorgang. Geen centrale symbolen of feedback-polygoon. |
| Dunes | Herkenbaar zand met loef/lij, windribbels, belichting, schaduw, nevel en een lage zon. Beats laten verderop grotere ruggen ontstaan; bestaande ruggen blijven staan. |
| Urchin | Verbonden clusters, lage/hoge ruimtelijke zones, afzonderlijke stekellengtes en hersteltijden, af en toe een voortplantende golf. Vaste kern; geen extra lichtpulsen. |

De bestaande audiocapture, detector, Spotify-login, snelheid van de audio-envelope en de overige visual-shaders zijn
niet veranderd. De overige visuals kregen alleen een plaatsingshint voor de songteksten.

## Controle

- Node-tests: **105 geslaagd** op codecommit `c9d4b4e`.
- **31 browsercontroles geslaagd** op `c9d4b4e`: alle 12 shaders, audioverwerking, bronwissels, stories,
  WebGL-herstel, harde aanslagen en temporele diagnostiek. Ook de nieuwe GPU-lyrics-test en herstel van de
  data-textures van Snake, Dunes en Urchin slagen. [Testrun](https://github.com/Myshine-be/diggyviz/actions/runs/40771967311).
- [Definitieve previewrun op `c9d4b4e`](https://github.com/Myshine-be/diggyviz/actions/runs/40771967143): geslaagd.
- Tien bewegende previews: vijf gewijzigde visuals in landschap en portret. De eerste reeks is bekeken via
  opeenvolgende videoframes; daarop zijn glas, Snake-lijndikte/continuïteit en de plaatsing van tekst bijgesteld.
- Echte LRCLIB-opvraag vanuit Chrome in CI: HTTP 200, gesynchroniseerde tekst aanwezig. Test vanaf localhost;
  geen bewijs van werking op ieder toestel of netwerk. Alleen status en metadata zijn bewaard, niet de tekst.
- De previews gebruiken echte audio: Vibe Ace van Kevin MacLeod (CC-BY 3.0), via librosa. Volume/EQ zijn aangepast
  en er is een stilte ingevoegd. Zie CREDITS.txt bij de video's. De Nederlandse tekst is eigen testtekst en is
  uitsluitend bedoeld om regelwissels en leesbaarheid te tonen; het is niet de tekst van het instrumentale nummer.

## Grenzen van de controle

De video's zijn deterministisch gerenderd met software-WebGL op 480×270 en 270×480, 24 fps. Dit is geen meting van
native iPhone-GPU-prestaties, batterijverbruik of volledige Spotify-audio-naar-schermvertraging. De analysefixture
benadert de FFT van Web Audio en gebruikt daarna de echte productie-detector; live hardwarecapture is niet opnieuw
getest. Een stilte in muziek maakt een bestaande zandduin niet kleiner: het landschap bewaart eerdere beats.

Vanish is inhoudelijk niet aangepast. Zijn eerder gemelde hogere temporele luminantie blijft buiten deze opdracht.
De lage-resolutie lichtmetingen zijn regressiediagnostiek, geen garantie tegen flitsgevoeligheid.

## Beoordelen vóór livegang

Bekijk vooral of Snake nu voldoende als fijne Strings-lijnen leest, de glas/inkt-uitstraling van Soul Beat klopt,
Tunnel zonder kern bevalt, Dunes rustig én voldoende muzikaal is, en Urchin genoeg verschil tussen clusters toont.
Dit zijn visuele keuzes waarvoor Mo's bewegende beoordeling doorslaggevend is. De branch blijft een beta tot die
beoordeling; geen automatische merge of publicatie.
