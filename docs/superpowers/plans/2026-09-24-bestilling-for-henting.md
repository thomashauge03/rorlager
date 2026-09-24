# Bestilling for henting – arbeidsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En nettbutikk på `/bestill` der bedrifter og privatpersoner søker eller skanner seg fram til rør og bestiller dem til henting; kontoret godkjenner, og først da trekkes lageret.

**Architecture:** Bestillingen er en rad i `pipe_orders` med `kind = 'bestilling'` og `stock_drawn_at = null` til kontoret godkjenner. Alle skrivinger går gjennom `SECURITY DEFINER`-funksjoner; en `check`-regel binder status og lagertrekk sammen. E-post går gjennom kantfunksjonen `bestilling-epost` (Resend), som bare tar imot en bestillings-id og selv avgjør hva som skal sendes.

**Tech Stack:** React 18 + Vite + TypeScript, TanStack Query, shadcn/ui, jsPDF, Supabase (Postgres, PostgREST, Edge Functions/Deno), Resend, `barcode-detector` (zxing-wasm), Vitest, PGlite for databasetester.

**Spec:** `docs/superpowers/specs/2026-09-24-bestilling-for-henting-design.md` — les den før du begynner. Planen argumenterer ut fra den.

## Global Constraints

- All tekst brukeren ser er på norsk bokmål. Kodekommentarer følger fila de står i (nynorsk i `src/lib`, `src/components`, SQL-migrasjonene).
- Tabeller, kolonner og funksjoner heter engelsk; verdier (status, kind, kundetype, e-posttype) er norske.
- Hver migrasjon må tåle å bli kjørt på nytt på en base som er i bruk (`scripts/db-test/omkoyring.test.mjs`). Aldri endre en eldre migrasjon.
- `supabase-setup.sql` genereres med `npm run bygg:setup`, aldri for hånd.
- `pipe_public_settings` får ALDRI nye kolonner (omkjøring ville feilet). Nye offentlige innstillinger går i visningen `pipe_public_order_settings`.
- Tak: 5 bestillinger per e-postadresse per 24 t; 30 bestillinger totalt per time; 10 e-poster per kundeadresse per 24 t (kontoret teller ikke); 90 e-poster totalt per 24 t; e-post bare innen 24 t etter hendelsen.
- Hentedag: fra i dag til og med i dag + 90, regnet i `Europe/Oslo`.
- Feltlengder: navn 100, firma 120, adresse 200, e-post 254, telefon 30, kommentar 1000, melding fra kontoret 1000.
- Linjer: 1–100, antall > 0 og ≤ 100 000, to desimaler. Varer uten pris kan ikke bestilles.
- Knappen i kassen heter nøyaktig «Bestill med betalingsplikt».
- `accept_orders` er `false` som standard; `payment_terms_days` er 14.
- Nye felt på `PipeOrderRow` er valgfrie i TypeScript: frontend kan bli rullet ut før migrasjonen, og da skal alt oppføre seg som uttak.
- Commit-meldinger på norsk, avsluttet med `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Kjør kommandoer med Bash-verktøyet (Git Bash på Windows) fra `C:\Users\thoma\rorlager`.
- Lint og typesjekk har feil fra før. Sjekk bare filene du endrer: `npx eslint <filer>` og at `npx tsc -p tsconfig.app.json --noEmit` ikke får NYE feil (grunnlinjen er 6 feil i `ToOrderTab.tsx`, `projects.ts`, `ProjectReceipt.tsx`, `prosjekt.test.ts`).

## Filkart

| Fil | Ansvar |
| --- | --- |
| `supabase/migrations/20260924100000_bestilling_grunnlag.sql` | Kolonner, regler, innstillinger, visning, e-postlogg, endret sletting og faktura |
| `supabase/migrations/20260924100100_bestilling_funksjonar.sql` | Org.nr.-sjekk, innsending, oppslag, godkjenning, avvisning |
| `supabase/migrations/20260924100200_bestilling_epost.sql` | E-postlåsen: krav, sendt, frigjør |
| `scripts/db-test/bestilling.test.mjs` | Databasetestene for alt over |
| `supabase/functions/_shared/mva.ts` | Mva-regnestykket (én kilde for app og e-post) |
| `supabase/functions/_shared/orgnr.ts` | Kontrollsifferet i org.nr. |
| `supabase/functions/_shared/angrerett.ts` | Vilkår, angrerett og angreskjema |
| `supabase/functions/bestilling-epost/epost.ts` | E-postene som rene funksjoner |
| `supabase/functions/bestilling-epost/index.ts` | Porten mot Resend |
| `src/lib/mva.ts`, `src/lib/orgnr.ts`, `src/lib/vilkar.ts` | Re-eksport av `_shared` til appen (+ `selgerFra`) |
| `src/lib/pickup-form.ts` | Kasseskjemaet som rene funksjoner |
| `src/lib/pickup-cart.ts` | Bestillingskurven og lagrede kundeopplysninger |
| `src/lib/pickup-orders.ts` | Kall mot basen og e-postfunksjonen |
| `src/lib/pickup-pdf.ts` | PDF-en |
| `src/lib/scanner.ts` | Tolking av skannede koder |
| `src/components/Scanner.tsx` | Felles kameraskanner |
| `src/components/PickupCartBar.tsx`, `src/components/LegalFooter.tsx` | Kurvstripe og juridisk bunntekst |
| `src/pages/PickupShop.tsx`, `PickupCheckout.tsx`, `PickupOrder.tsx`, `Vilkar.tsx` | Sidene |
| `src/components/admin/PickupQueue.tsx` | Stripen, detaljene og dialogene i adminpanelet |

---

### Task 1: Databasen – grunnlaget

Kolonnene, regelen om lager og status, innstillingene, den nye visningen, e-postloggen, og de to eksisterende funksjonene som må lære forskjellen på trukket og ikke trukket.

**Files:**
- Create: `supabase/migrations/20260924100000_bestilling_grunnlag.sql`
- Create: `scripts/db-test/bestilling.test.mjs`
- Modify: `supabase-setup.sql` (generert)

**Interfaces:**
- Produces: kolonnene `pipe_orders.kind, stock_drawn_at, pickup_date, pickup_now, customer_type, org_number, billing_address, customer_message`; `pipe_settings.accept_orders, order_email, payment_terms_days`; visningen `pipe_public_order_settings(id, accept_orders, payment_terms_days)`; tabellen `pipe_order_emails(id, order_id, type, recipient, claimed_at, sent_at, provider_id)`; constraint-navnene `pipe_orders_bestilling_lager`, `pipe_orders_bestilling_felt`, `pipe_orders_kind_check`, `pipe_orders_customer_type_check`, `pipe_settings_accept_orders_check`, `pipe_settings_payment_terms_check`.
- Produces (testfil): hjelperne `rawBestilling`, `lager`, `avvist`, variablene `ROR`, `BEND`, `UTAN_PRIS`, `UTGATT`, `KONTOR`, `LEIF`, `KARI`, `FREMMED`, og avslutningslinjene som Task 2 og 3 setter inn tekst foran.

- [ ] **Step 1: Skriv testfila**

Create `scripts/db-test/bestilling.test.mjs`:

```js
// Tester bestillingane: kunden som bestiller rør til henting, og kontoret som
// godkjenner eller avviser før lageret blir rørt.
//
// KVIFOR DENNE FILA FINST
//
// Ei bestilling er eit uttak meldt på førehand, og ligg i same tabell som
// uttaka. Tre stader i basen har til no gått ut frå at lageret alltid er trekt
// når ei ordre finst – sletting, fakturering og statusbyte. Alle tre er lukka i
// basen, og dette er testane som seier at dei er det.
//
// Køyr med: npm run test:db

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { byggBase, som, somAnon, nekta, lagFasit } from "./base.mjs";

const HER = dirname(fileURLToPath(import.meta.url));
const MIG = join(HER, "..", "..", "supabase", "migrations");

const KONTOR = { epost: "thomashauge03@gmail.com", uid: "11111111-1111-1111-1111-111111111111" };
const LEIF = { epost: "lager@hauge.no", uid: "55555555-5555-5555-5555-555555555555" };
const KARI = { epost: "kari@plassen.no", uid: "22222222-2222-2222-2222-222222222222" };
const FREMMED = { epost: "fremmed@internett.no", uid: "44444444-4444-4444-4444-444444444444" };

const { tilstand, ok, nei, sjekk } = lagFasit();
const db = await byggBase();
const en = async (sql, p) => (await db.query(sql, p)).rows[0];
const alle = async (sql, p) => (await db.query(sql, p)).rows;
const tal = (v) => (v === null || v === undefined ? v : Number(v));

/** Sjekkar at eit kall feilar, og at det feilar med den grunnen vi ventar. */
const avvist = async (tittel, sql, params, mønster) => {
  const m = await nekta(() => db.query(sql, params));
  m && mønster.test(m) ? ok(tittel) : nei(tittel, m ?? "GIKK GJENNOM");
};

const lager = async (id) => tal((await en(`select stock from public.pipe_types where id = $1`, [id])).stock);

console.log("\n── Oppsett ──\n");

await db.exec(`
  insert into public.system_users (email, full_name, role) values
    ('lager@hauge.no', 'Leif Lager', 'lager'),
    ('kari@plassen.no', 'Kari Nordmann', 'prosjekt');
`);

const kat = await en(`insert into public.pipe_categories (name) values ('Bestillingstest') returning id`);
const nyType = async (namn, sku, slug, eining, pris, lagerStart, aktiv = true) =>
  (
    await en(
      `insert into public.pipe_types (category_id, name, sku, qr_slug, unit, price, cost_price, stock, active)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
      [kat.id, namn, sku, slug, eining, pris, pris === null ? null : pris / 2, lagerStart, aktiv],
    )
  ).id;

const ROR = await nyType("Bestillingsrør 110", "B-110", "best-110", "m", 100, 40);
const BEND = await nyType("Bestillingsbend", "B-BEND", "best-bend", "stk", 25, 6);
const UTAN_PRIS = await nyType("Rør uten pris", "B-NOP", "best-nop", "m", null, 10);
const UTGATT = await nyType("Utgått bestillingsrør", "B-UT", "best-ut", "m", 10, 3, false);
ok("fire testvarer");

/** Ei bestilling lagd rett inn, slik ho ser ut før godkjenning. */
const rawBestilling = async (over = {}) => {
  const o = {
    status: "ny",
    stock_drawn_at: null,
    customer_type: "privat",
    pickup_date: "2026-10-01",
    customer_email: "ola@kunde.no",
    ...over,
  };
  return (
    await en(
      `insert into public.pipe_orders
         (kind, customer_name, status, stock_drawn_at, customer_type, pickup_date, customer_email, total)
       values ('bestilling', 'Rå Kunde', $1, $2, $3, $4, $5, 0) returning id`,
      [o.status, o.stock_drawn_at, o.customer_type, o.pickup_date, o.customer_email],
    )
  ).id;
};

// ════════════════════════════════════════════════════════════════════════════
console.log("\n── Grunnlaget: kolonnene og regelen om lager og status ──\n");

// Tilbakefyllinga. Eit uttak utan tidspunkt skal få tidspunktet det blei sendt
// inn når migrasjonen køyrer – første gong eller om att.
const gamalt = (
  await en(
    `insert into public.pipe_orders (customer_name, created_at, stock_drawn_at)
     values ('Gammel Kunde', '2026-08-01T10:00:00Z', null) returning id`,
  )
).id;
const venter = await rawBestilling();
await db.exec(readFileSync(join(MIG, "20260924100000_bestilling_grunnlag.sql"), "utf8"));
ok("grunnlagsmigrasjonen tåler å bli kjørt en gang til");

const g = await en(`select kind, stock_drawn_at = created_at as lik from public.pipe_orders where id = $1`, [gamalt]);
sjekk("et gammelt uttak er et uttak", g.kind, "uttak");
sjekk("og får tidspunktet det ble sendt inn som trekktidspunkt", g.lik, true);
sjekk(
  "en ventende bestilling blir ikke fylt – null betyr at lageret ikke er trukket",
  (await en(`select stock_drawn_at from public.pipe_orders where id = $1`, [venter])).stock_drawn_at,
  null,
);
sjekk(
  "et nytt uttak får trekktidspunkt av seg selv",
  (await en(`insert into public.pipe_orders (customer_name) values ('Ny') returning stock_drawn_at is not null as satt`)).satt,
  true,
);

await avvist(
  "en ventende bestilling kan ikke settes til «behandlet» uten at lageret er trukket",
  `update public.pipe_orders set status = 'behandlet' where id = $1`,
  [venter],
  /pipe_orders_bestilling_lager/,
);
await avvist(
  "og kan ikke få et trekktidspunkt uten å bli godkjent",
  `update public.pipe_orders set stock_drawn_at = now() where id = $1`,
  [venter],
  /pipe_orders_bestilling_lager/,
);
await avvist(
  "en bestilling uten kundetype avvises",
  `insert into public.pipe_orders (kind, customer_name, stock_drawn_at, pickup_date, customer_email)
   values ('bestilling', 'X', null, '2026-10-01', 'x@y.no')`,
  [],
  /pipe_orders_bestilling_felt/,
);
await avvist(
  "en bestilling uten hentedag avvises",
  `insert into public.pipe_orders (kind, customer_name, stock_drawn_at, customer_type, customer_email)
   values ('bestilling', 'X', null, 'privat', 'x@y.no')`,
  [],
  /pipe_orders_bestilling_felt/,
);
await avvist(
  "en ukjent kundetype avvises",
  `insert into public.pipe_orders (customer_name, customer_type) values ('X', 'firma')`,
  [],
  /pipe_orders_customer_type_check/,
);
await avvist(
  "en ukjent kind avvises",
  `insert into public.pipe_orders (kind, customer_name) values ('leie', 'X')`,
  [],
  /pipe_orders_kind_check/,
);

// ════════════════════════════════════════════════════════════════════════════
console.log("\n── Innstillingene ──\n");

sjekk(
  "bestilling på nett er av som standard",
  (await en(`select accept_orders from public.pipe_settings where id = 1`)).accept_orders,
  false,
);
sjekk(
  "betalingsfristen er 14 dager",
  tal((await en(`select payment_terms_days from public.pipe_settings where id = 1`)).payment_terms_days),
  14,
);

await db.exec(`update public.pipe_settings set org_number = null, address = null, email = null where id = 1`);
await avvist(
  "bryteren kan ikke slås på uten firmaopplysningene",
  `update public.pipe_settings set accept_orders = true where id = 1`,
  [],
  /pipe_settings_accept_orders_check/,
);
await avvist(
  "heller ikke med bare org.nr.",
  `update public.pipe_settings set accept_orders = true, org_number = '974760673' where id = 1`,
  [],
  /pipe_settings_accept_orders_check/,
);
await db.exec(`
  update public.pipe_settings
     set company_name = 'Hauge Maskin AS', org_number = '974760673',
         address = 'Industrivegen 1, 5700 Voss', email = 'post@hauge.no',
         phone = '56 00 00 00', accept_orders = true
   where id = 1;
`);
sjekk(
  "med firmanavn, org.nr., adresse og e-post går det",
  (await en(`select accept_orders from public.pipe_settings where id = 1`)).accept_orders,
  true,
);
await avvist(
  "e-posten kan ikke tømmes mens bryteren står på",
  `update public.pipe_settings set email = '  ' where id = 1`,
  [],
  /pipe_settings_accept_orders_check/,
);
await avvist(
  "betalingsfrist over 90 dager avvises",
  `update public.pipe_settings set payment_terms_days = 91 where id = 1`,
  [],
  /pipe_settings_payment_terms_check/,
);

// ════════════════════════════════════════════════════════════════════════════
console.log("\n── Visningen kunden leser ──\n");

await somAnon(db, async () => {
  const v = await en(`select * from public.pipe_public_order_settings`);
  sjekk("anon ser om bestilling er åpent, og betalingsfristen", [v.accept_orders, tal(v.payment_terms_days)], [true, 14]);
  sjekk("men ikke varseladressen", "order_email" in v, false);
  for (const [sql, hva] of [
    [`update public.pipe_public_order_settings set accept_orders = false`, "UPDATE"],
    [`delete from public.pipe_public_order_settings`, "DELETE"],
  ]) {
    const m = await nekta(() => db.query(sql));
    m ? ok(`anon: ${hva} på visningen nektes`) : nei(`${hva} på visningen`, "ANON FIKK SKRIVE");
  }
  const m = await nekta(() => db.query(`select order_email from public.pipe_settings`));
  m ? ok("anon: pipe_settings er fortsatt stengt") : nei("pipe_settings", "ANON FIKK LESE");
});
sjekk(
  "bryteren står fortsatt på etter forsøkene",
  (await en(`select accept_orders from public.pipe_settings where id = 1`)).accept_orders,
  true,
);

// ════════════════════════════════════════════════════════════════════════════
console.log("\n── E-postloggen ──\n");

await db.query(
  `insert into public.pipe_order_emails (order_id, type, recipient) values ($1, 'kvittering', 'ola@kunde.no')`,
  [venter],
);
await somAnon(db, async () => {
  const m = await nekta(() => db.query(`select * from public.pipe_order_emails`));
  m ? ok("anon: e-postloggen er stengt") : nei("e-postloggen", "ANON FIKK LESE");
});
await som(db, KARI, async () => {
  sjekk("prosjektbrukeren ser ingen rader", (await alle(`select id from public.pipe_order_emails`)).length, 0);
  const m = await nekta(() =>
    db.query(`insert into public.pipe_order_emails (order_id, type, recipient) values ($1, 'klar', 'x@y.no')`, [venter]),
  );
  m ? ok("og kan ikke skrive") : nei("prosjektbruker skriver", "GIKK GJENNOM");
});
await som(db, LEIF, async () => {
  sjekk(
    "kontoret ser loggen",
    (await alle(`select type from public.pipe_order_emails where order_id = $1`, [venter])).map((r) => r.type),
    ["kvittering"],
  );
  const m = await nekta(() => db.query(`delete from public.pipe_order_emails`));
  m ? ok("men kan ikke slette i den") : nei("kontoret sletter", "GIKK GJENNOM");
});

// ════════════════════════════════════════════════════════════════════════════
console.log("\n── Sletting og faktura ser forskjell på trukket og ikke trukket ──\n");

const foerVentende = await lager(ROR);
const ventende = await rawBestilling();
const ventendeNr = Number((await en(`select order_number from public.pipe_orders where id = $1`, [ventende])).order_number);
await db.query(
  `insert into public.pipe_order_lines (order_id, pipe_type_id, name, unit, quantity, unit_price, line_total)
   values ($1, $2, 'Bestillingsrør 110', 'm', 7, 100, 700)`,
  [ventende, ROR],
);
await som(db, LEIF, async () => {
  await avvist(
    "en ventende bestilling kan ikke faktureres",
    `select (public.pipe_create_invoice('Rå Kunde', current_date, current_date, array[$1::uuid], 0)).id`,
    [ventende],
    /ikke godkjent/,
  );
  await db.query(`select public.pipe_delete_order($1)`, [ventende]);
});
sjekk("sletting av en ventende bestilling rører ikke lageret", await lager(ROR), foerVentende);
sjekk(
  "og skriver ingen tilbakeføring i loggen",
  (await alle(`select id from public.pipe_stock_log where note = $1`, [`Slettet bestilling #${ventendeNr}`])).length,
  0,
);

const trukket = await rawBestilling();
await db.query(
  `insert into public.pipe_order_lines (order_id, pipe_type_id, name, unit, quantity, unit_price, line_total)
   values ($1, $2, 'Bestillingsrør 110', 'm', 7, 100, 700)`,
  [trukket, ROR],
);
// Godkjenninga slik ho ser ut i basen: status og trekktidspunkt i éi setning,
// og beholdninga ned. Funksjonen som gjer dette, kjem i neste migrasjon.
await db.query(`update public.pipe_orders set status = 'behandlet', stock_drawn_at = now() where id = $1`, [trukket]);
await db.query(`update public.pipe_types set stock = stock - 7 where id = $1`, [ROR]);
const foerSletting = await lager(ROR);
await som(db, LEIF, async () => {
  const f = (
    await en(
      `select (public.pipe_create_invoice('Rå Kunde', current_date, current_date, array[$1::uuid], 0)).id as id`,
      [trukket],
    )
  ).id;
  f ? ok("en godkjent bestilling kan faktureres") : nei("faktura på godkjent bestilling", "ingen id");
  await db.query(`select public.pipe_delete_invoice($1)`, [f]);
  await db.query(`select public.pipe_delete_order($1)`, [trukket]);
});
sjekk("sletting av en godkjent bestilling legger rørene tilbake", await lager(ROR), foerSletting + 7);

// ════════════════════════════════════════════════════════════════════════════
console.log(tilstand.feil === 0 ? `\nAlt i orden. Bestillingene holder.\n` : `\n${tilstand.feil} feil.\n`);
process.exit(tilstand.feil === 0 ? 0 : 1);
```

- [ ] **Step 2: Kjør testen og se at den feiler**

Run: `node scripts/db-test/bestilling.test.mjs`
Expected: FAIL — `ENOENT` på `20260924100000_bestilling_grunnlag.sql`, eller «column "kind" does not exist».

- [ ] **Step 3: Skriv migrasjonen**

Create `supabase/migrations/20260924100000_bestilling_grunnlag.sql`:

```sql
-- Bestilling for henting: grunnlaget.
--
-- Ei bestilling er eit uttak meldt på førehand. Ho blir ei rad i pipe_orders
-- med kind = 'bestilling', og skil seg frå eit uttak berre i NÅR lageret blir
-- trekt: ved godkjenning, ikkje ved innsending. Heile resonnementet står i
-- docs/superpowers/specs/2026-09-24-bestilling-for-henting-design.md.
--
-- Fila kan køyrast om att på ein base som er i bruk. omkoyring.test.mjs prøver
-- nettopp det, og kvar setning her er skriven for å tole det.


-- ── 1. Nye kolonner på pipe_orders ──

alter table public.pipe_orders
  add column if not exists kind text not null default 'uttak',
  add column if not exists stock_drawn_at timestamptz,
  add column if not exists pickup_date date,
  add column if not exists pickup_now boolean not null default false,
  add column if not exists customer_type text,
  add column if not exists org_number text,
  add column if not exists billing_address text,
  add column if not exists customer_message text;

/*
 * REKKJEFØLGJA ER MED VILJE.
 *
 * stock_drawn_at kom til utan standard, og kvart uttak som finst får
 * tidspunktet det blei sendt inn – det var då lageret blei trekt. Først
 * DERETTER blir standarden now(). Stod standarden der frå starten, ville kvart
 * gamle uttak fått tidspunktet migrasjonen køyrde.
 *
 * Berre uttak blir fylte. Ei bestilling som ventar skal ha null: det er nettopp
 * det som seier at lageret ikkje er trekt. Ved omkøyring finst det ingen uttak
 * utan tidspunkt, så setninga rører då ingenting.
 */
update public.pipe_orders
   set stock_drawn_at = created_at
 where kind = 'uttak' and stock_drawn_at is null;

alter table public.pipe_orders alter column stock_drawn_at set default now();

alter table public.pipe_orders drop constraint if exists pipe_orders_kind_check;
alter table public.pipe_orders add constraint pipe_orders_kind_check
  check (kind in ('uttak', 'bestilling'));

alter table public.pipe_orders drop constraint if exists pipe_orders_customer_type_check;
alter table public.pipe_orders add constraint pipe_orders_customer_type_check
  check (customer_type is null or customer_type in ('privat', 'bedrift'));

/*
 * REGELEN OM LAGER OG STATUS.
 *
 * For ei bestilling seier statusen alltid om lageret er trekt: «ny» og
 * «avvist» betyr ikkje trekt, «behandlet» og «levert» betyr trekt.
 *
 * Utan denne kunne ein vanleg `update ... set status = 'behandlet'` –
 * statusveljaren i adminpanelet, eller «Merk som behandlet» på fleire rader –
 * gjort ei bestilling «klar til henting» utan at eit einaste rør var trekt.
 * Med han er godkjenningsfunksjonen den einaste vegen frå «ny» til «behandlet».
 */
alter table public.pipe_orders drop constraint if exists pipe_orders_bestilling_lager;
alter table public.pipe_orders add constraint pipe_orders_bestilling_lager check (
  kind <> 'bestilling'
  or (status in ('ny', 'avvist') and stock_drawn_at is null)
  or (status in ('behandlet', 'levert') and stock_drawn_at is not null)
);

-- Det kontoret og e-posten treng for å gjere jobben sin.
alter table public.pipe_orders drop constraint if exists pipe_orders_bestilling_felt;
alter table public.pipe_orders add constraint pipe_orders_bestilling_felt check (
  kind <> 'bestilling'
  or (customer_type is not null and pickup_date is not null and customer_email is not null)
);

-- Stripa «Venter på godkjenning» spør etter nettopp dette, kvart minutt.
create index if not exists idx_pipe_orders_kind_status on public.pipe_orders (kind, status);


-- ── 2. Innstillingane ──

alter table public.pipe_settings
  add column if not exists accept_orders boolean not null default false,
  add column if not exists order_email text,
  add column if not exists payment_terms_days integer not null default 14;

alter table public.pipe_settings drop constraint if exists pipe_settings_payment_terms_check;
alter table public.pipe_settings add constraint pipe_settings_payment_terms_check
  check (payment_terms_days between 0 and 90);

/*
 * BRYTAREN KAN IKKJE SLÅAST PÅ FØR SELJAREN FINST.
 *
 * Vilkåra kunden godtek, og angreskjemaet kunden skal kunne sende, må seie kven
 * som sel og kvar ei angremelding skal. Utan firmanamn, org.nr., adresse og
 * e-post er begge ugyldige – og eit skjema som tek imot bestillingar frå
 * privatpersonar utan dei, bryt angrerettlova frå første bestilling.
 */
alter table public.pipe_settings drop constraint if exists pipe_settings_accept_orders_check;
alter table public.pipe_settings add constraint pipe_settings_accept_orders_check check (
  not accept_orders
  or (
    nullif(btrim(company_name), '') is not null
    and nullif(btrim(coalesce(org_number, '')), '') is not null
    and nullif(btrim(coalesce(address, '')), '') is not null
    and nullif(btrim(coalesce(email, '')), '') is not null
  )
);

/*
 * EIGA VISNING, IKKJE NYE KOLONNER PÅ pipe_public_settings.
 *
 * `create or replace view` kan leggje til kolonner bakerst, men aldri fjerne
 * nokon. Ved omkøyring av supabase-setup.sql køyrer 20260903090200 først og
 * lagar pipe_public_settings med sine kolonner – mot ei visning som då ville
 * hatt to fleire. Postgres nektar («cannot drop columns from view»), og heile
 * fila stoppar på ein base som er i bruk. Ei eiga visning har ingen eldre
 * definisjon å kollidere med.
 *
 * order_email er ikkje med: varseladressa er kontoret sin.
 */
create or replace view public.pipe_public_order_settings as
  select id, accept_orders, payment_terms_days
    from public.pipe_settings;

comment on view public.pipe_public_order_settings is
  'Det bestillingsskjemaet treng å vite: om det er ope, og betalingsfristen. Varseladressa er ikkje med.';

-- REVOKE FØR GRANT, same grunn som i 20260903090200: Supabase deler ut alt på
-- nye visningar til anon, og ei visning utan security_invoker skriv rett
-- gjennom til tabellen bak.
revoke all on public.pipe_public_order_settings from public, anon, authenticated;
grant select on public.pipe_public_order_settings to anon, authenticated;


-- ── 3. E-postloggen ──
--
-- Éi rad per e-post som er send, eller som er i ferd med å bli send. Den unike
-- nøkkelen på (bestilling, type) er låsen som hindrar at same e-post går to
-- gonger – sjå pipe_email_claim i 20260924100200.

create table if not exists public.pipe_order_emails (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.pipe_orders(id) on delete cascade,
  type text not null check (type in ('kvittering', 'kontor', 'klar', 'avvist')),
  recipient text not null,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  provider_id text,
  unique (order_id, type)
);

create index if not exists idx_pipe_order_emails_claimed on public.pipe_order_emails (claimed_at desc);
create index if not exists idx_pipe_order_emails_recipient on public.pipe_order_emails (recipient, claimed_at desc);

alter table public.pipe_order_emails enable row level security;

drop policy if exists "pipe_order_emails les" on public.pipe_order_emails;
create policy "pipe_order_emails les" on public.pipe_order_emails
  for select to authenticated using (public.hm_er_kontor());

-- Kontoret les loggen på bestillingskortet. Ingen skriv i han utanom
-- funksjonane, som køyrer med eigaren sine rettar.
revoke all on public.pipe_order_emails from public, anon, authenticated;
grant select on public.pipe_order_emails to authenticated;


-- ── 4. Sletting: berre det som faktisk blei teke ut, går tilbake ──
--
-- Fram til no hadde kvar ordre trekt lageret i det ho blei sendt inn, så
-- sletting la alltid røra tilbake. Ei bestilling som aldri blei godkjend, har
-- aldri teke noko – og å leggje tilbake røra hennar ville lagt til rør som
-- aldri var borte.

create or replace function public.pipe_delete_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line record;
  v_balance numeric;
  v_number bigint;
  v_drawn timestamptz;
begin
  if not public.hm_har_tilgang() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
  end if;

  select order_number, stock_drawn_at into v_number, v_drawn
    from public.pipe_orders where id = p_order_id;
  if not found then
    raise exception 'Fant ikke bestillingen';
  end if;

  if v_drawn is not null then
    for v_line in
      select pipe_type_id, name, quantity from public.pipe_order_lines where order_id = p_order_id
    loop
      if v_line.pipe_type_id is not null then
        update public.pipe_types set stock = stock + v_line.quantity
          where id = v_line.pipe_type_id
          returning stock into v_balance;

        insert into public.pipe_stock_log (pipe_type_id, pipe_name, change, balance_after, reason, note, created_by)
        values (v_line.pipe_type_id, v_line.name, v_line.quantity, v_balance, 'sletting',
                'Slettet bestilling #' || v_number, auth.uid());
      end if;
    end loop;
  end if;

  delete from public.pipe_orders where id = p_order_id;
end;
$$;

revoke all on function public.pipe_delete_order(uuid) from public, anon;
grant execute on function public.pipe_delete_order(uuid) to authenticated;


-- ── 5. Fakturagrunnlaget tek berre det som har forlate lageret ──
--
-- Ei bestilling som ventar, eller som er avvist, har ingen rør på seg å
-- fakturere. Resten av kroppen er som i 20260903093000.

create or replace function public.pipe_create_invoice(
  p_customer_name text,
  p_period_from date,
  p_period_to date,
  p_order_ids uuid[],
  p_total numeric,
  p_note text default null
)
returns public.pipe_invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.pipe_invoices;
  v_already int;
  v_finnes int;
  v_ikkje_trekt int;
  v_sum numeric;
begin
  if not public.hm_er_kontor() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
  end if;
  if p_order_ids is null or array_length(p_order_ids, 1) is null then
    raise exception 'Ingen bestillinger valgt';
  end if;
  if p_period_from is null or p_period_to is null then
    raise exception 'Både fra- og til-dato må fylles ut';
  end if;

  select count(*) into v_finnes from public.pipe_orders where id = any(p_order_ids);
  if v_finnes <> array_length(p_order_ids, 1) then
    raise exception 'Fant ikke alle bestillingene. Last siden på nytt.';
  end if;

  select count(*) into v_already
    from public.pipe_orders
   where id = any(p_order_ids) and invoice_id is not null;
  if v_already > 0 then
    raise exception '% av bestillingene er allerede fakturert', v_already;
  end if;

  select count(*) into v_ikkje_trekt
    from public.pipe_orders
   where id = any(p_order_ids) and stock_drawn_at is null;
  if v_ikkje_trekt > 0 then
    raise exception '% av bestillingene er ikke godkjent', v_ikkje_trekt;
  end if;

  select coalesce(sum(total), 0) into v_sum
    from public.pipe_orders where id = any(p_order_ids);

  insert into public.pipe_invoices (customer_name, period_from, period_to, total, note)
  values (p_customer_name, p_period_from, p_period_to, v_sum, p_note)
  returning * into v_invoice;

  update public.pipe_orders
     set invoice_id = v_invoice.id
   where id = any(p_order_ids);

  return v_invoice;
end;
$$;

revoke all on function public.pipe_create_invoice(text, date, date, uuid[], numeric, text) from public, anon;
grant execute on function public.pipe_create_invoice(text, date, date, uuid[], numeric, text) to authenticated;
```

- [ ] **Step 4: Kjør testen og se at den passerer**

Run: `node scripts/db-test/bestilling.test.mjs`
Expected: PASS — siste linje «Alt i orden. Bestillingene holder.»

- [ ] **Step 5: Bygg setup-fila og kjør alle databasetestene**

Run: `npm run bygg:setup && npm run test:db`
Expected: «7 testfil(er) kjørte gjennom.» Uttakstestene (`uttak.test.mjs`) står uendret og passerer.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260924100000_bestilling_grunnlag.sql scripts/db-test/bestilling.test.mjs supabase-setup.sql
git commit -m "Bestilling: kolonnene, regelen om lager og status, og innstillingene

En bestilling er en rad i pipe_orders med kind = 'bestilling' og
stock_drawn_at = null til kontoret godkjenner. En check-regel binder
status og lagertrekk sammen, så ingen vanlig update kan gjøre en
bestilling klar uten at lageret er trukket.

Sletting legger bare tilbake det som faktisk ble tatt ut, og
fakturagrunnlaget nekter bestillinger som ikke er godkjent.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Databasen – innsending, oppslag, godkjenning og avvisning

**Files:**
- Create: `supabase/migrations/20260924100100_bestilling_funksjonar.sql`
- Modify: `scripts/db-test/bestilling.test.mjs` (ny bolk før avslutninga)
- Modify: `supabase-setup.sql` (generert)

**Interfaces:**
- Consumes: alt fra Task 1.
- Produces (SQL):
  - `hm_orgnr_gyldig(p_orgnr text) → boolean` (ingen kjørerett for noen; brukes internt)
  - `pipe_submit_pickup_order(p_customer_type text, p_customer_name text, p_customer_email text, p_lines jsonb, p_customer_phone text = null, p_company text = null, p_org_number text = null, p_billing_address text = null, p_pickup_now boolean = false, p_pickup_date date = null, p_comment text = null) → jsonb {id, order_number}` (anon + authenticated)
  - `pipe_get_pickup_order(p_id uuid) → jsonb | null` (anon + authenticated). Felter: `id, order_number, created_at, status, pickup_date, pickup_now, customer_type, customer_name, customer_email, customer_phone, company, org_number, billing_address, comment, customer_message, handled_at, total, lines[{name, dimension, sku, unit, quantity, unit_price, line_total}], emails{kvittering?, klar?, avvist?}`
  - `pipe_approve_pickup_order(p_id uuid, p_message text = null) → jsonb` (hele raden; bare kontoret)
  - `pipe_reject_pickup_order(p_id uuid, p_message text) → jsonb` (hele raden; bare kontoret)
- Produces (testfil): `SEND`, `privat(over)`, `GODKJENN`, `AVVIS`, `iDag`, `omDager(n)`, `OM_TRE`, `bestId`, `bestNr`, `uttak` — brukt av Task 3.

- [ ] **Step 1: Skriv testene**

I `scripts/db-test/bestilling.test.mjs`: sett inn denne bolken rett FØR linja som begynner med `console.log(tilstand.feil === 0`:

```js
// ════════════════════════════════════════════════════════════════════════════
console.log("\n── Kunden sender inn en bestilling ──\n");

const SEND = `select public.pipe_submit_pickup_order(
  p_customer_type => $1, p_customer_name => $2, p_customer_email => $3, p_lines => $4::jsonb,
  p_customer_phone => $5, p_company => $6, p_org_number => $7, p_billing_address => $8,
  p_pickup_now => $9, p_pickup_date => $10::date, p_comment => $11) as r`;

const iDag = (await en(`select ((now() at time zone 'Europe/Oslo')::date)::text as d`)).d;
const omDager = async (n) =>
  (await en(`select (((now() at time zone 'Europe/Oslo')::date) + $1::int)::text as d`, [n])).d;
const OM_TRE = await omDager(3);

/** Parametrane til SEND for ein privatperson. Overstyr det testen handlar om. */
const privat = (over = {}) => {
  const o = {
    type: "privat",
    navn: "Ola Privat",
    epost: "ola@privat.no",
    telefon: "900 00 000",
    firma: null,
    orgnr: null,
    adresse: "Bakkevegen 3, 5700 Voss",
    naa: false,
    dato: OM_TRE,
    kommentar: "Henter med tilhenger",
    linjer: [
      { pipe_type_id: ROR, quantity: 12.5 },
      { pipe_type_id: BEND, quantity: 4 },
    ],
    ...over,
  };
  return [o.type, o.navn, o.epost, JSON.stringify(o.linjer), o.telefon, o.firma, o.orgnr, o.adresse, o.naa, o.dato, o.kommentar];
};

const lagerFoer = [await lager(ROR), await lager(BEND)];
let bestId, bestNr;

await somAnon(db, async () => {
  const r = (await en(SEND, privat())).r;
  bestId = r?.id;
  bestNr = Number(r?.order_number);
  bestNr > 0 ? ok(`bestillingen gikk inn med nummer ${bestNr}`) : nei("innsending", JSON.stringify(r));
  sjekk("svaret er bare id og nummer – kunden henter resten med id-en", Object.keys(r).sort(), ["id", "order_number"]);
});

sjekk("lageret er ikke rørt", [await lager(ROR), await lager(BEND)], lagerFoer);
sjekk(
  "ingen lagerlogg ble skrevet",
  (await alle(`select id from public.pipe_stock_log where order_id = $1`, [bestId])).length,
  0,
);

const b = await en(
  `select kind, status, stock_drawn_at, customer_type, billing_address, pickup_date::text as dag, pickup_now, total
     from public.pipe_orders where id = $1`,
  [bestId],
);
sjekk("den er en bestilling som venter", [b.kind, b.status, b.stock_drawn_at], ["bestilling", "ny", null]);
sjekk("kundetype og fakturaadresse er lagret", [b.customer_type, b.billing_address], ["privat", "Bakkevegen 3, 5700 Voss"]);
sjekk("hentedagen er den kunden valgte", [b.dag, b.pickup_now], [OM_TRE, false]);
sjekk("summen er regnet av basens priser: 12,5 × 100 + 4 × 25", tal(b.total), 1350);

const bl = await alle(
  `select name, unit_price, line_total from public.pipe_order_lines where order_id = $1 order by sort_order`,
  [bestId],
);
sjekk(
  "linjene har prisene fra katalogen",
  bl.map((l) => [l.name, tal(l.unit_price), tal(l.line_total)]),
  [
    ["Bestillingsrør 110", 100, 1250],
    ["Bestillingsbend", 25, 100],
  ],
);

await somAnon(db, async () => {
  const r = (
    await en(
      SEND,
      privat({
        type: "Bedrift",
        navn: "Kari Kontakt",
        epost: "  Kari@Firma.NO ",
        firma: "Firma AS",
        orgnr: "974 760 673",
        adresse: "Skal ikke lagres",
      }),
    )
  ).r;
  const f = await en(
    `select customer_type, customer_email, company, org_number, billing_address from public.pipe_orders where id = $1`,
    [r.id],
  );
  sjekk(
    "bedrift: org.nr. uten mellomrom, e-post med små bokstaver",
    [f.customer_type, f.customer_email, f.company, f.org_number],
    ["bedrift", "kari@firma.no", "Firma AS", "974760673"],
  );
  sjekk("og en adresse ingen ba om, blir ikke lagret", f.billing_address, null);
});

await somAnon(db, async () => {
  const r = (await en(SEND, privat({ epost: "naa@kunde.no", naa: true, dato: "2020-01-01" }))).r;
  const n = await en(`select pickup_date::text as dag, pickup_now from public.pipe_orders where id = $1`, [r.id]);
  sjekk("«henter nå» gir dagens dato, uansett hva klienten sendte", [n.dag, n.pickup_now], [iDag, true]);
});

// ════════════════════════════════════════════════════════════════════════════
console.log("\n── Det innsendingen ikke godtar ──\n");
// Kassen stoppar det meste av dette, men kassen er ikkje grensa. Kven som helst
// kan kalle funksjonen direkte med anon-nøkkelen.

await somAnon(db, async () => {
  const feil = (tittel, over, mønster) => avvist(tittel, SEND, privat({ epost: "feil@kunde.no", ...over }), mønster);

  await feil("ukjent kundetype", { type: "firma" }, /privatperson eller bedrift/);
  await feil("tomt navn", { navn: "  " }, /Navn må fylles ut/);
  await feil("navn over 100 tegn", { navn: "x".repeat(101) }, /Navnet er for langt/);
  await feil("tom e-post", { epost: "" }, /E-post må fylles ut/);
  await feil("e-post uten krøllalfa", { epost: "ola.privat.no" }, /ser ikke riktig ut/);
  await feil("telefon mangler når den kreves", { telefon: null }, /Telefonnummer må fylles ut/);
  await feil("privat uten adresse", { adresse: " " }, /Fakturaadresse må fylles ut/);
  await feil("adresse over 200 tegn", { adresse: "x".repeat(201) }, /Adressen er for lang/);
  await feil("bedrift uten firma", { type: "bedrift", firma: null, orgnr: "974760673" }, /Firmanavn må fylles ut/);
  await feil(
    "bedrift med feil kontrollsiffer",
    { type: "bedrift", firma: "Firma AS", orgnr: "974760674" },
    /Organisasjonsnummeret er ikke gyldig/,
  );
  await feil(
    "bedrift der kontrollsifferet ville blitt 10",
    { type: "bedrift", firma: "Firma AS", orgnr: "900000090" },
    /Organisasjonsnummeret er ikke gyldig/,
  );
  await feil("kommentar over 1000 tegn", { kommentar: "x".repeat(1001) }, /Kommentaren er for lang/);
  await feil("ingen hentedag", { dato: null }, /hvilken dag/);
  await feil("hentedag i går", { dato: await omDager(-1) }, /tilbake i tid/);
  await feil("hentedag om 91 dager", { dato: await omDager(91) }, /høyst 90 dager/);
  await feil("tom bestilling", { linjer: [] }, /Bestillingen er tom/);
  await feil(
    "over 100 linjer",
    { linjer: Array.from({ length: 101 }, () => ({ pipe_type_id: ROR, quantity: 1 })) },
    /For mange varelinjer/,
  );
  await feil(
    "ukjent vare",
    { linjer: [{ pipe_type_id: "99999999-9999-9999-9999-999999999999", quantity: 1 }] },
    /Ukjent vare/,
  );
  await feil("en id som ikke er en uuid", { linjer: [{ pipe_type_id: "'; drop table x; --", quantity: 1 }] }, /Ukjent vare/);
  await feil("mengde 0", { linjer: [{ pipe_type_id: ROR, quantity: 0 }] }, /Ugyldig mengde/);
  await feil("negativ mengde", { linjer: [{ pipe_type_id: ROR, quantity: -5 }] }, /Ugyldig mengde/);
  await feil("mengde som tekst", { linjer: [{ pipe_type_id: ROR, quantity: "mye" }] }, /Ugyldig mengde/);
  await feil("urimelig stor mengde", { linjer: [{ pipe_type_id: ROR, quantity: 100001 }] }, /urimelig stor/);
  await feil("utgått vare", { linjer: [{ pipe_type_id: UTGATT, quantity: 1 }] }, /ikke tilgjengelig/);
  await feil("vare uten pris", { linjer: [{ pipe_type_id: UTAN_PRIS, quantity: 1 }] }, /kan ikke bestilles på nett/);
});

sjekk(
  "ingen av de avviste bestillingene ligger igjen",
  (await alle(`select id from public.pipe_orders where customer_email = 'feil@kunde.no'`)).length,
  0,
);

await db.exec(`update public.pipe_settings set accept_orders = false where id = 1`);
await somAnon(db, () =>
  avvist("bryteren av: ingen bestillinger tas imot", SEND, privat({ epost: "av@kunde.no" }), /tar ikke imot bestillinger/),
);
await db.exec(`update public.pipe_settings set accept_orders = true where id = 1`);

// ════════════════════════════════════════════════════════════════════════════
console.log("\n── Kontoret godkjenner ──\n");

const GODKJENN = `select public.pipe_approve_pickup_order($1, $2) as r`;
const AVVIS = `select public.pipe_reject_pickup_order($1, $2) as r`;

await somAnon(db, () => avvist("anon får ikke godkjenne", GODKJENN, [bestId, null], /permission denied/i));
await somAnon(db, () => avvist("anon får ikke avvise", AVVIS, [bestId, "nei"], /permission denied/i));
for (const [kven, bruker] of [
  ["prosjektbrukeren", KARI],
  ["den fremmede", FREMMED],
]) {
  await som(db, bruker, () => avvist(`${kven} får ikke godkjenne`, GODKJENN, [bestId, null], /Ingen tilgang/));
  await som(db, bruker, () => avvist(`${kven} får ikke avvise`, AVVIS, [bestId, "nei"], /Ingen tilgang/));
}
sjekk("lageret er fortsatt urørt", [await lager(ROR), await lager(BEND)], lagerFoer);

await som(db, LEIF, async () => {
  const r = (await en(GODKJENN, [bestId, "  Ligger klart ved port 2  "])).r;
  sjekk("godkjent: status «behandlet» og trekktidspunkt satt", [r.status, r.stock_drawn_at !== null], ["behandlet", true]);
  sjekk("meldingen til kunden er lagret, uten mellomrom rundt", r.customer_message, "Ligger klart ved port 2");
  sjekk("og hvem som godkjente", r.handled_by, LEIF.uid);
});
sjekk("lageret er trukket: 40 − 12,5 og 6 − 4", [await lager(ROR), await lager(BEND)], [lagerFoer[0] - 12.5, lagerFoer[1] - 4]);

const glogg = await alle(
  `select change, reason, note, created_by from public.pipe_stock_log where order_id = $1 order by change`,
  [bestId],
);
sjekk(
  "to logglinjer med grunnen «bestilling»",
  glogg.map((l) => [tal(l.change), l.reason]),
  [
    [-12.5, "bestilling"],
    [-4, "bestilling"],
  ],
);
sjekk("notatet sier at den ble godkjent", glogg[0]?.note, `Bestilling #${bestNr} godkjent`);
sjekk("og hvem som gjorde det", glogg[0]?.created_by, LEIF.uid);

await som(db, LEIF, () => avvist("en godkjent bestilling kan ikke godkjennes igjen", GODKJENN, [bestId, null], /allerede behandlet/));
sjekk("og lageret ble ikke trukket to ganger", await lager(ROR), lagerFoer[0] - 12.5);

const uttak = (await en(`insert into public.pipe_orders (customer_name) values ('Uttakskunde') returning id`)).id;
await som(db, LEIF, async () => {
  await avvist("et uttak kan ikke godkjennes som en bestilling", GODKJENN, [uttak, null], /uttak, ikke en bestilling/);
  await avvist("en ukjent bestilling gir beskjed", GODKJENN, ["88888888-8888-8888-8888-888888888888", null], /Fant ikke bestillingen/);
  await avvist("en melding over 1000 tegn avvises", GODKJENN, [bestId, "x".repeat(1001)], /for lang/);
  await avvist(
    "en godkjent bestilling kan ikke settes tilbake til «ny» med en vanlig update",
    `update public.pipe_orders set status = 'ny' where id = $1`,
    [bestId],
    /pipe_orders_bestilling_lager/,
  );
  await db.query(`update public.pipe_orders set status = 'levert' where id = $1`, [bestId]);
  ok("men den kan markeres som hentet");
  await db.query(`update public.pipe_orders set status = 'behandlet' where id = $1`, [bestId]);
  ok("og settes tilbake til klar");
});

// ════════════════════════════════════════════════════════════════════════════
console.log("\n── Kontoret avviser ──\n");

await som(db, LEIF, () => avvist("avvisning krever en begrunnelse", AVVIS, [bestId, "   "], /begrunnelse/));
await som(db, LEIF, async () => {
  const r = (await en(AVVIS, [bestId, "Røret er utgått hos leverandøren"])).r;
  sjekk("avvist: status «avvist» og lageret ikke lenger trukket", [r.status, r.stock_drawn_at], ["avvist", null]);
});
sjekk("rørene er tilbake på lageret", [await lager(ROR), await lager(BEND)], lagerFoer);
sjekk(
  "tilbakeføringen er logget med grunnen «avvist»",
  (await alle(`select change from public.pipe_stock_log where order_id = $1 and reason = 'avvist' order by change`, [bestId])).map(
    (l) => tal(l.change),
  ),
  [4, 12.5],
);
await som(db, LEIF, async () => {
  await avvist("en avvist bestilling kan ikke avvises igjen", AVVIS, [bestId, "igjen"], /kan ikke avvises nå/);
  await avvist("og ikke godkjennes", GODKJENN, [bestId, null], /allerede behandlet/);
});

let venterId;
await somAnon(db, async () => {
  venterId = (await en(SEND, privat({ epost: "venter@kunde.no" }))).r.id;
});
const foerAvvis = [await lager(ROR), await lager(BEND)];
await som(db, LEIF, () => db.query(AVVIS, [venterId, "Vi har ikke dette på lager"]));
sjekk("avvisning av en ventende bestilling rører ikke lageret", [await lager(ROR), await lager(BEND)], foerAvvis);
sjekk(
  "og skriver ingen logg",
  (await alle(`select id from public.pipe_stock_log where order_id = $1`, [venterId])).length,
  0,
);

let fakturertId;
await somAnon(db, async () => {
  fakturertId = (await en(SEND, privat({ epost: "faktura@kunde.no" }))).r.id;
});
await som(db, LEIF, async () => {
  await db.query(GODKJENN, [fakturertId, null]);
  await db.query(`select public.pipe_create_invoice('Ola Privat', current_date, current_date, array[$1::uuid], 0)`, [
    fakturertId,
  ]);
  await avvist("en fakturert bestilling kan ikke avvises", AVVIS, [fakturertId, "for sent"], /er fakturert/);
});

// ════════════════════════════════════════════════════════════════════════════
console.log("\n── Kunden slår opp sin egen bestilling ──\n");

await db.query(`update public.pipe_orders set admin_note = 'Intern: treg å betale' where id = $1`, [venterId]);
await somAnon(db, async () => {
  const r = (await en(`select public.pipe_get_pickup_order($1) as r`, [venterId])).r;
  sjekk(
    "anon får bestillingen med id-en",
    [r?.order_number > 0, r?.status, r?.customer_message],
    [true, "avvist", "Vi har ikke dette på lager"],
  );
  sjekk("med linjene", r?.lines?.map((l) => l.name), ["Bestillingsrør 110", "Bestillingsbend"]);
  for (const felt of ["admin_note", "handled_by", "signature", "invoice_id", "stock_drawn_at"]) {
    sjekk(`men ikke ${felt}`, felt in (r ?? {}), false);
  }
  sjekk(
    "ukjent id gir null",
    (await en(`select public.pipe_get_pickup_order('77777777-7777-7777-7777-777777777777') as r`)).r,
    null,
  );
  sjekk(
    "id-en til et uttak gir null – uttak leses ikke denne veien",
    (await en(`select public.pipe_get_pickup_order($1) as r`, [uttak])).r,
    null,
  );
});

// ════════════════════════════════════════════════════════════════════════════
console.log("\n── Takene ──\n");

await somAnon(db, async () => {
  for (let i = 0; i < 5; i++) await db.query(SEND, privat({ epost: "mange@kunde.no" }));
  await avvist(
    "den sjette bestillingen fra samme adresse samme døgn avvises",
    SEND,
    privat({ epost: "MANGE@kunde.no" }),
    /mange bestillinger/,
  );
});

const iTimen = tal(
  (await en(`select count(*) as n from public.pipe_orders where kind = 'bestilling' and created_at > now() - interval '1 hour'`)).n,
);
await somAnon(db, async () => {
  for (let i = iTimen; i < 30; i++) await db.query(SEND, privat({ epost: `kunde${i}@tak.no` }));
  await avvist("den 31. bestillingen i timen avvises", SEND, privat({ epost: "nr31@tak.no" }), /veldig mange bestillinger/);
});

// Timetaket er brukt opp. Flytt bestillingane to timar bak, så resten av fila
// kan sende nye – dei er framleis innanfor døgnet e-postane reknar med.
await db.exec(
  `update public.pipe_orders set created_at = created_at - interval '2 hours' where kind = 'bestilling' and created_at > now() - interval '1 hour'`,
);
```

- [ ] **Step 2: Kjør testen og se at den feiler**

Run: `node scripts/db-test/bestilling.test.mjs`
Expected: FAIL — «function public.pipe_submit_pickup_order(...) does not exist».

- [ ] **Step 3: Skriv migrasjonen**

Create `supabase/migrations/20260924100100_bestilling_funksjonar.sql`:

```sql
-- Bestilling for henting: innsending, oppslag, godkjenning og avvisning.
--
-- Kunden er anonym, så innsendinga går gjennom ein funksjon og ikkje eit
-- INSERT – same grunn som pipe_submit_order: prisane skal hentast i basen, og
-- ingenting klienten meiner om pris, namn eller hentedag skal takast for god
-- fisk. Kontoret godkjenner og avviser gjennom funksjonar fordi begge flyttar
-- rør, og det må skje i same transaksjon som statusen.


-- ── Organisasjonsnummer ──

/*
 * Modulus 11 med vektene 3 2 7 6 5 4 3 2. Norske organisasjonsnummer har ni
 * siffer og startar på 8 eller 9. Rest 0 gir kontrollsiffer 0; kontrollsiffer
 * 10 finst ikkje, så eit nummer som ville trengt det er ugyldig.
 *
 * Same regel som supabase/functions/_shared/orgnr.ts. Skjemaet seier frå med
 * ein gong, men det er denne som avgjer.
 */
create or replace function public.hm_orgnr_gyldig(p_orgnr text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := regexp_replace(coalesce(p_orgnr, ''), '\s', '', 'g');
  v_vekter int[] := array[3, 2, 7, 6, 5, 4, 3, 2];
  v_sum int := 0;
  v_rest int;
  v_kontroll int;
begin
  if v !~ '^[89][0-9]{8}$' then
    return false;
  end if;
  for i in 1..8 loop
    v_sum := v_sum + substr(v, i, 1)::int * v_vekter[i];
  end loop;
  v_rest := v_sum % 11;
  v_kontroll := case when v_rest = 0 then 0 else 11 - v_rest end;
  return v_kontroll <> 10 and v_kontroll = substr(v, 9, 1)::int;
end;
$$;

-- Treng inga kjørerett: han blir berre kalla inne frå pipe_submit_pickup_order,
-- som køyrer med eigaren sine rettar.
revoke all on function public.hm_orgnr_gyldig(text) from public, anon, authenticated;


-- ── Innsending ──

create or replace function public.pipe_submit_pickup_order(
  p_customer_type text,
  p_customer_name text,
  p_customer_email text,
  p_lines jsonb,
  p_customer_phone text default null,
  p_company text default null,
  p_org_number text default null,
  p_billing_address text default null,
  p_pickup_now boolean default false,
  p_pickup_date date default null,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.pipe_settings;
  v_type text := lower(btrim(coalesce(p_customer_type, '')));
  v_name text := nullif(btrim(coalesce(p_customer_name, '')), '');
  v_email text := lower(nullif(btrim(coalesce(p_customer_email, '')), ''));
  v_phone text := nullif(btrim(coalesce(p_customer_phone, '')), '');
  v_company text := nullif(btrim(coalesce(p_company, '')), '');
  v_org text := nullif(regexp_replace(coalesce(p_org_number, ''), '\s', '', 'g'), '');
  v_address text := nullif(btrim(coalesce(p_billing_address, '')), '');
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_now boolean := coalesce(p_pickup_now, false);
  -- Norsk dato, ikkje UTC: mellom midnatt og klokka to om natta er «i dag» i
  -- UTC framleis i går, og då ville ein kunde som bestilte klokka ett fått
  -- beskjed om at dagen hans er tilbake i tid.
  v_today date := (now() at time zone 'Europe/Oslo')::date;
  v_pickup date;
  v_order public.pipe_orders;
  v_line jsonb;
  v_pipe public.pipe_types;
  v_qty numeric;
  v_total numeric := 0;
  v_i integer := 0;
begin
  select * into v_settings from public.pipe_settings where id = 1;
  if not coalesce(v_settings.accept_orders, false) then
    raise exception 'Vi tar ikke imot bestillinger på nett akkurat nå';
  end if;

  if v_type not in ('privat', 'bedrift') then
    raise exception 'Velg om du bestiller som privatperson eller bedrift';
  end if;

  if v_name is null then
    raise exception 'Navn må fylles ut';
  end if;
  if length(v_name) > 100 then
    raise exception 'Navnet er for langt (høyst 100 tegn)';
  end if;

  if v_email is null then
    raise exception 'E-post må fylles ut';
  end if;
  if length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'E-postadressen ser ikke riktig ut';
  end if;

  if v_phone is null and coalesce(v_settings.require_phone, true) then
    raise exception 'Telefonnummer må fylles ut';
  end if;
  if length(coalesce(v_phone, '')) > 30 then
    raise exception 'Telefonnummeret er for langt';
  end if;

  if v_type = 'bedrift' then
    if v_company is null then
      raise exception 'Firmanavn må fylles ut';
    end if;
    if length(v_company) > 120 then
      raise exception 'Firmanavnet er for langt (høyst 120 tegn)';
    end if;
    if not public.hm_orgnr_gyldig(v_org) then
      raise exception 'Organisasjonsnummeret er ikke gyldig';
    end if;
    -- Ein bedrift blir fakturert på org.nr. Ei adresse som følgde med frå
    -- skjemaet, blir ikkje lagra: ingen har bede om henne.
    v_address := null;
  else
    if v_address is null then
      raise exception 'Fakturaadresse må fylles ut';
    end if;
    if length(v_address) > 200 then
      raise exception 'Adressen er for lang (høyst 200 tegn)';
    end if;
    v_company := null;
    v_org := null;
  end if;

  if length(coalesce(v_comment, '')) > 1000 then
    raise exception 'Kommentaren er for lang (høyst 1000 tegn)';
  end if;

  if v_now then
    v_pickup := v_today;
  else
    v_pickup := p_pickup_date;
    if v_pickup is null then
      raise exception 'Velg hvilken dag du vil hente';
    end if;
    if v_pickup < v_today then
      raise exception 'Hentedagen kan ikke være tilbake i tid';
    end if;
    if v_pickup > v_today + 90 then
      raise exception 'Hentedagen kan være høyst 90 dager fram';
    end if;
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Bestillingen er tom';
  end if;
  if jsonb_array_length(p_lines) > 100 then
    raise exception 'For mange varelinjer';
  end if;

  /*
   * TAKA.
   *
   * Skjemaet er ope for alle, og kvar bestilling sender ein kvittering til
   * adressa som står i henne. Utan tak kunne kven som helst fylt innboksen til
   * ein framand med kvitteringar frå Hauge Maskin, eller fylt lista til kontoret
   * med falske bestillingar. Ingen av dei trekkjer lageret – det gjer berre
   * godkjenninga – men begge kostar.
   */
  if (select count(*) from public.pipe_orders
       where kind = 'bestilling' and customer_email = v_email
         and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'Du har sendt mange bestillinger det siste døgnet. Ring oss, så hjelper vi deg.';
  end if;
  if (select count(*) from public.pipe_orders
       where kind = 'bestilling' and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Vi tar imot veldig mange bestillinger akkurat nå. Prøv igjen om litt.';
  end if;

  insert into public.pipe_orders (
    kind, status, stock_drawn_at, customer_type, customer_name, customer_email, customer_phone,
    company, org_number, billing_address, pickup_date, pickup_now, comment
  ) values (
    'bestilling', 'ny', null, v_type, v_name, v_email, v_phone,
    v_company, v_org, v_address, v_pickup, v_now, v_comment
  )
  returning * into v_order;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    -- Sjekka før castane, så ei oppdikta id eller ein tekst i mengdefeltet gir
    -- ei norsk melding og ikkje ein Postgres-feil på engelsk.
    if coalesce(v_line ->> 'pipe_type_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Ukjent vare i bestillingen';
    end if;
    if coalesce(v_line ->> 'quantity', '') !~ '^[0-9]+(\.[0-9]+)?$' then
      raise exception 'Ugyldig mengde på en av linjene';
    end if;

    v_qty := round((v_line ->> 'quantity')::numeric, 2);
    if v_qty <= 0 then
      raise exception 'Ugyldig mengde på en av linjene';
    end if;
    if v_qty > 100000 then
      raise exception 'Mengden er urimelig stor';
    end if;

    select * into v_pipe from public.pipe_types where id = (v_line ->> 'pipe_type_id')::uuid;
    if not found then
      raise exception 'Ukjent vare i bestillingen';
    end if;
    if not v_pipe.active then
      raise exception 'Varen % er ikke tilgjengelig', v_pipe.name;
    end if;
    -- Ein privatperson skal sjå totalprisen før bestillinga blir send. Ei vare
    -- utan pris kan difor ikkje bestillast på nett.
    if v_pipe.price is null then
      raise exception 'Varen % kan ikke bestilles på nett. Ring oss for pris.', v_pipe.name;
    end if;

    v_i := v_i + 1;
    insert into public.pipe_order_lines (
      order_id, pipe_type_id, name, dimension, sku, unit, quantity, unit_price, line_total, sort_order
    ) values (
      v_order.id, v_pipe.id, v_pipe.name, v_pipe.dimension, v_pipe.sku, v_pipe.unit,
      v_qty, v_pipe.price, round(v_pipe.price * v_qty, 2), v_i
    );
    v_total := v_total + round(v_pipe.price * v_qty, 2);
  end loop;

  update public.pipe_orders set total = v_total where id = v_order.id;

  return jsonb_build_object('id', v_order.id, 'order_number', v_order.order_number);
end;
$$;

revoke all on function public.pipe_submit_pickup_order(text, text, text, jsonb, text, text, text, text, boolean, date, text) from public;
grant execute on function public.pipe_submit_pickup_order(text, text, text, jsonb, text, text, text, text, boolean, date, text) to anon, authenticated;


-- ── Kunden slår opp si eiga bestilling ──
--
-- Id-en er ein uuid, ikkje ordrenummeret. Ordrenummera går i rekkjefølgje, og
-- med dei kunne kven som helst bladd gjennom andre sine bestillingar. Lenkja er
-- ein nøkkel: den som har henne, ser bestillinga – det same e-posten ho står i
-- allereie viser. Uttak blir aldri gitt ut denne vegen.

create or replace function public.pipe_get_pickup_order(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', o.id,
    'order_number', o.order_number,
    'created_at', o.created_at,
    'status', o.status,
    'pickup_date', o.pickup_date,
    'pickup_now', o.pickup_now,
    'customer_type', o.customer_type,
    'customer_name', o.customer_name,
    'customer_email', o.customer_email,
    'customer_phone', o.customer_phone,
    'company', o.company,
    'org_number', o.org_number,
    'billing_address', o.billing_address,
    'comment', o.comment,
    'customer_message', o.customer_message,
    'handled_at', o.handled_at,
    'total', o.total,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', l.name, 'dimension', l.dimension, 'sku', l.sku, 'unit', l.unit,
        'quantity', l.quantity, 'unit_price', l.unit_price, 'line_total', l.line_total
      ) order by l.sort_order)
      from public.pipe_order_lines l
      where l.order_id = o.id
    ), '[]'::jsonb),
    -- Når kunden fekk kvittering, klar og avvist. Kontorets varsel er ikkje
    -- kunden si sak.
    'emails', coalesce((
      select jsonb_object_agg(e.type, e.sent_at)
        from public.pipe_order_emails e
       where e.order_id = o.id and e.sent_at is not null and e.type <> 'kontor'
    ), '{}'::jsonb)
  )
  from public.pipe_orders o
  where o.id = p_id and o.kind = 'bestilling';
$$;

revoke all on function public.pipe_get_pickup_order(uuid) from public;
grant execute on function public.pipe_get_pickup_order(uuid) to anon, authenticated;


-- ── Kontoret godkjenner ──

create or replace function public.pipe_approve_pickup_order(p_id uuid, p_message text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.pipe_orders;
  v_line record;
  v_balance numeric;
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
begin
  if not public.hm_er_kontor() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
  end if;
  if length(coalesce(v_message, '')) > 1000 then
    raise exception 'Meldingen er for lang (høyst 1000 tegn)';
  end if;

  -- Låsen: to faner som godkjenner samtidig, ventar på kvarandre her. Den andre
  -- ser status 'behandlet' og blir avvist, så lageret blir trekt éin gong.
  select * into v_order from public.pipe_orders where id = p_id for update;
  if not found then
    raise exception 'Fant ikke bestillingen';
  end if;
  if v_order.kind <> 'bestilling' then
    raise exception 'Dette er et uttak, ikke en bestilling';
  end if;
  if v_order.status <> 'ny' then
    raise exception 'Bestillingen er allerede behandlet';
  end if;

  -- Beholdninga får gå i minus, som ved uttak: det er reell informasjon om at
  -- kontoret godkjende meir enn lageret viste.
  for v_line in
    select pipe_type_id, name, quantity from public.pipe_order_lines where order_id = p_id order by sort_order
  loop
    if v_line.pipe_type_id is not null then
      update public.pipe_types set stock = stock - v_line.quantity
        where id = v_line.pipe_type_id
        returning stock into v_balance;

      insert into public.pipe_stock_log (pipe_type_id, pipe_name, change, balance_after, reason, order_id, note, created_by)
      values (v_line.pipe_type_id, v_line.name, -v_line.quantity, v_balance, 'bestilling', p_id,
              'Bestilling #' || v_order.order_number || ' godkjent', auth.uid());
    end if;
  end loop;

  -- Status og trekktidspunkt i éi setning. Regelen pipe_orders_bestilling_lager
  -- krev det.
  update public.pipe_orders
     set status = 'behandlet', stock_drawn_at = now(), handled_at = now(),
         handled_by = auth.uid(), customer_message = v_message
   where id = p_id
  returning * into v_order;

  return to_jsonb(v_order);
end;
$$;

revoke all on function public.pipe_approve_pickup_order(uuid, text) from public, anon;
grant execute on function public.pipe_approve_pickup_order(uuid, text) to authenticated;


-- ── Kontoret avviser ──
--
-- Både før og etter godkjenning: ein kunde som aldri kjem, gjer at ei godkjend
-- bestilling må kunne avvisast òg. Var lageret trekt, går røra tilbake.

create or replace function public.pipe_reject_pickup_order(p_id uuid, p_message text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.pipe_orders;
  v_line record;
  v_balance numeric;
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
begin
  if not public.hm_er_kontor() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
  end if;
  if v_message is null then
    raise exception 'Skriv en begrunnelse til kunden';
  end if;
  if length(v_message) > 1000 then
    raise exception 'Meldingen er for lang (høyst 1000 tegn)';
  end if;

  select * into v_order from public.pipe_orders where id = p_id for update;
  if not found then
    raise exception 'Fant ikke bestillingen';
  end if;
  if v_order.kind <> 'bestilling' then
    raise exception 'Dette er et uttak, ikke en bestilling';
  end if;
  if v_order.status not in ('ny', 'behandlet') then
    raise exception 'Bestillingen kan ikke avvises nå';
  end if;
  if v_order.invoice_id is not null then
    raise exception 'Bestillingen er fakturert. Slett fakturagrunnlaget først.';
  end if;

  if v_order.stock_drawn_at is not null then
    for v_line in
      select pipe_type_id, name, quantity from public.pipe_order_lines where order_id = p_id order by sort_order
    loop
      if v_line.pipe_type_id is not null then
        update public.pipe_types set stock = stock + v_line.quantity
          where id = v_line.pipe_type_id
          returning stock into v_balance;

        insert into public.pipe_stock_log (pipe_type_id, pipe_name, change, balance_after, reason, order_id, note, created_by)
        values (v_line.pipe_type_id, v_line.name, v_line.quantity, v_balance, 'avvist', p_id,
                'Avvist bestilling #' || v_order.order_number, auth.uid());
      end if;
    end loop;
  end if;

  update public.pipe_orders
     set status = 'avvist', stock_drawn_at = null, handled_at = now(),
         handled_by = auth.uid(), customer_message = v_message
   where id = p_id
  returning * into v_order;

  return to_jsonb(v_order);
end;
$$;

revoke all on function public.pipe_reject_pickup_order(uuid, text) from public, anon;
grant execute on function public.pipe_reject_pickup_order(uuid, text) to authenticated;
```

- [ ] **Step 4: Kjør testen og se at den passerer**

Run: `node scripts/db-test/bestilling.test.mjs`
Expected: PASS — «Alt i orden. Bestillingene holder.»

- [ ] **Step 5: Bygg setup-fila og kjør alle databasetestene**

Run: `npm run bygg:setup && npm run test:db`
Expected: «7 testfil(er) kjørte gjennom.»

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260924100100_bestilling_funksjonar.sql scripts/db-test/bestilling.test.mjs supabase-setup.sql
git commit -m "Bestilling: innsending, oppslag, godkjenning og avvisning

pipe_submit_pickup_order er åpen for alle, validerer alt med norske
meldinger, har tak mot misbruk og rører ikke lageret. Kontoret
godkjenner og avviser gjennom egne funksjoner, fordi begge flytter rør
og må gjøre det i samme transaksjon som statusen.

Kunden slår opp sin egen bestilling på uuid-en, aldri på ordrenummeret,
og får aldri interne notater eller uttak den veien.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Databasen – e-postlåsen, omkjøring og sjekken mot den levende basen

**Files:**
- Create: `supabase/migrations/20260924100200_bestilling_epost.sql`
- Modify: `scripts/db-test/bestilling.test.mjs` (ny bolk før avslutninga)
- Modify: `scripts/db-test/omkoyring.test.mjs`
- Modify: `scripts/check-db.mjs`
- Modify: `supabase-setup.sql` (generert)

**Interfaces:**
- Consumes: Task 1–2.
- Produces (SQL, bare `service_role`):
  - `pipe_email_claim(p_order_id uuid) → jsonb` = `{ emails: [{type, to}], order?, lines?, company? }`. `order` har feltene `id, order_number, created_at, status, pickup_date, pickup_now, customer_type, customer_name, customer_email, customer_phone, company, org_number, billing_address, comment, customer_message, total`; `lines[]` har `name, dimension, sku, unit, quantity, unit_price, line_total, stock`; `company` har `name, org_number, address, phone, email, pickup_note, vat_rate, payment_terms_days`.
  - `pipe_email_mark_sent(p_order_id uuid, p_type text, p_provider_id text = null) → void`
  - `pipe_email_release(p_order_id uuid, p_type text) → void`

- [ ] **Step 1: Skriv testene**

I `scripts/db-test/bestilling.test.mjs`: sett inn denne bolken rett FØR linja som begynner med `console.log(tilstand.feil === 0`:

```js
// ════════════════════════════════════════════════════════════════════════════
console.log("\n── E-postlåsen ──\n");
// Funksjonen bestilling-epost kan kallast av kven som helst. Difor bestemmer
// basen kva som skal sendast, og kvar e-post kan gå éin gong per bestilling.

// Supabase gir service_role bruk av public. Testbasen gjer det ikkje av seg sjølv.
await db.exec(`grant usage on schema public to service_role`);
const somTeneste = async (fn) => {
  await db.exec("set role service_role");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
};
const KREV = `select public.pipe_email_claim($1) as r`;
const typar = (r) => (r?.emails ?? []).map((e) => [e.type, e.to]);

for (const [namn, sql] of [
  ["pipe_email_claim", KREV],
  ["pipe_email_mark_sent", `select public.pipe_email_mark_sent($1, 'kvittering', null)`],
  ["pipe_email_release", `select public.pipe_email_release($1, 'kvittering')`],
]) {
  await somAnon(db, () => avvist(`anon: ${namn} — ingen kjørerett`, sql, [bestId], /permission denied/i));
  await som(db, LEIF, () => avvist(`kontoret: ${namn} — ingen kjørerett`, sql, [bestId], /permission denied/i));
}

let epostId;
await somAnon(db, async () => {
  epostId = (await en(SEND, privat({ epost: "epost@kunde.no" }))).r.id;
});
await db.exec(`update public.pipe_settings set order_email = 'Ordre@Hauge.no' where id = 1`);

await somTeneste(async () => {
  const r = (await en(KREV, [epostId])).r;
  sjekk("en ny bestilling gir kvittering til kunden og varsel til kontoret", typar(r), [
    ["kvittering", "epost@kunde.no"],
    ["kontor", "ordre@hauge.no"],
  ]);
  sjekk("med bestillingen, linjene og firmaet", [r.order?.order_number > 0, r.lines?.length, r.company?.name], [
    true,
    2,
    "Hauge Maskin AS",
  ]);
  sjekk("linjene har beholdningen, til kontorets e-post", typeof tal(r.lines?.[0]?.stock), "number");
  sjekk("et nytt kall gir ingenting – hver e-post går én gang", typar((await en(KREV, [epostId])).r), []);

  await db.query(`select public.pipe_email_release($1, 'kontor')`, [epostId]);
  sjekk("feilet sendingen, kan den kreves på nytt", typar((await en(KREV, [epostId])).r), [["kontor", "ordre@hauge.no"]]);

  await db.query(`select public.pipe_email_mark_sent($1, 'kvittering', 're_123')`, [epostId]);
  await db.query(`select public.pipe_email_release($1, 'kvittering')`, [epostId]);
  sjekk("en sendt e-post kan ikke frigjøres og sendes igjen", typar((await en(KREV, [epostId])).r), []);
});
const logg1 = await en(
  `select sent_at is not null as sendt, provider_id from public.pipe_order_emails where order_id = $1 and type = 'kvittering'`,
  [epostId],
);
sjekk("markert som sendt, med id-en fra Resend", [logg1.sendt, logg1.provider_id], [true, "re_123"]);

await somAnon(db, async () => {
  const r = (await en(`select public.pipe_get_pickup_order($1) as r`, [epostId])).r;
  sjekk("kunden ser når kvitteringen ble sendt", typeof r.emails?.kvittering, "string");
  sjekk("men ikke kontorets varsel", "kontor" in (r.emails ?? {}), false);
});

await somTeneste(async () =>
  sjekk("«klar» kommer ikke før bestillingen er godkjent", typar((await en(KREV, [epostId])).r), []),
);
await som(db, LEIF, () => db.query(GODKJENN, [epostId, null]));
await somTeneste(async () =>
  sjekk("etter godkjenning: «klar» til kunden", typar((await en(KREV, [epostId])).r), [["klar", "epost@kunde.no"]]),
);
await som(db, LEIF, () => db.query(AVVIS, [epostId, "Beklager"]));
await somTeneste(async () =>
  sjekk("etter avvisning: «avvist» til kunden", typar((await en(KREV, [epostId])).r), [["avvist", "epost@kunde.no"]]),
);

let gamalId;
await somAnon(db, async () => {
  gamalId = (await en(SEND, privat({ epost: "gammel@kunde.no" }))).r.id;
});
await db.query(`update public.pipe_orders set created_at = now() - interval '2 days' where id = $1`, [gamalId]);
await somTeneste(async () =>
  sjekk("en to døgn gammel bestilling gir ingen e-post", typar((await en(KREV, [gamalId])).r), []),
);
await som(db, LEIF, () => db.query(GODKJENN, [gamalId, null]));
await somTeneste(async () =>
  sjekk(
    "men godkjenner kontoret den i dag, får kunden «klar»",
    typar((await en(KREV, [gamalId])).r).map(([t]) => t),
    ["klar"],
  ),
);

await somTeneste(async () => sjekk("et uttak gir aldri e-post herfra", typar((await en(KREV, [uttak])).r), []));

// Taket per mottakar: 10 i døgnet. Bestillingane blir lagde rett inn, forbi
// taket på fem bestillingar per adresse, for å kome fram til dette.
const taket = [];
for (let i = 0; i < 11; i++) taket.push(await rawBestilling({ customer_email: "tak@kunde.no" }));
await somTeneste(async () => {
  const kvitteringar = [];
  for (const id of taket) {
    kvitteringar.push(typar((await en(KREV, [id])).r).filter(([t]) => t === "kvittering").length);
  }
  sjekk("høyst 10 kvitteringer til samme adresse per døgn", kvitteringar, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0]);
});

// Døgntaket: 90 e-postar totalt. Fyll opp med kontorvarsel, som ikkje tel per
// mottakar, og sjå at ein ny bestilling ikkje får noko.
const brukt = tal(
  (await en(`select count(*) as n from public.pipe_order_emails where claimed_at > now() - interval '24 hours'`)).n,
);
for (let i = brukt; i < 90; i++) {
  const id = await rawBestilling({ customer_email: `fyll${i}@x.no` });
  await db.query(`insert into public.pipe_order_emails (order_id, type, recipient) values ($1, 'kontor', 'ordre@hauge.no')`, [
    id,
  ]);
}
const siste = await rawBestilling({ customer_email: "siste@kunde.no" });
await somTeneste(async () =>
  sjekk("når 90 e-poster er brukt i døgnet, sendes ingenting mer", typar((await en(KREV, [siste])).r), []),
);
```

- [ ] **Step 2: Kjør testen og se at den feiler**

Run: `node scripts/db-test/bestilling.test.mjs`
Expected: FAIL — «function public.pipe_email_claim(uuid) does not exist».

- [ ] **Step 3: Skriv migrasjonen**

Create `supabase/migrations/20260924100200_bestilling_epost.sql`:

```sql
-- Bestilling for henting: e-postlåsen.
--
-- Funksjonen bestilling-epost kan kallast av kven som helst – kunden er ikkje
-- innlogga. Difor tek han aldri imot ei e-postadresse eller ein e-posttype. Han
-- får id-en til ei bestilling og spør denne funksjonen kva som skal sendast.
-- Svaret kjem frå statusen og frå det som alt er sendt, og kvar e-post kan gå
-- éin gong per bestilling. Då er kvart kall trygt å gjenta.
--
-- Berre service_role kan kalle desse. Tenestenøkkelen ligg i Supabase og
-- forlèt aldri tenaren.

create or replace function public.pipe_email_claim(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.pipe_orders;
  v_settings public.pipe_settings;
  v_office text;
  v_customer text;
  v_due text[] := array[]::text[];
  v_type text;
  v_to text;
  v_emails jsonb := '[]'::jsonb;
begin
  -- Låsen: to kall om same bestilling ventar på kvarandre her, og den andre ser
  -- rada den første sette inn.
  select * into v_order from public.pipe_orders where id = p_order_id for update;
  if not found or v_order.kind <> 'bestilling' then
    return jsonb_build_object('emails', '[]'::jsonb);
  end if;

  select * into v_settings from public.pipe_settings where id = 1;
  v_office := lower(coalesce(nullif(btrim(v_settings.order_email), ''), nullif(btrim(v_settings.email), '')));
  v_customer := lower(v_order.customer_email);

  /*
   * BERRE FERSKE E-POSTAR.
   *
   * Blir e-post slått på ein månad etter at bestillingane kom i gang, skal
   * ingen få ei kvittering på noko dei bestilte for fire veker sidan.
   */
  if v_order.created_at > now() - interval '24 hours' then
    v_due := v_due || 'kvittering'::text;
    if v_office is not null then
      v_due := v_due || 'kontor'::text;
    end if;
  end if;
  -- «behandlet», ikkje «levert»: er bestillinga henta før e-posten gjekk, skal
  -- kunden ikkje få beskjed om at ho er klar.
  if v_order.status = 'behandlet' and v_order.stock_drawn_at > now() - interval '24 hours' then
    v_due := v_due || 'klar'::text;
  end if;
  if v_order.status = 'avvist' and v_order.handled_at > now() - interval '24 hours' then
    v_due := v_due || 'avvist'::text;
  end if;

  foreach v_type in array v_due loop
    continue when exists (
      select 1 from public.pipe_order_emails where order_id = p_order_id and type = v_type
    );

    v_to := case when v_type = 'kontor' then v_office else v_customer end;

    -- Døgntaket: under gratisgrensa hos Resend på 100.
    exit when (
      select count(*) from public.pipe_order_emails where claimed_at > now() - interval '24 hours'
    ) >= 90;

    -- Taket per mottakar. Kontorets adresse tel ikkje: ein travel dag skal ikkje
    -- stengje kontoret ute frå sine eigne varsel.
    continue when v_type <> 'kontor' and (
      select count(*) from public.pipe_order_emails
       where recipient = v_to and type <> 'kontor' and claimed_at > now() - interval '24 hours'
    ) >= 10;

    insert into public.pipe_order_emails (order_id, type, recipient)
    values (p_order_id, v_type, v_to)
    on conflict (order_id, type) do nothing;

    if found then
      v_emails := v_emails || jsonb_build_object('type', v_type, 'to', v_to);
    end if;
  end loop;

  if jsonb_array_length(v_emails) = 0 then
    return jsonb_build_object('emails', v_emails);
  end if;

  return jsonb_build_object(
    'emails', v_emails,
    'order', jsonb_build_object(
      'id', v_order.id,
      'order_number', v_order.order_number,
      'created_at', v_order.created_at,
      'status', v_order.status,
      'pickup_date', v_order.pickup_date,
      'pickup_now', v_order.pickup_now,
      'customer_type', v_order.customer_type,
      'customer_name', v_order.customer_name,
      'customer_email', v_order.customer_email,
      'customer_phone', v_order.customer_phone,
      'company', v_order.company,
      'org_number', v_order.org_number,
      'billing_address', v_order.billing_address,
      'comment', v_order.comment,
      'customer_message', v_order.customer_message,
      'total', v_order.total
    ),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', l.name, 'dimension', l.dimension, 'sku', l.sku, 'unit', l.unit,
        'quantity', l.quantity, 'unit_price', l.unit_price, 'line_total', l.line_total,
        'stock', t.stock
      ) order by l.sort_order)
      from public.pipe_order_lines l
      left join public.pipe_types t on t.id = l.pipe_type_id
      where l.order_id = p_order_id
    ), '[]'::jsonb),
    'company', jsonb_build_object(
      'name', v_settings.company_name,
      'org_number', v_settings.org_number,
      'address', v_settings.address,
      'phone', v_settings.phone,
      'email', v_settings.email,
      'pickup_note', v_settings.pickup_note,
      'vat_rate', v_settings.vat_rate,
      'payment_terms_days', v_settings.payment_terms_days
    )
  );
end;
$$;

create or replace function public.pipe_email_mark_sent(p_order_id uuid, p_type text, p_provider_id text default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.pipe_order_emails
     set sent_at = now(), provider_id = p_provider_id
   where order_id = p_order_id and type = p_type;
$$;

-- Angre-steget. Utan det ville eit nettbrot hos Resend låst e-posten ute for
-- godt: rada stod, e-posten kom aldri, og ingen kunne be om henne att. Ei
-- sendt rad blir aldri fjerna.
create or replace function public.pipe_email_release(p_order_id uuid, p_type text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.pipe_order_emails
   where order_id = p_order_id and type = p_type and sent_at is null;
$$;

revoke all on function public.pipe_email_claim(uuid) from public, anon, authenticated;
revoke all on function public.pipe_email_mark_sent(uuid, text, text) from public, anon, authenticated;
revoke all on function public.pipe_email_release(uuid, text) from public, anon, authenticated;
grant execute on function public.pipe_email_claim(uuid) to service_role;
grant execute on function public.pipe_email_mark_sent(uuid, text, text) to service_role;
grant execute on function public.pipe_email_release(uuid, text) to service_role;
```

- [ ] **Step 4: Kjør testen og se at den passerer**

Run: `node scripts/db-test/bestilling.test.mjs`
Expected: PASS.

- [ ] **Step 5: Utvid omkjøringstesten**

I `scripts/db-test/omkoyring.test.mjs`, i `db.exec`-blokka under «Basen blir tatt i bruk» (den som begynner med `update public.pipe_types set stock = 250`), legg til disse setningene sist i SQL-strengen, rett før den avsluttende backticken:

```sql
  update public.pipe_settings
     set company_name = 'Hauge Maskin AS', org_number = '974760673',
         address = 'Industrivegen 1', email = 'post@hauge.no', accept_orders = true
   where id = 1;
  insert into public.pipe_orders (kind, customer_name, customer_type, customer_email, pickup_date, stock_drawn_at, status)
    values ('bestilling', 'Ventende Kunde', 'privat', 'venter@kunde.no', current_date + 3, null, 'ny');
```

Og rett etter linja `sjekk("ingen varegrupper forsvant", etter.grupper, før.grupper);`:

```js
const best = await en(`select status, stock_drawn_at from public.pipe_orders where customer_name = 'Ventende Kunde'`);
sjekk("en ventende bestilling venter fortsatt – tilbakefyllingen rørte den ikke", [best.status, best.stock_drawn_at], ["ny", null]);
sjekk(
  "bestilling på nett står fortsatt på",
  (await en(`select accept_orders from public.pipe_settings where id = 1`)).accept_orders,
  true,
);
```

- [ ] **Step 6: Utvid sjekken mot den levende basen**

I `scripts/check-db.mjs`:

1. Endre de to løkkene som går over `["pipe_categories", "pipe_catalog", "pipe_public_settings"]` (lesbar, og ikke skrivbar) til å gå over `["pipe_categories", "pipe_catalog", "pipe_public_settings", "pipe_public_order_settings"]`.
2. Rett etter `await utanKolonne("pipe_public_settings", "markup_percent");`:

```js
await utanKolonne("pipe_public_order_settings", "order_email");
```

3. I lista `stengde`, legg til linja `["pipe_order_emails", "hvem som har fått e-post, og adressene"],` etter `["pipe_stock_log", null],`.
4. Rett før `console.log(` helt nederst (den som skriver «Alt i orden. Databasen er klar.»):

```js
// ── Bestillingane ──
//
// Innsendinga og oppslaget er opne for kunden. Godkjenning, avvisning og
// e-postlåsen er det ikkje – dei tre siste berre for tenestenøkkelen.

console.log("\nBestilling for henting:");
{
  const { error } = await supabase.rpc("pipe_submit_pickup_order", {
    p_customer_type: "",
    p_customer_name: "",
    p_customer_email: "",
    p_lines: [],
  });
  if (error && /tar ikke imot|privatperson eller bedrift/i.test(error.message)) ok("pipe_submit_pickup_order — svarer og validerer");
  else if (error) nei("pipe_submit_pickup_order", error.message);
  else nei("pipe_submit_pickup_order", "godtok en tom bestilling");
}
{
  const { data, error } = await supabase.rpc("pipe_get_pickup_order", { p_id: "00000000-0000-0000-0000-000000000000" });
  if (error) nei("pipe_get_pickup_order", error.message);
  else if (data !== null) nei("pipe_get_pickup_order", "svarte med noe for en id som ikke finnes");
  else ok("pipe_get_pickup_order — svarer null på en ukjent id");
}
const INGEN = "00000000-0000-0000-0000-000000000000";
await stengtForAnon("pipe_approve_pickup_order", { p_id: INGEN, p_message: null });
await stengtForAnon("pipe_reject_pickup_order", { p_id: INGEN, p_message: "x" });
await stengtForAnon("pipe_email_claim", { p_order_id: INGEN });
await stengtForAnon("pipe_email_mark_sent", { p_order_id: INGEN, p_type: "kvittering", p_provider_id: null });
await stengtForAnon("pipe_email_release", { p_order_id: INGEN, p_type: "kvittering" });
```

`check:db` kan ikke kjøres før migrasjonene er limt inn i Supabase. Kjør den ikke her; syntaksen sjekkes i neste steg.

- [ ] **Step 7: Bygg setup-fila og kjør alt**

Run: `npm run bygg:setup && npm run test:db && node --check scripts/check-db.mjs`
Expected: «7 testfil(er) kjørte gjennom.», og ingen utskrift fra `node --check`.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260924100200_bestilling_epost.sql scripts/db-test/bestilling.test.mjs scripts/db-test/omkoyring.test.mjs scripts/check-db.mjs supabase-setup.sql
git commit -m "Bestilling: e-postlåsen, og at alt tåler omkjøring

pipe_email_claim avgjør selv hva som skal sendes for en bestilling, ut
fra status og hva som alt er sendt. Den som kaller kan verken velge
mottaker eller e-posttype. Hver e-post går én gang, bare innen et døgn
etter hendelsen, og under tak per mottaker og per døgn.

Omkjøringstesten sjekker at en ventende bestilling ikke blir tilbakefylt,
og check:db kjenner de nye funksjonene og tabellen.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Regnestykkene – mva og organisasjonsnummer

Ligger i `supabase/functions/_shared` fordi e-postfunksjonen trenger dem også, og Supabase CLI bare pakker med filer derfra. Appen importerer gjennom tynne filer i `src/lib`.

**Files:**
- Create: `supabase/functions/_shared/mva.ts`
- Create: `supabase/functions/_shared/orgnr.ts`
- Create: `src/lib/mva.ts`
- Create: `src/lib/orgnr.ts`
- Test: `src/test/mva.test.ts`, `src/test/orgnr.test.ts`

**Interfaces:**
- Produces: `linjesum(pris: number, mengde: number): number`; `summer(linjesummer: number[], mvaSats: number): Summer` der `Summer = { eks: number; mva: number; inkl: number }`; `prisInklMva(pris: number, mvaSats: number): number`; `vaskOrgnr(s: string): string`; `gyldigOrgnr(s: string): boolean`; `visOrgnr(s: string | null | undefined): string`.

- [ ] **Step 1: Skriv testene**

Create `src/test/mva.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { linjesum, prisInklMva, summer } from "@/lib/mva";

describe("linjesum", () => {
  it("rundar halve øre opp, slik Postgres gjer", () => {
    // 103,39 × 12,5 = 1292,375. Rein flyttalsrekning gir 1292,37.
    expect(linjesum(103.39, 12.5)).toBe(1292.38);
  });

  it("gir heile kroner når det går opp", () => {
    expect(linjesum(100, 12.5)).toBe(1250);
    expect(linjesum(25, 4)).toBe(100);
  });

  it("tåler pris 0", () => {
    expect(linjesum(0, 7)).toBe(0);
  });
});

describe("summer", () => {
  it("reknar mva av summen, ikkje per linje – som fakturagrunnlaget", () => {
    expect(summer([1250, 100], 25)).toEqual({ eks: 1350, mva: 337.5, inkl: 1687.5 });
  });

  it("legg saman øre utan flyttalsstøy", () => {
    expect(summer([0.1, 0.2], 0).eks).toBe(0.3);
    expect(summer(Array(100).fill(0.01), 25)).toEqual({ eks: 1, mva: 0.25, inkl: 1.25 });
  });

  it("sats 0 gir ingen mva", () => {
    expect(summer([100], 0)).toEqual({ eks: 100, mva: 0, inkl: 100 });
  });

  it("brukar same formel som invoice-pdf.ts", () => {
    const eks = 1292.38;
    expect(summer([eks], 25).mva).toBe(Math.round(eks * 25) / 100);
  });
});

describe("prisInklMva", () => {
  it("legg på satsen og rundar i øre", () => {
    expect(prisInklMva(103, 25)).toBe(128.75);
    expect(prisInklMva(103.39, 25)).toBe(129.24);
  });
});
```

Create `src/test/orgnr.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { gyldigOrgnr, vaskOrgnr, visOrgnr } from "@/lib/orgnr";

describe("gyldigOrgnr", () => {
  it("godtek ekte nummer", () => {
    expect(gyldigOrgnr("974760673")).toBe(true);
    expect(gyldigOrgnr("923609016")).toBe(true);
  });

  it("godtek mellomrom", () => {
    expect(gyldigOrgnr("974 760 673")).toBe(true);
  });

  it("rest 0 gir kontrollsiffer 0", () => {
    expect(gyldigOrgnr("900000030")).toBe(true);
  });

  it("avviser feil kontrollsiffer", () => {
    expect(gyldigOrgnr("974760674")).toBe(false);
  });

  it("kontrollsiffer 10 finst ikkje – då er nummeret ugyldig uansett siste siffer", () => {
    for (let d = 0; d <= 9; d++) expect(gyldigOrgnr(`90000009${d}`)).toBe(false);
  });

  it("krev ni siffer som startar på 8 eller 9", () => {
    expect(gyldigOrgnr("97476067")).toBe(false);
    expect(gyldigOrgnr("174760673")).toBe(false);
    expect(gyldigOrgnr("abc")).toBe(false);
    expect(gyldigOrgnr("")).toBe(false);
  });
});

describe("vaskOrgnr og visOrgnr", () => {
  it("tek bort mellomrom", () => {
    expect(vaskOrgnr(" 974 760\t673 ")).toBe("974760673");
  });

  it("grupperer i tre, slik Brønnøysund skriv nummeret", () => {
    expect(visOrgnr("974760673")).toBe("974 760 673");
  });

  it("lèt alt anna stå som det er", () => {
    expect(visOrgnr("12")).toBe("12");
    expect(visOrgnr(null)).toBe("");
  });
});
```

- [ ] **Step 2: Kjør testene og se at de feiler**

Run: `npx vitest run src/test/mva.test.ts src/test/orgnr.test.ts`
Expected: FAIL — «Failed to resolve import "@/lib/mva"».

- [ ] **Step 3: Skriv koden**

Create `supabase/functions/_shared/mva.ts`:

```ts
// Mva-regnestykket for bestillingane. Éin stad, fordi butikken, kassen, PDF-en,
// e-posten og fakturagrunnlaget må kome fram til same tal – eit øre skilnad
// mellom det kunden såg og det som blei fakturert, er ein telefon til kontoret.
//
// Ligg i supabase/functions/_shared fordi e-postfunksjonen òg reknar med det,
// og Supabase CLI berre pakkar med filer herifrå. Ingen import: fila blir lesen
// både av Vite og av Deno.
//
// Prisane i katalogen er eks. mva.

export type Summer = { eks: number; mva: number; inkl: number };

/**
 * Pris × mengde, runda i øre slik pipe_submit_pickup_order gjer.
 *
 * I heiltal – øre og hundredelar – fordi flyttal bommar på halve øre:
 * 103,39 × 12,5 = 1292,375 skal bli 1292,38 som i Postgres, men blir 1292,37
 * om ein reknar med desimaltal. Prisen og mengda har høgst to desimalar.
 */
export function linjesum(pris: number, mengde: number): number {
  const p = Math.round(pris * 100);
  const q = Math.round(mengde * 100);
  return Math.floor((p * q + 50) / 100) / 100;
}

/**
 * Sum eks. mva, mva og sum inkl. mva.
 *
 * Mva blir rekna av summen, ikkje per linje, og runda i øre – nøyaktig same
 * formel som invoice-pdf.ts, så bestillinga og fakturagrunnlaget seier det same.
 */
export function summer(linjesummer: number[], mvaSats: number): Summer {
  const øre = linjesummer.reduce((s, l) => s + Math.round(l * 100), 0);
  const eks = øre / 100;
  const mva = mvaSats > 0 ? Math.round(eks * mvaSats) / 100 : 0;
  return { eks, mva, inkl: Math.round((eks + mva) * 100) / 100 };
}

/** Pris per eining med mva, runda i øre. Det ein privatperson skal sjå. */
export function prisInklMva(pris: number, mvaSats: number): number {
  return Math.round(pris * (100 + mvaSats)) / 100;
}
```

Create `supabase/functions/_shared/orgnr.ts`:

```ts
// Organisasjonsnummer med kontrollsiffer. Same regel som hm_orgnr_gyldig i
// basen: skjemaet seier frå med ein gong, basen er den som avgjer.
//
// Ligg i _shared fordi e-postfunksjonen viser nummeret òg. Ingen import.

const VEKTER = [3, 2, 7, 6, 5, 4, 3, 2];

/** Tek bort mellomrom: «974 760 673» og «974760673» er same nummer. */
export const vaskOrgnr = (s: string): string => (s ?? "").replace(/\s/g, "");

/**
 * Modulus 11. Norske organisasjonsnummer har ni siffer og startar på 8 eller 9.
 * Rest 0 gir kontrollsiffer 0, og kontrollsiffer 10 finst ikkje – då er
 * nummeret ugyldig uansett kva som står sist.
 */
export function gyldigOrgnr(s: string): boolean {
  const v = vaskOrgnr(s);
  if (!/^[89]\d{8}$/.test(v)) return false;
  const sum = VEKTER.reduce((acc, w, i) => acc + w * Number(v[i]), 0);
  const rest = sum % 11;
  const kontroll = rest === 0 ? 0 : 11 - rest;
  return kontroll !== 10 && kontroll === Number(v[8]);
}

/** «974760673» -> «974 760 673». Alt anna blir ståande som det er. */
export function visOrgnr(s: string | null | undefined): string {
  const v = vaskOrgnr(s ?? "");
  return /^\d{9}$/.test(v) ? `${v.slice(0, 3)} ${v.slice(3, 6)} ${v.slice(6)}` : (s ?? "");
}
```

Create `src/lib/mva.ts`:

```ts
// Regnestykket bur i supabase/functions/_shared, fordi e-postfunksjonen òg
// treng det. Appen hentar det her, så ingen komponent treng å kjenne den stien.
export * from "../../supabase/functions/_shared/mva";
```

Create `src/lib/orgnr.ts`:

```ts
// Sjå src/lib/mva.ts: same grunn til at denne fila berre sender vidare.
export * from "../../supabase/functions/_shared/orgnr";
```

- [ ] **Step 4: Kjør testene og se at de passerer**

Run: `npx vitest run src/test/mva.test.ts src/test/orgnr.test.ts`
Expected: PASS, 15 tester.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/mva.ts supabase/functions/_shared/orgnr.ts src/lib/mva.ts src/lib/orgnr.ts src/test/mva.test.ts src/test/orgnr.test.ts
git commit -m "Mva og organisasjonsnummer, én kilde for app og e-post

Linjesummen regnes i hele øre, så 103,39 × 12,5 blir 1292,38 som i
Postgres og ikke 1292,37. Mva regnes av summen med samme formel som
fakturagrunnlaget. Kontrollsifferet i org.nr. følger samme regel som
hm_orgnr_gyldig i basen.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: Vilkårene, angreretten og angreskjemaet

**Files:**
- Create: `supabase/functions/_shared/angrerett.ts`
- Create: `src/lib/vilkar.ts`
- Test: `src/test/vilkar.test.ts`

**Interfaces:**
- Consumes: ingenting.
- Produces: typene `Selger = { navn: string; orgnr?: string | null; adresse?: string | null; epost?: string | null; telefon?: string | null; betalingsfrist: number; henteinfo?: string | null }`, `Avsnitt = { tittel: string; tekst: string[] }`, `Skjema = { tittel: string; ingress: string; felt: string[]; fotnote: string }`; `ANGRERETT_KORT: string[]`; `angrerettAvsnitt(s: Selger): Avsnitt`; `vilkarAvsnitt(s: Selger): Avsnitt[]`; `angreskjema(s: Selger): Skjema`; `angrerettSomTekst(s: Selger): string`. `src/lib/vilkar.ts` re-eksporterer alt og legger til `selgerFra(s?: PipePublicSettingsRow, o?: PipePublicOrderSettingsRow): Selger` (typene kommer i Task 6 – bruk strukturelle typer her, se koden).

- [ ] **Step 1: Skriv testene**

Create `src/test/vilkar.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ANGRERETT_KORT, angreskjema, angrerettAvsnitt, angrerettSomTekst, selgerFra, vilkarAvsnitt } from "@/lib/vilkar";

const S = {
  navn: "Hauge Maskin AS",
  orgnr: "974760673",
  adresse: "Industrivegen 1, 5700 Voss",
  epost: "post@hauge.no",
  telefon: "56 00 00 00",
  betalingsfrist: 14,
  henteinfo: "Lageret er åpent 07–15 på hverdager.",
};

const tekst = (tittel: string, s = S) => vilkarAvsnitt(s).find((a) => a.tittel === tittel)?.tekst.join(" ") ?? "";

describe("vilkåra", () => {
  it("har avsnitta i fast rekkjefølgje", () => {
    expect(vilkarAvsnitt(S).map((a) => a.tittel)).toEqual([
      "Selger",
      "Bestillingen",
      "Priser",
      "Betaling",
      "Henting",
      "Angrerett",
      "Reklamasjon",
      "Personopplysninger",
      "Tvister",
    ]);
  });

  it("namngir seljaren med org.nr., adresse og kontakt", () => {
    const t = tekst("Selger");
    expect(t).toContain("Hauge Maskin AS");
    expect(t).toContain("974760673");
    expect(t).toContain("Industrivegen 1");
    expect(t).toContain("post@hauge.no");
    expect(t).toContain("56 00 00 00");
  });

  it("brukar betalingsfristen frå innstillingane", () => {
    expect(tekst("Betaling", { ...S, betalingsfrist: 30 })).toContain("30 dager");
  });

  it("tek med henteinfo når ho finst, og hoppar over når ho ikkje gjer", () => {
    expect(tekst("Henting")).toContain("07–15");
    expect(vilkarAvsnitt({ ...S, henteinfo: " " }).find((a) => a.tittel === "Henting")?.tekst).toHaveLength(2);
  });

  it("seier at avtalen er bindande først ved stadfesting", () => {
    expect(tekst("Bestillingen")).toContain("«Klar til henting»");
  });

  it("gir fem års reklamasjon på rør i bakken", () => {
    expect(tekst("Reklamasjon")).toContain("fem år");
  });
});

describe("angreretten", () => {
  it("er 14 dagar frå henting", () => {
    const t = angrerettAvsnitt(S).tekst.join(" ");
    expect(t).toContain("14 dagers angrerett");
    expect(t).toContain("fra dagen du henter");
  });

  it("seier at kappa rør er unntatt", () => {
    expect(angrerettAvsnitt(S).tekst.join(" ")).toContain("§ 22");
  });

  it("den korte versjonen i kassen seier det same", () => {
    const k = ANGRERETT_KORT.join(" ");
    expect(k).toContain("14 dagers angrerett");
    expect(k).toContain("kapper");
  });
});

describe("angreskjemaet", () => {
  it("er adressert til seljaren", () => {
    expect(angreskjema(S).felt[0]).toBe("Til: Hauge Maskin AS, Industrivegen 1, 5700 Voss, post@hauge.no");
  });

  it("kjem med i tekstversjonen til e-posten", () => {
    const t = angrerettSomTekst(S);
    expect(t).toContain("ANGRESKJEMA");
    expect(t).toContain("Forbrukerens navn");
    expect(t).toContain("(*) Stryk det som ikke gjelder.");
  });
});

describe("selgerFra", () => {
  it("les firmaet og fristen frå innstillingane", () => {
    const s = selgerFra(
      { company_name: " Hauge Maskin AS ", org_number: "974760673", address: "Voss", email: "a@b.no", phone: "1", pickup_note: "Port 2" },
      { payment_terms_days: 30 },
    );
    expect(s).toEqual({
      navn: "Hauge Maskin AS",
      orgnr: "974760673",
      adresse: "Voss",
      epost: "a@b.no",
      telefon: "1",
      betalingsfrist: 30,
      henteinfo: "Port 2",
    });
  });

  it("fell tilbake på standardane når innstillingane manglar", () => {
    expect(selgerFra(undefined, undefined)).toMatchObject({ navn: "Hauge Maskin AS", betalingsfrist: 14 });
  });
});
```

- [ ] **Step 2: Kjør testene og se at de feiler**

Run: `npx vitest run src/test/vilkar.test.ts`
Expected: FAIL — «Failed to resolve import "@/lib/vilkar"».

- [ ] **Step 3: Skriv koden**

Create `supabase/functions/_shared/angrerett.ts`:

```ts
// Vilkåra og angreretten for bestilling på nett – éin kjelde for alle stadene
// teksten står: /vilkar, kassen, PDF-en og e-postane. Fire kopiar av ein
// lovpålagd tekst ville gli frå kvarandre.
//
// HER, OG IKKJE I src/: Supabase CLI pakkar berre med filer under
// supabase/functions når e-postfunksjonen blir rulla ut. Appen importerer fila
// gjennom src/lib/vilkar.ts; den motsette vegen går ikkje.
//
// Reine funksjonar utan import. Fila blir lesen både av Vite og av Deno, og dei
// er ikkje samde om korleis ein importerer.
//
// UTKAST bygd på det angrerettlova, forbrukarkjøpslova og kjøpslova krev. Ikkje
// juridisk rådgiving. Eigar les det før bestilling på nett blir slått på, og
// unntaket for kappa rør bør stadfestast av advokat.

export type Selger = {
  navn: string;
  orgnr?: string | null;
  adresse?: string | null;
  epost?: string | null;
  telefon?: string | null;
  /** Dagar frå faktura til forfall */
  betalingsfrist: number;
  /** Hentemeldinga frå innstillingane: opningstid, port, kven ein spør etter */
  henteinfo?: string | null;
};

export type Avsnitt = { tittel: string; tekst: string[] };

export type Skjema = { tittel: string; ingress: string; felt: string[]; fotnote: string };

const rein = (v: string | null | undefined) => (v ?? "").trim();

function selgerLinje(s: Selger): string {
  const hvem = [s.navn, rein(s.orgnr) ? `org.nr. ${rein(s.orgnr)}` : "", rein(s.adresse)].filter(Boolean);
  const kontakt = [rein(s.epost) ? `e-post ${rein(s.epost)}` : "", rein(s.telefon) ? `telefon ${rein(s.telefon)}` : ""].filter(
    Boolean,
  );
  return `${hvem.join(", ")}.${kontakt.length ? ` Du når oss på ${kontakt.join(" og ")}.` : ""}`;
}

/** To setningar til kassen. Heile teksten står på /vilkar. */
export const ANGRERETT_KORT = [
  "Som privatperson har du 14 dagers angrerett fra du har hentet varene.",
  "Rør vi kapper til lengden du har bestilt, er laget etter dine mål og kan ikke leveres tilbake.",
];

export function angrerettAvsnitt(s: Selger): Avsnitt {
  return {
    tittel: "Angrerett",
    tekst: [
      "Kjøper du som privatperson, har du 14 dagers angrerett. Fristen løper fra dagen du henter varene.",
      `Vil du bruke angreretten, gir du oss beskjed innen fristen. Bruk gjerne angreskjemaet, eller skriv til oss${
        rein(s.epost) ? ` på ${rein(s.epost)}` : ""
      }. Det holder at beskjeden er sendt før fristen går ut.`,
      "Du bringer varene tilbake til lageret selv og dekker kostnaden ved det. Varene må leveres innen 14 dager etter at du ga beskjed.",
      "Vi betaler tilbake det du har betalt innen 14 dager etter at vi fikk beskjeden, og kan vente til varene er kommet tilbake. Har du ikke betalt ennå, krediterer vi fakturaen.",
      "Du kan undersøke varene slik du ville gjort i en butikk. Har de tapt verdi fordi de er behandlet ut over det, kan vi trekke fra verdifallet.",
      "Rør vi kapper til lengden du har bestilt, er laget etter dine mål og har ikke angrerett (angrerettloven § 22). Hele lengder har vanlig angrerett.",
    ],
  };
}

export function vilkarAvsnitt(s: Selger): Avsnitt[] {
  return [
    { tittel: "Selger", tekst: [selgerLinje(s)] },
    {
      tittel: "Bestillingen",
      tekst: [
        "Når du sender bestillingen, gir du oss et tilbud om å kjøpe varene til prisene som står i den.",
        "Avtalen er bindende når vi har bekreftet den med e-posten «Klar til henting». Kan vi ikke levere, får du beskjed på e-post med begrunnelse, og da er det ingen avtale.",
      ],
    },
    {
      tittel: "Priser",
      tekst: [
        "Prisene er i norske kroner. Kjøper du som privatperson, er prisene og totalprisen oppgitt med merverdiavgift, og totalprisen vises før du sender bestillingen. For bedrifter vises prisene også uten mva.",
        "Det er prisen som gjaldt da du sendte bestillingen, som gjelder.",
      ],
    },
    {
      tittel: "Betaling",
      tekst: [
        `Du betaler med faktura. Betalingsfristen er ${s.betalingsfrist} dager.`,
        "Privatpersoner får fakturaen til adressen i bestillingen. Bedrifter faktureres på organisasjonsnummeret.",
      ],
    },
    {
      tittel: "Henting",
      tekst: [
        `Varene hentes på lageret${rein(s.adresse) ? `, ${rein(s.adresse)}` : ""}. Du velger hentedag i bestillingen, og vi gir beskjed på e-post når varene er klare.`,
        ...(rein(s.henteinfo) ? [rein(s.henteinfo)] : []),
        "Risikoen for varene går over på deg når du har hentet dem.",
      ],
    },
    angrerettAvsnitt(s),
    {
      tittel: "Reklamasjon",
      tekst: [
        "Er det feil ved varene, må du si fra innen rimelig tid etter at du oppdaget det.",
        "For privatpersoner gjelder forbrukerkjøpsloven. Fristen er to år fra du hentet varene, og fem år for varer som er ment å vare vesentlig lenger – slik rør som legges i bakken er.",
        "For bedrifter gjelder kjøpsloven.",
      ],
    },
    {
      tittel: "Personopplysninger",
      tekst: ["Vi bruker opplysningene i bestillingen for å gjennomføre og fakturere den. Personvernerklæringen forteller hvordan."],
    },
    {
      tittel: "Tvister",
      tekst: [
        "Vi prøver å løse uenighet i minnelighet. Privatpersoner kan også klage til Forbrukertilsynet, som mekler, og saken kan deretter bringes inn for Forbrukerklageutvalget.",
      ],
    },
  ];
}

/** Standardskjemaet for angrerett, med seljaren fylt inn. */
export function angreskjema(s: Selger): Skjema {
  const til = [s.navn, rein(s.adresse), rein(s.epost)].filter(Boolean).join(", ");
  return {
    tittel: "Angreskjema",
    ingress: "Fyll ut og returner dette skjemaet bare dersom du vil gå fra avtalen.",
    felt: [
      `Til: ${til}`,
      "Jeg underretter herved om at jeg ønsker å gå fra min avtale om kjøp av følgende varer:",
      "Bestillingsnummer:",
      "Avtalen ble inngått den (*) / Varene ble mottatt den (*):",
      "Forbrukerens navn:",
      "Forbrukerens adresse:",
      "Forbrukerens underskrift (bare dersom skjemaet sendes på papir):",
      "Dato:",
    ],
    fotnote: "(*) Stryk det som ikke gjelder.",
  };
}

/** Angreretten og skjemaet som rein tekst – til tekstversjonen av e-posten. */
export function angrerettSomTekst(s: Selger): string {
  const a = angrerettAvsnitt(s);
  const k = angreskjema(s);
  return [
    a.tittel.toUpperCase(),
    ...a.tekst,
    "",
    k.tittel.toUpperCase(),
    k.ingress,
    ...k.felt.map((f) => `${f} ____________________`),
    k.fotnote,
  ].join("\n");
}
```

Create `src/lib/vilkar.ts`:

```ts
// Vilkårsteksten bur i supabase/functions/_shared, fordi e-postfunksjonen òg
// treng henne. Appen hentar henne her, så ingen komponent treng å kjenne stien.

import type { Selger } from "../../supabase/functions/_shared/angrerett";

export * from "../../supabase/functions/_shared/angrerett";

type FirmaFelt = {
  company_name?: string | null;
  org_number?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  pickup_note?: string | null;
};

/** Seljaren slik innstillingane beskriv han. Tomt blir standardane. */
export function selgerFra(s?: FirmaFelt | null, o?: { payment_terms_days?: number | null } | null): Selger {
  return {
    navn: s?.company_name?.trim() || "Hauge Maskin AS",
    orgnr: s?.org_number ?? null,
    adresse: s?.address ?? null,
    epost: s?.email ?? null,
    telefon: s?.phone ?? null,
    betalingsfrist: o?.payment_terms_days ?? 14,
    henteinfo: s?.pickup_note ?? null,
  };
}
```

- [ ] **Step 4: Kjør testene og se at de passerer**

Run: `npx vitest run src/test/vilkar.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/angrerett.ts src/lib/vilkar.ts src/test/vilkar.test.ts
git commit -m "Vilkår, angrerett og angreskjema, én kilde for alle stedene

Teksten står på /vilkar, i kassen, i PDF-en og i e-postene. Den ligger
i supabase/functions/_shared, fordi e-postfunksjonen trenger den og
Supabase CLI bare pakker med filer derfra. Utkast bygd på det loven
krever, ikke juridisk rådgivning. Unntaket for kappede rør bør
bekreftes av advokat.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Typer, innstillinger, kasseskjemaet og datalaget

**Files:**
- Modify: `src/integrations/supabase/types.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/settings.ts`
- Modify: `src/lib/orders.ts`
- Create: `src/lib/pickup-form.ts`
- Create: `src/lib/pickup-orders.ts`
- Test: `src/test/pickup-form.test.ts`, `src/test/pickup-orders.test.ts`

**Interfaces:**
- Consumes: `gyldigOrgnr`, `vaskOrgnr` (Task 4).
- Produces:
  - Typer i `@/lib/types`: `OrderKind = "uttak" | "bestilling"`, `CustomerType = "privat" | "bedrift"`, `PickupOrderInput`, `PipePublicOrderSettingsRow`, `PipeOrderEmailRow`, `PICKUP_STATUS_LABEL`, `statusLabel(status, kind?)`.
  - `@/lib/settings`: `DEFAULT_ORDER_SETTINGS`, `fetchOrderSettings()`, `useOrderSettings()`.
  - `@/lib/orders` `QK`: `orderSettings`, `waitingPickups`, `pickupOrder(id)`, `orderEmails(id)`.
  - `@/lib/pickup-form`: `KasseSkjema`, `TOMT_SKJEMA`, `Feltfeil`, `osloIDag(naa?)`, `leggTilDager(iDag, n)`, `fakturaadresse(s)`, `sjekkSkjema(s, o)`, `tilInnsending(s, linjer, iDag)`.
  - `@/lib/pickup-orders`: `PickupOrder`, `PickupOrderLine`, `EmailResult`, `submitPickupOrder`, `fetchPickupOrder`, `approvePickupOrder`, `rejectPickupOrder`, `sorterVenter`, `fetchWaitingPickupOrders`, `useWaitingPickupOrders(enabled)`, `fetchOrderEmails`, `somBestilling`, `requestEmails`, `requestEmailsInBackground`.

- [ ] **Step 1: Utvid skjematypene**

I `src/integrations/supabase/types.ts`:

1. I `PipeOrderRow`, rett etter `invoice_id: string | null;`:

```ts
  /**
   * 'uttak' eller 'bestilling'. Valfrie felt fordi appen kan bli rulla ut før
   * 20260924100000 er køyrd – då finst ikkje kolonnene, og alt er uttak.
   */
  kind?: "uttak" | "bestilling";
  /** Når lageret blei trekt. Null for ei bestilling som ikkje er godkjend. */
  stock_drawn_at?: string | null;
  pickup_date?: string | null;
  pickup_now?: boolean;
  customer_type?: "privat" | "bedrift" | null;
  org_number?: string | null;
  billing_address?: string | null;
  /** Kontorets melding til kunden. admin_note er intern og blir aldri vist. */
  customer_message?: string | null;
```

2. I `PipeSettingsRow`, rett etter `markup_percent: number;`:

```ts
  /** Tek butikken på /bestill imot bestillingar */
  accept_orders: boolean;
  /** Varsel om nye bestillingar. Tom = firmaets e-post */
  order_email: string | null;
  /** Dagar frå faktura til forfall */
  payment_terms_days: number;
```

3. Erstatt linja `export type PipePublicSettingsRow = Omit<PipeSettingsRow, "markup_percent">;` med:

```ts
export type PipePublicSettingsRow = Omit<
  PipeSettingsRow,
  "markup_percent" | "accept_orders" | "order_email" | "payment_terms_days"
>;

/**
 * Det bestillingsskjemaet treng å vite. Eiga visning og ikkje nye kolonner på
 * pipe_public_settings – sjå 20260924100000_bestilling_grunnlag.sql.
 */
export type PipePublicOrderSettingsRow = {
  id: number;
  accept_orders: boolean;
  payment_terms_days: number;
};

/** Éi rad per e-post om ei bestilling. Berre kontoret kan lese. */
export type PipeOrderEmailRow = {
  id: string;
  order_id: string;
  type: "kvittering" | "kontor" | "klar" | "avvist";
  recipient: string;
  claimed_at: string;
  sent_at: string | null;
  provider_id: string | null;
};
```

4. I `Tables`, etter `project_receipt_photos: Table<ProjectReceiptPhotoRow>;`: `pipe_order_emails: Table<PipeOrderEmailRow>;`
5. I `Views`, etter `pipe_public_settings: View<PipePublicSettingsRow>;`: `pipe_public_order_settings: View<PipePublicOrderSettingsRow>;`
6. I `Functions`, etter `project_recompute_status: { Args: { p_order_id: string }; Returns: string };`:

```ts
      pipe_submit_pickup_order: {
        Args: {
          p_customer_type: string;
          p_customer_name: string;
          p_customer_email: string;
          p_lines: Json;
          p_customer_phone?: string | null;
          p_company?: string | null;
          p_org_number?: string | null;
          p_billing_address?: string | null;
          p_pickup_now?: boolean;
          p_pickup_date?: string | null;
          p_comment?: string | null;
        };
        Returns: Json;
      };
      pipe_get_pickup_order: { Args: { p_id: string }; Returns: Json };
      pipe_approve_pickup_order: { Args: { p_id: string; p_message?: string | null }; Returns: Json };
      pipe_reject_pickup_order: { Args: { p_id: string; p_message: string }; Returns: Json };
```

- [ ] **Step 2: Domenetypene**

I `src/lib/types.ts`:

1. Legg `PipePublicOrderSettingsRow,` og `PipeOrderEmailRow,` til i den første `export type { ... } from "@/integrations/supabase/types";`-lista (etter `PipePublicSettingsRow,`).
2. Legg til rett etter blokken med `ORDER_STATUS_LABEL`:

```ts
export type OrderKind = "uttak" | "bestilling";
export type CustomerType = "privat" | "bedrift";

/** Same statusverdiar som uttaket, med namn som passar ei bestilling. */
export const PICKUP_STATUS_LABEL: Record<OrderStatus, string> = {
  ny: "Venter på godkjenning",
  behandlet: "Klar til henting",
  levert: "Hentet",
  avvist: "Avvist",
};

export const statusLabel = (status: OrderStatus, kind?: OrderKind | null) =>
  (kind === "bestilling" ? PICKUP_STATUS_LABEL : ORDER_STATUS_LABEL)[status] ?? status;

/** Det kassen sender til pipe_submit_pickup_order. */
export type PickupOrderInput = {
  customer_type: CustomerType;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  company: string | null;
  org_number: string | null;
  billing_address: string | null;
  pickup_now: boolean;
  /** YYYY-MM-DD. Med «henter nå» set basen dagens dato uansett. */
  pickup_date: string | null;
  comment: string | null;
  lines: { pipe_type_id: string; quantity: number }[];
};
```

- [ ] **Step 3: Nøklene og søket i orders.ts**

I `src/lib/orders.ts`, i `QK`-objektet, rett etter linja `projectReceipts: ["project_receipts"],`:

```ts
  /** Om butikken er open, og betalingsfristen. Under settings-prefikset. */
  orderSettings: ["pipe_settings", "bestilling"],
  /** Bestillingar som ventar på godkjenning. Under orders-prefikset, så ei
   *  vanleg invalidering av bestillingane treffer stripa og talet på fana òg. */
  waitingPickups: ["pipe_orders", "venter"],
  /** Éi bestilling slik kunden ser henne. */
  pickupOrder: (id: string) => ["pipe_orders", "bestilling", id],
  orderEmails: (id: string) => ["pipe_order_emails", id],
```

Og i `orderHaystack`, endre lista inni `searchKey(...)` til å ta med org.nr.:

```ts
    [order.customer_name, order.company, order.project, order.customer_phone, phone, order.org_number, `#${order.order_number}`, order.order_number]
```

- [ ] **Step 4: Innstillingene**

I `src/lib/settings.ts`:

1. Endre importen av typer til: `import type { PipePublicOrderSettingsRow, PipePublicSettingsRow, PipeSettingsRow } from "@/lib/types";`
2. I `DEFAULT_SETTINGS`, rett etter `markup_percent: 25,`: `accept_orders: false,` `order_email: null,` `payment_terms_days: 14,`
3. Erstatt linja `const { markup_percent: _påslag, ...OFFENTLEGE_STANDARDAR } = DEFAULT_SETTINGS;` med:

```ts
const {
  markup_percent: _påslag,
  accept_orders: _open,
  order_email: _varsel,
  payment_terms_days: _frist,
  ...OFFENTLEGE_STANDARDAR
} = DEFAULT_SETTINGS;
```

4. Erstatt hele funksjonen `saveSettings` med:

```ts
export async function saveSettings(patch: Partial<PipeSettingsRow>): Promise<void> {
  const { error } = await supabase
    .from("pipe_settings")
    .upsert({ ...patch, id: 1 } as PipeSettingsRow, { onConflict: "id" });
  if (!error) return;
  // Reglane i basen har engelske meldingar. Kontoret skal få vite kva som manglar.
  if (/pipe_settings_accept_orders_check/.test(error.message)) {
    throw new Error("Fyll ut firmanavn, organisasjonsnummer, adresse og e-post før bestilling på nett slås på.");
  }
  if (/pipe_settings_payment_terms_check/.test(error.message)) {
    throw new Error("Betalingsfristen må være mellom 0 og 90 dager.");
  }
  if (/accept_orders|order_email|payment_terms_days/.test(error.message)) {
    throw new Error("Databasen mangler oppdateringen for bestilling. Kjør supabase-setup.sql på nytt.");
  }
  throw new Error(`Klarte ikke å lagre innstillingene: ${error.message}`);
}
```

5. Legg til nederst i fila:

```ts
/** Butikken er stengd til nokon har slått henne på. */
export const DEFAULT_ORDER_SETTINGS: PipePublicOrderSettingsRow = {
  id: 1,
  accept_orders: false,
  payment_terms_days: 14,
};

/**
 * Kastar aldri. Manglar visninga – migrasjonen er ikkje køyrd enno – er svaret
 * «stengd». Då viser /bestill «ring oss» i staden for eit skjema som ville
 * feila ved innsending.
 */
export async function fetchOrderSettings(): Promise<PipePublicOrderSettingsRow> {
  try {
    const { data, error } = await supabase.from("pipe_public_order_settings").select("*").eq("id", 1).maybeSingle();
    if (error || !data) return DEFAULT_ORDER_SETTINGS;
    return { ...DEFAULT_ORDER_SETTINGS, ...(data as PipePublicOrderSettingsRow) };
  } catch {
    return DEFAULT_ORDER_SETTINGS;
  }
}

export function useOrderSettings(): UseQueryResult<PipePublicOrderSettingsRow> {
  return useQuery({
    queryKey: QK.orderSettings,
    queryFn: fetchOrderSettings,
    staleTime: 60 * 1000,
    placeholderData: DEFAULT_ORDER_SETTINGS,
  });
}
```

- [ ] **Step 5: Skriv testene for skjemaet og datalaget**

Create `src/test/pickup-form.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TOMT_SKJEMA, fakturaadresse, leggTilDager, osloIDag, sjekkSkjema, tilInnsending, type KasseSkjema } from "@/lib/pickup-form";

const I_DAG = "2026-09-24";
const O = { kreverTelefon: true, iDag: I_DAG };

const privat = (over: Partial<KasseSkjema> = {}): KasseSkjema => ({
  ...TOMT_SKJEMA,
  kundetype: "privat",
  navn: "Ola Privat",
  epost: "ola@privat.no",
  telefon: "900 00 000",
  gate: "Bakkevegen 3",
  postnr: "5700",
  sted: "Voss",
  henterNaa: false,
  hentedag: "2026-09-30",
  ...over,
});

const bedrift = (over: Partial<KasseSkjema> = {}): KasseSkjema => ({
  ...privat(),
  kundetype: "bedrift",
  firma: "Firma AS",
  orgnr: "974 760 673",
  ...over,
});

describe("osloIDag og leggTilDager", () => {
  it("gir norsk dato, ikkje UTC", () => {
    // 22:30 UTC i september er 00:30 neste dag i Noreg
    expect(osloIDag(new Date("2026-09-24T22:30:00Z"))).toBe("2026-09-25");
    expect(osloIDag(new Date("2026-01-10T23:30:00Z"))).toBe("2026-01-11");
  });

  it("legg til dagar over månadsskifte", () => {
    expect(leggTilDager("2026-09-24", 90)).toBe("2026-12-23");
    expect(leggTilDager("2026-09-24", -1)).toBe("2026-09-23");
  });
});

describe("sjekkSkjema", () => {
  it("godtek eit fullt utfylt skjema", () => {
    expect(sjekkSkjema(privat(), O)).toBeNull();
    expect(sjekkSkjema(bedrift(), O)).toBeNull();
    expect(sjekkSkjema(privat({ henterNaa: true, hentedag: "" }), O)).toBeNull();
  });

  it("spør først om når, så om kven – i same rekkjefølgje som skjemaet", () => {
    expect(sjekkSkjema(TOMT_SKJEMA, O)?.felt).toBe("henterNaa");
    expect(sjekkSkjema({ ...TOMT_SKJEMA, henterNaa: true }, O)?.felt).toBe("kundetype");
  });

  it("krev ein hentedag frå i dag og høgst 90 dagar fram", () => {
    expect(sjekkSkjema(privat({ hentedag: "" }), O)?.melding).toBe("Velg hvilken dag du vil hente");
    expect(sjekkSkjema(privat({ hentedag: "2026-09-23" }), O)?.melding).toBe("Hentedagen kan ikke være tilbake i tid");
    expect(sjekkSkjema(privat({ hentedag: I_DAG }), O)).toBeNull();
    expect(sjekkSkjema(privat({ hentedag: "2026-12-23" }), O)).toBeNull();
    expect(sjekkSkjema(privat({ hentedag: "2026-12-24" }), O)?.melding).toBe("Hentedagen kan være høyst 90 dager fram");
  });

  it("krev firma og gyldig org.nr. for bedrift", () => {
    expect(sjekkSkjema(bedrift({ firma: " " }), O)?.felt).toBe("firma");
    expect(sjekkSkjema(bedrift({ orgnr: "974760674" }), O)?.melding).toBe("Organisasjonsnummeret er ikke gyldig");
  });

  it("kallar namnet kontaktperson for bedrift", () => {
    expect(sjekkSkjema(bedrift({ navn: "" }), O)?.melding).toBe("Kontaktperson må fylles ut");
    expect(sjekkSkjema(privat({ navn: "" }), O)?.melding).toBe("Navn må fylles ut");
  });

  it("krev fakturaadresse for privatperson, med firesifra postnummer", () => {
    expect(sjekkSkjema(privat({ gate: "" }), O)?.felt).toBe("gate");
    expect(sjekkSkjema(privat({ postnr: "570" }), O)?.melding).toBe("Postnummeret skal ha fire siffer");
    expect(sjekkSkjema(privat({ sted: "" }), O)?.felt).toBe("sted");
  });

  it("krev telefon berre når innstillinga seier det", () => {
    expect(sjekkSkjema(privat({ telefon: "" }), O)?.felt).toBe("telefon");
    expect(sjekkSkjema(privat({ telefon: "" }), { ...O, kreverTelefon: false })).toBeNull();
  });

  it("krev e-post som ser ut som ei adresse", () => {
    expect(sjekkSkjema(privat({ epost: "" }), O)?.melding).toBe("E-post må fylles ut");
    expect(sjekkSkjema(privat({ epost: "ola.privat.no" }), O)?.melding).toBe("E-postadressen ser ikke riktig ut");
  });

  it("stoppar for lange felt med same grenser som basen", () => {
    expect(sjekkSkjema(privat({ navn: "x".repeat(101) }), O)?.felt).toBe("navn");
    expect(sjekkSkjema(bedrift({ firma: "x".repeat(121) }), O)?.felt).toBe("firma");
    expect(sjekkSkjema(privat({ kommentar: "x".repeat(1001) }), O)?.felt).toBe("kommentar");
  });
});

describe("fakturaadresse og tilInnsending", () => {
  it("set saman adressa på éi linje", () => {
    expect(fakturaadresse({ gate: " Bakkevegen 3 ", postnr: "5700", sted: "Voss " })).toBe("Bakkevegen 3, 5700 Voss");
  });

  it("sender adresse for privatperson og ikkje firma", () => {
    const i = tilInnsending(privat({ firma: "Rest", orgnr: "123" }), [{ pipe_type_id: "a", quantity: 2 }], I_DAG);
    expect(i).toMatchObject({
      customer_type: "privat",
      company: null,
      org_number: null,
      billing_address: "Bakkevegen 3, 5700 Voss",
      pickup_now: false,
      pickup_date: "2026-09-30",
    });
    expect(i.lines).toEqual([{ pipe_type_id: "a", quantity: 2 }]);
  });

  it("sender firma og org.nr. utan mellomrom for bedrift, og ikkje adresse", () => {
    const i = tilInnsending(bedrift(), [], I_DAG);
    expect(i).toMatchObject({ customer_type: "bedrift", company: "Firma AS", org_number: "974760673", billing_address: null });
  });

  it("«henter nå» sender dagens dato", () => {
    expect(tilInnsending(privat({ henterNaa: true, hentedag: "" }), [], I_DAG)).toMatchObject({
      pickup_now: true,
      pickup_date: I_DAG,
    });
  });

  it("tomme valfrie felt blir null", () => {
    expect(tilInnsending(privat({ telefon: " ", kommentar: "" }), [], I_DAG)).toMatchObject({
      customer_phone: null,
      comment: null,
    });
  });
});
```

Create `src/test/pickup-orders.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { somBestilling, sorterVenter } from "@/lib/pickup-orders";
import type { OrderWithLines } from "@/lib/types";

describe("sorterVenter", () => {
  it("set «henter nå» først, så tidlegaste hentedag, så eldste innsending", () => {
    const rader = [
      { id: "c", pickup_now: false, pickup_date: "2026-10-03", created_at: "2026-09-24T08:00:00Z" },
      { id: "d", pickup_now: false, pickup_date: "2026-10-01", created_at: "2026-09-24T09:00:00Z" },
      { id: "b", pickup_now: true, pickup_date: "2026-09-24", created_at: "2026-09-24T10:00:00Z" },
      { id: "e", pickup_now: false, pickup_date: "2026-10-01", created_at: "2026-09-24T07:00:00Z" },
    ];
    expect(sorterVenter(rader).map((r) => r.id)).toEqual(["b", "e", "d", "c"]);
  });
});

describe("somBestilling", () => {
  it("gjer ei rad frå adminlista om til det PDF-en treng", () => {
    const o = {
      id: "x",
      order_number: 7,
      created_at: "2026-09-24T10:00:00Z",
      status: "behandlet",
      kind: "bestilling",
      pickup_date: "2026-10-01",
      pickup_now: false,
      customer_type: "bedrift",
      customer_name: "Kari",
      customer_email: "kari@firma.no",
      customer_phone: null,
      company: "Firma AS",
      org_number: "974760673",
      billing_address: null,
      comment: null,
      customer_message: "Port 2",
      handled_at: null,
      total: 100,
      lines: [{ id: "l", name: "Rør", dimension: null, sku: null, unit: "m", quantity: 1, unit_price: 100, line_total: 100 }],
    } as unknown as OrderWithLines;
    const b = somBestilling(o);
    expect(b).toMatchObject({ order_number: 7, customer_type: "bedrift", company: "Firma AS", customer_message: "Port 2" });
    expect(b.lines).toEqual([{ name: "Rør", dimension: null, sku: null, unit: "m", quantity: 1, unit_price: 100, line_total: 100 }]);
    expect(b.emails).toEqual({});
  });
});
```

- [ ] **Step 6: Kjør testene og se at de feiler**

Run: `npx vitest run src/test/pickup-form.test.ts src/test/pickup-orders.test.ts`
Expected: FAIL — «Failed to resolve import "@/lib/pickup-form"».

- [ ] **Step 7: Skriv kasseskjemaet**

Create `src/lib/pickup-form.ts`:

```ts
// Skjemaet i kassen, som reine funksjonar. Same reglar og same ordlyd som
// pipe_submit_pickup_order: skjemaet seier frå med ein gong, basen avgjer.

import { gyldigOrgnr, vaskOrgnr } from "@/lib/orgnr";
import type { CustomerType, PickupOrderInput } from "@/lib/types";

export type KasseSkjema = {
  kundetype: CustomerType | null;
  /** Namnet til privatpersonen, eller kontaktpersonen i bedrifta */
  navn: string;
  epost: string;
  telefon: string;
  firma: string;
  orgnr: string;
  gate: string;
  postnr: string;
  sted: string;
  /** null til kunden har valt */
  henterNaa: boolean | null;
  /** YYYY-MM-DD, eller tom */
  hentedag: string;
  kommentar: string;
};

export const TOMT_SKJEMA: KasseSkjema = {
  kundetype: null,
  navn: "",
  epost: "",
  telefon: "",
  firma: "",
  orgnr: "",
  gate: "",
  postnr: "",
  sted: "",
  henterNaa: null,
  hentedag: "",
  kommentar: "",
};

export type Feltfeil = { felt: keyof KasseSkjema; melding: string };

const EPOST = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Dagens dato i Noreg som YYYY-MM-DD. Ikkje toISOString(), som gir UTC og bommar
 * på datoen mellom midnatt og klokka to om natta.
 */
export const osloIDag = (naa: Date = new Date()): string =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit" }).format(naa);

/** Reine datoar rekna i UTC, så sommartid aldri flyttar dagen. */
export function leggTilDager(iDag: string, dagar: number): string {
  const d = new Date(`${iDag}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dagar);
  return d.toISOString().slice(0, 10);
}

export function fakturaadresse(s: Pick<KasseSkjema, "gate" | "postnr" | "sted">): string {
  const sted = [s.postnr.trim(), s.sted.trim()].filter(Boolean).join(" ");
  return [s.gate.trim(), sted].filter(Boolean).join(", ");
}

/** Første feil i skjemaet, i same rekkjefølgje som feltene står. Null = klart. */
export function sjekkSkjema(s: KasseSkjema, o: { kreverTelefon: boolean; iDag: string }): Feltfeil | null {
  if (s.henterNaa === null) return { felt: "henterNaa", melding: "Velg når du henter" };
  if (!s.henterNaa) {
    if (!s.hentedag) return { felt: "hentedag", melding: "Velg hvilken dag du vil hente" };
    if (s.hentedag < o.iDag) return { felt: "hentedag", melding: "Hentedagen kan ikke være tilbake i tid" };
    if (s.hentedag > leggTilDager(o.iDag, 90)) {
      return { felt: "hentedag", melding: "Hentedagen kan være høyst 90 dager fram" };
    }
  }

  if (!s.kundetype) return { felt: "kundetype", melding: "Velg om du bestiller som privatperson eller bedrift" };

  if (s.kundetype === "bedrift") {
    if (!s.firma.trim()) return { felt: "firma", melding: "Firmanavn må fylles ut" };
    if (s.firma.trim().length > 120) return { felt: "firma", melding: "Firmanavnet er for langt (høyst 120 tegn)" };
    if (!gyldigOrgnr(s.orgnr)) return { felt: "orgnr", melding: "Organisasjonsnummeret er ikke gyldig" };
  }

  if (!s.navn.trim()) {
    return { felt: "navn", melding: s.kundetype === "bedrift" ? "Kontaktperson må fylles ut" : "Navn må fylles ut" };
  }
  if (s.navn.trim().length > 100) return { felt: "navn", melding: "Navnet er for langt (høyst 100 tegn)" };

  if (s.kundetype === "privat") {
    if (!s.gate.trim()) return { felt: "gate", melding: "Gateadresse må fylles ut" };
    if (!/^\d{4}$/.test(s.postnr.trim())) return { felt: "postnr", melding: "Postnummeret skal ha fire siffer" };
    if (!s.sted.trim()) return { felt: "sted", melding: "Poststed må fylles ut" };
    if (fakturaadresse(s).length > 200) return { felt: "gate", melding: "Adressen er for lang (høyst 200 tegn)" };
  }

  if (o.kreverTelefon && !s.telefon.trim()) return { felt: "telefon", melding: "Telefonnummer må fylles ut" };
  if (s.telefon.trim().length > 30) return { felt: "telefon", melding: "Telefonnummeret er for langt" };

  const epost = s.epost.trim();
  if (!epost) return { felt: "epost", melding: "E-post må fylles ut" };
  if (epost.length > 254 || !EPOST.test(epost)) return { felt: "epost", melding: "E-postadressen ser ikke riktig ut" };

  if (s.kommentar.trim().length > 1000) return { felt: "kommentar", melding: "Kommentaren er for lang (høyst 1000 tegn)" };
  return null;
}

/** Det som blir sendt til basen. Felt som ikkje høyrer til kundetypen, blir null. */
export function tilInnsending(
  s: KasseSkjema,
  linjer: { pipe_type_id: string; quantity: number }[],
  iDag: string,
): PickupOrderInput {
  const bedrift = s.kundetype === "bedrift";
  return {
    customer_type: bedrift ? "bedrift" : "privat",
    customer_name: s.navn.trim(),
    customer_email: s.epost.trim(),
    customer_phone: s.telefon.trim() || null,
    company: bedrift ? s.firma.trim() : null,
    org_number: bedrift ? vaskOrgnr(s.orgnr) : null,
    billing_address: bedrift ? null : fakturaadresse(s),
    pickup_now: s.henterNaa === true,
    pickup_date: s.henterNaa ? iDag : s.hentedag || null,
    comment: s.kommentar.trim() || null,
    lines: linjer.map((l) => ({ pipe_type_id: l.pipe_type_id, quantity: l.quantity })),
  };
}
```

- [ ] **Step 8: Skriv datalaget**

Create `src/lib/pickup-orders.ts`:

```ts
// Datalaget for bestillingane. Innsending, oppslag og kontorets handlingar går
// gjennom databasefunksjonar: ei bestilling blir aldri skriven rett i
// pipe_orders herifrå, fordi godkjenning og avvisning flyttar rør og må skje i
// same transaksjon som statusen.

import { useQuery } from "@tanstack/react-query";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { QK } from "@/lib/orders";
import type {
  CustomerType,
  OrderStatus,
  OrderWithLines,
  PickupOrderInput,
  PipeOrderEmailRow,
  PipeOrderLineRow,
  PipeOrderRow,
} from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PickupOrderLine = Pick<
  PipeOrderLineRow,
  "name" | "dimension" | "sku" | "unit" | "quantity" | "unit_price" | "line_total"
>;

/** Bestillinga slik kunden ser henne – det pipe_get_pickup_order gir. */
export type PickupOrder = {
  id: string;
  order_number: number;
  created_at: string;
  status: OrderStatus;
  pickup_date: string;
  pickup_now: boolean;
  customer_type: CustomerType;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  company: string | null;
  org_number: string | null;
  billing_address: string | null;
  comment: string | null;
  customer_message: string | null;
  handled_at: string | null;
  total: number;
  lines: PickupOrderLine[];
  /** Når kvittering, klar og avvist gjekk ut. Kontorets varsel er ikkje med. */
  emails: Partial<Record<"kvittering" | "klar" | "avvist", string>>;
};

export async function submitPickupOrder(input: PickupOrderInput): Promise<{ id: string; order_number: number }> {
  const { data, error } = await supabase.rpc("pipe_submit_pickup_order", {
    p_customer_type: input.customer_type,
    p_customer_name: input.customer_name,
    p_customer_email: input.customer_email,
    p_lines: input.lines as unknown as Json,
    p_customer_phone: input.customer_phone,
    p_company: input.company,
    p_org_number: input.org_number,
    p_billing_address: input.billing_address,
    p_pickup_now: input.pickup_now,
    p_pickup_date: input.pickup_date,
    p_comment: input.comment,
  });
  // Meldinga frå basen er allereie norsk og skriven for kunden.
  if (error) throw new Error(error.message || "Klarte ikke å sende bestillingen");
  const svar = data as { id?: string; order_number?: number } | null;
  if (!svar?.id) throw new Error("Klarte ikke å sende bestillingen");
  return { id: svar.id, order_number: Number(svar.order_number) };
}

const tal = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Null når id-en ikkje finst eller peikar på eit uttak. Kastar ved nettfeil. */
export async function fetchPickupOrder(id: string): Promise<PickupOrder | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await supabase.rpc("pipe_get_pickup_order", { p_id: id });
  if (error) throw new Error(`Klarte ikke å hente bestillingen: ${error.message}`);
  if (!data) return null;
  const r = data as unknown as PickupOrder;
  return {
    ...r,
    total: Number(r.total),
    lines: (r.lines ?? []).map((l) => ({
      ...l,
      quantity: Number(l.quantity),
      unit_price: tal(l.unit_price),
      line_total: tal(l.line_total),
    })),
    emails: r.emails ?? {},
  };
}

export async function approvePickupOrder(id: string, message: string | null): Promise<void> {
  const { error } = await supabase.rpc("pipe_approve_pickup_order", { p_id: id, p_message: message });
  if (error) throw new Error(error.message || "Klarte ikke å godkjenne bestillingen");
}

export async function rejectPickupOrder(id: string, message: string): Promise<void> {
  const { error } = await supabase.rpc("pipe_reject_pickup_order", { p_id: id, p_message: message });
  if (error) throw new Error(error.message || "Klarte ikke å avvise bestillingen");
}

/** «Henter nå» først, så tidlegaste hentedag, så eldste innsending. */
export function sorterVenter<T extends Pick<PipeOrderRow, "pickup_now" | "pickup_date" | "created_at">>(rader: T[]): T[] {
  return [...rader].sort(
    (a, b) =>
      Number(Boolean(b.pickup_now)) - Number(Boolean(a.pickup_now)) ||
      (a.pickup_date ?? "").localeCompare(b.pickup_date ?? "") ||
      a.created_at.localeCompare(b.created_at),
  );
}

/**
 * Bestillingar som ventar på godkjenning, uavhengig av datofilteret i lista.
 * Feilar spørjinga – til dømes fordi migrasjonen ikkje er køyrd og kolonnen
 * kind ikkje finst – er svaret ei tom liste: då finst det ingenting å vente på.
 */
export async function fetchWaitingPickupOrders(): Promise<OrderWithLines[]> {
  const { data, error } = await supabase
    .from("pipe_orders")
    .select("*, pipe_order_lines(*)")
    .eq("kind", "bestilling")
    .eq("status", "ny");
  if (error) return [];
  const rows = (data ?? []) as unknown as (PipeOrderRow & { pipe_order_lines?: PipeOrderLineRow[] })[];
  return sorterVenter(
    rows.map(({ pipe_order_lines, ...o }) => ({
      ...o,
      lines: [...(pipe_order_lines ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    })),
  );
}

/** Spør kvart minutt, så kontoret ser nye bestillingar utan å laste sida på nytt. */
export function useWaitingPickupOrders(enabled = true) {
  return useQuery({
    queryKey: QK.waitingPickups,
    queryFn: fetchWaitingPickupOrders,
    enabled,
    refetchInterval: 60_000,
  });
}

export async function fetchOrderEmails(orderId: string): Promise<PipeOrderEmailRow[]> {
  const { data, error } = await supabase
    .from("pipe_order_emails")
    .select("*")
    .eq("order_id", orderId)
    .order("claimed_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as PipeOrderEmailRow[];
}

/** Ei rad frå adminlista i same form som kunden får – det PDF-en treng. */
export function somBestilling(o: OrderWithLines): PickupOrder {
  return {
    id: o.id,
    order_number: o.order_number,
    created_at: o.created_at,
    status: o.status,
    pickup_date: o.pickup_date ?? o.created_at.slice(0, 10),
    pickup_now: o.pickup_now ?? false,
    customer_type: o.customer_type ?? "privat",
    customer_name: o.customer_name,
    customer_email: o.customer_email ?? "",
    customer_phone: o.customer_phone,
    company: o.company,
    org_number: o.org_number ?? null,
    billing_address: o.billing_address ?? null,
    comment: o.comment,
    customer_message: o.customer_message ?? null,
    handled_at: o.handled_at,
    total: o.total,
    lines: o.lines.map((l) => ({
      name: l.name,
      dimension: l.dimension,
      sku: l.sku,
      unit: l.unit,
      quantity: l.quantity,
      unit_price: l.unit_price,
      line_total: l.line_total,
    })),
    emails: {},
  };
}

// ── E-post ──
//
// Funksjonen bestilling-epost tek imot ein id og ingenting anna, og avgjer sjølv
// kva som skal sendast. Kvart kall er trygt å gjenta.

export type EmailResult = { satt_opp: boolean; sendt: string[]; feilet: string[] };

const funksjonsUrl = () =>
  `${String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "")}/functions/v1/bestilling-epost`;

/**
 * Ber om e-post utan å vente. Overlever at fana blir lukka.
 *
 * Ein enkel førespurnad – rein tekst, ingen eigne hovud – slik at han ikkje
 * treng preflight. Då kan sendBeacon og keepalive fullføre han etter at kunden
 * har gått, og funksjonen er rulla ut utan JWT-krav av same grunn.
 */
export function requestEmailsInBackground(id: string): void {
  if (!isSupabaseConfigured || !UUID.test(id)) return;
  const url = funksjonsUrl();
  const body = JSON.stringify({ id });
  try {
    if (navigator.sendBeacon?.(url, new Blob([body], { type: "text/plain" }))) return;
  } catch {
    /* fell gjennom til fetch */
  }
  void fetch(url, { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => {});
}

/** Ber om e-post og ventar på svaret, høgst 12 sekund. Kastar aldri. */
export async function requestEmails(id: string): Promise<EmailResult | null> {
  if (!isSupabaseConfigured || !UUID.test(id)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(funksjonsUrl(), {
      method: "POST",
      body: JSON.stringify({ id }),
      headers: { "Content-Type": "text/plain" },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const r = (await res.json()) as Partial<EmailResult>;
    return { satt_opp: r.satt_opp === true, sendt: r.sendt ?? [], feilet: r.feilet ?? [] };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 9: Kjør testene og typesjekk**

Run: `npx vitest run && npx tsc -p tsconfig.app.json --noEmit`
Expected: alle vitest-tester passerer. `tsc` viser bare de 6 feilene fra grunnlinjen (se Global Constraints).

- [ ] **Step 10: Commit**

```bash
git add src/integrations/supabase/types.ts src/lib/types.ts src/lib/settings.ts src/lib/orders.ts src/lib/pickup-form.ts src/lib/pickup-orders.ts src/test/pickup-form.test.ts src/test/pickup-orders.test.ts
git commit -m "Bestilling: typer, innstillinger, kasseskjemaet og datalaget

Kasseskjemaet er rene funksjoner med samme regler og ordlyd som basen.
Datalaget går bare gjennom databasefunksjonene, og e-post bes om med en
enkel forespørsel som overlever at fanen lukkes.

De nye feltene på pipe_orders er valgfrie i typene: appen kan bli rullet
ut før migrasjonen, og da skal alt oppføre seg som uttak.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Bestillingskurven

**Files:**
- Create: `src/lib/pickup-cart.ts`
- Test: `src/test/pickup-cart.test.ts`

**Interfaces:**
- Consumes: `linjesum` (Task 4), `KasseSkjema`, `TOMT_SKJEMA` (Task 6), `CatalogItem`.
- Produces: `PickupCartLine = { pipe_type_id, name, dimension, sku, unit, price: number, quantity }`; `readPickupCart()`, `writePickupCart(lines)`, `clearPickupCart()`, `pickupLineFromItem(item, quantity): PickupCartLine | null`, `pickupCartEks(lines): number`, `usePickupCart()` → `{ lines, add, setQuantity, remove, clear, count, eks }`; `LagraKunde`, `lesKunde()`, `skrivKunde(k)`; `lesUtkast()`, `skrivUtkast(s)`, `slettUtkast()`.

- [ ] **Step 1: Skriv testene**

Create `src/test/pickup-cart.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPickupCart,
  lesKunde,
  lesUtkast,
  pickupCartEks,
  pickupLineFromItem,
  readPickupCart,
  skrivKunde,
  skrivUtkast,
  slettUtkast,
  usePickupCart,
  writePickupCart,
  type PickupCartLine,
} from "@/lib/pickup-cart";
import { TOMT_SKJEMA } from "@/lib/pickup-form";
import type { CatalogItem } from "@/lib/types";

const linje = (over: Partial<PickupCartLine> = {}): PickupCartLine => ({
  pipe_type_id: "a",
  name: "PVC avløpsrør",
  dimension: "110 mm",
  sku: "PVC-110",
  unit: "m",
  price: 103.39,
  quantity: 12.5,
  ...over,
});

const vare = (over: Partial<CatalogItem> = {}) =>
  ({
    id: "a",
    name: "PVC avløpsrør",
    dimension: "110 mm",
    sku: "PVC-110",
    unit: "m",
    price: 100,
    ...over,
  }) as CatalogItem;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  clearPickupCart();
});

describe("kurva i localStorage", () => {
  it("overlever skriving og lesing", () => {
    writePickupCart([linje(), linje({ pipe_type_id: "b" })]);
    expect(readPickupCart()).toHaveLength(2);
  });

  it("kastar søppel i staden for å krasje", () => {
    localStorage.setItem("rorlager.bestilling.v1", "{ikkje json");
    expect(readPickupCart()).toEqual([]);
    localStorage.setItem(
      "rorlager.bestilling.v1",
      JSON.stringify([{ name: "utan id" }, linje({ price: null as unknown as number }), linje({ quantity: 0 }), linje()]),
    );
    expect(readPickupCart()).toHaveLength(1);
  });

  it("er skild frå uttakskurva", () => {
    writePickupCart([linje()]);
    expect(localStorage.getItem("rorlager.kurv.v1")).toBeNull();
  });
});

describe("pickupLineFromItem", () => {
  it("lagar ei linje med prisen, og rundar mengda til to desimalar", () => {
    expect(pickupLineFromItem(vare(), 2.346)).toMatchObject({ pipe_type_id: "a", price: 100, quantity: 2.35 });
  });

  it("gir null for ei vare utan pris – ho kan ikkje bestillast", () => {
    expect(pickupLineFromItem(vare({ price: null }), 1)).toBeNull();
  });
});

describe("pickupCartEks", () => {
  it("summerer linjene slik basen gjer", () => {
    expect(pickupCartEks([linje(), linje({ pipe_type_id: "b", price: 25, quantity: 4 })])).toBe(1392.38);
  });
});

describe("usePickupCart", () => {
  it("slår saman same vare i staden for to linjer", () => {
    const { result } = renderHook(() => usePickupCart());
    act(() => result.current.add(linje({ quantity: 2 })));
    act(() => result.current.add(linje({ quantity: 3.5 })));
    expect(result.current.lines).toHaveLength(1);
    expect(result.current.lines[0].quantity).toBe(5.5);
    expect(result.current.count).toBe(1);
  });

  it("set mengd, men fjernar aldri ei linje på 0", () => {
    const { result } = renderHook(() => usePickupCart());
    act(() => result.current.add(linje()));
    act(() => result.current.setQuantity("a", 0));
    expect(result.current.lines[0].quantity).toBe(12.5);
    act(() => result.current.remove("a"));
    expect(result.current.lines).toEqual([]);
  });
});

describe("kundeopplysningar og utkast", () => {
  it("hugsar kontaktopplysningane, men ikkje hentedag og kommentar", () => {
    skrivKunde({ ...TOMT_SKJEMA, kundetype: "privat", navn: "Ola", hentedag: "2026-10-01", kommentar: "hei" } as never);
    const k = lesKunde();
    expect(k.navn).toBe("Ola");
    expect("hentedag" in k).toBe(false);
    expect("kommentar" in k).toBe(false);
  });

  it("utkastet lever i økta og kan slettast", () => {
    skrivUtkast({ ...TOMT_SKJEMA, kommentar: "Ring før" });
    expect(lesUtkast().kommentar).toBe("Ring før");
    slettUtkast();
    expect(lesUtkast()).toEqual({});
  });

  it("eit øydelagt utkast gir tomt", () => {
    sessionStorage.setItem("rorlager.bestilling-utkast.v1", "{");
    expect(lesUtkast()).toEqual({});
  });
});
```

- [ ] **Step 2: Kjør testene og se at de feiler**

Run: `npx vitest run src/test/pickup-cart.test.ts`
Expected: FAIL — «Failed to resolve import "@/lib/pickup-cart"».

- [ ] **Step 3: Skriv kurven**

Create `src/lib/pickup-cart.ts`:

```ts
// Bestillingskurva. Eiga kurv, skild frå uttakskurva i cart.ts, så eit uttak ved
// hylla og ei bestilling heimanfrå aldri blir blanda.

import { useCallback, useEffect, useState } from "react";
import { linjesum } from "@/lib/mva";
import type { KasseSkjema } from "@/lib/pickup-form";
import type { CatalogItem } from "@/lib/types";

const KEY = "rorlager.bestilling.v1";
const KUNDE_KEY = "rorlager.bestilling-kunde.v1";
const UTKAST_KEY = "rorlager.bestilling-utkast.v1";
const EVENT = "rorlager-bestilling";

export type PickupCartLine = {
  pipe_type_id: string;
  name: string;
  dimension: string | null;
  sku: string | null;
  unit: string;
  /** Prisen då vara blei lagd i kurva. Kassen hentar dagens pris på nytt. */
  price: number;
  quantity: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const erLinje = (v: unknown): v is PickupCartLine => {
  if (!v || typeof v !== "object") return false;
  const l = v as Record<string, unknown>;
  return (
    typeof l.pipe_type_id === "string" &&
    typeof l.name === "string" &&
    typeof l.unit === "string" &&
    typeof l.price === "number" &&
    typeof l.quantity === "number" &&
    l.quantity > 0
  );
};

export function readPickupCart(): PickupCartLine[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Ei halvskriven eller manipulert kurv skal ikkje velte butikken
    return Array.isArray(parsed) ? parsed.filter(erLinje) : [];
  } catch {
    return [];
  }
}

export function writePickupCart(lines: PickupCartLine[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    /* full disk eller privat modus – kurva lever i minnet så lenge fana er open */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function clearPickupCart() {
  writePickupCart([]);
}

/** Null for ei vare utan pris: ein privatperson skal sjå totalprisen før bestillinga. */
export const pickupLineFromItem = (t: CatalogItem, quantity: number): PickupCartLine | null =>
  t.price === null
    ? null
    : {
        pipe_type_id: t.id,
        name: t.name,
        dimension: t.dimension,
        sku: t.sku,
        unit: t.unit,
        price: t.price,
        quantity: round2(quantity),
      };

/** Summen eks. mva, rekna linje for linje slik basen gjer. */
export const pickupCartEks = (lines: PickupCartLine[]) =>
  lines.reduce((s, l) => s + Math.round(linjesum(l.price, l.quantity) * 100), 0) / 100;

/**
 * Kurva med reaktiv lesing. Endringar frå ei anna fane (storage) og frå andre
 * komponentar i same fane (CustomEvent) gir begge ny render.
 */
export function usePickupCart() {
  const [lines, setLines] = useState<PickupCartLine[]>(() => readPickupCart());

  useEffect(() => {
    const sync = () => setLines(readPickupCart());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  /** Same vare to gonger blir slått saman i staden for å bli to linjer. */
  const add = useCallback((line: PickupCartLine) => {
    const current = readPickupCart();
    const i = current.findIndex((l) => l.pipe_type_id === line.pipe_type_id);
    if (i >= 0) current[i] = { ...line, quantity: round2(current[i].quantity + line.quantity) };
    else current.push(line);
    writePickupCart(current);
  }, []);

  /** Set mengd, men fjern aldri ei linje – søppelbøtta er den eine vegen ut. */
  const setQuantity = useCallback((pipeTypeId: string, quantity: number) => {
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    writePickupCart(readPickupCart().map((l) => (l.pipe_type_id === pipeTypeId ? { ...l, quantity: round2(quantity) } : l)));
  }, []);

  const remove = useCallback((pipeTypeId: string) => {
    writePickupCart(readPickupCart().filter((l) => l.pipe_type_id !== pipeTypeId));
  }, []);

  const clear = useCallback(() => clearPickupCart(), []);

  return { lines, add, setQuantity, remove, clear, count: lines.length, eks: pickupCartEks(lines) };
}

// ── Kundeopplysningane ──
//
// Same person bestiller ofte, og skal sleppe å taste alt på nytt. Hentedag og
// kommentar høyrer til éi bestilling og blir ikkje hugsa.

export type LagraKunde = Pick<
  KasseSkjema,
  "kundetype" | "navn" | "epost" | "telefon" | "firma" | "orgnr" | "gate" | "postnr" | "sted"
>;

const KUNDEFELT: (keyof LagraKunde)[] = ["kundetype", "navn", "epost", "telefon", "firma", "orgnr", "gate", "postnr", "sted"];

export function lesKunde(): Partial<LagraKunde> {
  try {
    const raw = localStorage.getItem(KUNDE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function skrivKunde(k: LagraKunde) {
  const berre = Object.fromEntries(KUNDEFELT.map((f) => [f, k[f]]));
  try {
    localStorage.setItem(KUNDE_KEY, JSON.stringify(berre));
  } catch {
    /* berre ei bekvemmelegheit */
  }
}

// ── Utkastet ──
//
// Heile skjemaet medan det blir fylt ut, i sessionStorage: det overlever at
// kunden opnar vilkåra og går tilbake, men ikkje at fana blir lukka.

export function lesUtkast(): Partial<KasseSkjema> {
  try {
    const raw = sessionStorage.getItem(UTKAST_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function skrivUtkast(s: KasseSkjema) {
  try {
    sessionStorage.setItem(UTKAST_KEY, JSON.stringify(s));
  } catch {
    /* privat modus */
  }
}

export function slettUtkast() {
  try {
    sessionStorage.removeItem(UTKAST_KEY);
  } catch {
    /* privat modus */
  }
}
```

- [ ] **Step 4: Kjør testene og se at de passerer**

Run: `npx vitest run src/test/pickup-cart.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pickup-cart.ts src/test/pickup-cart.test.ts
git commit -m "Bestilling: egen kurv, lagrede kontaktopplysninger og utkast

Bestillingskurven er adskilt fra uttakskurven, så et uttak og en
bestilling aldri blandes. Varer uten pris kan ikke legges i den.
Utkastet til kasseskjemaet lever i økten, så ingenting forsvinner om
kunden åpner vilkårene og går tilbake.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: Felles skanner som virker på iPhone

**Files:**
- Modify: `package.json`, `package-lock.json` (ny avhengighet)
- Create: `src/lib/scanner.ts`
- Create: `src/components/Scanner.tsx`
- Modify: `src/pages/Index.tsx` (full erstatning)
- Test: `src/test/scanner.test.ts`

**Interfaces:**
- Consumes: `useOrderSettings` (Task 6).
- Produces: `kodeFraSkann(raw: string): string | null`; `finnVare<T extends { qr_slug: string; sku: string | null }>(kode, varer): T | null`; komponenten `<Scanner open onOpenChange onCode title? description? />` der `onCode(kode) => string | null` (null = tatt imot og lukk; tekst = vis som hint og fortsett).

- [ ] **Step 1: Installer leseren**

Run: `npm install barcode-detector@^3.2.2`
Expected: `package.json` får `"barcode-detector": "^3.2.2"`, og `node_modules/zxing-wasm/reader/zxing_reader.wasm` finnes. Ikke installer `zxing-wasm` direkte – den må være samme versjon som `barcode-detector` bruker, og det sørger npm for når den kommer som avhengighet.

- [ ] **Step 2: Skriv testene**

Create `src/test/scanner.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { finnVare, kodeFraSkann } from "@/lib/scanner";

describe("kodeFraSkann", () => {
  it("les QR-lenkja frå hylla, uansett vertsnamn", () => {
    expect(kodeFraSkann("https://rorlager.vercel.app/r/PVC-110")).toBe("pvc-110");
    expect(kodeFraSkann("http://localhost:8080/r/pvc-110?x=1")).toBe("pvc-110");
    expect(kodeFraSkann("https://gammalt-domene.no/vare/kob-32")).toBe("kob-32");
  });

  it("godtek ein naken kode og talet i ein strekkode", () => {
    expect(kodeFraSkann(" PVC-110 ")).toBe("pvc-110");
    expect(kodeFraSkann("7020512345678")).toBe("7020512345678");
    expect(kodeFraSkann("BD.99117")).toBe("bd.99117");
  });

  it("avviser det som ikkje høyrer til rørlageret", () => {
    expect(kodeFraSkann("")).toBeNull();
    expect(kodeFraSkann("https://example.com/noe/annet")).toBeNull();
    expect(kodeFraSkann("WIFI:S:gjestenett;T:WPA;P:hemmelig;;")).toBeNull();
  });

  it("krasjar ikkje på ei øydelagd lenkje", () => {
    expect(kodeFraSkann("https://x.no/r/%E0%A4%A")).toBe("%e0%a4%a");
  });
});

describe("finnVare", () => {
  const varer = [
    { id: "1", qr_slug: "pvc-110", sku: "3100501" },
    { id: "2", qr_slug: "kob-32", sku: "BD-99117" },
  ];

  it("finn vara på QR-koden først", () => {
    expect(finnVare("pvc-110", varer)?.id).toBe("1");
  });

  it("så på varenummeret, utan omsyn til store bokstavar", () => {
    expect(finnVare("3100501", varer)?.id).toBe("1");
    expect(finnVare("bd-99117", varer)?.id).toBe("2");
  });

  it("gir null når ingenting passar", () => {
    expect(finnVare("finst-ikkje", varer)).toBeNull();
    expect(finnVare("", varer)).toBeNull();
  });
});
```

- [ ] **Step 3: Kjør testene og se at de feiler**

Run: `npx vitest run src/test/scanner.test.ts`
Expected: FAIL — «Failed to resolve import "@/lib/scanner"».

- [ ] **Step 4: Skriv tolkningen**

Create `src/lib/scanner.ts`:

```ts
// Tolkinga av det kameraet les. Reine funksjonar, så dei kan prøvast utan
// kamera. Sjølve lesaren ligg i components/Scanner.tsx.

/**
 * Plukkar ut koden frå det som blei lese. Stien /r/<kode> eller /vare/<kode>
 * blir kjend att uansett vertsnamn – etikettar trykte før appen fekk sitt
 * endelege domene skal framleis virke. Ein naken kode (det som står under
 * QR-en, eller talet i ein strekkode) er òg god nok.
 */
export function kodeFraSkann(raw: string): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;

  const path = text.match(/\/(?:r|vare)\/([^/?#\s]+)/i);
  if (path) {
    try {
      return decodeURIComponent(path[1]).toLowerCase();
    } catch {
      // Ei øydelagd %-koding skal gi koden som han står, ikkje ein krasj
      return path[1].toLowerCase();
    }
  }

  if (/^[a-z0-9._-]{2,64}$/i.test(text)) return text.toLowerCase();
  return null;
}

/** Vara ein kode peikar på: QR-koden først, så varenummeret. */
export function finnVare<T extends { qr_slug: string; sku: string | null }>(kode: string, varer: T[]): T | null {
  const k = (kode ?? "").trim().toLowerCase();
  if (!k) return null;
  return (
    varer.find((v) => (v.qr_slug ?? "").toLowerCase() === k) ??
    varer.find((v) => (v.sku ?? "").trim().toLowerCase() === k) ??
    null
  );
}
```

- [ ] **Step 5: Kjør testene og se at de passerer**

Run: `npx vitest run src/test/scanner.test.ts`
Expected: PASS.

- [ ] **Step 6: Skriv skannerkomponenten**

Create `src/components/Scanner.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { kodeFraSkann } from "@/lib/scanner";

type Detektor = { detect: (kjelde: HTMLVideoElement) => Promise<{ rawValue?: string }[]> };

type InnebygdKlasse = {
  new (o: { formats: string[] }): Detektor;
  getSupportedFormats?: () => Promise<string[]>;
};

const FORMATER = ["qr_code", "ean_13", "ean_8", "code_128", "code_39"] as const;

/**
 * Den innebygde lesaren der han finst (Chrome på Android), elles ein som køyrer
 * i nettlesaren. Safari på iPhone har ingen innebygd, og før denne fanst sa
 * framsida berre «bruk kameraappen» – som opnar uttakssida og ikkje bestillinga.
 *
 * WebAssembly-fila blir bygd inn av Vite og servert frå vårt eige domene.
 * Standardoppsettet hentar henne frå jsDelivr, og då ville kvar iPhone som opna
 * kameraet sendt eit kall til ein tredjepart. Ho blir berre lasta når den
 * innebygde manglar, så Android betaler ingenting.
 */
async function lagDetektor(): Promise<Detektor> {
  const Innebygd = (window as unknown as { BarcodeDetector?: InnebygdKlasse }).BarcodeDetector;
  if (Innebygd) {
    try {
      const støtta = (await Innebygd.getSupportedFormats?.()) ?? [...FORMATER];
      const formats = FORMATER.filter((f) => støtta.includes(f));
      return new Innebygd({ formats: formats.length ? formats : ["qr_code"] });
    } catch {
      /* fell gjennom til lesaren i nettlesaren */
    }
  }

  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import("barcode-detector/ponyfill"),
    import("zxing-wasm/reader/zxing_reader.wasm?url"),
  ]);
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path),
    },
  });
  return new BarcodeDetector({ formats: [...FORMATER] }) as unknown as Detektor;
}

type ScannerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Får koden. Returner null når ho blei teken imot – då stoppar kameraet – eller
   * ein tekst som blir vist medan kameraet held fram.
   */
  onCode: (kode: string) => string | null;
  title?: string;
  description?: string;
};

export function Scanner({
  open,
  onOpenChange,
  onCode,
  title = "Skann koden",
  description = "Hold kameraet mot QR-koden på hylla eller strekkoden på varen.",
}: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // Treffet skal ikkje starte kameraet på nytt, difor ein ref og ikkje ei avhengigheit
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setHint(null);
    setStarting(true);

    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    // Same avviste kode i kvart bilete skal ikkje spørje forelderen tretti
    // gonger i sekundet.
    let sisteAvviste = "";

    const stop = () => {
      stopped = true;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      // Utan stop() på kvar track blir kameralampa ståande på etter at dialogen er lukka
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      const video = videoRef.current;
      if (video) video.srcObject = null;
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStarting(false);
        setError("Nettleseren gir ikke tilgang til kamera her. Bruk søkefeltet, eller kameraappen på telefonen.");
        return;
      }

      let detektor: Detektor;
      try {
        detektor = await lagDetektor();
      } catch {
        setStarting(false);
        setError("Klarte ikke å starte kodelesingen. Bruk søkefeltet i stedet.");
        return;
      }
      if (stopped) return;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch {
        setStarting(false);
        setError("Fikk ikke tilgang til kameraet. Tillat kamera for denne siden, eller bruk søkefeltet.");
        return;
      }

      if (stopped || !videoRef.current) {
        stop();
        return;
      }

      const video = videoRef.current;
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        /* somme nettlesarar spelar av av seg sjølv – lesinga går uansett */
      }
      setStarting(false);

      const tick = async () => {
        if (stopped) return;
        try {
          const funn = await detektor.detect(video);
          const verdi = funn?.[0]?.rawValue;
          if (verdi) {
            const kode = kodeFraSkann(verdi);
            if (!kode) {
              setHint("Denne koden hører ikke til rørlageret. Prøv en annen.");
            } else if (kode !== sisteAvviste) {
              const svar = onCodeRef.current(kode);
              if (svar === null) {
                stop();
                return;
              }
              sisteAvviste = kode;
              setHint(svar);
            }
          }
        } catch {
          /* eitt bilete kan feile utan at skanninga er øydelagd */
        }
        if (!stopped) frame = requestAnimationFrame(tick);
      };

      frame = requestAnimationFrame(tick);
    })();

    return stop;
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : (
          <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-black">
            <video
              ref={videoRef}
              muted
              playsInline
              aria-label="Kamerabilde for skanning"
              className="h-full w-full object-cover"
            />
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-48 w-48 rounded-xl border-2 border-primary/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
            {starting ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-white" aria-hidden="true" />
                <span className="sr-only">Starter kameraet</span>
              </div>
            ) : null}
          </div>
        )}

        <p aria-live="polite" className="min-h-[1.25rem] text-sm text-warning-ink">
          {hint ?? ""}
        </p>

        <Button variant="outline" className="h-12 w-full text-base" onClick={() => onOpenChange(false)}>
          <X className="h-5 w-5" aria-hidden="true" />
          Avbryt
        </Button>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 7: Framsiden bruker den felles skanneren**

Replace the whole content of `src/pages/Index.tsx` with:

```tsx
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Camera, Lock, MapPin, PackageSearch, Search, X } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { CartBar } from "@/components/CartBar";
import { StockBadge } from "@/components/StatusBadge";
import { Scanner } from "@/components/Scanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { QK, fetchCatalog, fetchCategories } from "@/lib/orders";
import { useOrderSettings, useSettings } from "@/lib/settings";
import { filterAndSortPipes, matchesSearch, stockStatus } from "@/lib/stock";
import { kr, num, pipeLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CatalogItem } from "@/lib/types";

const DEFAULT_INTRO =
  "Skann QR-koden som henger på hylla, eller søk opp røret i lista under. Tast inn hvor mye du tar ut, og legg det i handlekurven.";

/* ------------------------------------------------------------------ */
/*  Varekort                                                           */
/* ------------------------------------------------------------------ */

// CatalogItem og ikkje PipeType: framsida les katalogvisninga, som ikkje har
// cost_price. Typen held innkjøpsprisen ute av kundesida for godt.
function PipeCard({ pipe, showPrice }: { pipe: CatalogItem; showPrice: boolean }) {
  const status = stockStatus(pipe);

  return (
    <Link
      to={`/r/${pipe.qr_slug}`}
      className="hm-card hm-card-interactive animate-fade-in flex flex-col gap-2 p-4 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-bold leading-tight text-foreground break-words">
            {pipeLabel(pipe.name, pipe.dimension)}
          </p>
          {pipe.category_name ? (
            <p className="text-xs text-muted-foreground truncate">{pipe.category_name}</p>
          ) : null}
        </div>
        <StockBadge status={status} />
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 pt-1">
        <div className="min-w-0 text-sm text-muted-foreground">
          {pipe.location ? (
            <span className="inline-flex items-center gap-1 truncate">
              <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
              {pipe.location}
            </span>
          ) : (
            <span className="tabular">
              {num(pipe.stock)} {pipe.unit} på lager
            </span>
          )}
        </div>
        {showPrice && pipe.price !== null ? (
          <p className="tabular shrink-0 text-sm font-semibold text-foreground">
            {kr(pipe.price)} kr/{pipe.unit}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

/* ------------------------------------------------------------------ */

export default function Index() {
  const navigate = useNavigate();
  const { data: settings } = useSettings();
  const { data: orderSettings } = useOrderSettings();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);

  // Katalogvisninga, ikkje pipe_types. Framsida blir opna av kundar utan
  // innlogging, og tabellen er stengd for dei – i tillegg til at ho ber på
  // innkjøpsprisen, som ingen kunde skal sjå.
  const typesQuery = useQuery({ queryKey: QK.catalog, queryFn: fetchCatalog });
  const categoriesQuery = useQuery({ queryKey: QK.categories, queryFn: fetchCategories });

  const showPrices = settings?.show_prices ?? true;
  const intro = settings?.intro_text?.trim() || DEFAULT_INTRO;

  // Kunden skal aldri sjå varer som er tekne ut av sortimentet
  const available = useMemo(
    () => (typesQuery.data ?? []).filter((t) => t.active),
    [typesQuery.data],
  );

  const visible = useMemo(
    () => filterAndSortPipes(available, { search, categoryId, onlyActive: true }),
    [available, search, categoryId],
  );

  // Ein kategori-chip som ikkje ville gitt eit einaste treff er berre i vegen
  const categories = useMemo(() => {
    const hits = available.filter((t) => matchesSearch(t, search));
    return (categoriesQuery.data ?? []).filter((c) => hits.some((t) => t.category_id === c.id));
  }, [categoriesQuery.data, available, search]);

  return (
    <div className="hm-page min-h-screen">
      <TopBar title="Rørlager" subtitle={settings?.company_name} showCart />

      <main className="mx-auto max-w-5xl px-3 pt-4 pb-36 sm:px-4">
        <p className="text-sm leading-relaxed text-muted-foreground">{intro}</p>

        <Button onClick={() => setScanOpen(true)} className="mt-4 h-16 w-full text-lg font-semibold [&_svg]:size-6">
          <Camera aria-hidden="true" />
          Skann QR-kode
        </Button>

        {/* Lenkja kjem berre når kontoret har opna for bestilling på nett */}
        {orderSettings?.accept_orders ? (
          <Button asChild variant="outline" className="mt-3 h-12 w-full text-base [&_svg]:size-5">
            <Link to="/bestill">
              <CalendarClock aria-hidden="true" />
              Bestill til henting
            </Link>
          </Button>
        ) : null}

        <div className="relative mt-5">
          <label htmlFor="sok-ror" className="sr-only">
            Søk etter rør
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="sok-ror"
            type="search"
            inputMode="search"
            autoComplete="off"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Søk på navn, dimensjon, varenr. eller hylle"
            className="h-12 pl-11 pr-11 text-base"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Tøm søket"
              className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {categories.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategoryId(null)}
              aria-pressed={categoryId === null}
              className={cn(
                "h-11 rounded-full border px-4 text-sm font-medium transition-colors",
                categoryId === null
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-muted",
              )}
            >
              Alle
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
                aria-pressed={categoryId === c.id}
                className={cn(
                  "inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors",
                  categoryId === c.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:bg-muted",
                )}
              >
                {/* Fargen admin har valt, som prikk og ikkje som bakgrunn: teksten
                    må vere lesbar same kva farge som blir plukka. */}
                {c.color ? (
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ring-foreground/20"
                    style={{ backgroundColor: c.color }}
                  />
                ) : null}
                {c.name}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4">
          {typesQuery.isLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-28 w-full rounded-lg" />
              ))}
            </div>
          ) : typesQuery.isError ? (
            <div className="hm-card p-6 text-center">
              <p className="font-semibold text-foreground">Klarte ikke å hente rørtypene</p>
              <p className="mt-1 text-sm text-muted-foreground">Sjekk at du har dekning, og prøv igjen.</p>
              <Button variant="outline" className="mt-4 h-12" onClick={() => typesQuery.refetch()}>
                Prøv igjen
              </Button>
            </div>
          ) : visible.length === 0 ? (
            <div className="hm-card flex flex-col items-center gap-2 p-8 text-center">
              <PackageSearch className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="font-semibold text-foreground">Ingen rør passer søket</p>
              <p className="text-sm text-muted-foreground">Prøv et annet ord, eller skann koden på hylla.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((pipe) => (
                <PipeCard key={pipe.id} pipe={pipe} showPrice={showPrices} />
              ))}
            </div>
          )}
        </div>

        <div className="mt-10 text-center">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            Adminpanel
          </Link>
        </div>
      </main>

      {/* Same skannar som butikken. Han går til varesida, som slår opp koden
          som QR-slug og deretter som varenummer. */}
      <Scanner
        open={scanOpen}
        onOpenChange={setScanOpen}
        title="Skann QR-koden"
        description="Hold kameraet mot koden som henger på hylla."
        onCode={(kode) => {
          setScanOpen(false);
          navigate(`/r/${encodeURIComponent(kode)}`);
          return null;
        }}
      />

      <CartBar />
    </div>
  );
}
```

- [ ] **Step 8: Bygg, typesjekk og lint**

Run: `npx vitest run && npx tsc -p tsconfig.app.json --noEmit; npx eslint src/lib/scanner.ts src/components/Scanner.tsx src/pages/Index.tsx && npm run build`
Expected: tester passerer; `tsc` bare grunnlinjefeilene; `eslint` uten feil på de tre filene (lint-feilen `no-explicit-any` på `Index.tsx` fra før er borte); bygget lager en `zxing_reader-*.wasm` under `dist/assets/`.

- [ ] **Step 9: Sjekk i nettleseren**

Start forhåndsvisningen (`preview_start` med navnet `vite`), åpne `/`, trykk «Skann QR-kode» og se at dialogen åpner med kamerafeltet eller en norsk feilmelding (i nettleserruten finnes det kanskje ikke noe kamera – meldingen «Fikk ikke tilgang til kameraet …» er da riktig). Sjekk konsollen for feil. Lukk dialogen.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json src/lib/scanner.ts src/components/Scanner.tsx src/pages/Index.tsx src/test/scanner.test.ts
git commit -m "Felles skanner som virker på iPhone

Safari har ikke BarcodeDetector, så framsiden ba iPhone-brukere bruke
kameraappen, og den åpner uttakssiden. Nå leser skanneren i nettleseren
der den innebygde mangler, med WebAssembly-fila servert fra eget domene
i stedet for jsDelivr. Den leser også strekkoder som treffer et
varenummer. Framsiden og butikken bruker samme komponent.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: Butikken på `/bestill`

**Files:**
- Create: `src/components/LegalFooter.tsx`
- Create: `src/components/PickupCartBar.tsx`
- Create: `src/pages/PickupShop.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `Scanner`, `finnVare` (Task 8); `usePickupCart`, `pickupLineFromItem` (Task 7); `linjesum`, `summer`, `prisInklMva` (Task 4); `visOrgnr`; `useOrderSettings`, `useSettings`; `fetchCatalog`, `fetchCategories`, `QK`.
- Produces: ruten `/bestill`; komponentene `LegalFooter` (ingen props) og `PickupCartBar` (ingen props) som Task 10, 12 og 13 bruker.

- [ ] **Step 1: Bunnteksten**

Create `src/components/LegalFooter.tsx`:

```tsx
import { Link } from "react-router-dom";
import { visOrgnr } from "@/lib/orgnr";
import { useSettings } from "@/lib/settings";

/**
 * Firmanamn og org.nr. nedst, med lenkjer til vilkåra og personvernet. Eit AS
 * skal vise kven det er, og ein kunde som bestiller skal kunne finne vilkåra
 * frå kvar side i flyten.
 */
export function LegalFooter() {
  const { data: s } = useSettings();
  const firma = s?.company_name?.trim() || "Hauge Maskin AS";

  return (
    <footer className="mx-auto mt-10 max-w-5xl px-3 pb-6 text-center text-xs text-muted-foreground sm:px-4">
      <p>
        {firma}
        {s?.org_number ? ` · Org.nr. ${visOrgnr(s.org_number)}` : ""}
      </p>
      <p className="mt-1 space-x-4">
        <Link to="/vilkar" className="underline underline-offset-2 hover:text-foreground">
          Vilkår
        </Link>
        <Link to="/personvern" className="underline underline-offset-2 hover:text-foreground">
          Personvern
        </Link>
      </p>
    </footer>
  );
}
```

- [ ] **Step 2: Kurvstripen**

Create `src/components/PickupCartBar.tsx`:

```tsx
import { useNavigate } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { kr } from "@/lib/format";
import { summer } from "@/lib/mva";
import { usePickupCart } from "@/lib/pickup-cart";
import { useSettings } from "@/lib/settings";

/** Stripa nedst i butikken. Summen står inkl. mva: kunden har ikkje valt enno. */
export function PickupCartBar() {
  const navigate = useNavigate();
  const { count, eks } = usePickupCart();
  const { data: settings } = useSettings();

  if (count === 0) return null;
  const { inkl } = summer([eks], settings?.vat_rate ?? 25);

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-3 pt-3 backdrop-blur"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {count} {count === 1 ? "vare" : "varer"}
          </p>
          <p className="tabular truncate text-sm text-muted-foreground">{kr(inkl)} kr inkl. mva</p>
        </div>
        <Button className="h-12 shrink-0 px-6 text-base font-semibold" onClick={() => navigate("/bestill/kasse")}>
          <ShoppingCart className="h-5 w-5" aria-hidden="true" />
          Til bestilling
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Butikken**

Create `src/pages/PickupShop.tsx`:

```tsx
// Butikken: søk eller skann, legg rør i bestillinga, og gå til kassen. Same
// katalog som framsida, men for den som bestiller til henting – ikkje den som
// står ved hylla og tek ut sjølv.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Camera, PackageSearch, Phone, Plus, Search, X } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { StockBadge } from "@/components/StatusBadge";
import { QuantityInput } from "@/components/QuantityInput";
import { Scanner } from "@/components/Scanner";
import { PickupCartBar } from "@/components/PickupCartBar";
import { LegalFooter } from "@/components/LegalFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QK, fetchCatalog, fetchCategories } from "@/lib/orders";
import { useOrderSettings, useSettings } from "@/lib/settings";
import { filterAndSortPipes, matchesSearch, stockStatus } from "@/lib/stock";
import { finnVare } from "@/lib/scanner";
import { pickupLineFromItem, usePickupCart } from "@/lib/pickup-cart";
import { linjesum, prisInklMva, summer } from "@/lib/mva";
import { kr, num, pipeLabel, qtyLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CatalogItem } from "@/lib/types";

const telLenke = (telefon: string) => `tel:${telefon.replace(/\s/g, "")}`;

/**
 * Pris per eining: inkl. mva stort, eks. mva under. Butikken vender seg til både
 * privatpersonar og bedrifter, og kunden har ikkje valt enno. Innstillinga «Vis
 * priser for kunden» gjeld ikkje her – ein privatperson skal sjå prisen før han
 * bestiller.
 */
function Pris({ price, unit, vat }: { price: number | null; unit: string; vat: number }) {
  if (price === null) return <p className="text-sm font-medium text-muted-foreground">Ring oss for pris</p>;
  return (
    <div className="text-right">
      <p className="tabular text-base font-bold text-foreground">
        {kr(prisInklMva(price, vat))} kr/{unit}
      </p>
      <p className="tabular text-xs text-muted-foreground">{kr(price)} eks. mva</p>
    </div>
  );
}

function VareKort({ vare, vat, onVelg }: { vare: CatalogItem; vat: number; onVelg: (v: CatalogItem) => void }) {
  const namn = pipeLabel(vare.name, vare.dimension);
  return (
    <button
      type="button"
      onClick={() => onVelg(vare)}
      aria-label={vare.price === null ? `${namn}, ring for pris` : `${namn}, legg i bestillingen`}
      className="hm-card hm-card-interactive animate-fade-in flex flex-col gap-2 p-4 text-left focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block break-words text-lg font-bold leading-tight text-foreground">{namn}</span>
          {vare.category_name ? (
            <span className="block truncate text-xs text-muted-foreground">{vare.category_name}</span>
          ) : null}
        </span>
        <StockBadge status={stockStatus(vare)} />
      </span>
      <span className="mt-auto flex items-end justify-between gap-3 pt-1">
        <span className="text-xs text-muted-foreground">{vare.sku ?? ""}</span>
        <Pris price={vare.price} unit={vare.unit} vat={vat} />
      </span>
    </button>
  );
}

function LeggTil({
  vare,
  vat,
  telefon,
  onFerdig,
}: {
  vare: CatalogItem;
  vat: number;
  telefon: string | null | undefined;
  onFerdig: () => void;
}) {
  const cart = usePickupCart();
  const [mengde, setMengde] = useState<number | null>(null);

  if (vare.price === null) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Denne varen har ingen pris ennå, så den kan ikke bestilles på nett. Ring oss, så finner vi ut av det.
        </p>
        {telefon ? (
          <Button asChild className="h-12 w-full text-base">
            <a href={telLenke(telefon)}>
              <Phone className="h-5 w-5" aria-hidden="true" />
              Ring {telefon}
            </a>
          </Button>
        ) : null}
      </div>
    );
  }

  const pris = vare.price;
  const iKurva = cart.lines.find((l) => l.pipe_type_id === vare.id)?.quantity ?? 0;
  const samla = Math.round(((mengde ?? 0) + iKurva) * 100) / 100;
  const forLite = mengde !== null && mengde > 0 && samla > vare.stock;

  const leggTil = () => {
    if (mengde === null || mengde <= 0) {
      toast.error("Skriv inn hvor mye du vil bestille");
      return;
    }
    const linje = pickupLineFromItem(vare, mengde);
    if (!linje) return;
    cart.add(linje);
    toast.success(`${qtyLabel(mengde, vare.unit)} ${pipeLabel(vare.name, vare.dimension)} lagt i bestillingen`);
    onFerdig();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">
          På lager:{" "}
          <span className="tabular font-semibold text-foreground">
            {num(vare.stock)} {vare.unit}
          </span>
        </span>
        <Pris price={pris} unit={vare.unit} vat={vat} />
      </div>

      <QuantityInput value={mengde} onChange={setMengde} unit={vare.unit} autoFocus />

      {iKurva > 0 ? (
        <p className="tabular rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          Du har allerede {qtyLabel(iKurva, vare.unit)} i bestillingen.
        </p>
      ) : null}

      {/* Åtvaring, ikkje sperre: kontoret sjekkar før bestillinga blir godkjend */}
      {forLite ? (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/15 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-ink" aria-hidden="true" />
          <p className="tabular text-sm text-warning-ink">
            Lageret viser {num(vare.stock)} {vare.unit}. Kontoret sjekker resten.
          </p>
        </div>
      ) : null}

      {mengde !== null && mengde > 0 ? (
        <p className="tabular text-right text-sm text-muted-foreground">
          Sum: <span className="font-semibold text-foreground">{kr(summer([linjesum(pris, mengde)], vat).inkl)} kr</span>{" "}
          inkl. mva
        </p>
      ) : null}

      <Button
        className="h-14 w-full text-lg font-semibold [&_svg]:size-6"
        disabled={mengde === null || mengde <= 0}
        onClick={leggTil}
      >
        <Plus aria-hidden="true" />
        Legg i bestillingen
      </Button>
    </div>
  );
}

export default function PickupShop() {
  const { data: settings } = useSettings();
  const orderSettings = useOrderSettings();
  const [sok, setSok] = useState("");
  const [kategori, setKategori] = useState<string | null>(null);
  const [skannar, setSkannar] = useState(false);
  const [valt, setValt] = useState<CatalogItem | null>(null);

  const katalog = useQuery({ queryKey: QK.catalog, queryFn: fetchCatalog });
  const kategoriar = useQuery({ queryKey: QK.categories, queryFn: fetchCategories });

  const vat = settings?.vat_rate ?? 25;
  const telefon = settings?.phone;

  const tilgjengelege = useMemo(() => (katalog.data ?? []).filter((t) => t.active), [katalog.data]);
  const synlege = useMemo(
    () => filterAndSortPipes(tilgjengelege, { search: sok, categoryId: kategori, onlyActive: true }),
    [tilgjengelege, sok, kategori],
  );
  const chips = useMemo(() => {
    const treff = tilgjengelege.filter((t) => matchesSearch(t, sok));
    return (kategoriar.data ?? []).filter((c) => treff.some((t) => t.category_id === c.id));
  }, [kategoriar.data, tilgjengelege, sok]);

  const onKode = (kode: string): string | null => {
    const vare = finnVare(kode, tilgjengelege);
    if (!vare) return `Fant ingen vare med koden ${kode}. Prøv søkefeltet.`;
    setSkannar(false);
    setValt(vare);
    return null;
  };

  const lastar = orderSettings.isPlaceholderData || orderSettings.isLoading;
  const open = orderSettings.data?.accept_orders === true;

  return (
    <div className="hm-page min-h-screen">
      <TopBar title="Bestill til henting" subtitle={settings?.company_name} back="/" />

      <main className="mx-auto max-w-5xl px-3 pt-4 pb-36 sm:px-4">
        {lastar ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-28 w-full rounded-lg" />
          </div>
        ) : !open ? (
          <div className="hm-card mx-auto flex max-w-lg flex-col items-center gap-3 p-8 text-center">
            <PackageSearch className="h-9 w-9 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-xl font-bold text-foreground">Vi tar ikke imot bestillinger på nett akkurat nå</h2>
            <p className="text-sm text-muted-foreground">
              {telefon ? `Ring oss på ${telefon}, så hjelper vi deg.` : "Ta kontakt med oss, så hjelper vi deg."}
            </p>
            {telefon ? (
              <Button asChild className="h-12 w-full text-base">
                <a href={telLenke(telefon)}>
                  <Phone className="h-5 w-5" aria-hidden="true" />
                  Ring {telefon}
                </a>
              </Button>
            ) : null}
            <Button asChild variant="ghost" className="h-12 w-full text-base">
              <Link to="/">Til rørlageret</Link>
            </Button>
          </div>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Søk eller skann, legg rørene i bestillingen, og hent dem på lageret. Du får e-post når de er klare.
            </p>

            <div className="relative mt-4">
              <label htmlFor="sok-bestill" className="sr-only">
                Søk etter rør
              </label>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="sok-bestill"
                type="search"
                inputMode="search"
                autoComplete="off"
                value={sok}
                onChange={(e) => setSok(e.target.value)}
                placeholder="Søk på navn, dimensjon eller varenummer"
                className="h-14 pl-11 pr-24 text-base"
              />
              <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1">
                {sok ? (
                  <button
                    type="button"
                    onClick={() => setSok("")}
                    aria-label="Tøm søket"
                    className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSkannar(true)}
                  aria-label="Skann QR-kode eller strekkode"
                  className="flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Camera className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>

            {chips.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setKategori(null)}
                  aria-pressed={kategori === null}
                  className={cn(
                    "h-11 rounded-full border px-4 text-sm font-medium transition-colors",
                    kategori === null
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:bg-muted",
                  )}
                >
                  Alle
                </button>
                {chips.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setKategori(kategori === c.id ? null : c.id)}
                    aria-pressed={kategori === c.id}
                    className={cn(
                      "h-11 rounded-full border px-4 text-sm font-medium transition-colors",
                      kategori === c.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-foreground hover:bg-muted",
                    )}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4">
              {katalog.isLoading ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-28 w-full rounded-lg" />
                  ))}
                </div>
              ) : katalog.isError ? (
                <div className="hm-card p-6 text-center">
                  <p className="font-semibold text-foreground">Klarte ikke å hente varene</p>
                  <p className="mt-1 text-sm text-muted-foreground">Sjekk at du har dekning, og prøv igjen.</p>
                  <Button variant="outline" className="mt-4 h-12" onClick={() => katalog.refetch()}>
                    Prøv igjen
                  </Button>
                </div>
              ) : synlege.length === 0 ? (
                <div className="hm-card flex flex-col items-center gap-2 p-8 text-center">
                  <PackageSearch className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                  <p className="font-semibold text-foreground">Ingen rør passer søket</p>
                  <p className="text-sm text-muted-foreground">Prøv et annet ord, eller skann koden.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {synlege.map((vare) => (
                    <VareKort key={vare.id} vare={vare} vat={vat} onVelg={setValt} />
                  ))}
                </div>
              )}
            </div>

            <p className="mt-8 text-center text-sm text-muted-foreground">
              Står du ved hylla og tar ut selv?{" "}
              <Link to="/" className="font-medium text-foreground underline underline-offset-2">
                Gå til selvbetjent uttak
              </Link>
            </p>
          </>
        )}
      </main>

      <LegalFooter />

      <Scanner open={skannar} onOpenChange={setSkannar} onCode={onKode} />

      <Dialog open={valt !== null} onOpenChange={(o) => !o && setValt(null)}>
        <DialogContent className="max-w-md">
          {valt ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">{pipeLabel(valt.name, valt.dimension)}</DialogTitle>
                <DialogDescription>
                  {[valt.category_name, valt.sku ? `Varenr. ${valt.sku}` : null].filter(Boolean).join(" · ") ||
                    "Legg i bestillingen"}
                </DialogDescription>
              </DialogHeader>
              {/* key: ny vare, blankt ark – mengda frå førre vare skal ikkje henge att */}
              <LeggTil key={valt.id} vare={valt} vat={vat} telefon={telefon} onFerdig={() => setValt(null)} />
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {open ? <PickupCartBar /> : null}
    </div>
  );
}
```

- [ ] **Step 4: Ruten**

I `src/App.tsx`: legg til `import PickupShop from "./pages/PickupShop";` etter `import Personvern from "./pages/Personvern";`, og legg til ruten rett etter `<Route path="/personvern" element={<Personvern />} />`:

```tsx
            {/* Bestilling til henting: butikken, kassen og kvitteringa */}
            <Route path="/bestill" element={<PickupShop />} />
```

- [ ] **Step 5: Typesjekk, lint og bygg**

Run: `npx tsc -p tsconfig.app.json --noEmit; npx eslint src/pages/PickupShop.tsx src/components/PickupCartBar.tsx src/components/LegalFooter.tsx src/App.tsx && npm run build`
Expected: bare grunnlinjefeilene fra `tsc`, ingen eslint-feil, bygget går gjennom.

- [ ] **Step 6: Sjekk i nettleseren**

Med forhåndsvisningen i gang: åpne `/bestill`. Mot den levende basen (uten migrasjonen) skal siden vise «Vi tar ikke imot bestillinger på nett akkurat nå». Sjekk konsollen: ingen feil utover at visningen `pipe_public_order_settings` ikke finnes (404 fra PostgREST er forventet før migrasjonen). Sjekk også at `/` ikke viser «Bestill til henting».

- [ ] **Step 7: Commit**

```bash
git add src/components/LegalFooter.tsx src/components/PickupCartBar.tsx src/pages/PickupShop.tsx src/App.tsx
git commit -m "Bestilling: butikken på /bestill

Søkefelt med kamera i, kategorier og varekort med pris inkl. og eks.
mva. Et treff åpner varen med antallsfeltet klart. Varer uten pris
vises, men kan ikke bestilles. Er bestilling på nett av, sier siden
«ring oss».

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: Kassen på `/bestill/kasse`

**Files:**
- Create: `src/pages/PickupCheckout.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `usePickupCart`, `clearPickupCart`, `lesKunde`, `skrivKunde`, `lesUtkast`, `skrivUtkast`, `slettUtkast` (Task 7); `TOMT_SKJEMA`, `osloIDag`, `leggTilDager`, `sjekkSkjema`, `tilInnsending`, `KasseSkjema` (Task 6); `submitPickupOrder`, `requestEmailsInBackground` (Task 6); `linjesum`, `summer`, `prisInklMva` (Task 4); `ANGRERETT_KORT` (Task 5); `LegalFooter` (Task 9).
- Produces: ruten `/bestill/kasse`. Etter innsending navigerer den til `/bestilling/<id>` (Task 12).

- [ ] **Step 1: Skriv kassen**

Create `src/pages/PickupCheckout.tsx`:

```tsx
// Kassen: kurva med dagens prisar, når kunden hentar, kven som bestiller, og
// «Bestill med betalingsplikt». Reglane er dei same som i basen – skjemaet seier
// frå med ein gong, basen avgjer.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, CalendarDays, Clock, Loader2, PackageSearch, Send, Trash2, User } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { QuantityInput } from "@/components/QuantityInput";
import { LegalFooter } from "@/components/LegalFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { QK, fetchCatalog } from "@/lib/orders";
import { useOrderSettings, useSettings } from "@/lib/settings";
import {
  clearPickupCart,
  lesKunde,
  lesUtkast,
  skrivKunde,
  skrivUtkast,
  slettUtkast,
  usePickupCart,
} from "@/lib/pickup-cart";
import {
  TOMT_SKJEMA,
  leggTilDager,
  osloIDag,
  sjekkSkjema,
  tilInnsending,
  type Feltfeil,
  type KasseSkjema,
} from "@/lib/pickup-form";
import { requestEmailsInBackground, submitPickupOrder } from "@/lib/pickup-orders";
import { linjesum, prisInklMva, summer } from "@/lib/mva";
import { ANGRERETT_KORT } from "@/lib/vilkar";
import { checkRateLimit } from "@/lib/rate-limiter";
import { kr, num, pipeLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

function Felt({
  label,
  htmlFor,
  required,
  hint,
  feil,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  feil?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label} {required ? <span className="text-destructive">*</span> : null}
      </Label>
      {children}
      {feil ? (
        <p id={`${htmlFor}-feil`} className="text-xs font-medium text-destructive">
          {feil}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Ein stor knapp i eit par. aria-pressed, så skjermlesaren høyrer kva som er valt. */
function Valg({
  id,
  valt,
  onClick,
  ikon,
  tittel,
  tekst,
}: {
  id?: string;
  valt: boolean;
  onClick: () => void;
  ikon: ReactNode;
  tittel: string;
  tekst?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      aria-pressed={valt}
      onClick={onClick}
      className={cn(
        "flex min-h-[4.5rem] flex-1 items-start gap-3 rounded-lg border-2 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        valt ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted",
      )}
    >
      <span className={cn("mt-0.5 [&_svg]:size-5", valt ? "text-primary" : "text-muted-foreground")} aria-hidden="true">
        {ikon}
      </span>
      <span className="min-w-0">
        <span className="block text-base font-semibold text-foreground">{tittel}</span>
        {tekst ? <span className="block text-xs text-muted-foreground">{tekst}</span> : null}
      </span>
    </button>
  );
}

export default function PickupCheckout() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const cart = usePickupCart();
  const { data: settings } = useSettings();
  const orderSettings = useOrderSettings();
  const katalog = useQuery({ queryKey: QK.catalog, queryFn: fetchCatalog });

  const [skjema, setSkjema] = useState<KasseSkjema>(() => ({ ...TOMT_SKJEMA, ...lesKunde(), ...lesUtkast() }));
  const [feil, setFeil] = useState<Feltfeil | null>(null);
  const [sender, setSender] = useState(false);
  // Etter innsending er kurva tom med vilje – då skal vakta under ikkje slå til
  const sendt = useRef(false);

  const iDag = osloIDag();
  const vat = settings?.vat_rate ?? 25;
  const kreverTelefon = settings?.require_phone ?? true;
  const frist = orderSettings.data?.payment_terms_days ?? 14;
  // Før kunden har valt, blir prisane viste med mva
  const medMva = skjema.kundetype !== "bedrift";

  useEffect(() => {
    if (cart.count === 0 && !sendt.current) navigate("/bestill", { replace: true });
  }, [cart.count, navigate]);

  useEffect(() => {
    skrivUtkast(skjema);
  }, [skjema]);

  const set = <K extends keyof KasseSkjema>(k: K, v: KasseSkjema[K]) => {
    setSkjema((s) => ({ ...s, [k]: v }));
    setFeil((f) => (f?.felt === k ? null : f));
  };

  /*
   * Dagens pris, ikkje prisen då vara blei lagd i kurva. Ein privatperson skal
   * sjå totalprisen han faktisk blir fakturert for, og basen reknar med prisen
   * som gjeld når bestillinga kjem inn.
   */
  const linjer = useMemo(() => {
    const kart = new Map((katalog.data ?? []).map((t) => [t.id, t]));
    return cart.lines.map((l) => {
      const vare = kart.get(l.pipe_type_id);
      const problem = !katalog.data
        ? null
        : !vare || !vare.active
          ? "Varen finnes ikke lenger i katalogen"
          : vare.price === null
            ? "Varen har ikke lenger pris og kan ikke bestilles på nett"
            : null;
      return { ...l, pris: vare?.price ?? l.price, lager: vare?.stock ?? null, problem };
    });
  }, [cart.lines, katalog.data]);

  const harProblem = linjer.some((l) => l.problem);
  const sum = summer(
    linjer.filter((l) => !l.problem).map((l) => linjesum(l.pris, l.quantity)),
    vat,
  );
  const feilFor = (felt: keyof KasseSkjema) => (feil?.felt === felt ? feil.melding : undefined);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sender) return;
    if (harProblem) {
      toast({ title: "Fjern varene som ikke kan bestilles", variant: "destructive" });
      return;
    }
    const f = sjekkSkjema(skjema, { kreverTelefon, iDag });
    if (f) {
      setFeil(f);
      toast({ title: f.melding, variant: "destructive" });
      document.getElementById(`kasse-${f.felt}`)?.focus();
      return;
    }
    const grense = checkRateLimit("pipe-bestilling", 3, 60_000);
    if (!grense.allowed) {
      const sekund = Math.max(1, Math.ceil(grense.retryAfterMs / 1000));
      toast({ title: "Vent litt", description: `Prøv igjen om ${sekund} sekunder.`, variant: "destructive" });
      return;
    }

    setSender(true);
    try {
      const { id } = await submitPickupOrder(tilInnsending(skjema, cart.lines, iDag));
      // Kvitteringa og varselet til kontoret. Ventar ikkje: bestillinga er lagra,
      // og ein e-post som feilar skal aldri kunne stoppe henne.
      requestEmailsInBackground(id);
      skrivKunde(skjema);
      slettUtkast();
      sendt.current = true;
      clearPickupCart();
      navigate(`/bestilling/${id}`, { replace: true });
    } catch (err) {
      // Meldinga frå basen er norsk og skriven for kunden. Kurva og skjemaet
      // blir ståande, så kunden kan prøve på nytt utan å taste alt om att.
      toast({
        title: "Bestillingen ble ikke sendt",
        description: err instanceof Error ? err.message : "Ukjent feil. Prøv igjen.",
        variant: "destructive",
      });
      setSender(false);
    }
  };

  if (orderSettings.isPlaceholderData || orderSettings.isLoading) {
    return (
      <div className="hm-page min-h-screen">
        <TopBar title="Bestilling" back="/bestill" />
        <main className="mx-auto max-w-2xl space-y-3 px-3 pt-4 sm:px-4">
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-56 w-full rounded-lg" />
        </main>
      </div>
    );
  }

  if (!orderSettings.data?.accept_orders) {
    return (
      <div className="hm-page min-h-screen">
        <TopBar title="Bestilling" back="/" />
        <main className="mx-auto max-w-lg px-3 pt-6 sm:px-4">
          <div className="hm-card flex flex-col items-center gap-3 p-8 text-center">
            <PackageSearch className="h-9 w-9 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-xl font-bold text-foreground">Vi tar ikke imot bestillinger på nett akkurat nå</h2>
            <p className="text-sm text-muted-foreground">
              {settings?.phone ? `Ring oss på ${settings.phone}, så hjelper vi deg.` : "Ta kontakt med oss, så hjelper vi deg."}
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="hm-page min-h-screen">
      <TopBar title="Bestilling" back="/bestill" />

      <main className="mx-auto max-w-2xl px-3 pt-4 pb-10 sm:px-4">
        <form onSubmit={send} className="space-y-4" noValidate>
          {/* ------------------------------------------------------------ kurva */}
          <section className="hm-card p-4" aria-labelledby="kasse-varer">
            <h2 id="kasse-varer" className="text-base font-semibold text-foreground">
              Bestillingen
            </h2>
            <ul className="mt-2 divide-y divide-border">
              {linjer.map((l) => {
                const eks = linjesum(l.pris, l.quantity);
                return (
                  <li key={l.pipe_type_id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-foreground">{pipeLabel(l.name, l.dimension)}</p>
                        <p className="tabular text-xs text-muted-foreground">
                          {kr(medMva ? prisInklMva(l.pris, vat) : l.pris)} kr/{l.unit} {medMva ? "inkl. mva" : "eks. mva"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => cart.remove(l.pipe_type_id)}
                        aria-label={`Fjern ${pipeLabel(l.name, l.dimension)}`}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                      >
                        <Trash2 className="h-5 w-5" aria-hidden="true" />
                      </button>
                    </div>

                    {l.problem ? (
                      <p className="mt-2 text-sm font-medium text-destructive">{l.problem}. Fjern den for å gå videre.</p>
                    ) : (
                      <>
                        <div className="mt-2">
                          <QuantityInput
                            value={l.quantity}
                            unit={l.unit}
                            presets={[]}
                            onChange={(v) => {
                              if (v !== null && v > 0) cart.setQuantity(l.pipe_type_id, v);
                            }}
                          />
                        </div>
                        {l.lager !== null && l.quantity > l.lager ? (
                          <p className="tabular mt-2 text-xs text-warning-ink">
                            Lageret viser {num(l.lager)} {l.unit}. Kontoret sjekker resten.
                          </p>
                        ) : null}
                        <p className="tabular mt-1 text-right text-sm font-semibold text-foreground">
                          {kr(medMva ? summer([eks], vat).inkl : eks)} kr
                        </p>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
            <Link to="/bestill" className="mt-1 inline-block text-sm font-medium text-primary hover:underline">
              Legg til flere varer
            </Link>
          </section>

          {/* ------------------------------------------------------------- når */}
          <section className="hm-card space-y-3 p-4" aria-labelledby="kasse-naar">
            <h2 id="kasse-naar" className="text-base font-semibold text-foreground">
              Når henter du?
            </h2>
            <div role="group" aria-labelledby="kasse-naar" className="flex flex-col gap-2 sm:flex-row">
              <Valg
                id="kasse-henterNaa"
                valt={skjema.henterNaa === true}
                onClick={() => set("henterNaa", true)}
                ikon={<Clock />}
                tittel="Henter nå"
                tekst="I dag, så snart kontoret har godkjent"
              />
              <Valg
                valt={skjema.henterNaa === false}
                onClick={() => set("henterNaa", false)}
                ikon={<CalendarDays />}
                tittel="Velg dag"
                tekst="Inntil 90 dager fram"
              />
            </div>
            {feilFor("henterNaa") ? <p className="text-xs font-medium text-destructive">{feilFor("henterNaa")}</p> : null}
            {skjema.henterNaa === true && settings?.pickup_note ? (
              <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{settings.pickup_note}</p>
            ) : null}
            {skjema.henterNaa === false ? (
              <Felt label="Hentedag" htmlFor="kasse-hentedag" required feil={feilFor("hentedag")}>
                <Input
                  id="kasse-hentedag"
                  type="date"
                  min={iDag}
                  max={leggTilDager(iDag, 90)}
                  value={skjema.hentedag}
                  onChange={(e) => set("hentedag", e.target.value)}
                  aria-invalid={Boolean(feilFor("hentedag"))}
                  className="h-12 text-base"
                />
              </Felt>
            ) : null}
          </section>

          {/* ------------------------------------------------------------- kven */}
          <section className="hm-card space-y-4 p-4" aria-labelledby="kasse-hvem">
            <h2 id="kasse-hvem" className="text-base font-semibold text-foreground">
              Hvem bestiller?
            </h2>
            <div role="group" aria-labelledby="kasse-hvem" className="flex gap-2">
              <Valg
                id="kasse-kundetype"
                valt={skjema.kundetype === "privat"}
                onClick={() => set("kundetype", "privat")}
                ikon={<User />}
                tittel="Privatperson"
              />
              <Valg
                valt={skjema.kundetype === "bedrift"}
                onClick={() => set("kundetype", "bedrift")}
                ikon={<Building2 />}
                tittel="Bedrift"
              />
            </div>
            {feilFor("kundetype") ? <p className="text-xs font-medium text-destructive">{feilFor("kundetype")}</p> : null}

            {skjema.kundetype === "bedrift" ? (
              <>
                <Felt label="Firma" htmlFor="kasse-firma" required feil={feilFor("firma")}>
                  <Input
                    id="kasse-firma"
                    autoComplete="organization"
                    value={skjema.firma}
                    onChange={(e) => set("firma", e.target.value)}
                    aria-invalid={Boolean(feilFor("firma"))}
                    className="h-12 text-base"
                  />
                </Felt>
                <Felt
                  label="Organisasjonsnummer"
                  htmlFor="kasse-orgnr"
                  required
                  hint="Ni siffer. Vi fakturerer firmaet på dette nummeret."
                  feil={feilFor("orgnr")}
                >
                  <Input
                    id="kasse-orgnr"
                    inputMode="numeric"
                    placeholder="999 999 999"
                    value={skjema.orgnr}
                    onChange={(e) => set("orgnr", e.target.value)}
                    aria-invalid={Boolean(feilFor("orgnr"))}
                    className="h-12 text-base"
                  />
                </Felt>
                <Felt label="Kontaktperson" htmlFor="kasse-navn" required feil={feilFor("navn")}>
                  <Input
                    id="kasse-navn"
                    autoComplete="name"
                    value={skjema.navn}
                    onChange={(e) => set("navn", e.target.value)}
                    aria-invalid={Boolean(feilFor("navn"))}
                    className="h-12 text-base"
                  />
                </Felt>
              </>
            ) : skjema.kundetype === "privat" ? (
              <>
                <Felt label="Navn" htmlFor="kasse-navn" required feil={feilFor("navn")}>
                  <Input
                    id="kasse-navn"
                    autoComplete="name"
                    value={skjema.navn}
                    onChange={(e) => set("navn", e.target.value)}
                    aria-invalid={Boolean(feilFor("navn"))}
                    className="h-12 text-base"
                  />
                </Felt>
                <Felt label="Gateadresse" htmlFor="kasse-gate" required hint="Fakturaen sendes hit." feil={feilFor("gate")}>
                  <Input
                    id="kasse-gate"
                    autoComplete="address-line1"
                    value={skjema.gate}
                    onChange={(e) => set("gate", e.target.value)}
                    aria-invalid={Boolean(feilFor("gate"))}
                    className="h-12 text-base"
                  />
                </Felt>
                <div className="grid grid-cols-[7rem_1fr] gap-3">
                  <Felt label="Postnr." htmlFor="kasse-postnr" required feil={feilFor("postnr")}>
                    <Input
                      id="kasse-postnr"
                      inputMode="numeric"
                      autoComplete="postal-code"
                      maxLength={4}
                      value={skjema.postnr}
                      onChange={(e) => set("postnr", e.target.value)}
                      aria-invalid={Boolean(feilFor("postnr"))}
                      className="h-12 text-base"
                    />
                  </Felt>
                  <Felt label="Sted" htmlFor="kasse-sted" required feil={feilFor("sted")}>
                    <Input
                      id="kasse-sted"
                      autoComplete="address-level2"
                      value={skjema.sted}
                      onChange={(e) => set("sted", e.target.value)}
                      aria-invalid={Boolean(feilFor("sted"))}
                      className="h-12 text-base"
                    />
                  </Felt>
                </div>
              </>
            ) : null}

            {skjema.kundetype ? (
              <>
                <Felt label="Telefon" htmlFor="kasse-telefon" required={kreverTelefon} feil={feilFor("telefon")}>
                  <Input
                    id="kasse-telefon"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={skjema.telefon}
                    onChange={(e) => set("telefon", e.target.value)}
                    aria-invalid={Boolean(feilFor("telefon"))}
                    className="h-12 text-base"
                  />
                </Felt>
                <Felt
                  label="E-post"
                  htmlFor="kasse-epost"
                  required
                  hint="Kvitteringen og beskjeden om henting kommer hit."
                  feil={feilFor("epost")}
                >
                  <Input
                    id="kasse-epost"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={skjema.epost}
                    onChange={(e) => set("epost", e.target.value)}
                    aria-invalid={Boolean(feilFor("epost"))}
                    className="h-12 text-base"
                  />
                </Felt>
              </>
            ) : null}
          </section>

          {/* ------------------------------------------------------- kommentar */}
          <section className="hm-card p-4">
            <Felt label="Kommentar" htmlFor="kasse-kommentar" hint="Valgfritt. Noe kontoret bør vite?" feil={feilFor("kommentar")}>
              <Textarea
                id="kasse-kommentar"
                rows={3}
                value={skjema.kommentar}
                onChange={(e) => set("kommentar", e.target.value)}
                className="text-base"
              />
            </Felt>
          </section>

          {/* ---------------------------------------------------- oppsummering */}
          <section className="hm-card p-4" aria-labelledby="kasse-sum">
            <h2 id="kasse-sum" className="text-base font-semibold text-foreground">
              Oppsummering
            </h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Sum eks. mva</dt>
                <dd className="tabular text-foreground">{kr(sum.eks)} kr</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Mva {num(vat)} %</dt>
                <dd className="tabular text-foreground">{kr(sum.mva)} kr</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
                <dt className="text-base font-semibold text-foreground">Sum inkl. mva</dt>
                <dd className="tabular text-2xl font-bold text-foreground">{kr(sum.inkl)} kr</dd>
              </div>
            </dl>
            <p className="mt-3 text-sm text-muted-foreground">Betaling: faktura, {frist} dager.</p>
            {skjema.kundetype !== "bedrift" ? (
              <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                {ANGRERETT_KORT.join(" ")}{" "}
                <Link to="/vilkar" className="font-medium text-foreground underline underline-offset-2">
                  Les vilkårene
                </Link>
                .
              </p>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                <Link to="/vilkar" className="underline underline-offset-2">
                  Vilkårene
                </Link>{" "}
                gjelder for bestillingen.
              </p>
            )}
          </section>

          <Button type="submit" disabled={sender || harProblem} className="h-16 w-full text-lg font-semibold [&_svg]:size-6">
            {sender ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Sender …
              </>
            ) : (
              <>
                <Send aria-hidden="true" />
                Bestill med betalingsplikt
              </>
            )}
          </Button>

          {/* Informasjonsplikta i GDPR artikkel 13 gjeld på innsamlingstidspunktet */}
          <p className="pb-2 text-center text-xs text-muted-foreground">
            Vi lagrer navn, kontaktopplysninger og bestillingen for å kunne gjennomføre og fakturere den.{" "}
            <Link to="/personvern" className="underline underline-offset-2">
              Slik behandler vi opplysningene
            </Link>
            .
          </p>
        </form>
      </main>

      <LegalFooter />
    </div>
  );
}
```

- [ ] **Step 2: Ruten**

I `src/App.tsx`: legg til `import PickupCheckout from "./pages/PickupCheckout";` etter importen av `PickupShop`, og ruten rett etter `/bestill`-ruten:

```tsx
            <Route path="/bestill/kasse" element={<PickupCheckout />} />
```

- [ ] **Step 3: Typesjekk, lint og bygg**

Run: `npx tsc -p tsconfig.app.json --noEmit; npx eslint src/pages/PickupCheckout.tsx src/App.tsx && npm run build`
Expected: bare grunnlinjefeilene, ingen eslint-feil, bygget går gjennom.

- [ ] **Step 4: Commit**

```bash
git add src/pages/PickupCheckout.tsx src/App.tsx
git commit -m "Bestilling: kassen på /bestill/kasse

Kurven med dagens priser, «Henter nå» eller en valgt dag, privat eller
bedrift, sum eks. og inkl. mva, betalingsvilkåret og angreretten for
privatpersoner. Knappen heter «Bestill med betalingsplikt». Skjemaet
lagres mens det fylles ut, og e-posten bes om uten å vente, så en
e-post som feiler aldri kan stoppe bestillingen.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: PDF-en

**Files:**
- Create: `src/lib/pickup-pdf.ts`
- Test: `src/test/pickup-pdf.test.ts`

**Interfaces:**
- Consumes: `drawHeader`, `drawFooter`, `safeName`, fargene og `MARGIN` fra `@/lib/order-pdf`; `PickupOrder` (Task 6); `summer`, `prisInklMva` (Task 4); `visOrgnr`; `angrerettAvsnitt`, `angreskjema`, `Selger` (Task 5); `PICKUP_STATUS_LABEL`.
- Produces: `PickupPdfDoc = { order: PickupOrder; company: CompanyInfo; selger: Selger; vatRate: number }`; `buildPickupPDF(doc): jsPDF`; `downloadPickupPDF(doc): void`.

- [ ] **Step 1: Skriv testen**

Create `src/test/pickup-pdf.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPickupPDF } from "@/lib/pickup-pdf";
import type { PickupOrder } from "@/lib/pickup-orders";

const bestilling = (over: Partial<PickupOrder> = {}): PickupOrder => ({
  id: "x",
  order_number: 1042,
  created_at: "2026-09-24T10:00:00Z",
  status: "ny",
  pickup_date: "2026-10-03",
  pickup_now: false,
  customer_type: "privat",
  customer_name: "Ola Privat",
  customer_email: "ola@privat.no",
  customer_phone: "900 00 000",
  company: null,
  org_number: null,
  billing_address: "Bakkevegen 3, 5700 Voss",
  comment: "Henter med tilhenger",
  customer_message: null,
  handled_at: null,
  total: 1350,
  lines: [
    { name: "PVC 110", dimension: null, sku: "B-110", unit: "m", quantity: 12.5, unit_price: 100, line_total: 1250 },
    { name: "Bend", dimension: null, sku: null, unit: "stk", quantity: 4, unit_price: 25, line_total: 100 },
  ],
  emails: {},
  ...over,
});

const doc = (o: PickupOrder) =>
  buildPickupPDF({
    order: o,
    company: { name: "Hauge Maskin AS", orgNumber: "974760673" },
    selger: { navn: "Hauge Maskin AS", adresse: "Industrivegen 1", epost: "post@hauge.no", betalingsfrist: 14 },
    vatRate: 25,
  });

const bedrift = () =>
  bestilling({ customer_type: "bedrift", company: "Firma AS", org_number: "974760673", billing_address: null });

describe("PDF-en for bestillinga", () => {
  it("har ingen angrerettsside for bedrifter", () => {
    expect(doc(bedrift()).getNumberOfPages()).toBe(1);
  });

  it("får eigne sider med angrerett og angreskjema for privatpersonar", () => {
    // Større enn, ikkje lik 2: skjemaet kan brekke over på ei tredje side
    // dersom teksten blir lengre, og det er ikkje ein feil.
    expect(doc(bestilling()).getNumberOfPages()).toBeGreaterThan(doc(bedrift()).getNumberOfPages());
  });

  it("tåler mange linjer og brekk over fleire sider", () => {
    const mange = Array.from({ length: 60 }, (_, i) => ({
      name: `Rør nr. ${i}`,
      dimension: null,
      sku: null,
      unit: "m",
      quantity: 1,
      unit_price: 10,
      line_total: 10,
    }));
    expect(doc(bestilling({ customer_type: "bedrift", company: "Firma AS", lines: mange })).getNumberOfPages()).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Kjør testen og se at den feiler**

Run: `npx vitest run src/test/pickup-pdf.test.ts`
Expected: FAIL — «Failed to resolve import "@/lib/pickup-pdf"».

- [ ] **Step 3: Skriv PDF-byggeren**

Create `src/lib/pickup-pdf.ts`:

```ts
// PDF-en for éi bestilling. Same dokument for kunden og kontoret. Bygd i
// nettlesaren, aldri på tenaren – to byggjarar av same dokument ville glidd frå
// kvarandre.
//
// For privatpersonar kjem angreretten og angreskjemaet på ei eiga side. Ein
// forbrukar skal ha dei på eit varig medium, og ein PDF kunden lastar ned er
// det, sjølv før e-post er sett opp.

import jsPDF from "jspdf";
import {
  BLACK,
  GREY,
  HAIRLINE,
  MARGIN,
  RED,
  ZEBRA,
  drawFooter,
  drawHeader,
  safeName,
  setDraw,
  setFill,
  setText,
  type CompanyInfo,
} from "@/lib/order-pdf";
import { dateTime, kr, longDate, num, pipeLabel } from "@/lib/format";
import { prisInklMva, summer } from "@/lib/mva";
import { visOrgnr } from "@/lib/orgnr";
import { angreskjema, angrerettAvsnitt, type Selger } from "@/lib/vilkar";
import { PICKUP_STATUS_LABEL } from "@/lib/types";
import type { PickupOrder } from "@/lib/pickup-orders";

export type PickupPdfDoc = {
  order: PickupOrder;
  company: CompanyInfo;
  selger: Selger;
  vatRate: number;
};

export function buildPickupPDF({ order, company, selger, vatRate }: PickupPdfDoc) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const contentW = pw - MARGIN * 2;
  const bottomLimit = ph - 26;
  const privat = order.customer_type === "privat";

  let y = drawHeader(doc, "BESTILLING", company, `Nr. ${order.order_number}`);

  const newPage = () => {
    doc.addPage();
    y = MARGIN + 4;
  };
  const ensure = (needed: number) => {
    if (y + needed > bottomLimit) newPage();
  };

  const sectionTitle = (title: string) => {
    ensure(14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    setText(doc, BLACK);
    doc.text(title.toUpperCase(), MARGIN, y);
    setDraw(doc, RED);
    doc.setLineWidth(0.6);
    doc.line(MARGIN, y + 1.8, MARGIN + doc.getTextWidth(title.toUpperCase()), y + 1.8);
    doc.setLineWidth(0.2);
    y += 7.5;
  };

  // Tomme felt blir hoppa over – ei linje med berre «–» seier ingenting
  const row = (label: string, value: string | null | undefined) => {
    if (!value) return;
    ensure(8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    setText(doc, GREY);
    doc.text(label, MARGIN, y);
    doc.setFont("helvetica", "bold");
    setText(doc, BLACK);
    const wrapped = doc.splitTextToSize(value, contentW - 42);
    doc.text(wrapped, MARGIN + 40, y);
    y += 5.6 * wrapped.length;
  };

  const paragraph = (text: string, size = 9.5) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    setText(doc, BLACK);
    const wrapped = doc.splitTextToSize(text, contentW);
    ensure(4.8 * wrapped.length + 2);
    doc.text(wrapped, MARGIN, y);
    y += 4.8 * wrapped.length + 2.5;
  };

  /* ---------- Bestillinga ---------- */
  sectionTitle("Bestilling");
  row("Status", PICKUP_STATUS_LABEL[order.status] ?? order.status);
  row("Sendt inn", dateTime(order.created_at));
  row("Hentes", order.pickup_now ? `Henter nå – ${longDate(order.pickup_date)}` : longDate(order.pickup_date));
  row("Betaling", `Faktura, ${selger.betalingsfrist} dager`);
  y += 3;

  sectionTitle("Kunde");
  if (privat) {
    row("Navn", order.customer_name);
    row("Fakturaadresse", order.billing_address);
  } else {
    row("Firma", order.company);
    row("Org.nr.", order.org_number ? visOrgnr(order.org_number) : null);
    row("Kontaktperson", order.customer_name);
  }
  row("Telefon", order.customer_phone);
  row("E-post", order.customer_email);
  y += 3;

  /* ---------- Varene ---------- */
  sectionTitle(privat ? "Varer (priser inkl. mva)" : "Varer (priser eks. mva)");

  const colBelop = pw - MARGIN;
  const colPris = pw - MARGIN - 32;
  const colMengde = pw - MARGIN - 64;
  const nameW = colMengde - MARGIN - 24;

  const tableHeader = () => {
    ensure(12);
    setFill(doc, BLACK);
    doc.rect(MARGIN, y - 4.4, contentW, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text("VARE", MARGIN + 2, y);
    doc.text("MENGDE", colMengde, y, { align: "right" });
    doc.text("PRIS", colPris, y, { align: "right" });
    doc.text("BELØP", colBelop, y, { align: "right" });
    y += 6.5;
  };

  tableHeader();
  order.lines.forEach((l, i) => {
    doc.setFontSize(9.5);
    const nameLines = doc.splitTextToSize(pipeLabel(l.name, l.dimension), nameW);
    const rowH = Math.max(6.4, 4.6 * nameLines.length + 2);
    if (y + rowH > bottomLimit) {
      newPage();
      tableHeader();
    }
    if (i % 2 === 1) {
      setFill(doc, ZEBRA);
      doc.rect(MARGIN, y - 4.2, contentW, rowH, "F");
    }

    const pris = l.unit_price === null ? null : privat ? prisInklMva(l.unit_price, vatRate) : l.unit_price;
    const belop = l.line_total === null ? null : privat ? summer([l.line_total], vatRate).inkl : l.line_total;

    doc.setFont("helvetica", "bold");
    setText(doc, BLACK);
    doc.setFontSize(9.5);
    doc.text(nameLines, MARGIN + 2, y);
    doc.setFont("helvetica", "normal");
    doc.text(`${num(l.quantity)} ${l.unit}`, colMengde, y, { align: "right" });
    setText(doc, GREY);
    doc.text(pris === null ? "–" : kr(pris), colPris, y, { align: "right" });
    doc.setFont("helvetica", "bold");
    setText(doc, BLACK);
    doc.text(belop === null ? "–" : kr(belop), colBelop, y, { align: "right" });
    y += rowH;
  });

  /* ---------- Summen ---------- */
  const sum = summer([order.total], vatRate);
  ensure(24);
  y += 2;
  setDraw(doc, BLACK);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, pw - MARGIN, y);
  doc.setLineWidth(0.2);
  y += 6;
  const sumRader: [string, string][] = [
    ["Sum eks. mva", `${kr(sum.eks)} kr`],
    [`Mva ${num(vatRate)} %`, `${kr(sum.mva)} kr`],
    ["Sum inkl. mva", `${kr(sum.inkl)} kr`],
  ];
  sumRader.forEach(([label, value], i) => {
    const sist = i === sumRader.length - 1;
    doc.setFont("helvetica", sist ? "bold" : "normal");
    doc.setFontSize(sist ? 11 : 9.5);
    setText(doc, sist ? BLACK : GREY);
    doc.text(label, MARGIN + 2, y);
    setText(doc, sist ? RED : GREY);
    doc.text(value, colBelop, y, { align: "right" });
    y += sist ? 8 : 5.6;
  });

  if (order.comment) {
    sectionTitle("Kommentar fra kunden");
    paragraph(order.comment);
  }
  if (order.customer_message) {
    sectionTitle("Melding fra oss");
    paragraph(order.customer_message);
  }

  sectionTitle("Henting");
  paragraph(
    [selger.adresse ? `Varene hentes på lageret, ${selger.adresse}.` : "Varene hentes på lageret.", selger.henteinfo ?? ""]
      .filter(Boolean)
      .join(" "),
  );

  /* ---------- Angrerett og angreskjema, for privatpersonar ---------- */
  if (privat) {
    newPage();
    const a = angrerettAvsnitt(selger);
    sectionTitle(a.tittel);
    a.tekst.forEach((t) => paragraph(t));
    y += 4;

    const s = angreskjema(selger);
    sectionTitle(s.tittel);
    paragraph(s.ingress, 9);
    s.felt.forEach((f) => {
      ensure(14);
      paragraph(f);
      setDraw(doc, HAIRLINE);
      doc.line(MARGIN, y + 2, pw - MARGIN, y + 2);
      y += 7;
    });
    paragraph(s.fotnote, 8.5);
  }

  drawFooter(doc, company);
  return doc;
}

export function downloadPickupPDF(input: PickupPdfDoc) {
  const namn = input.order.company ?? input.order.customer_name;
  buildPickupPDF(input).save(`bestilling_${input.order.order_number}_${safeName(namn)}.pdf`);
}
```

- [ ] **Step 4: Kjør testen og se at den passerer**

Run: `npx vitest run src/test/pickup-pdf.test.ts`
Expected: PASS. (Logoen feiler å lastes i testmiljøet; `drawHeader` fanger det selv.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/pickup-pdf.ts src/test/pickup-pdf.test.ts
git commit -m "Bestilling: PDF-en

Samme dokument for kunden og kontoret, med prisene inkl. mva for
privatpersoner og eks. mva for bedrifter, summen i tre linjer, og
angreretten med angreskjemaet på en egen side for privatpersoner.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: Bestillingssiden på `/bestilling/:id`

**Files:**
- Create: `src/pages/PickupOrder.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `fetchPickupOrder`, `requestEmails`, `PickupOrder` (Task 6); `downloadPickupPDF` (Task 11); `summer`, `prisInklMva`; `visOrgnr`; `ANGRERETT_KORT`, `selgerFra` (Task 5); `LegalFooter` (Task 9); `QK.pickupOrder`.
- Produces: ruten `/bestilling/:id` – samme side som e-posten lenker til.

- [ ] **Step 1: Skriv siden**

Create `src/pages/PickupOrder.tsx`:

```tsx
// Bestillinga slik kunden ser henne: status, heile bestillinga og PDF-en. Same
// side som e-posten lenkjer til. Id-en i adressa er ein uuid – ordrenummera går
// i rekkjefølgje, og med dei kunne kven som helst bladd gjennom andre sine.

import { useEffect, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Ban, CheckCircle2, Clock, Download, Info, PackageCheck, Plus, Search, WifiOff } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { LegalFooter } from "@/components/LegalFooter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { QK } from "@/lib/orders";
import { useOrderSettings, useSettings } from "@/lib/settings";
import { fetchPickupOrder, requestEmails, type PickupOrder as Bestilling } from "@/lib/pickup-orders";
import { downloadPickupPDF } from "@/lib/pickup-pdf";
import { prisInklMva, summer } from "@/lib/mva";
import { visOrgnr } from "@/lib/orgnr";
import { ANGRERETT_KORT, selgerFra } from "@/lib/vilkar";
import { dateTime, kr, longDate, num, pipeLabel } from "@/lib/format";
import type { CompanyInfo } from "@/lib/order-pdf";
import { cn } from "@/lib/utils";

const STATUS = {
  ny: { Ikon: Clock, tittel: "Bestillingen er mottatt", ramme: "border-primary/30 bg-primary/10", farge: "text-primary" },
  behandlet: { Ikon: PackageCheck, tittel: "Klar til henting", ramme: "border-success/30 bg-success/10", farge: "text-success" },
  levert: { Ikon: CheckCircle2, tittel: "Hentet", ramme: "border-success/30 bg-success/10", farge: "text-success" },
  avvist: {
    Ikon: Ban,
    tittel: "Bestillingen ble avvist",
    ramme: "border-destructive/30 bg-destructive/10",
    farge: "text-destructive",
  },
} as const;

function statusTekst(o: Bestilling): string {
  switch (o.status) {
    case "ny":
      return o.pickup_now
        ? "Kontoret har fått beskjed om at du henter nå. Siden oppdaterer seg når bestillingen er godkjent."
        : "Kontoret går gjennom bestillingen. Du får e-post når den er klar til henting.";
    case "behandlet":
      return o.pickup_now ? "Du kan hente nå." : `Du kan hente ${longDate(o.pickup_date)}.`;
    case "levert":
      return "Takk for handelen.";
    case "avvist":
      return o.customer_message ?? "Ta kontakt med oss hvis du lurer på noe.";
  }
}

function Rad({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="break-words text-right text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

export default function PickupOrder() {
  const { id = "" } = useParams();
  const { toast } = useToast();
  const { data: settings } = useSettings();
  const { data: orderSettings } = useOrderSettings();

  const q = useQuery({
    queryKey: QK.pickupOrder(id),
    queryFn: () => fetchPickupOrder(id),
    // Står kunden på lageret og ventar, ser han «Klar til henting» kome opp utan
    // å laste sida på nytt. Berre medan fana er synleg.
    refetchInterval: (query) => (query.state.data?.status === "ny" ? 20_000 : false),
    refetchIntervalInBackground: false,
  });
  const o = q.data ?? null;

  /*
   * Ber om det som står att av e-post, éin gong per status. Gjekk førespurnaden
   * frå kassen tapt – dekninga forsvann i det knappen blei trykt – går e-posten
   * no, og kontoret får beskjed likevel.
   */
  const status = o?.status;
  const spurt = useRef<string | null>(null);
  const { refetch } = q;
  useEffect(() => {
    if (!id || !status) return;
    const nokkel = `${id}:${status}`;
    if (spurt.current === nokkel) return;
    spurt.current = nokkel;
    void requestEmails(id).then((r) => {
      if (r?.sendt.length) void refetch();
    });
  }, [id, status, refetch]);

  const vat = settings?.vat_rate ?? 25;
  const company: CompanyInfo = {
    name: settings?.company_name || "Hauge Maskin AS",
    orgNumber: settings?.org_number,
    address: settings?.address,
    phone: settings?.phone,
    email: settings?.email,
  };
  const selger = selgerFra(settings, orderSettings);

  const pdf = () => {
    if (!o) return;
    try {
      downloadPickupPDF({ order: o, company, selger, vatRate: vat });
    } catch {
      toast({
        title: "Klarte ikke å lage PDF",
        description: "Prøv igjen, eller ta et skjermbilde av bestillingen.",
        variant: "destructive",
      });
    }
  };

  if (q.isLoading) {
    return (
      <div className="hm-page min-h-screen">
        <TopBar title="Bestilling" />
        <main className="mx-auto max-w-2xl space-y-3 px-3 pt-4 sm:px-4">
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-56 w-full rounded-lg" />
        </main>
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="hm-page min-h-screen">
        <TopBar title="Bestilling" />
        <main className="mx-auto max-w-lg px-3 pt-6 sm:px-4">
          <div className="hm-card flex flex-col items-center gap-3 p-8 text-center">
            <WifiOff className="h-9 w-9 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-xl font-bold text-foreground">Klarte ikke å hente bestillingen</h2>
            <p className="text-sm text-muted-foreground">Sjekk at du har dekning, og prøv igjen.</p>
            <Button variant="outline" className="h-12 w-full text-base" onClick={() => q.refetch()}>
              Prøv igjen
            </Button>
          </div>
        </main>
      </div>
    );
  }

  if (!o) {
    return (
      <div className="hm-page min-h-screen">
        <TopBar title="Bestilling" />
        <main className="mx-auto max-w-lg px-3 pt-6 sm:px-4">
          <div className="hm-card flex flex-col items-center gap-3 p-8 text-center">
            <Search className="h-9 w-9 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-xl font-bold text-foreground">Fant ikke bestillingen</h2>
            <p className="text-sm text-muted-foreground">
              Lenken kan være ufullstendig. Åpne den fra e-posten på nytt, eller ta kontakt med oss.
            </p>
            <Button asChild className="h-12 w-full text-base">
              <Link to="/bestill">Til butikken</Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const s = STATUS[o.status];
  const privat = o.customer_type === "privat";
  const sum = summer([o.total], vat);

  return (
    <div className="hm-page min-h-screen">
      <TopBar title={`Bestilling nr. ${o.order_number}`} />

      <main className="mx-auto max-w-2xl px-3 pt-4 pb-10 sm:px-4">
        <div aria-live="polite" className={cn("animate-scale-in rounded-lg border p-6 text-center", s.ramme)}>
          <s.Ikon className={cn("mx-auto h-12 w-12", s.farge)} aria-hidden="true" />
          <h2 className="mt-3 text-2xl font-bold text-foreground">{s.tittel}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{statusTekst(o)}</p>
          <p className="tabular mt-2 text-xs text-muted-foreground">
            Bestilling nr. <span className="font-semibold text-foreground">{o.order_number}</span> · {dateTime(o.created_at)}
          </p>
        </div>

        {o.emails.kvittering ? (
          <p className="mt-3 text-center text-sm text-muted-foreground">
            Vi har sendt kvittering til <span className="font-medium text-foreground">{o.customer_email}</span>.
          </p>
        ) : null}

        {o.customer_message && o.status !== "avvist" ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-muted/60 px-4 py-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm leading-relaxed text-foreground">
              <span className="font-semibold">Melding fra oss:</span> {o.customer_message}
            </p>
          </div>
        ) : null}

        <section className="hm-card mt-4 p-4" aria-labelledby="bestilling-varer">
          <h3 id="bestilling-varer" className="text-base font-semibold text-foreground">
            Varer <span className="text-sm font-normal text-muted-foreground">({privat ? "inkl. mva" : "eks. mva"})</span>
          </h3>
          <ul className="mt-2 divide-y divide-border">
            {o.lines.map((l, i) => (
              <li key={`${l.sku ?? l.name}-${i}`} className="py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 break-words text-sm font-medium text-foreground">{pipeLabel(l.name, l.dimension)}</span>
                  <span className="tabular shrink-0 text-sm font-semibold text-foreground">
                    {num(l.quantity)} {l.unit}
                  </span>
                </div>
                {l.unit_price !== null && l.line_total !== null ? (
                  <p className="tabular mt-0.5 text-right text-xs text-muted-foreground">
                    {kr(privat ? prisInklMva(l.unit_price, vat) : l.unit_price)} kr/{l.unit} ·{" "}
                    {kr(privat ? summer([l.line_total], vat).inkl : l.line_total)} kr
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Sum eks. mva</dt>
              <dd className="tabular">{kr(sum.eks)} kr</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Mva {num(vat)} %</dt>
              <dd className="tabular">{kr(sum.mva)} kr</dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-base font-semibold text-foreground">Sum inkl. mva</dt>
              <dd className="tabular text-xl font-bold text-foreground">{kr(sum.inkl)} kr</dd>
            </div>
          </dl>
        </section>

        <section className="hm-card mt-4 divide-y divide-border p-4">
          <Rad label="Hentes" value={o.pickup_now ? `Henter nå – ${longDate(o.pickup_date)}` : longDate(o.pickup_date)} />
          <Rad label="Hentested" value={selger.adresse ? `Lageret, ${selger.adresse}` : "Lageret"} />
          <Rad label="Betaling" value={`Faktura, ${selger.betalingsfrist} dager`} />
          {privat ? (
            <>
              <Rad label="Navn" value={o.customer_name} />
              <Rad label="Fakturaadresse" value={o.billing_address} />
            </>
          ) : (
            <>
              <Rad label="Firma" value={o.company} />
              <Rad label="Org.nr." value={o.org_number ? visOrgnr(o.org_number) : null} />
              <Rad label="Kontaktperson" value={o.customer_name} />
            </>
          )}
          <Rad label="Telefon" value={o.customer_phone} />
          <Rad label="E-post" value={o.customer_email} />
          <Rad label="Kommentar" value={o.comment} />
        </section>

        {settings?.pickup_note ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-muted/60 px-4 py-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm leading-relaxed text-muted-foreground">{settings.pickup_note}</p>
          </div>
        ) : null}

        {privat && o.status !== "avvist" ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {ANGRERETT_KORT.join(" ")}{" "}
            <Link to="/vilkar" className="font-medium text-foreground underline underline-offset-2">
              Vilkår og angreskjema
            </Link>
          </p>
        ) : null}

        <div className="mt-5 space-y-2">
          <Button variant="outline" className="h-14 w-full text-base [&_svg]:size-5" onClick={pdf}>
            <Download aria-hidden="true" />
            Last ned PDF
          </Button>
          <Button asChild className="h-14 w-full text-base font-semibold [&_svg]:size-5">
            <Link to="/bestill">
              <Plus aria-hidden="true" />
              Ny bestilling
            </Link>
          </Button>
        </div>
      </main>

      <LegalFooter />
    </div>
  );
}
```

- [ ] **Step 2: Ruten**

I `src/App.tsx`: legg til `import PickupOrder from "./pages/PickupOrder";` etter importen av `PickupCheckout`, og ruten rett etter `/bestill/kasse`-ruten:

```tsx
            <Route path="/bestilling/:id" element={<PickupOrder />} />
```

- [ ] **Step 3: Typesjekk, lint og bygg**

Run: `npx tsc -p tsconfig.app.json --noEmit; npx eslint src/pages/PickupOrder.tsx src/App.tsx && npm run build`
Expected: bare grunnlinjefeilene, ingen eslint-feil, bygget går gjennom.

- [ ] **Step 4: Sjekk i nettleseren**

Åpne `/bestilling/00000000-0000-0000-0000-000000000000` og `/bestilling/tull`. Begge skal vise «Fant ikke bestillingen» (den første fordi basen svarer null eller fordi funksjonen ikke finnes ennå – da viser siden «Klarte ikke å hente bestillingen», som også er riktig før migrasjonen).

- [ ] **Step 5: Commit**

```bash
git add src/pages/PickupOrder.tsx src/App.tsx
git commit -m "Bestilling: siden kunden og e-posten lander på

Status, hele bestillingen, hvor og når den hentes, og «Last ned PDF».
Venter bestillingen på godkjenning, spør siden på nytt hvert 20.
sekund, så den som står på lageret ser «Klar til henting» komme opp.
Siden ber også om e-post som står igjen, så kontoret får beskjed selv
om forespørselen fra kassen gikk tapt.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 13: Vilkårssiden og personvernerklæringen

**Files:**
- Create: `src/pages/Vilkar.tsx`
- Modify: `src/pages/Personvern.tsx` (full erstatning)
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `vilkarAvsnitt`, `angreskjema`, `selgerFra` (Task 5); `useOrderSettings`, `useSettings`; `LegalFooter` (Task 9).
- Produces: ruten `/vilkar`.

- [ ] **Step 1: Vilkårssiden**

Create `src/pages/Vilkar.tsx`:

```tsx
// Kjøpsvilkåra for bestilling på nett, med angreskjemaet. Teksten kjem frå
// supabase/functions/_shared/angrerett.ts – same kjelde som kassen, PDF-en og
// e-postane – og firmaopplysningane frå innstillingane.

import { Link } from "react-router-dom";
import { Printer } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { LegalFooter } from "@/components/LegalFooter";
import { Button } from "@/components/ui/button";
import { useOrderSettings, useSettings } from "@/lib/settings";
import { angreskjema, selgerFra, vilkarAvsnitt } from "@/lib/vilkar";

export default function Vilkar() {
  const { data: settings } = useSettings();
  const { data: orderSettings } = useOrderSettings();
  const selger = selgerFra(settings, orderSettings);
  const skjema = angreskjema(selger);

  return (
    <div className="hm-page min-h-screen">
      <div className="print:hidden">
        <TopBar title="Vilkår" back="/bestill" />
      </div>

      <main className="mx-auto w-full max-w-2xl px-5 py-8">
        <div className="print:hidden">
          <h1 className="text-2xl font-semibold text-foreground">Vilkår for bestilling på nett</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Gjelder bestilling av rør til henting hos {selger.navn}.
          </p>

          <div className="mt-8 space-y-6 text-sm leading-relaxed">
            {vilkarAvsnitt(selger).map((a) => (
              <section key={a.tittel}>
                <h2 className="text-base font-semibold text-foreground">{a.tittel}</h2>
                <div className="mt-1 space-y-2 text-muted-foreground">
                  {a.tekst.map((t) => (
                    <p key={t}>{t}</p>
                  ))}
                  {a.tittel === "Personopplysninger" ? (
                    <p>
                      <Link to="/personvern" className="font-medium text-foreground underline underline-offset-2">
                        Les personvernerklæringen
                      </Link>
                    </p>
                  ) : null}
                  {a.tittel === "Angrerett" ? (
                    <p>
                      <a href="#angreskjema" className="font-medium text-foreground underline underline-offset-2">
                        Til angreskjemaet
                      </a>
                    </p>
                  ) : null}
                </div>
              </section>
            ))}
          </div>
        </div>

        {/* Skjemaet blir det einaste på utskrifta */}
        <section
          id="angreskjema"
          className="mt-10 rounded-lg border border-border bg-card p-5 print:mt-0 print:border-0 print:p-0"
        >
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground">{skjema.tittel}</h2>
            <Button variant="outline" className="h-11 print:hidden" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
              Skriv ut
            </Button>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{skjema.ingress}</p>
          <div className="mt-4 space-y-5 text-sm text-foreground">
            {skjema.felt.map((f, i) => (
              <div key={f}>
                <p>{f}</p>
                {i > 0 ? <div className="mt-6 border-b border-dashed border-foreground/40" aria-hidden="true" /> : null}
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">{skjema.fotnote}</p>
        </section>
      </main>

      <div className="print:hidden">
        <LegalFooter />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Personvernerklæringen**

Replace the whole content of `src/pages/Personvern.tsx` with:

```tsx
import { TopBar } from "@/components/TopBar";
import { useSettings } from "@/lib/settings";

/**
 * Personvernerklæring.
 *
 * Uttaksskjemaet og bestillingsskjemaet samlar namn, kontaktopplysningar og
 * adresse frå kundar som ikkje er innlogga. GDPR artikkel 13 krev at dei får
 * vite kven som er ansvarleg, kva som blir lagra og kvifor – på
 * innsamlingstidspunktet, ikkje på førespurnad.
 *
 * Firmaopplysningane kjem frå pipe_public_settings, som er lesbar for anon,
 * så sida fungerer utan innlogging slik ho skal.
 */
export default function Personvern() {
  const { data: settings } = useSettings();

  const firma = settings?.company_name?.trim() || "Hauge Maskin AS";
  const orgnr = settings?.org_number?.trim();
  const epost = settings?.email?.trim();
  const telefon = settings?.phone?.trim();
  const adresse = settings?.address?.trim();

  return (
    <div className="min-h-screen bg-background">
      <TopBar title="Personvern" back="/" />

      <main className="mx-auto w-full max-w-2xl px-5 py-8">
        <h1 className="text-2xl font-semibold">Personvernerklæring</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          For selvbetjent uttak og bestilling av rør hos {firma}.
        </p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed">
          <Avsnitt tittel="Hvem er behandlingsansvarlig">
            <p>
              {firma}
              {orgnr ? ` (org.nr. ${orgnr})` : ""} er ansvarlig for
              personopplysningene som samles inn gjennom denne tjenesten.
              {adresse ? ` Adresse: ${adresse}.` : ""}
            </p>
            {(epost || telefon) && (
              <p className="mt-2">
                Har du spørsmål om personvern, ta kontakt
                {epost ? (
                  <>
                    {" "}på{" "}
                    <a className="font-medium underline underline-offset-2" href={`mailto:${epost}`}>
                      {epost}
                    </a>
                  </>
                ) : null}
                {telefon ? `${epost ? " eller" : " på"} ${telefon}` : ""}.
              </p>
            )}
          </Avsnitt>

          <Avsnitt tittel="Hva vi behandler">
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Navn på deg eller firmaet som henter eller bestiller</li>
              <li>Mobilnummer, så vi kan ta kontakt om uttaket eller bestillingen</li>
              <li>E-post. Ved bestilling er den påkrevd: kvitteringen og beskjeden om henting går dit</li>
              <li>Fakturaadresse, når en privatperson bestiller</li>
              <li>Organisasjonsnummer, når en bedrift bestiller</li>
              <li>Hva du tok ut eller bestilte, hvor mye, og når du vil hente</li>
              <li>Signatur, dersom utleier har slått på signering</li>
            </ul>

            <p className="mt-3">
              For dem som er satt på et prosjekt og kvitterer for leveranser fra
              leverandør, behandler vi i tillegg navnet på den som tok imot,
              signaturen hans, og <strong>bildene han tar av leveransen</strong>.
              Bildene kan vise personer som er på plassen.
            </p>
          </Avsnitt>

          <Avsnitt tittel="Hvorfor">
            <p>
              Opplysningene er nødvendige for å gjennomføre uttaket eller
              bestillingen: for å vite hvem som har hentet hva, for å kunne ta
              kontakt ved feil, og for å fakturere. Det rettslige grunnlaget er å
              oppfylle avtalen med deg, jf. personvernforordningen artikkel 6 nr. 1
              bokstav b, og bokføringsplikten for det som gjelder faktura, jf.
              bokstav c.
            </p>
            <p className="mt-3">
              Ved bestilling bruker vi e-postadressen til å sende kvittering,
              beskjed når varene er klare, og beskjed hvis vi ikke kan levere. Vi
              sender ikke nyhetsbrev eller reklame.
            </p>
            <p className="mt-3">
              Bilder fra mottakskontrollen tas for å dokumentere hva som faktisk
              ble levert, slik at avvik kan reklameres til leverandøren. Grunnlaget
              er vår berettigede interesse i å kunne dokumentere en leveranse,
              jf. artikkel 6 nr. 1 bokstav f. Bildene er ikke offentlige: de
              ligger utilgjengelig for andre enn kontoret og dem som er satt på
              det aktuelle prosjektet, og hentes bare fram gjennom lenker som
              utløper.
            </p>
          </Avsnitt>

          <Avsnitt tittel="Hvor lenge">
            <p>
              Uttak og bestillinger som er fakturert, lagres så lenge
              bokføringsloven krever, i dag fem år etter regnskapsåret. Det som
              ikke blir fakturert, slettes når det ikke lenger har noe formål. En
              logg over hvilke e-poster som er sendt om en bestilling, slettes
              sammen med bestillingen.
            </p>
          </Avsnitt>

          <Avsnitt tittel="Hvem ser opplysningene">
            <p>
              Bare ansatte hos {firma} som har med lager og fakturering å gjøre.
              Data ligger hos Supabase, som er databehandler for oss. E-postene om
              bestillinger sendes gjennom Resend, som også er databehandler.
              Resend er et amerikansk selskap, og overføringen til USA skjer etter
              databehandleravtalen med Resend, som bygger på EUs godkjente
              overføringsgrunnlag. Vi selger ikke opplysninger videre, og bruker
              dem ikke til markedsføring.
            </p>
          </Avsnitt>

          <Avsnitt tittel="Informasjonskapsler">
            <p>
              Siden bruker bare lagring som er nødvendig for at handlekurven,
              bestillingen og innloggingen skal virke. Vi har ingen analyse- eller
              markedsføringssporing, og derfor heller ikke noe samtykkebanner.
              Kodeleseren som lar kameraet lese QR-koder på iPhone, lastes fra
              vårt eget domene.
            </p>
          </Avsnitt>

          <Avsnitt tittel="Rettighetene dine">
            <p>
              Du har rett til innsyn i hva vi har lagret om deg, til å få rettet
              feil, og til å be om sletting av det vi ikke er pålagt å ta vare
              på. Ta kontakt på adressen over. Du kan også klage til
              Datatilsynet dersom du mener vi behandler opplysningene feil.
            </p>
          </Avsnitt>
        </div>
      </main>
    </div>
  );
}

function Avsnitt({ tittel, children }: { tittel: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold">{tittel}</h2>
      <div className="mt-1 text-muted-foreground">{children}</div>
    </section>
  );
}
```

- [ ] **Step 3: Ruten**

I `src/App.tsx`: legg til `import Vilkar from "./pages/Vilkar";` etter importen av `Personvern`, og ruten rett etter `/personvern`-ruten:

```tsx
            <Route path="/vilkar" element={<Vilkar />} />
```

- [ ] **Step 4: Typesjekk, lint og nettleser**

Run: `npx tsc -p tsconfig.app.json --noEmit; npx eslint src/pages/Vilkar.tsx src/pages/Personvern.tsx src/App.tsx`
Expected: bare grunnlinjefeilene, ingen eslint-feil.

Åpne `/vilkar` og `/personvern` i forhåndsvisningen. Sjekk at alle ni avsnittene står på `/vilkar`, at angreskjemaet har seks strekfelt, og at lenken «Til angreskjemaet» hopper dit.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Vilkar.tsx src/pages/Personvern.tsx src/App.tsx
git commit -m "Bestilling: vilkårene, angreskjemaet og personvernet

/vilkar viser kjøpsvilkårene og angreskjemaet med selgeren fylt inn fra
innstillingene, og skjemaet kan skrives ut alene. Personvernerklæringen
nevner de nye opplysningene, hva e-postene brukes til, og Resend som ny
databehandler.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 14: Adminpanelet

**Files:**
- Modify: `src/components/StatusBadge.tsx`
- Create: `src/components/admin/PickupQueue.tsx`
- Modify: `src/components/admin/OrdersTab.tsx` (full erstatning)
- Modify: `src/pages/AdminDashboard.tsx`
- Modify: `src/components/admin/InvoiceTab.tsx`

**Interfaces:**
- Consumes: `approvePickupOrder`, `rejectPickupOrder`, `requestEmails`, `useWaitingPickupOrders`, `fetchOrderEmails`, `somBestilling`, `EmailResult` (Task 6); `downloadPickupPDF` (Task 11); `selgerFra` (Task 5); `setOrderStatus`, `fetchPipeTypes`, `QK`; `statusLabel`, `PICKUP_STATUS_LABEL`.
- Produces: `StatusBadge` får valgfri `kind`; `PickupQueue({ onOpen })`, `PickupDetails({ order })`, `PickupHandlingDialog({ handling, onClose })`, `epostMelding(r, type)`.

- [ ] **Step 1: Statusmerket kjenner bestillinger**

I `src/components/StatusBadge.tsx`:

1. Endre importen øverst: legg til `statusLabel,` og `type OrderKind,` i importen fra `@/lib/types`.
2. Erstatt funksjonen `StatusBadge` med:

```tsx
export function StatusBadge({ status, kind }: { status: OrderStatus; kind?: OrderKind | null }) {
  return <span className={cn("hm-chip", ORDER_STYLE[status] ?? ORDER_STYLE.ny)}>{statusLabel(status, kind)}</span>;
}
```

- [ ] **Step 2: Stripen, detaljene og dialogene**

Create `src/components/admin/PickupQueue.tsx`:

```tsx
// Bestillingane i adminpanelet: stripa «Venter på godkjenning» øvst i
// Bestillinger, detaljane i sidepanelet, og dialogane kontoret godkjenner og
// avviser med. Godkjenning og avvisning flyttar rør, så dei går alltid gjennom
// databasefunksjonane – aldri gjennom statusveljaren.

import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Clock, Loader2, Mail, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { QK, fetchPipeTypes, setOrderStatus } from "@/lib/orders";
import {
  approvePickupOrder,
  fetchOrderEmails,
  rejectPickupOrder,
  requestEmails,
  useWaitingPickupOrders,
  type EmailResult,
} from "@/lib/pickup-orders";
import { visOrgnr } from "@/lib/orgnr";
import { dateTime, kr, longDate, num, pipeLabel, qtyLabel, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { OrderWithLines } from "@/lib/types";

type Handling = { type: "godkjenn" | "avvis"; order: OrderWithLines } | null;

const EPOST_NAVN: Record<string, string> = {
  kvittering: "Kvittering til kunden",
  kontor: "Varsel til kontoret",
  klar: "«Klar til henting» til kunden",
  avvist: "Avvisning til kunden",
};

/** Kva e-posten gav, sagt slik kontoret treng det. */
export function epostMelding(r: EmailResult | null, type: "klar" | "avvist"): string {
  if (r && !r.satt_opp) return "E-post er ikke satt opp, så kunden har ikke fått beskjed. Ring kunden.";
  if (r?.sendt.includes(type)) return "Kunden har fått e-post.";
  return "E-posten gikk ikke. Prøv igjen fra bestillingen, eller ring kunden.";
}

/** Beholdninga per vare, til åtvaringane. Kontoret les pipe_types. */
function useLagerKart() {
  const { data } = useQuery({ queryKey: QK.types, queryFn: fetchPipeTypes });
  return useMemo(() => new Map((data ?? []).map((t) => [t.id, t.stock])), [data]);
}

const forLite = (o: OrderWithLines, lager: Map<string, number>) =>
  o.lines.filter((l) => l.pipe_type_id && lager.has(l.pipe_type_id) && l.quantity > (lager.get(l.pipe_type_id) ?? 0));

function Rad({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex justify-between gap-4 border-b border-border py-1.5 last:border-0">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="break-words text-right text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

export function PickupHandlingDialog({ handling, onClose }: { handling: Handling; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const lager = useLagerKart();
  const [melding, setMelding] = useState("");
  const [busy, setBusy] = useState(false);

  const o = handling?.order ?? null;
  const godkjenn = handling?.type === "godkjenn";
  const korte = o ? forLite(o, lager) : [];

  const utfor = async () => {
    if (!o) return;
    if (!godkjenn && !melding.trim()) {
      toast({ title: "Skriv en begrunnelse til kunden", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      if (godkjenn) await approvePickupOrder(o.id, melding.trim() || null);
      else await rejectPickupOrder(o.id, melding.trim());
      qc.invalidateQueries({ queryKey: QK.orders });
      qc.invalidateQueries({ queryKey: QK.types });
      const r = await requestEmails(o.id);
      qc.invalidateQueries({ queryKey: QK.orderEmails(o.id) });
      toast({
        title: godkjenn ? `Bestilling #${o.order_number} er godkjent` : `Bestilling #${o.order_number} er avvist`,
        description: epostMelding(r, godkjenn ? "klar" : "avvist"),
      });
      onClose();
    } catch (err) {
      toast({
        variant: "destructive",
        title: godkjenn ? "Klarte ikke å godkjenne" : "Klarte ikke å avvise",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={o !== null} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-w-md">
        {o ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {godkjenn ? `Godkjenne bestilling #${o.order_number}?` : `Avvise bestilling #${o.order_number}?`}
              </DialogTitle>
              <DialogDescription>
                {godkjenn
                  ? "Lageret trekkes nå, og kunden får e-post om at varene er klare til henting."
                  : o.stock_drawn_at
                    ? "Rørene legges tilbake på lageret, og kunden får begrunnelsen på e-post."
                    : "Lageret er ikke trukket for denne. Kunden får begrunnelsen på e-post."}
              </DialogDescription>
            </DialogHeader>

            {godkjenn && korte.length > 0 ? (
              <div className="rounded-lg border border-warning/30 bg-warning/15 px-3 py-2.5 text-sm text-warning-ink">
                <p className="font-medium">Lageret viser for lite av:</p>
                <ul className="mt-1 list-disc pl-5">
                  {korte.map((l) => (
                    <li key={l.id}>
                      {pipeLabel(l.name, l.dimension)}: {qtyLabel(l.quantity, l.unit)} bestilt,{" "}
                      {num(lager.get(l.pipe_type_id as string) ?? 0)} på lager
                    </li>
                  ))}
                </ul>
                <p className="mt-1">Godkjenner du likevel, går beholdningen i minus.</p>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="handling-melding">{godkjenn ? "Melding til kunden (valgfri)" : "Begrunnelse til kunden"}</Label>
              <Textarea
                id="handling-melding"
                rows={3}
                maxLength={1000}
                value={melding}
                onChange={(e) => setMelding(e.target.value)}
                placeholder={godkjenn ? "F.eks. ligger klart ved port 2" : "F.eks. vi har ikke dette på lager før om to uker"}
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={onClose} disabled={busy}>
                Avbryt
              </Button>
              <Button
                variant={godkjenn ? "default" : "destructive"}
                onClick={utfor}
                disabled={busy || (!godkjenn && !melding.trim())}
              >
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                {godkjenn ? "Godkjenn" : "Avvis bestillingen"}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Stripa øvst i Bestillinger. Viser seg berre når noko ventar. */
export function PickupQueue({ onOpen }: { onOpen: (id: string) => void }) {
  const { data: venter = [] } = useWaitingPickupOrders(true);
  const lager = useLagerKart();
  const [handling, setHandling] = useState<Handling>(null);

  if (venter.length === 0) return null;

  return (
    <section className="hm-card border-primary/40 p-3 sm:p-4" aria-labelledby="venter-tittel">
      <h2 id="venter-tittel" className="flex items-center gap-2 text-base font-semibold text-foreground">
        <Clock className="h-5 w-5 text-primary" aria-hidden="true" />
        Venter på godkjenning ({venter.length})
      </h2>
      <ul className="mt-3 space-y-2">
        {venter.map((o) => (
          <li key={o.id} className="rounded-lg border border-border bg-background p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <button type="button" onClick={() => onOpen(o.id)} className="min-w-0 flex-1 text-left">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="tabular font-semibold text-foreground">#{o.order_number}</span>
                  {o.pickup_now ? (
                    <span className="hm-chip border border-destructive/30 bg-destructive/15 text-destructive">HENTER NÅ</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Hentes {longDate(o.pickup_date)}</span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-sm text-foreground">
                  {o.company ?? o.customer_name}
                  {o.company ? <span className="text-muted-foreground"> · {o.customer_name}</span> : null}
                </span>
                <span className="tabular block text-xs text-muted-foreground">
                  {o.lines.length} {o.lines.length === 1 ? "linje" : "linjer"} · {kr(o.total)} kr eks. mva · sendt{" "}
                  {shortDate(o.created_at)}
                </span>
                {forLite(o, lager).length > 0 ? (
                  <span className="mt-1 flex items-center gap-1 text-xs font-medium text-warning-ink">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    Lageret viser for lite av noe
                  </span>
                ) : null}
              </button>
              <div className="flex gap-2">
                <Button size="sm" className="h-10" onClick={() => setHandling({ type: "godkjenn", order: o })}>
                  <Check className="mr-1 h-4 w-4" aria-hidden="true" />
                  Godkjenn
                </Button>
                <Button size="sm" variant="outline" className="h-10" onClick={() => setHandling({ type: "avvis", order: o })}>
                  <X className="mr-1 h-4 w-4" aria-hidden="true" />
                  Avvis
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {/* key: ny bestilling eller ny handling gir tom melding */}
      <PickupHandlingDialog
        key={handling ? `${handling.type}-${handling.order.id}` : "ingen"}
        handling={handling}
        onClose={() => setHandling(null)}
      />
    </section>
  );
}

/** Det som er særeige for ei bestilling, i sidepanelet i Bestillinger. */
export function PickupDetails({ order }: { order: OrderWithLines }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const lager = useLagerKart();
  const logg = useQuery({ queryKey: QK.orderEmails(order.id), queryFn: () => fetchOrderEmails(order.id) });
  const [handling, setHandling] = useState<Handling>(null);
  const [busy, setBusy] = useState(false);

  const settStatus = async (neste: "levert" | "behandlet") => {
    setBusy(true);
    try {
      await setOrderStatus(order.id, neste);
      qc.invalidateQueries({ queryKey: QK.orders });
      toast({ title: neste === "levert" ? "Markert som hentet" : "Satt tilbake til klar til henting" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Klarte ikke å endre status",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const sendIgjen = async () => {
    setBusy(true);
    const r = await requestEmails(order.id);
    qc.invalidateQueries({ queryKey: QK.orderEmails(order.id) });
    setBusy(false);
    if (!r) toast({ variant: "destructive", title: "E-posten gikk ikke", description: "Prøv igjen om litt." });
    else if (!r.satt_opp) toast({ title: "E-post er ikke satt opp", description: "Se docs/bestilling-epost.md." });
    else if (r.sendt.length) toast({ title: "Sendt", description: r.sendt.map((t) => EPOST_NAVN[t] ?? t).join(", ") });
    else if (r.feilet.length) toast({ variant: "destructive", title: "E-posten gikk ikke", description: "Prøv igjen om litt." });
    else toast({ title: "Ingenting å sende", description: "Alt er allerede sendt, eller hendelsen er eldre enn et døgn." });
  };

  const bedrift = order.customer_type === "bedrift";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border px-3 py-1">
        <Rad label="Bestiller" value={bedrift ? "Bedrift" : "Privatperson"} />
        {bedrift ? (
          <Rad label="Org.nr." value={order.org_number ? visOrgnr(order.org_number) : null} />
        ) : (
          <Rad label="Fakturaadresse" value={order.billing_address} />
        )}
        <Rad
          label="Hentes"
          value={order.pickup_now ? `Henter nå (${longDate(order.pickup_date)})` : longDate(order.pickup_date)}
        />
        <Rad label="Melding til kunden" value={order.customer_message} />
      </div>

      {order.status === "ny" ? (
        <ul className="space-y-1 text-sm">
          {order.lines.map((l) => {
            const s = l.pipe_type_id ? lager.get(l.pipe_type_id) : undefined;
            const kort = s !== undefined && l.quantity > s;
            return (
              <li key={l.id} className={cn("flex justify-between gap-3", kort && "font-medium text-warning-ink")}>
                <span className="min-w-0 truncate">{pipeLabel(l.name, l.dimension)}</span>
                <span className="tabular shrink-0">
                  {qtyLabel(l.quantity, l.unit)} · {s === undefined ? "ukjent lager" : `${num(s)} ${l.unit} på lager`}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {order.status === "ny" ? (
          <>
            <Button className="h-11" onClick={() => setHandling({ type: "godkjenn", order })} disabled={busy}>
              <Check className="mr-2 h-4 w-4" aria-hidden="true" />
              Godkjenn
            </Button>
            <Button variant="outline" className="h-11" onClick={() => setHandling({ type: "avvis", order })} disabled={busy}>
              <X className="mr-2 h-4 w-4" aria-hidden="true" />
              Avvis
            </Button>
          </>
        ) : null}
        {order.status === "behandlet" ? (
          <>
            <Button className="h-11" onClick={() => settStatus("levert")} disabled={busy}>
              <Check className="mr-2 h-4 w-4" aria-hidden="true" />
              Hentet
            </Button>
            <Button variant="outline" className="h-11" onClick={() => setHandling({ type: "avvis", order })} disabled={busy}>
              <X className="mr-2 h-4 w-4" aria-hidden="true" />
              Avvis
            </Button>
          </>
        ) : null}
        {order.status === "levert" ? (
          <Button variant="outline" className="h-11" onClick={() => settStatus("behandlet")} disabled={busy}>
            Angre hentet
          </Button>
        ) : null}
      </div>

      <div>
        <p className="mb-1.5 text-sm font-semibold text-foreground">E-post</p>
        {logg.data && logg.data.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {logg.data.map((e) => (
              <li key={e.id} className="flex justify-between gap-3">
                <span className="text-muted-foreground">{EPOST_NAVN[e.type] ?? e.type}</span>
                <span className="tabular">{e.sent_at ? dateTime(e.sent_at) : "ikke sendt"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Ingen e-post er sendt ennå.</p>
        )}
        <Button variant="ghost" size="sm" className="mt-1" onClick={sendIgjen} disabled={busy}>
          <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
          Send det som mangler
        </Button>
      </div>

      <PickupHandlingDialog
        key={handling ? `${handling.type}-${handling.order.id}` : "ingen"}
        handling={handling}
        onClose={() => setHandling(null)}
      />
    </div>
  );
}
```

- [ ] **Step 3: Bestillingsfanen**

Replace the whole content of `src/components/admin/OrdersTab.tsx` with:

```tsx
// Hovudarbeidsflata i adminpanelet: alle uttak og bestillingar i ein periode,
// med detaljvising, statusbyte, PDF og plukkliste. Bestillingar som ventar på
// godkjenning ligg i ei eiga stripe øvst, uavhengig av datofilteret.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { subDays } from "date-fns";
import { Download, FileText, Inbox, Loader2, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { Stat } from "@/components/Stat";
import { PickupDetails, PickupQueue } from "@/components/admin/PickupQueue";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { dateTime, isoDate, kr, krShort, num, pipeLabel, qtyLabel, shortDate } from "@/lib/format";
import { deleteOrder, fetchOrders, QK, setOrderStatus, updateOrder } from "@/lib/orders";
import { downloadOrderPDF, downloadPickListPDF, type CompanyInfo } from "@/lib/order-pdf";
import { downloadPickupPDF } from "@/lib/pickup-pdf";
import { somBestilling, useWaitingPickupOrders } from "@/lib/pickup-orders";
import { useOrderSettings, useSettings } from "@/lib/settings";
import { selgerFra } from "@/lib/vilkar";
import { ORDER_STATUS_LABEL, type OrderKind, type OrderStatus, type OrderWithLines } from "@/lib/types";

const STATUS_OPTIONS: (OrderStatus | "alle")[] = ["alle", "ny", "behandlet", "levert", "avvist"];

const KIND_OPTIONS: { value: OrderKind | "alle"; label: string }[] = [
  { value: "alle", label: "Uttak og bestillinger" },
  { value: "uttak", label: "Uttak" },
  { value: "bestilling", label: "Bestillinger" },
];

const erBestilling = (o: { kind?: OrderKind | null }) => o.kind === "bestilling";

/** Meter og stykk kan ikkje leggjast saman – kvar eining blir summert for seg. */
function unitSummary(lines: { unit: string; quantity: number }[]): string {
  const per = new Map<string, number>();
  lines.forEach((l) => per.set(l.unit, (per.get(l.unit) ?? 0) + (l.quantity || 0)));
  const parts = [...per.entries()].map(([unit, qty]) => qtyLabel(Math.round(qty * 10000) / 10000, unit));
  return parts.length ? parts.join(" · ") : "–";
}

/** Prosjektet for eit uttak; «Henter nå» eller hentedagen for ei bestilling. */
function ProsjektEllerHenting({ o }: { o: OrderWithLines }) {
  if (!erBestilling(o)) return <>{o.project || "–"}</>;
  return o.pickup_now ? (
    <span className="font-semibold text-destructive">Henter nå</span>
  ) : (
    <span>Hentes {shortDate(o.pickup_date)}</span>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-foreground text-right break-words">{value}</span>
    </div>
  );
}

export function OrdersTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const { data: settings } = useSettings();
  const { data: orderSettings } = useOrderSettings();

  const [from, setFrom] = useState(() => isoDate(subDays(new Date(), 29)));
  const [to, setTo] = useState(() => isoDate());
  const [status, setStatus] = useState<OrderStatus | "alle">("alle");
  const [kind, setKind] = useState<OrderKind | "alle">("alle");
  const [search, setSearch] = useState("");
  const [onlyUninvoiced, setOnlyUninvoiced] = useState(false);

  // Søket ventar litt: kvart tastetrykk skulle elles gitt ei ny spørjing
  const [searchTerm, setSearchTerm] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const [selected, setSelected] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const filter = { from, to, status, search: searchTerm, onlyUninvoiced };

  const { data: alle = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: [...QK.orders, filter],
    queryFn: () => fetchOrders(filter),
  });

  // Typen blir filtrert i klienten: før migrasjonen finst ikkje kolonnen, og då
  // skal lista framleis virke – alt er uttak.
  const orders = useMemo(
    () => (kind === "alle" ? alle : alle.filter((o) => (o.kind ?? "uttak") === kind)),
    [alle, kind],
  );
  const venter = useWaitingPickupOrders(true).data ?? [];

  // show_prices styrer kundeflatene. Admin må sjå beløpa uansett for å kunne
  // fakturere, så innstillinga blir ikkje lesen her.
  const company: CompanyInfo = {
    name: settings?.company_name || "Hauge Maskin AS",
    orgNumber: settings?.org_number,
    address: settings?.address,
    phone: settings?.phone,
    email: settings?.email,
  };

  const stats = useMemo(() => {
    const allLines = orders.flatMap((o) => o.lines);
    return {
      count: orders.length,
      nye: orders.filter((o) => o.status === "ny").length,
      quantity: unitSummary(allLines),
      total: orders.reduce((sum, o) => sum + (o.total || 0), 0),
    };
  }, [orders]);

  // Detaljvisinga les frå dei ferske listene. Ei ventande bestilling eldre enn
  // datofilteret finst berre i stripa, så ho blir henta derifrå.
  const open = alle.find((o) => o.id === openId) ?? venter.find((o) => o.id === openId) ?? null;
  useEffect(() => setNote(open?.admin_note ?? ""), [openId, open?.admin_note]);

  // Eit val som ikkje lenger er i lista skal ikkje henge att i handlingane
  const selectedOrders = orders.filter((o) => selected.includes(o.id));
  const allChecked = orders.length > 0 && selectedOrders.length === orders.length;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: QK.orders });
    // Sletting legg røra tilbake på lageret, så beholdninga må hentast på nytt
    queryClient.invalidateQueries({ queryKey: QK.types });
  };

  const fail = (err: unknown, fallback: string) =>
    toast({
      variant: "destructive",
      title: fallback,
      description: err instanceof Error ? err.message : undefined,
    });

  const toggleOne = (id: string, checked: boolean) =>
    setSelected((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));

  const toggleAll = (checked: boolean) => setSelected(checked ? orders.map((o) => o.id) : []);

  const changeStatus = async (id: string, next: OrderStatus) => {
    setBusy(true);
    try {
      await setOrderStatus(id, next);
      refresh();
      toast({ title: `Status satt til ${ORDER_STATUS_LABEL[next]}` });
    } catch (err) {
      fail(err, "Klarte ikke å endre status");
    } finally {
      setBusy(false);
    }
  };

  const saveNote = async (id: string) => {
    setBusy(true);
    try {
      await updateOrder(id, { admin_note: note.trim() || null });
      refresh();
      toast({ title: "Notatet er lagret" });
    } catch (err) {
      fail(err, "Klarte ikke å lagre notatet");
    } finally {
      setBusy(false);
    }
  };

  const removeOrder = async (order: OrderWithLines) => {
    setBusy(true);
    try {
      await deleteOrder(order.id);
      setSelected((prev) => prev.filter((x) => x !== order.id));
      setOpenId(null);
      refresh();
      toast({
        title: "Bestillingen er slettet",
        description: order.stock_drawn_at === null ? "Lageret var aldri trukket, så beholdningen er urørt." : "Rørene er lagt tilbake på lageret.",
      });
    } catch (err) {
      fail(err, "Klarte ikke å slette bestillingen");
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  /**
   * Berre uttak. Ei bestilling blir «behandlet» ved godkjenning, som trekkjer
   * lageret – det skal skje éi og éi, med blikk på lagerstatusen. Basen ville
   * uansett avvist det, men ei avvisning midt i ein Promise.all er ei dårleg
   * forklaring.
   */
  const markSelectedHandled = async () => {
    const uttak = selectedOrders.filter((o) => !erBestilling(o));
    const hoppa = selectedOrders.length - uttak.length;
    if (!uttak.length) {
      toast({ title: "Ingen uttak valgt", description: "Bestillinger godkjennes én og én, fordi godkjenning trekker lageret." });
      return;
    }
    setBusy(true);
    try {
      await Promise.all(uttak.map((o) => setOrderStatus(o.id, "behandlet")));
      refresh();
      setSelected([]);
      toast({
        title: `${uttak.length} uttak merket som behandlet`,
        description: hoppa ? `${hoppa} bestillinger ble hoppet over. De godkjennes én og én.` : undefined,
      });
    } catch (err) {
      fail(err, "Klarte ikke å oppdatere alle bestillingene");
    } finally {
      setBusy(false);
    }
  };

  const pickList = () => {
    if (!selectedOrders.length) return;
    try {
      downloadPickListPDF(
        selectedOrders.map((o) => ({ order: o, lines: o.lines })),
        company,
        { showPrices: true },
      );
    } catch (err) {
      fail(err, "Klarte ikke å lage plukklisten");
    }
  };

  const orderPdf = (order: OrderWithLines) => {
    try {
      if (erBestilling(order)) {
        downloadPickupPDF({
          order: somBestilling(order),
          company,
          selger: selgerFra(settings, orderSettings),
          vatRate: settings?.vat_rate ?? 25,
        });
      } else {
        downloadOrderPDF({ order, lines: order.lines, company }, { showPrices: true });
      }
    } catch (err) {
      fail(err, "Klarte ikke å lage PDF-en");
    }
  };

  return (
    <div className="space-y-4">
      <PickupQueue onOpen={setOpenId} />

      {/* ---------------------------------------------------------- filter */}
      <div className="hm-card p-3 sm:p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label htmlFor="ordre-fra">Fra dato</Label>
            <Input id="ordre-fra" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ordre-til">Til dato</Label>
            <Input id="ordre-til" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ordre-type">Type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as OrderKind | "alle")}>
              <SelectTrigger id="ordre-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KIND_OPTIONS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ordre-status">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as OrderStatus | "alle")}>
              <SelectTrigger id="ordre-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value === "alle" ? "Alle statuser" : ORDER_STATUS_LABEL[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ordre-sok">Søk</Label>
            <div className="relative">
              <Search
                className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="ordre-sok"
                className="pl-9"
                placeholder="Navn, firma, org.nr. eller nr."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Switch id="ordre-ufakturerte" checked={onlyUninvoiced} onCheckedChange={setOnlyUninvoiced} />
          <Label htmlFor="ordre-ufakturerte" className="cursor-pointer">
            Kun ufakturerte
          </Label>
        </div>
      </div>

      {/* -------------------------------------------------------- nøkkeltal */}
      <div className="flex flex-wrap gap-2 sm:gap-3">
        <Stat label="Bestillinger" value={num(stats.count)} />
        <Stat label="Nye" value={num(stats.nye)} />
        <Stat label="Mengde" value={stats.quantity} />
        <Stat label="Beløp" value={`${krShort(stats.total)} kr`} />
      </div>

      {/* ---------------------------------------------------- fleirvalslinje */}
      {selectedOrders.length > 0 && (
        <div className="hm-card p-3 flex flex-wrap items-center gap-2 animate-fade-in">
          <span className="text-sm font-medium text-foreground mr-1">{selectedOrders.length} valgt</span>
          <Button variant="outline" size="sm" onClick={pickList}>
            <FileText className="h-4 w-4 mr-2" aria-hidden="true" />
            Last ned plukkliste
          </Button>
          <Button size="sm" onClick={markSelectedHandled} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" /> : null}
            Merk uttak som behandlet
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
            Nullstill valg
          </Button>
        </div>
      )}

      {/* ------------------------------------------------------------- liste */}
      {isError && (
        <div className="rounded-lg border border-destructive/60 bg-destructive/10 px-4 py-3">
          <p className="text-sm font-semibold text-destructive">Bestillingene kunne ikke hentes</p>
          <p className="text-sm text-foreground mt-1">{error instanceof Error ? error.message : "Ukjent feil"}</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => refetch()}>
            Prøv igjen
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
          <span className="sr-only">Henter bestillinger</span>
        </div>
      ) : orders.length === 0 && !isError ? (
        <div className="hm-card flex flex-col items-center justify-center gap-2 py-14 text-center">
          <div className="rounded-full bg-primary/10 p-4 ring-8 ring-primary/5">
            <Inbox className="h-7 w-7 text-primary" aria-hidden="true" />
          </div>
          <p className="font-semibold text-foreground mt-1">Ingen bestillinger i perioden</p>
          <p className="text-sm text-muted-foreground max-w-xs">Prøv et annet datointervall, en annen type eller status.</p>
        </div>
      ) : isMobile ? (
        <div className="space-y-2">
          {orders.map((o) => (
            <div key={o.id} className="hm-card hm-card-interactive p-3 flex gap-3">
              <Checkbox
                className="mt-1 shrink-0"
                checked={selected.includes(o.id)}
                onCheckedChange={(v) => toggleOne(o.id, v === true)}
                aria-label={`Velg bestilling ${o.order_number}`}
              />
              <button type="button" className="flex-1 min-w-0 text-left" onClick={() => setOpenId(o.id)}>
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-foreground tabular">
                    #{o.order_number}
                    {erBestilling(o) ? <span className="ml-2 text-xs font-medium text-primary">Bestilling</span> : null}
                  </span>
                  <StatusBadge status={o.status} kind={o.kind} />
                </span>
                <span className="block text-sm text-foreground mt-1 truncate">
                  {o.customer_name}
                  {o.company ? <span className="text-muted-foreground"> · {o.company}</span> : null}
                </span>
                <span className="block text-xs text-muted-foreground truncate">
                  <ProsjektEllerHenting o={o} />
                </span>
                <span className="flex items-center justify-between gap-2 mt-1.5 text-xs text-muted-foreground tabular">
                  <span>{dateTime(o.created_at)}</span>
                  <span>{unitSummary(o.lines)}</span>
                </span>
                <span className="block text-sm font-semibold text-foreground tabular mt-1">{kr(o.total)} kr</span>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="hm-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allChecked} onCheckedChange={(v) => toggleAll(v === true)} aria-label="Velg alle" />
                </TableHead>
                <TableHead className="w-16">Nr.</TableHead>
                <TableHead>Dato</TableHead>
                <TableHead>Kunde</TableHead>
                <TableHead>Prosjekt / henting</TableHead>
                <TableHead className="text-right">Linjer</TableHead>
                <TableHead>Mengde</TableHead>
                <TableHead className="text-right">Beløp</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id} className="cursor-pointer" onClick={() => setOpenId(o.id)}>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.includes(o.id)}
                      onCheckedChange={(v) => toggleOne(o.id, v === true)}
                      aria-label={`Velg bestilling ${o.order_number}`}
                    />
                  </TableCell>
                  <TableCell className="font-semibold tabular">
                    {o.order_number}
                    {erBestilling(o) ? <span className="block text-xs font-medium text-primary">Bestilling</span> : null}
                  </TableCell>
                  <TableCell className="tabular whitespace-nowrap">{dateTime(o.created_at)}</TableCell>
                  <TableCell>
                    <span className="font-medium text-foreground">{o.customer_name}</span>
                    {o.company ? <span className="block text-xs text-muted-foreground">{o.company}</span> : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <ProsjektEllerHenting o={o} />
                  </TableCell>
                  <TableCell className="text-right tabular">{o.lines.length}</TableCell>
                  <TableCell className="tabular whitespace-nowrap">{unitSummary(o.lines)}</TableCell>
                  <TableCell className="text-right tabular whitespace-nowrap">{kr(o.total)} kr</TableCell>
                  <TableCell>
                    <StatusBadge status={o.status} kind={o.kind} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* -------------------------------------------------------- detaljar */}
      <Sheet open={!!open} onOpenChange={(v) => !v && setOpenId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          {open && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle className="flex items-center gap-3">
                  <span className="tabular">
                    {erBestilling(open) ? "Bestilling" : "Uttak"} #{open.order_number}
                  </span>
                  <StatusBadge status={open.status} kind={open.kind} />
                </SheetTitle>
              </SheetHeader>

              <div className="mt-4 space-y-5">
                <div>
                  <DetailRow label="Kunde" value={open.customer_name} />
                  <DetailRow label="Firma" value={open.company} />
                  <DetailRow label="Prosjekt" value={open.project} />
                  <DetailRow
                    label="Telefon"
                    value={
                      open.customer_phone ? (
                        <a className="text-primary underline" href={`tel:${open.customer_phone}`}>
                          {open.customer_phone}
                        </a>
                      ) : null
                    }
                  />
                  <DetailRow
                    label="E-post"
                    value={
                      open.customer_email ? (
                        <a className="text-primary underline break-all" href={`mailto:${open.customer_email}`}>
                          {open.customer_email}
                        </a>
                      ) : null
                    }
                  />
                  <DetailRow label="Sendt inn" value={dateTime(open.created_at)} />
                  <DetailRow label="Behandlet" value={open.handled_at ? dateTime(open.handled_at) : null} />
                  <DetailRow label="Faktura" value={open.invoice_id ? "Fakturert" : "Ikke fakturert"} />
                </div>

                {erBestilling(open) ? <PickupDetails order={open} /> : null}

                <div>
                  <p className="text-sm font-semibold text-foreground mb-2">Varelinjer</p>
                  <div className="divide-y divide-border border border-border rounded-lg">
                    {open.lines.map((line) => (
                      <div key={line.id} className="flex items-start justify-between gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{pipeLabel(line.name, line.dimension)}</p>
                          {line.sku ? <p className="text-xs text-muted-foreground">{line.sku}</p> : null}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-foreground tabular">{qtyLabel(line.quantity, line.unit)}</p>
                          <p className="text-xs text-muted-foreground tabular">
                            {line.line_total === null || line.line_total === undefined
                              ? "Pris mangler"
                              : `${kr(line.line_total)} kr`}
                          </p>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-3 py-2 bg-muted/50">
                      <span className="text-sm font-semibold text-foreground">Sum eks. mva</span>
                      <span className="text-sm font-bold text-primary tabular">{kr(open.total)} kr</span>
                    </div>
                  </div>
                </div>

                {open.comment ? (
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-1.5">Kommentar fra kunden</p>
                    <p className="text-sm text-foreground bg-muted/60 rounded-lg px-3 py-2 whitespace-pre-wrap">{open.comment}</p>
                  </div>
                ) : null}

                {open.signature ? (
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-1.5">Signatur</p>
                    <img
                      src={open.signature}
                      alt={`Signatur fra ${open.customer_name}`}
                      className="w-full max-w-xs rounded-lg border border-border bg-white"
                    />
                  </div>
                ) : null}

                {/* Ei bestilling byter status gjennom knappane over: godkjenning og
                    avvisning flyttar rør, og det gjer ikkje ein statusveljar. */}
                {!erBestilling(open) ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="ordre-status-detalj">Status</Label>
                    <Select value={open.status} onValueChange={(v) => changeStatus(open.id, v as OrderStatus)}>
                      <SelectTrigger id="ordre-status-detalj" className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((s) => (
                          <SelectItem key={s} value={s}>
                            {ORDER_STATUS_LABEL[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <Label htmlFor="ordre-notat">Internt notat</Label>
                  <Textarea
                    id="ordre-notat"
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Synlig kun for administratorer"
                  />
                  <Button variant="outline" onClick={() => saveNote(open.id)} disabled={busy || note === (open.admin_note ?? "")}>
                    Lagre notat
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button variant="outline" className="h-11" onClick={() => orderPdf(open)}>
                    <Download className="h-4 w-4 mr-2" aria-hidden="true" />
                    Last ned PDF
                  </Button>
                  <Button variant="destructive" className="h-11" onClick={() => setConfirmDelete(true)} disabled={busy}>
                    <Trash2 className="h-4 w-4 mr-2" aria-hidden="true" />
                    Slett
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">Registrert {shortDate(open.created_at)}</p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slette bestillingen?</AlertDialogTitle>
            <AlertDialogDescription>
              {open
                ? `#${open.order_number} fra ${open.customer_name} blir slettet for godt. ${
                    open.stock_drawn_at === null
                      ? "Lageret ble aldri trukket for denne, så beholdningen endres ikke."
                      : "Rørene blir lagt tilbake på lageret."
                  }`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => open && removeOrder(open)}
            >
              Slett bestilling
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 4: Tallet på fanen**

I `src/pages/AdminDashboard.tsx`:

1. Legg til importen `import { useWaitingPickupOrders } from "@/lib/pickup-orders";` etter importen av `ToOrderTab`.
2. Rett etter linja `const isSuperAdmin = role === "super_admin";`:

```tsx
  // Talet på fana Bestillinger. Berre for kontoret: ein prosjektbrukar blir
  // send vidare, og ein utan rolle ser ingen faner.
  const venter = useWaitingPickupOrders(roleKnown && role !== null && role !== "prosjekt");
  const antallVenter = venter.data?.length ?? 0;
```

3. Inni `TabsTrigger`, rett etter `{label}`:

```tsx
                  {value === "bestillinger" && antallVenter > 0 ? (
                    <span className="tabular ml-0.5 min-w-[1.25rem] rounded-full bg-destructive px-1.5 text-center text-[0.7rem] font-bold leading-5 text-destructive-foreground">
                      {antallVenter}
                      <span className="sr-only"> venter på godkjenning</span>
                    </span>
                  ) : null}
```

- [ ] **Step 5: Fakturagrunnlaget viser bare det som har forlatt lageret**

I `src/components/admin/InvoiceTab.tsx`, erstatt linja `const orders = uninvoiced.data ?? [];` med:

```tsx
  // Ei bestilling som ventar, eller som er avvist, har ingen rør på seg å
  // fakturere. Basen nektar henne uansett (pipe_create_invoice); her blir ho
  // ikkje ein gong vist. Før migrasjonen er feltet undefined, og då er alt uttak.
  const orders = (uninvoiced.data ?? []).filter((o) => o.stock_drawn_at !== null);
```

- [ ] **Step 6: Typesjekk, lint, tester og bygg**

Run: `npx tsc -p tsconfig.app.json --noEmit; npx eslint src/components/StatusBadge.tsx src/components/admin/PickupQueue.tsx src/components/admin/OrdersTab.tsx src/pages/AdminDashboard.tsx src/components/admin/InvoiceTab.tsx && npx vitest run && npm run build`
Expected: bare grunnlinjefeilene fra `tsc`; ingen nye eslint-feil (InvoiceTab kan ha advarsler fra før); alle tester passerer; bygget går gjennom.

- [ ] **Step 7: Sjekk i nettleseren**

Logg inn på `/login` i forhåndsvisningen hvis du har en testbruker, ellers hopp over. Åpne `/admin?fane=bestillinger` og se at typefilteret finnes, at lista oppfører seg som før for uttak, og at det ikke er feil i konsollen. Før migrasjonen er stripen «Venter på godkjenning» usynlig og tallet på fanen borte – det er riktig.

- [ ] **Step 8: Commit**

```bash
git add src/components/StatusBadge.tsx src/components/admin/PickupQueue.tsx src/components/admin/OrdersTab.tsx src/pages/AdminDashboard.tsx src/components/admin/InvoiceTab.tsx
git commit -m "Bestilling: kontorets side i adminpanelet

Stripen «Venter på godkjenning» ligger øverst i Bestillinger med
«Henter nå» først og tallet på fanen, og oppdateres hvert minutt.
Godkjenn og Avvis går gjennom databasefunksjonene og ber om e-post etterpå.
Panelet sier om kunden fikk den. Lista får et typefilter, og
bestillinger vises med hentedag, lagerstatus per linje og e-postlogg.

Massehandlingen hopper over bestillinger, og fakturagrunnlaget viser
bare det som har forlatt lageret.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 15: Innstillingene for bestilling på nett

**Files:**
- Modify: `src/components/admin/SettingsTab.tsx`

**Interfaces:**
- Consumes: `saveSettings` (Task 6, med norske meldinger for reglene), `PipeSettingsRow` med de nye feltene.
- Produces: kortet «Bestilling på nett» med bryteren, varseladressen og betalingsfristen.

- [ ] **Step 1: Utkastet**

I `src/components/admin/SettingsTab.tsx`:

1. I typen `Draft`, rett etter `require_signature: boolean;`:

```ts
  accept_orders: boolean;
  order_email: string;
  payment_terms_days: string;
```

2. I `toDraft`, rett etter `require_signature: s.require_signature === true,`:

```ts
  accept_orders: s.accept_orders === true,
  order_email: s.order_email ?? "",
  payment_terms_days: String(s.payment_terms_days ?? 14),
```

3. Legg `ExternalLink` til i importen fra `lucide-react` (etter `Loader2`).

- [ ] **Step 2: Lagringen**

I `save`-mutasjonens `mutationFn`, rett etter blokken som validerer `markup` (linja `throw new Error(\`Påslaget må være et tall mellom 0 og ${MAX_MARKUP}.\`);` og dens `}`):

```ts
      const frist = Number(draft.payment_terms_days.trim());
      if (!Number.isInteger(frist) || frist < 0 || frist > 90) {
        throw new Error("Betalingsfristen må være et helt antall dager mellom 0 og 90.");
      }
      const varsel = draft.order_email.trim();
      if (varsel && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(varsel)) {
        throw new Error("E-postadressen for varsler ser ikke riktig ut.");
      }
```

Og rett før `await saveSettings(patch);`:

```ts
      // Bestillingsfelta blir berre sende når dei er endra. Er appen rulla ut før
      // migrasjonen, finst ikkje kolonnene – og då skal resten av innstillingane
      // framleis kunne lagrast.
      const bestillingEndra =
        !base ||
        draft.accept_orders !== base.accept_orders ||
        draft.order_email !== base.order_email ||
        draft.payment_terms_days !== base.payment_terms_days;
      if (bestillingEndra) {
        patch.accept_orders = draft.accept_orders;
        patch.order_email = orNull(draft.order_email);
        patch.payment_terms_days = frist;
      }
```

- [ ] **Step 3: Kortet**

Rett etter definisjonen av `toggles` (etter den avsluttende `];` for lista), legg til:

```tsx
  // Bryteren kan ikkje slåast på før seljaren finst – same regel som
  // pipe_settings_accept_orders_check i basen.
  const mangler = [
    !draft.company_name.trim() && "firmanavn",
    !draft.org_number.trim() && "organisasjonsnummer",
    !draft.address.trim() && "adresse",
    !draft.email.trim() && "e-post",
  ].filter(Boolean) as string[];
  const manglerTekst = mangler.join(", ").replace(/, ([^,]*)$/, " og $1");
```

Og rett etter `</Card>` som avslutter kortet «Hva kundeskjemaet krever» (før kommentaren `{/* Sticky slik at knappen ...`), legg til:

```tsx
      <Card className="hm-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Bestilling på nett</CardTitle>
          <p className="text-sm text-muted-foreground">
            Butikken på /bestill, der bedrifter og privatpersoner bestiller rør til henting. Hver bestilling må
            godkjennes under Bestillinger før lageret trekkes.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
            <div>
              <Label htmlFor="inn-accept_orders" className="cursor-pointer text-sm font-semibold">
                Ta imot bestillinger på nett
              </Label>
              <p className="mt-1 max-w-prose pr-12 text-xs text-muted-foreground">
                {mangler.length && !draft.accept_orders
                  ? `Fyll ut ${manglerTekst} under Firmaopplysninger først. Vilkårene og angreskjemaet kunden får, må si hvem som selger og hvor en angremelding skal sendes.`
                  : "Av: /bestill sier «ring oss», og ingen bestilling tas imot. Les vilkårene før du slår på."}
              </p>
            </div>
            <Switch
              id="inn-accept_orders"
              checked={draft.accept_orders}
              disabled={!draft.accept_orders && mangler.length > 0}
              onCheckedChange={(v) => set("accept_orders", v)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="inn-ordre-epost">Varsel om nye bestillinger sendes til</Label>
              <Input
                id="inn-ordre-epost"
                className="h-11"
                type="email"
                inputMode="email"
                placeholder={draft.email || "kontor@firma.no"}
                value={draft.order_email}
                onChange={(e) => set("order_email", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Tom betyr firmaets e-post. Varselet går for hver bestilling, også dem som skal hentes en annen dag.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inn-frist">Betalingsfrist (dager)</Label>
              <Input
                id="inn-frist"
                className="h-11 tabular"
                inputMode="numeric"
                value={draft.payment_terms_days}
                onChange={(e) => set("payment_terms_days", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Står i vilkårene, i kassen, på PDF-en og i e-postene.</p>
            </div>
          </div>

          <Button asChild variant="outline" size="sm">
            <Link to="/vilkar" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
              Se vilkårene kunden møter
            </Link>
          </Button>
        </CardContent>
      </Card>
```

- [ ] **Step 4: Typesjekk, lint og bygg**

Run: `npx tsc -p tsconfig.app.json --noEmit; npx eslint src/components/admin/SettingsTab.tsx && npm run build`
Expected: bare grunnlinjefeilene, ingen eslint-feil, bygget går gjennom.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/SettingsTab.tsx
git commit -m "Innstillinger: bestilling på nett

Bryteren «Ta imot bestillinger på nett» er grå til firmanavn, org.nr.,
adresse og e-post er fylt ut, og sier hva som mangler. Varseladressen
og betalingsfristen står ved siden av. Feltene sendes bare når de er
endret, så resten av innstillingene kan lagres selv om migrasjonen
ikke er kjørt ennå.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 16: E-postfunksjonen

**Files:**
- Create: `supabase/functions/bestilling-epost/epost.ts`
- Create: `supabase/functions/bestilling-epost/index.ts`
- Test: `src/test/bestilling-epost.test.ts`

**Interfaces:**
- Consumes: `angrerettAvsnitt`, `angreskjema`, `angrerettSomTekst`, `Selger` (Task 5); `summer`, `prisInklMva` (Task 4); `visOrgnr`; SQL-funksjonene `pipe_email_claim`, `pipe_email_mark_sent`, `pipe_email_release` (Task 3). Klienten kaller den med `{ id }` (Task 6).
- Produces: `byggEpost(type, krav, appUrl, til): Epost | null`, `esc(v)`, typene `Krav`, `Bestilling`, `Linje`, `Firma`, `Epost`, `EpostType`; kantfunksjonen svarer `{ satt_opp, sendt: string[], feilet: string[] }`.

- [ ] **Step 1: Skriv testene**

Create `src/test/bestilling-epost.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { byggEpost, esc, type Bestilling, type Krav } from "../../supabase/functions/bestilling-epost/epost.ts";

const APP = "https://rorlager.no";
const ID = "11111111-2222-3333-4444-555555555555";

const krav = (over: Partial<Bestilling> = {}): Krav => ({
  emails: [],
  order: {
    id: ID,
    order_number: 1042,
    created_at: "2026-09-24T10:00:00Z",
    status: "ny",
    pickup_date: "2026-10-02",
    pickup_now: false,
    customer_type: "privat",
    customer_name: "Ola <b>Privat</b>",
    customer_email: "ola@privat.no",
    customer_phone: "900 00 000",
    company: null,
    org_number: null,
    billing_address: "Bakkevegen 3, 5700 Voss",
    comment: "Ring meg <script>alert(1)</script>",
    customer_message: null,
    total: 1350,
    ...over,
  },
  lines: [
    { name: "PVC 110", dimension: null, sku: "B-110", unit: "m", quantity: 12.5, unit_price: 100, line_total: 1250, stock: 10 },
    { name: "Bend", dimension: null, sku: null, unit: "stk", quantity: 4, unit_price: 25, line_total: 100, stock: 6 },
  ],
  company: {
    name: "Hauge Maskin AS",
    org_number: "974760673",
    address: "Industrivegen 1, 5700 Voss",
    phone: "56 00 00 00",
    email: "post@hauge.no",
    pickup_note: "Åpent 07–15",
    vat_rate: 25,
    payment_terms_days: 14,
  },
});

const bedrift = { customer_type: "bedrift" as const, company: "Firma AS", org_number: "974760673", billing_address: null };

describe("esc", () => {
  it("kodar alt som kan tolkast som markering", () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});

describe("kvitteringa til kunden", () => {
  const e = byggEpost("kvittering", krav(), APP, "ola@privat.no")!;

  it("har emne med nummer og firma", () => {
    expect(e.subject).toBe("Bestilling nr. 1042 er mottatt – Hauge Maskin AS");
  });

  it("lenkjer til bestillinga på APP_URL", () => {
    expect(e.html).toContain(`${APP}/bestilling/${ID}`);
    expect(e.text).toContain(`${APP}/bestilling/${ID}`);
  });

  it("kodar namnet og tek ikkje med kommentaren", () => {
    expect(e.html).toContain("Ola &lt;b&gt;Privat&lt;/b&gt;");
    expect(e.html).not.toContain("<b>Privat</b>");
    expect(e.html).not.toContain("Ring meg");
    expect(e.text).not.toContain("Ring meg");
  });

  it("viser summen med mva for ein privatperson", () => {
    expect(e.html).toMatch(/1\s687,50/);
    expect(e.html).toContain("inkl. mva");
  });

  it("har angreretten og angreskjemaet for ein privatperson", () => {
    expect(e.html).toContain("14 dagers angrerett");
    expect(e.html).toContain("Angreskjema");
    expect(e.text).toContain("ANGRESKJEMA");
  });

  it("har ikkje angrerett for ei bedrift", () => {
    const b = byggEpost("kvittering", krav(bedrift), APP, "ola@privat.no")!;
    expect(b.html).not.toContain("angrerett");
    expect(b.html).toContain("eks. mva");
  });

  it("svar går til firmaet", () => {
    expect(e.replyTo).toBe("post@hauge.no");
  });
});

describe("varselet til kontoret", () => {
  it("seier kva dag bestillinga skal hentast", () => {
    expect(byggEpost("kontor", krav(), APP, "ordre@hauge.no")!.subject).toBe("Ny bestilling nr. 1042 – hentes fredag 2. oktober");
  });

  it("set «Henter nå» først i emnet", () => {
    expect(byggEpost("kontor", krav({ ...bedrift, pickup_now: true }), APP, "ordre@hauge.no")!.subject).toBe(
      "Henter nå: bestilling nr. 1042 – Firma AS",
    );
  });

  it("tek ikkje med linjeskift i emnet", () => {
    const e = byggEpost("kontor", krav({ ...bedrift, pickup_now: true, company: "Firma\nBcc: x@y.no" }), APP, "o@h.no")!;
    expect(e.subject).not.toMatch(/[\r\n]/);
  });

  it("har kommentaren, koda", () => {
    const e = byggEpost("kontor", krav(), APP, "ordre@hauge.no")!;
    expect(e.html).toContain("Ring meg &lt;script&gt;");
    expect(e.html).not.toContain("<script>");
  });

  it("åtvarar når lageret viser for lite", () => {
    expect(byggEpost("kontor", krav(), APP, "ordre@hauge.no")!.html).toContain("For lite på lager");
  });

  it("lenkjer til adminpanelet, og svar går til kunden", () => {
    const e = byggEpost("kontor", krav(), APP, "ordre@hauge.no")!;
    expect(e.html).toContain(`${APP}/admin?fane=bestillinger`);
    expect(e.replyTo).toBe("ola@privat.no");
  });
});

describe("klar og avvist", () => {
  it("«klar» har meldinga frå kontoret og er ordrestadfestinga", () => {
    const e = byggEpost("klar", krav({ status: "behandlet", customer_message: "Port <2>" }), APP, "ola@privat.no")!;
    expect(e.subject).toBe("Bestilling nr. 1042 er klar til henting – Hauge Maskin AS");
    expect(e.html).toContain("Port &lt;2&gt;");
    expect(e.html).toContain("ordrebekreftelsen");
    expect(e.html).toContain("14 dagers angrerett");
  });

  it("«avvist» har grunngjevinga", () => {
    const e = byggEpost("avvist", krav({ status: "avvist", customer_message: "Utgått hos leverandøren" }), APP, "ola@privat.no")!;
    expect(e.subject).toBe("Bestilling nr. 1042 – vi kan dessverre ikke levere");
    expect(e.html).toContain("Utgått hos leverandøren");
    expect(e.text).toContain("Utgått hos leverandøren");
  });
});

describe("lenkjene", () => {
  it("peikar berre på APP_URL", () => {
    for (const type of ["kvittering", "kontor", "klar", "avvist"] as const) {
      const e = byggEpost(type, krav(), APP, "x@y.no")!;
      const lenkjer = e.html.match(/https?:\/\/[^"'\s<]+/g) ?? [];
      expect(lenkjer.every((l) => l.startsWith(APP))).toBe(true);
    }
  });

  it("tåler skråstrek på slutten av APP_URL", () => {
    expect(byggEpost("kvittering", krav(), `${APP}/`, "x@y.no")!.html).toContain(`${APP}/bestilling/${ID}`);
  });

  it("gir null utan bestilling", () => {
    expect(byggEpost("kvittering", { emails: [] }, APP, "x@y.no")).toBeNull();
  });
});
```

- [ ] **Step 2: Kjør testene og se at de feiler**

Run: `npx vitest run src/test/bestilling-epost.test.ts`
Expected: FAIL — fila `epost.ts` finnes ikke.

- [ ] **Step 3: Skriv e-postene**

Create `supabase/functions/bestilling-epost/epost.ts`:

```ts
/**
 * E-postane for bestillingane: reine funksjonar av det pipe_email_claim gir.
 *
 * Ligg for seg sjølv fordi index.ts kallar Deno.serve() i det han blir lasta,
 * og då kan han ikkje importerast av ein test. Her er ingen Deno, ikkje nettverk
 * og ingen tilstand – berre data inn og tekst ut.
 *
 * Tabellar og innebygde stilar, ikkje flexbox og ikkje stilark: e-postklientar er
 * tjue år bak nettlesarane, og Outlook teiknar med Word.
 */

import { angreskjema, angrerettAvsnitt, angrerettSomTekst, type Selger } from "../_shared/angrerett.ts";
import { prisInklMva, summer } from "../_shared/mva.ts";
import { visOrgnr } from "../_shared/orgnr.ts";

export type EpostType = "kvittering" | "kontor" | "klar" | "avvist";

export type Linje = {
  name: string;
  dimension: string | null;
  sku: string | null;
  unit: string;
  quantity: number;
  unit_price: number | null;
  line_total: number | null;
  /** Beholdninga no. Berre kontoret sin e-post viser henne. */
  stock: number | null;
};

export type Bestilling = {
  id: string;
  order_number: number;
  created_at: string;
  status: string;
  pickup_date: string;
  pickup_now: boolean;
  customer_type: "privat" | "bedrift";
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  company: string | null;
  org_number: string | null;
  billing_address: string | null;
  comment: string | null;
  customer_message: string | null;
  total: number;
};

export type Firma = {
  name: string;
  org_number: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  pickup_note: string | null;
  vat_rate: number;
  payment_terms_days: number;
};

/** Det pipe_email_claim svarar. order, lines og company manglar når ingenting skal sendast. */
export type Krav = { emails: { type: EpostType; to: string }[]; order?: Bestilling; lines?: Linje[]; company?: Firma };

export type Epost = { to: string; subject: string; html: string; text: string; replyTo?: string };

/*
 * Namn, firma, adresse, kommentar og meldinga frå kontoret er fritekst. Dei skal
 * visast som tekst og aldri tolkast som markering.
 */
export const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Fritekst som HTML: koda, med linjeskift som <br>. */
const fritekst = (v: unknown) => esc(v).replace(/\r?\n/g, "<br>");

/** Emnefeltet kan ikkje ha linjeskift – det er vegen inn til eigne e-posthovud. */
const einLinje = (s: string) => s.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();

const kr = (n: number) => Number(n).toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tal = (n: number) => Number(n).toLocaleString("nb-NO", { maximumFractionDigits: 2 });

/** «2026-10-02» -> «fredag 2. oktober». */
export function dag(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  if (!m) return String(iso ?? "");
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return new Intl.DateTimeFormat("nb-NO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(d);
}

const selger = (f: Firma): Selger => ({
  navn: f.name,
  orgnr: f.org_number,
  adresse: f.address,
  epost: f.email,
  telefon: f.phone,
  betalingsfrist: f.payment_terms_days,
  henteinfo: f.pickup_note,
});

const namnPaVare = (l: Linje) => (l.dimension ? `${l.name} ${l.dimension}` : l.name);
const hentes = (o: Bestilling) => (o.pickup_now ? `Henter nå – ${dag(o.pickup_date)}` : dag(o.pickup_date));

/* ---------------------------------------------------------------- byggjeklossar */

/** verdiHtml må vere koda av den som kallar. Tom verdi gir inga rad. */
const rad = (merke: string, verdiHtml: string) =>
  verdiHtml
    ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:14px;white-space:nowrap;vertical-align:top">${esc(
        merke,
      )}</td><td style="padding:4px 0;font-size:14px">${verdiHtml}</td></tr>`
    : "";

const knapp = (url: string, tekst: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0"><tr><td style="background:#d3121c;border-radius:8px"><a href="${esc(
    url,
  )}" style="display:inline-block;padding:12px 20px;color:#ffffff;font-weight:600;font-size:15px;text-decoration:none">${esc(
    tekst,
  )}</a></td></tr></table>`;

const boks = (tittel: string, innhaldHtml: string) =>
  `<div style="margin:0 0 16px;padding:12px 14px;background:#f3f4f6;border-radius:8px;font-size:14px"><div style="color:#6b7280;font-size:13px;margin-bottom:2px">${esc(
    tittel,
  )}</div>${innhaldHtml}</div>`;

function varetabell(o: Bestilling, linjer: Linje[], f: Firma, visLager: boolean): string {
  const medMva = o.customer_type === "privat";
  const rader = linjer
    .map((l) => {
      const pris = l.unit_price === null ? null : medMva ? prisInklMva(l.unit_price, f.vat_rate) : l.unit_price;
      const belop = l.line_total === null ? null : medMva ? summer([l.line_total], f.vat_rate).inkl : l.line_total;
      const kort = visLager && l.stock !== null && l.quantity > l.stock;
      const lager =
        visLager && l.stock !== null
          ? `<div style="font-size:12px;color:${kort ? "#b45309" : "#6b7280"};margin-top:2px">${
              kort ? "For lite på lager: " : "På lager: "
            }${esc(tal(l.stock))} ${esc(l.unit)}</div>`
          : "";
      return `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb"><div style="font-weight:600">${esc(namnPaVare(l))}</div>${
          pris === null ? "" : `<div style="font-size:12px;color:#6b7280">${esc(kr(pris))} kr/${esc(l.unit)}</div>`
        }${lager}</td>
        <td style="padding:10px 0 10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap;vertical-align:top">${esc(
          tal(l.quantity),
        )} ${esc(l.unit)}</td>
        <td style="padding:10px 0 10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap;vertical-align:top">${
          belop === null ? "–" : `${esc(kr(belop))} kr`
        }</td>
      </tr>`;
    })
    .join("");

  const s = summer([o.total], f.vat_rate);
  const sumRad = (merke: string, verdi: number, sterk = false) =>
    `<tr><td colspan="2" style="padding:4px 0;font-size:14px;${sterk ? "font-weight:700" : "color:#6b7280"}">${esc(
      merke,
    )}</td><td style="padding:4px 0;text-align:right;white-space:nowrap;font-size:14px;${
      sterk ? "font-weight:700" : "color:#6b7280"
    }">${esc(kr(verdi))} kr</td></tr>`;

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="padding-bottom:6px;font-size:13px;color:#6b7280;border-bottom:2px solid #111827">Vare (${
        medMva ? "inkl. mva" : "eks. mva"
      })</td>
      <td style="padding-bottom:6px;font-size:13px;color:#6b7280;border-bottom:2px solid #111827;text-align:right">Mengde</td>
      <td style="padding-bottom:6px;font-size:13px;color:#6b7280;border-bottom:2px solid #111827;text-align:right">Beløp</td>
    </tr>
    ${rader}
    <tr><td colspan="3" style="padding-top:8px"></td></tr>
    ${sumRad("Sum eks. mva", s.eks)}
    ${sumRad(`Mva ${tal(f.vat_rate)} %`, s.mva)}
    ${sumRad("Sum inkl. mva", s.inkl, true)}
  </table>`;
}

function varelinjerTekst(o: Bestilling, linjer: Linje[], f: Firma, visLager = false): string[] {
  const medMva = o.customer_type === "privat";
  const s = summer([o.total], f.vat_rate);
  return [
    `Varer (${medMva ? "inkl. mva" : "eks. mva"}):`,
    ...linjer.map((l) => {
      const belop = l.line_total === null ? null : medMva ? summer([l.line_total], f.vat_rate).inkl : l.line_total;
      const lager = visLager && l.stock !== null ? ` (på lager: ${tal(l.stock)} ${l.unit})` : "";
      return `- ${namnPaVare(l)}: ${tal(l.quantity)} ${l.unit}${belop === null ? "" : ` – ${kr(belop)} kr`}${lager}`;
    }),
    "",
    `Sum eks. mva: ${kr(s.eks)} kr`,
    `Mva ${tal(f.vat_rate)} %: ${kr(s.mva)} kr`,
    `Sum inkl. mva: ${kr(s.inkl)} kr`,
  ];
}

/**
 * Angreretten og skjemaet i sjølve e-posten. Ein forbrukar skal ha dei på eit
 * varig medium, og ei lenkje til ei nettside er ikkje det – sida kan endrast.
 */
function angrerettHtml(f: Firma): string {
  const s = selger(f);
  const a = angrerettAvsnitt(s);
  const k = angreskjema(s);
  return `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:13px;color:#374151;line-height:1.5">
    <div style="font-weight:700;font-size:15px;margin-bottom:6px">${esc(a.tittel)}</div>
    ${a.tekst.map((t) => `<p style="margin:0 0 8px">${esc(t)}</p>`).join("")}
    <div style="font-weight:700;font-size:15px;margin:16px 0 6px">${esc(k.tittel)}</div>
    <p style="margin:0 0 8px">${esc(k.ingress)}</p>
    ${k.felt
      .map((felt) => `<p style="margin:0 0 14px">${esc(felt)}<br><span style="color:#9ca3af">____________________________________</span></p>`)
      .join("")}
    <p style="margin:0;font-size:12px;color:#6b7280">${esc(k.fotnote)}</p>
  </div>`;
}

const henting = (f: Firma) =>
  `${f.address ? `Varene hentes på lageret, ${esc(f.address)}.` : "Varene hentes på lageret."}${
    f.pickup_note ? ` ${fritekst(f.pickup_note)}` : ""
  }`;

const hentingTekst = (f: Firma) =>
  `${f.address ? `Varene hentes på lageret, ${f.address}.` : "Varene hentes på lageret."}${f.pickup_note ? ` ${f.pickup_note}` : ""}`;

function firmaFot(f: Firma): string {
  const kontakt = [f.phone ? `telefon ${esc(f.phone)}` : "", f.email ? `e-post ${esc(f.email)}` : ""].filter(Boolean).join(", ");
  return `${esc(f.name)}${f.org_number ? ` · org.nr. ${esc(visOrgnr(f.org_number))}` : ""}${f.address ? ` · ${esc(f.address)}` : ""}${
    kontakt ? `<br>Du når oss på ${kontakt}.` : ""
  }`;
}

function ramme(f: Firma, tittel: string, innhaldHtml: string, fotHtml: string): string {
  return `<!doctype html>
<html lang="nb"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f3f4f6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;padding:28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827">
  <tr><td style="padding-bottom:4px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280">${esc(f.name)}</td></tr>
  <tr><td style="padding-bottom:18px;font-size:22px;font-weight:700">${esc(tittel)}</td></tr>
  <tr><td>${innhaldHtml}</td></tr>
  <tr><td style="padding-top:24px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5">${fotHtml}</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/* ---------------------------------------------------------------- e-postane */

function kvittering(o: Bestilling, linjer: Linje[], f: Firma, app: string, til: string): Epost {
  const url = `${app}/bestilling/${o.id}`;
  const privat = o.customer_type === "privat";
  const neste = o.pickup_now
    ? "Kontoret har fått beskjed om at du henter nå."
    : "Kontoret går gjennom den, og du får en ny e-post når varene er klare til henting.";
  const grunn = `Du får denne e-posten fordi adressen ble oppgitt i en bestilling hos ${f.name}. Var det ikke deg, kan du se bort fra den.`;

  const innhald = `
    <p style="margin:0 0 16px;font-size:15px">Hei ${esc(o.customer_name)}. Takk for bestillingen. ${esc(neste)}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:16px">
      ${rad("Bestilling", `nr. ${esc(o.order_number)}`)}
      ${rad("Status", "Venter på godkjenning")}
      ${rad("Hentes", esc(hentes(o)))}
      ${rad("Betaling", `Faktura, ${esc(f.payment_terms_days)} dager`)}
    </table>
    ${varetabell(o, linjer, f, false)}
    <div style="margin-top:20px">${knapp(url, "Se bestillingen og last ned PDF")}</div>
    <p style="margin:12px 0 0;font-size:14px;color:#374151">${henting(f)}</p>
    ${privat ? angrerettHtml(f) : ""}`;

  return {
    to: til,
    subject: einLinje(`Bestilling nr. ${o.order_number} er mottatt – ${f.name}`),
    html: ramme(f, "Vi har mottatt bestillingen din", innhald, `${firmaFot(f)}<br><br>${esc(grunn)}`),
    text: [
      `Vi har mottatt bestillingen din – ${f.name}`,
      "",
      `Hei ${o.customer_name}. Takk for bestillingen. ${neste}`,
      "",
      `Bestilling nr. ${o.order_number}`,
      "Status: Venter på godkjenning",
      `Hentes: ${hentes(o)}`,
      `Betaling: Faktura, ${f.payment_terms_days} dager`,
      "",
      ...varelinjerTekst(o, linjer, f),
      "",
      `Se bestillingen og last ned PDF: ${url}`,
      hentingTekst(f),
      "",
      ...(privat ? [angrerettSomTekst(selger(f)), ""] : []),
      grunn,
    ].join("\n"),
    replyTo: f.email ?? undefined,
  };
}

function kontor(o: Bestilling, linjer: Linje[], f: Firma, app: string, til: string): Epost {
  const privat = o.customer_type === "privat";
  const kunde = o.company ?? o.customer_name;
  const url = `${app}/admin?fane=bestillinger`;
  const telefon = o.customer_phone
    ? `<a href="tel:${esc(o.customer_phone.replace(/\s/g, ""))}" style="color:#111827">${esc(o.customer_phone)}</a>`
    : "";

  const innhald = `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:16px">
      ${rad("Bestilling", `nr. ${esc(o.order_number)}`)}
      ${rad("Hentes", esc(hentes(o)))}
      ${rad("Bestiller", privat ? "Privatperson" : "Bedrift")}
      ${
        privat
          ? rad("Navn", esc(o.customer_name)) + rad("Fakturaadresse", esc(o.billing_address))
          : rad("Firma", esc(o.company)) +
            rad("Org.nr.", esc(o.org_number ? visOrgnr(o.org_number) : "")) +
            rad("Kontaktperson", esc(o.customer_name))
      }
      ${rad("Telefon", telefon)}
      ${rad("E-post", `<a href="mailto:${esc(o.customer_email)}" style="color:#111827">${esc(o.customer_email)}</a>`)}
    </table>
    ${varetabell(o, linjer, f, true)}
    ${o.comment ? `<div style="margin-top:16px">${boks("Kommentar fra kunden", fritekst(o.comment))}</div>` : ""}
    <div style="margin-top:20px">${knapp(url, "Åpne adminpanelet")}</div>`;

  return {
    to: til,
    subject: einLinje(
      o.pickup_now
        ? `Henter nå: bestilling nr. ${o.order_number} – ${kunde}`
        : `Ny bestilling nr. ${o.order_number} – hentes ${dag(o.pickup_date)}`,
    ),
    html: ramme(
      f,
      o.pickup_now ? "Henter nå" : "Ny bestilling",
      innhald,
      "Sendt automatisk fra rørlageret. Svarer du på denne e-posten, går svaret til kunden.",
    ),
    text: [
      `${o.pickup_now ? "HENTER NÅ" : "Ny bestilling"} – nr. ${o.order_number}`,
      "",
      `Hentes: ${hentes(o)}`,
      `Bestiller: ${privat ? "Privatperson" : "Bedrift"}`,
      ...(privat
        ? [`Navn: ${o.customer_name}`, `Fakturaadresse: ${o.billing_address ?? ""}`]
        : [`Firma: ${o.company ?? ""}`, `Org.nr.: ${o.org_number ? visOrgnr(o.org_number) : ""}`, `Kontaktperson: ${o.customer_name}`]),
      `Telefon: ${o.customer_phone ?? ""}`,
      `E-post: ${o.customer_email}`,
      "",
      ...varelinjerTekst(o, linjer, f, true),
      ...(o.comment ? ["", `Kommentar fra kunden: ${o.comment}`] : []),
      "",
      `Adminpanelet: ${url}`,
    ].join("\n"),
    replyTo: o.customer_email,
  };
}

function klar(o: Bestilling, linjer: Linje[], f: Firma, app: string, til: string): Epost {
  const url = `${app}/bestilling/${o.id}`;
  const privat = o.customer_type === "privat";
  const naar = o.pickup_now ? "nå" : dag(o.pickup_date);
  const stadfesting = `Dette er ordrebekreftelsen din. Du får faktura med ${f.payment_terms_days} dagers betalingsfrist.`;

  const innhald = `
    <p style="margin:0 0 16px;font-size:15px">Hei ${esc(o.customer_name)}. Varene i bestilling nr. ${esc(
      o.order_number,
    )} er klare. Du kan hente ${esc(naar)}.</p>
    ${o.customer_message ? boks("Melding fra oss", fritekst(o.customer_message)) : ""}
    <p style="margin:0 0 16px;font-size:14px;color:#374151">${henting(f)}</p>
    ${varetabell(o, linjer, f, false)}
    <div style="margin-top:20px">${knapp(url, "Se bestillingen og last ned PDF")}</div>
    <p style="margin:12px 0 0;font-size:13px;color:#6b7280">${esc(stadfesting)}</p>
    ${privat ? angrerettHtml(f) : ""}`;

  return {
    to: til,
    subject: einLinje(`Bestilling nr. ${o.order_number} er klar til henting – ${f.name}`),
    html: ramme(f, "Klar til henting", innhald, firmaFot(f)),
    text: [
      `Klar til henting – bestilling nr. ${o.order_number}`,
      "",
      `Hei ${o.customer_name}. Varene er klare. Du kan hente ${naar}.`,
      ...(o.customer_message ? ["", `Melding fra oss: ${o.customer_message}`] : []),
      "",
      hentingTekst(f),
      "",
      ...varelinjerTekst(o, linjer, f),
      "",
      `Se bestillingen og last ned PDF: ${url}`,
      stadfesting,
      ...(privat ? ["", angrerettSomTekst(selger(f))] : []),
    ].join("\n"),
    replyTo: f.email ?? undefined,
  };
}

function avvist(o: Bestilling, f: Firma, til: string): Epost {
  const innhald = `
    <p style="margin:0 0 16px;font-size:15px">Hei ${esc(o.customer_name)}. Vi kan dessverre ikke levere bestilling nr. ${esc(
      o.order_number,
    )}, og du blir ikke fakturert for den.</p>
    ${o.customer_message ? boks("Begrunnelse", fritekst(o.customer_message)) : ""}
    <p style="margin:0;font-size:14px;color:#374151">Ta gjerne kontakt, så finner vi en løsning.</p>`;

  return {
    to: til,
    subject: einLinje(`Bestilling nr. ${o.order_number} – vi kan dessverre ikke levere`),
    html: ramme(f, "Vi kan ikke levere bestillingen", innhald, firmaFot(f)),
    text: [
      `Bestilling nr. ${o.order_number} – vi kan dessverre ikke levere`,
      "",
      `Hei ${o.customer_name}. Vi kan dessverre ikke levere bestillingen, og du blir ikke fakturert for den.`,
      ...(o.customer_message ? ["", `Begrunnelse: ${o.customer_message}`] : []),
      "",
      "Ta gjerne kontakt, så finner vi en løsning.",
      `${f.name}${f.phone ? `, telefon ${f.phone}` : ""}${f.email ? `, e-post ${f.email}` : ""}`,
    ].join("\n"),
    replyTo: f.email ?? undefined,
  };
}

/** Éi e-post av typen. Null når kravet manglar bestillinga eller firmaet. */
export function byggEpost(type: EpostType, krav: Krav, appUrl: string, til: string): Epost | null {
  const o = krav.order;
  const f = krav.company;
  if (!o || !f) return null;
  const app = appUrl.trim().replace(/\/+$/, "");
  const linjer = krav.lines ?? [];
  switch (type) {
    case "kvittering":
      return kvittering(o, linjer, f, app, til);
    case "kontor":
      return kontor(o, linjer, f, app, til);
    case "klar":
      return klar(o, linjer, f, app, til);
    case "avvist":
      return avvist(o, f, til);
    default:
      return null;
  }
}
```

- [ ] **Step 4: Kjør testene og se at de passerer**

Run: `npx vitest run src/test/bestilling-epost.test.ts`
Expected: PASS.

- [ ] **Step 5: Skriv porten**

Create `supabase/functions/bestilling-epost/index.ts`:

```ts
/**
 * Sender e-postane om ei bestilling: kvittering og varsel ved innsending,
 * «klar til henting» og «avvist» når kontoret har handla.
 *
 * DENNE FUNKSJONEN TEK ALDRI IMOT EI E-POSTADRESSE, OG IKKJE EIN E-POSTTYPE.
 * Han tek id-en til ei bestilling og spør basen (pipe_email_claim) kva som står
 * att å sende. Mottakaren kjem frå bestillinga eller innstillingane. Kunne den
 * som kallar velje mottakar, var dette eit gratis spam-relé med Hauge Maskin som
 * avsendar – og kunne han velje type, kunne han fått «klar til henting» sendt
 * for ei bestilling som ikkje er godkjend.
 *
 * LENKJA I E-POSTEN BLIR BYGD AV APP_URL, ALDRI AV FØRESPURNADEN. Elles kunne
 * nokon sendt Origin: ond-side.no og fått ei ekte e-post frå Hauge Maskin til å
 * peike dit.
 *
 * SLÅR SEG PÅ AV SEG SJØLV. Manglar RESEND_API_KEY, EPOST_FRA eller APP_URL,
 * svarar funksjonen «ikkje sett opp» før han ser på nokon bestilling, og
 * ingenting blir merka som sendt.
 *
 * Rullast ut utan JWT-krav (--no-verify-jwt). Han stoler uansett ikkje på den som
 * kallar, og kassen sender ein enkel førespurnad utan eigne hovud, så han kjem
 * fram òg når fana blir lukka.
 */

import { byggEpost, type Krav } from "./epost.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const svar = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return svar({ feil: "Bare POST." }, 405);

  const URL_ = Deno.env.get("SUPABASE_URL");
  const TENESTE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const NOKKEL = Deno.env.get("RESEND_API_KEY");
  const FRA = Deno.env.get("EPOST_FRA");
  const APP = (Deno.env.get("APP_URL") ?? "").trim().replace(/\/+$/, "");

  if (!URL_ || !TENESTE) return svar({ feil: "Funksjonen mangler oppsett." }, 500);

  // Ikkje sett opp er ikkje ein feil. Svaret kjem FØR vi ser på id-en, så
  // ingenting blir merka som sendt i ein periode der ingenting kan sendast.
  if (!NOKKEL || !FRA || !/^https?:\/\/[^/\s]+$/i.test(APP)) {
    return svar({ satt_opp: false, sendt: [], feilet: [] });
  }

  // Kroppen kjem som rein tekst: kassen sender han slik for å sleppe preflight.
  let id: unknown;
  try {
    id = JSON.parse(await req.text())?.id;
  } catch {
    return svar({ feil: "Ugyldig forespørsel." }, 400);
  }
  if (typeof id !== "string" || !UUID.test(id)) return svar({ feil: "Ugyldig forespørsel." }, 400);

  const hovud = { apikey: TENESTE, Authorization: `Bearer ${TENESTE}`, "Content-Type": "application/json" };
  const rpc = (namn: string, args: unknown) =>
    fetch(`${URL_}/rest/v1/rpc/${namn}`, { method: "POST", headers: hovud, body: JSON.stringify(args) });

  const krav = await rpc("pipe_email_claim", { p_order_id: id });
  if (!krav.ok) {
    console.error("pipe_email_claim", krav.status, await krav.text().catch(() => ""));
    return svar({ feil: "Fikk ikke tak i bestillingen." }, 500);
  }
  const data = (await krav.json()) as Krav;
  const eposter = Array.isArray(data?.emails) ? data.emails : [];

  const sendt: string[] = [];
  const feilet: string[] = [];

  for (const e of eposter) {
    const melding = byggEpost(e.type, data, APP, e.to);
    try {
      if (!melding) throw new Error("mangler innhold");
      const ut = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${NOKKEL}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FRA,
          to: [melding.to],
          subject: melding.subject,
          html: melding.html,
          text: melding.text,
          ...(melding.replyTo ? { reply_to: melding.replyTo } : {}),
        }),
      });
      if (!ut.ok) throw new Error(`resend ${ut.status} ${await ut.text().catch(() => "")}`);
      const r = (await ut.json().catch(() => ({}))) as { id?: string };
      await rpc("pipe_email_mark_sent", { p_order_id: id, p_type: e.type, p_provider_id: r.id ?? null });
      sendt.push(e.type);
    } catch (err) {
      // Svaret frå Resend blir logga, men går ikkje ut: det seier mellom anna om
      // domenet er verifisert, og funksjonen blir kalla frå ei heilt open side.
      console.error("bestilling-epost", e.type, String(err));
      // Angre-steget. Utan det ville e-posten vore låst ute for godt.
      await rpc("pipe_email_release", { p_order_id: id, p_type: e.type });
      feilet.push(e.type);
    }
  }

  return svar({ satt_opp: true, sendt, feilet });
});
```

- [ ] **Step 6: Lint og alle tester**

Run: `npx eslint supabase/functions/bestilling-epost supabase/functions/_shared src/test/bestilling-epost.test.ts && npx vitest run && npx tsc -p tsconfig.app.json --noEmit`
Expected: ingen eslint-feil; alle vitest-tester passerer; `tsc` bare grunnlinjefeilene.

Hvis Deno er installert (`deno --version`), kjør også `deno check supabase/functions/bestilling-epost/index.ts`. Hvis ikke: hopp over og si det i sluttrapporten.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/bestilling-epost src/test/bestilling-epost.test.ts
git commit -m "Bestilling: e-postfunksjonen

bestilling-epost tar imot en bestillings-id og ingenting annet, spør
basen hva som står igjen å sende, og sender gjennom Resend. Mottaker og
e-posttype kommer fra basen, lenken fra APP_URL. Mangler nøkkelen,
avsenderen eller adressen, svarer den «ikke satt opp» uten å merke
noe som sendt.

Kvitteringen og «klar til henting» har angreretten og angreskjemaet i
selve e-posten for privatpersoner. Kontoret får kommentaren og
lagerstatusen per linje, og kan svare kunden direkte.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 17: Dokumentasjonen

**Files:**
- Create: `docs/bestilling-epost.md`
- Modify: `README.md`

**Interfaces:** ingen kode.

- [ ] **Step 1: Oppskriften for e-post**

Create `docs/bestilling-epost.md`:

````markdown
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
nytt. Kallet gjøres fra kassen, fra bestillingssiden og fra adminpanelet, så
kontoret får beskjed selv om kunden mistet dekningen idet bestillingen ble sendt.

**Tak:** høyst 10 e-poster per kundeadresse og 90 totalt per døgn (under
gratisgrensen hos Resend på 100), og bare innen et døgn etter hendelsen.

---

## Punktene

### 1. Kjør databaseoppdateringen

Lim `supabase-setup.sql` inn i SQL Editor og kjør den, som vanlig.

### 2. Legg ut funksjonen

Den har tre filer (`index.ts`, `epost.ts` og `../_shared/*`), så den må ut med
Supabase CLI, ikke limes inn i dashbordet:

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
| `APP_URL` | adressen appen ligger på, for eksempel `https://rorlager.vercel.app` |

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

Privatpersoner får angreretten og angreskjemaet **i selve e-posten**, både i
kvitteringen og i «klar til henting». En lenke til en nettside regnes ikke som
varig medium. Fram til e-post er satt opp, ligger det samme i PDF-en kunden
laster ned – skriv den gjerne ut til privatkunder ved henting.

Kundens kommentar står bare i e-posten til kontoret, aldri i den til kunden.

## Når noe ikke går

Adminpanelet viser e-postloggen på hver bestilling, og «Send det som mangler»
prøver på nytt. Loggene fra funksjonen ligger under Supabase → Edge Functions →
`bestilling-epost` → Logs.
````

- [ ] **Step 2: README**

I `README.md`:

1. Rett etter kodeblokken med innkjøpskjeden (den som slutter med `->  avvik til kontoret`) og avsnittet under den (som slutter med «Ingen beholdning trekkes ned av en prosjektbestilling.»), legg til:

````markdown
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
````

2. I tabellen under `## Sider`, legg til disse radene etter raden for `/kvittering`:

```markdown
| `/bestill` | Butikken: søk eller skann, legg i bestillingen |
| `/bestill/kasse` | Når kunden henter, hvem som bestiller, sum og «Bestill med betalingsplikt» |
| `/bestilling/:id` | Status og PDF for én bestilling – samme side som e-posten lenker til |
| `/vilkar` | Kjøpsvilkår, angrerett og angreskjema |
```

3. Rett før `## Priser og avanse`, legg til:

````markdown
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
4. Sett opp e-post etter `docs/bestilling-epost.md` (kan vente – alt annet virker uten).
5. Slå på «Ta imot bestillinger på nett».

Frontend tåler å bli rullet ut før punkt 1: da er butikken stengt, og alt i
panelet oppfører seg som uttak.
````

4. I kodeblokken under `## Struktur`, legg til disse linjene etter linja `    receipt-pdf.ts mottakskontroll – det du sender leverandøren ved reklamasjon`:

```
    pickup-*.ts   bestillingen: kurv, skjema, datalag og PDF
    scanner.ts    tolkningen av skannede koder
    mva.ts, orgnr.ts, vilkar.ts  sender videre fra supabase/functions/_shared
```

og endre linja `supabase/functions/    serverfunksjoner (opprett-bruker: midlertidige passord)` til:

```
supabase/functions/    serverfunksjoner (opprett-bruker, bestilling-epost) og _shared
```

5. Under `## Test`, i avsnittet som begynner «Testene bygger basen fra», legg til en setning sist: «`bestilling.test.mjs` dekker bestillingene: innsending uten lagertrekk, godkjenning og avvisning, regelen om lager og status, takene og e-postlåsen.»

- [ ] **Step 3: Commit**

```bash
git add docs/bestilling-epost.md README.md
git commit -m "Dokumentasjon: bestilling for henting og e-post

README forklarer den tredje kjeden, hvor reglene ligger, og hvordan den
tas i bruk. docs/bestilling-epost.md er oppskriften for Resend og
kantfunksjonen, etter mønster av Leveringsseddel.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 18: Sluttkontroll

**Files:** ingen nye. Retter bare det kontrollen finner.

- [ ] **Step 1: Alt automatisk**

Run: `npx vitest run && npm run bygg:setup && npm run test:db && npx tsc -p tsconfig.app.json --noEmit; npm run build`
Expected: alle vitest-tester passerer; `supabase-setup.sql` uendret etter bygg (sjekk `git status` – ingen endring betyr at den ble committet riktig underveis); «7 testfil(er) kjørte gjennom.»; `tsc` bare grunnlinjefeilene; bygget går gjennom.

- [ ] **Step 2: Lint på alt som er nytt eller endret**

Run: `git diff --name-only 65f8eb7 -- '*.ts' '*.tsx' | xargs npx eslint`
Expected: ingen feil i filene denne grenen har rørt (advarsler fra før er greit).

- [ ] **Step 3: Nettleseren, mot den levende basen**

Med `preview_start` (`vite`), på mobilbredde (`resize_window` preset `mobile`):
- `/` – ingen «Bestill til henting»-knapp (bryteren finnes ikke ennå i den levende basen); «Skann QR-kode» åpner skanneren.
- `/bestill` – «Vi tar ikke imot bestillinger på nett akkurat nå».
- `/vilkar` – ni avsnitt og angreskjemaet.
- `/personvern` – de nye punktene og Resend.
- Konsollen: ingen feil utover 404 på `pipe_public_order_settings`.

- [ ] **Step 4: Nettleseren, med butikken åpen**

Den levende basen har ikke migrasjonen. For å se butikken, kassen og bestillingssiden åpne, bruk `javascript_tool` til å svare på kallene i nettleseren (bare for inspeksjon – ingen kode endres):

```js
const ekte = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  const json = (b) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
  if (url.includes("/pipe_public_order_settings")) return json({ id: 1, accept_orders: true, payment_terms_days: 14 });
  if (url.includes("/rpc/pipe_submit_pickup_order")) return json({ id: "11111111-2222-3333-4444-555555555555", order_number: 9001 });
  if (url.includes("/rpc/pipe_get_pickup_order")) return json({ id: "11111111-2222-3333-4444-555555555555", order_number: 9001, created_at: new Date().toISOString(), status: "ny", pickup_date: new Date().toISOString().slice(0, 10), pickup_now: true, customer_type: "privat", customer_name: "Test Testesen", customer_email: "test@example.com", customer_phone: "900 00 000", company: null, org_number: null, billing_address: "Testveien 1, 5700 Voss", comment: null, customer_message: null, handled_at: null, total: 100, lines: [{ name: "Testrør", dimension: null, sku: null, unit: "m", quantity: 1, unit_price: 100, line_total: 100 }], emails: {} });
  if (url.includes("/functions/v1/bestilling-epost")) return json({ satt_opp: false, sendt: [], feilet: [] });
  return ekte(input, init);
};
```

Kjør det på `/bestill`, og tving ny henting av innstillingene ved å navigere med appens egne lenker (ikke laste siden på nytt – da forsvinner overstyringen). Gå så gjennom: søk, legg en vare i bestillingen, «Til bestilling», fyll ut som privatperson med «Henter nå», se sum eks./inkl. mva og angrerettsteksten, send, og se at `/bestilling/…` viser «Bestillingen er mottatt» og at «Last ned PDF» lager en fil. Ta skjermbilder av butikken, kassen og bestillingssiden.

- [ ] **Step 5: Rydd og commit det som ble rettet**

Retter kontrollen noe: gjør rettingen, kjør Step 1 på nytt, og commit med en melding som sier hva som var feil. Stopp forhåndsvisningen med `preview_stop` og sett `resize_window` tilbake til `desktop`.

---

## Self-review mot specen

| Spec | Oppgave |
| --- | --- |
| Kolonner, regelen om lager og status, innstillinger, e-postlogg | 1 |
| Sletting og faktura lærer forskjellen | 1 |
| Innsending, oppslag på uuid, godkjenning, avvisning, tak, norsk dato | 2 |
| E-postlåsen, ferskhet, tak per mottaker og døgn | 3 |
| Omkjøring og `check:db` | 3 |
| Mva og org.nr. som én kilde | 4 |
| Vilkår, angrerett, angreskjema, kappede rør | 5 |
| Typer, innstillinger, kasseskjema, datalag, `sendBeacon`/`keepalive` | 6 |
| Egen kurv, lagrede kontaktopplysninger, utkast i økten | 7 |
| Felles skanner, iPhone, strekkoder, wasm fra eget domene | 8 |
| Butikken, «ring oss for pris», stengt-visning, lenke fra framsiden | 8, 9 |
| Kassen: henter nå/velg dag, privat/bedrift, sum, angrerett, knappetekst, personvernlenke | 10 |
| PDF med angrerett for privat | 11 |
| Bestillingssiden, 20 s oppdatering, ny e-postforespørsel | 12 |
| `/vilkar`, personvern med Resend | 13 |
| Stripen, tallet på fanen, godkjenn/avvis/hentet/angre, lagerstatus, e-postlogg, massehandling, faktura | 14 |
| Innstillingene med vakten på bryteren | 15 |
| E-postfunksjonen: fire e-poster, sikkerhet, oppsett | 16 |
| README og oppskrift | 17 |
| Testing i nettleseren | 18 |

