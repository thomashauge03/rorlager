// Tester tilgangsmodellen og hele prosjektflyten mot ekte Postgres.
import { byggBase, som, somAnon, nekta } from "./base.mjs";

const KONTOR = { epost: "thomashauge03@gmail.com", uid: "11111111-1111-1111-1111-111111111111" };
const KARI = { epost: "kari@plassen.no", uid: "22222222-2222-2222-2222-222222222222" };
const OLA = { epost: "ola@annenplass.no", uid: "33333333-3333-3333-3333-333333333333" };
const FREMMED = { epost: "fremmed@internett.no", uid: "44444444-4444-4444-4444-444444444444" };

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

console.log("\n── Oppsett ──\n");

// Kari og Ola er byggeplassfolk, fremmed har registrert seg men ingen har sluppet ham inn.
await db.exec(`
  insert into public.system_users (email, full_name, role) values
    ('kari@plassen.no', 'Kari Nordmann', 'prosjekt'),
    ('ola@annenplass.no', 'Ola Hansen', 'prosjekt');
`);
ok("to prosjektbrukere lagt inn");

const p1 = await en(`insert into public.projects (name, client, address) values ('Storgata 4', 'Kommunen', 'Storgata 4') returning id, project_number`);
const p2 = await en(`insert into public.projects (name) values ('Havnevegen 12') returning id`);
await db.query(`insert into public.project_members (project_id, email) values ($1, 'kari@plassen.no')`, [p1.id]);
await db.query(`insert into public.project_members (project_id, email) values ($1, 'ola@annenplass.no')`, [p2.id]);
ok(`to prosjekter (nr ${p1.project_number}), Kari på det ene og Ola på det andre`);

console.log("\n── Rollene ──\n");

await som(db, KONTOR, async () => {
  sjekk("kontor: hm_er_kontor()", (await en(`select public.hm_er_kontor() as v`)).v, true);
  sjekk("kontor: hm_har_tilgang() (alias)", (await en(`select public.hm_har_tilgang() as v`)).v, true);
  sjekk("kontor: hm_rolle()", (await en(`select public.hm_rolle() as v`)).v, "super_admin");
});

await som(db, KARI, async () => {
  sjekk("prosjekt: hm_er_kontor()", (await en(`select public.hm_er_kontor() as v`)).v, false);
  sjekk("prosjekt: hm_har_tilgang() er nå òg usann", (await en(`select public.hm_har_tilgang() as v`)).v, false);
  sjekk("prosjekt: hm_rolle()", (await en(`select public.hm_rolle() as v`)).v, "prosjekt");
});

await som(db, FREMMED, async () => {
  sjekk("fremmed: hm_er_kontor()", (await en(`select public.hm_er_kontor() as v`)).v, false);
  sjekk("fremmed: hm_rolle() er null", (await en(`select public.hm_rolle() as v`)).v, null);
});

console.log("\n── Prosjektbrukeren slipper ikke inn i admindelen ──\n");

await som(db, KARI, async () => {
  sjekk("leser 0 fakturaer", (await alle(`select id from public.pipe_invoices`)).length, 0);
  sjekk("leser 0 uttaksbestillinger", (await alle(`select id from public.pipe_orders`)).length, 0);
  sjekk("leser 0 lagerlogglinjer", (await alle(`select id from public.pipe_stock_log`)).length, 0);

  const m1 = await nekta(() => db.query(`select public.pipe_adjust_stock((select id from public.pipe_types limit 1), 5)`));
  m1 && /Ingen tilgang/.test(m1) ? ok("pipe_adjust_stock nekter") : nei("pipe_adjust_stock", m1 ?? "gikk gjennom!");

  const m2 = await nekta(() => db.query(`select public.pipe_apply_markup(90)`));
  m2 && /Ingen tilgang/.test(m2) ? ok("pipe_apply_markup nekter") : nei("pipe_apply_markup", m2 ?? "gikk gjennom!");

  const m3 = await nekta(() => db.query(`select public.pipe_delete_order(gen_random_uuid())`));
  m3 && /Ingen tilgang/.test(m3) ? ok("pipe_delete_order nekter") : nei("pipe_delete_order", m3 ?? "gikk gjennom!");

  const m4 = await nekta(() => db.query(`select public.pipe_import_costs('[{"sku":"x","cost_price":1}]'::jsonb, 25)`));
  m4 && /Ingen tilgang/.test(m4) ? ok("pipe_import_costs nekter") : nei("pipe_import_costs", m4 ?? "gikk gjennom!");

  sjekk("pipe_missing_cost_count gir null", (await en(`select public.pipe_missing_cost_count() as v`)).v, null);
});

