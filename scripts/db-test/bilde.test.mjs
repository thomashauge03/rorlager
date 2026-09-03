// Bildedokumentasjonen på mottakskontrollen.
//
// Bildet er det som avgjør en reklamasjon mot leverandøren, og kravet ligger
// derfor i databasen og ikke bare i grensesnittet — en klient kan alltid la
// være å sende feltet.
//
// Bildene kan vise folk på en byggeplass. Da er de personopplysninger, og
// tilgangen må følge prosjektet hele veien ned til Storage.

import { byggBase, som, somAnon, nekta, lagFasit } from "./base.mjs";

const KONTOR = { epost: "thomashauge03@gmail.com" };
const KARI = { epost: "kari@plassen.no" };
const OLA = { epost: "ola@annenplass.no" };

const { tilstand, ok, nei, sjekk } = lagFasit();
const db = await byggBase();
const en = async (sql, p) => (await db.query(sql, p)).rows[0];

await db.exec(`
  insert into public.system_users (email, role) values
    ('kari@plassen.no', 'prosjekt'),
    ('ola@annenplass.no', 'prosjekt');
`);

const pA = await en(`insert into public.projects (name) values ('Storgata 4') returning id`);
const pB = await en(`insert into public.projects (name) values ('Havnevegen 12') returning id`);
await db.query(`insert into public.project_members (project_id, email) values ($1, 'kari@plassen.no')`, [pA.id]);
await db.query(`insert into public.project_members (project_id, email) values ($1, 'ola@annenplass.no')`, [pB.id]);

/** Lager en bestilling som er klar til å kvitteres for. */
async function klarBestilling(projectId, navn) {
  const o = await en(`insert into public.project_orders (project_id, status) values ($1, 'meldt') returning id`, [
    projectId,
  ]);
  const l = await en(
    `insert into public.project_order_lines (order_id, name, requested_qty) values ($1, $2, 5) returning id`,
    [o.id, navn],
  );
  await db.query(`select public.project_mark_ordered($1, 'Dahl', null, null, $2::jsonb)`, [
    o.id,
    JSON.stringify([{ id: l.id, ordered_qty: 5 }]),
  ]);
  return { orderId: o.id, linjer: JSON.stringify([{ order_line_id: l.id, received_qty: 5 }]) };
}

console.log("\n── Bilde er påkrevd ──\n");

await som(db, KONTOR, async () => {
  const { orderId, linjer } = await klarBestilling(pA.id, "Uten bilde");

  const utan = await nekta(() =>
    db.query(`select public.project_submit_receipt($1, 'Kontoret', $2::jsonb)`, [orderId, linjer]),
  );
  utan && /minst ett bilde/.test(utan)
    ? ok("mottak uten bilde og uten grunn blir avvist")
    : nei("bildekravet", utan ?? "GIKK GJENNOM");
});

console.log("\n── Nødutgangen ──\n");
// Dekningen på en byggeplass er som den er. Et krav som ikke kan omgås blir
// omgått på verre måter: da kvitterer ingen, eller de kvitterer for tidlig fra
// et sted med dekning.

await som(db, KONTOR, async () => {
  const { orderId, linjer } = await klarBestilling(pA.id, "Med grunn");

  const feil = await nekta(() =>
    db.query(`select public.project_submit_receipt($1, 'Kontoret', $2::jsonb, null, null, null, null, $3)`, [
      orderId,
      linjer,
      "ingen dekning på plassen",
    ]),
  );
  feil ? nei("nødutgangen", feil) : ok("med en skreven grunn går det gjennom");

  const rad = await en(`select no_photo_reason from public.project_receipts where order_id = $1`, [orderId]);
  sjekk("grunnen blir lagret så kontoret ser den", rad.no_photo_reason, "ingen dekning på plassen");
});

console.log("\n── Bildet må høre til prosjektet ──\n");
// Stien starter med prosjekt-id. Uten denne sjekken kunne en klient knyttet et
// bilde fra et annet prosjekt til sitt eget mottak — og dermed lest det.

await som(db, KONTOR, async () => {
  const { orderId, linjer } = await klarBestilling(pA.id, "Fremmed sti");

  const framand = await nekta(() =>
    db.query(`select public.project_submit_receipt($1, 'Kontoret', $2::jsonb, null, null, null, array[$3])`, [
      orderId,
      linjer,
      `${pB.id}/abc/1.jpg`,
    ]),
  );
  framand && /hører ikke til dette prosjektet/.test(framand)
    ? ok("bilde fra et annet prosjekt blir avvist")
    : nei("fremmed bildesti", framand ?? "GIKK GJENNOM");
});

