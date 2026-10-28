# Opskrift-gemmer

Gem Instagram-opslag (tekst + link + miniature) lokalt, og sortér dem i dine egne kategorier.
Kun Python 3 – ingen pakker, ingen sky, ingen AI. Alt ligger i `data/opskrifter.db` (+ `data/thumbs/`).

```bash
python3 server.py            # http://localhost:8000
```

Åbn `http://localhost:8000`, indsæt et Instagram-link og tryk **Gem**. Teksten hentes og gemmes i databasen,
så du har den, selv hvis opslaget slettes. Efter hver gem spørger appen om kategori (du kan oprette nye der).
Backup: "Download backup" nederst, eller kopiér `data/`-mappen.

## Del direkte fra Instagram

Telefonen skal kunne nå serveren, og Android kræver **HTTPS** for at installere appen som "del-mål".

### Android (Chrome)
1. Gør serveren tilgængelig over HTTPS på telefonen (se nedenfor).
2. Åbn adressen i Chrome → menu → **Installér app / Føj til startskærm**.
3. I Instagram: **Del → … → Opskrifter**. Opslaget gemmes, og du vælger kategori.

### iOS (Safari)
iOS understøtter ikke "Web Share Target", så den kan ikke stå direkte i delemenuen som PWA. Brug i stedet en **Genvej** (Shortcuts), som *kan* stå i delearket:
En færdig `.shortcut`-fil kan ikke leveres (iOS kræver Apple-signering). Åbn i stedet **`/ios.html`** fra iPhonen
(link nederst i appen) – den viser trinene med din serveradresse udfyldt. Kort fortalt:
URL-kod *Input fra genvej* → Tekst `http://DIN-SERVER:8000/share?url=` + resultatet → **Åbn URL'er**,
og slå **Vis i delingsark** til (modtag URL'er).

Genvejen virker også på HTTP i hjemmenetværket; iOS kræver ikke HTTPS til dette.

## Adgang fra telefonen

Serveren lytter på alle netværkskort (`--host 127.0.0.1` for kun denne computer). Startmeddelelsen viser LAN-adressen.
Der er **ingen login** – kør den kun på netværk, du stoler på.

HTTPS til Android – to muligheder:
- **Tailscale** (nemmest): `tailscale serve --bg 8000` giver en rigtig `https://…ts.net`-adresse kun til dine egne enheder. Data bliver stadig kun på din computer, men Tailscale er en (gratis) tjeneste til selve forbindelsen.
- **Helt uden eksterne tjenester**: lav et certifikat med [mkcert](https://github.com/FiloSottile/mkcert), installér dets rod-certifikat på telefonen, og start med
  `python3 server.py --cert cert.pem --key key.pem`.

## Begrænsninger

- Instagram har ikke et åbent API. Teksten hentes fra den offentlige side/embed-siden, og det kan gå i stykker, når Instagram ændrer noget – eller for private konti. Så gemmes opslaget alligevel, og du kan trykke **Hent igen** eller **Rediger** og indsætte teksten selv.
- Miniaturen gemmes lokalt ved første hentning. Videoer gemmes ikke, kun linket.
- Stories understøttes ikke (kun `/p/`, `/reel/`, `/tv/`).
