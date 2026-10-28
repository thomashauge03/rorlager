// Tester Tripletex-køen (20261028100000_tripletex.sql): bryteren, at berre nye
// grunnlag kjem i køen, at ei rad ikkje kan takast to gonger, ja-lista, vegen ut
// av «ukjent», vedlegget, angring med overlapp, og kven som får sjå og endre kva.

import { byggBase, som, somAnon, nekta, lagFasit } from "./base.mjs";

const SUPER = { epost: "thomashauge03@gmail.com", uid: "11111111-1111-1111-1111-111111111111" };
const KARI = { epost: "kari@hauge.no", uid: "22222222-2222-2222-2222-222222222222" };
const PER = { epost: "per@hauge.no", uid: "33333333-3333-3333-3333-333333333333" };

const { tilstand, ok, nei, sjekk } = lagFasit();
const db = await byggBase();
const en = async (sql, p) => (await db.query(sql, p)).rows[0];
const tal = (v) => (v === null || v === undefined ? v : Number(v));

const avvist = async (tittel, fn, mønster) => {
  const m = await nekta(fn);
  m && mønster.test(m) ? ok(tittel) : nei(tittel, m ?? "GIKK GJENNOM");
};

await db.exec(`
  insert into public.system_users (email, full_name, role) values
    ('kari@hauge.no', 'Kari Kontor', 'kontor'),
    ('per@hauge.no', 'Per Prosjekt', 'prosjekt');
`);

/** Edge-funksjonen: service_role, utan innlogga brukar */
const somTeneste = async (fn) => {
  await db.query(`select set_config('request.jwt.claims', '', false)`);
  await db.exec("set role service_role");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
};

/** Eit godkjent uttak med éi prisa linje, klart til fakturering */
const nyttUttak = async (namn, sum, orgnr = null) => {
  const o = await en(
    `insert into public.pipe_orders (customer_name, customer_email, stock_drawn_at, org_number)
     values ($1, 'x@kunde.no', now(), $2) returning id`,
    [namn, orgnr],
  );
  await db.query(
    `insert into public.pipe_order_lines (order_id, name, unit, quantity, unit_price, line_total, sort_order)
     values ($1, 'PVC 110', 'm', 1, $2, $2, 1)`,
    [o.id, sum],
  );
  await db.query(`update public.pipe_orders set total = $2 where id = $1`, [o.id, sum]);
  return o.id;
};

const nyttGrunnlag = (namn, ider) =>
  som(db, KARI, async () =>
    (await en(`select (public.pipe_create_invoice($1, current_date, current_date, $2::uuid[], 0)).id as id`, [namn, ider])).id,
  );

const ko = (invoiceId) => en(`select * from public.pipe_tripletex_ko where invoice_id = $1`, [invoiceId]);
const ta = (invoiceId, ekstra = {}) =>
  somTeneste(async () =>
    (
      await en(`select public.pipe_tripletex_ta($1, $2, $3, $4) as v`, [
        invoiceId,
        ekstra.intern ?? false,
        ekstra.nokkel ?? null,
        ekstra.overlappOk ?? false,
      ])
    ).v,
  );
const utfall = (koId, status, ordreId = null, feil = null) =>
  somTeneste(async () => (await en(`select public.pipe_tripletex_utfall($1, $2, $3, $4) as v`, [koId, status, ordreId, feil])).v);

console.log("\n── Bryteren ──\n");

const gammalt = await nyttGrunnlag("Før bryteren", [await nyttUttak("Før bryteren", 100)]);
sjekk("eit grunnlag mens bryteren er av, kjem ikkje i køen", await ko(gammalt), undefined);

const kariSet = await som(db, KARI, async () =>
  (await db.query(`update public.pipe_tripletex_innstilling set fra_dato = current_date where id returning id`)).rows.length,
);
sjekk("kontoret kan ikkje slå på bryteren", kariSet, 0);
const kariSer = await som(db, KARI, async () => (await db.query(`select fra_dato from public.pipe_tripletex_innstilling`)).rows.length);
sjekk("kontoret ser innstillingane", kariSer, 1);
sjekk("prosjektbrukaren ser dei ikkje", await som(db, PER, async () => (await db.query(`select * from public.pipe_tripletex_innstilling`)).rows.length), 0);
await avvist("anon ser dei ikkje", () => somAnon(db, () => db.query(`select * from public.pipe_tripletex_innstilling`)), /permission denied/);

await som(db, SUPER, () => db.query(`update public.pipe_tripletex_innstilling set fra_dato = current_date, produkt_nr = '5000' where id`));
const s = await en(`select fra_dato is not null as paa, endret_av from public.pipe_tripletex_innstilling`);
sjekk("superadmin slår han på, og det står kven", [s.paa, s.endret_av], [true, SUPER.epost]);

sjekk("eit gammalt grunnlag blir ikkje teke, sjølv om bryteren no er på", (await ta(gammalt)).grunn, "ikke i koen");

