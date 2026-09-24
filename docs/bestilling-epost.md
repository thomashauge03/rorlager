# E-post for bestillinger

Kunden får kvittering når bestillingen sendes, og beskjed når kontoret har
godkjent eller avvist den. Kontoret får varsel om hver ny bestilling – med
«Henter nå» først i emnet når kunden står og venter.

Alt er bygget og testet. **Det sendes ingenting før du har gjort punktene
under.** Til da svarer funksjonen «ikke satt opp», og alt annet virker som før:
bestillinger, adminpanel og PDF.

---

## Slik henger det sammen

```
kassen / bestillingssiden / adminpanelet
        │  { id }
        ▼
bestilling-epost (kantfunksjon)  ──▶  pipe_email_claim(id)  ──▶  hva skal sendes, og til hvem
        │
        ▼
      Resend  ──▶  kunden / kontoret
```

**Funksjonen tar aldri imot en e-postadresse eller en e-posttype.** Den får
id-en til en bestilling og spør basen hva som står igjen å sende. Mottakeren
kommer fra bestillingen eller fra innstillingene. Da kan den ikke brukes som
spam-relé, og ingen kan få «klar til henting» sendt for en bestilling som ikke
er godkjent.

**Hver e-post går én gang.** Før sending settes en rad inn i
`pipe_order_emails`. Feiler Resend, fjernes raden igjen, og neste kall prøver på
nytt. Stopper funksjonen midt i en sending, blir raden fri igjen etter et kvarter. Kallet gjøres fra kassen, fra bestillingssiden og fra adminpanelet, så
kontoret får beskjed selv om kunden mistet dekningen idet bestillingen ble sendt.

**Tak:** høyst 10 e-poster per kundeadresse og 90 totalt per døgn (under
gratisgrensen hos Resend på 100), og bare innen et døgn etter hendelsen.

---

## Punktene

### 1. Kjør databaseoppdateringen

Lim `supabase-setup.sql` inn i SQL Editor og kjør den, som vanlig.

### 2. Legg ut funksjonen

Den består av flere filer (`index.ts`, `epost.ts`, `send.ts` og `../_shared/*`), så den
må ut med Supabase CLI, ikke limes inn i dashbordet:

```bash
npx supabase login
npx supabase functions deploy bestilling-epost --no-verify-jwt --project-ref <prosjekt-id>
```

`<prosjekt-id>` er delen foran `.supabase.co` i `VITE_SUPABASE_URL`.

`--no-verify-jwt` er med vilje. Funksjonen stoler uansett ikke på den som
kaller, og kassen sender en enkel forespørsel uten egne hoder. Det er det som
gjør at den kommer fram også når kunden lukker fanen.

### 3. Lag konto og nøkkel hos Resend

[resend.com](https://resend.com) – gratis opp til 3 000 e-poster i måneden og 100
om dagen. Kontoen fra Leveringsseddel kan brukes, men lag **en egen API-nøkkel**
for rørlageret under **API Keys**, så den kan trekkes tilbake alene.

**Du kan prøve i dag, uten domene:** testavsenderen `onboarding@resend.dev`
virker med en gang, men sender bare til adressen kontoen er registrert med.

### 4. Legg verdiene inn i Supabase

Supabase → **Edge Functions → Secrets**:

| Navn | Verdi |
|---|---|
| `RESEND_API_KEY` | nøkkelen fra Resend |
| `EPOST_FRA` | `Hauge Maskin AS <onboarding@resend.dev>` til å begynne med |
| `APP_URL` | adressen appen ligger på, bare domenet uten sti – for eksempel `https://rorlager.vercel.app` |

> **Nøkkelen går rett fra Resend-fanen til Supabase-fanen.** Ikke innom en chat,
> en terminal eller en fil.

### 5. Når du har eget domene

1. Resend → **Domains** → legg til domenet. Velg **EU-regionen (Irland)**.
2. Legg inn DNS-oppføringene Resend gir (SPF, DKIM, gjerne DMARC).
3. Endre `EPOST_FRA` til for eksempel `Hauge Maskin AS <bestilling@hauge-maskin.no>`.

Da går e-postene til alle kunder. Man kan ikke sende fra `vercel.app` – domenet
er Vercels, og kan aldri verifiseres hos Resend.

---

## Hva som sendes

| E-post | Når | Til |
|---|---|---|
| Kvittering | kunden sender inn | kunden |
| Ny bestilling / «Henter nå» | kunden sender inn | «Varsel om nye bestillinger» i Innstillinger, ellers firmaets e-post |
| Klar til henting | kontoret godkjenner | kunden |
| Avvist | kontoret avviser | kunden |

Privatpersoner får angreretten og angreskjemaet i kvitteringen, og hele
vilkårene med angreskjemaet i «klar til henting», som er ordrebekreftelsen. En
lenke til en nettside regnes ikke som varig medium. Fram til e-post er satt opp,
**må** kontoret skrive ut PDF-en til privatkunder ved henting – den har de samme
vilkårene og skjemaet.

Kundens kommentar står bare i e-posten til kontoret, aldri i den til kunden.

## Når noe ikke går

Adminpanelet viser e-postloggen på hver bestilling, og «Send det som mangler»
prøver på nytt. Loggene fra funksjonen ligger under Supabase → Edge Functions →
`bestilling-epost` → Logs.
