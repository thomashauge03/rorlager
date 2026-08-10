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
og trykk Run. Den oppretter tabeller, tilgangsregler, funksjoner og en startkatalog
med rørtyper. Filen kan kjøres flere ganger uten å ødelegge data.

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

## Utrulling

Vercel med `vercel.json` på plass (alle ruter til `index.html`). Husk å sette
`VITE_SUPABASE_URL` og `VITE_SUPABASE_PUBLISHABLE_KEY` som miljøvariabler, og å
generere QR-kodene på nytt med riktig adresse under **Admin -> QR-koder** hvis de
ble laget mot localhost.
