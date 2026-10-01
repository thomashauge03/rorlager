# Promofilmen «Ta ut rør»

Forklaringsfilmen for rørlageret: slik tar kunden ut rør og deler med
mobilen, i fem steg. Laget med [Remotion](https://www.remotion.dev/) (video
skrevet i React), i samme serie som Leveringsseddel-filmen
(`hauge-maskin-grus/demo/kundeseddel/`) og «Leie maskin»
(`utleie-app/promo/`), og med byggeklossene fra den siste.

Skjermene i filmen er ikke skjermopptak, men appens kundesider gjenskapt fra
koden og fargene i `src/`, med oppdiktede data. Rørreolen, hylleskiltet,
delehylla og logoen er tegnet i vektor. Derfor er alt skarpt i 4K, og ingen
ekte kunde eller uttak er brukt. Et opptak av den ekte appen ville registrert
et ekte uttak og trukket lageret.

Designet står i
[docs/superpowers/specs/2026-10-01-promofilm-rorlager-design.md](../docs/superpowers/specs/2026-10-01-promofilm-rorlager-design.md).

## Versjoner

| Komposisjon  | Format      | Lengde | Til                        |
| ------------ | ----------- | ------ | -------------------------- |
| `Hovedfilm`  | 16:9, 4K    | ~47 s  | nettside, YouTube          |
| `Reels-9x16` | 1080 × 1920 | ~32 s  | Reels, TikTok, Shorts      |
| `Feed-4x5`   | 1080 × 1350 | ~32 s  | Facebook, Instagram (feed) |
| `Miniatyr`   | 1920 × 1080 | bilde  | plakat og YouTube-miniatyr |

`Tegninger` og `Skjermer` i mappa `Proever` viser tegningene og skjermene
hver for seg.

## Komme i gang

Prosjektet har egne pakker, adskilt fra appen. `promo/` står utenfor appens
ESLint og Vercel (`.vercelignore`), og appens TypeScript, Tailwind og Vitest
leser bare `src/`, så appen bygges som før.

```bash
cd promo
npm install
```

Musikken ligger ikke i git (lisensen tillater ikke å spre fila alene). Last
den ned fra lenken i [public/musikk/KILDE.md](public/musikk/KILDE.md) og legg
den som `public/musikk/spor.mp3`. Det er samme spor som i leiefilmen, så den
kan også kopieres derfra.

## Se og rendre

```bash
npm run studio              # forhåndsvisning i nettleseren
npm run sjekk               # typer + at klippene ligger på slag og treffer sluttslaget
node scripts/render.mjs     # alle versjonene til out/leveranse/
node scripts/kontaktark.mjs Hovedfilm 100 400 800 --skala=0.25   # stillbilder på ett ark
```

`render.mjs` går via ProRes 4444 og koder så H.264 med `-tune grain`, og
normaliserer lyden til −14 LUFS. Den trenger ffmpeg i PATH.

## Slik henger det sammen

- **Takten styrer klippene.** Sporet går på 101,85 BPM, og planene i
  [src/versjoner/planer.ts](src/versjoner/planer.ts) gir hver scene et helt
  antall slag. Grooven slår inn når steg 1 begynner, og fire slag før
  sluttkortet hopper musikken (på en taktgrense) til sporets egen avslutning,
  så sluttslaget kommer idet logoen vises.
- **Scenene** i [src/scener/](src/scener/) har tidene sine øverst (`SKANN`,
  `MENGDE`, `FLERE`, `SEND`, `TAMED`), og er skrevet for lengdene i `LENGDE`
  ([src/tid.ts](src/tid.ts)). Kortversjonene spiller dem rundt 1,5 ganger så
  fort. Lydeffektene henter tidene derfra
  ([src/scener/register.tsx](src/scener/register.tsx)).
- **Skjermene** i [src/app/](src/app/) er kopier av kundesidene i appen
  (`Index`, `PipePage` med `QuantityInput`, `Scanner`, `Cart`, `Checkout`,
  `Receipt`), med «Vis priser» av. Blokkene står på plasser regnet ut fra
  Tailwind-klassene, så fingeren vet hvor den skal trykke. Endres sidene mye,
  bør skjermene følge etter.
- **Hylleskiltet og etiketten** ([src/tegning/Hylleskilt.tsx](src/tegning/Hylleskilt.tsx))
  er gjenskapt fra `src/lib/qr-labels.ts` i millimeter.
- **Dataene** står i [src/data.ts](src/data.ts). Varene er ekte, fra
  katalogen; kunden, uttaket, hylleplassen og beholdningen er oppdiktet.
- **QR-kodene** er ekte, men peker til `https://haugemaskin.no`, aldri til en
  rørside. Ingen kan registrere et uttak fra filmen.
- **Lydeffektene** er laget fra bunnen av i `scripts/lydeffekter.mjs`
  (`npm run lyd`), så det finnes ingen lisens å holde styr på for dem.

## Innholdet

Teksten sier bare det appen gjør i dag. Bestilling til henting er slått av i
produksjon og er ikke med. Filmen lover ikke kvittering på e-post (uttaket
sender ingen), og den nevner ikke priser: de følger prislista og påslaget,
og uttaket viser dem eks. mva.
