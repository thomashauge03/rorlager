// Tester strekkoden frå produsenten (20261014200000_ean.sql).

import { byggBase, somAnon, nekta, lagFasit } from "./base.mjs";

const { tilstand, ok, nei, sjekk } = lagFasit();
const db = await byggBase();
const en = async (sql, p) => (await db.query(sql, p)).rows[0];

const kat = await en(`insert into public.pipe_categories (name) values ('Testgruppe') returning id`);
await db.query(
  `insert into public.pipe_types (category_id, name, unit, price, stock, active, qr_slug, ean) values
     ($1, 'PVC', 'm', 100, 10, true, 'pvc-110', '7044610012345'),
     ($1, 'Gamal', 'm', 100, 10, false, 'gamal', '7044610099999')`,
  [kat.id],
);

await somAnon(db, async () => {
  sjekk("kunden finn vara på strekkoden", (await en(`select public.pipe_finn_ean(' 7044610012345 ') as v`)).v, "pvc-110");
  sjekk("ei avslått vare blir ikkje funnen", (await en(`select public.pipe_finn_ean('7044610099999') as v`)).v, null);
  sjekk("ein ukjend kode gir null", (await en(`select public.pipe_finn_ean('123') as v`)).v, null);
});

const m1 = await nekta(() => db.query(`update public.pipe_types set ean = 'abc' where qr_slug = 'pvc-110'`));
m1 && /pipe_types_ean_check/.test(m1) ? ok("berre siffer er lov") : nei("format", m1 ?? "GIKK GJENNOM");
const m2 = await nekta(() => db.query(`update public.pipe_types set ean = '7044610012345' where qr_slug = 'gamal'`));
m2 && /duplicate key/.test(m2) ? ok("same strekkode på to varer er ikkje lov") : nei("unik", m2 ?? "GIKK GJENNOM");

console.log(tilstand.feil === 0 ? `\nAlt i orden. Strekkoden virker.\n` : `\n${tilstand.feil} feil.\n`);
process.exit(tilstand.feil === 0 ? 0 : 1);
