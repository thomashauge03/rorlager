// Tester den gamle kjeda: kunden som tek rør ut av lageret sjølv.
//
// KVIFOR DENNE FILA FINST
//
// Prosjektkjeda – melde behov, bestille, kvittere, ta bilete – har fått tett
// dekning i tilgang.test.mjs, sikkerhet.test.mjs og bilde.test.mjs.
// Sjølvbeteninga har ikkje hatt ei einaste linje: QR-koden på hylla,
// handlekurva, uttaket og fakturagrunnlaget som følgjer av det. Det er den
// kjeda appen faktisk lever av.
//
// Ho går gjennom sju SECURITY DEFINER-funksjonar som alle omgår RLS, og vakta
// under dei er skriven om to gonger – 20260812090000 (auth.uid() → rad i
// system_users) og 20260903090000 (rad i system_users → rolle ulik 'prosjekt').
// Femten kallstader skifta meining utan at ein einaste kropp blei rørt. Det er
// ein fin måte å gjere det på, og ein farleg ein å ikkje teste.
//
// Testane her seier kva koden GJER, ikkje kva han burde gjere. Der oppførselen
// ser gal ut, står det eit funn-notat over sjekken i staden for ein feil.

import { byggBase, som, somAnon, nekta, lagFasit } from "./base.mjs";

const KONTOR = { epost: "thomashauge03@gmail.com", uid: "11111111-1111-1111-1111-111111111111" };
const LEIF = { epost: "lager@hauge.no", uid: "55555555-5555-5555-5555-555555555555" };
const KARI = { epost: "kari@plassen.no", uid: "22222222-2222-2222-2222-222222222222" };
const FREMMED = { epost: "fremmed@internett.no", uid: "44444444-4444-4444-4444-444444444444" };

const { tilstand, ok, nei, sjekk } = lagFasit();
const db = await byggBase();
const en = async (sql, p) => (await db.query(sql, p)).rows[0];
const alle = async (sql, p) => (await db.query(sql, p)).rows;
const tal = (v) => (v === null || v === undefined ? v : Number(v));

/** Sjekkar at eit kall feilar, og at det feilar med den grunnen vi ventar. */
const avvist = async (tittel, sql, params, mønster) => {
  const m = await nekta(() => db.query(sql, params));
  m && mønster.test(m) ? ok(tittel) : nei(tittel, m ?? "GIKK GJENNOM");
};

console.log("\n── Oppsett ──\n");

// Leif er lagermann og hører til kontoret uten å være super admin: rolla hans
// er berre «ulik prosjekt». Kari er byggeplass. Den fremmede har logga inn,
// men ingen har lagt han inn i system_users.
await db.exec(`
  insert into public.system_users (email, full_name, role) values
    ('lager@hauge.no', 'Leif Lager', 'lager'),
    ('kari@plassen.no', 'Kari Nordmann', 'prosjekt');
`);

