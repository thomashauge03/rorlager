// Tester revisjonssporet (20261014190000_revisjon.sql): kven endra kva, og at
// sporet ikkje kan rettast i.

import { byggBase, som, somAnon, nekta, lagFasit } from "./base.mjs";

const KONTOR = { epost: "thomashauge03@gmail.com", uid: "11111111-1111-1111-1111-111111111111" };
const LEIF = { epost: "lager@hauge.no", uid: "55555555-5555-5555-5555-555555555555" };
const KARI = { epost: "kari@plassen.no", uid: "22222222-2222-2222-2222-222222222222" };

const { tilstand, ok, nei, sjekk } = lagFasit();
const db = await byggBase();
const en = async (sql, p) => (await db.query(sql, p)).rows[0];
const alle = async (sql, p) => (await db.query(sql, p)).rows;
const tal = (v) => (v === null || v === undefined ? v : Number(v));

await db.exec(`
  insert into public.system_users (email, full_name, role) values
    ('lager@hauge.no', 'Leif Lager', 'lager'),
    ('kari@plassen.no', 'Kari Plass', 'prosjekt');
`);
const kat = await en(`insert into public.pipe_categories (name) values ('Testgruppe') returning id`);
const pvc = (
  await en(
    `insert into public.pipe_types (category_id, name, dimension, unit, price, cost_price, stock, active, qr_slug)
     values ($1, 'PVC', '110 mm', 'm', 100, 60, 100, true, 'pvc') returning id`,
    [kat.id],
  )
).id;
const siste = (tabell) =>
  en(`select * from public.pipe_revisjon where tabell = $1 order by created_at desc, id desc limit 1`, [tabell]);

console.log("\n── Prisen ──\n");

await som(db, LEIF, () => db.query(`update public.pipe_types set price = 120 where id = $1`, [pvc]));
const pris = await siste("pipe_types");
sjekk(
  "prisendringa står med kven, kva og frå/til",
  [pris.handling, pris.kva, pris.created_by_name, pris.created_by, tal(pris.endringar.price.fra), tal(pris.endringar.price.til)],
  ["endret", "PVC 110 mm", "Leif Lager", LEIF.uid, 100, 120],
);
sjekk("berre det som blei endra, er med", Object.keys(pris.endringar), ["price"]);

const før = tal((await en(`select count(*) as n from public.pipe_revisjon`)).n);
await som(db, LEIF, () => db.query(`select public.pipe_adjust_stock($1, 5, 'påfyll')`, [pvc]));
sjekk("ei lagerjustering gir ingen rad her (det er lagerloggen si)", tal((await en(`select count(*) as n from public.pipe_revisjon`)).n), før);

console.log("\n── Påslaget ──\n");

await som(db, KONTOR, () => db.query(`update public.pipe_settings set markup_percent = 30 where id = 1`));
const påslag = await siste("pipe_settings");
sjekk("påslaget står", [påslag.endringar.markup_percent?.til, påslag.kva], [30, "Hauge Maskin AS"]);

console.log("\n── Retting og sletting av eit uttak ──\n");

const uttak = await somAnon(db, async () =>
  (await en(`select public.pipe_submit_order('Kari Kunde', $1::jsonb, null, 'kari@kunde.no') as v`, [
    JSON.stringify([{ pipe_type_id: pvc, quantity: 10 }]),
  ])).v,
);
sjekk("eit nytt uttak gir ingen rad – ordren er sitt eige spor", (await alle(`select id from public.pipe_revisjon where tabell = 'pipe_orders'`)).length, 0);

const linje = (await en(`select id from public.pipe_order_lines where order_id = $1`, [uttak.id])).id;
await som(db, KONTOR, () => db.query(`select public.pipe_endre_mengde($1, 6)`, [linje]));
const mengde = await siste("pipe_order_lines");
sjekk("mengderettinga står", [tal(mengde.endringar.quantity.fra), tal(mengde.endringar.quantity.til), mengde.kva], [10, 6, "PVC 110 mm"]);

await som(db, KONTOR, () => db.query(`select public.pipe_delete_order($1)`, [uttak.id]));
const sletta = await en(`select * from public.pipe_revisjon where tabell = 'pipe_orders' and handling = 'slettet'`);
sjekk("slettinga står med ordrenummeret", [sletta.kva, tal(sletta.endringar.order_number)], [String(uttak.order_number), uttak.order_number]);
sjekk("utan namnet til kunden", JSON.stringify(sletta).includes("Kari Kunde"), false);

console.log("\n── Tilgang ──\n");

await som(db, KONTOR, () => db.query(`update public.system_users set role = 'kontor' where email = 'lager@hauge.no'`));
const rolle = await siste("system_users");
sjekk("rolleendringa står", [rolle.kva, rolle.endringar.role.fra, rolle.endringar.role.til], ["lager@hauge.no", "lager", "kontor"]);

console.log("\n── Sporet kan ikkje rettast i ──\n");

const avvist = async (tittel, fn, mønster) => {
  const m = await nekta(fn);
  m && mønster.test(m) ? ok(tittel) : nei(tittel, m ?? "GIKK GJENNOM");
};
await som(db, KONTOR, async () => {
  sjekk("kontoret les sporet", (await alle(`select id from public.pipe_revisjon`)).length > 0, true);
  await avvist("kontoret kan ikkje slette i sporet", () => db.query(`delete from public.pipe_revisjon`), /permission denied/i);
  await avvist("eller skrive", () => db.query(`insert into public.pipe_revisjon (tabell, handling) values ('x', 'ny')`), /permission denied/i);
  await avvist("eller rette", () => db.query(`update public.pipe_revisjon set kva = 'x'`), /permission denied/i);
});
await som(db, KARI, async () => {
  sjekk("prosjektbrukaren ser ingenting", (await alle(`select id from public.pipe_revisjon`)).length, 0);
});
await somAnon(db, () => avvist("anon får ikkje lese", () => db.query(`select id from public.pipe_revisjon`), /permission denied/i));

console.log(tilstand.feil === 0 ? `\nAlt i orden. Sporet viser hvem som endret hva.\n` : `\n${tilstand.feil} feil.\n`);
process.exit(tilstand.feil === 0 ? 0 : 1);
