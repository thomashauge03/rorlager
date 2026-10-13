// Tester sikringa frå revisjonen 14. oktober 2026 (20261014130000_sikring.sql):
// ny innsending av same uttak, tak og lengder for kundar, fakturerte uttak,
// linjer utan pris i fakturagrunnlaget og avviste uttak.

import { byggBase, som, somAnon, nekta, lagFasit } from "./base.mjs";

const KONTOR = { epost: "thomashauge03@gmail.com", uid: "11111111-1111-1111-1111-111111111111" };
const OLA = { epost: "ola@hauge.no", uid: "66666666-6666-6666-6666-666666666666" };

const { tilstand, ok, nei, sjekk } = lagFasit();
const db = await byggBase();
const en = async (sql, p) => (await db.query(sql, p)).rows[0];
const tal = (v) => (v === null || v === undefined ? v : Number(v));

const avvist = async (tittel, sql, params, mønster) => {
  const m = await nekta(() => db.query(sql, params));
  m && mønster.test(m) ? ok(tittel) : nei(tittel, m ?? "GIKK GJENNOM");
};

await db.exec(`insert into public.system_users (email, full_name, role) values ('ola@hauge.no', 'Ola Ansatt', 'ansatt')`);
const kat = await en(`insert into public.pipe_categories (name) values ('Testgruppe') returning id`);
const ror = (
  await en(
    `insert into public.pipe_types (category_id, name, dimension, unit, price, cost_price, stock, active, qr_slug)
     values ($1, 'PVC', '110 mm', 'm', 100, 60, 1000, true, 'pvc-110') returning id`,
    [kat.id],
  )
).id;
const lager = async () => tal((await en(`select stock from public.pipe_types where id = $1`, [ror])).stock);
const linjer = JSON.stringify([{ pipe_type_id: ror, quantity: 2 }]);
const uttak = (navn, epost, ekstra = "") =>
  `select public.pipe_submit_order('${navn}', $1::jsonb, null, '${epost}'${ekstra}) as v`;

console.log("\n── Same uttak sendt på nytt ──\n");

const ref = "abababab-abab-abab-abab-abababababab";
const første = await somAnon(db, async () => (await en(uttak("Kari", "kari@kunde.no", `, p_client_ref => '${ref}'`), [linjer])).v);
const andre = await somAnon(db, async () => (await en(uttak("Kari", "kari@kunde.no", `, p_client_ref => '${ref}'`), [linjer])).v);
sjekk("same svar andre gongen", andre.id, første.id);
sjekk("same kvittering, med linjene", JSON.stringify(andre), JSON.stringify(første));
sjekk("lageret er trekt éin gong", await lager(), 998);
sjekk("éin ordre i basen", tal((await en(`select count(*) as n from public.pipe_orders where client_ref = $1`, [ref])).n), 1);

await som(db, OLA, () =>
  avvist(
    "ein annan avsendar med same referanse får ikkje Kari sitt uttak – og ei forståeleg melding",
    `select public.pipe_submit_order('x', $1::jsonb, p_project => 'Jobb', p_client_ref => $2)`,
    [linjer, ref],
    /Last siden på nytt/,
  ),
);

console.log("\n── Signatur og lengder ──\n");

await somAnon(db, async () => {
  await avvist("ein signatur som ikkje er PNG blir avvist", uttak("Per", "per@kunde.no", ", null, null, null, 'hei'"), [linjer], /Signaturen er ugyldig/);
  await avvist(
    "ein kjempestor signatur blir avvist",
    uttak("Per", "per@kunde.no", `, null, null, null, 'data:image/png;base64,${"A".repeat(300001)}'`),
    [linjer],
    /Signaturen er ugyldig/,
  );
  const gyldig = (await en(uttak("Per", "per@kunde.no", ", null, null, null, 'data:image/png;base64,iVBORw0KGgo='"), [linjer])).v;
  gyldig?.id ? ok("ein ekte PNG-signatur går gjennom") : nei("PNG-signatur", "gjekk ikkje");
  await avvist("eit namn på 101 teikn blir avvist", uttak("N".repeat(101), "per@kunde.no"), [linjer], /Navnet er for langt/);
  await avvist(
    "ein kommentar på 1001 teikn blir avvist",
    uttak("Per", "per@kunde.no", `, null, null, '${"k".repeat(1001)}'`),
    [linjer],
    /Kommentaren er for lang/,
  );
});

