// Regresjonstestar for hol som faktisk har vore opne.
//
// Kvar test her svarar til noko som blei demonstrert mot ein ekte base under
// gjennomgangen 3. september 2026. Dei står att fordi eit tetta hol utan ein
// test er eit hol som kjem tilbake neste gong nokon skriv om ein policy.

import { byggBase, som, somAnon, nekta, lagFasit } from "./base.mjs";

const KONTOR = { epost: "thomashauge03@gmail.com" };
const KARI = { epost: "kari@plassen.no" };

const { tilstand, ok, nei, sjekk } = lagFasit();
const db = await byggBase();
const en = async (sql, p) => (await db.query(sql, p)).rows[0];
const antal = async (sql, p) => (await db.query(sql, p)).rows.length;

await db.exec(`
  insert into public.system_users (email, full_name, role) values
    ('kari@plassen.no', 'Kari', 'prosjekt'),
    ('stor@bokstav.no', 'Stor Bokstav', ' Prosjekt ');
`);

const p1 = await en(`insert into public.projects (name) values ('Storgata 4') returning id`);
await db.query(`insert into public.project_members (project_id, email) values ($1, 'kari@plassen.no')`, [p1.id]);

console.log("\n── Visningane skal berre kunne lesast ──\n");
// Fanst som hol: `grant select` la berre til, medan Supabase sine default
// privileges alt hadde gitt anon alle rettar på visninga. Ei visning utan
// security_invoker køyrer med eigaren sine rettar, så ein anonym DELETE slo
// rett gjennom til pipe_types og tømde katalogen.

await somAnon(db, async () => {
  for (const [sql, kva] of [
    [`update public.pipe_catalog set price = 1`, "UPDATE pipe_catalog"],
    [`delete from public.pipe_catalog`, "DELETE pipe_catalog"],
    [`insert into public.pipe_catalog (name, qr_slug) values ('juks', 'juks')`, "INSERT pipe_catalog"],
    [`update public.pipe_public_settings set company_name = 'Kapra AS'`, "UPDATE pipe_public_settings"],
    [`truncate public.pipe_types cascade`, "TRUNCATE pipe_types"],
    [`truncate public.pipe_settings cascade`, "TRUNCATE pipe_settings"],
    [`truncate public.system_users cascade`, "TRUNCATE system_users"],
    [`truncate public.super_admins cascade`, "TRUNCATE super_admins"],
  ]) {
    const m = await nekta(() => db.query(sql));
    m ? ok(`anon: ${kva} nektes`) : nei(kva, "GIKK GJENNOM");
  }

  const les = await antal(`select id from public.pipe_catalog limit 1`);
  les === 1 ? ok("anon kan fortsatt LESE katalogen") : nei("lesing", `${les} rader`);
});

sjekk("katalogen står urørt etterpå", (await en(`select count(*)::int n from public.pipe_types`)).n, 156);

console.log("\n── Sekvensane ──\n");
// Fanst som hol: berre pipe_orders-sekvensen var trekt tilbake. Dei andre
// røpte kor mange ordrar og fakturaer firmaet har hatt, og kunne setval-ast.

await somAnon(db, async () => {
  for (const seq of [
    "projects_project_number_seq",
    "project_orders_order_number_seq",
    "project_receipts_receipt_number_seq",
    "pipe_invoices_invoice_number_seq",
    "pipe_orders_order_number_seq",
  ]) {
    const m = await nekta(() => db.query(`select last_value from public.${seq}`));
    m ? ok(`anon: ${seq} stengt`) : nei(seq, "ANON KAN LESE SEKVENSEN");
  }
});

console.log("\n── Plassen kan ikke spille kontor ──\n");
// Fanst som hol: policyen «project_orders endre» hadde `using` med statusvilkår
// men `with check` utan. `using` prøver den GAMLE rada, så
// `update ... set status = 'bestilt'` slapp gjennom. Då kunne plassen setje sin
// eigen ordered_qty – fasiten – og kvittere for den sjølv.

const ordre = await en(
  `insert into public.project_orders (project_id, status, requested_by_name) values ($1, 'meldt', 'Kari') returning id`,
  [p1.id],
);
const linje = await en(
  `insert into public.project_order_lines (order_id, name, unit, requested_qty) values ($1, 'Rør', 'm', 50) returning id`,
  [ordre.id],
);

