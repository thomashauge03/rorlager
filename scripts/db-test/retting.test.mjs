// Tester at kontoret kan rette eit uttak: prosjekt, namn på ei annet-linje og
// vara på ei linje – og at lager, pris, sum og forslag følgjer med.

import { byggBase, som, somAnon, nekta, lagFasit } from "./base.mjs";

const KONTOR = { epost: "thomashauge03@gmail.com", uid: "11111111-1111-1111-1111-111111111111" };
const OLA = { epost: "ola@hauge.no", uid: "66666666-6666-6666-6666-666666666666" };

const { tilstand, ok, nei, sjekk } = lagFasit();
const db = await byggBase();
const en = async (sql, p) => (await db.query(sql, p)).rows[0];
const alle = async (sql, p) => (await db.query(sql, p)).rows;
const tal = (v) => (v === null || v === undefined ? v : Number(v));

const avvist = async (tittel, sql, params, mønster) => {
  const m = await nekta(() => db.query(sql, params));
  m && mønster.test(m) ? ok(tittel) : nei(tittel, m ?? "GIKK GJENNOM");
};

console.log("\n── Oppsett ──\n");

await db.exec(`insert into public.system_users (email, full_name, role) values ('ola@hauge.no', 'Ola Ansatt', 'ansatt')`);
const kat = await en(`insert into public.pipe_categories (name) values ('Testgruppe') returning id`);
const vare = async (namn, dim, pris, lager, eining = "m") =>
  (
    await en(
      `insert into public.pipe_types (category_id, name, dimension, sku, unit, price, cost_price, stock, active, qr_slug)
       values ($1, $2, $3, $4, $5, $6, 10, $7, true, $8) returning id`,
      [kat.id, namn, dim, `sku-${namn}`, eining, pris, lager, `${namn}-${dim}`.toLowerCase().replace(/[^a-z0-9]+/g, "-")],
    )
  ).id;
const pvc = await vare("PVC", "110 mm", 100, 50);
const pe = await vare("PE", "180 mm", 300, 20);
const bend = await vare("Bend", "110 mm", 50, 10, "stk");
const storgata = await en(`insert into public.projects (name) values ('Storgata 4') returning id, project_number`);
const havna = await en(`insert into public.projects (name, status) values ('Havnevegen 12', 'avsluttet') returning id, project_number`);

const lager = async (id) => tal((await en(`select stock from public.pipe_types where id = $1`, [id])).stock);

// Ola tek ut 5 m PVC (feil rør) og 5 m «180 rør noe 180mm» på feil prosjekt
const uttak = await som(db, OLA, async () =>
  (
    await en(`select public.pipe_submit_order('x', $1::jsonb, p_project => 'Testnytt') as v`, [
      JSON.stringify([
        { pipe_type_id: pvc, quantity: 5 },
        { annet: { name: "180 rør noe 180mm", unit: "m" }, quantity: 5 },
      ]),
    ])
  ).v,
);
const linjer = await alle(`select id, is_annet from public.pipe_order_lines where order_id = $1 order by sort_order`, [uttak.id]);
const [pvcLinje, annetLinje] = linjer;
sjekk("PVC trekt ved uttaket", await lager(pvc), 45);
ok(`uttak #${uttak.order_number} med ei PVC-linje og ei annet-linje`);

console.log("\n── Ola kan ikkje rette ──\n");

await som(db, OLA, async () => {
  await avvist("pipe_bytt_prosjekt nektar", `select public.pipe_bytt_prosjekt($1, $2)`, [uttak.id, storgata.id], /Ingen tilgang/);
  await avvist("pipe_endre_annet nektar", `select public.pipe_endre_annet($1, 'x')`, [annetLinje.id], /Ingen tilgang/);
  await avvist("pipe_bytt_vare nektar", `select public.pipe_bytt_vare($1, $2)`, [pvcLinje.id, pe], /Ingen tilgang/);
});
await somAnon(db, () =>
  avvist("anon: pipe_bytt_vare — ingen kjørerett", `select public.pipe_bytt_vare($1, $2)`, [pvcLinje.id, pe], /permission denied/i),
);

