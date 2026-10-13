// Tester forbruket per vare til innkjøpsforslaget (20261014180000_innkjop.sql).

import { byggBase, som, somAnon, nekta, lagFasit } from "./base.mjs";

const KONTOR = { epost: "thomashauge03@gmail.com", uid: "11111111-1111-1111-1111-111111111111" };
const KARI = { epost: "kari@plassen.no", uid: "22222222-2222-2222-2222-222222222222" };

const { tilstand, ok, nei, sjekk } = lagFasit();
const db = await byggBase();
const en = async (sql, p) => (await db.query(sql, p)).rows[0];
const tal = (v) => (v === null || v === undefined ? v : Number(v));

await db.exec(`insert into public.system_users (email, full_name, role) values ('kari@plassen.no', 'Kari', 'prosjekt')`);
const kat = await en(`insert into public.pipe_categories (name) values ('Testgruppe') returning id`);
const pvc = (
  await en(
    `insert into public.pipe_types (category_id, name, unit, price, stock, active, qr_slug) values ($1, 'PVC', 'm', 100, 100, true, 'pvc') returning id`,
    [kat.id],
  )
).id;
const logg = (endring, grunn, dagarSidan = 1) =>
  db.query(
    `insert into public.pipe_stock_log (pipe_type_id, pipe_name, change, balance_after, reason, created_at)
     values ($1, 'PVC', $2, 0, $3, now() - make_interval(days => $4))`,
    [pvc, endring, grunn, dagarSidan],
  );

await logg(-20, "bestilling");
await logg(-5, "uttak");
await logg(3, "retur");
await logg(50, "påfyll");
await logg(-10, "opptelling");
await logg(-40, "bestilling", 200);
ok("lagerlogg med uttak, retur, påfyll, opptelling og eit gamalt uttak");

await som(db, KONTOR, async () => {
  const r = await en(`select forbruk from public.pipe_forbruk_per_vare(90) where pipe_type_id = $1`, [pvc]);
  sjekk("netto forbruk 90 dagar: 20 + 5 − 3 = 22, utan påfyll og opptelling", tal(r?.forbruk), 22);
  const lang = await en(`select forbruk from public.pipe_forbruk_per_vare(365) where pipe_type_id = $1`, [pvc]);
  sjekk("eit år tek med det gamle uttaket", tal(lang?.forbruk), 62);
});

await som(db, KARI, async () => {
  const m = await nekta(() => db.query(`select * from public.pipe_forbruk_per_vare(90)`));
  m && /Ingen tilgang/.test(m) ? ok("prosjektbrukaren får ikkje forbruket") : nei("prosjektbrukar", m ?? "GIKK GJENNOM");
});
await somAnon(db, async () => {
  const m = await nekta(() => db.query(`select * from public.pipe_forbruk_per_vare(90)`));
  m && /permission denied/i.test(m) ? ok("anon: ingen kjørerett") : nei("anon", m ?? "GIKK GJENNOM");
});

console.log(tilstand.feil === 0 ? `\nAlt i orden. Forbruket per vare stemmer.\n` : `\n${tilstand.feil} feil.\n`);
process.exit(tilstand.feil === 0 ? 0 : 1);