console.log("\n── Tak for kundar ──\n");

await somAnon(db, async () => {
  for (let i = 0; i < 8; i++) await db.query(uttak("Spam", "spam@x.no"), [linjer]);
  // Per har alt to (signaturtesten) – spam har åtte, Kari éin. Éin til går.
  await db.query(uttak("Spam", "spam@x.no"), [linjer]);
  await db.query(uttak("Spam", "spam@x.no"), [linjer]);
  await avvist("elleve uttak frå same e-post på ein time blir stoppa", uttak("Spam", "spam@x.no"), [linjer], /mange uttak den siste timen/);
});
await som(db, OLA, async () => {
  const r = (await en(`select public.pipe_submit_order('x', $1::jsonb, p_project => 'Jobb') as v`, [linjer])).v;
  r?.id ? ok("ein tilsett er ikkje omfatta av kundetaket") : nei("tilsett", "stoppa");
});

// Totaltaket: fyll opp med ulike e-postar til 60 kundeuttak den siste timen
const har = tal((await en(`select count(*) as n from public.pipe_orders where kind = 'uttak' and created_by is null`)).n);
await somAnon(db, async () => {
  for (let i = har; i < 60; i++) await db.query(uttak("Mange", `m${i}@x.no`), [linjer]);
  await avvist("uttak nummer 61 på ein time blir stoppa", uttak("Mange", "ny@x.no"), [linjer], /veldig mange uttak/);
});

console.log("\n── Fakturagrunnlaget ──\n");

const utanPris = await somAnon(db, async () =>
  (
    await en(`select public.pipe_submit_order('Lise', $1::jsonb, null, 'lise@kunde.no') as v`, [
      JSON.stringify([{ annet: { name: "Noko rart", unit: "stk" }, quantity: 1 }]),
    ])
  ).v,
).catch(async () => {
  // Totaltaket er nådd; lag ordren som eigar
  const o = await en(`insert into public.pipe_orders (customer_name, customer_email) values ('Lise', 'lise@kunde.no') returning id`);
  await db.query(
    `insert into public.pipe_order_lines (order_id, name, unit, quantity, is_annet, sort_order) values ($1, 'Noko rart', 'stk', 1, true, 1)`,
    [o.id],
  );
  return { id: o.id };
});

await som(db, KONTOR, async () => {
  await avvist(
    "ei linje utan pris stoppar grunnlaget",
    `select public.pipe_create_invoice('Lise', current_date, current_date, array[$1::uuid], 0)`,
    [utanPris.id],
    /1 linjer mangler pris/,
  );
  const linje = await en(`select id from public.pipe_order_lines where order_id = $1`, [utanPris.id]);
  await db.query(`select public.pipe_price_line($1, 50)`, [linje.id]);
  const f = (await en(`select (public.pipe_create_invoice('Lise', current_date, current_date, array[$1::uuid], 0)).id as id`, [utanPris.id])).id;
  f ? ok("med pris går det") : nei("grunnlag med pris", "gjekk ikkje");

  await avvist("eit fakturert uttak kan ikkje slettast", `select public.pipe_delete_order($1)`, [utanPris.id], /fakturert/);
  await db.query(`select public.pipe_delete_invoice($1)`, [f]);
  await db.query(`select public.pipe_delete_order($1)`, [utanPris.id]);
  ok("når grunnlaget er sletta, går det");
});

console.log("\n── Avvist uttak ──\n");

await avvist(
  "eit uttak kan ikkje setjast til avvist",
  `update public.pipe_orders set status = 'avvist' where id = $1`,
  [første.id],
  /pipe_orders_uttak_ikkje_avvist/,
);

console.log(
  tilstand.feil === 0 ? `\nAlt i orden. Uttak og fakturagrunnlag er sikra.\n` : `\n${tilstand.feil} feil.\n`,
);
process.exit(tilstand.feil === 0 ? 0 : 1);