console.log("\n── Prosjektet ──\n");

await som(db, KONTOR, async () => {
  const r = (await en(`select public.pipe_bytt_prosjekt($1, $2) as v`, [uttak.id, storgata.id])).v;
  sjekk("teksten kjem frå prosjektet", r.project, `${storgata.project_number} · Storgata 4`);
  sjekk("project_id er sett", r.project_id, storgata.id);

  const avslutta = (await en(`select public.pipe_bytt_prosjekt($1, $2) as v`, [uttak.id, havna.id])).v;
  sjekk("eit avslutta prosjekt er lov for kontoret", avslutta.project_id, havna.id);

  const fri = (await en(`select public.pipe_bytt_prosjekt($1, null, '  Verkstedet ') as v`, [uttak.id])).v;
  sjekk("fritekst blir trimma og project_id nulla", [fri.project, fri.project_id], ["Verkstedet", null]);

  await avvist("utan prosjekt og utan tekst blir avvist", `select public.pipe_bytt_prosjekt($1)`, [uttak.id], /Velg et prosjekt/);
});

console.log("\n── Namn på annet-linja ──\n");

await som(db, KONTOR, async () => {
  await db.query(`select public.pipe_endre_annet($1, 'PE-rør', '180 mm')`, [annetLinje.id]);
  await avvist("ei vanleg linje får ikkje nytt namn", `select public.pipe_endre_annet($1, 'x')`, [pvcLinje.id], /Bare «annet»-linjer/);
  await avvist("tomt namn blir avvist", `select public.pipe_endre_annet($1, '  ')`, [annetLinje.id], /Skriv hva varen er/);
});
const etterNamn = await en(`select name, dimension from public.pipe_order_lines where id = $1`, [annetLinje.id]);
sjekk("linja har nytt namn", [etterNamn.name, etterNamn.dimension], ["PE-rør", "180 mm"]);
const forslag = await en(`select name, dimension, status from public.pipe_suggestions where order_line_id = $1`, [annetLinje.id]);
sjekk("forslaget fekk same namn", [forslag.name, forslag.dimension, forslag.status], ["PE-rør", "180 mm", "ny"]);

console.log("\n── Feil rør: PVC blir bend ──\n");

await som(db, KONTOR, async () => {
  await db.query(`select public.pipe_bytt_vare($1, $2)`, [pvcLinje.id, bend]);
  await avvist("same vare to gonger blir avvist", `select public.pipe_bytt_vare($1, $2)`, [pvcLinje.id, bend], /allerede denne varen/);
});
sjekk("PVC er lagt tilbake", await lager(pvc), 50);
sjekk("bend er trekt", await lager(bend), 5);
const bendLinje = await en(`select name, unit, unit_price, line_total, pipe_type_id from public.pipe_order_lines where id = $1`, [pvcLinje.id]);
sjekk(
  "linja er bend, med eining og pris frå vara",
  [bendLinje.name, bendLinje.unit, tal(bendLinje.unit_price), tal(bendLinje.line_total)],
  ["Bend", "stk", 50, 250],
);
const logg = await alle(`select pipe_name, change, reason from public.pipe_stock_log where reason = 'retting' order by created_at, change`);
sjekk(
  "begge står i lagerloggen som retting",
  logg.map((l) => `${l.pipe_name} ${tal(l.change)}`).sort(),
  ["Bend -5", "PVC 5"],
);

console.log("\n── Annet-linja blir ei vare ──\n");

await som(db, KONTOR, async () => {
  await db.query(`select public.pipe_bytt_vare($1, $2)`, [annetLinje.id, pe]);
});
sjekk("PE er trekt", await lager(pe), 15);
const peLinje = await en(`select is_annet, unit_price, line_total from public.pipe_order_lines where id = $1`, [annetLinje.id]);
sjekk("linja er ikkje lenger annet, og har pris", [peLinje.is_annet, tal(peLinje.unit_price), tal(peLinje.line_total)], [false, 300, 1500]);
const løyst = await en(`select status, pipe_type_id, handled_at is not null as handtert from public.pipe_suggestions where order_line_id = $1`, [annetLinje.id]);
sjekk("forslaget er løyst og peikar på vara", [løyst.status, løyst.pipe_type_id, løyst.handtert], ["opprettet", pe, true]);
sjekk("summen på uttaket er rekna på nytt", tal((await en(`select total from public.pipe_orders where id = $1`, [uttak.id])).total), 1750);

