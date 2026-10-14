// Kjem varene frå tellelista inn utan å røre det som alt låg i katalogen, og
// skjer ingenting når supabase-setup.sql blir køyrd ein gong til?
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { byggBase } from "./base.mjs";

const HER = dirname(fileURLToPath(import.meta.url));
const MIGRASJON = join(HER, "..", "..", "supabase", "migrations", "20261014220000_katalog_telleliste_2025.sql");

let feil = 0;
const ok = (t) => console.log(`  ok    ${t}`);
const nei = (t, d) => {
  console.log(`  FEIL  ${t}\n        ${d}`);
  feil++;
};
const sjekk = (t, faktisk, venta) =>
  JSON.stringify(faktisk) === JSON.stringify(venta) ? ok(t) : nei(t, `venta ${JSON.stringify(venta)}, fikk ${JSON.stringify(faktisk)}`);

const db = await byggBase();
const en = async (sql, p) => (await db.query(sql, p)).rows[0];

console.log("\n── Første køyring ──\n");

sjekk("156 Dahl-varer + 227 frå tellelista + 7 messingdelar frå hylla", Number((await en(`select count(*) as n from public.pipe_types`)).n), 390);
sjekk("15 kategoriar", Number((await en(`select count(*) as n from public.pipe_categories`)).n), 15);
sjekk(
  "ingen vare utan kategori",
  Number((await en(`select count(*) as n from public.pipe_types where category_id is null`)).n),
  0,
);
sjekk(
  "innkjøpsprisane summerer som i lista",
  // Dahl-katalogen brukar sort_order 1–44, tellelista 101 og oppover
  String((await en(`select sum(cost_price) as s from public.pipe_types where sort_order > 100`)).s),
  "339994.35",
);

const ventil = await en(
  `select t.name, t.unit, t.cost_price, t.price, t.stock, c.name as kategori
     from public.pipe_types t join public.pipe_categories c on c.id = t.category_id
    where t.sku = '5510039'`,
);
sjekk("sluseventilen", ventil, {
  name: "Sluseventil, DN100, HL, PN16",
  unit: "stk",
  cost_price: "4165",
  price: "5206.25",
  stock: "0",
  kategori: "Ventiler og vannverk",
});

const gamal = await en(`select name, dimension, cost_price from public.pipe_types where sku = '3100544'`);
sjekk("ei vare som alt fanst er urørt", gamal, { name: "Bend X-Stream 15°", dimension: "150 mm", cost_price: "202.6" });

console.log("\n── Omkøyring ──\n");

await db.exec(`update public.pipe_types set stock = 12, name = 'Retta for hand' where sku = '5020106'`);
await db.exec(`delete from public.pipe_types where sku = '9507871'`);
await db.exec(readFileSync(MIGRASJON, "utf8"));

sjekk("ingen nye varer", Number((await en(`select count(*) as n from public.pipe_types`)).n), 389);
sjekk("ei sletta vare kjem ikkje att", (await en(`select count(*)::int as n from public.pipe_types where sku = '9507871'`)).n, 0);
sjekk(
  "det kontoret har retta står",
  await en(`select name, stock from public.pipe_types where sku = '5020106'`),
  { name: "Retta for hand", stock: "12" },
);

console.log(feil === 0 ? "\nAlt stemmer.\n" : `\n${feil} feil.\n`);
process.exit(feil === 0 ? 0 : 1);
