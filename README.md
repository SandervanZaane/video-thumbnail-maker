# Video Thumbnail Maker

Webapp die de thumbnail van een video ophaalt, er een play-knop op plaatst en het resultaat als afbeelding laat downloaden.

## Functies

- Werkt met alle gangbare videolinks (gewone, korte, shorts- en embed-links) of een kaal video-ID
- Pakt automatisch de hoogste beschikbare kwaliteit en snijdt zwarte balken weg
- Play-knop in drie stijlen (rood, rond wit, rond donker) of zonder knop, met instelbare grootte
- Optie om de afbeelding iets donkerder te maken zodat de knop beter opvalt
- Vier vaste maten (1280×720, 640×360, 480×270, 320×180) of een eigen breedte (16:9)
- Download als PNG, JPG of WebP, los of alle vier de maten in één keer

## Gebruik

Er is geen build-stap en geen server nodig. Open `index.html` in je browser, of start een lokale server:

```bash
python3 -m http.server 8000
```

Ga daarna naar http://localhost:8000.

Alles draait in de browser. Je hebt geen API-sleutel nodig.