await som(db, SUPER, () => db.query(`update public.pipe_tripletex_innstilling set fra_dato = current_date + 1 where id`));
const iMorgon = await nyttGrunnlag("Framtid", [await nyttUttak("Framtid", 100)]);
sjekk("eit grunnlag før fra_dato kjem ikkje i køen", await ko(iMorgon), undefined);
await som(db, SUPER, () => db.query(`update public.pipe_tripletex_innstilling set fra_dato = current_date where id`));

console.log("\n── Køen ──\n");

const u1 = await nyttUttak("Bygg AS", 1234.5, "987 654 321");
const g1 = await nyttGrunnlag("Bygg AS", [u1]);
const r1 = await ko(g1);
sjekk("nytt grunnlag står som venter", r1?.status, "venter");

await avvist("kontoret kan ikkje skrive i køen", () => som(db, KARI, () => db.query(`update public.pipe_tripletex_ko set status = 'sendt'`)), /permission denied/);
await avvist("kontoret kan ikkje kalle ta", () => som(db, KARI, () => db.query(`select public.pipe_tripletex_ta($1)`, [g1])), /permission denied/);
sjekk("kontoret ser køen", await som(db, KARI, async () => (await db.query(`select id from public.pipe_tripletex_ko`)).rows.length), 1);
sjekk("prosjektbrukaren ser ikkje køen", await som(db, PER, async () => (await db.query(`select id from public.pipe_tripletex_ko`)).rows.length), 0);

const t1 = await ta(g1, { nokkel: "bygg as" });
sjekk(
  "ta gir grunnlaget, org.nr. utan mellomrom og produktet",
  [t1.ko_id, tal(t1.total), t1.orgnr, t1.produkt_nr, t1.kundenr, t1.forfall_dagar],
  [r1.id, 1234.5, ["987654321"], "5000", null, 14],
);
sjekk("rada står som under_sending", (await ko(g1)).status, "under_sending");
sjekk("eit kall til får opptatt", (await ta(g1)).grunn, "opptatt");

await avvist("sendt krev ordre-id", () => utfall(t1.ko_id, "sendt"), /ordre-id/);
sjekk("sendt med ordre-id blir skrive", await utfall(t1.ko_id, "sendt", 555), true);
sjekk("utfallet kan ikkje skrivast to gonger", await utfall(t1.ko_id, "feilet", null, "x"), false);
const etter = await ko(g1);
sjekk("ordre-id-en står", [etter.status, tal(etter.tripletex_ordre_id)], ["sendt", 555]);
sjekk("eit sendt grunnlag blir aldri sendt igjen", await ta(g1), { grunn: "alt sendt", ordre_id: 555 });

console.log("\n── Kunde, intern og ja-lista ──\n");

const g2 = await nyttGrunnlag("Jobb Eikås", [await nyttUttak("Jobb Eikås", 200)]);
sjekk("intern utan felleskonto blir ikkje teke", (await ta(g2, { intern: true })).grunn, "ikke satt opp");
await som(db, SUPER, () => db.query(`update public.pipe_tripletex_innstilling set felleskunde_nr = 30001 where id`));
const t2 = await ta(g2, { intern: true });
sjekk("intern går på felleskontoen", [t2.intern, t2.kundenr], [true, 30001]);
await utfall(t2.ko_id, "mangler_kunde", null, "Fant ingen kunde");
sjekk("mangler_kunde kan sendast på nytt", (await ta(g2, { nokkel: "jobb:jobb eikås" })).ko_id, t2.ko_id);
await somTeneste(() => db.query(`select public.pipe_tripletex_hugs_kunde('jobb:jobb eikås', 10042, 'kari@hauge.no')`));
await utfall(t2.ko_id, "feilet", null, "HTTP 422: avvist");
const t2b = await ta(g2, { nokkel: "jobb:jobb eikås" });
sjekk("feilet kan sendast på nytt, og koplinga blir lesen", [t2b.kundenr, t2b.intern], [10042, false]);
await avvist("eit ukjent utfall blir avvist", () => utfall(t2b.ko_id, "vet ikke"), /Ukjent utfall/);
await utfall(t2b.ko_id, "ukjent_utfall", null, "Fikk ikke svar");
sjekk("ukjent_utfall blir aldri sendt", (await ta(g2)).grunn, "ukjent");

console.log("\n── Vegen ut av «ukjent» ──\n");

await avvist(
  "prosjektbrukaren kan ikkje kontrollere",
  () => som(db, PER, () => db.query(`select public.pipe_tripletex_kontrollert($1, true)`, [g2])),
  /Ingen tilgang/,
);
sjekk(
  "fann ikkje ordren → venter",
  await som(db, KARI, async () => (await en(`select public.pipe_tripletex_kontrollert($1, false) as v`, [g2])).v),
  "venter",
);
const kontrollert = await ko(g2);
sjekk("kven og når står", [kontrollert.kontrollert_av, kontrollert.kontrollert_at !== null], [KARI.epost, true]);
await avvist(
  "eit grunnlag som ventar, kan ikkje kontrollerast",
  () => som(db, KARI, () => db.query(`select public.pipe_tripletex_kontrollert($1, true)`, [g2])),
  /venter ikke på kontroll/,
);

