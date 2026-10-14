// Kjem dei sju messingdelane frå hylla inn under Messingdeler, utan pris, og
// skjer ingenting når setup-fila blir køyrd ein gong til?
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { byggBase } from "./base.mjs";

const HER = dirname(fileURLToPath(import.meta.url));
const MIGRASJON = join(HER, "..", "..", "supabase", "migrations", "20261014230000_messing_fra_hylla.sql");
const SKU = ["5020109", "5020336", "5020362", "5020433", "5020436", "5020441", "5020489"];

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

sjekk(
  "alle sju ligg under Messingdeler",
  (await en(
    `select count(*)::int as n from public.pipe_types t join public.pipe_categories c on c.id = t.category_id
      where t.sku = any($1) and c.name = 'Messingdeler'`,
    [SKU],
  )).n,
  7,
);
sjekk(
  "utan pris, så kunden ser «–» og ikkje 0 kr",
  (await en(`select count(*)::int as n from public.pipe_types where sku = any($1) and price is null and cost_price is null`, [SKU])).n,
  7,
);
sjekk(
  "nippelmuffa som mangla i lista",
  await en(`select name, unit, stock from public.pipe_types where sku = '5020362'`),
  { name: 'Nippelmuffe messing 1"x 3/4"', unit: "stk", stock: "0" },
);

console.log("\n── Omkøyring ──\n");

await db.exec(`update public.pipe_types set price = 99, cost_price = 70 where sku = '5020109'`);
await db.exec(`delete from public.pipe_types where sku = '5020489'`);
await db.exec(readFileSync(MIGRASJON, "utf8"));

sjekk("ei sletta vare kjem ikkje att", (await en(`select count(*)::int as n from public.pipe_types where sku = any($1)`, [SKU])).n, 6);
sjekk("prisen kontoret har lagt inn, står", await en(`select price, cost_price from public.pipe_types where sku = '5020109'`), {
  price: "99",
  cost_price: "70",
});

console.log(feil === 0 ? "\nAlt stemmer.\n" : `\n${feil} feil.\n`);
process.exit(feil === 0 ? 0 : 1);
