# Bestilling for henting

Design, 24. september 2026.

## Hva dette løser

Rørlageret har i dag én vei inn for kunder: selvbetjent uttak. Kunden står ved
hylla, skanner QR-koden, tar rørene og sender inn, og lageret trekkes med én
gang. Det finnes ingen måte å bestille på forhånd, og kontoret får aldri si ja
eller nei før rørene er borte.

Denne utvidelsen legger til en nettbutikk der hvem som helst — bedrift eller
privatperson — kan søke eller skanne seg fram til rørene, legge dem i en kurv og
bestille dem til henting, nå eller en valgt dag. Kontoret godkjenner, og først
da trekkes lageret.

```
/bestill  ->  venter på godkjenning  ->  kontoret godkjenner  ->  klar til henting  ->  hentet  ->  faktura
              e-post: kvittering         lageret trekkes          e-post: klar
              e-post: til kontoret       (eller: avvist + e-post)
```

Dagens uttaksflyt — QR på hylla, `/kurv`, `/kasse` — blir stående urørt ved
siden av. Det eneste den merker, er at kameraet på framsiden begynner å virke
på iPhone.

## Beslutninger som ligger til grunn

Tatt av eier 24. september 2026, ikke utledet:

| Spørsmål | Valg |
| --- | --- |
| Hva kan bestilles | Rør fra katalogen. Ikke fritekst. |
| Hvordan får kunden varene | Henting på lageret. Ingen utkjøring. |
| Når trekkes lageret | Når kontoret godkjenner |
| Varsling | E-post begge veier: kvittering til kunden ved innsending, varsel til kontoret for **hver** bestilling, beskjed til kunden ved godkjenning og ved avvisning |
| Hvem kan bestille | Både bedrifter og privatpersoner |
| Betaling | Faktura for alle, 14 dagers frist |
| Nedlasting | PDF på skjermen etter innsending, og via lenke i e-posten |
| Hvor bestillingene lagres | I `pipe_orders`, merket som bestilling |
| Hvor skjemaet ligger | En egen nettbutikk på `/bestill`, med søk og kamera i samme felt |
| «Henter nå» | En bestilling med hentedag i dag. Kontoret må fortsatt godkjenne. |
| Kapper dere rør | Ja. Kappede rør unntas fra angreretten. |

## Arkitektur

### En bestilling er et uttak meldt på forhånd

README skiller kjedene etter hva varene *er*: `pipe_*`-tabellene handler om
varer firmaet eier og tar ut av lageret, `project_*`-tabellene om varer firmaet
kjøper. En bestilling til henting er det første — egne rør, til salgspris, som
skal faktureres. Det eneste som skiller den fra et uttak, er *når* lageret
trekkes.

Derfor blir bestillingen en rad i `pipe_orders` med `kind = 'bestilling'`.
Fakturagrunnlaget, bestillingslista, søket, plukklista og slettingen virker på
den uten å skrives om.

Prisen er at tre steder i dag antar at lageret alltid er trukket når en ordre
finnes, og alle tre må lære forskjellen:

1. `pipe_delete_order` legger rørene tilbake. For en bestilling som aldri ble
   godkjent, ville den lagt til rør som aldri var tatt ut.
2. `pipe_create_invoice` tar med alt som ikke er fakturert. En bestilling som
   venter, eller er avvist, skal aldri på et grunnlag.
3. Statusen settes i dag med en vanlig `update`. Settes en bestilling til
   «behandlet» den veien, ser den godkjent ut uten at lageret er trukket.

