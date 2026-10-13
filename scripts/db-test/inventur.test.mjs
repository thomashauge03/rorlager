// Tester inventuren (20261014210000_inventur.sql): alt eller ingenting, og
// avvika i lagerloggen.

import { byggBase, som, nekta, lagFasit } from "./base.mjs";

const LEIF = { epost: "lager@hauge.no", uid: "55555555-5555-5555-5555-555555555555" };
const KARI = { epost: "kari@plassen.no", uid: "22222222-2222-2222-2222-222222222222" };

const { tilstand, ok, nei, sjekk } = lagFasit();
const db = await byggBase();
const en = async (sql, p) => (await db.query(sql, p)).rows[0];
const alle = async (sql, p) => (await db.query(sql, p)).rows;
const tal = (v) => (v === null || v === undefined ? v : Number(v));

await db.exec(`insert into public.system_users (email, full_name, role) values
  ('lager@hauge.no', 'Leif Lager', 'lager'), ('kari@plassen.no', 'Kari', 'prosjekt')`);
const kat = await en(`insert into public.pipe_categories (name) values ('Testgruppe') returning id`);
const vare = async (slug, lager) =>
  (await en(`insert into public.pipe_types (category_id, name, unit, price, stock, active, qr_slug) values ($1, $2, 'm', 100, $3, true, $2) returning id`, [kat.id, slug, lager])).id;
const a = await vare("a", 10);
const b = await vare("b", 20);
const c = await vare("c", 30);
const lager = async (id) => tal((await en(`select stock from public.pipe_types where id = $1`, [id])).stock);
const kall = (linjer, merknad = null) =>
  db.query(`select public.pipe_inventur($1::jsonb, $2) as v`, [JSON.stringify(linjer), merknad]);

await som(db, KARI, async () => {
  const m = await nekta(() => kall([{ pipe_type_id: a, telt: 1 }]));
  m && /Ingen tilgang/.test(m) ? ok("prosjektbrukaren kan ikkje telje") : nei("prosjektbrukar", m ?? "GIKK GJENNOM");
});

await som(db, LEIF, async () => {
  const r = (await kall([{ pipe_type_id: a, telt: 8 }, { pipe_type_id: b, telt: 20 }], "Hylle A og B")).rows[0].v;
  sjekk("to telde, eitt avvik", [r.telde, r.avvik], [2, 1]);
});
sjekk("a er sett til det som er telt", await lager(a), 8);
sjekk("b er urørt (ingen avvik)", await lager(b), 20);
sjekk("c er ikkje telt, og urørt", await lager(c), 30);
const logg = await alle(`select change, balance_after, reason, note, created_by_name from public.pipe_stock_log where pipe_type_id = $1`, [a]);
sjekk("avviket står i lagerloggen", [tal(logg[0].change), tal(logg[0].balance_after), logg[0].reason, logg[0].created_by_name], [-2, 8, "opptelling", "Leif Lager"]);
sjekk("med dato og merknad", /^Inventur \d\d\.\d\d\.\d{4} – Hylle A og B$/.test(logg[0].note), true);

await som(db, LEIF, async () => {
  const m = await nekta(() => kall([{ pipe_type_id: a, telt: 99 }, { pipe_type_id: b, telt: -1 }]));
  m && /under null/.test(m) ? ok("ei ugyldig linje stoppar heile inventuren") : nei("ugyldig", m ?? "GIKK GJENNOM");
});
sjekk("og a blei ikkje endra av den stoppa inventuren", await lager(a), 8);

console.log(tilstand.feil === 0 ? `\nAlt i orden. Inventuren er alt eller ingenting.\n` : `\n${tilstand.feil} feil.\n`);
process.exit(tilstand.feil === 0 ? 0 : 1);
