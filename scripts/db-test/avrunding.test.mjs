// Tester avrundinga (20261019110000_avrunding.sql): lagra trinn og retning,
// «alltid opp» i påslag, import og prishopp – og at ein pris som går opp
// framleis tel som «fylgjer formelen».

import { byggBase, som, lagFasit } from "./base.mjs";

const KONTOR = { epost: "thomashauge03@gmail.com", uid: "11111111-1111-1111-1111-111111111111" };

const { tilstand, ok, nei, sjekk } = lagFasit();
const db = await byggBase();
const en = async (sql, p) => (await db.query(sql, p)).rows[0];
const tal = (v) => (v === null || v === undefined ? v : Number(v));

const ny = async (sku, cost) =>
  (
    await en(
      `insert into public.pipe_types (name, sku, unit, price, cost_price, stock, active, qr_slug)
       values ('Vare ' || $1, $1, 'stk', null, $2, 0, true, 'q-' || $1) returning id`,
      [sku, cost],
    )
  ).id;
const pris = async (id) => tal((await en(`select price from public.pipe_types where id = $1`, [id])).price);
const påslag = (steg = 1) => som(db, KONTOR, () => db.query(`select public.pipe_apply_markup(35, null, null, $1)`, [steg]));

await db.exec(`update public.pipe_settings set markup_percent = 35 where id = 1`);
const a = await ny("A1", 63.7); // 85,995
const b = await ny("B1", 13.1); // 17,685
const c = await ny("C1", 100); // 135 akkurat
const d = await ny("D1", 63.2); // 85,32

console.log("\n── Standard: heile kroner, alltid opp ──\n");

const s = await en(`select price_round_to, price_round_up from public.pipe_settings where id = 1`);
sjekk("innstillinga står på 1 kr og opp", [tal(s.price_round_to), s.price_round_up], [1, true]);

await påslag();
sjekk("85,995 → 86", await pris(a), 86);
sjekk("17,685 → 18", await pris(b), 18);
sjekk("135 akkurat blir ikkje 136", await pris(c), 135);
sjekk("85,32 → 86, aldri under avansen", await pris(d), 86);

console.log("\n── Næraste ──\n");

await som(db, KONTOR, () => db.query(`update public.pipe_settings set price_round_up = false where id = 1`));
await påslag();
sjekk("85,32 → 85 med vanleg avrunding", await pris(d), 85);
await påslag(5);
sjekk("til 5 kr: 85,32 → 85", await pris(d), 85);
await som(db, KONTOR, () => db.query(`update public.pipe_settings set price_round_up = true where id = 1`));
await påslag(5);
sjekk("til 5 kr, opp: 85,32 → 90", await pris(d), 90);
await påslag(1);

console.log("\n── Import ──\n");

await som(db, KONTOR, () =>
  db.query(`select public.pipe_import_costs($1::jsonb, 35, 1)`, [JSON.stringify([{ sku: "D1", cost: 64.1 }])]),
);
sjekk("ny innkjøpspris 64,10 × 1,35 = 86,535 → 87", await pris(d), 87);

console.log("\n── Prishopp ──\n");

await som(db, KONTOR, () => db.query(`select public.pipe_prishopp(5, 'Kronen', null, 1)`));
// D1 fylgde formelen (87 = opp frå 86,535), så hoppet blir rekna frå innkjøp: 86,535 × 1,05 = 90,86 → 91
sjekk("formelvare blir rekna frå innkjøp og runda opp", await pris(d), 91);
sjekk("135 × 1,05 = 141,75 → 142", await pris(c), 142);

console.log("\n── Vakter ──\n");

let m = null;
try {
  await som(db, KONTOR, () => db.query(`update public.pipe_settings set price_round_to = 2 where id = 1`));
} catch (e) {
  m = e.message;
}
m && /price_round_to_check/.test(m) ? ok("eit trinn på 2 kr blir avvist") : nei("eit trinn på 2 kr blir avvist", m ?? "GIKK GJENNOM");

const spor = await en(
  `select endringar from public.pipe_revisjon where tabell = 'pipe_settings' order by created_at desc, id desc limit 1`,
);
sjekk("endringa av retninga står i revisjonssporet", Object.keys(spor.endringar), ["price_round_up"]);

console.log(tilstand.feil === 0 ? `\nAlt i orden. Prisane blir runde og aldri under avansen.\n` : `\n${tilstand.feil} feil.\n`);
process.exit(tilstand.feil === 0 ? 0 : 1);
