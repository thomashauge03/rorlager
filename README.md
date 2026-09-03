# Rørlager – Hauge Maskin

Selvbetjent uttak av rør fra lageret. Kunden skanner QR-koden som henger på hylla,
velger antall meter, legger det i handlekurven og sender inn. Admin ser alt,
styrer lageret, skriver ut QR-etiketter og lager fakturagrunnlag som PDF.

```
QR på hylla  ->  /r/<kode>  ->  handlekurv  ->  innsending  ->  adminpanel  ->  PDF / faktura
```

I tillegg har appen en kjede som går motsatt vei, for varer som **kjøpes inn** til
et prosjekt og kjøres fra leverandøren rett ut på byggeplassen:

```
plassen melder behov  ->  kontoret bestiller hos leverandør  ->  bilen kommer
                      ->  plassen kvitterer mot det bestilte  ->  avvik til kontoret
```

De to kjedene er holdt fra hverandre med vilje. `pipe_*`-tabellene handler om
varer firmaet **eier** og tar ut av lageret; `project_*`-tabellene om varer
firmaet **kjøper**. Ingen beholdning trekkes ned av en prosjektbestilling.

## Kom i gang

```bash
npm install
npm run dev          # http://localhost:8080
```

### Database

Åpne Supabase-prosjektet -> **SQL Editor** -> lim inn hele [`supabase-setup.sql`](supabase-setup.sql)
og trykk Run. Den oppretter tabeller, tilgangsregler, funksjoner og varekatalogen.
Filen er idempotent, så den kan kjøres igjen på et prosjekt som allerede er satt
opp — det er slik du tar inn en ny migrasjon.

**Filen er generert fra `supabase/migrations/`, ikke skrevet for hånd.** Legg
endringer i en ny migrasjonsfil og bygg den på nytt:

```bash
npm run bygg:setup
```

Dette er ikke pedanteri. Fram til 3. september 2026 var `supabase-setup.sql` en
håndholdt kopi som var blitt liggende igjen bak to sikkerhetsrettelser, og som
derfor ville rullet dem tilbake om noen limte den inn. Nå kan filen ikke si noe
annet enn migrasjonene gjør.

Sjekk at alt sitter:

```bash
npm run check:db
```

`.env` må peke på samme prosjekt:

```
VITE_SUPABASE_URL="https://<prosjekt>.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="<anon key>"
```

### Tilgang og roller

Innlogging går gjennom Supabase Auth. Opprett brukeren under **Authentication ->
Users** i Supabase, og logg inn på `/login`. Superadmin (den som kan administrere
brukerregisteret på `/admin/brukere`) styres av tabellen `super_admins`.

Tilgangen har tre nivåer, og **rollen i `system_users` avgjør hvilket**:

| Rolle | Ser |
| --- | --- |
| Ingen rad | Ingenting. Møter «Ingen tilgang». |
| `prosjekt` | Bare prosjektene han er satt på. Ikke lager, priser, faktura eller andre prosjekter. |
| Alt annet (`admin`, `kontor`, `lager`) | Hele adminpanelet, som før. |

Vilkåret er formulert negativt — «rolle forskjellig fra `prosjekt`» — slik at
eksisterende brukere beholder tilgangen uten at noen rad må flyttes.

**Å gi en person tilgang gjøres på ett sted:** Admin → Brukere. Der velger du
rolle og huker av hvilke prosjekter personen skal se — så mange som trengs, og
det kan endres når som helst. Samme tilgang kan også styres fra prosjektsiden
(Admin → Prosjekt → «Hvem er på»), for når du har plassen framfor deg og ikke
personen. Begge skriver samme tabell.

Alt nøkles på e-post, ikke på bruker-id, så en person kan settes opp før han har
logget inn første gang.

### Sjekk dette i Supabase én gang

**Authentication → Providers → Email: «Confirm email» og «Secure email change»
må begge være PÅ.**

Hele tilgangsmodellen henger på e-posten i innloggingstokenet. `is_super_admin()`,
`hm_er_kontor()`, `hm_rolle()` og `hm_er_prosjektmedlem()` slår alle opp på den.
Samtidig er selvregistrering åpen i prosjektet, så hvem som helst kan lage en
konto.

