# Prosjekt, bestilling og mottakskontroll

Design, 3. september 2026.

## Hva dette løser

Rørlageret er i dag bare utgående: rør går fra eget lager til kunde via QR-koden
på hylla. Det finnes ingen prosjekter, ingen leverandør og ingen mottak.
«Prosjekt» er et fritekstfelt på bestillingen og kan ikke slås opp.

Denne utvidelsen bygger kjeden motsatt vei, for varer som kjøpes inn til et
prosjekt og kjøres rett fra leverandøren ut på byggeplassen:

```
plassen melder behov  ->  kontoret bestiller hos leverandør  ->  bilen kommer
                      ->  plassen kvitterer mot det bestilte  ->  avvik til kontoret
```

Eget lager er ikke involvert. Ingen beholdning trekkes ned, ingen `pipe_stock_log`
skrives, og fakturagrunnlaget er urørt. Det er et bevisst skille: den nye kjeden
handler om varer firmaet **kjøper**, den gamle om varer firmaet **eier**.

## Beslutninger som ligger til grunn

Disse er tatt av eier, ikke utledet:

| Spørsmål | Valg |
| --- | --- |
| Hvor kommer varene fra | Leverandør rett til plassen. Eget lager urørt. |
| Hva er «forventet» | Det kontoret faktisk bestilte, ikke det plassen ba om. |
| Logger plassen inn | Ja, egne brukere per person. |
| Hva ser en prosjektbruker | Bare sine egne prosjekter. Ingenting av resten av adminpanelet. |
| Hva kan meldes inn | Katalogen pluss fritekstlinjer. |
| Leveranser | Flere puljer per bestilling. Restleveranse må følges. |
| Avvik | Antall, avvikstype og kommentar. Ingen bilder. |

## Arkitektur

### Behovet og bestillingen er samme liste

Vurdert opp mot en full innkjøpskjede i tre nivåer (behovsmelding →
innkjøpsordre → mottak). Den ble valgt bort: den krever seks tabeller for
flyten, og hver kobling mellom nivåene er et sted ting kan komme ut av takt.

I stedet bærer **linja to tall**: `requested_qty` fra plassen og `ordered_qty`
fra kontoret. Da fanges «kontoret bestilte 40 der plassen ba om 50» uten to
ordrebegreper som må holdes i sync.

Prisen for dette er reell og skal stå skrevet: skal kontoret slå sammen behov
fra to separate meldinger til én ordre hos Dahl, passer modellen dårlig. Han må
enten bestille to ganger eller flytte linjer manuelt. Hvis det viser seg å være
hverdagen, er nivå tre riktig grep — men da vet vi det, i stedet for å gjette nå.

**Mottak er derimot sin egen ting.** En bestilling kan komme i flere puljer, så
hvert mottak er en rad med egne linjer som peker tilbake på bestillingslinjene.
«Hva mangler fortsatt» er bestilt minus summen av mottatt — utledet, ikke lagret,
så det aldri kan komme i utakt med mottakene.

### Hvorfor ikke bygge på `pipe_orders`

Tabellen har allerede prosjekt, linjer, status og PDF-er, og fristelsen er
åpenbar. Men den er gjennomsyret av lagersemantikk: `pipe_submit_order` trekker
ned beholdning, `pipe_delete_order` fører tilbake og logger, `invoice_id` binder
den til fakturagrunnlaget, og prisene er salgspriser med påslag. En
prosjektbestilling skal ikke røre noe av det. Gjenbruket ville kostet mer i
avskrudd oppførsel enn det sparer.

## Datamodell

Seks nye tabeller med `project_`-prefiks, så det er synlig i basen hvilken kjede
en tabell hører til.

**Navnekonvensjonen er hentet fra basen slik den står, ikke oppfunnet her:**
tabeller og kolonner på engelsk som `pipe_orders.customer_name`, men
statusverdier på norsk som `pipe_orders.status` sine `'ny'`, `'behandlet'`,
`'levert'`. Vaktfunksjonene er den nyeste familien og er norske
(`hm_har_tilgang`, `hm_rolle`), så de nye vaktene føyer seg inn der.