await som(db, KARI, async () => {
  for (const status of ["bestilt", "delvis", "mottatt"]) {
    await nekta(() => db.query(`update public.project_orders set status = $1 where id = $2`, [status, ordre.id]));
    const n = await en(`select status from public.project_orders where id = $1`, [ordre.id]);
    n.status === "meldt" ? ok(`kan ikke sette status ${status}`) : nei(`status ${status}`, `ble ${n.status}`);
  }

  await nekta(() => db.query(`update public.project_orders set supplier = 'Juks AS' where id = $1`, [ordre.id]));
  const s = await en(`select supplier from public.project_orders where id = $1`, [ordre.id]);
  sjekk("kan ikke skrive leverandørfeltet", s.supplier, null);

  await nekta(() => db.query(`update public.project_order_lines set ordered_qty = 999 where id = $1`, [linje.id]));
  const l = await en(`select ordered_qty from public.project_order_lines where id = $1`, [linje.id]);
  sjekk("kan ikke sette ordered_qty – fasiten er kontorets", l.ordered_qty, null);

  const m = await nekta(() =>
    db.query(`insert into public.project_order_lines (order_id, name, requested_qty) values ($1, 'Snik', 1)`, [ordre.id]),
  );
  m ? ok("kan ikke legge til en linje direkte") : nei("ny linje", "GIKK GJENNOM");

  const r = await nekta(() =>
    db.query(`select public.project_submit_receipt($1, 'Kari', $2::jsonb, null, null, null, null, 'testkjøring')`, [
      ordre.id,
      JSON.stringify([{ order_line_id: linje.id, received_qty: 50 }]),
    ]),
  );
  r && /ikke bestilt/.test(r) ? ok("kan ikke kvittere før kontoret har bestilt") : nei("kvittering", r ?? "GIKK GJENNOM");
});

console.log("\n── Men plassen kan trekke tilbake sitt eget behov ──\n");

await som(db, KARI, async () => {
  // Plukkar felta ut enkeltvis: ein samansett returtype kjem tilbake som éin
  // streng gjennom protokollen, og då er .id berre undefined.
  const eige = await en(
    `select (public.project_submit_request($1, 'Kari', $2::jsonb)).id as id,
            (select max(order_number) from public.project_orders) as nr`,
    [p1.id, JSON.stringify([{ name: "Kobling", unit: "stk", requested_qty: 4 }])],
  );
  eige?.id ? ok(`melder inn behov gjennom RPC-en (#${eige.nr})`) : nei("innmelding", JSON.stringify(eige));

  const linjer = await antal(`select id from public.project_order_lines where order_id = $1`, [eige.id]);
  sjekk("linja følgde med i samme transaksjon", linjer, 1);

  await db.query(`delete from public.project_orders where id = $1`, [eige.id]);
  const att = await antal(`select id from public.project_orders where id = $1`, [eige.id]);
  sjekk("kan trekke tilbake et meldt behov", att, 0);
});

console.log("\n── Rollen tåler stor bokstav og mellomrom ──\n");
// Fanst som skjørheit: `coalesce(role,'') <> 'prosjekt'` gjorde ' Prosjekt '
// til kontor, og system_users har ingen skranke på role.

await som(db, { epost: "stor@bokstav.no" }, async () => {
  sjekk("' Prosjekt ' er ikke kontor", (await en(`select public.hm_er_kontor() as v`)).v, false);
  sjekk("hm_rolle normaliserer svaret", (await en(`select public.hm_rolle() as v`)).v, "prosjekt");
  sjekk("ser ingen fakturaer", await antal(`select id from public.pipe_invoices`), 0);
});

/*
 * TABULATOR, IKKE BARE MELLOMROM.
 *
 * Sammenligningen brukte `btrim()`, som med standardargument fjerner BARE
 * mellomrom. En rolle skrevet 'prosjekt\t' ble dermed regnet som noe annet enn
 * 'prosjekt' — altså som kontor, med full tilgang til fakturagrunnlag og
 * innkjøpspriser.
 *
 * Edge-funksjonen normaliserer med JS .trim(), som fjerner tab. Men det
 * forsvaret gjelder bare den ene veien inn; en rad lagt inn fra SQL Editor
 * eller et importskript var ikke dekket.
 */
