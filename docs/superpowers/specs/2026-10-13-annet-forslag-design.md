# «Annet» – det katalogen mangler

Design, 13. oktober 2026.

## Hva dette løser

Katalogen har bare det kontoret har lagt inn. Står en kunde eller en ansatt med
noe i hånda som ikke finnes i lista, er det i dag ingen vei videre: varen blir
tatt uten å registreres, eller den havner i kommentarfeltet der ingen leter.

Med «Annet» kan hvem som helst legge det i kurven med egne ord. Linja går med
uttaket eller bestillingen som vanlig, og den blir samtidig et **forslag** til
kontoret: opprett varen i katalogen med pris, eller sett bare pris på denne ene
linja. Over tid fyller katalogen seg med det folk faktisk tar.

```
kunde / ansatt  ->  «Legg til annet»  ->  linje uten vare og pris  ->  innsending
                                                         |
                                       admin → Forslag:  opprett vare | sett pris | avvis
```

## Beslutninger som ligger til grunn

Tatt av eier 13. oktober 2026:

- **Forslag + linje i kurven**, ikke bare en melding. Varen tas ut (eller
  bestilles) der og da.
- **Begge steder**: uttaket (`/`) og bestillingen (`/bestill`).
- I `/bestill` er en annet-linje en **forespørsel**: summen kunden binder seg
  til gjelder bare katalogvarene, og kontoret kan ikke godkjenne før
  annet-linjene har pris.

## Kunden og den ansatte

**Knappen «Finner du ikke det du skal ha? Legg til annet»** står

- på `/` under rørlista, og i tom-tilstanden «Ingen rør passer søket» (der
  søketeksten fylles inn som forslag til navn),
- på `/r/:kode` når koden er ukjent («Fant ikke røret»), med koden i merknaden,
- i `/bestill` på samme to steder som på `/`.

**Skjemaet** (én dialog, `AnnetDialog`, delt av alle tre):

| Felt | Regel |
| --- | --- |
| Hva er det? | påkrevd, høyst 120 tegn |
| Dimensjon | valgfri, høyst 60 tegn |
| Mengde | som `QuantityInput`, med valg mellom `m` og `stk` |
| Merknad | valgfri, høyst 300 tegn |

**I kurven** vises linja med merket «Annet». På uttaket står det «pris settes av
kontoret»; i bestillingen «Forespørsel – du får pris før vi godkjenner». Linja
teller ikke med i summen. Under summen står «+ N uten pris» når det finnes slike.
Annet-linjer slås aldri sammen med hverandre; hver har sin egen nøkkel
(`annet-<tilfeldig>`).

**Kassen i `/bestill`** sier rett over «Bestill med betalingsplikt»:
«Forespørsler uten pris er ikke bindende. Prisen står i e-posten når
bestillingen er klar – vil du ikke ha varen, sier du fra når du henter.»

**Kvitteringen og bestillingssiden** (`/kvittering`, `/bestilling/:id`, PDF-ene og
e-postene) viser annet-linjer med «Pris kommer» der prisen mangler, i stedet for
«Avtales».

## Databasen

Ny migrasjon `20261013100000_annet_forslag.sql`.

**`pipe_order_lines.is_annet boolean not null default false`.** Trengs fordi
`pipe_type_id = null` også betyr «katalogvaren er slettet» (`on delete set
null`), og de to skal ikke forveksles.

**Ny tabell `pipe_suggestions`**, én rad per annet-linje:

| Kolonne | |
| --- | --- |
| `id`, `created_at` | |
| `order_id` | `references pipe_orders on delete set null` |
| `order_line_id` | `references pipe_order_lines on delete set null` |
| `name`, `dimension`, `unit`, `quantity`, `note` | det som ble skrevet |
| `from_employee` | `auth.uid() is not null` ved innsending |
| `submitted_by` | navnet på ordren (kunde eller ansatt) |
| `status` | `ny` / `opprettet` / `engangs` / `avvist`, standard `ny` |
| `pipe_type_id` | varen som ble opprettet, `on delete set null` |
| `handled_at`, `handled_by` | |

Forslaget overlever at ordren slettes. Det er tilbakemeldingen som er verdien,
ikke ordren.

RLS på, og bare kontoret (`hm_er_kontor()`) kan lese og oppdatere. Det finnes
ingen `insert`-regel: radene skrives bare av innsendingsfunksjonene, som kjører
som eier.