console.log("\n── Bildet må faktisk finnes ──\n");
// Kravet talte tidligere bare elementer i et array, og løkka sjekket bare
// teksten. En klient som ville slippe unna bildekravet trengte ikke laste opp
// noe — det holdt å dikte opp en sti.

await som(db, KONTOR, async () => {
  const { orderId, linjer } = await klarBestilling(pA.id, "Oppdiktet sti");
  const m = await nekta(() =>
    db.query(`select public.project_submit_receipt($1, 'Kontoret', $2::jsonb, null, null, null, array[$3])`, [
      orderId,
      linjer,
      `${pA.id}/tull/finnesikke.jpg`,
    ]),
  );
  m && /Fant ikke bildet/.test(m)
    ? ok("en oppdiktet bildesti blir avvist")
    : nei("oppdiktet sti", m ?? "GIKK GJENNOM");
});

await som(db, KONTOR, async () => {
  const { orderId, linjer } = await klarBestilling(pA.id, "Egen sti");
  const sti = `${pA.id}/abc/1.jpg`;

  // Slik Storage ville lagt den inn ved en ekte opplasting
  await db.query(`insert into storage.objects (bucket_id, name) values ('mottak-bilder', $1)`, [sti]);

  await db.query(`select public.project_submit_receipt($1, 'Kontoret', $2::jsonb, null, null, null, array[$3])`, [
    orderId,
    linjer,
    sti,
  ]);
  const n = await en(
    `select count(*)::int c
       from public.project_receipt_photos ph
       join public.project_receipts r on r.id = ph.receipt_id
      where r.order_id = $1`,
    [orderId],
  );
  sjekk("bildet blir knyttet til mottaket", n.c, 1);
});

console.log("\n── Idempotensnøkkelen røper ikke andres kvittering ──\n");
/*
 * Oppslaget på client_ref sto FØR medlemssjekken, og returnerte hele
 * kvitteringsraden — navn, signatur, notat — til enhver innlogget som kjente
 * nøkkelen, uansett prosjekt.
 *
 * Praktisk vanskelig: nøkkelen er en tilfeldig uuid som aldri forlater
 * nettleseren til den som lagde den. Men rekkefølgen var feil av tilfeldige
 * grunner, og da blir den riktig av tilfeldige grunner neste gang.
 */
{
  const nøkkel = "abcdabcd-1111-2222-3333-444444444444";
  // klarBestilling kaller project_mark_ordered, som krever kontor — den må
  // derfor kjøre inne i en økt, ikke som eier uten JWT.
  let orderId, linjer;
  await som(db, KONTOR, async () => {
    ({ orderId, linjer } = await klarBestilling(pA.id, "Nøkkeltest"));
    await db.query(
      `select public.project_submit_receipt($1, 'Kontoret', $2::jsonb, null, 'hemmeleg notat', $3, null, 'testkjøring')`,
      [orderId, linjer, nøkkel],
    );
  });

  // Ola er på et annet prosjekt og skal ikke se noe, uansett hva han kjenner
  await som(db, OLA, async () => {
    const m = await nekta(() =>
      db.query(`select public.project_submit_receipt($1, 'Ola', $2::jsonb, null, null, $3, null, 'x')`, [
        orderId,
        linjer,
        nøkkel,
      ]),
    );
    m && /tilgang/i.test(m)
      ? ok("fremmed med riktig nøkkel blir avvist på tilgang, ikke besvart med kvitteringen")
      : nei("nøkkellekkasje", m ?? "FIKK KVITTERINGEN");
  });
}

console.log("\n── Bøtta og tilgangen til filene ──\n");

{
  const b = await en(`select public, file_size_limit from storage.buckets where id = 'mottak-bilder'`);
  b ? ok("bøtta finnes") : nei("bøtta", "mangler");
  sjekk("den er IKKE offentlig", b?.public, false);
  b?.file_size_limit ? ok(`størrelsesgrense satt (${Math.round(b.file_size_limit / 1048576)} MB)`) : nei("grense", "ingen");
}