// Eit kall som døydde: under_sending i over fem minutt
const t2c = await ta(g2);
await db.query(`update public.pipe_tripletex_ko set endret = now() - interval '6 minutes' where id = $1`, [t2c.ko_id]);
sjekk("eit forlate kall blir ukjent, ikkje teke over", (await ta(g2)).grunn, "ukjent");
sjekk("og rada seier det med eit eige ord", (await ko(g2)).status, "ukjent_utfall");
sjekk(
  "fann ordren → kontrollert",
  await som(db, KARI, async () => (await en(`select public.pipe_tripletex_kontrollert($1, true) as v`, [g2])).v),
  "kontrollert",
);
sjekk("kontrollert blir aldri sendt", (await ta(g2)).grunn, "alt sendt");

console.log("\n── Vedlegget ──\n");

const vta = (id, overta = false) =>
  somTeneste(async () => (await en(`select public.pipe_tripletex_vedlegg_ta($1, $2) as v`, [id, overta])).v);
const vutfall = (koId, status, feil = null) =>
  somTeneste(async () => (await en(`select public.pipe_tripletex_vedlegg_utfall($1, $2, $3) as v`, [koId, status, feil])).v);

sjekk("kontrollert utan ordre-id får ikkje vedlegg", (await vta(g2)).grunn, "ingen ordre");
const v1 = await vta(g1);
sjekk("ordren med id får vedlegget teke", [v1.ko_id, tal(v1.ordre_id), v1.arva], [r1.id, 555, false]);
sjekk("eit kall til får opptatt", (await vta(g1)).grunn, "opptatt");
await vutfall(v1.ko_id, "ukjent", "Fikk ikke svar");
sjekk("ukjent blir ikkje lagt ved utan overta", (await vta(g1)).grunn, "ukjent");
const v1b = await vta(g1, true);
sjekk("med overta: teke, og arva", v1b.arva, true);
sjekk("lagt ved", await vutfall(v1b.ko_id, "lagt_ved"), true);
const vr = await ko(g1);
sjekk("merknaden om to står att", [vr.vedlegg_status, /to ganger/.test(vr.vedlegg_feil ?? "")], ["lagt_ved", true]);
sjekk("lagt_ved blir aldri send igjen", (await vta(g1, true)).grunn, "alt lagt ved");

console.log("\n── Angre grunnlaget ──\n");

const g3 = await nyttGrunnlag("Rør Per", [await nyttUttak("Rør Per", 50)]);
await som(db, KARI, () => db.query(`select public.pipe_delete_invoice($1)`, [g3]));
const sletta = await en(`select status, invoice_id from public.pipe_tripletex_ko where grunnlag_nr = (select max(grunnlag_nr) from public.pipe_tripletex_ko)`);
sjekk("eit grunnlag utan ordre blir sletta_grunnlag", [sletta.status, sletta.invoice_id], ["sletta_grunnlag", null]);

await som(db, KARI, () => db.query(`select public.pipe_delete_invoice($1)`, [g1]));
const spor = await en(`select status, tripletex_ordre_id, bestilling_ider from public.pipe_tripletex_ko where id = $1`, [r1.id]);
sjekk("rada med ordre står att, med bestillingane", [spor.status, tal(spor.tripletex_ordre_id), spor.bestilling_ider], ["sendt", 555, [u1]]);

const g4 = await nyttGrunnlag("Bygg AS", [u1]);
sjekk("eit nytt grunnlag av same uttak blir stoppa", await ta(g4), { grunn: "overlapp", grunnlag: [tal(r1.grunnlag_nr)] });
sjekk("med stadfesting går det", typeof (await ta(g4, { overlappOk: true })).ko_id, "string");

console.log("\n── Koplingane ──\n");

sjekk("kontoret ser koplingane", await som(db, KARI, async () => (await db.query(`select * from public.pipe_tripletex_kunde`)).rows.length), 1);
await avvist(
  "kontoret kan ikkje leggje inn ei kopling direkte",
  () => som(db, KARI, () => db.query(`insert into public.pipe_tripletex_kunde (kunde_nokkel, kundenr) values ('x', 1)`)),
  /permission denied/,
);
await som(db, KARI, () => db.query(`delete from public.pipe_tripletex_kunde where kunde_nokkel = 'jobb:jobb eikås'`));
sjekk("men kan fjerne ei", tal((await en(`select count(*) as n from public.pipe_tripletex_kunde`)).n), 0);

await avvist("TRUNCATE på køen blir nekta", () => som(db, KARI, () => db.exec(`truncate public.pipe_tripletex_ko`)), /permission denied/);

console.log(tilstand.feil === 0 ? `\nAlt i orden. Tripletex-køen held.\n` : `\n${tilstand.feil} feil.\n`);
process.exit(tilstand.feil === 0 ? 0 : 1);