const kat = await en(`insert into public.pipe_categories (name) values ('Testgruppe') returning id`);
const nyType = async (namn, dim, sku, slug, eining, pris, kost, lager, aktiv = true) =>
  (
    await en(
      `insert into public.pipe_types
         (category_id, name, dimension, sku, qr_slug, unit, price, cost_price, stock, active)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
      [kat.id, namn, dim, sku, slug, eining, pris, kost, lager, aktiv],
    )
  ).id;

const ROR = await nyType("Testrør 110", "110 mm", "T-110", "test-110", "m", 100, 66.7, 40);
const KOBLING = await nyType("Testkobling", null, "T-KOB", "test-kob", "stk", 25, 10, 6);
const UTAN_KOST = await nyType("Testrør uten innkjøpspris", null, "T-NOK", "test-nok", "m", 50, null, 5);
const UTGATT = await nyType("Utgått rør", null, "T-UT", "test-ut", "m", 10, 5, 3, false);
ok("fire testvarer i en egen varegruppe");

// ════════════════════════════════════════════════════════════════════════════
console.log("\n── Kundeflyten: anonym legger inn et uttak ──\n");
// Kunden er anonym med vilje. Han skal kunne skanne QR-koden, sjå katalogen og
// sende inn – utan konto, utan innlogging. Alt anna i basen er stengt for han.

let ordreId, ordreNr;

await somAnon(db, async () => {
  const vare = await en(`select id, name, price, stock from public.pipe_catalog where qr_slug = 'test-110'`);
  sjekk("anon finner varen gjennom QR-koden", [vare?.name, tal(vare?.stock)], ["Testrør 110", 40]);

  // Nyttelasten er PYNTA: klienten sender namn, varenummer og pris som er
  // frie oppspinn. Funksjonen les berre pipe_type_id og quantity – resten
  // hentar han frå basen. Det er heile grunnen til at innsendinga er ein
  // funksjon og ikkje eit INSERT.
  const svar = await en(
    `select public.pipe_submit_order(
       'Ola Kunde', $1::jsonb, '99887766', 'ola@kunde.no', 'Ola AS', 'Storgata 4', 'Henta kl 9', null
     ) as r`,
    [
      JSON.stringify([
        {
          pipe_type_id: ROR,
          quantity: 12.5,
          unit_price: 1,
          price: 1,
          line_total: 12.5,
          name: "Gratis rør",
          sku: "JUKS",
          dimension: "0 mm",
        },
        { pipe_type_id: KOBLING, quantity: 4 },
      ]),
    ],
  );

  const r = svar.r;
  ordreId = r?.id;
  ordreNr = Number(r?.order_number);

  ordreNr > 0 ? ok(`bestillingen gikk gjennom og fikk ordrenummer ${ordreNr}`) : nei("ordrenummer", JSON.stringify(r));
  sjekk("summen er regnet av basens priser: 12,5 × 100 + 4 × 25", tal(r?.total), 1350);
  sjekk("kvitteringen viser basens pris, ikke klientens 1 kr", tal(r?.lines?.[0]?.unit_price), 100);
  sjekk("og basens navn, ikke «Gratis rør»", r?.lines?.[0]?.name, "Testrør 110");
  sjekk("og basens varenummer, ikke «JUKS»", r?.lines?.[0]?.sku, "T-110");
  sjekk("og basens dimensjon, ikke «0 mm»", r?.lines?.[0]?.dimension, "110 mm");
  sjekk("linjesummen er regnet på nytt", tal(r?.lines?.[0]?.line_total), 1250);
});

const linjer = await alle(
  `select name, sku, dimension, unit, quantity, unit_price, line_total
     from public.pipe_order_lines where order_id = $1 order by sort_order`,
  [ordreId],
);
sjekk("to linjer ble lagret", linjer.length, 2);
sjekk("linja i basen har prisen fra katalogen", [linjer[0]?.name, tal(linjer[0]?.unit_price), tal(linjer[0]?.line_total)], [
  "Testrør 110",
  100,
  1250,
]);
sjekk("eininga følgde med fra varen", [linjer[0]?.unit, linjer[1]?.unit], ["m", "stk"]);

const ordre = await en(`select customer_name, company, project, status, total, signature from public.pipe_orders where id = $1`, [
  ordreId,
]);
sjekk("bestillingen står som ny", ordre.status, "ny");
sjekk("summen ble skrevet tilbake på bestillingen", tal(ordre.total), 1350);
sjekk("kundeopplysningene er der", [ordre.customer_name, ordre.company, ordre.project], ["Ola Kunde", "Ola AS", "Storgata 4"]);

sjekk("beholdningen på røret gikk ned 12,5", tal((await en(`select stock from public.pipe_types where id = $1`, [ROR])).stock), 27.5);
sjekk("og på koblingen ned 4", tal((await en(`select stock from public.pipe_types where id = $1`, [KOBLING])).stock), 2);

// ════════════════════════════════════════════════════════════════════════════
console.log("\n── Lagerloggen ──\n");
// Loggen er det einaste sporet av kvifor beholdninga ser ut som ho gjer.
// Utan riktig balance_after kan ingen finne att kva lageret sto i då.

const logg = await alle(
  `select pipe_type_id, pipe_name, change, balance_after, reason, order_id, note, created_by
     from public.pipe_stock_log where order_id = $1 order by pipe_name`,
  [ordreId],
);
sjekk("to logglinjer, én per vare", logg.length, 2);
sjekk("grunnen er 'bestilling'", [...new Set(logg.map((l) => l.reason))], ["bestilling"]);
sjekk("endringen er negativ og lik mengden", [tal(logg[1]?.change), tal(logg[0]?.change)], [-12.5, -4]);
sjekk("balance_after er beholdningen etter uttaket", [tal(logg[1]?.balance_after), tal(logg[0]?.balance_after)], [27.5, 2]);
sjekk("notatet peker på ordrenummeret", logg[0]?.note, `Bestilling #${ordreNr}`);
sjekk("varenavnet er kopiert inn, så loggen overlever at varen slettes", logg[1]?.pipe_name, "Testrør 110");
// Kunden er anonym, så det finnes ingen auth.uid() å skrive. Feltet står tomt,
// og det er riktig: signaturen på bestillingen er dokumentasjonen, ikke denne.
sjekk("created_by er tom på et anonymt uttak", logg[0]?.created_by, null);

// ════════════════════════════════════════════════════════════════════════════
console.log("\n── Det funksjonen ikke godtar ──\n");
// Grensesnittet stoppar det meste av dette, men grensesnittet er ikkje
// grensa. Kven som helst kan kalle RPC-en direkte med anon-nøkkelen.

await somAnon(db, async () => {
  const kall = `select public.pipe_submit_order($1, $2::jsonb)`;
  const linje = JSON.stringify([{ pipe_type_id: ROR, quantity: 1 }]);

  await avvist("tomt kundenavn avvises", kall, ["", linje], /Navn må fylles ut/);
  await avvist("bare mellomrom teller som tomt", kall, ["   ", linje], /Navn må fylles ut/);
  await avvist("navn = null avvises", kall, [null, linje], /Navn må fylles ut/);

  await avvist("tom linjeliste avvises", kall, ["Ola", "[]"], /Handlekurven er tom/);
  await avvist("linjer = null avvises", kall, ["Ola", null], /Handlekurven er tom/);
  await avvist("et objekt i stedet for en liste avvises", kall, ["Ola", '{"pipe_type_id":"x"}'], /Handlekurven er tom/);

  const hundreOgEin = JSON.stringify(Array.from({ length: 101 }, () => ({ pipe_type_id: ROR, quantity: 1 })));
  await avvist("over 100 varelinjer avvises", kall, ["Ola", hundreOgEin], /For mange varelinjer/);

  await avvist(
    "ukjent rørtype avvises",
    kall,
    ["Ola", JSON.stringify([{ pipe_type_id: "99999999-9999-9999-9999-999999999999", quantity: 1 }])],
    /Ukjent rørtype/,
  );
  // Prosjektkjeda tillet fritekstlinjer («Kobling 110 mm, spesial»). Den her
  // gjer det ikkje: uttaket må peike på ei vare, elles går det ikkje an å
  // trekke lageret ned.
  await avvist(
    "en linje uten pipe_type_id avvises – uttaket må peke på en vare",
    kall,
    ["Ola", JSON.stringify([{ name: "Noe jeg fant", quantity: 1 }])],
    /Ukjent rørtype/,
  );

  await avvist("mengde 0 avvises", kall, ["Ola", JSON.stringify([{ pipe_type_id: ROR, quantity: 0 }])], /Ugyldig mengde/);
  await avvist("negativ mengde avvises", kall, ["Ola", JSON.stringify([{ pipe_type_id: ROR, quantity: -5 }])], /Ugyldig mengde/);
  await avvist("manglende mengde avvises", kall, ["Ola", JSON.stringify([{ pipe_type_id: ROR }])], /Ugyldig mengde/);
  await avvist(
    "urimelig stor mengde avvises",
    kall,
    ["Ola", JSON.stringify([{ pipe_type_id: ROR, quantity: 100001 }])],
    /urimelig stor/,
  );
  await avvist(
    "en avslått vare kan ikke tas ut",
    kall,
    ["Ola", JSON.stringify([{ pipe_type_id: UTGATT, quantity: 1 }])],
    /ikke tilgjengelig/,
  );
});

sjekk(
  "ingen av de avviste bestillingene ligger igjen som rader",
  (await alle(`select id from public.pipe_orders`)).length,
  1,
);
sjekk(
  "og ingen av dem rørte beholdningen",
  tal((await en(`select stock from public.pipe_types where id = $1`, [ROR])).stock),
  27.5,
);

// Løpenummeret er ein bigserial, og han blir henta i det ordreraden blir sett
// inn – FØR linjene blir sjekka. Ei bestilling som blir avvist på linje 2
// brenn difor eit nummer. Skjemaet seier det rett ut: «Hol i serien er greitt
// – dette er ein uttaksseddel, ikkje eit rekneskapsbilag».
await somAnon(db, async () => {
  const nummerPaa = async (namn) =>
    Number(
      (
        await en(`select (public.pipe_submit_order($1, $2::jsonb)) ->> 'order_number' as nr`, [
          namn,
          JSON.stringify([{ pipe_type_id: KOBLING, quantity: 1 }]),
        ])
      ).nr,
    );

  const foer = await nummerPaa("Kunde før");
  await nekta(() =>
    db.query(`select public.pipe_submit_order('Avvist Kunde', $1::jsonb)`, [
      JSON.stringify([{ pipe_type_id: "99999999-9999-9999-9999-999999999999", quantity: 1 }]),
    ]),
  );
  const etter = await nummerPaa("Kunde etter");
  sjekk("en avvist bestilling brenner et ordrenummer – hull i serien er tillatt", etter - foer, 2);
});

// ════════════════════════════════════════════════════════════════════════════
console.log("\n── Beholdningen får gå i minus ──\n");
// Med vilje, og det står i skjemaet: eit negativt tal er reell informasjon om
// at nokon har teke meir enn lageret viste. Sperra ville berre gjort at
// uttaket ikkje blei registrert, og då stemmer det endå mindre.

await somAnon(db, async () => {
  await db.query(`select public.pipe_submit_order('Grådig Kunde', $1::jsonb)`, [
    JSON.stringify([{ pipe_type_id: UTAN_KOST, quantity: 8 }]),
  ]);
});
sjekk(
  "8 tatt ut av 5 på lager gir −3, ikke en feilmelding",
  tal((await en(`select stock from public.pipe_types where id = $1`, [UTAN_KOST])).stock),
  -3,
);
sjekk(
  "og loggen skriver minustallet rett ut",
  tal((await en(`select balance_after from public.pipe_stock_log where pipe_type_id = $1 order by created_at desc limit 1`, [UTAN_KOST])).balance_after),
  -3,
);

// Varen mangler innkjøpspris, men har salgspris. Uttaket regnes som vanlig:
// det er cost_price prisberegningen trenger, ikke uttaket.
sjekk(
  "en vare uten innkjøpspris kan tas ut som alle andre: 8 × 50",
  tal((await en(`select total from public.pipe_orders where customer_name = 'Grådig Kunde'`)).total),
  400,
);

// FUNN: pipe_settings.require_phone og require_signature står som krav i
// innstillingene, men INGEN av dem blir håndhevet i basen. Kravet lever bare i
// skjemaet i nettleseren, og RPC-en er åpen for anon.
await somAnon(db, async () => {
  const s = await en(`select require_phone, require_signature from public.pipe_public_settings`);
  sjekk("innstillingene sier at telefon kreves", s.require_phone, true);
  const r = await en(`select (public.pipe_submit_order('Uten Telefon', $1::jsonb)) ->> 'order_number' as nr`, [
    JSON.stringify([{ pipe_type_id: KOBLING, quantity: 1 }]),
  ]);
  r?.nr ? ok("men basen tar imot en bestilling uten telefon likevel (funn)") : nei("uten telefon", "ble avvist");
});

console.log("\n── Og kunden kommer ikke tilbake til det han sendte ──\n");
// Kvitteringa kjem tilbake som svar frå funksjonen. Det er den einaste vegen:
// anon har ingen rettigheiter på ordretabellane i det heile.

await somAnon(db, async () => {
  for (const [sql, kva] of [
    [`select customer_name from public.pipe_orders`, "pipe_orders"],
    [`select name from public.pipe_order_lines`, "pipe_order_lines"],
    [`select change from public.pipe_stock_log`, "pipe_stock_log"],
    [`select customer_name from public.pipe_invoices`, "pipe_invoices"],
  ]) {
    const m = await nekta(() => db.query(sql));
    m ? ok(`anon: ${kva} er stengt`) : nei(kva, "ANON FIKK LESE");
  }
});

// ════════════════════════════════════════════════════════════════════════════
console.log("\n── pipe_delete_order: rørene tilbake på lageret ──\n");

const foerSletting = tal((await en(`select stock from public.pipe_types where id = $1`, [ROR])).stock);
const foerSlettingKob = tal((await en(`select stock from public.pipe_types where id = $1`, [KOBLING])).stock);

await som(db, KARI, async () => {
  await avvist("prosjektbrukeren får ikke slette", `select public.pipe_delete_order($1)`, [ordreId], /Ingen tilgang/);
});
await somAnon(db, async () => {
  await avvist("anon får ikke slette", `select public.pipe_delete_order($1)`, [ordreId], /permission denied/i);
});
sjekk("bestillingen står fortsatt", (await alle(`select id from public.pipe_orders where id = $1`, [ordreId])).length, 1);

await som(db, KONTOR, async () => {
  await avvist("en ukjent bestilling gir beskjed", `select public.pipe_delete_order($1)`, [
    "88888888-8888-8888-8888-888888888888",
  ], /Fant ikke bestillingen/);

  await db.query(`select public.pipe_delete_order($1)`, [ordreId]);
});

sjekk("bestillingen er borte", (await alle(`select id from public.pipe_orders where id = $1`, [ordreId])).length, 0);
sjekk(
  "linjene fulgte med (on delete cascade)",
  (await alle(`select id from public.pipe_order_lines where order_id = $1`, [ordreId])).length,
  0,
);
sjekk(
  "de 12,5 meterne er tilbake på lageret",
  tal((await en(`select stock from public.pipe_types where id = $1`, [ROR])).stock),
  foerSletting + 12.5,
);
sjekk(
  "og de fire koblingene også",
  tal((await en(`select stock from public.pipe_types where id = $1`, [KOBLING])).stock),
  foerSlettingKob + 4,
);

const tilbake = await alle(
  `select pipe_name, change, balance_after, note, created_by from public.pipe_stock_log
    where reason = 'sletting' order by pipe_name`,
);
sjekk("tilbakeføringen er logget, én linje per vare", tilbake.length, 2);
sjekk("endringen er positiv", [tal(tilbake[1]?.change), tal(tilbake[0]?.change)], [12.5, 4]);
sjekk("notatet sier hvilken bestilling det var", tilbake[0]?.note, `Slettet bestilling #${ordreNr}`);
sjekk("og hvem som gjorde det", tilbake[0]?.created_by, KONTOR.uid);
// Loggen om det opprinnelige uttaket blir stående med order_id på en bestilling
// som ikke finnes lenger. Kolonnen har ingen fremmednøkkel, og det er nettopp
// derfor historikken overlever slettingen.
sjekk(
  "uttaksloggen overlever at bestillingen slettes",
  (await alle(`select id from public.pipe_stock_log where order_id = $1`, [ordreId])).length,
  2,
);

// ════════════════════════════════════════════════════════════════════════════
console.log("\n── pipe_adjust_stock og pipe_set_stock ──\n");

await som(db, KONTOR, async () => {
  const foer = tal((await en(`select stock from public.pipe_types where id = $1`, [KOBLING])).stock);
  const ny = tal((await en(`select public.pipe_adjust_stock($1, 10, 'innkjøp', 'Ny pall') as v`, [KOBLING])).v);
  sjekk("kontoret fyller på 10 og får ny beholdning tilbake", ny, foer + 10);

  const l = await en(
    `select change, balance_after, reason, note, created_by, order_id from public.pipe_stock_log
      where pipe_type_id = $1 order by created_at desc limit 1`,
    [KOBLING],
  );
  sjekk("loggen fikk grunnen som ble oppgitt", l.reason, "innkjøp");
  sjekk("med notat, endring og ny balanse", [l.note, tal(l.change), tal(l.balance_after)], ["Ny pall", 10, ny]);
  sjekk("og hvem som gjorde det", l.created_by, KONTOR.uid);
  sjekk("en justering er ikke knyttet til noen bestilling", l.order_id, null);

  await avvist("endring på 0 avvises", `select public.pipe_adjust_stock($1, 0)`, [KOBLING], /forskjellig fra null/);
  await avvist("endring = null avvises", `select public.pipe_adjust_stock($1, null)`, [KOBLING], /forskjellig fra null/);
  await avvist(
    "ukjent rørtype avvises",
    `select public.pipe_adjust_stock('77777777-7777-7777-7777-777777777777', 5)`,
    [],
    /Ukjent rørtype/,
  );

  // pipe_set_stock er opptellinga: du seier kva som står på hylla, og basen
  // reknar ut differansen og loggar den. Grunnen blir alltid 'opptelling'.
  const n = await alle(`select id from public.pipe_stock_log`);
  const sett = tal((await en(`select public.pipe_set_stock($1, 100, 'Talt 3. september') as v`, [KOBLING])).v);
  sjekk("opptelling setter beholdningen til det som ble talt", sett, 100);
  const l2 = await en(
    `select change, balance_after, reason, note from public.pipe_stock_log where pipe_type_id = $1 order by created_at desc limit 1`,
    [KOBLING],
  );
  sjekk("og loggen holder differansen, ikke det nye tallet", tal(l2.change), 100 - (foer + 10));
  sjekk("grunnen er 'opptelling' uansett hva som sendes inn", l2.reason, "opptelling");
  sjekk("notatet følger med gjennom pipe_set_stock", l2.note, "Talt 3. september");
  sjekk("én ny logglinje, ikke to", (await alle(`select id from public.pipe_stock_log`)).length, n.length + 1);

  // Ei oppteljing som stadfestar tala som alt står der, skriv ingenting.
  // Loggen viser altså ikkje AT det blei talt, berre at noko blei endra.
  const uendra = tal((await en(`select public.pipe_set_stock($1, 100, 'Talt igjen') as v`, [KOBLING])).v);
  sjekk("en opptelling som stemmer returnerer samme tall", uendra, 100);
  sjekk(
    "og skriver ingen logglinje (funn: at det ble talt er ikke dokumentert)",
    (await alle(`select id from public.pipe_stock_log`)).length,
    n.length + 1,
  );

  await avvist(
    "pipe_set_stock på ukjent rørtype avvises",
    `select public.pipe_set_stock('77777777-7777-7777-7777-777777777777', 5)`,
    [],
    /Ukjent rørtype/,
  );

  // Ingen sperre mot negativ opptelling – same haldning som i uttaket.
  const minus = tal((await en(`select public.pipe_set_stock($1, -4) as v`, [KOBLING])).v);
  sjekk("kontoret kan telle opp til et negativt tall", minus, -4);
  await db.query(`select public.pipe_set_stock($1, 20) as v`, [KOBLING]);
});

await som(db, KARI, async () => {
  await avvist("prosjektbrukeren får ikke justere lageret", `select public.pipe_adjust_stock($1, 5)`, [KOBLING], /Ingen tilgang/);
  await avvist("og ikke telle det opp", `select public.pipe_set_stock($1, 5)`, [KOBLING], /Ingen tilgang/);
  sjekk("og ser ikke loggen i det hele tatt", (await alle(`select id from public.pipe_stock_log`)).length, 0);
});
sjekk(
  "beholdningen sto uendret gjennom forsøkene",
  tal((await en(`select stock from public.pipe_types where id = $1`, [KOBLING])).stock),
  20,
);

// ════════════════════════════════════════════════════════════════════════════
console.log("\n── pipe_apply_markup: påslaget ──\n");
// Prisen blir REKNA UT OG LAGRA, ikkje utleidd ved lesing – ei ordrelinje skal
// for alltid vise prisen som gjaldt den dagen. Difor må utrekninga stemme her.

await som(db, LEIF, async () => {
  // 55 % på innkjøpsprisen, avrunda til heile kroner:
  //   66,70 × 1,55 = 103,385 → 103
  //   10,00 × 1,55 =  15,50  →  16   (Postgres runder halve tall opp)
  //    5,00 × 1,55 =   7,75  →   8
  const n = tal((await en(`select public.pipe_apply_markup(55, $1) as v`, [kat.id])).v);
  sjekk("tre av fire varer fikk ny pris – den uten innkjøpspris ble stående", n, 3);

  const p = await alle(`select sku, price from public.pipe_types where category_id = $1 order by sku`, [kat.id]);
  const som_kart = Object.fromEntries(p.map((r) => [r.sku, tal(r.price)]));
  sjekk("66,70 × 1,55 = 103,385 → 103", som_kart["T-110"], 103);
  sjekk("10 × 1,55 = 15,50 → 16", som_kart["T-KOB"], 16);
  sjekk("5 × 1,55 = 7,75 → 8", som_kart["T-UT"], 8);
  sjekk("varen uten innkjøpspris beholdt sin gamle pris", som_kart["T-NOK"], 50);

  // Avrunding til øre: same utrekning, berre finare rutenett.
  await db.query(`select public.pipe_apply_markup(55, $1, null, 0.01)`, [kat.id]);
  sjekk(
    "avrundet til øre blir det 103,39 og 15,50",
    [
      tal((await en(`select price from public.pipe_types where sku = 'T-110'`)).price),
      tal((await en(`select price from public.pipe_types where sku = 'T-KOB'`)).price),
    ],
    [103.39, 15.5],
  );

  // Avrunding til 0 ville gitt divisjon på null – funksjonen bytter den til 1.
  await db.query(`select public.pipe_apply_markup(55, $1, null, 0)`, [kat.id]);
  sjekk("p_round_to = 0 blir tolket som hele kroner, ikke en feil", tal((await en(`select price from public.pipe_types where sku = 'T-110'`)).price), 103);

  // 0 % er lov: prisen blir innkjøpsprisen, avrunda.
  await db.query(`select public.pipe_apply_markup(0, $1)`, [kat.id]);
  sjekk("0 % påslag gir innkjøpsprisen, avrundet: 66,70 → 67", tal((await en(`select price from public.pipe_types where sku = 'T-110'`)).price), 67);

  // Avgrensa til utvalde varer i staden for ei heil gruppe.
  const en_vare = tal((await en(`select public.pipe_apply_markup(100, null, array[$1::uuid]) as v`, [ROR])).v);
  sjekk("kan avgrenses til én enkelt vare", en_vare, 1);
  sjekk("66,70 × 2 = 133,40 → 133", tal((await en(`select price from public.pipe_types where sku = 'T-110'`)).price), 133);
  sjekk("nabovaren ble ikke rørt", tal((await en(`select price from public.pipe_types where sku = 'T-KOB'`)).price), 10);

  await avvist("negativt påslag avvises", `select public.pipe_apply_markup(-1)`, [], /null eller høyere/);
  await avvist("påslag = null avvises", `select public.pipe_apply_markup(null)`, [], /null eller høyere/);
  await avvist("urimelig høyt påslag avvises", `select public.pipe_apply_markup(1001)`, [], /urimelig høyt/);
});

// ════════════════════════════════════════════════════════════════════════════
console.log("\n── pipe_import_costs: prislisten fra grossisten ──\n");
// Nøkkelen er varenummeret. Namn, hylleplass og beholdning skal IKKJE rørast:
// admin kan ha retta dei for hand.

await som(db, LEIF, async () => {
  const foer = await en(`select name, location, stock from public.pipe_types where sku = 'T-110'`);
  await db.query(`update public.pipe_types set location = 'Hylle A3' where sku = 'T-110'`);

  const r = (
    await en(`select public.pipe_import_costs($1::jsonb, 25) as v`, [
      JSON.stringify([
        { sku: "T-110", cost: 80 },
        { sku: "T-KOB", cost: 0 },
        { sku: "FINNES-IKKE", cost: 5 },
        { sku: "   ", cost: 1 },
      ]),
    ])
  ).v;

  sjekk("én vare i katalogen ble oppdatert", r.updated, 1);
  sjekk("varenummeret som ikke finnes kommer tilbake som ubrukt", r.unmatched, ["FINNES-IKKE"]);
  // FUNN: 'received' er talet på linjer som SLAPP GJENNOM filteret (sku ikke
  // blank, cost > 0), ikke talet på linjer som blei sendt inn. Fire linjer inn
  // blir til to. Grensesnittet som viser «mottatt: 2» av en fil med 4 rader
  // forteller noe annet enn det ser ut som.
  sjekk("«received» teller de godtatte linjene, ikke de innsendte", r.received, 2);

  const etter = await en(`select name, location, stock, cost_price, price from public.pipe_types where sku = 'T-110'`);
  sjekk("innkjøpsprisen ble satt", tal(etter.cost_price), 80);
  sjekk("og salgsprisen regnet ut: 80 × 1,25 = 100", tal(etter.price), 100);
  sjekk("navnet ble ikke rørt", etter.name, foer.name);
  sjekk("hylleplassen ble ikke rørt", etter.location, "Hylle A3");
  sjekk("beholdningen ble ikke rørt", tal(etter.stock), tal(foer.stock));

  const kob = await en(`select cost_price from public.pipe_types where sku = 'T-KOB'`);
  sjekk("en linje med kostpris 0 blir hoppet over", tal(kob.cost_price), 10);

  // Same varenummer to gonger: den første vinn (on conflict do nothing).
  const d = (
    await en(`select public.pipe_import_costs($1::jsonb, 0) as v`, [
      JSON.stringify([
        { sku: "T-110", cost: 40 },
        { sku: "T-110", cost: 999 },
      ]),
    ])
  ).v;
  sjekk("samme varenummer to ganger teller som én", d.received, 1);
  sjekk("og det er den første raden som gjelder", tal((await en(`select cost_price from public.pipe_types where sku = 'T-110'`)).cost_price), 40);

  await avvist("tom liste avvises", `select public.pipe_import_costs('[]'::jsonb, 25)`, [], /Ingen varelinjer/);
  await avvist("liste = null avvises", `select public.pipe_import_costs(null, 25)`, [], /Ingen varelinjer/);
  await avvist("ugyldig påslag avvises", `select public.pipe_import_costs('[{"sku":"T-110","cost":1}]'::jsonb, 1001)`, [], /Ugyldig påslag/);
  await avvist("negativt påslag avvises", `select public.pipe_import_costs('[{"sku":"T-110","cost":1}]'::jsonb, -1)`, [], /Ugyldig påslag/);

  const forMange = JSON.stringify(Array.from({ length: 5001 }, (_, i) => ({ sku: `X-${i}`, cost: 1 })));
  await avvist("over 5000 linjer i én import avvises", `select public.pipe_import_costs($1::jsonb, 25)`, [forMange], /For mange varelinjer/);

  sjekk("pipe_missing_cost_count svarer kontoret med et tall", typeof tal((await en(`select public.pipe_missing_cost_count() as v`)).v), "number");
});

// ════════════════════════════════════════════════════════════════════════════
console.log("\n── Fakturagrunnlaget ──\n");

let o1, o2, faktura;

await somAnon(db, async () => {
  const lag = async (namn) =>
    (
      await en(`select (public.pipe_submit_order($1, $2::jsonb)) ->> 'id' as id`, [
        namn,
        JSON.stringify([{ pipe_type_id: ROR, quantity: 2 }]),
      ])
    ).id;
  o1 = await lag("Ola AS");
  o2 = await lag("Ola AS");
});
ok("to nye uttak fra samme kunde");

await som(db, KARI, async () => {
  await avvist(
    "prosjektbrukeren får ikke lage fakturagrunnlag",
    `select (public.pipe_create_invoice('Ola AS', current_date, current_date, array[$1::uuid], 100)).id`,
    [o1],
    /Ingen tilgang/,
  );
  await avvist("og ikke slette et heller", `select public.pipe_delete_invoice(gen_random_uuid())`, [], /Ingen tilgang/);
});
await somAnon(db, async () => {
  await avvist(
    "anon får ikke lage fakturagrunnlag",
    `select (public.pipe_create_invoice('Ola AS', current_date, current_date, array[$1::uuid], 100)).id`,
    [o1],
    /permission denied/i,
  );
  await avvist("og ikke slette et heller", `select public.pipe_delete_invoice(gen_random_uuid())`, [], /permission denied/i);
});

await som(db, KONTOR, async () => {
  await avvist(
    "uten bestillinger blir det ikke noe grunnlag",
    `select (public.pipe_create_invoice('Ola AS', current_date, current_date, array[]::uuid[], 0)).id`,
    [],
    /Ingen bestillinger valgt/,
  );
  await avvist(
    "uten datoer blir det ikke noe grunnlag",
    `select (public.pipe_create_invoice('Ola AS', null, current_date, array[$1::uuid], 0)).id`,
    [o1],
    /fra- og til-dato/,
  );

  faktura = (
    await en(
      `select (public.pipe_create_invoice('Ola AS', current_date - 30, current_date, array[$1::uuid, $2::uuid], 400, 'August')).id as id`,
      [o1, o2],
    )
  ).id;
  faktura ? ok("kontoret lager fakturagrunnlaget") : nei("fakturagrunnlag", "ingen id");

  const f = await en(`select invoice_number, customer_name, total, note from public.pipe_invoices where id = $1`, [faktura]);
  sjekk("grunnlaget fikk sitt eget løpenummer", Number(f.invoice_number) > 0, true);
  sjekk("kunde og notat er lagret", [f.customer_name, f.note], ["Ola AS", "August"]);

  const knytta = await alle(`select id, status, invoice_id from public.pipe_orders where invoice_id = $1 order by order_number`, [
    faktura,
  ]);
  sjekk("begge bestillingene ble knyttet til grunnlaget", knytta.length, 2);
  // Å fakturere og å ekspedere er to ulike ting, og angre-knappen kan ikkje
  // setje statusen tilbake – han veit ikkje kva han var. Difor rører grunnlaget
  // berre invoice_id.
  sjekk("statusen står urørt på 'ny'", [...new Set(knytta.map((r) => r.status))], ["ny"]);

  await avvist(
    "en bestilling kan ikke havne på to grunnlag",
    `select (public.pipe_create_invoice('Ola AS', current_date, current_date, array[$1::uuid], 100)).id`,
    [o1],
    /allerede fakturert/,
  );
  sjekk("og det andre grunnlaget ble ikke opprettet", (await alle(`select id from public.pipe_invoices`)).length, 1);

  /*
   * SUMMEN KOMMER FRA BASEN, IKKE FRA KLIENTEN.
   *
   * Vi sendte inn 400. Beløpet som ble lagret er summen av bestillingene
   * grunnlaget faktisk knytter til.
   *
   * Prisene på uttaket hentes fra basen nettopp for at nettleseren ikke skal
   * kunne bestemme dem — men beløpet på fakturagrunnlaget ble lagret akkurat
   * slik det kom inn, og regnet ut i en utestet useMemo som utelot linjer uten
   * pris. En katalogvare som hadde mistet prisen sin reduserte altså stille
   * det Hauge Maskin fakturerte.
   */
  const sum = tal(
    (await en(`select coalesce(sum(total), 0) as s from public.pipe_orders where invoice_id = $1`, [faktura])).s,
  );
  sjekk("summen er regnet ut i basen, ikke tatt fra klienten", tal(f.total), sum);
  sjekk("  og klientens 400 ble ignorert", tal(f.total) === 400, false);

  // Ukjente ordre-id-ar blir avviste. Eit grunnlag på bestillingar som ikkje
  // finst blei tidlegare oppretta heilt tomt, med beløpet klienten oppgav.
  await avvist(
    "et grunnlag på en bestilling som ikke finnes blir avvist",
    `select public.pipe_create_invoice('Spøkelse AS', current_date, current_date, array['66666666-6666-6666-6666-666666666666'::uuid], 9999)`,
    [],
    /Fant ikke alle bestillingene/,
  );
});

console.log("\n── Angre grunnlaget ──\n");

await som(db, LEIF, async () => {
  await db.query(`select public.pipe_delete_invoice($1)`, [faktura]);

  sjekk("grunnlaget er borte", (await alle(`select id from public.pipe_invoices where id = $1`, [faktura])).length, 0);
  const o = await alle(`select id, invoice_id, status from public.pipe_orders where id in ($1, $2)`, [o1, o2]);
  sjekk("men bestillingene står", o.length, 2);
  sjekk("koblingen er løst opp", [...new Set(o.map((r) => r.invoice_id))], [null]);
  sjekk("og statusen er fortsatt 'ny'", [...new Set(o.map((r) => r.status))], ["ny"]);

  const igjen = (
    await en(`select (public.pipe_create_invoice('Ola AS', current_date, current_date, array[$1::uuid], 266)).id as id`, [o1])
  ).id;
  igjen ? ok("og de kan faktureres på nytt") : nei("ny fakturering", "gikk ikke");
  await db.query(`select public.pipe_delete_invoice($1)`, [igjen]);

  // FUNN: pipe_delete_order raiser «Fant ikke bestillingen» på en ukjent id,
  // men pipe_delete_invoice gjør ingenting og sier ingenting. Angre-knappen kan
  // altså trykkes på et grunnlag noen andre alt har slettet, uten at det synes.
  const m = await nekta(() => db.query(`select public.pipe_delete_invoice('55555555-4444-3333-2222-111111111111')`));
  m === null ? ok("sletting av et ukjent grunnlag er en stille no-op (funn)") : nei("stille no-op", m);
});

// FUNN: sletting av et fakturert uttak trekker ikke beløpet fra grunnlaget.
// Grunnlaget blir stående med sin gamle total mens en av bestillingene bak det
// er borte. pipe_delete_order sjekker heller ikke statusen: et uttak som står
// som 'levert' kan slettes, og rørene blir ført tilbake på lageret selv om de
// fysisk har forlatt det.
await som(db, KONTOR, async () => {
  const f = (
    await en(`select (public.pipe_create_invoice('Ola AS', current_date, current_date, array[$1::uuid, $2::uuid], 0)).id as id`, [
      o1,
      o2,
    ])
  ).id;
  // Summen ved opprettelsen, regnet ut i basen
  const før = tal((await en(`select total from public.pipe_invoices where id = $1`, [f])).total);

  await db.query(`update public.pipe_orders set status = 'levert' where id = $1`, [o1]);
  await db.query(`select public.pipe_delete_order($1)`, [o1]);
  const etter = await en(
    `select i.total, (select count(*) from public.pipe_orders o where o.invoice_id = i.id) as n
       from public.pipe_invoices i where i.id = $1`,
    [f],
  );
  sjekk(
    "et levert uttak kan slettes, og grunnlaget beholder summen fra opprettelsen (funn)",
    [tal(etter.total), Number(etter.n)],
    [før, 1],
  );
});

// ════════════════════════════════════════════════════════════════════════════
console.log("\n── Rollematrisen ──\n");
// Sju SECURITY DEFINER-funksjonar omgår RLS heilt. Vakta i kroppen deira er
// difor den einaste grensa som finst. Denne bolken spør kvar av dei det same
// spørsmålet fire gonger: anon, prosjekt, fremmed, kontor.

// To ferske bestillingar: éi som skal slettast, éi som skal fakturerast. Dei
// tre som blir nekta rører ingen av dei – vakta står før alt anna i kroppen.
const enOrdre = (await en(`insert into public.pipe_orders (customer_name) values ('Matriseordre') returning id`)).id;
const faktureres = (await en(`insert into public.pipe_orders (customer_name) values ('Matrisefaktura') returning id`)).id;

const FUNKSJONAR = [
  ["pipe_adjust_stock", `select public.pipe_adjust_stock($1, 1)`, [KOBLING]],
  ["pipe_set_stock", `select public.pipe_set_stock($1, 7)`, [KOBLING]],
  ["pipe_apply_markup", `select public.pipe_apply_markup(10, null, array[$1::uuid])`, [ROR]],
  ["pipe_import_costs", `select public.pipe_import_costs('[{"sku":"T-110","cost":42}]'::jsonb, 25)`, []],
  ["pipe_delete_order", `select public.pipe_delete_order($1)`, [enOrdre]],
  [
    "pipe_create_invoice",
    `select (public.pipe_create_invoice('Matrise AS', current_date, current_date, array[$1::uuid], 1)).id`,
    [faktureres],
  ],
  ["pipe_delete_invoice", `select public.pipe_delete_invoice(gen_random_uuid())`, []],
];

// Anon har ikkje EXECUTE i det heile – funksjonen finst ikkje for han.
await somAnon(db, async () => {
  for (const [namn, sql, p] of FUNKSJONAR) {
    await avvist(`anon: ${namn} — ingen kjørerett`, sql, p, /permission denied/i);
  }
  await avvist(`anon: pipe_missing_cost_count — ingen kjørerett`, `select public.pipe_missing_cost_count()`, [], /permission denied/i);
  const m = await nekta(() => db.query(`select public.hm_er_kontor()`));
  m ? ok("anon: hm_er_kontor — ingen kjørerett") : nei("hm_er_kontor", "ANON FIKK KALLE VAKTA");
});

// Prosjektbrukaren og den fremmede har begge ein gyldig JWT. Dei blir stoppa av
// vakta i kroppen, ikkje av rettigheiter – difor ei norsk feilmelding.
for (const [kven, bruker] of [
  ["prosjekt", KARI],
  ["fremmed", FREMMED],
]) {
  await som(db, bruker, async () => {
    sjekk(`${kven}: hm_er_kontor() er usann`, (await en(`select public.hm_er_kontor() as v`)).v, false);
    for (const [namn, sql, p] of FUNKSJONAR) {
      await avvist(`${kven}: ${namn} nektes`, sql, p, /Ingen tilgang/);
    }
    // Den eine som er sql og ikkje plpgsql, og difor ikkje kan raise: han
    // svarar null i staden for eit tal.
    sjekk(`${kven}: pipe_missing_cost_count gir null`, (await en(`select public.pipe_missing_cost_count() as v`)).v, null);
  });
}

sjekk("ingen av forsøkene rørte bestillingen", (await alle(`select id from public.pipe_orders where id = $1`, [enOrdre])).length, 1);

// Og kontoret – her Leif, som er lagermann og IKKE super admin, altså den
// rolla som ville falt utanfor om vakta hadde spurt om 'admin' i staden for
// «ulik prosjekt».
await som(db, LEIF, async () => {
  sjekk("kontor: hm_er_kontor() er sann uten super admin", (await en(`select public.hm_er_kontor() as v`)).v, true);
  sjekk("kontor: hm_rolle() er 'lager'", (await en(`select public.hm_rolle() as v`)).v, "lager");
  for (const [namn, sql, p] of FUNKSJONAR) {
    const m = await nekta(() => db.query(sql, p));
    m === null ? ok(`kontor: ${namn} slipper gjennom`) : nei(`kontor: ${namn}`, m);
  }
  const c = tal((await en(`select public.pipe_missing_cost_count() as v`)).v);
  typeof c === "number" ? ok(`kontor: pipe_missing_cost_count svarer (${c})`) : nei("pipe_missing_cost_count", c);
});

sjekk("og da er matriseordren slettet", (await alle(`select id from public.pipe_orders where id = $1`, [enOrdre])).length, 0);

console.log(
  tilstand.feil === 0
    ? `\nAlt i orden. Uttakskjeden holder – og gjør akkurat det den sier.\n`
    : `\n${tilstand.feil} feil.\n`,
);
process.exit(tilstand.feil === 0 ? 0 : 1);