for (const [rolle, kva] of [
  ["prosjekt\t", "tabulator"],
  ["prosjekt\n", "linjeskift"],
  [" prosjekt", "hardt mellomrom"],
  ["  PROSJEKT  ", "store bokstaver og mellomrom"],
]) {
  const e = `blank-${Buffer.from(kva).toString("hex").slice(0, 8)}@test.no`;
  await db.query(`insert into public.system_users (email, role) values ($1, $2)`, [e, rolle]);
  await som(db, { epost: e }, async () => {
    const k = (await en(`select public.hm_er_kontor() as v`)).v;
    k === false ? ok(`rolle med ${kva} er ikke kontor`) : nei(`rolle med ${kva}`, "BLE REGNET SOM KONTOR");
    sjekk(`  og hm_rolle svarer rent`, (await en(`select public.hm_rolle() as v`)).v, "prosjekt");
  });
}

console.log("\n── Medlemskap kan ikke gis av en selv ──\n");
// Policyen er riktig, men ingen test spurte om det. Blir «project_members les»
// en gang endret fra `for select` til `for all`, får plassen tilgang til hvert
// prosjekts bestillinger, kvitteringer og bilder — og alt annet står grønt.

{
  const pB = await en(`insert into public.projects (name) values ('Andres plass') returning id`);
  await som(db, KARI, async () => {
    const m = await nekta(() =>
      db.query(`insert into public.project_members (project_id, email) values ($1, 'kari@plassen.no')`, [pB.id]),
    );
    m ? ok("Kari kan ikke sette seg selv på et fremmed prosjekt") : nei("selvpåmelding", "GIKK GJENNOM");
    sjekk("og ser det fortsatt ikke", await antal(`select id from public.projects where id = $1`, [pB.id]), 0);
  });
}

console.log("\n── Kontorets side av det ──\n");

await som(db, KONTOR, async () => {
  await db.query(`select public.project_mark_ordered($1, 'Dahl', 'BD-1', null, $2::jsonb)`, [
    ordre.id,
    JSON.stringify([{ id: linje.id, ordered_qty: 40 }]),
  ]);

  // Fanst som feil: same linje to gonger i eitt kall såg ikkje den første av
  // dei, så overleveringa slapp unna for_mye-merkinga.
  await db.query(`select public.project_submit_receipt($1, 'Kontoret', $2::jsonb, null, null, null, null, 'testkjøring')`, [
    ordre.id,
    JSON.stringify([
      { order_line_id: linje.id, received_qty: 20 },
      { order_line_id: linje.id, received_qty: 30 },
    ]),
  ]);
  const avvik = await db.query(
    `select deviation from public.project_receipt_lines where order_line_id = $1 order by received_qty`,
    [linje.id],
  );
  avvik.rows.some((r) => r.deviation === "for_mye")
    ? ok("duplisert linje i samme kvittering fanges som for_mye")
    : nei("duplikat", JSON.stringify(avvik.rows.map((r) => r.deviation)));
});

console.log("\n── Statusen rulles ikke tilbake ──\n");
// Fanst som feil: project_mark_ordered sette status = 'bestilt' ubetinga.
// Opna kontoret panelet for å skrive inn ordrenummeret på ei delvis motteken
// bestilling, forsvann mottaka frå skjermen til plassen.

