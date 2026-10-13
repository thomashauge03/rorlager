// Tester forbruket per prosjekt (20261014160000_forbruk.sql): kostprisen som
// følgjer linja, og at byggjeplassen ser uttaka til jobben sin – utan prisar.

import { byggBase, som, somAnon, nekta, lagFasit } from "./base.mjs";

const KONTOR = { epost: "thomashauge03@gmail.com", uid: "11111111-1111-1111-1111-111111111111" };
const OLA = { epost: "ola@hauge.no", uid: "66666666-6666-6666-6666-666666666666" };
const KARI = { epost: "kari@plassen.no", uid: "22222222-2222-2222-2222-222222222222" };
const PER = { epost: "per@annenplass.no", uid: "33333333-3333-3333-3333-333333333333" };

const { tilstand, ok, nei, sjekk } = lagFasit();
const db = await byggBase();
const en = async (sql, p) => (await db.query(sql, p)).rows[0];
const tal = (v) => (v === null || v === undefined ? v : Number(v));

await db.exec(`
  insert into public.system_users (email, full_name, role) values
    ('ola@hauge.no', 'Ola Ansatt', 'ansatt'),
    ('kari@plassen.no', 'Kari Plass', 'prosjekt'),
    ('per@annenplass.no', 'Per Annen', 'prosjekt');
`);
const kat = await en(`insert into public.pipe_categories (name) values ('Testgruppe') returning id`);
const vare = async (namn, kost, pris) =>
  (
    await en(
      `insert into public.pipe_types (category_id, name, dimension, unit, price, cost_price, stock, active, qr_slug)
       values ($1, $2, '110 mm', 'm', $3, $4, 100, true, $5) returning id`,
      [kat.id, namn, pris, kost, namn.toLowerCase()],
    )
  ).id;
const pvc = await vare("PVC", 60, 100);
const pe = await vare("PE", 200, 300);
const jobb = await en(`insert into public.projects (name) values ('Storgata 4') returning id`);
await db.query(`insert into public.project_members (project_id, email) values ($1, 'kari@plassen.no')`, [jobb.id]);

console.log("\n── Kostprisen følgjer linja ──\n");

const uttak = await som(db, OLA, async () =>
  (await en(`select public.pipe_submit_order('x', $1::jsonb, p_project_id => $2) as v`, [
    JSON.stringify([{ pipe_type_id: pvc, quantity: 10 }]),
    jobb.id,
  ])).v,
);
const linje = await en(`select id, unit_cost from public.pipe_order_lines where order_id = $1`, [uttak.id]);
sjekk("kostprisen er kopiert til linja", tal(linje.unit_cost), 60);

await db.query(`update public.pipe_types set cost_price = 75 where id = $1`, [pvc]);
sjekk("ny prisliste endrar ikkje eit gamalt uttak", tal((await en(`select unit_cost from public.pipe_order_lines where id = $1`, [linje.id])).unit_cost), 60);

await som(db, KONTOR, () => db.query(`select public.pipe_bytt_vare($1, $2)`, [linje.id, pe]));
sjekk("byter kontoret vare, får linja kostprisen til den nye", tal((await en(`select unit_cost from public.pipe_order_lines where id = $1`, [linje.id])).unit_cost), 200);

console.log("\n── Byggjeplassen ser uttaka ──\n");

await som(db, KARI, async () => {
  const liste = (await en(`select public.pipe_prosjekt_uttak($1) as v`, [jobb.id])).v;
  sjekk("Kari ser uttaket på jobben sin", liste.length, 1);
  sjekk("med kven og kva", [liste[0].tatt_ut_av, liste[0].linjer[0].name, tal(liste[0].linjer[0].quantity)], ["Ola Ansatt", "PE", 10]);
  const tekst = JSON.stringify(liste);
  sjekk("utan prisar", /unit_price|line_total|unit_cost|total/.test(tekst), false);
});
await som(db, PER, async () => {
  sjekk("Per på ein annan jobb ser ingenting", (await en(`select public.pipe_prosjekt_uttak($1) as v`, [jobb.id])).v, []);
});
await somAnon(db, async () => {
  const m = await nekta(() => db.query(`select public.pipe_prosjekt_uttak($1)`, [jobb.id]));
  m && /permission denied/i.test(m) ? ok("anon: ingen kjørerett") : nei("anon", m ?? "GIKK GJENNOM");
});

console.log(tilstand.feil === 0 ? `\nAlt i orden. Forbruket per prosjekt holder.\n` : `\n${tilstand.feil} feil.\n`);
process.exit(tilstand.feil === 0 ? 0 : 1);
