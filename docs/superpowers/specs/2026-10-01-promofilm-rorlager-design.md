# Promofilm: slik tar du ut rør

**Dato:** 01.10.2026
**Status:** Design, godkjent innhold. Bygges i `promo/`.

## Mål

En kort forklaringsfilm som viser kunden hele uttaket på rørlageret: skann
koden på hylla, velg mengde, legg flere varer i kurven, send inn, ta med
varene. Den er den tredje i serien etter Leveringsseddel-filmen
(`hauge-maskin-grus/demo/kundeseddel/`) og «Leie maskin»
(`utleie-app/promo/`), og skal se ut, høres ut og bevege seg som dem.

## Avgjørelser

| Spørsmål | Valg |
|---|---|
| Type | Forklaringsfilm, «STEG N AV 5», rolig tempo. Ingen 3D-teaser |
| Bruk | Nettside + YouTube (16:9), Reels/TikTok/Shorts (9:16), feed (4:5) |
| Flyt | Uttaket på lageret. Bestilling til henting er slått av i produksjon og er ikke med |
| Lyd | «Smart Sparks», samme spor og takt som leiefilmen, valgt av Thomas 01.10. Lydeffekter laget i kode. Ingen speaker |
| Varer | Avløpsrør PVC 110 mm og Bend grunnavløp 45° 110 mm, ekte navn og varenummer fra katalogen |
| Bilder | Rørhylla, hylleskiltet, delehylla og etiketten tegnes i kode, i HM-stil |
| Pris | Vises ikke (se Priser) |
| Verktøy | Remotion 4.0.527, byggeklosser kopiert fra `utleie-app/promo` |

## Dreiebok (16:9, ca. 47 s)

| Tid | Hva skjer | Tekst |
|---|---|---|
| 0–5 s | Tre skrå plater (lukkeren fra mobilappen) glir av og avdekker logoen | **Ta ut rør** / med mobilen |
| 5–12 s | Tegnet rørhylle med rødbrune avløpsrør og hylleskiltet. Telefonen kommer opp foran den med kameraet åpent, søkeren låser på koden, pip, «Åpne siden» trykkes, rørsiden glir opp | **01** STEG 1 AV 5 · **Skann koden på hylla** / Bruk kameraet på mobilen. Ingen app, ingen innlogging. |
| 12–19 s | Rørsiden (AVLØPSRØR · Avløpsrør PVC · 110 mm · På lager). Fingeren trykker +10, +1, +1, og tallet ruller 0 → 10 → 11 → 12 m. «Legg i handlekurv» | **02** · **Hvor mye tar du ut?** / Tast inn meter, eller trykk på knappene. |
| 19–25 s | Tilbake på forsiden med kurvlinja nederst («1 vare · 12 m»). «Skann QR-kode» åpner appens egen skanner, som låser på etiketten på hyllekanten. Bend grunnavløp 45°: +2, +2 → 4 stk. «Legg i handlekurv», kurvmerket teller til 2 | **03** · **Flere varer?** / Skann neste kode. Rør og deler havner i samme kurv. |
| 25–34 s | Kurven med to varer → «Gå videre» → «Send inn uttak». Navn, telefon, e-post og prosjekt fylles med tastaturet. «Send inn uttak» setter seg ned i skyggen | **04** · **Send inn uttaket** / Navn, telefon og e-post. Prosjekt eller adresse hvis du vil. |
| 34–42 s | «Uttaket er registrert», uttak nr. 1042, pling. Telefonen glir til høyre og teksten bytter side; bak telefonen står hylla uskarp. Mot slutten går fokus fra telefonen til hylla (omvendt av steg 1), og to rør glir ut av hylla | **05** · **Ta med varene** / Kvitteringen ligger på mobilen. Uttaket faktureres i etterkant. |
| 42–47 s | Platene, logoen | **Selvbetjent rørlager.** |

**Takten** er den samme som i leiefilmen, så musikkplanen kan brukes uendret.
Hver scene har et helt antall slag (101,85 BPM):

| Versjon | Åpning | Skann | Mengde | Flere | Send inn | Ta med | Sluttkort | Lengde |
|---|---|---|---|---|---|---|---|---|
| Hovedfilm | 8 | 12 | 12 | 10 | 16 | 14 | 126 bilder | ca. 46,6 s |
| Kort (9:16, 4:5) | 4 | 8 | 8 | 7 | 11 | 10 | 100 bilder | ca. 31,6 s |

Begge har et helt antall takter fram til sluttkortet (72 og 48 slag), slik
hoppet til sporets avslutning krever. Kortversjonene har de samme fem stegene,
raskere, med kortere åpning og slutt. Teksten står over telefonen, innenfor
trygg sone for Reels (ikke nederste 20 %, ikke høyre kant).

### Påstander

Teksten sier bare det appen faktisk gjør i dag:

- Bestilling til henting er slått av i produksjon
  (`pipe_public_order_settings.accept_orders = false`, sjekket 01.10.2026), så
  den er ikke med.