### `projects`

| Kolonne | Type | Merknad |
| --- | --- | --- |
| `id` | uuid pk | |
| `project_number` | bigserial | Synlig nummer, som `order_number` |
| `name` | text not null | |
| `client` | text | Hvem prosjektet gjøres for |
| `address` | text | Leveringsadresse. Kontoret trenger den når han bestiller |
| `status` | text | `aktiv` \| `avsluttet`, default `aktiv` |
| `note` | text | |
| `created_at`, `created_by` | | |

### `project_members`

Hvem som er på hvilket prosjekt.

| Kolonne | Type | Merknad |
| --- | --- | --- |
| `id` | uuid pk | |
| `project_id` | uuid → `projects` on delete cascade | |
| `email` | text not null | |
| `created_at`, `created_by` | | |

Unik på `(project_id, lower(email))`.

**Nøkkelen er e-post, ikke `auth.uid()`.** Det er en bevisst videreføring av
mønsteret i `is_super_admin()` og `hm_har_tilgang()`: en person kan settes på et
prosjekt før han har registrert seg, og tilgangen virker fra første innlogging.
Med auth-id som nøkkel måtte kontoen finnes først, og kontoret måtte vente på at
folk registrerte seg før han kunne forberede en plass.

### `project_orders`

| Kolonne | Type | Merknad |
| --- | --- | --- |
| `id` | uuid pk | |
| `order_number` | bigserial | |
| `project_id` | uuid not null → `projects` | |
| `status` | text | `utkast` \| `meldt` \| `bestilt` \| `delvis` \| `mottatt` \| `avvist` |
| `needed_by` | date | Når plassen trenger det |
| `note` | text | Fra plassen |
| `requested_by` | uuid | `auth.uid()` |
| `requested_by_name` | text | Navnet fryses, så det står selv om brukeren fjernes |
| `requested_at` | timestamptz | |
| `supplier` | text | Fylles av kontoret |
| `supplier_ref` | text | Ordrenummer hos leverandøren |
| `expected_at` | date | Forventet leveringsdato |
| `ordered_by`, `ordered_at` | | |
| `office_note` | text | |
| `created_at`, `updated_at` | | |

Statusløpet er `utkast → meldt → bestilt → delvis → mottatt`, med `avvist` som
sidespor når kontoret ikke vil bestille. `utkast` er med fordi en byggeplass
sjelden vet alt på én gang — lista bygges opp gjennom dagen og sendes når den er
ferdig.

### `project_order_lines`

| Kolonne | Type | Merknad |
| --- | --- | --- |
| `id` | uuid pk | |
| `order_id` | uuid → `project_orders` on delete cascade | |
| `pipe_type_id` | uuid → `pipe_types` on delete set null | Null for fritekstlinje |
| `name` | text not null | Fryst fra katalogen, eller skrevet for hånd |
| `dimension`, `sku` | text | |
| `unit` | text not null default `stk` | |
| `requested_qty` | numeric not null, > 0 | Det plassen ba om |
| `ordered_qty` | numeric | Det kontoret bestilte. Null til han har bestemt seg, 0 = strøket |
| `line_note` | text | |
| `sort_order` | integer | |

Navnet fryses på linja, ikke slås opp ved visning. Samme begrunnelse som for
prisene i `pipe_order_lines`: endres katalogen senere, skal en gammel bestilling
fortsatt vise hva som faktisk ble bestilt.

**Ingen priser på linja.** Prosjektbrukeren skal ikke se innkjøpspris, og
bestillingen er ikke et fakturagrunnlag. Kontoret ser prisen i katalogen når han
bestiller.

### `project_receipts`

Én pulje.

