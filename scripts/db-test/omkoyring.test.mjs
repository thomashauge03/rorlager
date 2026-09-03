// Kan supabase-setup.sql køyrast om att på ein base som er i bruk?
//
// README-en fortel operatøren at det er slik han tek inn ei ny migrasjon, så
// svaret MÅ vere ja. Det var det ikkje: seedinga av Dahl-katalogen sletta heile
// pipe_types, og fordi kvar framandnøkkel dit er «on delete set null», gjekk
// det gjennom utan éi einaste feilmelding. Lagerbehaldninga blei null, påslaget
// hoppa tilbake til 25 %, varer kontoret sjølv hadde lagt inn var borte, og
// innkjøpsprisane frå siste prisimport med dei.
//
// Testen her er heile grunnen til at feilen ikkje kan kome tilbake: dei andre
// testfilene byggjer basen ved å køyre kvar migrasjon nøyaktig ÉIN gong, så dei
// kunne aldri sett dette. Denne køyrer den genererte fila to gonger, slik
// operatøren faktisk gjer.

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HER = dirname(fileURLToPath(import.meta.url));
const SETUP = join(HER, "..", "..", "supabase-setup.sql");

let feil = 0;
const ok = (t) => console.log(`  ok    ${t}`);
const nei = (t, d) => {
  console.log(`  FEIL  ${t}\n        ${d}`);
  feil++;
};
const sjekk = (t, faktisk, venta) =>
  JSON.stringify(faktisk) === JSON.stringify(venta)
    ? ok(t)
    : nei(t, `venta ${JSON.stringify(venta)}, fikk ${JSON.stringify(faktisk)}`);

/** Omgivnadene Supabase gir, og som SQL-editoren difor har når fila blir limt inn. */
const db = await PGlite.create();
await db.exec(`
  create schema if not exists auth;
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;

  create or replace function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(auth.jwt() ->> 'sub', '')::uuid $$;

  grant usage on schema public to anon, authenticated;
  grant usage on schema auth to anon, authenticated;

  create schema if not exists storage;
  create table if not exists storage.buckets (
    id text primary key, name text not null, public boolean not null default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table if not exists storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets(id),
    name text not null, owner uuid, created_at timestamptz not null default now()
  );
  alter table storage.objects enable row level security;
  create or replace function storage.foldername(name text)
  returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1];
  $$;
  grant usage on schema storage to anon, authenticated;
  grant select, insert, update, delete on storage.objects to anon, authenticated;
  grant select on storage.buckets to anon, authenticated;

  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`);

const en = async (sql, p) => (await db.query(sql, p)).rows[0];
const setup = readFileSync(SETUP, "utf8");

const TILSTAND = `
  select (select id           from public.pipe_types where sku = '3100501') as id,
         (select stock        from public.pipe_types where sku = '3100501') as stock,
         (select location     from public.pipe_types where sku = '3100501') as hylle,
         (select cost_price   from public.pipe_types where sku = '3100502') as kost,
         (select active       from public.pipe_types where sku = '3100504') as aktiv,
         (select markup_percent from public.pipe_settings where id = 1)     as pasl,
         (select count(*)::int from public.pipe_types where sku = 'EGEN-001') as eiga,
         (select count(*)::int from public.pipe_types)                      as varer,
         (select count(*)::int from public.pipe_categories)                 as grupper`;

console.log("\n── Første kjøring: et helt nytt prosjekt ──\n");

await db.exec(setup);
const start = await en(TILSTAND);
start.varer > 100 ? ok(`katalogen er lagt inn (${start.varer} varer)`) : nei("katalogen", start.varer);

/*
 * Så tek vi basen i bruk, slik ho ser ut etter nokre veker hos kunden:
 * lageret talt opp, påslaget justert, ei eiga vare lagt inn, ein vare sperra,
 * og ein innkjøpspris oppdatert av prisimporten.
 */
console.log("\n── Basen blir tatt i bruk ──\n");

await db.exec(`
  update public.pipe_types set stock = 250, location = 'Hylle B4' where sku = '3100501';
  update public.pipe_types set cost_price = 132.44 where sku = '3100502';
  update public.pipe_types set active = false where sku = '3100504';
  update public.pipe_settings set markup_percent = 40 where id = 1;

  insert into public.pipe_categories (name, color, sort_order) values ('Egne varer', '#123456', 99);
  insert into public.pipe_types
    (category_id, name, dimension, sku, qr_slug, unit, cost_price, price, stock, low_stock_threshold, sort_order)
  values
    ((select id from public.pipe_categories where name = 'Egne varer'),
     'Spesialbend fra verkstedet', '110 mm', 'EGEN-001', 'spesialbend-verkstedet-110', 'stk', 100, 140, 7, 0, 1);
`);

const før = await en(TILSTAND);
ok(`lager 250, påslag 40 %, egen vare lagt inn, én vare sperret`);

console.log("\n── Andre kjøring: nøyaktig det README-en ber om ──\n");

await db.exec(setup);
const etter = await en(TILSTAND);

sjekk("varen beholder id-en sin", String(etter.id), String(før.id));
sjekk("lagerbeholdningen står", Number(etter.stock), Number(før.stock));
sjekk("hylleplasseringen står", etter.hylle, før.hylle);
sjekk("innkjøpsprisen fra prisimporten står", Number(etter.kost), Number(før.kost));
sjekk("sperret vare er fortsatt sperret", etter.aktiv, før.aktiv);
sjekk("påslaget kontoret satte står", Number(etter.pasl), Number(før.pasl));
sjekk("kontorets egen vare er der", etter.eiga, 1);
sjekk("ingen varer forsvant", etter.varer, før.varer);
sjekk("ingen varegrupper forsvant", etter.grupper, før.grupper);

/*
 * Og det som gjorde tapet stille: bestillingslinjer og lagerlogg peikar på
 * pipe_types med «on delete set null». Ei sletting av katalogen nullar peikaren
 * i staden for å klage, så historikken mistar koplinga si utan at noko feilar.
 */
console.log("\n── Historikken beholder koblingen til katalogen ──\n");

await db.exec(`
  insert into public.pipe_orders (customer_name, customer_phone, total, status)
    values ('Testkunde', '99887766', 100, 'ny');
  insert into public.pipe_order_lines (order_id, pipe_type_id, name, unit, quantity, unit_price, line_total)
    select o.id, t.id, t.name, t.unit, 5, t.price, 5 * t.price
      from public.pipe_orders o, public.pipe_types t
     where t.sku = '3100501'
     order by o.created_at desc limit 1;
`);

await db.exec(setup);

const kopling = await en(`select count(*)::int as n from public.pipe_order_lines where pipe_type_id is not null`);
sjekk("bestillingslinjen peker fortsatt på varen", kopling.n, 1);

const logg = await en(`select count(*)::int as n from public.pipe_stock_log where pipe_type_id is null`);
sjekk("ingen lagerlogglinjer mistet varen sin", logg.n, 0);

await db.close();

console.log(feil === 0 ? `\nAlt i orden. Fila tåler å bli kjørt om igjen.\n` : `\n${feil} feil.\n`);
process.exit(feil === 0 ? 0 : 1);
