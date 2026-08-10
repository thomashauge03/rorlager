# Rørlager – Hauge Maskin

Selvbetjent uttak av rør fra lageret. Kunden skanner QR-koden som henger på hylla,
velger antall meter, legger det i handlekurven og sender inn. Admin ser alt,
styrer lageret, skriver ut QR-etiketter og lager fakturagrunnlag som PDF.

```
QR på hylla  ->  /r/<kode>  ->  handlekurv  ->  innsending  ->  adminpanel  ->  PDF / faktura
```

## Kom i gang

```bash
npm install
npm run dev          # http://localhost:8080
```

### Database

Åpne Supabase-prosjektet -> **SQL Editor** -> lim inn hele [`supabase-setup.sql`](supabase-setup.sql)
og trykk Run. Den oppretter tabeller, tilgangsregler, funksjoner og varekatalogen.

Har du allerede kjørt oppsettet én gang, kjør [`supabase-oppdatering.sql`](supabase-oppdatering.sql)
i stedet — den inneholder bare det som er nytt.

Sjekk at alt sitter:

```bash
npm run check:db
```

`.env` må peke på samme prosjekt:

```
VITE_SUPABASE_URL="https://<prosjekt>.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="<anon key>"
```

### Admintilgang

Innlogging går gjennom Supabase Auth. Opprett brukeren under **Authentication ->
Users** i Supabase, og logg inn på `/login`. Superadmin (den som kan administrere
brukerregisteret på `/admin/brukere`) styres av tabellen `super_admins`.

## Sider

| Adresse | Hva den gjør |
| --- | --- |
| `/` | Framside: søk i katalogen, skann QR, se handlekurven |
| `/r/:kode` | Målet for QR-koden – én rørtype, antall meter, legg i kurv |
| `/kurv` | Handlekurven |
| `/kasse` | Navn, telefon, prosjekt, eventuell signatur |
| `/kvittering` | Kvittering med ordrenummer og PDF |
| `/login` | Innlogging admin |
| `/admin` | Bestillinger, Lager, QR-koder, Faktura, Innstillinger |
| `/admin/brukere` | Brukerregister (kun superadmin) |

## Slik henger det sammen

**Prisene ligger i databasen, ikke i nettleseren.** Innsending går gjennom
databasefunksjonen `pipe_submit_order`, som slår opp navn, enhet og pris på nytt
for hver linje. En kunde som endrer prisen i nettleseren endrer ingenting.

**Beholdningen trekkes ned med én gang** et uttak sendes inn, og hver endring
havner i `pipe_stock_log`. Beholdningen får gå i minus – det er reell informasjon
om at noen har tatt mer enn lageret viste, og skjules ikke.

**Slettes en bestilling, går rørene tilbake på lageret** (`pipe_delete_order`),
og tilbakeføringen logges.

**Fakturagrunnlaget peker begge veier:** bestillingene får `invoice_id`, så det er
alltid mulig å se hvilket grunnlag en bestilling havnet på – og å angre.

## Priser og avanse

Varekatalogen kommer fra prislisten til Brødrene Dahl (tilbud 94587). Prisene der
er **netto innkjøpspris eks. mva**, og ligger i `cost_price`. Salgsprisen i
`price` er innkjøpsprisen med et påslag oppå.

Påslaget styres ett sted: **Admin → Innstillinger → Prisjustering**. Der velger du
prosent, avrunding og om det skal gjelde alle varer eller én varegruppe, ser en
forhåndsvisning, og oppdaterer. Utgangspunktet er 25 %.

Prisen **regnes ut og lagres** — den utledes ikke ved visning. Det er med vilje:
`pipe_submit_order` slår opp prisen i `pipe_types` når en bestilling kommer inn,
og hver ordrelinje beholder sin egen pris. Ble prisen regnet ut på nytt ved hver
visning, ville gamle bestillinger endret seg hver gang påslaget ble justert.

Kommer det ny prisliste fra Dahl, oppdaterer du `cost_price` og kjører
prisjusteringen på nytt.

## Struktur

```
src/
  pages/          framside, rørside, kurv, kasse, kvittering, admin
  components/     TopBar, CartBar, QuantityInput, SignaturePad, StatusBadge
    admin/        OrdersTab, StockTab, QrTab, InvoiceTab, SettingsTab
  lib/
    cart.ts       handlekurven (localStorage)
    orders.ts     alle databasekall
    stock.ts      lagerstatus, søk og sortering
    qr-labels.ts  QR-koder, etikettark og hylleskilt
    order-pdf.ts  uttaksseddel og plukkliste
    invoice-pdf.ts fakturagrunnlag
supabase/migrations/   databaseskjemaet
```

## Test

```bash
npm test
```

## Utrulling til Vercel

1. Push repoet til GitHub
2. Vercel → **Add New → Project** → importer `rorlager`
3. Framework blir gjenkjent som Vite. Standardvalgene stemmer:
   build `npm run build`, output `dist`
4. **Deploy**

`vercel.json` sender alle ruter til `index.html`, som er nødvendig fordi
`/r/<kode>` og `/admin` er klientruter — uten den gir et direkte treff på en
QR-lenke 404.

### Miljøvariabler

`.env` ligger i repoet, så bygget på Vercel finner Supabase-koblingen av seg
selv. Det er trygt her: `anon`-nøkkelen er ment å være offentlig, og havner
uansett i JavaScript-bunten som sendes til enhver besøkende. Det som beskytter
dataene er RLS-reglene i `supabase-setup.sql`, ikke at nøkkelen er hemmelig.

Vil du heller styre den fra Vercel, sett `VITE_SUPABASE_URL` og
`VITE_SUPABASE_PUBLISHABLE_KEY` under Project Settings → Environment Variables
og fjern `.env` fra repoet.

### Etter første utrulling

**Generer QR-kodene på nytt.** Koder laget mens du utviklet peker på
`localhost:8081` og er verdiløse på en hylle. Gå til **Admin → QR-koder**, sett
feltet «Adresse appen ligger på» til Vercel-adressen, og skriv ut på nytt.