console.log("\n── Kontoret ser fortsatt alt som før ──\n");

await som(db, KONTOR, async () => {
  const n = (await alle(`select id from public.pipe_types`)).length;
  n > 0 ? ok(`leser katalogen (${n} rader)`) : nei("katalogen", "0 rader");
  const c = await en(`select public.pipe_missing_cost_count() as v`);
  typeof c.v === "number" ? ok(`pipe_missing_cost_count svarer (${c.v})`) : nei("pipe_missing_cost_count", c.v);
  sjekk("ser begge prosjektene", (await alle(`select id from public.projects`)).length, 2);
});

console.log("\n── Prosjektskillet ──\n");

await som(db, KARI, async () => {
  const mine = await alle(`select name from public.projects`);
  sjekk("Kari ser bare sitt eget prosjekt", mine.map((r) => r.name), ["Storgata 4"]);
});

await som(db, OLA, async () => {
  const mine = await alle(`select name from public.projects`);
  sjekk("Ola ser bare sitt eget", mine.map((r) => r.name), ["Havnevegen 12"]);
});

await som(db, FREMMED, async () => {
  sjekk("fremmed ser ingen prosjekter", (await alle(`select id from public.projects`)).length, 0);
});

await somAnon(db, async () => {
  const m = await nekta(() => db.query(`select id from public.projects`));
  m ? ok("anon kommer ikke til prosjekttabellen") : nei("anon", "fikk lese projects!");
  const r = await nekta(() => db.query(`select id from public.project_orders`));
  r ? ok("anon kommer ikke til bestillingene") : nei("anon", "fikk lese project_orders!");
});

console.log("\n── Flyten: behov → bestilt → to puljer ──\n");

let ordreId, l1, l2;

await som(db, KARI, async () => {
  // pipe_catalog og ikkje pipe_types: ein prosjektbrukar får null rader frå
  // tabellen, og les katalogen gjennom visninga – akkurat som appen gjer.
  const t = await en(`select id, name, dimension, unit from public.pipe_catalog limit 1`);

  // Gjennom RPC-en, ikkje med direkte insert. Plassen har ikkje skriverett på
  // project_orders – det er heile poenget med at innmeldinga er ein
  // SECURITY DEFINER-funksjon.
  const o = await en(
    `select (public.project_submit_request($1, 'Kari Nordmann', $2::jsonb, current_date + 7, 'Trengs til grøfta')).id as id`,
    [
      p1.id,
      JSON.stringify([
        { pipe_type_id: t.id, name: t.name, dimension: t.dimension, unit: t.unit, requested_qty: 50 },
        { name: "Kobling 110 mm, spesial", unit: "stk", requested_qty: 4, line_note: "Den grå typen" },
      ]),
    ],
  );
  ordreId = o.id;

  const linjer = await alle(
    `select id, name from public.project_order_lines where order_id = $1 order by sort_order`,
    [ordreId],
  );
  l1 = linjer[0]?.id;
  l2 = linjer[1]?.id;
  const nr = await en(`select order_number from public.project_orders where id = $1`, [ordreId]);
  linjer.length === 2
    ? ok(`Kari melder behov (bestilling ${nr.order_number}): 50 m rør + 4 koblinger som fritekst`)
    : nei("innmelding", `${linjer.length} linjer`);
});