await som(db, KONTOR, async () => {
  const o = await en(`insert into public.project_orders (project_id, status) values ($1, 'meldt') returning id`, [p1.id]);
  const l = await en(
    `insert into public.project_order_lines (order_id, name, requested_qty) values ($1, 'Delvis', 10) returning id`,
    [o.id],
  );
  await db.query(`select public.project_mark_ordered($1, 'Dahl', null, null, $2::jsonb)`, [
    o.id,
    JSON.stringify([{ id: l.id, ordered_qty: 10 }]),
  ]);
  await db.query(`select public.project_submit_receipt($1, 'Kari', $2::jsonb, null, null, null, null, 'testkjøring')`, [
    o.id,
    JSON.stringify([{ order_line_id: l.id, received_qty: 6 }]),
  ]);
  sjekk("delvis etter første pulje", (await en(`select status from public.project_orders where id = $1`, [o.id])).status, "delvis");

  await db.query(`select public.project_mark_ordered($1, 'Dahl', 'BD-SEINT', current_date + 5, '[]'::jsonb)`, [o.id]);
  const etterpaa = await en(`select status, supplier_ref from public.project_orders where id = $1`, [o.id]);
  sjekk("fortsatt delvis etter at kontoret skrev inn ordrenummeret", etterpaa.status, "delvis");
  sjekk("og ordrenummeret ble lagret", etterpaa.supplier_ref, "BD-SEINT");

  // Fanst som feil: coalesce gjorde at eit tømt felt spratt tilbake til den
  // gamle verdien, og kontoret kunne aldri rette ein feilskriven dato.
  await db.query(`select public.project_mark_ordered($1, 'Dahl', null, null, '[]'::jsonb)`, [o.id]);
  const tømt = await en(`select supplier_ref, expected_at from public.project_orders where id = $1`, [o.id]);
  sjekk("kontoret kan tømme et felt det har skrevet feil", [tømt.supplier_ref, tømt.expected_at], [null, null]);

  // Idempotens: same client_ref to gonger skal gi same kvittering, ikkje ei ny
  // pulje. Byggjeplassdekning gjer at eit svar kan bli borte etter at
  // skrivinga gjekk gjennom.
  const nokkel = "11111111-2222-3333-4444-555555555555";
  const a = await en(`select public.project_submit_receipt($1, 'Kari', $2::jsonb, null, null, $3, null, 'testkjøring') as r`, [
    o.id,
    JSON.stringify([{ order_line_id: l.id, received_qty: 2 }]),
    nokkel,
  ]);
  const b = await en(`select public.project_submit_receipt($1, 'Kari', $2::jsonb, null, null, $3, null, 'testkjøring') as r`, [
    o.id,
    JSON.stringify([{ order_line_id: l.id, received_qty: 2 }]),
    nokkel,
  ]);
  sjekk("samme client_ref gir samme kvittering", a.r.id, b.r.id);
  const sum = await en(
    `select coalesce(sum(rl.received_qty),0)::int s from public.project_receipt_lines rl
       join public.project_receipts r on r.id = rl.receipt_id
      where rl.order_line_id = $1`,
    [l.id],
  );
  sjekk("og teller bare én gang", sum.s, 8);
});

console.log("\n── TRUNCATE går utenom RLS. Derfor må privilegiet vekk ──\n");
/*
 * Fanst som hol: kvar revoke i migrasjonane tok berre anon. Supabase sine
 * default privileges gav authenticated «all» – som inkluderer TRUNCATE – og
 * authenticated er kven som helst som har registrert seg. Ein konto utan rad i
 * system_users har ingen tilgang i det heile, men han er authenticated, og
 * TRUNCATE ser ingen policy.
 */
const FRAMAND = { epost: "ingen@stad.no", uid: "00000000-0000-0000-0000-0000000000aa" };

await som(db, FRAMAND, async () => {
  for (const t of ["system_users", "super_admins", "projects", "pipe_types", "project_receipts"]) {
    const m = await nekta(() => db.exec(`truncate public.${t} cascade`));
    m ? ok(`TRUNCATE ${t} nektes`) : nei(`TRUNCATE ${t}`, "gikk gjennom");
  }

  const m = await nekta(() => db.query(`select setval('public.projects_project_number_seq', 9999)`));
  m ? ok("setval på nummerserien nektes") : nei("setval", "gikk gjennom");
});

const staarIgjen = await en(`select count(*)::int n from public.system_users`);
staarIgjen.n > 0 ? ok(`tilgangsmodellen står (${staarIgjen.n} brukere)`) : nei("system_users", "tømt");
const katalogIgjen = await en(`select count(*)::int n from public.pipe_types`);
katalogIgjen.n > 100 ? ok(`katalogen står (${katalogIgjen.n} varer)`) : nei("pipe_types", "tømt");

console.log("\n── NaN er ikke et antall ──\n");
/*
 * Postgres sorterer NaN som det største numeriske talet, så «NaN <= 0» er
 * usant og både vakta i funksjonen og CHECK-en slapp han gjennom. Verst i
 * statusutrekninga: ho spør «mottatt < bestilt», og NaN < 10 er usant, så ei
 * bestilling der det kom «NaN» av ei vare stod som fullt mottatt.
 */
const p2 = await en(`insert into public.projects (name) values ('Talltesten') returning id`);
await db.query(`insert into public.project_members (project_id, email) values ($1, 'kari@plassen.no')`, [p2.id]);

