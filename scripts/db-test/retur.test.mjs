// Tester retur til lager (20261014170000_retur.sql): rett på linja før
// faktura, returordre med kreditering etter, og at lageret går rett veg.

import { byggBase, som, nekta, lagFasit } from "./base.mjs";

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

await db.exec(`insert into public.system_users (email, full_name, role) values ('ola@hauge.no', 'Ola Ansatt', 'ansatt')`);
const kat = await en(`insert into public.pipe_categories (name) values ('Testgruppe') returning id`);
const pvc = (
  await en(
    `insert into public.pipe_types (category_id, name, dimension, unit, price, cost_price, stock, active, qr_slug)
     values ($1, 'PVC', '110 mm', 'm', 100, 60, 100, true, 'pvc') returning id`,
    [kat.id],
  )
).id;
const jobb = await en(`insert into public.projects (name) values ('Storgata 4') returning id`);
const lager = async () => tal((await en(`select stock from public.pipe_types where id = $1`, [pvc])).stock);
const nyttUttak = async (mengde) =>
  som(db, OLA, async () =>
    (await en(`select public.pipe_submit_order('x', $1::jsonb, p_project_id => $2) as v`, [
      JSON.stringify([{ pipe_type_id: pvc, quantity: mengde }]),
      jobb.id,
    ])).v,
  );
const linjeTil = async (ordre) => (await en(`select id, quantity, line_total from public.pipe_order_lines where order_id = $1`, [ordre])).id;

console.log("\n── Ikkje fakturert: rett på linja ──\n");

const u1 = await nyttUttak(20);
sjekk("lageret er trekt", await lager(), 80);
const l1 = await linjeTil(u1.id);

await som(db, OLA, () => avvist("Ola kan ikkje registrere retur", `select public.pipe_retur($1, 5)`, [l1], /Ingen tilgang/));
await som(db, KONTOR, async () => {
  const r = (await en(`select public.pipe_retur($1, 5, 'Overskudd') as v`, [l1])).v;
  sjekk("ført på linja", r.fort, "redusert");
  await avvist("meir enn det som er teke ut, blir avvist", `select public.pipe_retur($1, 16)`, [l1], /høyst 15 m/);
});
sjekk("fem m tilbake på lageret", await lager(), 85);
const etter = await en(`select quantity, line_total from public.pipe_order_lines where id = $1`, [l1]);
sjekk("linja er 15 m til 1500 kr", [tal(etter.quantity), tal(etter.line_total)], [15, 1500]);
sjekk("summen er 1500", tal((await en(`select total from public.pipe_orders where id = $1`, [u1.id])).total), 1500);
sjekk("lagerloggen seier retur", (await en(`select reason, note from public.pipe_stock_log where reason = 'retur'`)).note, `#${u1.order_number}: retur 5 m – Overskudd`);

await som(db, KONTOR, () => db.query(`select public.pipe_retur($1, 15)`, [l1]));
sjekk("alt tilbake: linja er borte", (await alle(`select id from public.pipe_order_lines where id = $1`, [l1])).length, 0);
sjekk("og lageret er der det starta", await lager(), 100);

console.log("\n── Fakturert: returordre med kreditering ──\n");

const u2 = await nyttUttak(10);
const l2 = await linjeTil(u2.id);
await som(db, KONTOR, () =>
  db.query(`select public.pipe_create_invoice('Storgata 4', current_date, current_date, array[$1::uuid], 0)`, [u2.id]),
);
sjekk("lageret etter uttaket", await lager(), 90);

const k1 = await som(db, KONTOR, async () => (await en(`select public.pipe_retur($1, 3) as v`, [l2])).v);
sjekk("ført som kreditering", k1.fort, "kreditert");
sjekk("tre m tilbake på lageret", await lager(), 93);
const retur = await en(`select kind, retur_av, project_id, created_by, total, invoice_id, stock_drawn_at is not null as trekt from public.pipe_orders where id = $1`, [k1.order_id]);
sjekk(
  "returordren peikar på uttaket, same jobb og same tilsette, minus 300 kr",
  [retur.kind, retur.retur_av, retur.project_id, retur.created_by, tal(retur.total), retur.invoice_id, retur.trekt],
  ["uttak", u2.id, jobb.id, OLA.uid, -300, null, true],
);
sjekk("originalen er urørt", tal((await en(`select quantity from public.pipe_order_lines where id = $1`, [l2])).quantity), 10);

const k2 = await som(db, KONTOR, async () => (await en(`select public.pipe_retur($1, 2) as v`, [l2])).v);
sjekk("ein retur til kjem på same returordre", k2.order_id, k1.order_id);
sjekk("som no er minus 500 kr", tal((await en(`select total from public.pipe_orders where id = $1`, [k1.order_id])).total), -500);
await som(db, KONTOR, () =>
  avvist("meir enn det som er igjen, blir avvist", `select public.pipe_retur($1, 6)`, [l2], /høyst 5 m/),
);

const returLinje = (await en(`select id from public.pipe_order_lines where order_id = $1 limit 1`, [k1.order_id])).id;
await som(db, KONTOR, async () => {
  await avvist("ei returlinje kan ikkje få ny mengde", `select public.pipe_endre_mengde($1, 1)`, [returLinje], /returlinje kan ikke endres/);
  await avvist("ei retur kan ikkje returnerast", `select public.pipe_retur($1, 1)`, [returLinje], /kan ikke returneres/);
  const f = (await en(`select (public.pipe_create_invoice('Storgata 4', current_date, current_date, array[$1::uuid], 0)).total as t`, [k1.order_id])).t;
  sjekk("returen blir eit kreditgrunnlag på minus 500", tal(f), -500);
});

console.log("\n── Sletting av ein retur ──\n");

const u3 = await nyttUttak(4);
const l3 = await linjeTil(u3.id);
await som(db, KONTOR, () => db.query(`select public.pipe_create_invoice('Storgata 4', current_date, current_date, array[$1::uuid], 0)`, [u3.id]));
const før = await lager();
const k3 = await som(db, KONTOR, async () => (await en(`select public.pipe_retur($1, 4) as v`, [l3])).v);
sjekk("fire tilbake", await lager(), før + 4);
await som(db, KONTOR, () => db.query(`select public.pipe_delete_order($1)`, [k3.order_id]));
sjekk("returen sletta: dei fire er tekne ut att, ikkje lagde til ein gong til", await lager(), før);

console.log(tilstand.feil === 0 ? `\nAlt i orden. Retur går rett vei.\n` : `\n${tilstand.feil} feil.\n`);
process.exit(tilstand.feil === 0 ? 0 : 1);
