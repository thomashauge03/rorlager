// Tester «annet»: linjer utan vare og utan pris, forslaga dei blir til, og
// prisen kontoret set på dei etterpå.
//
// KVIFOR DENNE FILA FINST
//
// Ei annet-linje er det einaste som kjem inn i basen med eigne ord frå kven som
// helst, utan at ei vare i katalogen står bak. Tre ting må halde: lageret blir
// ikkje rørt, forslaga er kontoret sine åleine, og ei bestilling med ein
// førespurnad utan pris kan ikkje godkjennast.
//
// Køyr med: npm run test:db

import { byggBase, som, somAnon, nekta, lagFasit } from "./base.mjs";

const LEIF = { epost: "lager@hauge.no", uid: "55555555-5555-5555-5555-555555555555" };
const KARI = { epost: "kari@plassen.no", uid: "22222222-2222-2222-2222-222222222222" };
const FREMMED = { epost: "fremmed@internett.no", uid: "44444444-4444-4444-4444-444444444444" };

const { tilstand, ok, nei, sjekk } = lagFasit();
const db = await byggBase();
const en = async (sql, p) => (await db.query(sql, p)).rows[0];
const alle = async (sql, p) => (await db.query(sql, p)).rows;
const tal = (v) => (v === null || v === undefined ? v : Number(v));

const avvist = async (tittel, sql, params, mønster) => {
  const m = await nekta(() => db.query(sql, params));
  m && mønster.test(m) ? ok(tittel) : nei(tittel, m ?? "GIKK GJENNOM");
};

const lager = async (id) => tal((await en(`select stock from public.pipe_types where id = $1`, [id])).stock);
const annet = (name, quantity, over = {}) => ({ annet: { name, dimension: null, unit: "m", note: null, ...over }, quantity });

console.log("\n── Oppsett ──\n");

await db.exec(`
  insert into public.system_users (email, full_name, role) values
    ('lager@hauge.no', 'Leif Lager', 'lager'),
    ('kari@plassen.no', 'Kari Nordmann', 'prosjekt');
  update public.pipe_settings
     set company_name = 'Hauge Maskin AS', org_number = '974760673',
         address = 'Industrivegen 1, 5700 Voss', email = 'post@hauge.no',
         phone = '56 00 00 00', accept_orders = true
   where id = 1;
`);
const kat = await en(`insert into public.pipe_categories (name) values ('Annettest') returning id`);
const ROR = (
  await en(
    `insert into public.pipe_types (category_id, name, sku, qr_slug, unit, price, cost_price, stock, active)
     values ($1, 'Annetrør 110', 'A-110', 'annet-110', 'm', 100, 50, 40, true) returning id`,
    [kat.id],
  )
).id;
ok("testvare og innstillinger");

const uttak = (lines, navn = "Ola Kunde") =>
  en(`select public.pipe_submit_order($1, $2::jsonb, null, 'ola@kunde.no') as r`, [navn, JSON.stringify(lines)]);

const bestilling = (lines, epost = "ola@kunde.no") =>
  en(
    `select public.pipe_submit_pickup_order('privat', 'Ola Kunde', $1, $2::jsonb, '99999999', null, null,
       'Vegen 1, 5700 Voss', true, null, null) as r`,
    [epost, JSON.stringify(lines)],
  );

// ════════════════════════════════════════════════════════════════════════════
console.log("\n── Uttak med en annet-linje, fra en kunde ──\n");

const foer = await lager(ROR);
const u = await somAnon(db, async () =>
  (await uttak([{ pipe_type_id: ROR, quantity: 3 }, annet("PE-rør 40 mm", 12.5, { dimension: "40", note: "Hylle 7" })])).r,
);
sjekk("anon kan sende inn et uttak med en annet-linje", typeof u.order_number, "number");
sjekk("summen gjelder bare katalogvaren", tal(u.total), 300);
sjekk(
  "kvitteringen sier hvilken linje som er annet",
  u.lines.map((l) => [l.name, l.annet, l.unit_price]),
  [
    ["Annetrør 110", false, 100],
    ["PE-rør 40 mm", true, null],
  ],
);
sjekk("lageret trekkes bare for katalogvaren", await lager(ROR), foer - 3);

const linje = await en(
  `select id, pipe_type_id, is_annet, unit from public.pipe_order_lines where order_id = $1 and is_annet`,
  [u.id],
);
sjekk("linja lagres uten vare og merket annet", [linje.pipe_type_id, linje.is_annet, linje.unit], [null, true, "m"]);

const f = await en(`select * from public.pipe_suggestions where order_line_id = $1`, [linje.id]);
sjekk(
  "forslaget lagres med teksten, dimensjonen og merknaden",
  [f.name, f.dimension, f.note, tal(f.quantity), f.status],
  ["PE-rør 40 mm", "40", "Hylle 7", 12.5, "ny"],
);
sjekk("og vet at det kom fra en kunde", [f.from_employee, f.submitted_by], [false, "Ola Kunde"]);

// ════════════════════════════════════════════════════════════════════════════
console.log("\n── Uttak fra en ansatt ──\n");

