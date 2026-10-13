// Tester at persondata ikkje blir liggjande for alltid (20261014140000_rydding.sql),
// og at det som er rekneskap og lagertal, står.

import { byggBase, somAnon, nekta, lagFasit } from "./base.mjs";

const { tilstand, ok, nei, sjekk } = lagFasit();
const db = await byggBase();
const en = async (sql, p) => (await db.query(sql, p)).rows[0];
const tal = (v) => (v === null || v === undefined ? v : Number(v));

const ordre = async (felt) => {
  const k = Object.keys(felt);
  return (
    await en(
      `insert into public.pipe_orders (${k.join(", ")}) values (${k.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
      Object.values(felt),
    )
  ).id;
};

console.log("\n── Oppsett ──\n");

const gamal = (dagar) => `now() - interval '${dagar} days'`;
const ts = async (dagar) => (await en(`select ${gamal(dagar)} as t`)).t;

// Avviste bestillingar: ei gamal, ei ny
const avvistGamal = await ordre({
  kind: "bestilling", status: "avvist", customer_name: "Avvist Gamal", customer_email: "a@x.no",
  customer_type: "privat", pickup_date: "2026-01-01", stock_drawn_at: null, created_at: await ts(120), handled_at: await ts(100),
});
const avvistNy = await ordre({
  kind: "bestilling", status: "avvist", customer_name: "Avvist Ny", customer_email: "b@x.no",
  customer_type: "privat", pickup_date: "2026-01-01", stock_drawn_at: null, created_at: await ts(10), handled_at: await ts(5),
});

// Uttak: eit ufakturert på 3 år, eit på 1 år
const uttakGamalt = await ordre({
  customer_name: "Kari Kunde", customer_email: "kari@kunde.no", customer_phone: "900 00 000",
  signature: "data:image/png;base64,AAAA", comment: "Ring meg", created_at: await ts(3 * 365), total: 500,
});
const uttakNytt = await ordre({ customer_name: "Per Kunde", customer_email: "per@kunde.no", created_at: await ts(365), total: 200 });

// Fakturert: grunnlag og uttak på 7 år
const grunnlag = (
  await en(`insert into public.pipe_invoices (customer_name, period_from, period_to, total, created_at)
            values ('Ola Privat', current_date, current_date, 300, ${gamal(7 * 365)}) returning id`)
).id;
const fakturertGamalt = await ordre({
  customer_name: "Ola Privat", customer_email: "ola@privat.no", created_at: await ts(7 * 365), invoice_id: grunnlag, total: 300,
});
// Fakturert på 3 år: skal stå (bokføringslova)
const grunnlag3 = (
  await en(`insert into public.pipe_invoices (customer_name, period_from, period_to, total, created_at)
            values ('Lise Lagre', current_date, current_date, 100, ${gamal(3 * 365)}) returning id`)
).id;
const fakturert3 = await ordre({
  customer_name: "Lise Lagre", customer_email: "lise@x.no", created_at: await ts(3 * 365), invoice_id: grunnlag3, total: 100,
});

// Eit forslag på ein ordre som blir sletta
const slettast = await ordre({ customer_name: "Sletta Sjølv", customer_email: "s@x.no" });
await db.query(
  `insert into public.pipe_suggestions (order_id, name, unit, quantity, submitted_by) values ($1, 'Noko', 'stk', 1, 'Sletta Sjølv')`,
  [slettast],
);
ok("ordrar i alle aldrar lagt inn");

console.log("\n── Sletting av ordre ──\n");

await db.query(`delete from public.pipe_orders where id = $1`, [slettast]);
sjekk(
  "forslaget står, men utan namnet",
  (await en(`select submitted_by, name from public.pipe_suggestions where name = 'Noko'`)),
  { submitted_by: null, name: "Noko" },
);

console.log("\n── Ryddinga ──\n");

const svar = (await en(`select public.pipe_rydd_persondata() as v`)).v;
sjekk("éi avvist bestilling sletta, to ordrar anonymiserte", [svar.avviste_bestillinger_slettet, svar.ordrer_anonymisert], [1, 2]);

const finst = async (id) => tal((await en(`select count(*) as n from public.pipe_orders where id = $1`, [id])).n) === 1;
sjekk("den gamle avviste er borte", await finst(avvistGamal), false);
sjekk("den nye avviste står", await finst(avvistNy), true);

const kari = await en(`select customer_name, customer_email, customer_phone, signature, comment, total from public.pipe_orders where id = $1`, [uttakGamalt]);
sjekk(
  "ufakturert uttak på 3 år: personopplysningane er borte, summen står",
  [kari.customer_name, kari.customer_email, kari.customer_phone, kari.signature, kari.comment, tal(kari.total)],
  ["Anonymisert", null, null, null, null, 500],
);
sjekk("ufakturert uttak på 1 år står urørt", (await en(`select customer_name from public.pipe_orders where id = $1`, [uttakNytt])).customer_name, "Per Kunde");
sjekk("fakturert på 7 år er anonymisert", (await en(`select customer_name from public.pipe_orders where id = $1`, [fakturertGamalt])).customer_name, "Anonymisert");
sjekk("og grunnlaget hans òg", (await en(`select customer_name from public.pipe_invoices where id = $1`, [grunnlag])).customer_name, "Anonymisert");
sjekk("fakturert på 3 år står (bokføringslova)", (await en(`select customer_name from public.pipe_orders where id = $1`, [fakturert3])).customer_name, "Lise Lagre");

const igjen = (await en(`select public.pipe_rydd_persondata() as v`)).v;
sjekk("ei ny køyring gjer ingenting meir", [igjen.avviste_bestillinger_slettet, igjen.ordrer_anonymisert], [0, 0]);

console.log("\n── Kven kan køyre ho ──\n");

await somAnon(db, async () => {
  const m = await nekta(() => db.query(`select public.pipe_rydd_persondata()`));
  m && /permission denied/i.test(m) ? ok("anon: ingen kjørerett") : nei("anon", m ?? "GIKK GJENNOM");
});

console.log(tilstand.feil === 0 ? `\nAlt i orden. Persondata blir ryddet etter fristene.\n` : `\n${tilstand.feil} feil.\n`);
process.exit(tilstand.feil === 0 ? 0 : 1);