await som(db, KARI, async () => {
  for (const verdi of ["NaN", "Infinity"]) {
    const m = await nekta(() =>
      db.query(`select public.project_submit_request($1, 'Kari', null, null, $2::jsonb)`, [
        p2.id,
        JSON.stringify([{ name: "Rør", unit: "m", requested_qty: verdi }]),
      ]),
    );
    m ? ok(`«${verdi}» som bestilt antall nektes`) : nei(`${verdi} bestilt`, "gikk gjennom");
  }
});

const talOrdre = await en(
  `insert into public.project_orders (project_id, requested_by_name, status)
   values ($1, 'Kari', 'bestilt') returning id`,
  [p2.id],
);
const talLinje = await en(
  `insert into public.project_order_lines (order_id, name, unit, requested_qty, ordered_qty)
   values ($1, 'Rør', 'm', 10, 10) returning id`,
  [talOrdre.id],
);

await som(db, KARI, async () => {
  for (const verdi of ["NaN", "Infinity"]) {
    const m = await nekta(() =>
      db.query(`select public.project_submit_receipt($1, 'Kari', $2::jsonb, null, null, null, null, 'testkjøring')`, [
        talOrdre.id,
        JSON.stringify([{ order_line_id: talLinje.id, received_qty: verdi }]),
      ]),
    );
    m ? ok(`«${verdi}» som mottatt antall nektes`) : nei(`${verdi} mottatt`, "gikk gjennom");
  }
});

const status = await en(`select status from public.project_orders where id = $1`, [talOrdre.id]);
sjekk("bestillingen står fortsatt som bestilt, ikke mottatt", status.status, "bestilt");

console.log("\n── project_recompute_status har vakta i kroppen, ikke bare i rettighetene ──\n");
/*
 * Funksjonen er SECURITY DEFINER. I dag er han stengd av eit «revoke execute»
 * åleine, og «create or replace» tek vare på det. Men ein «drop» + «create» i
 * ein seinare migrasjon ville stille gitt han tilbake til alle innlogga,
 * gjennom dei same default privileges som resten av fila handlar om.
 */
await som(db, FRAMAND, async () => {
  const m = await nekta(() => db.query(`select public.project_recompute_status($1)`, [talOrdre.id]));
  m ? ok("en fremmed når ikke fram") : nei("recompute", "gikk gjennom");
});

await db.exec(`grant execute on function public.project_recompute_status(uuid) to authenticated`);
await som(db, FRAMAND, async () => {
  const m = await nekta(() => db.query(`select public.project_recompute_status($1)`, [talOrdre.id]));
  m === "Fant ikke bestillingen"
    ? ok("og heller ikke om rettigheten skulle komme tilbake")
    : nei("recompute uten revoke", `fikk ${JSON.stringify(m)}`);
});
await db.exec(`revoke all on function public.project_recompute_status(uuid) from public, anon, authenticated`);

console.log("\n── Avvik kan lukkes, men bare av kontoret ──\n");
/*
 * Avvikslista hadde ingen botn: alt som nokon gong var registrert låg der for
 * alltid. Og plassen skal ikkje kunne krysse av sitt eige avvik – det er
 * kontoret som tek det med leverandøren.
 */
const avvikOrdre = await en(
  `insert into public.project_orders (project_id, requested_by_name, status)
   values ($1, 'Kari', 'bestilt') returning id`,
  [p1.id],
);
const avvikLinje = await en(
  `insert into public.project_order_lines (order_id, name, unit, requested_qty, ordered_qty)
   values ($1, 'Bend 110', 'stk', 4, 4) returning id`,
  [avvikOrdre.id],
);
const kvitt = await en(
  `insert into public.project_receipts (order_id, received_by_name, no_photo_reason)
   values ($1, 'Kari', 'testkjøring') returning id`,
  [avvikOrdre.id],
);
const avvikRad = await en(
  `insert into public.project_receipt_lines (receipt_id, order_line_id, received_qty, deviation, note)
   values ($1, $2, 4, 'skadet', 'sprekk i muffen') returning id`,
  [kvitt.id, avvikLinje.id],
);

await som(db, KARI, async () => {
  const m = await nekta(() => db.query(`select public.project_resolve_deviation($1, true)`, [avvikRad.id]));
  m && /kontoret/i.test(m) ? ok("plassen kan ikke lukke sitt eget avvik") : nei("plassen lukker", m ?? "GIKK GJENNOM");

  // Og heller ikkje rett på tabellen, utanom funksjonen
  await nekta(() => db.query(`update public.project_receipt_lines set resolved_at = now() where id = $1`, [avvikRad.id]));
  const r = await en(`select resolved_at from public.project_receipt_lines where id = $1`, [avvikRad.id]);
  sjekk("heller ikke rett på tabellen", r?.resolved_at ?? null, null);
});

