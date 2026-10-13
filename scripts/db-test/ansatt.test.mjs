// Tester rolla «ansatt» og prosjektlista i kassen.
//
// Ein vanleg tilsett skal kunne ta ut rør på eit prosjekt han vel frå ei liste,
// men ikkje sjå noko av kontoret: ikkje prosjekttabellen, ikkje bestillingane,
// ikkje innkjøpsprisane. Og teksten på uttaket skal kome frå prosjektet, ikkje
// frå det klienten sende.

import { byggBase, som, somAnon, nekta, lagFasit } from "./base.mjs";

const KONTOR = { epost: "thomashauge03@gmail.com", uid: "11111111-1111-1111-1111-111111111111" };
const OLA = { epost: "ola@hauge.no", uid: "66666666-6666-6666-6666-666666666666" };
const FREMMED = { epost: "fremmed@internett.no", uid: "44444444-4444-4444-4444-444444444444" };

const { tilstand, ok, nei, sjekk } = lagFasit();
const db = await byggBase();
const en = async (sql, p) => (await db.query(sql, p)).rows[0];
const alle = async (sql, p) => (await db.query(sql, p)).rows;

const avvist = async (tittel, sql, params, mønster) => {
  const m = await nekta(() => db.query(sql, params));
  m && mønster.test(m) ? ok(tittel) : nei(tittel, m ?? "GIKK GJENNOM");
};

console.log("\n── Oppsett ──\n");

await db.exec(`insert into public.system_users (email, full_name, role) values ('ola@hauge.no', 'Ola Ansatt', 'ansatt')`);
const kat = await en(`insert into public.pipe_categories (name) values ('Testgruppe') returning id`);
const rør = await en(
  `insert into public.pipe_types (category_id, name, dimension, unit, price, cost_price, stock, active, qr_slug)
   values ($1, 'PVC-rør', '110 mm', 'm', 100, 60, 50, true, 'pvc-110') returning id`,
  [kat.id],
);
const aktiv = await en(`insert into public.projects (name, client, address, note) values ('Storgata 4', 'Kommunen', 'Storgata 4, Bergen', 'Hemmelig notat') returning id, project_number`);
const ferdig = await en(`insert into public.projects (name, status) values ('Gamlevegen 1', 'avsluttet') returning id`);
ok(`Ola er ansatt, ett aktivt prosjekt (nr ${aktiv.project_number}) og ett avsluttet`);

const linjer = JSON.stringify([{ pipe_type_id: rør.id, quantity: 3 }]);

console.log("\n── Ola er ikkje kontor ──\n");

await som(db, OLA, async () => {
  sjekk("hm_rolle() er 'ansatt'", (await en(`select public.hm_rolle() as v`)).v, "ansatt");
  sjekk("hm_er_kontor() er usann", (await en(`select public.hm_er_kontor() as v`)).v, false);
  sjekk("ser 0 prosjekt i tabellen", (await alle(`select id from public.projects`)).length, 0);
  sjekk("ser 0 uttak", (await alle(`select id from public.pipe_orders`)).length, 0);
  sjekk("ser 0 rader i pipe_types (innkjøpsprisen)", (await alle(`select id from public.pipe_types`)).length, 0);
  await avvist("pipe_adjust_stock nektar", `select public.pipe_adjust_stock($1, 5)`, [rør.id], /Ingen tilgang/);
});

console.log("\n── Prosjektlista ──\n");

await som(db, OLA, async () => {
  const liste = await alle(`select * from public.pipe_prosjektliste()`);
  sjekk("Ola ser berre det aktive", liste.map((p) => p.name), ["Storgata 4"]);
  sjekk("lista har berre id, nummer og namn", Object.keys(liste[0]).sort(), ["id", "name", "project_number"]);
});

await som(db, FREMMED, async () => {
  sjekk("ein fremmed utan rad får tom liste", (await alle(`select * from public.pipe_prosjektliste()`)).length, 0);
});

