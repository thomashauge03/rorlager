// Tester merket som tvingar ein ny brukar til å velje sitt eige passord.
//
// Serverfunksjonen opprett-bruker set merket med service_role, som her er
// testbasen sin eigar. Det som må halde, er at den tilsette berre kan sjå og
// fjerne sitt eige merke – og at ein anonym ikkje kan nokon av delane.

import { byggBase, som, somAnon, nekta, lagFasit } from "./base.mjs";

const KONTOR = { epost: "thomashauge03@gmail.com", uid: "11111111-1111-1111-1111-111111111111" };
const LEIF = { epost: "lager@hauge.no", uid: "55555555-5555-5555-5555-555555555555" };
const KARI = { epost: "kari@plassen.no", uid: "22222222-2222-2222-2222-222222222222" };
const FREMMED = { epost: "fremmed@internett.no", uid: "44444444-4444-4444-4444-444444444444" };

const { tilstand, ok, nei, sjekk } = lagFasit();
const db = await byggBase();
const en = async (sql, p) => (await db.query(sql, p)).rows[0];

const avvist = async (tittel, sql, mønster) => {
  const m = await nekta(() => db.query(sql));
  m && mønster.test(m) ? ok(tittel) : nei(tittel, m ?? "GIKK GJENNOM");
};

console.log("\n── Oppsett ──\n");

// Slik serverfunksjonen gjer det: rada først, merket etterpå.
await db.exec(`
  insert into public.system_users (email, full_name, role) values
    ('lager@hauge.no', 'Leif Lager', 'lager'),
    ('kari@plassen.no', 'Kari Nordmann', 'prosjekt');
  update public.system_users set ma_bytte_passord = true where email in ('lager@hauge.no', 'kari@plassen.no');
`);
ok("Leif og Kari har fått mellombels passord");

const merket = async (epost) =>
  (await en(`select ma_bytte_passord as v from public.system_users where email = $1`, [epost])).v;

sjekk("ein ny rad utan merke får false", (await en(`select column_default as v from information_schema.columns where table_name = 'system_users' and column_name = 'ma_bytte_passord'`)).v, "false");

console.log("\n── Kven må byte ──\n");

await som(db, LEIF, async () => {
  sjekk("Leif: må byte", (await en(`select public.hm_ma_bytte_passord() as v`)).v, true);
});
await som(db, KARI, async () => {
  sjekk("Kari (prosjekt): må byte", (await en(`select public.hm_ma_bytte_passord() as v`)).v, true);
});
await som(db, KONTOR, async () => {
  sjekk("superadmin utan merke: må ikkje", (await en(`select public.hm_ma_bytte_passord() as v`)).v, false);
});
await som(db, FREMMED, async () => {
  sjekk("fremmed utan rad: må ikkje", (await en(`select public.hm_ma_bytte_passord() as v`)).v, false);
});

console.log("\n── Leif byter ──\n");

await som(db, LEIF, async () => {
  await db.query(`select public.hm_passord_byttet()`);
  sjekk("Leif: må ikkje lenger", (await en(`select public.hm_ma_bytte_passord() as v`)).v, false);
});
sjekk("merket til Leif er borte i tabellen", await merket("lager@hauge.no"), false);
sjekk("merket til Kari står", await merket("kari@plassen.no"), true);

await som(db, LEIF, async () => {
  await db.query(`select public.hm_passord_byttet()`);
  ok("eit kall til gjer ingenting galt");
});

await som(db, FREMMED, async () => {
  await db.query(`select public.hm_passord_byttet()`);
});
sjekk("ein fremmed rører ingen andre", await merket("kari@plassen.no"), true);

console.log("\n── Store bokstavar i innlogginga ──\n");

await som(db, { ...KARI, epost: "Kari@Plassen.no" }, async () => {
  sjekk("Kari med store bokstavar: må byte", (await en(`select public.hm_ma_bytte_passord() as v`)).v, true);
  await db.query(`select public.hm_passord_byttet()`);
});
sjekk("Kari sitt merke er borte", await merket("kari@plassen.no"), false);

console.log("\n── Kven kan ikkje ──\n");

await somAnon(db, () => avvist("anon: hm_ma_bytte_passord — ingen kjørerett", `select public.hm_ma_bytte_passord()`, /permission denied/i));
await somAnon(db, () => avvist("anon: hm_passord_byttet — ingen kjørerett", `select public.hm_passord_byttet()`, /permission denied/i));

// RLS gir ikkje feil her, berre null rader: Leif ser ikkje registeret i det heile.
await som(db, LEIF, async () => {
  const r = await db.query(`update public.system_users set ma_bytte_passord = true where email = 'kari@plassen.no'`);
  sjekk("Leif treffer null rader når han prøver å merke Kari", r.affectedRows ?? 0, 0);
});
sjekk("merket til Kari er framleis borte", await merket("kari@plassen.no"), false);

console.log(
  tilstand.feil === 0
    ? `\nAlt i orden. Merket følgjer brukaren, og berre han.\n`
    : `\n${tilstand.feil} feil.\n`,
);
process.exit(tilstand.feil === 0 ? 0 : 1);