| Kolonne | Type | Merknad |
| --- | --- | --- |
| `id` | uuid pk | |
| `receipt_number` | bigserial | |
| `order_id` | uuid → `project_orders` on delete cascade | |
| `received_at` | timestamptz default now() | |
| `received_by` | uuid | |
| `received_by_name` | text not null | Hvem som kvitterte |
| `signature` | text | Gjenbruk av `SignaturePad` |
| `note` | text | |
| `created_at` | | |

### `project_receipt_lines`

| Kolonne | Type | Merknad |
| --- | --- | --- |
| `id` | uuid pk | |
| `receipt_id` | uuid → `project_receipts` on delete cascade | |
| `order_line_id` | uuid → `project_order_lines` on delete cascade | |
| `received_qty` | numeric not null, >= 0 | |
| `deviation` | text | `ingen` \| `mangler` \| `skadet` \| `feil_vare` \| `for_mye`, default `ingen` |
| `note` | text | |

## Tilgangsmodell

Dette er den delen som kan gjøre skade, og den får derfor mest plass.

### Problemet

Hver policy på hver `pipe_*`-tabell bruker i dag `hm_har_tilgang()`, som er sann
for **enhver** rad i `system_users`. Legger vi inn byggeplassfolk som brukere nå,
ser de også bestillinger, fakturagrunnlag, innkjøpspriser, lagerstyring og
prisjustering. `hm_rolle()` finnes, men står med kommentaren «Avgrenser
ingenting ennå».

### Grepet

En ny vakt, `hm_er_kontor()`, som er sann for super admin og for enhver rad i
`system_users` med `role` **forskjellig fra** `prosjekt`.

Formuleringen er negativ med vilje. Dagens eneste rad har `role = 'admin'` og
blir kontor uten at noe må flyttes. Samme for `kontor` og `lager`, som
tilgangsmigrasjonen nevner. Ingen datamigrasjon, ingen rekkefølgeproblem, ingen
mulighet for at eksisterende brukere mister tilgang mens filen kjører. Det er den
samme forsiktigheten som `20260812090000_tilgangsmodell.sql` viste da den la
brukeren inn før den strammet noe.

Så byttes vakta:

* De sju `alter policy "... admin"` går fra `hm_har_tilgang()` til `hm_er_kontor()`.
* De seks SECURITY DEFINER-funksjonene (`pipe_adjust_stock`, `pipe_apply_markup`,
  `pipe_create_invoice`, `pipe_delete_invoice`, `pipe_delete_order`,
  `pipe_set_stock`) bytter samme vakt. Uten dette ville policyene vært uten
  virkning: en prosjektbruker kunne justert lager og slettet ordrer gjennom RPC.
* `pipe_missing_cost_count` og `pipe_import_costs` likeså.

`hm_har_tilgang()` blir liggende urørt, men betyr nå «har i det hele tatt tilgang
til noe». Adminpanelet bruker den fortsatt til å skille mellom «ingen tilgang» og
«tomt panel», og en prosjektbruker skal være sann her — ellers møter han
nektingsskjermen i stedet for prosjektsiden. Kommentaren på `hm_rolle()` må
oppdateres: den avgrenser noe nå.

En tredje funksjon kommer til:

```
hm_er_prosjektmedlem(p_project_id uuid) -> boolean
  = hm_er_kontor()  eller  rad i project_members på e-posten fra JWT
```

Kontoret ser alle prosjekter. Prosjektbrukeren ser sine.

### Hvor prosjektbrukeren lander

`hm_har_tilgang()` er sann for ham, så adminpanelet slipper ham gjennom vakta i
dag. `AdminDashboard` må derfor spørre `hm_rolle()` og sende `prosjekt` videre
til `/prosjekt` i stedet for å vise faner han ikke har data til. Databasen ville
uansett svart tomt, men et tomt panel er en dårlig forklaring.

## Innkjøpsprisen ligger åpen i dag

Verifisert mot den levende basen 3. september 2026 med anon-nøkkelen, uten
innlogging:

```
GET /rest/v1/pipe_types?select=name,price,cost_price   ->  200
    Overvannsrør X-Stream SN8   price 103   cost_price 66.7
GET /rest/v1/pipe_settings?select=markup_percent       ->  200
    markup_percent 55
```