const ua = await som(db, LEIF, async () =>
  (
    await en(`select public.pipe_submit_order('', $1::jsonb, null, null, null, 'Jobb 9000001') as r`, [
      JSON.stringify([annet("Muffe 32", 4, { unit: "stk" })]),
    ])
  ).r,
);
const fa = await en(`select from_employee, submitted_by, unit from public.pipe_suggestions where order_id = $1`, [ua.id]);
sjekk("et uttak med bare annet-linjer går gjennom", tal(ua.total), 0);
sjekk("forslaget fra en ansatt merkes som det, med navnet hans", [fa.from_employee, fa.submitted_by, fa.unit], [true, "Leif Lager", "stk"]);

// ════════════════════════════════════════════════════════════════════════════
console.log("\n── Grensene ──\n");

await somAnon(db, async () => {
  await avvist("tomt navn avvises", `select public.pipe_submit_order('Ola', $1::jsonb, null, 'x@y.no')`,
    [JSON.stringify([annet("   ", 1)])], /Skriv hva varen er/);
  await avvist("for langt navn avvises", `select public.pipe_submit_order('Ola', $1::jsonb, null, 'x@y.no')`,
    [JSON.stringify([annet("x".repeat(121), 1)])], /høyst 120 tegn/);
  await avvist("ukjent enhet avvises", `select public.pipe_submit_order('Ola', $1::jsonb, null, 'x@y.no')`,
    [JSON.stringify([annet("Rør", 1, { unit: "kg" })])], /meter eller stykk/);
  await avvist("for lang merknad avvises", `select public.pipe_submit_order('Ola', $1::jsonb, null, 'x@y.no')`,
    [JSON.stringify([annet("Rør", 1, { note: "x".repeat(301) })])], /høyst 300 tegn/);
  await avvist("mengde null avvises", `select public.pipe_submit_order('Ola', $1::jsonb, null, 'x@y.no')`,
    [JSON.stringify([annet("Rør", 0)])], /Ugyldig mengde/);
  await avvist("tekst som mengde gir norsk melding", `select public.pipe_submit_order('Ola', $1::jsonb, null, 'x@y.no')`,
    [JSON.stringify([{ annet: { name: "Rør", unit: "m" }, quantity: "mye" }])], /Ugyldig mengde/);
  await avvist("annet som ikke er et objekt avvises", `select public.pipe_submit_order('Ola', $1::jsonb, null, 'x@y.no')`,
    [JSON.stringify([{ annet: "Rør", quantity: 1 }])], /Ugyldig linje/);
  await avvist("11 annet-linjer avvises", `select public.pipe_submit_order('Ola', $1::jsonb, null, 'x@y.no')`,
    [JSON.stringify(Array.from({ length: 11 }, (_, i) => annet(`Rør ${i}`, 1)))], /Høyst 10/);
});
sjekk(
  "ingen av de avviste etterlot en ordre eller et forslag",
  [
    tal((await en(`select count(*) from public.pipe_orders where customer_email = 'x@y.no'`)).count),
    tal((await en(`select count(*) from public.pipe_suggestions where submitted_by = 'Ola'`)).count),
  ],
  [0, 0],
);
await somAnon(db, async () => {
  const m = await nekta(() =>
    db.query(`select public.pipe_annet_linje($1, $2::jsonb, 1, 'X')`, [u.id, JSON.stringify(annet("Lurt inn", 1))]),
  );
  m ? ok("anon kan ikke kalle hjelpefunksjonen direkte") : nei("pipe_annet_linje direkte", "GIKK GJENNOM");
});

// ════════════════════════════════════════════════════════════════════════════
console.log("\n── Hvem ser forslagene ──\n");

await somAnon(db, async () => {
  const m = await nekta(() => db.query(`select * from public.pipe_suggestions`));
  m ? ok("anon: forslagene er stengt") : nei("anon leser forslag", "GIKK GJENNOM");
});
for (const [hvem, bruker] of [
  ["prosjektbrukeren", KARI],
  ["en innlogget fremmed", FREMMED],
]) {
  await som(db, bruker, async () => {
    sjekk(`${hvem} ser ingen forslag`, (await alle(`select id from public.pipe_suggestions`)).length, 0);
    const r = await db.query(`update public.pipe_suggestions set status = 'avvist'`);
    sjekk(`og endrer ingen`, r.affectedRows ?? 0, 0);
    const m = await nekta(() => db.query(`insert into public.pipe_suggestions (name, unit, quantity) values ('X', 'm', 1)`));
    m ? ok("og kan ikke legge inn egne") : nei(`${hvem} legger inn forslag`, "GIKK GJENNOM");
  });
}
await som(db, LEIF, async () => {
  sjekk("kontoret ser alle forslagene", (await alle(`select id from public.pipe_suggestions`)).length, 2);
  await db.query(`update public.pipe_suggestions set status = 'avvist', handled_at = now() where id = $1`, [f.id]);
  sjekk("og kan lukke et", (await en(`select status from public.pipe_suggestions where id = $1`, [f.id])).status, "avvist");
  await db.query(`update public.pipe_suggestions set status = 'ny', handled_at = null where id = $1`, [f.id]);
  const m = await nekta(() => db.query(`delete from public.pipe_suggestions where id = $1`, [f.id]));
  m ? ok("men ikke slette det") : nei("kontoret sletter forslag", "GIKK GJENNOM");
});

