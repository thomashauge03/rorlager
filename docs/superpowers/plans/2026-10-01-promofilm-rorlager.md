# Promofilm «Ta ut rør»: arbeidsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Bygges direkte i denne økta. Thomas vil se filmen framfor å lese planer.
> Visuelt arbeid kontrolleres med stillbilder og kontaktark
> (`node scripts/kontaktark.mjs`), ikke med enhetstester. Tidslinja har en
> liten test (`npm run sjekk`).

**Mål:** Filmen i specen, i tre formater, med lyd.

**Arkitektur:** En kopi av `utleie-app/promo` (Remotion) uten kinofilmen og
3D. De felles byggeklossene (telefon, finger, tastatur, stegtekst, ramme,
bakgrunn, korn, plater, tempo), merket (logo, QR), lydsporet og skriptene
beholdes. Skjermene, tegningene og scenene byttes ut med rørlagerets.

**Stack:** Remotion 4.0.527, React 19, TypeScript. Node-skript for lyd og QR
(ingen Python på maskinen).

**Spec:** [docs/superpowers/specs/2026-10-01-promofilm-rorlager-design.md](../specs/2026-10-01-promofilm-rorlager-design.md)

## Globale regler

- Alt skriftlig på bokmål. Bare påstandene i specen; ingen priser noe sted.
- Ingen CSS-animasjoner. Alt drives av bildenummeret (`useBilde()`).
- Skarphet: tegn i endelig størrelse (CSS `zoom` på telefonen), ingen
  `will-change`, og ingen oppskalering av rasterlag.
- Appen skal bygge, linte og teste som før (`npm run build`, `npm run lint`,
  `npm test`).
- Musikkfila skal aldri i git.

## Filstruktur (`promo/`)

```
package.json, tsconfig.json, remotion.config.ts, .gitignore, README.md
scripts/
  lydeffekter.mjs   lydeffektene (kopiert)
  lag-qr.mjs        QR-matrisen for https://haugemaskin.no (kopiert)
  render.mjs        alle versjonene → out/leveranse (kopiert, nye filnavn)
  kontaktark.mjs    stillbilder → ett ark (kopiert)
  sjekk-tider.mjs   klipp på slag, sluttslag på logoen (kopiert, nye scener)
  takt.mjs          måler takten i sporet (kopiert)
public/
  bakgrunn/brudd.jpg, korn/*.png, lyd/*.wav,
  musikk/KILDE.md (spor.mp3 ligger lokalt, ikke i git)
src/
  index.ts, Root.tsx
  tid.ts            scenene, lengdene, takten
  tema.ts           farger (film + rørlager-appen), kurver
  fonter.ts         DM Sans
  format.ts         liggende / feed / staaende
  musikk/takt.json  slagene i sporet (kopiert)
  felles/           kopiert: Tempo, Korn, Bakgrunn, Rigg, Telefon, Finger,
                    Tastatur, Stegtekst, Ramme, Plater, hjelp, kamera,
                    skriving, oppsett
  merke/            kopiert: HmLogo, hm-logo-vektor, Qr, qr-data
  tegning/          Rorhylle, Hylleskilt, Delehylle (med etiketten)
  app/              deler (rørlagerets byggeklosser), Kamera, Motiv, Forside,
                    Rorside, Skanner, Kurv, Kasse, Kvittering
  scener/           Apning, Skann, Mengde, Flere, SendInn, TaMed, Slutt,
                    register.tsx (scener + lyd per scene)
  lyd/Lydspor.tsx   musikkbiter og effekter (kopiert)
  versjoner/        Klipp, Hovedfilm, Miniatyr (kopiert), planer.ts (nye slag)
```

## Oppgaver

- [ ] **1. Grunnmur.** `promo/` med pakker (uten 3D), konfig, felles,
  merke, lyd, skript og musikk. `Root.tsx` med de fire komposisjonene og en
  midlertidig scene. `promo` i appens ESLint-ignores og i ny `.vercelignore`.
  *Ferdig når:* `npx remotion still` gir et bilde med bakgrunn, logo og
  stegtekst, `npm run sjekk` er grønn i `promo/`, og appens build, lint og test
  er grønne.
- [ ] **2. Tegningene.** Rørhylla, hylleskiltet (fra `buildShelfSignPDF`),
  delehylla med etiketten (fra `buildLabelSheetPDF`). *Ferdig når:*
  stillbildet «Tegninger» viser en hylle som leses som en rørhylle, et skilt
  likt PDF-en appen lager, og en etikett som sitter troverdig på hyllekanten.
- [ ] **3. Skjermene.** Rørlagerets byggeklosser (topplinje, kort, knapper,
  felt, kurvlinje) og sidene: forside, rørside med mengdefeltet, appens
  skanner, kurv, kasse og kvittering, med «Vis priser» av. Kameraet og
  motivene (skiltet, etiketten). *Ferdig når:* stillbildet «Skjermer» ved
  siden av appen kjørt lokalt viser samme tekster, farger, kanter og skygger.
- [ ] **4. Scenene.** Åpning, de fem stegene og slutt, med bevegelsen i
  specen. *Ferdig når:* et kontaktark av hovedfilmen (ett bilde per sekund)
  viser hele fortellingen, og ingen tekst er kuttet.
- [ ] **5. Lyd.** Effektene på tidene i scenene, musikken etter planen.
  *Ferdig når:* en 1080p-gjennomkjøring har lyd på riktige steder, `npm run
  sjekk` er grønn, og nivået måler −14 LUFS.
- [ ] **6. Formatene.** 9:16 og 4:5 fra de samme scenene. *Ferdig når:*
  kontaktark av begge viser teksten innenfor trygg sone.
- [ ] **7. Leveranse.** `render.mjs` → filene i specen, plakat og miniatyr,
  README. *Ferdig når:* filene finnes og spiller, og ffprobe viser riktige
  mål og lengder. Appen bygger.