- Ikke «kvittering på e-post». Uttaket sender ingen e-post; e-postfeltet brukes
  «hvis vi må sende deg dokumentasjon» (`Checkout.tsx`).
- Ikke åpningstider, ikke «døgnåpent», og ikke «husker deg neste gang».
- «Ingen app, ingen innlogging»: QR-koden åpner nettsiden, og kunder logger
  ikke inn (innlogging er for ansatte).
- «Uttaket faktureres i etterkant» bygger på kassens egen tekst: «Vi lagrer
  navn og mobilnummer for å kunne fakturere uttaket.»
- «Kvitteringen ligger på mobilen»: kvitteringssiden vises etter innsending,
  med «Last ned PDF».

### Priser

Vises ikke, selv om produksjonen har `show_prices = true`:

- Prisene følger prislista fra Dahl og påslaget, men filmen lever i årevis.
- Uttaket viser katalogprisen eks. mva uten å si det, og reklame mot
  privatpersoner må ha pris inkl. mva. Merkingen i appen er en egen oppgave.
- Leiefilmen viser heller ikke pris.

Skjermene tegnes slik appen ser ut med «Vis priser» av, som er en innstilling
appen har: ingen prisrad på rørsiden, ingen summer i kurv, kasse og kvittering,
og kurvlinja viser mengden («12 m · 4 stk»). Hylleskiltet og etiketten har pris
av som standard (`qr-labels.ts`), så de er like dem som henger på lageret.

### Data i filmen

Alt om kunden og uttaket er oppdiktet: Kari Nordmann, 900 00 000,
kari@example.com, «Byggefelt Vest, tomt 4» (appens egen plassholder), uttak
nr. 1042, 2. oktober 2026 kl. 07:42 (vises som «02.10.26 07:42», appens
format). Statuslinja viser 07:38 i steg 1.

Varene er ekte, fra katalogen:

| Vare | Varenr. | Kode | Hylle (oppdiktet) | På lager (oppdiktet) | Uttak |
|---|---|---|---|---|---|
| Avløpsrør PVC, 110 mm | 2251059 | `avlopsror-pvc-110-mm` | B3 | 48 m | 12 m |
| Bend grunnavløp 45°, 110 mm | 2252269 | `bend-grunnavlop-45gr-110-mm` | C1 | 36 stk | 4 stk |

I produksjon har ingen varer hylleplass ennå, og alt står på 0 på lager.
Filmen viser hylle og beholdning slik det blir når lageret er telt opp.
Koden under QR-en på skiltet og etiketten er varens ekte kode (sjekket mot
katalogen 01.10.2026), men QR-mønsteret i bildet koder
`https://haugemaskin.no`, aldri en rørside. Ingen kan registrere et uttak fra
filmen.

## Utseende

Samme system som leiefilmen (se dens spec, avsnittet «Utseende»), i
1920 × 1080: bruddet som bakgrunn med rødt lys bak telefonen og vignett,
tekstsøyla (DM Sans, nummer, «STEG N AV 5», tittel, undertekst, rød strek),
HM-logo oppe til høyre, fem framdriftsstreker under tekstsøyla, telefonen
(464 × 981), fingertuppen og filmkornet. Det nye er skjermene og det tegnede.

### Skjermene

Rørlagerets kundesider tegnet på nytt fra koden, med appens tokens
(`src/index.css`) og font (DM Sans), i lys modus og med «Vis priser» av. Altså
den lyse bakgrunnen med rød glød og 44 px-rutenett, den svarte topplinja med
rød kant og logoen på hvit plate, hvite kort og primærrødt.

| Skjerm | Kilde i appen | Brukes i |
|---|---|---|
| Kamera (telefonens kameraapp, «Åpne siden») | leiefilmens `Kamera`, nytt motiv | steg 1 |
| Rørside med mengdefelt (−/+, tallfelt, +1 +5 +10 +25 +50; for stk +1 +2 +5 +10) | `PipePage.tsx`, `QuantityInput.tsx` | steg 2, 3 |
| Bekreftelsen «12 m Avløpsrør PVC 110 mm lagt i kurven» | `PipePage.tsx` (toast) | steg 2, 3 |
| Forside med «Skann QR-kode» og kurvlinja | `Index.tsx`, `CartBar.tsx` | steg 3 |
| Appens skanner («Skann QR-koden», rød søkeramme) | `Scanner.tsx` | steg 3 |
| Kurv | `Cart.tsx` | steg 4 |
| Kasse («Dette tar du ut», skjema, «Send inn uttak») | `Checkout.tsx` | steg 4 |
| Kvittering («Uttaket er registrert», varer, «Last ned PDF», «Nytt uttak») | `Receipt.tsx` | steg 5 |

Tastaturet er det mørke fra leiefilmen: bokstaver for navn, e-post og
prosjekt, telefontastatur for telefonnummeret.