// Tømmer først: testene over har lagt inn filer, og denne bolken teller.
// Faste tall mot en bøtte andre tester skriver i, er en test som går i stykker
// av at noen legger til en test lenger oppe.
await db.query(`delete from public.project_receipt_photos`);
await db.query(`delete from storage.objects where bucket_id = 'mottak-bilder'`);

// Filer lagt inn direkte, slik Storage ville gjort det
await db.query(
  `insert into storage.objects (bucket_id, name) values ('mottak-bilder', $1), ('mottak-bilder', $2)`,
  [`${pA.id}/abc/1.jpg`, `${pB.id}/def/1.jpg`],
);

await som(db, KARI, async () => {
  const mine = (await db.query(`select name from storage.objects where bucket_id = 'mottak-bilder'`)).rows;
  sjekk("Kari ser bare bildene fra sitt eget prosjekt", mine.length, 1);
  mine[0]?.name?.startsWith(pA.id) ? ok("og det er riktig prosjekt") : nei("feil bilde", mine[0]?.name);

  const m = await nekta(() =>
    db.query(`insert into storage.objects (bucket_id, name) values ('mottak-bilder', $1)`, [`${pB.id}/juks/1.jpg`]),
  );
  m ? ok("kan ikke laste opp til et annet prosjekt") : nei("opplasting", "GIKK GJENNOM");

  // Sitt eige, IKKJE kvitterte bilete skal han få fjerne. Tidlegare var
  // slettinga kontorets aleine, og då forsvann miniatyren frå skjermen medan
  // fila blei liggjande i bøtta — brukaren trudde biletet var borte.
  await nekta(() => db.query(`delete from storage.objects where bucket_id = 'mottak-bilder'`));
});

/*
 * Tala må hentast UTANFOR Kari si økt.
 *
 * Inne i henne filtrerer RLS bort fila frå det andre prosjektet, så to filer
 * ville sett ut som éi — og testen ville målt si eiga skjerming i staden for
 * slettinga.
 */
{
  const att = (await db.query(`select name from storage.objects where bucket_id = 'mottak-bilder'`)).rows;
  sjekk("Kari fjernet sitt eget ukvitterte bilde", att.length, 1);
  att[0]?.name?.startsWith(pB.id) ? ok("og Olas fil står urørt") : nei("feil fil igjen", att[0]?.name);
}

console.log("\n── Men dokumentasjon kan ikke fjernes ──\n");
// Det er hele grunnen til at bildet er der. I det mottaket er registrert, er
// bildet kontorets — plassen skal ikke kunne rydde vekk et bevis i ettertid.

{
  const sti = `${pA.id}/kvittert/1.jpg`;
  await db.query(`insert into storage.objects (bucket_id, name) values ('mottak-bilder', $1)`, [sti]);

  let mottakId;
  await som(db, KONTOR, async () => {
    const { orderId, linjer } = await klarBestilling(pA.id, "Kvittert bilde");
    const r = await en(
      `select (public.project_submit_receipt($1, 'Kontoret', $2::jsonb, null, null, null, array[$3])).id as id`,
      [orderId, linjer, sti],
    );
    mottakId = r.id;
  });
  mottakId ? ok("mottak med bilde er registrert") : nei("oppsett", "fikk ikke laget mottaket");

  await som(db, KARI, async () => {
    await nekta(() => db.query(`delete from storage.objects where name = $1`, [sti]));
  });

  const finst = (await db.query(`select id from storage.objects where name = $1`, [sti])).rows.length;
  sjekk("bildet som er kvittert for står urørt", finst, 1);
}

await som(db, OLA, async () => {
  const mine = (await db.query(`select name from storage.objects where bucket_id = 'mottak-bilder'`)).rows;
  sjekk("Ola ser bare sitt", mine.length, 1);
  mine[0]?.name?.startsWith(pB.id) ? ok("og det er hans prosjekt") : nei("feil bilde", mine[0]?.name);
});

await somAnon(db, async () => {
  const m = await nekta(() => db.query(`select name from storage.objects where bucket_id = 'mottak-bilder'`));
  const rader = m ? 0 : (await db.query(`select name from storage.objects where bucket_id = 'mottak-bilder'`)).rows.length;
  m || rader === 0 ? ok("anonyme ser ingen bilder") : nei("anon", `${rader} bilder`);
});

console.log(tilstand.feil === 0 ? `\nAlt i orden. Bildekravet holder, og bildene er skjermet.\n` : `\n${tilstand.feil} feil.\n`);
process.exit(tilstand.feil === 0 ? 0 : 1);
