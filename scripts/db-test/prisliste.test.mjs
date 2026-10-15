// Kan vi i ettertid sjå kva varer som ikkje var med i siste prisliste?
import { byggBase, som } from "./base.mjs";

const KONTOR = { epost: "thomashauge03@gmail.com" };

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
const import_ = (rader) =>
  som(db, KONTOR, () => en(`select public.pipe_import_costs($1::jsonb, 0) as v`, [JSON.stringify(rader)]));
const dato = async (sku) => (await en(`select prisliste_dato as d from public.pipe_types where sku = $1`, [sku])).d;

console.log("\n── Før noka prisliste ──\n");

sjekk("ingen vare har prislistedato", (await en(`select count(*)::int as n from public.pipe_types where prisliste_dato is not null`)).n, 0);

console.log("\n── Første prisliste ──\n");

await import_([{ sku: "3100544", cost: 210 }, { sku: "2255009", cost: 40 }]);
const første = await dato("3100544");
sjekk("varene i lista får dato", første !== null && (await dato("2255009")) !== null, true);
sjekk("same dato for heile importen", String(await dato("2255009")), String(første));
sjekk("ei vare som ikkje var med, står utan dato", await dato("2252254"), null);

console.log("\n── Neste prisliste, utan den eine ──\n");

// Ny transaksjon, så now() er seinare
await new Promise((r) => setTimeout(r, 20));
await import_([{ sku: "3100544", cost: 210 }]);
const andre = await dato("3100544");
sjekk("med att, også med uendra pris: ny dato", new Date(andre) > new Date(første), true);
sjekk("ikkje med denne gongen: beheld datoen frå førre liste", String(await dato("2255009")), String(første));

const ikkjeMed = await en(
  `select count(*)::int as n from public.pipe_types
    where prisliste_dato is distinct from (select max(prisliste_dato) from public.pipe_types)`,
);
const alle = (await en(`select count(*)::int as n from public.pipe_types`)).n;
sjekk("alle utanom den eine var ikkje med i siste liste", ikkjeMed.n, alle - 1);

console.log("\n── Med i lista til uendra innkjøpspris ──\n");

// Kontoret har retta salsprisen for hand; lista har same innkjøpspris som før
await som(db, KONTOR, () => db.query(`update public.pipe_types set price = 77 where sku = '2255009'`));
const førBekreft = await en(`select cost_price, price from public.pipe_types where sku = '2255009'`);
await new Promise((r) => setTimeout(r, 20));
const r3 = (await import_([{ sku: "3100544", cost: 250 }, { sku: "2255009", cost: 40, bekreft: true }])).v;
sjekk("svaret skil nye prisar frå stadfesta", { updated: r3.updated, confirmed: r3.confirmed }, { updated: 1, confirmed: 1 });
sjekk("stadfesta vare får same dato som resten av lista", String(await dato("2255009")), String(await dato("3100544")));
sjekk(
  "prisane hennar blir ikkje rekna om – heller ikkje salsprisen som er retta for hand",
  await en(`select cost_price, price from public.pipe_types where sku = '2255009'`),
  førBekreft,
);

console.log("\n── Pris retta for hand ──\n");

await som(db, KONTOR, () => db.query(`update public.pipe_types set price = 999 where sku = '2252254'`));
sjekk("handretting gir ingen prislistedato", await dato("2252254"), null);

console.log(feil === 0 ? "\nAlt stemmer.\n" : `\n${feil} feil.\n`);
process.exit(feil === 0 ? 0 : 1);
