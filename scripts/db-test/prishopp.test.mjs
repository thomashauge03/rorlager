// Tester prishopp (20261019100000_prishopp.sql): hopp oppå påslaget, at
// «Oppdater prisene» ikkje viskar dei ut, at ny prisliste nullstiller, og at
// alt står i sporet.

import { byggBase, som, somAnon, lagFasit } from "./base.mjs";

const KONTOR = { epost: "thomashauge03@gmail.com", uid: "11111111-1111-1111-1111-111111111111" };
const KARI = { epost: "kari@plassen.no", uid: "22222222-2222-2222-2222-222222222222" };

const { tilstand, ok, nei, sjekk } = lagFasit();
const db = await byggBase();
const en = async (sql, p) => (await db.query(sql, p)).rows[0];
const alle = async (sql, p) => (await db.query(sql, p)).rows;
const tal = (v) => (v === null || v === undefined ? v : Number(v));

await db.exec(`
  insert into public.system_users (email, full_name, role) values ('kari@plassen.no', 'Kari Plass', 'prosjekt');
  update public.pipe_settings set markup_percent = 35 where id = 1;
`);
const kat = await en(`insert into public.pipe_categories (name) values ('Messing') returning id`);
const ny = async (sku, cost, price, kategori = null) =>
  (
    await en(
      `insert into public.pipe_types (category_id, name, dimension, sku, unit, price, cost_price, stock, active, qr_slug)
       values ($1, 'Vare ' || $2, null, $2, 'stk', $3, $4, 0, true, 'q-' || $2) returning id`,
      [kategori, sku, price, cost],
    )
  ).id;

const a = await ny("A1", 100, 135); // fylgjer formelen
const b = await ny("B1", 100, 150); // pris sett for hand
const c = await ny("C1", null, 80); // utan innkjøpspris
const m = await ny("M1", 200, 270, kat.id); // i varegruppa
const vare = async (id) => {
  const r = await en(`select price, cost_price, prishopp_faktor from public.pipe_types where id = $1`, [id]);
  return { pris: tal(r.price), faktor: tal(r.prishopp_faktor) };
};
const hopp = (prosent, grunn, kategori = null) =>
  som(db, KONTOR, () => en(`select public.pipe_prishopp($1, $2, $3, 1) as n`, [prosent, grunn, kategori]));

console.log("\n── Eit hopp på +5 % ──\n");

// Basen har katalogen frå migrasjonane i tillegg til dei fire over
const medPris = tal((await en(`select count(*) as n from public.pipe_types where price is not null or cost_price is not null`)).n);
const medInnkjop = tal((await en(`select count(*) as n from public.pipe_types where cost_price is not null`)).n);
const r1 = await hopp(5, "Kronen svekka");
sjekk("alle varer med pris fekk hoppet", tal(r1.n), medPris);
sjekk("formelvare: 100 × 1,35 × 1,05 = 141,75 → 142", await vare(a), { pris: 142, faktor: 1.05 });
sjekk("handsett pris får hoppet på prisen ho har: 150 × 1,05", await vare(b), { pris: 158, faktor: 1.05 });
sjekk("utan innkjøpspris: 80 × 1,05", await vare(c), { pris: 84, faktor: 1.05 });

console.log("\n── Eit hopp ned, berre i éi varegruppe ──\n");

const r2 = await hopp(-2, "Messing billegare", kat.id);
sjekk("berre varegruppa", tal(r2.n), 1);
sjekk("200 × 1,35 × 1,05 × 0,98 = 277,83 → 278", await vare(m), { pris: 278, faktor: 1.029 });
sjekk("dei andre står", (await vare(a)).pris, 142);

console.log("\n── Avrundinga hopar seg ikkje opp ──\n");

await hopp(5, "Kronen igjen");
// Rekna frå innkjøp: 100 × 1,35 × 1,1025 = 148,84 → 149. Frå prisen ville det vore 142 × 1,05 = 149,1 → 149
// – same her, men faktoren skal vere eksakt.
sjekk("faktoren er produktet av hoppa", (await vare(a)).faktor, 1.1025);