// ════════════════════════════════════════════════════════════════════════════
console.log("\n── Pris på linja ──\n");

await somAnon(db, async () => {
  await avvist("anon kan ikke sette pris", `select public.pipe_price_line($1, 10)`, [linje.id], /permission denied|Ingen tilgang/);
});
await som(db, KARI, async () => {
  await avvist("prosjektbrukeren kan ikke sette pris", `select public.pipe_price_line($1, 10)`, [linje.id], /Ingen tilgang/);
});
await som(db, LEIF, async () => {
  await avvist("negativ pris avvises", `select public.pipe_price_line($1, -1)`, [linje.id], /gyldig pris/);
  await avvist("urimelig pris avvises", `select public.pipe_price_line($1, 10000001)`, [linje.id], /urimelig/);
  await avvist("ukjent linje avvises", `select public.pipe_price_line(gen_random_uuid(), 10)`, [], /Fant ikke linjen/);

  const l = (await en(`select public.pipe_price_line($1, 40) as l`, [linje.id])).l;
  sjekk("linja får pris og linjesum", [tal(l.unit_price), tal(l.line_total)], [40, 500]);
});
sjekk(
  "ordretotalen regnes på nytt fra linjene",
  tal((await en(`select total from public.pipe_orders where id = $1`, [u.id])).total),
  800,
);
sjekk("lageret står urørt etter prissettingen", await lager(ROR), foer - 3);

await som(db, LEIF, async () => {
  await db.query(`select (public.pipe_create_invoice('Ola Kunde', current_date, current_date, array[$1::uuid], 0)).id`, [u.id]);
  await avvist(
    "en fakturert ordre kan ikke få ny pris",
    `select public.pipe_price_line($1, 50)`,
    [linje.id],
    /fakturert/,
  );
});

// ════════════════════════════════════════════════════════════════════════════
console.log("\n── Bestilling med en forespørsel ──\n");

const foerB = await lager(ROR);
const b = await somAnon(db, async () =>
  (await bestilling([{ pipe_type_id: ROR, quantity: 2 }, annet("Kum 400", 1, { unit: "stk" })])).r,
);
sjekk("en bestilling med en annet-linje går gjennom", typeof b.order_number, "number");
sjekk("summen kunden binder seg til gjelder bare katalogvaren", tal((await en(`select total from public.pipe_orders where id = $1`, [b.id])).total), 200);
sjekk("forslaget er registrert", tal((await en(`select count(*) from public.pipe_suggestions where order_id = $1`, [b.id])).count), 1);

const oppslag = await somAnon(db, async () => (await en(`select public.pipe_get_pickup_order($1) as o`, [b.id])).o);
sjekk("kunden ser hvilken linje som er en forespørsel", oppslag.lines.map((l) => l.annet), [false, true]);

await som(db, LEIF, async () => {
  await avvist(
    "godkjenning nektes til annet-linja har pris",
    `select public.pipe_approve_pickup_order($1)`,
    [b.id],
    /Sett pris på annet-linjene/,
  );
  sjekk("og lageret er ikke trukket", await lager(ROR), foerB);

  const bl = await en(`select id from public.pipe_order_lines where order_id = $1 and is_annet`, [b.id]);
  await db.query(`select public.pipe_price_line($1, 1250)`, [bl.id]);
  await db.query(`select public.pipe_approve_pickup_order($1)`, [b.id]);
  const o = await en(`select status, total from public.pipe_orders where id = $1`, [b.id]);
  sjekk("med pris går godkjenningen, og totalen tar med forespørselen", [o.status, tal(o.total)], ["behandlet", 1450]);
});
sjekk("godkjenningen trekker bare katalogvaren", await lager(ROR), foerB - 2);

await somAnon(db, async () => {
  await avvist(
    "11 annet-linjer i en bestilling avvises",
    `select public.pipe_submit_pickup_order('privat', 'Ola', 'ola2@kunde.no', $1::jsonb, '99999999', null, null, 'Vegen 1', true)`,
    [JSON.stringify(Array.from({ length: 11 }, (_, i) => annet(`Rør ${i}`, 1)))],
    /Høyst 10/,
  );
});

// ════════════════════════════════════════════════════════════════════════════
console.log("\n── Sletting ──\n");

await som(db, LEIF, async () => {
  await db.query(`select public.pipe_delete_order($1)`, [ua.id]);
});
const etter = await en(`select order_id, order_line_id, name from public.pipe_suggestions where submitted_by = 'Leif Lager'`);
sjekk("forslaget overlever at ordren slettes", [etter.order_id, etter.order_line_id, etter.name], [null, null, "Muffe 32"]);

console.log(tilstand.feil === 0 ? "\nAlt holdt.\n" : `\n${tilstand.feil} feil.\n`);
process.exit(tilstand.feil === 0 ? 0 : 1);
