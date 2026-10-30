# Beeldtools

Webapp met vier tools voor e-mail- en webafbeeldingen. Alles draait in de browser: afbeeldingen worden niet geüpload, niet opgeslagen en niet gedeeld.

## Video thumbnail

- Haalt de thumbnail van een video op via de link (gewone, korte, shorts- en embed-links of een kaal video-ID), of gebruikt een eigen geüploade afbeelding
- Play-knop in vier stijlen: rood, wit, donker of eigen kleuren (cirkel en driehoek), met instelbare grootte
- Formaten: 1280×720, 648×365 (16:9), 648×250 of een eigen formaat
- Wordt nooit geplet: bij een afwijkende verhouding wordt bijgesneden, met een schuifje voor de uitsnede
- Download als PNG, JPG of **geanimeerde GIF**: een rustige ring rond de play-knop, daarna een korte pauze. Het eerste frame is de rusttoestand, zodat programma's zonder animatie (zoals Outlook op Windows) een nette afbeelding tonen.
- Eigen bestandsnaam (standaard `Video_thumbnail_`), aangevuld met de afmetingen

## Afbeeldingen bijsnijden

- Uploaden door te slepen, bestanden te kiezen of te plakken (Ctrl+V / ⌘V), meerdere tegelijk
- Vaste formaten (max. 720 breed): 720×405, 720×300, 648×365, 648×250, 648×648, 324×324, of een eigen formaat
- Per afbeelding de uitsnede verslepen en inzoomen; nooit pletten, nooit lege randen
- Waarschuwing als een afbeelding moet worden vergroot (minder scherp)
- JPG met instelbare kwaliteit en zichtbare bestandsgrootte, of PNG
- Vorm **Rond** voor pasfoto's: 400×400, 300×300, 200×200, 120×120 of eigen doorsnede (max. 720), altijd als PNG met transparante achtergrond
- Los downloaden of alles in één ZIP-bestand

## Galerij

- Meerdere foto's samen in één afbeelding voor e-mail (één link voor de hele galerij)
- Indeling: 1 × 3, 1 × 4, 2 × 3 of 2 × 4; breedte 648 of 720 px; elke foto liggend 3:2
- Ruimte tussen de foto's: 0, 4, 8 of 12 px, in wit, transparant of een eigen kleur
- Foto's vullen de vakken op volgorde; een leeg vak aanklikken om het te vullen, later aanvullen kan altijd
- Per foto verslepen en zoomen; volgorde wijzigen door de voorbeelden te verslepen
- Download als JPG of PNG (transparant altijd PNG) zodra alle vakken gevuld zijn

## Diashow

- 2 tot 6 afbeeldingen worden een geanimeerde GIF die steeds wisselt, voor e-mail
- Formaat 648 × 365 of 648 × 450; per afbeelding verslepen en zoomen; volgorde wijzigen door te slepen
- Snelheid: traag (2,5 s), normaal (1,5 s) of iets sneller (1 s) per beeld
- Overgang: geen, vervagen of schuiven (kort, ongeveer 0,2 s)
- Elk beeld krijgt een eigen kleurenpalet voor betere fotokwaliteit
- Boven 1 MB volgt een waarschuwing, met een knop "Kleiner maken" (minder tussenbeelden en kleuren)

## Privacy

- Geen externe scripts, lettertypes, statistieken of bibliotheken; de GIF- en ZIP-functies zijn zelf geschreven
- Een Content Security Policy in `index.html` verbiedt de browser om verbindingen naar buiten te maken (`connect-src 'none'`) of scripts van elders te laden
- De enige externe bron: bij het ophalen van een videothumbnail wordt die afbeelding geladen van `i.ytimg.com`. Wie dat wil vermijden, uploadt zelf een afbeelding.
- Opgeslagen bestanden bevatten geen metadata van het origineel (zoals EXIF of locatie)

## Gebruik

Er is geen build-stap. Start lokaal een webserver in deze map:

```bash
python3 -m http.server 8000
```

Ga daarna naar http://localhost:8000.

De site staat online via GitHub Pages: https://sandervanzaane.github.io/video-thumbnail-maker/
