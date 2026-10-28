# ReciMoi

En super let, privat opskriftsapp: gem opskrifter fra Instagram, få dem delt op i ingredienser og trin,
sortér dem i dine egne kategorier, og læg ingredienserne på indkøbslisten med ét tryk.
Ingen konto, ingen server, ingen AI: alt gemmes kun på telefonen.

## Funktioner

- **Del fra Instagram** – opslagets tekst gemmes, så du har den, selv hvis opslaget slettes.
- **Opskriftsformat** – titel, portioner, ingredienser og trin foreslås ud fra teksten med enkle regler
  (genkender fx “Ingredienser:”, “Fremgangsmåde:”, mængder og nummererede trin). Ret til under **Rediger**.
- **Egne opskrifter** – tryk **＋ Ny**, eller indsæt en tekst og tryk **Udfyld felterne ud fra teksten**.
- **Kategorier** – opret, omdøb og slet dem selv; filtrér og søg i titler, tekst og ingredienser.
- **Indkøbsliste** – læg en opskrifts ingredienser på listen; ens varer lægges sammen (3 æg + 3 æg = 6 æg).

**Åbn appen:** https://jrgrafisk.github.io/ReciMoi/

## Kom i gang

### Android (Chrome)
1. Åbn linket i Chrome → menu (⋮) → **Installér app** / **Føj til startskærm**.
2. I Instagram: **Del → Opskrifter**. Opslaget gemmes, og du vælger kategori.

På Android gemmes kun linket automatisk – browseren må ikke hente tekst fra Instagram.
Tryk **Rediger** på opskriften, indsæt beskrivelsen og tryk **Udfyld felterne ud fra teksten**.

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

Ren HTML/CSS/JS uden byggetrin i `static/`: `parse.js` (tekst → opskrift), `store.js` (IndexedDB), `app.js` (UI).
Udgives automatisk på GitHub Pages ved push til `main`.

Kør lokalt: `cd static && python3 -m http.server 8000` → http://localhost:8000