await som(db, KONTOR, async () => {
  await db.query(`select public.project_resolve_deviation($1, true)`, [avvikRad.id]);
  const r = await en(`select resolved_at, resolved_by from public.project_receipt_lines where id = $1`, [avvikRad.id]);
  r?.resolved_at ? ok(`kontoret krysser av (${r.resolved_by})`) : nei("kontoret lukker", "ble ikke satt");

  await db.query(`select public.project_resolve_deviation($1, false)`, [avvikRad.id]);
  const igjen = await en(`select resolved_at from public.project_receipt_lines where id = $1`, [avvikRad.id]);
  sjekk("og kan åpne det igjen", igjen?.resolved_at ?? null, null);
});

console.log("\n── Puljer: 100 bestilt, så 60 + 30 + 20 ──\n");
/*
 * project_recompute_status er FASITEN for om ei bestilling er levert.
 * TS-spegelen blei med vilje sletta fordi databasen skal vere einaste
 * autoritet – og så var autoriteten den einaste delen utan ein einaste test.
 *
 * Overleveringa til slutt er poenget: 60 + 30 + 20 = 110 av 100 bestilte.
 */
const puljeOrdre = await en(
  `insert into public.project_orders (project_id, requested_by_name, status)
   values ($1, 'Kari', 'bestilt') returning id`,
  [p1.id],
);
const puljeLinje = await en(
  `insert into public.project_order_lines (order_id, name, unit, requested_qty, ordered_qty)
   values ($1, 'Overvannsrør 200', 'm', 100, 100) returning id`,
  [puljeOrdre.id],
);

const puljeStatus = async () => (await en(`select status from public.project_orders where id = $1`, [puljeOrdre.id])).status;
sjekk("før noe kom: bestilt", await puljeStatus(), "bestilt");

await som(db, KARI, async () => {
  for (const [antal, venta] of [
    [60, "delvis"],
    [30, "delvis"],
    [20, "mottatt"],
  ]) {
    await db.query(`select public.project_submit_receipt($1, 'Kari', $2::jsonb, null, null, null, null, 'testkjøring')`, [
      puljeOrdre.id,
      JSON.stringify([{ order_line_id: puljeLinje.id, received_qty: antal }]),
    ]);
    const s = await puljeStatus();
    s === venta ? ok(`etter ${antal} m: ${s}`) : nei(`pulje ${antal}`, `venta ${venta}, fikk ${s}`);
  }
});

const sum = await en(
  `select coalesce(sum(rl.received_qty),0)::numeric s from public.project_receipt_lines rl
     join public.project_receipts r on r.id = rl.receipt_id
    where rl.order_line_id = $1`,
  [puljeLinje.id],
);
sjekk("summen over alle puljer er 110", Number(sum.s), 110);

/*
 * Og avviket på siste pulja: klienten sende «ingen», men 60 + 30 + 20 er ti
 * meter for mykje. projects.ts påstår at «databasen tvingar for_mye uansett kva
 * klienten sender». Den påstanden var utesta.
 */
const sisteAvvik = await en(
  `select rl.deviation from public.project_receipt_lines rl
     join public.project_receipts r on r.id = rl.receipt_id
    where rl.order_line_id = $1 order by r.receipt_number desc limit 1`,
  [puljeLinje.id],
);
sjekk("databasen tvinger «for mye», selv om klienten sa «ingen»", sisteAvvik.deviation, "for_mye");

const rest = await en(
  `select ordered_qty - coalesce((
     select sum(rl.received_qty) from public.project_receipt_lines rl
       join public.project_receipts r on r.id = rl.receipt_id
      where rl.order_line_id = l.id), 0) as rest
     from public.project_order_lines l where l.id = $1`,
  [puljeLinje.id],
);
sjekk("resten er −10, ikke null – overleveringen er synlig", Number(rest.rest), -10);

console.log(tilstand.feil === 0 ? `\nAlt i orden. Ingen av hullene er åpne.\n` : `\n${tilstand.feil} feil.\n`);
process.exit(tilstand.feil === 0 ? 0 : 1);