**`pipe_submit_order` og `pipe_submit_pickup_order`** godtar to slags linjer:

```json
{ "pipe_type_id": "<uuid>", "quantity": 12 }
{ "annet": { "name": "PE-rør 40 mm", "dimension": "40", "unit": "m", "note": null }, "quantity": 12 }
```

En annet-linje:

- valideres med samme lengdegrenser som skjemaet; `unit` må være `m` eller `stk`,
- lagres med `pipe_type_id = null`, `unit_price = null`, `line_total = null`,
  `is_annet = true`,
- trekker ikke lageret, verken ved uttak eller ved godkjenning,
- får en rad i `pipe_suggestions`.

Høyst 10 annet-linjer per innsending. Signaturene er de samme som før.
Svarlinjene får `"annet": true`, og det får også linjene fra
`pipe_get_pickup_order`.

**`pipe_price_line(p_line_id uuid, p_unit_price numeric)`**, bare for kontoret:

- nekter hvis ordren er fakturert («Slett fakturagrunnlaget først»),
- nekter negativ pris eller pris over 10 000 000,
- setter `unit_price` og `line_total = round(pris * mengde, 2)`,
- regner `pipe_orders.total` på nytt som summen av linjene som har pris,
- returnerer linja.

**`pipe_approve_pickup_order`** nekter med «Sett pris på annet-linjene før du
godkjenner» så lenge en annet-linje mangler pris. Sperren ligger i basen og ikke
bare i knappen.

## Kontoret

**Ny fane «Forslag»** i adminpanelet, med teller for nye. To utsnitt: *Nye* og
*Behandlet*. Hvert kort viser:

- teksten, dimensjonen, mengden og merknaden,
- om forslaget kom fra en ansatt eller en kunde, og navnet,
- «Uttak #N» eller «Bestilling #N», datoen, og om linja har pris.

Kortet har tre knapper:

1. **Opprett vare.** Åpner den vanlige «Ny vare»-dialogen fra Lager, med navn,
   dimensjon og enhet fylt inn. Når varen er lagret, får linja på ordren
   varens pris (`pipe_price_line`, hvis linja finnes, ikke er fakturert og
   mangler pris), og forslaget settes til `opprettet` med `pipe_type_id`.
   Lagerbeholdningen settes i dialogen; det som allerede er tatt ut, trekkes
   ikke i etterkant.
2. **Sett pris.** For en engangsvare som ikke skal inn i katalogen. Prisen
   gjelder bare denne linja, og forslaget settes til `engangs`.
3. **Avvis.** Lukker forslaget uten pris. Fakturafanen sier allerede fra om
   linjer uten pris.

**Prisdialogen** (`PriceLineDialog`) brukes også

- i Bestillinger, der «Pris mangler» på en linje blir en knapp,
- i hentekøen, der godkjenningsknappen er låst med teksten «Sett pris på N
  annet-linje(r) først» til alle har pris.

## Det som ikke er med

- En kunde som avslår en annet-vare ved henting: kontoret håndterer det slik
  det gjør i dag med en vare som ikke blir hentet. Å kunne fjerne én linje fra
  en ordre er en egen sak.
- Å slå sammen like forslag («12 personer har bedt om PE-rør 40 mm»). Lista
  sorteres på dato. Gruppering kan komme når det finnes nok data til å se hva
  som trengs.

## Tester

`scripts/db-test/annet.test.mjs` mot ekte Postgres:

- en annet-linje fra anonym og fra innlogget bruker, på uttak og på bestilling
- ingen lagertrekk, verken ved innsending eller ved godkjenning
- forslagsraden opprettes med riktig `from_employee`
- anonym og prosjektbruker kan verken lese forslag eller sette pris
- `pipe_price_line` regner ut totalen og nekter på fakturert ordre
- godkjenning nektes til annet-linja har pris
- grenser: tomt navn, feil enhet, 11 annet-linjer

Enhetstester for `cart.ts` og `pickup-cart.ts`: annet-linjer slås ikke sammen,
teller ikke i summen, og blir til riktig format ved innsending.

Ferdig når `npm test`, `npm run test:db`, `npm run lint` og `npm run build` går
grønt, `supabase-setup.sql` er bygget på nytt, og README beskriver Annet og
Forslag.
