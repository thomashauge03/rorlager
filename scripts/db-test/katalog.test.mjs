// Tetter vi innkjøpsprisen uten å ødelegge kundeflyten?
import { byggBase, som, somAnon, nekta } from "./base.mjs";

const KONTOR = { epost: "thomashauge03@gmail.com" };
const KARI = { epost: "kari@plassen.no" };

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
const alle = async (sql, p) => (await db.query(sql, p)).rows;

await db.exec(`insert into public.system_users (email, full_name, role) values ('kari@plassen.no', 'Kari', 'prosjekt')`);

// Dahl-katalogen kjem inn med stock = 0; lageret blir talt opp etterpå.
await db.exec(`update public.pipe_types set stock = 40 where id in (select id from public.pipe_types where active limit 5)`);

console.log("\n── Innkjøpsprisen er borte for anonyme ──\n");

await somAnon(db, async () => {
  const m = await nekta(() => db.query(`select cost_price from public.pipe_types limit 1`));
  m ? ok("kommer ikke til pipe_types i det hele tatt") : nei("pipe_types", "anon fikk lese tabellen!");

  const m2 = await nekta(() => db.query(`select markup_percent from public.pipe_settings`));
  m2 ? ok("kommer ikke til pipe_settings") : nei("pipe_settings", "anon fikk lese tabellen!");

  const kols = await alle(
    `select column_name from information_schema.columns where table_name = 'pipe_catalog' and column_name = 'cost_price'`,
  );
  sjekk("pipe_catalog har ingen cost_price-kolonne", kols.length, 0);

  const kols2 = await alle(
    `select column_name from information_schema.columns where table_name = 'pipe_public_settings' and column_name = 'markup_percent'`,
  );
  sjekk("pipe_public_settings har ingen markup_percent", kols2.length, 0);
});

console.log("\n── Kundeflyten er urørt ──\n");

let foer, etter, slug;

await somAnon(db, async () => {
  const n = (await alle(`select id from public.pipe_catalog`)).length;
  n === 156 ? ok(`anon leser katalogen gjennom visningen (${n} rader)`) : nei("katalogen", `${n} rader`);

  const s = await en(`select company_name, show_prices from public.pipe_public_settings`);
  s?.company_name ? ok(`anon leser innstillingene (${s.company_name})`) : nei("innstillingene", "ingen rad");

  const c = (await alle(`select id from public.pipe_categories`)).length;
  c > 0 ? ok(`anon leser kategoriene (${c})`) : nei("kategoriene", "0");

  const vare = await en(`select id, qr_slug, name, stock from public.pipe_catalog where active and stock > 10 limit 1`);
  slug = vare.qr_slug;
  foer = Number(vare.stock);
  ok(`fant en vare via QR-koden: ${vare.qr_slug}`);

  // Hele kundeflyten: legg inn et uttak som anonym
  const r = await en(
    `select public.pipe_submit_order(
       'Ola Kunde',
       $1::jsonb,
       '99887766', null, null, 'Storgata 4', 'Henta på formiddagen', null
     ) as res`,
    [JSON.stringify([{ pipe_type_id: vare.id, quantity: 3 }])],
  );
  r.res?.order_number
    ? ok(`pipe_submit_order svarer som før (bestilling ${r.res.order_number})`)
    : nei("pipe_submit_order", JSON.stringify(r.res));
});

etter = Number((await en(`select stock from public.pipe_types where qr_slug = $1`, [slug])).stock);
sjekk("beholdningen ble trukket ned med 3", foer - etter, 3);

const logg = await en(`select count(*)::int as n from public.pipe_stock_log where reason = 'bestilling'`);
logg.n > 0 ? ok(`lagerloggen fikk sin rad (${logg.n})`) : nei("lagerloggen", "ingen rad");

await somAnon(db, async () => {
  const m = await nekta(() => db.query(`select customer_name from public.pipe_orders`));
  m ? ok("anon kan fortsatt ikke lese bestillingene han har lagt inn") : nei("pipe_orders", "anon fikk lese!");
});

console.log("\n── Kontoret ser fortsatt innkjøpsprisen ──\n");

await som(db, KONTOR, async () => {
  const v = await en(`select name, price, cost_price from public.pipe_types where cost_price is not null limit 1`);
  v?.cost_price ? ok(`kontoret leser cost_price (${v.cost_price})`) : nei("cost_price", "kontoret fikk ikke lese");
  const s = await en(`select markup_percent from public.pipe_settings`);
  s?.markup_percent != null ? ok(`kontoret leser påslaget (${s.markup_percent} %)`) : nei("markup_percent", "ikke lest");
  const k = (await alle(`select id from public.pipe_catalog`)).length;
  k === 156 ? ok("kontoret kan også bruke visningen") : nei("visningen for kontor", k);
});

console.log("\n── Prosjektbrukeren ser katalogen, men ikke prisen inn ──\n");

// Merk skilnaden frå anon: der gir tilbaketrekkinga ein hard rettigheitsfeil.
// Ein innlogga prosjektbrukar har derimot tabellrettigheiter frå Supabase, så
// det er RLS som stoppar han – og RLS svarar med null rader, ikkje med ein feil.
// Begge er stengt; det er talet på rader som er beviset her.
await som(db, KARI, async () => {
  const t = await alle(`select id, cost_price from public.pipe_types`);
  sjekk("pipe_types gir null rader til prosjektbrukeren", t.length, 0);

  const s = await alle(`select markup_percent from public.pipe_settings`);
  sjekk("pipe_settings gir null rader", s.length, 0);

  const n = (await alle(`select id, name, dimension, unit from public.pipe_catalog`)).length;
  n === 156 ? ok(`leser katalogen gjennom visningen (${n}) – trengs for å melde behov`) : nei("katalogen", n);

  const p = await en(`select price from public.pipe_catalog where price is not null limit 1`);
  p?.price != null ? ok(`ser salgsprisen (${p.price}), som er den han skal se`) : nei("price", "manglar");
});

console.log(feil === 0 ? `\nAlt i orden. Prisen er tettet, kundeflyten står.\n` : `\n${feil} feil.\n`);
process.exit(feil === 0 ? 0 : 1);