Enhver besøkende kan lese netto innkjøpspris fra Dahl og påslaget, og dermed
regne ut dekningsbidraget per meter.

Dette er eldre enn denne utvidelsen — `"pipe_types read" for select using (true)`
har stått siden `20260810100000_rorlager_init.sql`. Men det tas med her, fordi
det gjør beslutningen om at prosjektfolk ikke skal se innkjøpspriser til ren
pynt: de ser dem uansett, uten å logge inn.

RLS er radbasert og kan ikke skjule en kolonne. Kolonnerettigheter kan, men
skiller ikke mellom en innlogget kontorbruker og en innlogget prosjektbruker —
begge er `authenticated`. Løsningen er derfor en visning:

```sql
create view public.pipe_katalog as
  select id, category_id, name, dimension, sku, qr_slug, unit, price, stock,
         low_stock_threshold, location, color, description, active, sort_order,
         created_at, updated_at
    from public.pipe_types;
```

`cost_price` er ikke med. Visningen kjører med eierens rettigheter
(`security_invoker = off`, som er standard) og går derfor utenom RLS på
basistabellen — det er nettopp poenget, og det er trygt her fordi visningen ikke
har noen rader som skal skjules. Ingen `where`-klausul, så utvalget er nøyaktig
det samme som i dag; `active` er med som kolonne og filtreres i klienten som før.

Tilsvarende `pipe_innstillinger_offentlig` uten `markup_percent`.

Så:

```sql
revoke select on public.pipe_types    from anon;
revoke select on public.pipe_settings from anon;
drop policy "pipe_types read"    on public.pipe_types;
drop policy "pipe_settings read" on public.pipe_settings;
grant select on public.pipe_katalog, public.pipe_innstillinger_offentlig to anon, authenticated;
```

I klienten deles henting i to:

| Funksjon | Leser | Brukes av |
| --- | --- | --- |
| `fetchKatalog()` | `pipe_katalog` | `Index`, `PipePage`, ny prosjektside |
| `fetchPipeTypes()` | `pipe_types` | `StockTab`, `SettingsTab`, `QrTab`, `PriceImport` |
| `fetchOffentligeInnstillinger()` | visning | Kundeflyten |
| `fetchSettings()` | `pipe_settings` | `SettingsTab` |

`pipe_categories` har ingen følsomme kolonner og røres ikke.

**Dette er den eneste delen som kan skade kundeflyten**, siden QR-siden og
framsiden bytter kilde. Den bygges derfor sist, og verifiseres mot den levende
basen med anon-nøkkelen før og etter.

## Serverfunksjoner

To RPC-er, av samme grunn som `pipe_submit_order` finnes: skrivingen må være hel
eller ikke skje, og vakta må ligge i databasen.

**`project_submit_receipt(p_order_id, p_received_by_name, p_lines jsonb, p_signature, p_note)`**

Skriver mottaket og linjene i én transaksjon, og setter statusen på bestillingen
etterpå: `mottatt` når hver linje er fullt levert, ellers `delvis`. Avviser
mottak på en bestilling som ikke er `bestilt` eller `delvis`. Krever
`hm_er_prosjektmedlem` på prosjektet bestillingen hører til.

Mottatt mer enn bestilt er lov, men tvinger `deviation = 'for_mye'` — det er reell
informasjon, på samme måte som beholdningen får gå i minus i dagens app.

**`project_mark_ordered(p_order_id, p_supplier, p_supplier_ref, p_expected_at, p_lines jsonb)`**

Kontorets bekreftelse. Setter `ordered_qty` per linje, fyller leverandørfeltene
og setter status `bestilt`. Krever `hm_er_kontor()`.

Alt annet — opprette prosjekt, melde behov, legge til linjer — går som vanlige
tabellskriv under RLS. Ingen RPC der policyen holder.

## Sider

