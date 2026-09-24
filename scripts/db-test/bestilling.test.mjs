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

// Kun innsendinga skjer som anon – NB: verifikasjonen under leser
// public.pipe_orders direkte, og anon har ingen tilgang til den tabellen (kun
// til funksjonene). Samme mønster som i blokken over: send som anon, les
// tilbake med full tilgang etterpå.
let bedriftId;
await somAnon(db, async () => {
  bedriftId = (
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
  ).r.id;
});
const f = await en(
  `select customer_type, customer_email, company, org_number, billing_address from public.pipe_orders where id = $1`,
  [bedriftId],
);
sjekk(
  "bedrift: org.nr. uten mellomrom, e-post med små bokstaver",
  [f.customer_type, f.customer_email, f.company, f.org_number],
  ["bedrift", "kari@firma.no", "Firma AS", "974760673"],
);
sjekk("og en adresse ingen ba om, blir ikke lagret", f.billing_address, null);

let naaId;
await somAnon(db, async () => {
  naaId = (await en(SEND, privat({ epost: "naa@kunde.no", naa: true, dato: "2020-01-01" }))).r.id;
});
const n = await en(`select pickup_date::text as dag, pickup_now from public.pipe_orders where id = $1`, [naaId]);
sjekk("«henter nå» gir dagens dato, uansett hva klienten sendte", [n.dag, n.pickup_now], [iDag, true]);

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

// ════════════════════════════════════════════════════════════════════════════
console.log(tilstand.feil === 0 ? `\nAlt i orden. Bestillingene holder.\n` : `\n${tilstand.feil} feil.\n`);
process.exit(tilstand.feil === 0 ? 0 : 1);