### Det tegnede

- **Rørhylla:** HM-formspråket fra vibroplaten: kraftige mørke konturer,
  flater med 2–3 toner, hard 3D-skygge som ekstruderingen i logoen. En
  grenreol i grafitt med armer, og rødbrune PVC-rør liggende i lag, sett fra
  siden med muffe i den ene enden. Hylleskiltet henger på stolpen.
- **Hylleskiltet:** A5 liggende, gjenskapt fra `buildShelfSignPDF` i
  `src/lib/qr-labels.ts`: rød kant øverst, QR med koden under, «AVLØPSRØR»,
  «Avløpsrør PVC», «110 mm», «Varenr. 2251059», «Hylle B3», «Skann for å
  registrere uttak», «Hauge Maskin AS» og logoen.
- **Delehylla og etiketten:** en hylle med kasser av rødbrune 45°-bend.
  Etiketten fra etikettarket (`buildLabelSheetPDF`, to per rad) sitter på
  hyllekanten: QR, «Bend grunnavløp 45°», «110 mm», «Varenr. 2252269»,
  «Hylle C1».
- **Logoen:** vektorlogoen fra leiefilmen (`src/merke/hm-logo-vektor.ts`).

### Bevegelse

Samme kurver og regler som leiefilmen:

- Aldri samme kamerabevegelse to ganger på rad. Telefonen står til venstre i
  steg 1–4 og glir til høyre i steg 5; teksten bytter side.
- Stegbytte: nummeret ruller (01 → 02), tittelen avdekkes bak en skrå maske
  (−18°), streken tegnes ut.
- Fingertrykk med ring og støt i telefonen. Tastatur med taster som lyser i
  takt, og siden ruller så feltet står over tastaturet. «Send inn uttak»
  setter seg ned i skyggen.
- Mengden ruller når knappene trykkes. Kurvmerket teller opp. Ingen sprett.
- Steg 1 og 5 speiler hverandre: i steg 1 går fokus fra hylla til telefonen,
  i steg 5 fra telefonen tilbake til hylla.
- Svakt filmkorn over alt.

## Lyd

- **Musikk:** «Smart Sparks» av kissan4, fra Pixabay, samme fil og samme
  takt som leiefilmen (101,85 BPM, `src/musikk/takt.json`). Samme musikkplan:
  filmen starter på takt 1, grooven slår inn når steg 1 begynner, alle
  scenebytter ligger på slag, og fire slag før sluttkortet hopper musikken til
  sporets egen avslutning, så sluttslaget kommer idet logoen vises.
  `npm run sjekk` passer på dette. Fila ligger ikke i git; `KILDE.md`
  kopieres.
- **Effekter:** laget i `scripts/lydeffekter.mjs` (kopiert): sveip, trykk,
  tast, pip (skann), pling (uttaket er registrert), dunk (logo), plater.
- **Nivå:** −14 LUFS, topper under −1,5 dBTP.

## Leveranse (`promo/out/leveranse/`)

| Fil | Format | Lengde |
|---|---|---|
| `hm-rorlager-4k.mp4` | 3840 × 2160 | ca. 46,6 s |
| `hm-rorlager-1080p.mp4` | 1920 × 1080 | ca. 46,6 s |
| `hm-rorlager-reels-9x16.mp4` | 1080 × 1920 | ca. 31,6 s |
| `hm-rorlager-feed-4x5.mp4` | 1080 × 1350 | ca. 31,6 s |
| `hm-rorlager-plakat.jpg` / `youtube-miniatyr.jpg` | 1920 × 1080 / 1280 × 720 | |

30 bilder/s. Tegnet i 1920 × 1080 og rendret med `--scale=2`. ProRes 4444
som mellomledd, så H.264 (`-tune grain`, CRF 15, BT.709-merket).

## Teknisk oppsett

- `promo/` i rørlageret, med egen `package.json` (npm) og Remotion 4.0.527
  som leiefilmen, uten 3D-pakkene (three, drei, fiber, postprocessing).
- Appen skal ikke merke noe. `promo` legges i ESLint-ignores
  (`eslint.config.js` lintet ellers alle `**/*.{ts,tsx}`) og i en ny
  `.vercelignore`. TypeScript (`tsconfig.app.json` tar bare `src`), Tailwind
  (leser `./src`) og Vitest (`src/**`) ser allerede ikke `promo/`.
  `npm run build`, `npm run lint` og `npm test` skal gå som før.
- Musikkfila ligger ikke i git (lisensen tillater ikke å spre fila alene).

## Utenfor

- Innbygging på nettsiden (`/ror` og «Rør og deler» på forsida i
  hm-web-craft). Egen oppgave når filmen er godkjent.
- 3D-teaser i kinofilmens stil.
- Bestilling til henting, uttak for ansatte og prosjektkjeden.
- Speakerstemme og undertekster.
- Mva-merking av prisene i appen (egen oppgave).