console.log("\n── «Oppdater prisene» held på hoppa ──\n");

await som(db, KONTOR, () => db.query(`select public.pipe_apply_markup(35, null, null, 1)`));
sjekk("100 × 1,35 × 1,1025 = 148,84 → 149", await vare(a), { pris: 149, faktor: 1.1025 });
sjekk("handsett pris blir rekna om, men med hoppet", (await vare(b)).pris, 149);

console.log("\n── Ny prisliste nullstiller ──\n");

await som(db, KONTOR, () =>
  db.query(`select public.pipe_import_costs($1::jsonb, 35)`, [
    JSON.stringify([{ sku: "A1", cost: 110 }, { sku: "M1", cost: 200, bekreft: true }]),
  ]),
);
sjekk("ny innkjøpspris: faktor 1, pris 110 × 1,35", await vare(a), { pris: 149, faktor: 1 });
// M1 fekk −2 % og så +5 %: 1,029 × 1,05 = 1,08045, og påslagskøyringa gav 200 × 1,35 × 1,08045 = 291,72 → 292
sjekk("stadfesta til uendra pris: rørt ikkje, beheld hoppet", await vare(m), { pris: 292, faktor: 1.08045 });

console.log("\n── Sporet ──\n");

const spor = await som(db, KONTOR, () =>
  alle(`select slag, prosent, grunn, kategori_namn, antall, created_by_name from public.pipe_prishendingar order by created_at, id`),
);
sjekk(
  "hopp, påslag og import står i rekkjefølgje",
  spor.map((s) => [s.slag, tal(s.prosent), s.grunn, s.kategori_namn, s.antall]),
  [
    ["hopp", 5, "Kronen svekka", null, medPris],
    ["hopp", -2, "Messing billegare", "Messing", 1],
    ["hopp", 5, "Kronen igjen", null, medPris],
    ["paaslag", 35, null, null, medInnkjop],
    ["import", 35, null, null, 1],
  ],
);
sjekk("med namnet på den som gjorde det", spor[0].created_by_name !== null, true);

console.log("\n── Vakter ──\n");

const avvist = async (tittel, fn, mønster) => {
  let m = null;
  try {
    await fn();
  } catch (e) {
    m = e.message;
  }
  m && mønster.test(m) ? ok(tittel) : nei(tittel, m ?? "GIKK GJENNOM");
};
await avvist("hopp utan grunn", () => hopp(5, "  "), /hvorfor/);
await avvist("hopp på 0 %", () => hopp(0, "x"), /kan ikke være 0/);
await avvist("urimeleg hopp", () => hopp(150, "x"), /mellom -50 og 100/);
await avvist("prosjektbrukaren får ikkje hoppe", () => som(db, KARI, () => db.query(`select public.pipe_prishopp(5, 'x')`)), /Ingen tilgang/);
await avvist("ingen kan skrive i sporet", () => som(db, KONTOR, () => db.query(`insert into public.pipe_prishendingar (slag) values ('hopp')`)), /permission denied/i);
await avvist("eller kalle loggfunksjonen sjølv", () => som(db, KONTOR, () => db.query(`select public.pipe_prishending('hopp', 1, 'x', null, 1, 1)`)), /permission denied/i);
await somAnon(db, () => avvist("anon får ikkje lese sporet", () => db.query(`select id from public.pipe_prishendingar`), /permission denied/i));
await som(db, KARI, async () => sjekk("prosjektbrukaren ser ikkje sporet", (await alle(`select id from public.pipe_prishendingar`)).length, 0));

console.log(tilstand.feil === 0 ? `\nAlt i orden. Prishoppa står og har spor.\n` : `\n${tilstand.feil} feil.\n`);
process.exit(tilstand.feil === 0 ? 0 : 1);
