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

Og en tredje: **bestilling for henting**. Bedrifter og privatpersoner bestiller
rør i butikken på `/bestill` – nå eller til en valgt dag – og kontoret godkjenner
før lageret trekkes:

```
/bestill  ->  venter på godkjenning  ->  kontoret godkjenner  ->  klar til henting  ->  hentet  ->  faktura
              e-post: kvittering         lageret trekkes          e-post: klar
              e-post: til kontoret       (eller: avvist + e-post)
```

En bestilling er et uttak meldt på forhånd, og ligger i `pipe_orders` med
`kind = 'bestilling'`.

## Kom i gang

```bash
npm install
npm run dev          # http://localhost:8080
```

### Database

Åpne Supabase-prosjektet -> **SQL Editor** -> lim inn hele [`supabase-setup.sql`](supabase-setup.sql)
og trykk Run. Den oppretter tabeller, tilgangsregler, funksjoner og varekatalogen.
Filen kan kjøres igjen på et prosjekt som allerede er satt opp — det er slik du
tar inn en ny migrasjon. Ingenting går tapt: lagerbeholdning, justert påslag,
egne varer og importerte innkjøpspriser står igjen etterpå. Det er dekket av
`npm run test:db`, som kjører hele filen to ganger mot en ekte Postgres og
sjekker at alt står.

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
| `/bestill` | Butikken: søk eller skann, legg i bestillingen |
| `/bestill/kasse` | Når kunden henter, hvem som bestiller, sum og «Bestill med betalingsplikt» |
| `/bestilling/:id` | Status og PDF for én bestilling – samme side som e-posten lenker til |
| `/vilkar` | Kjøpsvilkår, angrerett og angreskjema |
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

**En kunde uten innlogging må fylle ut e-post.** Feltet har ingen formatsjekk med
vilje: har kunden ingen e-post, skriver han «ingen». Databasen avviser et tomt felt.

**En ansatt som er logget inn, tar ut på brukeren sin.** Kassen viser «Registreres
på deg», og den ansatte skriver bare hvilken jobb eller hvilket prosjekt varene skal
til. Navn og e-post henter `pipe_submit_order` fra innloggingen, ikke fra skjemaet,
og lagrer brukeren i `pipe_orders.created_by`. Uttaket merkes «Ansatt» i panelet,
og fakturagrunnlaget samler slike uttak under jobben. «Ikke deg? Logg ut» i kassen
er for et delt nettbrett der noen har glemt å logge ut.

**Lagerloggen viser hvem som gjorde endringen** (`pipe_stock_log.created_by_name`),
både for justeringer i panelet og for uttak fra ansatte.

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

**Bilde er påkrevd, med én nødutgang.** Databasen avviser et mottak uten både
bilde og en skreven grunn — kravet ligger der og ikke bare i grensesnittet,
siden en klient alltid kan la være å sende feltet. Nødutgangen finnes fordi
dekningen på en byggeplass er som den er: et krav som ikke kan omgås blir omgått
på verre måter, som at ingen kvitterer, eller at de kvitterer fra et sted med
dekning lenge etterpå. Kontoret ser hvilke mottak som mangler bilde og hvorfor.

**Bildene er personopplysninger.** Et bilde fra en byggeplass kan vise folk.
Bøtta `mottak-bilder` er derfor privat, og tilgangen følger prosjektet helt ned
til Storage: stien starter med prosjekt-id, og policyen på `storage.objects`
leser nettopp det leddet. Ingen offentlige URL-er — bare signerte lenker som
utløper. Sletting er kontorets alene; plassen skal ikke kunne fjerne
dokumentasjon i ettertid.

Bildene komprimeres i nettleseren før opplasting. Et mobilbilde er 3–8 MB, og på
halv dekning tar det minutter mens sjåføren står og venter.

### Bilde i mottakskontrollen

Bøtta og reglene lages av `supabase-setup.sql`. Du trenger ikke gjøre noe
manuelt — dette avsnittet er her for det ene tilfellet der du må.

Reglene på `storage.objects` ligger i en `DO`-blokk som fanger
`insufficient_privilege`, fordi den tabellen eies av Supabase og enkelte
prosjekter nekter å la SQL Editor røre den. Skjer det, går resten av filen
gjennom som normalt, men du får en `WARNING` i utdataen som peker hit — og
bildeopplasting virker ikke før reglene finnes.

