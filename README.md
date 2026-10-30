# Video Thumbnail Maker

Webapp die de thumbnail van een video ophaalt, er een play-knop op plaatst en het resultaat als afbeelding laat downloaden.

## Functies

- Werkt met alle gangbare videolinks (gewone, korte, shorts- en embed-links) of een kaal video-ID
- Pakt automatisch de hoogste beschikbare kwaliteit en snijdt zwarte balken weg
- Play-knop in vier stijlen (rood, rond wit, rond met eigen kleuren voor cirkel en driehoek, rond donker) of zonder knop, met instelbare grootte
- Optie om de afbeelding iets donkerder te maken zodat de knop beter opvalt
- Vaste maten van groot naar klein: 1280×720, 648×automatisch (648×365), 640×360, 648×250, 480×270 en 320×180
- Eigen formaat: vul een breedte in, en optioneel een hoogte (leeg = automatisch 16:9)
- De afbeelding wordt nooit geplet: wijkt de verhouding af van 16:9, dan wordt er bijgesneden. Met een schuifje kies je welk deel zichtbaar blijft.
- Download als PNG, JPG of WebP, los of alle vaste maten in één keer

## Gebruik

Er is geen build-stap en geen server nodig. Open `index.html` in je browser, of start een lokale server:

```bash
python3 -m http.server 8000
```

Ga daarna naar http://localhost:8000.

Alles draait in de browser. Je hebt geen API-sleutel nodig.