Er «Secure email change» av, kan en fremmed registrere seg, be om å bytte
e-postadresse til superadminens — og få den uten bekreftelse. Etter neste
token-fornyelse er han superadmin. Det er den eneste veien inn i tilgangsmodellen
noen har funnet, og den ligger i en innstilling, ikke i koden.

### Serverfunksjonen for midlertidige passord

**Dette må rulles ut én gang før «Opprett med midlertidig passord» virker.**

Å opprette en innlogging, eller sette passordet til noen andre, krever
`service_role`-nøkkelen. Den omgår **all** RLS — har noen den, har de alt — så
den kan aldri ligge i nettleseren. Derfor ligger jobben i en serverfunksjon der
nøkkelen aldri forlater Supabase.

1. Supabase → **Edge Functions** → **Deploy a new function**
2. Navn: `opprett-bruker` (nøyaktig dette — klienten kaller det ved navn)
3. Lim inn hele [`supabase/functions/opprett-bruker/index.ts`](supabase/functions/opprett-bruker/index.ts)
4. Deploy

`SUPABASE_URL`, `SUPABASE_ANON_KEY` og `SUPABASE_SERVICE_ROLE_KEY` settes
automatisk av Supabase — du trenger ikke fylle inn noe.

Funksjonen sjekker selv at den som kaller er superadmin, og gjør det med
**kallerens egen økt**, ikke med `service_role`. En sjekk gjort på serveren er
den eneste som teller; klienten kan lyve om hvem den er.

Passordet vises én gang og lagres ingen steder. Personen logger inn med det og
bytter det selv under «Bytt passord» på `/admin/brukere`. Mister du det, lager du
et nytt fra nøkkel-ikonet i brukerlista.

## Sider

| Adresse | Hva den gjør |
| --- | --- |
| `/` | Framside: søk i katalogen, skann QR, se handlekurven |
| `/r/:kode` | Målet for QR-koden – én rørtype, antall meter, legg i kurv |
| `/kurv` | Handlekurven |
| `/kasse` | Navn, telefon, prosjekt, eventuell signatur |
| `/kvittering` | Kvittering med ordrenummer og PDF |
| `/login` | Innlogging |
| `/admin` | Bestillinger, Å bestille, Prosjekt, Lager, QR-koder, Faktura, Innstillinger |
| `/admin` → **Å bestille** | Fire utsnitt: Å bestille, Underveis, Mottak, Avvik |
| `/admin/brukere` | Brukerregister (kun superadmin) |
| `/prosjekt` | Prosjektene mine (byggeplass) |
| `/prosjekt/:id` | Bestillingene på prosjektet |
| `/prosjekt/:id/behov` | Meld inn behov: søk i katalogen eller skriv fritekst |
| `/prosjekt/:id/mottak/:ordreId` | Mottakskontroll: forventet mot mottatt |

En innlogget bruker med rollen `prosjekt` som havner på `/admin`, blir sendt
videre til `/prosjekt`. Uten det ville han møtt et panel der hver spørring
svarer med null rader — og et tomt panel er en dårlig forklaring.

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

**Innkjøpsprisen er ikke offentlig.** Katalogen leses gjennom visningen
`pipe_catalog`, som ikke har `cost_price`, og innstillingene gjennom
`pipe_public_settings`, som ikke har `markup_percent`. Selve tabellene er stengt
for anonyme. Fram til 3. september 2026 lå begge tallene åpne for hvem som helst
på nettet — `"pipe_types read"` var `for select using (true)`, og RLS er radbasert
og kan ikke skjule en kolonne.

## Prosjekt og mottakskontroll

**Bestillingslinjen bærer to tall.** `requested_qty` er det byggeplassen ba om,
`ordered_qty` det kontoret faktisk bestilte. Da er det synlig at kontoret
bestilte 40 der plassen ba om 50, uten at vi trenger to ordrebegreper som må
holdes i sync.

**Mottakskontrollen måles mot `ordered_qty`,** ikke mot det plassen ba om. Det
er derfor kontoret må registrere bestillingen i Admin → Å bestille før plassen
kan kvittere: uten det finnes det ingen fasit å måle mot.

**En leveranse kan komme i flere puljer.** Hvert mottak er sin egen rad med egne
linjer, og «hva mangler fortsatt» er bestilt minus summen av mottatt — utledet
ved visning, aldri lagret, så det ikke kan komme i utakt med mottakene.

