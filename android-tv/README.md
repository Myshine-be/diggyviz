# DiggyViz voor Android TV / Google TV

Een kleine app die de live webapp (https://myshine-be.github.io/diggyviz/) schermvullend opent op een Android TV of Google TV, met een tegel op het startscherm. Visuals en updates komen van de website, dus de app hoeft zelden opnieuw.

**Download:** zie de release `android-tv` op GitHub (bestand `DiggyViz-TV.apk`). Die wordt automatisch gebouwd door `.github/workflows/android-tv.yml` bij elke wijziging in deze map.

## Installeren
1. Op de tv: Instellingen → Systeem → Over → 7× op **Build** → je bent ontwikkelaar.
2. Ontwikkelaarsopties → **USB-debugging** en **Netwerk-debugging** aan.
3. Zoek het IP-adres van de tv (Instellingen → Netwerk).
4. Op een computer in hetzelfde wifi-netwerk (Android platform-tools nodig):
   ```
   adb connect 192.168.1.42        # IP van je tv
   adb install -r DiggyViz-TV.apk
   ```
5. Op de tv verschijnt "USB-debugging toestaan?" → **Toestaan**.
6. Daarna kun je debugging weer uitzetten.

## Afstandsbediening
| Knop | Wat |
|---|---|
| ◀ ▶ | Vorige / volgende visual |
| OK | Knoppen tonen/verbergen, knop kiezen |
| MENU | Instellingen (Spotify, Last.fm, koppelcode) |
| TERUG | Venster sluiten, daarna app verlaten |

Inloggen met Spotify: log in op je telefoon, ⚙ → *Kopieer koppelcode*, en plak die op de tv onder ⚙ → *Koppelcode gebruiken*. Of kies Last.fm / Gewoon kijken.

## Technisch
- Java + Android `WebView`, geen extra libraries. minSdk 24, target 34.
- `diggyviz-tv.keystore` is een **debug-sleutel** (wachtwoord `android`) zodat updates over een vorige installatie heen gaan. Niet geheim, niet voor de Play Store.
- Lokaal bouwen: `cd android-tv && gradle :app:assembleRelease` (Android SDK nodig).