Slik lager du dem for hånd: gå til **Storage → Policies → `objects`** og legg
inn tre regler på bøtta `mottak-bilder`.

| Operasjon | Hvem | Vilkår |
| --- | --- | --- |
| `SELECT` | `authenticated` | prosjekt-id-en i første ledd av stien er et prosjekt brukeren er med på |
| `INSERT` | `authenticated` | samme, og `owner` er brukeren selv |
| `DELETE` | `authenticated` | samme, og `owner` er brukeren selv (kontoret sletter det som er kvittert for) |

Uttrykket er det samme i alle tre, og står ordrett i
`supabase/migrations/20260903093000_rolle_og_rekkefolge.sql` — søk etter
`mottak-bilder`. Kopier `using`- og `with check`-uttrykkene derfra; de sjekker
at stien har uuid-form før den blir castet, slik at en oppdiktet sti gir «ingen
tilgang» og ikke en databasefeil.

## Bestilling for henting

**Lageret trekkes når kontoret godkjenner, ikke når kunden bestiller.** En
bestilling settes inn med `stock_drawn_at = null`. `pipe_approve_pickup_order`
trekker lageret, logger det og setter status i samme transaksjon;
`pipe_reject_pickup_order` legger rørene tilbake hvis de var trukket.

**Regelen ligger i basen.** For en bestilling sier statusen alltid om lageret er
trukket: `ny` og `avvist` betyr nei, `behandlet` og `levert` betyr ja. En
`check` (`pipe_orders_bestilling_lager`) stopper enhver vanlig `update` som ville
fått de to i utakt. Derfor godkjennes bestillinger alltid med knappene i panelet,
aldri med statusvelgeren.

**Tre steder lærte forskjellen.** `pipe_delete_order` legger bare tilbake det
som faktisk ble trukket, og `pipe_create_invoice` nekter bestillinger som ikke er
godkjent.

**Skjemaet er åpent, så basen har tak.** Høyst 5 bestillinger per e-postadresse
per døgn og 30 totalt i timen. En falsk bestilling trekker aldri lageret –
det gjør bare godkjenningen.

**Kunden slår opp bestillingen på uuid-en,** aldri på ordrenummeret, som går i
rekkefølge. `pipe_get_pickup_order` gir aldri ut interne notater eller uttak.

**Bryteren står av** til noen slår den på under Innstillinger → Bestilling på
nett, og den kan ikke slås på før firmanavn, org.nr., adresse og e-post er fylt
ut. Vilkårene og angreskjemaet trenger dem.

**Vilkår og angrerett:** privatpersoner kan bestille, så angrerettloven gjelder.
Teksten ligger i `supabase/functions/_shared/angrerett.ts` og brukes på
`/vilkar`, i kassen, i PDF-en og i e-postene. Den er et utkast bygget på det
loven krever – les den før bryteren slås på, og få unntaket for kappede rør
bekreftet av advokat.

**E-post:** se [`docs/bestilling-epost.md`](docs/bestilling-epost.md).

### Ta det i bruk

1. Lim `supabase-setup.sql` inn i SQL Editor og kjør den.
2. `npm run check:db` – alt skal være grønt.
3. Fyll ut firmaopplysningene under Innstillinger, og les `/vilkar`.
4. Sett opp e-post etter `docs/bestilling-epost.md`. Uten e-post virker alt annet, men da **må** kontoret skrive ut PDF-en til privatkunder ved henting: den er bekreftelsen, vilkårene og angreskjemaet loven krever at kunden får.
5. Slå på «Ta imot bestillinger på nett».

Frontend tåler å bli rullet ut før punkt 1: da er butikken stengt, og alt i
panelet oppfører seg som uttak.

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
    pickup-*.ts   bestillingen: kurv, skjema, datalag og PDF
    scanner.ts    tolkningen av skannede koder
    mva.ts, orgnr.ts, vilkar.ts  sender videre fra supabase/functions/_shared
supabase/migrations/   databaseskjemaet – kilden til supabase-setup.sql
supabase/functions/    serverfunksjoner (opprett-bruker, bestilling-epost) og _shared
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
bestilling til to puljer med mottak. `bestilling.test.mjs` dekker bestillingene: innsending uten lagertrekk, godkjenning og avvisning, regelen om lager og status, takene og e-postlåsen.

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
`localhost:8080` og er verdiløse på en hylle. Gå til **Admin → QR-koder**, sett
feltet «Adresse appen ligger på» til Vercel-adressen, og skriv ut på nytt.