| Adresse | Hvem | Hva |
| --- | --- | --- |
| `/prosjekt` | Prosjektbruker og kontor | Liste over prosjektene mine |
| `/prosjekt/:id` | Prosjektbruker og kontor | Bestillinger, status, «meld behov» |
| `/prosjekt/:id/behov` | Prosjektbruker | Bygg lista: søk i katalogen, fritekstlinje, antall |
| `/prosjekt/:id/mottak/:bestillingId` | Prosjektbruker | Mottakskontroll: forventet mot mottatt |
| `/admin` → fane **Prosjekt** | Kontor | Alle prosjekter, opprett, sett folk på |
| `/admin` → fane **Å bestille** | Kontor | Alle `meldt`-linjer på tvers av prosjekter |

Mottakskontrollen er den ene skjermen som må tåle en hanske i regnvær: én linje
per vare, bestilt antall stort og tydelig, ett felt for mottatt antall som er
forhåndsfylt med det bestilte, og avvik bak et trykk. Den som har fått alt
trykker én knapp.

## Det lille ekstra

Fire ting som ikke er strengt nødvendige, men som følger av det som allerede
finnes i appen og gjør funksjonen brukbar i praksis:

1. **Signatur på mottaket.** `SignaturePad` finnes og brukes i kassen. En
   mottakskontroll er et kontrolldokument, og en signatur koster ingenting å ta
   med når komponenten ligger der.
2. **PDF av mottakskontrollen.** `jsPDF` og mønsteret i `order-pdf.ts` er på
   plass. En utskrift med forventet, mottatt og avvik er det du sender Dahl når
   du reklamerer.
3. **Avviksliste for kontoret.** Alle avvik på tvers av prosjekter, nyeste
   først. Uten den må han åpne hver bestilling for å finne ut hva som gikk galt.
4. **Forsinket-merke.** Passerer `expected_at` uten at alt er mottatt, merkes
   bestillingen. Ren utledning, ingen ny kolonne.

Bevisst utelatt: bilder (krever Supabase Storage og personvernarbeid, og du
valgte det bort), kobling mellom det gamle fritekstfeltet `pipe_orders.project`
og de nye prosjektene (tekstmatching er skjør, og gevinsten er uklar), og
prisføring på prosjekt (det er regnskapets jobb, ikke denne appens).

## Rekkefølge

Hver del skal kunne stå alene i basen uten å ødelegge det som virker.

1. **Tilgangsmodellen.** `hm_er_kontor()`, `hm_er_prosjektmedlem()`, bytte av
   vakt i policyer og funksjoner. Ingen synlig endring for dagens brukere — det
   er testen på at den er riktig.
2. **Tabellene og policyene** for de seks nye tabellene. Additivt.
3. **Serverfunksjonene** og typene i `src/integrations/supabase/types.ts`.
4. **Prosjektsidene** for plassen.
5. **Adminfanene** for kontoret.
6. **Katalogvisningen** som tetter innkjøpsprisen. Sist, fordi det er den eneste
   delen som kan røre kundeflyten.

## Det som ble endret under bygging

Fire ting viste seg annerledes enn designet antok. De står her framfor å bli
stilltiende rettet, siden begrunnelsene er verdt mer enn beslutningene.

**`hm_har_tilgang()` ble et alias, ikke et kallsted som skulle byttes.** Designet
sa at sju policyer og åtte SECURITY DEFINER-funksjoner skulle bytte vakt til
`hm_er_kontor()`. Det er femten steder, og åtte av dem ville krevd å skrive
funksjonskropper om igjen — nøyaktig det forrige tilgangsmigrasjon advarte mot
(«Lista er generert fra pg_policies, ikke skrevet fra hukommelsen»). I stedet
fikk `hm_er_kontor()` logikken, og `hm_har_tilgang()` ble en tynn videresending
til den. Alle femten kallstedene endret betydning uten at én kropp ble rørt.
Navnet lyver ikke: kommentaren har hele tiden sagt «tilgang til admindelen».