**Mer enn bestilt er lov,** men blir aldri stående som «ingen avvik». Databasen
tvinger avviket til `for_mye`. Samme holdning som at beholdningen får gå i minus:
det er reell informasjon, og den skjules ikke.

**Skriving av et mottak går gjennom `project_submit_receipt`,** ikke gjennom
tabellen. Mottaket og linjene skal skrives helt eller ikke i det hele tatt, og
statusen på bestillingen settes i samme transaksjon.

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
                  Projects, ProjectPage, ProjectRequest, ProjectReceipt
  components/     TopBar, CartBar, QuantityInput, SignaturePad, StatusBadge
    admin/        OrdersTab, ToOrderTab, ProjectsTab, StockTab, QrTab,
                  InvoiceTab, SettingsTab
  lib/
    auth.ts       innloggingsvakt og rolle, delt av admin og prosjekt
    cart.ts       handlekurven (localStorage)
    orders.ts     databasekall for uttakskjeden
    projects.ts   databasekall og regnestykker for prosjektkjeden
    settings.ts   innstillinger, delt i offentlig og kontor
    stock.ts      lagerstatus, søk og sortering
    qr-labels.ts  QR-koder, etikettark og hylleskilt
    order-pdf.ts  uttaksseddel og plukkliste
    invoice-pdf.ts fakturagrunnlag
    receipt-pdf.ts mottakskontroll – det du sender leverandøren ved reklamasjon
supabase/migrations/   databaseskjemaet – kilden til supabase-setup.sql
supabase/functions/    serverfunksjoner (opprett-bruker: midlertidige passord)
scripts/
  check-db.mjs    sjekker en levende base med anon-nøkkelen
  bygg-setup.mjs  bygger supabase-setup.sql fra migrasjonene
```

## Test

```bash
npm test
```

Enhetstestene dekker det som **regner**: prisberegning, handlekurv, lagerstatus,
prisimport, og restberegningen i mottakskontrollen. Regnestykkene i
`src/lib/projects.ts` er skilt ut som rene funksjoner nettopp for å kunne testes
uten en database.

Tilgangsmodellen kan ikke testes med enhetstester — den ligger i RLS-policyene og
i databasefunksjonene, altså i databasens oppførsel og ikke i appens. Den kjøres
mot en **ekte Postgres i minnet**, bygget fra migrasjonene:

```bash
npm run test:db
```

Testene bygger basen fra `supabase/migrations/`, deler ut de samme rettighetene
Supabase gjør, og spør så som fire ulike brukere: kontoret, to prosjektbrukere på
hvert sitt prosjekt, en innlogget fremmed uten tilgang, og en anonym besøkende.
De dekker at innkjøpsprisen er utilgjengelig, at kundeflyten fortsatt virker,
at prosjektbrukere ikke ser hverandres prosjekter, og hele veien fra behov via
bestilling til to puljer med mottak.

Kjør dette **før** du limer SQL inn i Supabase. Mot en levende base sjekkes det
samme utenfra med anon-nøkkelen:

```bash
npm run check:db
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

`.env` er gitignorert og følger **ikke** med til GitHub. Vercel må derfor få
verdiene selv: Project Settings → **Environment Variables**, sett
`VITE_SUPABASE_URL` og `VITE_SUPABASE_PUBLISHABLE_KEY` for alle tre miljøene
(Production, Preview, Development), og kjør en ny deploy.

Vite baker verdiene inn under bygget, ikke ved oppstart. En deploy som gikk før
variablene var på plass blir ikke reparert av at du legger dem inn etterpå —
den må bygges på nytt.

Mangler de, starter appen likevel, men peker på en reserveadresse: banneret
«Databasen er ikke koblet til ennå» legger seg nederst, og ingen får logget inn.
Ser du det på et utrullet nettsted, er det nesten alltid dette som mangler.

Verdiene er ingen hemmelighet. `anon`-nøkkelen er ment å være offentlig og
havner uansett i JavaScript-bunten som sendes til enhver besøkende. Det som
beskytter dataene er RLS-reglene i `supabase-setup.sql`, ikke at nøkkelen er
hemmelig. De ligger igjen under Supabase → Project Settings → Data API.

### Etter første utrulling

**Generer QR-kodene på nytt.** Koder laget mens du utviklet peker på
`localhost:8081` og er verdiløse på en hylle. Gå til **Admin → QR-koder**, sett
feltet «Adresse appen ligger på» til Vercel-adressen, og skriv ut på nytt.
