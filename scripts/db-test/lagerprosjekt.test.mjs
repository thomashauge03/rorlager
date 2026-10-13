// Tester at alt som går ut av lageret, blir ført på lagerprosjektet – og at
// kunden aldri ser det.

import { byggBase, som, somAnon, lagFasit } from "./base.mjs";

const OLA = { epost: "ola@hauge.no", uid: "66666666-6666-6666-6666-666666666666" };

const { tilstand, sjekk } = lagFasit();
const db = await byggBase();
const en = async (sql, p) => (await db.query(sql, p)).rows[0];

console.log("\n── Oppsett ──\n");

await db.exec(`insert into public.system_users (email, full_name, role) values ('ola@hauge.no', 'Ola Ansatt', 'ansatt')`);
const kat = await en(`insert into public.pipe_categories (name) values ('Testgruppe') returning id`);
const ror = (
  await en(
    `insert into public.pipe_types (category_id, name, dimension, unit, price, cost_price, stock, active, qr_slug)
     values ($1, 'PVC', '110 mm', 'm', 100, 60, 50, true, 'pvc-110') returning id`,
    [kat.id],
  )
).id;
const lagerRor = await en(`insert into public.projects (project_number, name) values (2014131, 'Lagervarer Rør') returning id`);
const jobb = await en(`insert into public.projects (name) values ('Storgata 4') returning id`);

// Migrasjonen fann ikkje prosjektet – basen var tom då ho køyrde. Same
// setning som migrasjonen, slik ho ville gått neste gong setup blir limt inn.
sjekk("utan prosjekt 2014131 står innstillinga tom", (await en(`select stock_project_id from public.pipe_settings where id = 1`)).stock_project_id, null);
await db.exec(`
  update public.pipe_settings
     set stock_project_id = (select id from public.projects where project_number = 2014131 limit 1)
   where stock_project_id is null;
`);
sjekk("neste køyring finn 2014131", (await en(`select stock_project_id from public.pipe_settings where id = 1`)).stock_project_id, lagerRor.id);

const linjer = JSON.stringify([{ pipe_type_id: ror, quantity: 2 }]);
const lagerFor = async (id) => (await en(`select stock_project_id from public.pipe_orders where id = $1`, [id])).stock_project_id;

console.log("\n── Kunden ──\n");

const kunde = await somAnon(db, async () =>
  (await en(`select public.pipe_submit_order('Kari Kunde', $1::jsonb, null, 'kari@kunde.no', null, 'Hytta') as v`, [linjer])).v,
);
sjekk("kundeuttaket er ført på lagerprosjektet", await lagerFor(kunde.id), lagerRor.id);
sjekk("kvitteringa til kunden nemner det ikkje", JSON.stringify(kunde).includes(lagerRor.id) || /2014131|Lagervarer/.test(JSON.stringify(kunde)), false);
sjekk("prosjektteksten til kunden er hans eiga", kunde.project, "Hytta");

await somAnon(db, async () => {
  const kolonner = (await db.query(`select * from public.pipe_public_settings limit 1`)).fields.map((f) => f.name);
  sjekk("pipe_public_settings har ikkje lagerprosjektet", kolonner.includes("stock_project_id"), false);
});

console.log("\n── Den tilsette ──\n");

const uttak = await som(db, OLA, async () =>
  (await en(`select public.pipe_submit_order('x', $1::jsonb, p_project_id => $2) as v`, [linjer, jobb.id])).v,
);
sjekk("frå lagerprosjektet …", await lagerFor(uttak.id), lagerRor.id);
sjekk("… til jobben han valde", (await en(`select project_id from public.pipe_orders where id = $1`, [uttak.id])).project_id, jobb.id);

console.log("\n── Innstillinga blir endra ──\n");

const nyttLager = await en(`insert into public.projects (project_number, name) values (2099999, 'Nytt lager') returning id`);
await db.query(`update public.pipe_settings set stock_project_id = $1 where id = 1`, [nyttLager.id]);
sjekk("gamle uttak blir ståande på det gamle lagerprosjektet", await lagerFor(uttak.id), lagerRor.id);

const etter = await somAnon(db, async () =>
  (await en(`select public.pipe_submit_order('Per Kunde', $1::jsonb, null, 'per@kunde.no') as v`, [linjer])).v,
);
sjekk("nye uttak får det nye", await lagerFor(etter.id), nyttLager.id);

console.log(
  tilstand.feil === 0
    ? `\nAlt i orden. Alt som går ut av lageret, står på lagerprosjektet.\n`
    : `\n${tilstand.feil} feil.\n`,
);
process.exit(tilstand.feil === 0 ? 0 : 1);