await som(db, OLA, async () => {
  sjekk("Ola ser ikke Karis bestilling", (await alle(`select id from public.project_orders`)).length, 0);
  const m = await nekta(() =>
    db.query(`select public.project_submit_receipt($1, 'Ola', $2::jsonb, null, null, null, null, 'testkjøring')`, [
      ordreId,
      JSON.stringify([{ order_line_id: l1, received_qty: 50 }]),
    ]),
  );
  // Meldinga er med vilje den same som for ei bestilling som ikkje finst –
  // to ulike svar gjorde funksjonen til eit orakel på kva id-ar som finst.
  m && /Fant ikke bestillingen/.test(m)
    ? ok("Ola kan ikke kvittere på et fremmed prosjekt, og får ikke vite at den finnes")
    : nei("Ola kvitterte!", m ?? "gikk gjennom");
});

await som(db, KARI, async () => {
  const m = await nekta(() =>
    db.query(`select public.project_mark_ordered($1, 'Brødrene Dahl', 'BD-9911', current_date + 3, $2::jsonb)`, [
      ordreId,
      JSON.stringify([{ id: l1, ordered_qty: 40 }]),
    ]),
  );
  m && /tilgang/i.test(m) ? ok("Kari kan ikke bestille selv") : nei("Kari bestilte!", m ?? "gikk gjennom");
});

await som(db, KONTOR, async () => {
  await db.query(`select public.project_mark_ordered($1, 'Brødrene Dahl', 'BD-9911', current_date + 3, $2::jsonb)`, [
    ordreId,
    JSON.stringify([
      { id: l1, ordered_qty: 40 },
      { id: l2, ordered_qty: 4 },
    ]),
  ]);
  const o = await en(`select status, supplier, supplier_ref from public.project_orders where id = $1`, [ordreId]);
  sjekk("kontoret bestiller: status", o.status, "bestilt");
  sjekk("leverandør lagret", o.supplier_ref, "BD-9911");
  const l = await en(`select requested_qty, ordered_qty from public.project_order_lines where id = $1`, [l1]);
  sjekk("bedt om 50, bestilt 40 — begge tall står", [Number(l.requested_qty), Number(l.ordered_qty)], [50, 40]);
});

await som(db, KARI, async () => {
  // Første pulje: 25 av 40 meter, ingen koblinger
  await db.query(`select public.project_submit_receipt($1, 'Kari Nordmann', $2::jsonb, null, 'Første bil', null, null, 'testkjøring')`, [
    ordreId,
    JSON.stringify([{ order_line_id: l1, received_qty: 25 }]),
  ]);
  const o = await en(`select status from public.project_orders where id = $1`, [ordreId]);
  sjekk("etter pulje 1: status delvis", o.status, "delvis");

  const rest = await en(
    `select l.ordered_qty - coalesce(sum(rl.received_qty), 0) as rest
       from public.project_order_lines l
       left join public.project_receipt_lines rl on rl.order_line_id = l.id
      where l.id = $1 group by l.ordered_qty`,
    [l1],
  );
  sjekk("rest på rørlinja er 15", Number(rest.rest), 15);

  // Andre pulje: resten av røret, og koblingene med avvik
  await db.query(`select public.project_submit_receipt($1, 'Kari Nordmann', $2::jsonb, null, 'Andre bil', null, null, 'testkjøring')`, [
    ordreId,
    JSON.stringify([
      { order_line_id: l1, received_qty: 15 },
      { order_line_id: l2, received_qty: 4, deviation: "skadet", note: "To hadde sprekk" },
    ]),
  ]);
  const o2 = await en(`select status from public.project_orders where id = $1`, [ordreId]);
  sjekk("etter pulje 2: status mottatt", o2.status, "mottatt");

  const avvik = await alle(`select deviation, note from public.project_receipt_lines where deviation <> 'ingen'`);
  sjekk("avviket er bevart", avvik.map((a) => a.deviation), ["skadet"]);

  const m = await nekta(() =>
    db.query(`select public.project_submit_receipt($1, 'Kari', $2::jsonb, null, null, null, null, 'testkjøring')`, [
      ordreId,
      JSON.stringify([{ order_line_id: l1, received_qty: 1 }]),
    ]),
  );
  m && /ikke bestilt/.test(m) ? ok("kan ikke kvittere på en ferdig mottatt bestilling") : nei("dobbeltkvittering", m ?? "gikk gjennom");
});