await somAnon(db, () =>
  avvist("anon: pipe_prosjektliste — ingen kjørerett", `select * from public.pipe_prosjektliste()`, [], /permission denied/i),
);

console.log("\n── Uttak på prosjektet ──\n");

await som(db, OLA, async () => {
  const svar = (
    await en(`select public.pipe_submit_order('Lureri', $1::jsonb, p_project => 'Feil namn', p_project_id => $2) as v`, [
      linjer,
      aktiv.id,
    ])
  ).v;
  sjekk("teksten kjem frå prosjektet, ikkje frå klienten", svar.project, `${aktiv.project_number} · Storgata 4`);
  sjekk("namnet kjem frå innlogginga", svar.customer_name, "Ola Ansatt");
});

const uttak = await en(`select project, project_id, created_by from public.pipe_orders order by created_at desc limit 1`);
sjekk("project_id står på uttaket", uttak.project_id, aktiv.id);
sjekk("created_by er Ola", uttak.created_by, OLA.uid);
sjekk("lageret er trekt", Number((await en(`select stock from public.pipe_types where id = $1`, [rør.id])).stock), 47);

await som(db, OLA, async () => {
  await avvist(
    "eit avslutta prosjekt blir avvist",
    `select public.pipe_submit_order('x', $1::jsonb, p_project_id => $2)`,
    [linjer, ferdig.id],
    /finnes ikke eller er avsluttet/,
  );
  await avvist(
    "eit ukjent prosjekt blir avvist",
    `select public.pipe_submit_order('x', $1::jsonb, p_project_id => gen_random_uuid())`,
    [linjer],
    /finnes ikke eller er avsluttet/,
  );
  await avvist(
    "utan prosjekt og utan tekst blir avvist",
    `select public.pipe_submit_order('x', $1::jsonb)`,
    [linjer],
    /Velg hvilket prosjekt/,
  );

  const annet = (
    await en(`select public.pipe_submit_order('x', $1::jsonb, p_project => 'Verkstedet') as v`, [linjer])
  ).v;
  sjekk("«Annet – skriv selv» går gjennom med teksten", annet.project, "Verkstedet");
});

sjekk(
  "fritekst-uttaket har ingen project_id",
  (await en(`select project_id from public.pipe_orders where project = 'Verkstedet'`)).project_id,
  null,
);

console.log("\n── Kunden ──\n");

await somAnon(db, async () => {
  const svar = (
    await en(
      `select public.pipe_submit_order('Kari Kunde', $1::jsonb, null, 'kari@kunde.no', null, 'Hytta', p_project_id => $2) as v`,
      [linjer, aktiv.id],
    )
  ).v;
  sjekk("ein kunde som sender ein prosjekt-id, får ikkje prosjektnamnet", svar.project, "Hytta");
});
sjekk(
  "og uttaket hans har ingen project_id",
  (await en(`select project_id from public.pipe_orders where customer_name = 'Kari Kunde'`)).project_id,
  null,
);

await somAnon(db, async () => {
  const svar = (
    await en(`select public.pipe_submit_order('Gammal Klient', $1::jsonb, null, 'g@kunde.no') as v`, [linjer])
  ).v;
  sjekk("ein klient som ikkje kjenner p_project_id, treffer framleis", svar.customer_name, "Gammal Klient");
});

console.log("\n── Éin funksjon, ikkje to ──\n");

sjekk(
  "pipe_submit_order finst i berre éin variant",
  Number((await en(`select count(*) as n from pg_proc where proname = 'pipe_submit_order'`)).n),
  1,
);

await som(db, KONTOR, async () => {
  sjekk("kontoret ser uttaka med prosjekt", (await alle(`select id from public.pipe_orders where project_id is not null`)).length, 1);
});

console.log(
  tilstand.feil === 0
    ? `\nAlt i orden. Ansatt tar ut på prosjektet, og ser ikke mer enn han skal.\n`
    : `\n${tilstand.feil} feil.\n`,
);
process.exit(tilstand.feil === 0 ? 0 : 1);
