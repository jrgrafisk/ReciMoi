# ReciMoi

Gem opskrifter og andre opslag fra Instagram på din telefon – med tekst, link og dine egne kategorier.
Ingen konto, ingen server, ingen AI: alt gemmes kun på telefonen.

**Åbn appen:** https://jrgrafisk.github.io/ReciMoi/

## Kom i gang

### Android (Chrome)
1. Åbn linket i Chrome → menu (⋮) → **Installér app** / **Føj til startskærm**.
2. I Instagram: **Del → Opskrifter**. Opslaget gemmes, og du vælger kategori.

På Android gemmes kun linket automatisk – browseren må ikke hente tekst fra Instagram.
Tryk **Rediger** på opslaget for at indsætte beskrivelsen.

### iPhone (Safari)
iPhone tillader ikke webapps i Del-menuen, så delingen går via en genvej, der også henter teksten.
Åbn **iPhone-genvej** nederst i appen og følg vejledningen.

Brug appen i **Safari** (som bogmærke) – ikke fra hjemmeskærmen, for på iPhone har hjemmeskærms-apps
deres egen lagring, og opslag fra genvejen havner i Safari.

## Dine data

- Alt ligger i browserens lagring på telefonen. Intet sendes nogen steder hen.
- Sletter du browserdata/appen, forsvinder opskrifterne. **Download backup** jævnligt (appen minder dig om det
  hver 14. dag) og gendan med **Gendan backup**. Backup-filen kan også flyttes til en anden telefon.
- Safari på iPhone kan rydde data fra sider, man ikke har besøgt i længere tid – endnu en grund til backup.
- Teksten gemmes i appen, så den bliver, selv hvis opslaget slettes på Instagram.

## Begrænsninger

- Instagram har intet åbent API. iPhone-genvejen læser den offentlige side; viser Instagram en login-side,
  gemmes kun linket, og teksten kan indsættes med **Rediger**.
- Billeder og videoer gemmes ikke – kun link til opslaget.
- Kun opslag, reels og IGTV (`/p/`, `/reel/`, `/tv/`) – ikke stories.

## Udvikling

Appen er ren HTML/JS i `static/` og udgives automatisk på GitHub Pages ved push til `main`
(Settings → Pages → Source: **GitHub Actions**).

Kør lokalt: `cd static && python3 -m http.server 8000` → http://localhost:8000

`server.py` er en valgfri server-udgave (Python, SQLite), som henter tekst og miniaturebilleder automatisk
for alle enheder: `python3 server.py`. Den samme frontend skifter selv til server-tilstand, når den finder serveren.