console.log("\n── Feil mengde: 5 stk bend skulle vore 2 ──\n");

await som(db, OLA, () =>
  avvist("Ola kan ikkje endre mengda", `select public.pipe_endre_mengde($1, 2)`, [pvcLinje.id], /Ingen tilgang/),
);
await som(db, KONTOR, async () => {
  await db.query(`select public.pipe_endre_mengde($1, 2)`, [pvcLinje.id]);
  await avvist("null blir avvist", `select public.pipe_endre_mengde($1, 0)`, [pvcLinje.id], /over null/);
});
sjekk("tre bend er lagde tilbake", await lager(bend), 8);
const nyMengde = await en(`select quantity, line_total from public.pipe_order_lines where id = $1`, [pvcLinje.id]);
sjekk("linja er 2 stk til 100 kr", [tal(nyMengde.quantity), tal(nyMengde.line_total)], [2, 100]);
sjekk("summen er rekna på nytt", tal((await en(`select total from public.pipe_orders where id = $1`, [uttak.id])).total), 1600);
const mengdeLogg = await en(`select change, note from public.pipe_stock_log where reason = 'retting' and pipe_name = 'Bend' order by created_at desc limit 1`);
sjekk("lagerloggen seier kva som skjedde", [tal(mengdeLogg.change), mengdeLogg.note], [3, `#${uttak.order_number}: mengde 5 → 2 stk`]);

console.log("\n── Ei bestilling som ikkje er godkjend ──\n");

await db.exec(`
  update public.pipe_settings
     set company_name = 'Hauge Maskin AS', org_number = '974760673',
         address = 'Industrivegen 1, 5700 Voss', email = 'post@hauge.no',
         phone = '56 00 00 00', accept_orders = true
   where id = 1;
`);
const best = await somAnon(db, async () =>
  (
    await en(
      `select public.pipe_submit_pickup_order(
         p_customer_type => 'privat', p_customer_name => 'Kari Kunde', p_customer_email => 'kari@kunde.no',
         p_lines => $1::jsonb, p_customer_phone => '900 00 000', p_billing_address => 'Gata 1, 5700 Voss',
         p_pickup_now => true) as v`,
      [JSON.stringify([{ pipe_type_id: pvc, quantity: 2 }])],
    )
  ).v,
).catch((e) => {
  nei("bestilling for testen", e.message);
  return null;
});
if (best) {
  const bestId = best.id;
  const linje = await en(`select l.id from public.pipe_order_lines l where l.order_id = $1`, [bestId]);
  await som(db, KONTOR, () => db.query(`select public.pipe_bytt_vare($1, $2)`, [linje.id, pe]));
  sjekk("ikkje godkjend: PVC er ikkje rørt", await lager(pvc), 50);
  sjekk("ikkje godkjend: PE er ikkje trekt", await lager(pe), 15);
}

console.log("\n── Fakturert ──\n");

await som(db, KONTOR, async () => {
  await db.query(`select public.pipe_create_invoice('Hauge Maskin', current_date, current_date, array[$1::uuid], 0)`, [
    uttak.id,
  ]);
  await avvist("fakturert: prosjekt", `select public.pipe_bytt_prosjekt($1, $2)`, [uttak.id, storgata.id], /fakturert/);
  await avvist("fakturert: vare", `select public.pipe_bytt_vare($1, $2)`, [pvcLinje.id, pvc], /fakturert/);
  await avvist("fakturert: mengde", `select public.pipe_endre_mengde($1, 3)`, [pvcLinje.id], /fakturert/);
});

console.log(
  tilstand.feil === 0
    ? `\nAlt i orden. Kontoret kan rette, og lager og sum følger med.\n`
    : `\n${tilstand.feil} feil.\n`,
);
process.exit(tilstand.feil === 0 ? 0 : 1);
