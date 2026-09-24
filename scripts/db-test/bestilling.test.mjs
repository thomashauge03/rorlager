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