Alle tre lukkes i databasen, ikke bare i grensesnittet. Se
[Regelen om lager og status](#regelen-om-lager-og-status).

### Hvorfor ikke egne tabeller

Vurdert: `pipe_bookings` med egne linjer, som blir til et vanlig uttak når
kontoret godkjenner. Den ville latt uttakskoden være helt urørt. Men da finnes
bestillingen to steder — som forespørsel og som uttak — og koblingen mellom dem
må holdes i takt ved avvisning, sletting og faktura. Det er nøyaktig det
designet for prosjektkjeden advarte mot: to ordrebegreper som må holdes i sync.

### Hvorfor en egen butikk og ikke handlekurven

Vurdert: la kunden velge «ta ut nå» eller «bestill» i dagens kasse. Det gir
mindre nytt grensesnitt. Men framsiden er bygget for den som står ved hylla, og
hele uttaksflyten måtte fått priser inkl. mva og forbrukerinformasjon, fordi
privatpersoner ville brukt de sidene til å bestille. En egen butikk holder
forbrukerkravene på sidene der de gjelder, og lar uttaket være som det er.

Bestillingen har sin egen kurv i nettleseren, adskilt fra uttakskurven, så et
uttak og en bestilling aldri blandes.

## Kundens vei

### `/bestill` — butikken

- **Søkefeltet med kamera i** er det første kunden ser. Søket er det samme som
  på framsiden: navn, dimensjon, varenummer, hylle. Kameraknappen ligger i
  feltet.
- Et treff — fra søk eller skanning — åpner varen med antallsfeltet klart og
  «Legg i bestillingen».
- Under: kategoriene og varene som kort, med navn, dimensjon, pris og
  lagerstatus.
- Nederst en stripe: antall varer, sum inkl. mva og «Til bestilling».
- En lenke til framsiden for den som står ved hylla og vil ta ut selv.

Varer uten pris vises, men kan ikke legges i bestillingen: en privatperson skal
se totalprisen før bestillingen sendes. Kortet sier «Ring oss for pris» med
firmaets telefon.

Er `accept_orders` av, viser siden «Vi tar ikke imot bestillinger på nett
akkurat nå» med telefonnummeret, og framsiden viser ikke lenken hit.

### Skanneren

Skanneren på framsiden flyttes ut i en felles komponent og brukes begge steder.

- Leser QR-kodene fra hyllene (`/r/<kode>`) og en naken kode, som i dag.
- Leser også vanlige strekkoder (EAN, Code 128, Code 39). En strekkode treffer
  når tallet i den er varenummeret (`sku`) i katalogen. Det er usikkert hvor
  ofte det skjer — produsentens strekkode er sjelden Dahls varenummer — men det
  koster ingenting ekstra med samme leser.
- I butikken legger et treff varen fram for antall. På framsiden går det til
  varesiden, som i dag.
- I butikken slås koden opp i katalogen som allerede er lastet. Ingen ekstra
  kall til basen.

**iPhone.** Safari har ikke `BarcodeDetector`, og framsiden ber derfor
iPhone-brukere bruke kameraappen. Den åpner `/r/<kode>` — uttakssiden, ikke
bestillingen. Løsningen er en leser som kjører i nettleseren:

- `barcode-detector` (en ponyfill over `zxing-wasm`), med samme grensesnitt som
  den innebygde.
- Lastes først når kameraet åpnes, og bare der den innebygde mangler. Android
  betaler ingenting.
- WebAssembly-fila bygges inn av Vite og serveres fra eget domene.
  Standardoppsettet henter den fra et CDN (jsDelivr). Det skal overstyres, ellers
  går et kall til en tredjepart hver gang noen åpner kameraet.

Fila er rundt en megabyte. Den lastes én gang og caches.

### `/bestill/kasse`

1. **Kurven**, med antall som kan endres og linjer som kan fjernes.
2. **Når henter du?** To store knapper:
   - **«Henter nå»** — hentedag i dag, merket `pickup_now`. Under knappen står
     åpningstiden fra innstillingene (`pickup_note`), så ingen står og venter en
     lørdag.
   - **«Velg dag»** — datovelger fra i dag til 90 dager fram.
3. **Privat eller bedrift.** Før valget er gjort, vises prisene inkl. mva.
   - Bedrift: firma, org.nr., kontaktperson, telefon, e-post. Org.nr. sjekkes
     med kontrollsifferet (mod 11).
   - Privat: navn, fakturaadresse (gate, postnr., sted), telefon, e-post.
   - E-post er påkrevd for begge. Telefon følger `require_phone`, som i kassen
     for uttak.
4. **Kommentar**, valgfri.
5. **Oppsummering:** linjene, sum eks. mva, mva, sum inkl. mva, og
   betalingsvilkåret («Faktura, 14 dager»).
6. For privatpersoner: kort om angreretten, og at kappede rør ikke kan leveres
   tilbake. Lenke til `/vilkar`.
7. **«Bestill med betalingsplikt».** Samme knapp uansett valg over.
8. Under knappen: lenke til personvernerklæringen — GDPR artikkel 13 krever
   informasjonen *ved innsamlingen* — og firmanavn og org.nr. nederst.

Kontaktopplysningene huskes i nettleseren til neste gang, som i kassen for
uttak. Kurven tømmes når bestillingen er sendt.

Bestilles mer enn lageret viser, står det for eksempel «Lageret viser 12 m.
Kontoret sjekker resten.» Det stopper ikke bestillingen.

### `/bestilling/:id` — etter innsending

Samme side som e-posten lenker til.

- **Status:** Venter på godkjenning · Klar til henting · Hentet · Avvist (med
  kontorets begrunnelse).
- Hele bestillingen, hentedag eller «Henter nå», hvor den hentes (adresse og
  åpningstid), og kontorets melding.
- **«Last ned PDF».**
- «Vi har sendt kvittering til ola@firma.no» — bare når basen sier at den
  faktisk er sendt.
- **Oppdaterer seg selv** hvert 20. sekund så lenge bestillingen venter på
  godkjenning, og bare mens fanen er synlig. Statusendringen leses opp for
  skjermlesere (`aria-live`).

**Id-en er en uuid, ikke ordrenummeret.** Ordrenumrene går i sekvens; med dem
kunne hvem som helst bla gjennom andres bestillinger. Lenken er en nøkkel: den
som har den, ser bestillingen. Det er det samme som e-posten allerede viser, så
lenken avslører ikke mer enn e-posten den står i.

### Priser og mva

Prisene i katalogen er eks. mva, og satsen står i `vat_rate`.

- Butikken viser begge: «129 kr/m inkl. mva» stort, «103 eks.» under.
- Kassen og PDF-en viser linjene inkl. mva for privatpersoner og eks. mva for
  bedrifter. Summen viser alltid alle tre: eks. mva, mva, inkl. mva.
- Linjesummen rundes i øre som i `pipe_submit_order`. Mva regnes av summen, ikke
  per linje, og rundes i øre — samme regnestykke som `invoice-pdf.ts`, så tallet
  i bestillingen stemmer med fakturagrunnlaget.
- Én funksjon, `src/lib/mva.ts`, gjør regnestykket for butikk, kasse og PDF.

## Kontorets vei

### Fanen Bestillinger

- **Stripe øverst: «Venter på godkjenning (3)».** «Henter nå» først, deretter
  etter hentedag med den tidligste først, og innsendingstidspunkt der
  hentedagen er lik. Samme tall står på fanen, så det synes fra hvilken som
  helst fane.
- Under: lista som i dag, med filteret **Alle · Uttak · Bestillinger**.
- Et bestillingskort viser hentedag eller **HENTER NÅ**, privat eller bedrift,
  org.nr. eller fakturaadresse, kontaktinfo, linjene med sum eks. og inkl. mva,
  og **lagerstatus per linje**: en linje større enn beholdningen er merket.
- Kortet viser også e-postloggen: hva som er sendt til kunden, og når.
- Søket i lista treffer også org.nr.

### Hva kontoret kan gjøre

| Status | Handlinger |
| --- | --- |
| Venter på godkjenning | **Godkjenn** — valgfri melding til kunden. Lageret trekkes og logges, og kunden får «Klar til henting». **Avvis** — begrunnelsen er påkrevd og går til kunden. |
| Klar til henting | **Hentet**. **Avvis** — rørene legges tilbake, og tilbakeføringen logges. |
| Hentet | Klar for faktura, som et uttak. «Angre hentet» setter den tilbake til klar. |
| Avvist | Viser begrunnelsen. Kan slettes. |

Den vanlige statusvelgeren tilbyr bare overgangene som er lov for en
bestilling: mellom «Klar til henting» og «Hentet». Godkjenning og avvisning går
alltid gjennom knappene, fordi de flytter rør. Massehandlingen «Merk som behandlet» hopper over bestillinger som venter — de må
godkjennes én og én, siden godkjenning trekker lageret.

Etter godkjenning eller avvisning sier panelet «Kunden har fått e-post». Gikk
det ikke, står det «E-posten gikk ikke» og en knapp for å prøve igjen.

### Faktura, PDF og plukkliste

- En bestilling kommer i fakturagrunnlaget først når den er godkjent. Aldri før,
  og aldri etter avvisning. Databasen nekter det, og fanen viser dem ikke.
- PDF-knappen gir samme dokument som kunden laster ned.
- Plukklista virker for bestillinger som for uttak — det er slik varene gjøres
  klare.

### Innstillinger

| Felt | Kolonne | Merknad |
| --- | --- | --- |
| Ta imot bestillinger på nett | `accept_orders` | Av som standard. Kan ikke slås på før firmanavn, org.nr., adresse og e-post er fylt ut. |
| Varsel om nye bestillinger sendes til | `order_email` | Tom betyr firmaets e-post. |
| Betalingsfrist (dager) | `payment_terms_days` | 14. Står i vilkårene, kassen, PDF-en og e-postene. |

## E-postene

### De fire

| Type | Når | Til | Innhold |
| --- | --- | --- | --- |
| `kvittering` | Kunden sender inn | Kunden | Ordrenummer, hentedag, linjene, sum inkl. mva, «venter på godkjenning», knappen «Se bestillingen og last ned PDF». Privat: angrerett og angreskjema. |
| `kontor` | Kunden sender inn | `order_email`, ellers firmaets e-post | Emne «Ny bestilling nr. 1042 – hentes 3. oktober» eller «Henter nå: bestilling nr. 1042». Kontaktinfo, privat eller bedrift, org.nr. eller adresse, linjene med lagerstatus, kommentaren, knapp til `/admin`. Svar-til er kundens adresse. |
| `klar` | Kontoret godkjenner | Kunden | «Klar til henting», hvor og når, kontorets melding, lenken. Privat: angrerett og angreskjema. Dette er ordrebekreftelsen. |
| `avvist` | Kontoret avviser | Kunden | Begrunnelsen og hvordan kontoret nås. |

Alle til kunden har firmaets e-post som svar-til. Ingen PDF er vedlagt: den
bygges i nettleseren, og to byggere av samme dokument glir fra hverandre. Samme
vurdering som Leveringsseddel gjorde.

### Sikkerhet

Funksjonen `bestilling-epost` kan kalles av hvem som helst — kunden er ikke
logget inn. Derfor:

- **Den tar aldri imot en e-postadresse.** Den tar id-en til bestillingen og
  ingenting annet. Mottakeren leses fra raden eller fra innstillingene. Kunne
  man oppgi mottakeren, var den en gratis spam-relé med Hauge Maskin som
  avsender.
- **Den tar ikke imot en e-posttype heller.** Den avgjør selv hva som skal
  sendes, ut fra status og hva som allerede er sendt. Et kall betyr «send det
  som står igjen», og hver e-post kan gå én gang per bestilling. Da er alle kall
  trygge å gjenta, og ingen kan få «klar» sendt for en bestilling som ikke er
  godkjent.
- **Lenken bygges av `APP_URL`, aldri av forespørselen.** Ellers kunne noen
  sendt `Origin: ond-side.no` og fått lenken i en ekte e-post fra Hauge Maskin
  til å peke dit.
- **Innholdet bygges av det som står i basen.** Fritekst — navn, firma, adresse,
  kommentar — kodes før den settes inn i HTML. Kommentaren står bare i e-posten
  til kontoret, ikke i den til kunden: den som skriver en fremmed adresse i
  skjemaet, skal ikke kunne legge sin egen tekst i en e-post til en fremmed.
- **Tak:**
  - Høyst 5 bestillinger per e-postadresse per døgn, i
    `pipe_submit_pickup_order`.
  - Høyst 30 bestillinger i timen totalt, samme sted.
  - Høyst 10 e-poster per kundeadresse per døgn. Kontorets adresse telles ikke
    her.
  - Høyst 90 e-poster i døgnet totalt — under gratisgrensen hos Resend på 100.
- **Bare ferske e-poster.** `kvittering` og `kontor` sendes bare innen 24 timer
  etter innsending, `klar` og `avvist` bare innen 24 timer etter kontorets
  handling. Slås e-post på en måned etter lansering, får ingen en gammel
  kvittering.

Når døgntaket er nådd, sendes ingenting mer den dagen, men bestillingene lagres
og vises i panelet som vanlig. Blir skjemaet misbrukt, slår kontoret av
`accept_orders`.

### Pålitelighet

**En e-post som feiler, kan aldri stoppe en bestilling.** Rekkefølgen er alltid:
lagre, så sende.

- **Etter innsending** ber kassen om e-post uten å vente på svaret, med
  `navigator.sendBeacon` (eller `fetch` med `keepalive`). Forespørselen
  fullføres selv om fanen lukkes.
- **Bestillingssiden ber om e-post igjen** når den lastes, og når den ser at
  statusen har endret seg. Gikk det første forsøket tapt — dekningen forsvant
  idet knappen ble trykket — sendes e-posten da. Kontoret får beskjed selv om
  det første forsøket aldri kom fram.
- **Adminpanelet ber om e-post** etter godkjenning og avvisning, venter på
  svaret i inntil 12 sekunder, og viser resultatet.
- **Låsen:** før en e-post sendes, settes en rad inn i `pipe_order_emails` med
  unik nøkkel på bestilling og type. To samtidige kall kan ikke begge vinne.
  Feiler sendingen hos Resend, fjernes raden igjen, så e-posten ikke blir låst
  ute for godt.

**Funksjonen rulles ut uten JWT-krav** (`--no-verify-jwt`). Den stoler uansett
ikke på den som kaller. Og en forespørsel med `Authorization`- og
`apikey`-hoder krever en forhåndsforespørsel (preflight), som `keepalive` ikke
tåles med i alle nettlesere. Uten hodene kan kassen sende en enkel forespørsel
med ren tekst, og da kommer den fram også når fanen lukkes.

### Oppsett

Funksjonen slår seg på av seg selv. Den trenger tre verdier under **Edge
Functions → Secrets** i Supabase:

| Navn | Verdi |
| --- | --- |
| `RESEND_API_KEY` | Nøkkel fra Resend. En egen for rørlageret, så den kan trekkes tilbake alene. |
| `EPOST_FRA` | For eksempel `Hauge Maskin AS <bestilling@hauge-maskin.no>` |
| `APP_URL` | Adressen appen ligger på, for eksempel `https://rorlager.vercel.app` |

Mangler én av dem, svarer funksjonen «ikke satt opp» før den ser på noen
bestilling, og ingenting blir merket som sendt. Bestillinger, panel og PDF
virker som før.

For å sende til andre enn kontoeieren trengs et verifisert domene hos Resend.
Man kan ikke sende fra `vercel.app`. Kontoen og domenet fra Leveringsseddel kan
brukes. Legges et nytt domene inn, velges EU-regionen (Irland).

Oppskriften skrives i `docs/bestilling-epost.md`, etter mønster av
`docs/kvittering-epost.md` i Leveringsseddel.

## Det juridiske

Sjekkliste bygget på det loven krever, ikke juridisk rådgivning. Vilkårsteksten
er et utkast som eier leser før `accept_orders` slås på.

### Hvorfor dette gjelder

Privatpersoner kan bestille over nett. Da er det fjernsalg etter
angrerettloven, selv om varen hentes på lageret, og prisene til forbrukere skal
oppgis med mva.

### `/vilkar`

Én side med kjøpsvilkårene, bygget av firmaopplysningene i innstillingene:

- Hvem som selger: firmanavn, org.nr., adresse, e-post, telefon.
- Bestillingen er et tilbud til oss og blir bindende når vi har bekreftet den,
  med e-posten «Klar til henting».
- Priser: inkl. mva for privatpersoner, eks. mva for bedrifter. Prisen på
  bestillingstidspunktet gjelder.
- Betaling: faktura, `payment_terms_days` dager.
- Henting: adresse og åpningstid. Risikoen går over når varen hentes.
- **Angrerett** for privatpersoner: 14 dager fra varen er hentet. Beskjed gis med
  angreskjemaet eller på annen tydelig måte. Kunden bringer varen tilbake og
  bærer kostnaden. Pengene tilbake innen 14 dager etter at vi fikk beskjed; vi
  kan holde igjen til varen er kommet tilbake.
- **Kappede rør:** rør som kappes til lengden kunden har bestilt, er laget etter
  kundens mål og har ikke angrerett (angrerettloven § 22). Hele lengder har
  vanlig angrerett. *Bør bekreftes av advokat før siden brukes.*
- Reklamasjon: forbrukere etter forbrukerkjøpsloven — inntil 5 år, fordi rør
  som legges i bakken er ment å vare vesentlig lenger enn to år. Bedrifter etter
  kjøpsloven.
- Tvister: forbrukere kan klage til Forbrukertilsynet og videre til
  Forbrukerklageutvalget.
- Lenke til personvernerklæringen.
- **Angreskjemaet**, med knapp for utskrift.

### Én kilde for angrerettsteksten

Angrerettsteksten og skjemaet står fire steder: `/vilkar`, kassen (kort),
PDF-en og e-postene. De ligger i én modul,
`supabase/functions/_shared/angrerett.ts`, som både appen og e-postfunksjonen
importerer. Fire kopier av en lovpålagt tekst vil gli fra hverandre.

Den ligger under `supabase/functions` fordi Supabase CLI bare pakker med filer
derfra når funksjonen rulles ut. Appen kan importere den derfra; det motsatte
går ikke.

### Varig medium

En privatperson skal ha vilkårene og angreskjemaet på et varig medium, senest
når varen hentes. En lenke til en nettside regnes ikke som det, fordi siden kan
endres. Derfor står angrerettsteksten og skjemaet **i selve e-posten** — både
`kvittering` og `klar` — og **i PDF-en**. PDF-en dekker kravet også før e-post
er satt opp. Fram til da bør kontoret skrive ut PDF-en til privatkunder ved
henting.

### Personvern

`/personvern` oppdateres:

- Nye opplysninger: e-post (påkrevd ved bestilling), fakturaadresse for
  privatpersoner, hentedag, og org.nr. for bedrifter.
- Formålene: gjennomføre bestillingen, sende kvittering og beskjed om henting,
  fakturere. Grunnlag: avtale (art. 6 nr. 1 b) og bokføringsplikten (art. 6
  nr. 1 c).
- **Resend** som ny databehandler for e-post. Resend er et amerikansk selskap,
  så erklæringen oppgir overføringsgrunnlaget slik det står i Resends
  databehandleravtale.
- Hvor lenge: som for uttak. E-postloggen følger bestillingen og slettes med
  den.
- Ingen informasjonskapsler for sporing. Kurven er strengt nødvendig, og
  QR-leseren ligger på eget domene. Fortsatt ikke noe samtykkebanner.

### Vakten på bryteren

`accept_orders` kan ikke settes på før `company_name`, `org_number`, `address`
og `email` er fylt ut. Det håndheves med en `check` på `pipe_settings`, og
Innstillinger forklarer hvorfor bryteren er grå. Uten dem mangler vilkårene
selgeren, og angreskjemaet mangler en adresse å sende angremeldingen til.

## Datamodell

Navnene følger basen slik den står: tabeller, kolonner og funksjoner på
engelsk, verdier på norsk. I samtalen ble arbeidsnavn som
`pipe_submit_bestilling` brukt; de heter det som står her.

### `pipe_orders` — nye kolonner

| Kolonne | Type | Merknad |
| --- | --- | --- |
| `kind` | text not null default `'uttak'` | `uttak` \| `bestilling` |
| `stock_drawn_at` | timestamptz | Når lageret ble trukket. Eksisterende rader får `created_at`, og etterpå er standarden `now()`, så `pipe_submit_order` trenger ingen endring. En bestilling settes inn med `null`. |
| `pickup_date` | date | Hentedag |
| `pickup_now` | boolean not null default false | «Henter nå» |
| `customer_type` | text | `privat` \| `bedrift` |
| `org_number` | text | 9 siffer |
| `billing_address` | text | Privat: gate, postnr. og sted i én tekst |
| `customer_message` | text | Kontorets melding til kunden. `admin_note` er fortsatt intern og vises aldri for kunden. |

Rekkefølgen i migrasjonen er med vilje: `stock_drawn_at` legges til uten
standard, eksisterende rader fylles med `created_at`, og *så* settes
`default now()`. Legges standarden til først, får alle gamle uttak tidspunktet
migrasjonen kjørte.

Statusverdiene er de samme som for uttak, med egne navn for en bestilling:

| Verdi | Uttak | Bestilling |
| --- | --- | --- |
| `ny` | Ny | Venter på godkjenning |
| `behandlet` | Behandlet | Klar til henting |
| `levert` | Levert | Hentet |
| `avvist` | Avvist | Avvist |

Da virker statusfilteret som før, og ingen ny statusverdi må inn i `check`-en
som finnes.

### Regelen om lager og status

For en bestilling skal statusen alltid si om lageret er trukket:

```sql
alter table public.pipe_orders add constraint pipe_orders_bestilling_lager check (
  kind <> 'bestilling'
  or (status in ('ny', 'avvist') and stock_drawn_at is null)
  or (status in ('behandlet', 'levert') and stock_drawn_at is not null)
);
```

Uten den kunne en vanlig `update ... set status = 'behandlet'` — statusvelgeren
i dag, eller massehandlingen — gjort en bestilling «klar til henting» uten at et
eneste rør var trukket. Med den er den eneste veien fra «venter» til «klar»
godkjenningsfunksjonen.

I tillegg, så en bestilling alltid har det kontoret og e-posten trenger:

```sql
alter table public.pipe_orders add constraint pipe_orders_bestilling_felt check (
  kind <> 'bestilling'
  or (customer_type in ('privat', 'bedrift') and pickup_date is not null and customer_email is not null)
);
```

### `pipe_order_emails`

| Kolonne | Type | Merknad |
| --- | --- | --- |
| `id` | uuid pk | |
| `order_id` | uuid → `pipe_orders` on delete cascade | |
| `type` | text | `kvittering` \| `kontor` \| `klar` \| `avvist` |
| `recipient` | text not null | Adressen den gikk til, med små bokstaver |
| `claimed_at` | timestamptz not null default now() | |
| `sent_at` | timestamptz | |
| `provider_id` | text | Id-en fra Resend |

Unik på `(order_id, type)`. Kontoret kan lese — det er e-postloggen på kortet.
Ingen andre kan lese eller skrive; skriving skjer bare gjennom funksjonene
under, med tjenestenøkkelen.

### `pipe_settings` og `pipe_public_settings`

Tre nye kolonner, se [Innstillinger](#innstillinger). `pipe_public_settings` får
`accept_orders` og `payment_terms_days` lagt til **sist** — `create or replace
view` kan bare legge til kolonner bakerst. `order_email` kommer ikke med:
varseladressen er kontorets.

Migrasjonen gjentar `revoke all` før `grant select` på visningen, som i
`20260903090200_katalog_utan_innkjopspris.sql`. `create or replace` beholder
rettighetene, men gjentakelsen koster ingenting, og sikkerhetstesten fanger det
om det noen gang ikke skjer.

## Databasefunksjoner

Alle er `security definer` med `set search_path = public`, og har
`revoke ... from public, anon` før `grant`. Grunnen står i designet for
prosjektkjeden: Supabase gir anon en egen grant idet en funksjon opprettes.

### `pipe_submit_pickup_order(...)` → jsonb

Anon og innlogget. Parametre: kundetype, navn, firma, org.nr., fakturaadresse,
telefon, e-post, henter nå, hentedag, kommentar, linjer (jsonb).

Avviser, med norske meldinger skrevet for kunden:

- `accept_orders` er av.
- Ukjent kundetype. Bedrift uten firma, eller med org.nr. som ikke er 9 siffer
  med riktig kontrollsiffer. Privat uten fakturaadresse.
- Manglende navn eller e-post, e-post som ikke ser ut som en adresse, manglende
  telefon når `require_phone` er på.
- For lange felt: navn 100, firma 120, adresse 200, e-post 254, telefon 30,
  kommentar 1000 tegn.
- Hentedag før i dag eller mer enn 90 dager fram, regnet i norsk tid
  (`(now() at time zone 'Europe/Oslo')::date`). Ikke UTC — da ville «i dag»
  vært feil dag mellom midnatt og klokka to om natta. Med «henter nå» settes
  hentedagen til i dag, uansett hva klienten sendte.
- Tom kurv, mer enn 100 linjer, antall ≤ 0 eller over 100 000, ukjent eller
  inaktiv vare, **vare uten pris**.
- Mer enn 5 bestillinger fra samme e-postadresse siste døgn, eller mer enn 30
  totalt siste time.

Setter inn med `kind = 'bestilling'`, `status = 'ny'`, `stock_drawn_at = null`.
Navn, enhet og pris fryses på linja fra `pipe_types`, som i
`pipe_submit_order`. **Rører ikke lageret og skriver ingenting i
`pipe_stock_log`.**

Returnerer `{ id, order_number }`.

### `pipe_get_pickup_order(p_id uuid)` → jsonb

Anon og innlogget. Gir bestillingen med den id-en hvis `kind = 'bestilling'`,
ellers `null` — et uttak kan ikke leses denne veien.

Tar med det kunden skal se: nummer, tidspunkter, status, hentedag, henter nå,
kundetype og kontaktopplysninger, kommentar, `customer_message`, summen,
linjene, og når `kvittering`, `klar` og `avvist` ble sendt. Tar **ikke** med
`admin_note`, `handled_by`, `signature` eller `invoice_id`.

### `pipe_approve_pickup_order(p_id uuid, p_message text default null)` → jsonb

Bare `hm_er_kontor()`. Låser raden (`for update`). Krever
`kind = 'bestilling'` og `status = 'ny'`. Meldingen er høyst 1000 tegn.

Trekker hver linje fra lageret og logger med grunn `bestilling` og notatet
«Bestilling #1042 godkjent» — samme mønster som `pipe_submit_order`, og
beholdningen får gå i minus. Setter `stock_drawn_at`, `status = 'behandlet'`,
`handled_at`, `handled_by` og `customer_message` i samme transaksjon.

To faner som godkjenner samtidig: den andre venter på låsen, ser
`status = 'behandlet'` og avvises.

### `pipe_reject_pickup_order(p_id uuid, p_message text)` → jsonb

Bare `hm_er_kontor()`. Låser raden. Krever en begrunnelse på høyst 1000 tegn,
`kind = 'bestilling'`, status `ny` eller `behandlet`, og at bestillingen ikke er
fakturert.

Var lageret trukket, legges hver linje tilbake og logges med grunn `avvist`.
Setter `stock_drawn_at = null`, `status = 'avvist'`, `handled_at`, `handled_by`
og `customer_message`.

### E-postfunksjonene

Bare `service_role`. Tilbakekalt fra public, anon og authenticated.

- **`pipe_email_claim(p_order_id uuid)` → jsonb.** Låser bestillingen og avgjør
  hva som skal sendes:
  - `kvittering` og `kontor`: bestillingen er under 24 timer gammel. `kontor`
    bare hvis det finnes en varseladresse.
  - `klar`: status `behandlet` og `stock_drawn_at` under 24 timer gammel.
  - `avvist`: status `avvist` og `handled_at` under 24 timer gammel.
  - Minus det som allerede har en rad i `pipe_order_emails`, og minus det
    takene stopper.

  Setter inn en rad for hver, og returnerer bestillingen, linjene,
  firmaopplysningene og lista over e-poster med mottaker. Returnerer en tom liste
  når ingenting skal sendes.
- **`pipe_email_mark_sent(p_order_id uuid, p_type text, p_provider_id text)`**
  setter `sent_at` og `provider_id`.
- **`pipe_email_release(p_order_id uuid, p_type text)`** fjerner raden hvis den
  ikke er sendt.

`klar` kontrolleres mot `behandlet`, ikke `levert`: markeres en bestilling som
hentet før «klar»-e-posten gikk ut, skal kunden ikke få beskjed om at den er
klar etter at den er hentet.

### Endringer i eksisterende funksjoner

- **`pipe_delete_order`** legger rørene tilbake bare når `stock_drawn_at` er
  satt. For uttak er den alltid satt, så uttak oppfører seg som før.
- **`pipe_create_invoice`** avviser når en av bestillingene har
  `stock_drawn_at = null`, med meldingen «2 av bestillingene er ikke godkjent».
  Uttak har den alltid satt.

`pipe_submit_order` endres ikke.

## Filer

| Fil | Hva |
| --- | --- |
| `supabase/migrations/20260924100000_bestilling.sql` | Kolonner, regler, tabellen, innstillingene, funksjonene. Kan deles i flere filer. |
| `supabase/functions/bestilling-epost/index.ts` | Porten: sjekker oppsettet, kaller `pipe_email_claim`, sender via Resend, markerer. |
| `supabase/functions/bestilling-epost/epost.ts` | E-postene som rene funksjoner, testbare med vitest. |
| `supabase/functions/_shared/angrerett.ts` | Vilkårs- og angrerettsteksten og angreskjemaet. Delt av appen og funksjonen. |
| `src/pages/PickupShop.tsx` | `/bestill` |
| `src/pages/PickupCheckout.tsx` | `/bestill/kasse` |
| `src/pages/PickupOrder.tsx` | `/bestilling/:id` |
| `src/pages/Vilkar.tsx` | `/vilkar` |
| `src/components/Scanner.tsx` | Felles skanner, flyttet ut av `Index.tsx` |
| `src/lib/scanner.ts` | Leseren (innebygd eller i nettleseren) og tolkningen av koden |
| `src/lib/pickup-cart.ts` | Bestillingskurven i `localStorage` |
| `src/lib/pickup-orders.ts` | Kallene: send inn, hent, godkjenn, avvis, be om e-post |
| `src/lib/pickup-pdf.ts` | PDF-en, bygget på `drawHeader` og `drawFooter` fra `order-pdf.ts` |
| `src/lib/mva.ts` | Mva-regnestykket |
| `src/lib/orgnr.ts` | Kontrollsifferet |
| `src/components/admin/PickupQueue.tsx` | Stripen «Venter på godkjenning» og dialogene for godkjenn og avvis |
| `scripts/db-test/bestilling.test.mjs` | Databasetestene |
| `docs/bestilling-epost.md` | Oppsettet for e-post |

Endres: `App.tsx` (rutene), `Index.tsx` (felles skanner, lenke til `/bestill`
når `accept_orders` er på), `OrdersTab.tsx`, `AdminDashboard.tsx` (tallet på
fanen), `InvoiceTab.tsx`, `SettingsTab.tsx`, `Personvern.tsx`,
`lib/settings.ts`, `lib/types.ts`, `lib/orders.ts` (søket),
`integrations/supabase/types.ts`, `scripts/check-db.mjs`, `README.md`,
`package.json` (`barcode-detector`), og `supabase-setup.sql` — generert med
`npm run bygg:setup`, aldri for hånd.

## Testing

### Mot ekte Postgres — `npm run test:db`

Ny fil, `bestilling.test.mjs`, med samme slags brukere som de andre testene:
kontoret, en prosjektbruker, en innlogget fremmed og en anonym.

- Anonym innsending lagrer bestillingen og **rører ikke** `stock` eller
  `pipe_stock_log`.
- Hver avvisningsregel i `pipe_submit_pickup_order` gir sin melding: kundetype,
  org.nr. med feil kontrollsiffer, adresse, e-post, telefon, feltlengder,
  hentedag i går og om 91 dager, vare uten pris, inaktiv vare, `accept_orders`
  av.
- «Henter nå» gir dagens dato uansett hva som ble sendt.
- Takene: den sjette bestillingen fra samme adresse samme døgn avvises.
- Godkjenning: bare kontoret; anonym, prosjektbruker og fremmed får 42501.
  Lageret trekkes og logges. Andre gang avvises.
- Avvisning etter godkjenning legger lageret tilbake og logger. Uten
  begrunnelse avvises den.
- Regelen: `update ... set status = 'behandlet'` på en ventende bestilling
  avvises; `set status = 'ny'` på en godkjent avvises.
- Sletting av en ventende bestilling rører ikke lageret; sletting av en godkjent
  legger tilbake.
- `pipe_create_invoice` avviser ventende og avviste bestillinger og tar
  godkjente.
- `pipe_get_pickup_order`: anonym får bestillingen uten `admin_note`; ukjent
  id og id-en til et uttak gir `null`.
- E-postfunksjonene: anonym og innlogget får 42501. `pipe_email_claim` gir
  `kvittering` og `kontor` én gang, og et nytt kall gir ingenting. `release`
  gjør den tilgjengelig igjen. En to døgn gammel bestilling gir ingenting.
  `klar` kommer først etter godkjenning.
- `pipe_public_settings` har ikke `order_email`, og anon kan ikke skrive gjennom
  den.
- `accept_orders` kan ikke settes på uten firmaopplysningene.
- Uttakstestene står uendret og skal passere: `stock_drawn_at` er satt på alle
  uttak, og sletting legger tilbake som før.

Hver test kontrolleres ved å ødelegge koden med vilje og se at den feiler, slik
testene i denne basen er laget.

### Enhetstester — `npm test`

- `mva.ts`: øreavrunding, sum av mange linjer, sats 0.
- `orgnr.ts`: gyldige nummer, feil kontrollsiffer, kontrollsiffer 10 (alltid
  ugyldig), mellomrom.
- `pickup-cart.ts`: legge til, endre, fjerne, tåle ødelagt `localStorage`.
- `scanner.ts`: QR-lenke med og uten vertsnavn, naken kode, strekkode som
  treffer varenummer, kode som ikke hører til rørlageret.
- `epost.ts`: koding av fritekst; kommentaren bare hos kontoret; angrerett bare
  for privat; riktig emne for «Henter nå»; lenken bygges av `APP_URL`.

### Mot den levende basen — `npm run check:db`

Utvides med: anon kan ikke lese `pipe_order_emails`, får ikke `order_email` fra
visningen, og får 42501 fra godkjenn, avvis og e-postfunksjonene.

### I nettleseren

Klikkes gjennom på mobilbredde: søk, skann (også uten `BarcodeDetector`), kurv,
kasse som privat og som bedrift, bestillingssiden som oppdaterer seg selv,
godkjenning og avvisning i panelet.

## Rekkefølge

Hvert steg kan stå alene i produksjon uten å ødelegge noe som virker.
`accept_orders` står av hele veien, så ingenting er åpent før eier slår det på.

1. **Migrasjonen og databasetestene.** Uttakene merker ingenting.
2. **Felles skanner.** Framsiden får kamera på iPhone.
3. **Butikken og kassen.**
4. **Bestillingssiden og PDF-en.**
5. **Adminpanelet og innstillingene.**
6. **Vilkår, angreskjema og personvern.**
7. **E-postfunksjonen, dokumentasjonen og README.**

Etter steg 7: eier leser vilkårene, fyller ut firmaopplysningene, setter opp
Resend og slår på `accept_orders`.

## Bevisst utelatt

- **Endre antall ved godkjenning.** Har lageret for lite, godkjenner kontoret og
  beholdningen går i minus, eller avviser med en begrunnelse. Blir det
  hverdagen, er `ordered_qty` som i prosjektkjeden det riktige grepet.
- **Utkjøring.** Bare henting.
- **Betaling på nett.** Faktura for alle.
- **Fritekstlinjer.** Bare katalogen; kommentaren tar resten.
- **Signatur ved henting.** Kontoret trykker «Hentet».
- **Påminnelse på hentedagen.** Stripen i panelet sorterer på hentedag.
- **SMS og varsel i mobilappen.**
- **Utløp på lenken.** Den viser ikke mer enn e-posten den står i.
- **Honningkrukke mot roboter.** Godkjenningen og takene gjør at en falsk
  bestilling aldri trekker lageret og aldri sender mer enn et fåtall e-poster.