console.log("\n── Kantene ──\n");

await som(db, KONTOR, async () => {
  const o = await en(`insert into public.project_orders (project_id, status) values ($1, 'meldt') returning id`, [p1.id]);
  const l = await en(
    `insert into public.project_order_lines (order_id, name, unit, requested_qty) values ($1, 'Testrør', 'm', 10) returning id`,
    [o.id],
  );

  const tom = await nekta(() => db.query(`select public.project_mark_ordered($1, null, null, null, '[]'::jsonb)`, [o.id]));
  tom && /Ingen linjer er bestilt/.test(tom) ? ok("bestilling uten bestilte linjer avvises") : nei("tom bestilling", tom ?? "gikk gjennom");

  await db.query(`select public.project_mark_ordered($1, 'Dahl', null, null, $2::jsonb)`, [
    o.id,
    JSON.stringify([{ id: l.id, ordered_qty: 10 }]),
  ]);

  // For mye levert skal aldri se rent ut
  await db.query(`select public.project_submit_receipt($1, 'Kontoret', $2::jsonb, null, null, null, null, 'testkjøring')`, [
    o.id,
    JSON.stringify([{ order_line_id: l.id, received_qty: 12 }]),
  ]);
  const d = await en(
    `select deviation from public.project_receipt_lines where order_line_id = $1`,
    [l.id],
  );
  sjekk("12 mottatt av 10 bestilt gir avvik for_mye", d.deviation, "for_mye");
  const st = await en(`select status from public.project_orders where id = $1`, [o.id]);
  sjekk("overlevering teller som mottatt", st.status, "mottatt");
});

await som(db, KONTOR, async () => {
  const o = await en(`insert into public.project_orders (project_id, status) values ($1, 'meldt') returning id`, [p1.id]);
  const lA = await en(`insert into public.project_order_lines (order_id, name, requested_qty) values ($1, 'A', 5) returning id`, [o.id]);
  await db.query(`insert into public.project_order_lines (order_id, name, requested_qty) values ($1, 'B', 5)`, [o.id]);
  // Kontoret stryker linje B ved å la ordered_qty stå på 0
  await db.query(`select public.project_mark_ordered($1, null, null, null, $2::jsonb)`, [
    o.id,
    JSON.stringify([{ id: lA.id, ordered_qty: 5 }]),
  ]);
  await db.query(`select public.project_submit_receipt($1, 'Kontoret', $2::jsonb, null, null, null, null, 'testkjøring')`, [
    o.id,
    JSON.stringify([{ order_line_id: lA.id, received_qty: 5 }]),
  ]);
  const st = await en(`select status from public.project_orders where id = $1`, [o.id]);
  sjekk("en strøket linje holder ikke bestillingen åpen", st.status, "mottatt");
});

// Kan en prosjektbruker endre lista etter at kontoret har bestilt?
await som(db, KARI, async () => {
  const m = await nekta(() =>
    db.query(`update public.project_order_lines set requested_qty = 999 where id = $1`, [l1]),
  );
  const l = await en(`select requested_qty from public.project_order_lines where id = $1`, [l1]);
  Number(l.requested_qty) === 50
    ? ok("Kari kan ikke endre linja etter at den er bestilt")
    : nei("linja ble endret", `requested_qty = ${l.requested_qty}`);
});

console.log(feil === 0 ? `\nAlt i orden. Tilgangsmodellen og flyten holder.\n` : `\n${feil} feil.\n`);
process.exit(feil === 0 ? 0 : 1);