**`revoke ... from public` var ikke nok til å stenge anon ute.** Supabase har
`alter default privileges in schema public grant all on functions to anon`, så
anon får en *eksplisitt* grant idet en funksjon opprettes, og den overlever at
den implisitte PUBLIC-granten trekkes tilbake. Målt på en base bygd fra
migrasjonene sto `{postgres=X,anon=X,authenticated=X}` igjen på både `hm_rolle`
og `hm_har_tilgang` etter revoke-en fra august. Det lakk ingenting — uten e-post
i JWT-en svarer de null og usant — men migrasjonen påsto at anon var stengt ute.
Alle vaktene har nå `from public, anon`.

**Visningene heter `pipe_catalog` og `pipe_public_settings`,** ikke `pipe_katalog`
og `pipe_innstillinger_offentlig`. Tabeller og kolonner i denne basen er engelske;
det er statusverdiene som er norske.

**Visningene ga anonyme skriverettigheter til hele katalogen.** Funnet i
gjennomgangen, og innført av denne endringen selv. `grant select on pipe_catalog
to anon` legger bare til; Supabases `alter default privileges … grant all on
tables to anon` gjelder også visninger, så anon fikk hele settet
(`anon=arwdDxtm`) i det visningen ble opprettet. En visning uten
`security_invoker` kjører med eierens rettigheter — og det gjelder ikke bare
lesing. En anonym `DELETE FROM pipe_catalog` slo rett gjennom til `pipe_types`
og tømte katalogen; verifisert mot en base bygd fra migrasjonene. Rettet med
`revoke all` før `grant select`, og dekket av `scripts/db-test/sikkerhet.test.mjs`.

**Plassen kunne spille kontor på sin egen bestilling.** Policyen
«project_orders endre» hadde statusvilkår i `using` men ikke i `with check`.
`using` prøver den gamle raden, så `update … set status = 'bestilt'` slapp
gjennom — og da kunne en prosjektbruker sette sin egen `ordered_qty`, altså
fasiten mottakskontrollen måles mot, og kvittere for den selv. Hele kjeden uten
kontoret. Skriving på `project_orders` og `project_order_lines` er nå kontorets
alene; innmelding går gjennom `project_submit_request`, som er SECURITY DEFINER
og ikke trenger en policy. Plassen kan fortsatt trekke tilbake et `meldt` behov.

**`supabase-setup.sql` og `supabase-oppdatering.sql` måtte håndteres.** De var
håndholdte kopier som var blitt liggende igjen bak begge sikkerhetsrettelsene —
null treff på `hm_har_tilgang`, og `using (true) with check (true)` på alle sju
tabellene. README ba operatøren lime dem inn i SQL Editor. Setup-filen genereres
nå fra migrasjonene av `scripts/bygg-setup.mjs`, og oppdateringsfilen er fjernet:
to genererte filer som kan drifte fra hverandre er nøyaktig feilen vi retter.

## Testing

Enhetstester på det som regner:

* Restberegningen: bestilt minus summen av mottatt, over flere puljer.
* Statusutledningen: når blir en bestilling `delvis`, når `mottatt`.
* Avviksutledningen: mottatt mindre enn bestilt uten valgt avvik skal foreslå
  `mangler`; mottatt mer skal tvinge `for_mye`.
* Forsinket-merket rundt datogrensen.

Mot den levende basen, med samme framgangsmåte som `scripts/check-db.mjs`:

* En anonym forespørsel får **ikke** `cost_price` eller `markup_percent`.
* En anonym forespørsel får fortsatt katalogen, og `pipe_submit_order` svarer
  som før. Kundeflyten er urørt.
* En prosjektbruker ser sine prosjekter og ikke andres.
* En prosjektbruker får 42501 fra `pipe_adjust_stock` og leser null rader fra
  `pipe_invoices`.
* Dagens kontorbruker ser nøyaktig det han så før.

Skriptet utvides framfor å lage et nytt, så `npm run check:db` fortsatt er det
ene stedet man sjekker at basen står som den skal.
