// Byggjer ein kopi av rørlagerbasen i minnet og køyrer migrasjonane mot han.
//
// KVIFOR DETTE FINST
//
// Tilgangsmodellen ligg i RLS-policyar og i SECURITY DEFINER-funksjonar. Ingen
// av delane kan enhetstestast frå TypeScript – dei er databasen si åtferd, ikkje
// appen si. Fram til no kunne dei berre prøvast ved å køyre SQL-en mot det
// levande prosjektet og sjå kva som skjedde.
//
// PGlite er ekte Postgres bygd til WebAssembly, så policyar, roller og
// funksjonar oppfører seg som dei gjer i Supabase. Då kan «kan ein
// prosjektbrukar lese fakturagrunnlaget?» svarast før SQL-en er limt inn nokon
// stad.
//
// Køyr med: npm run test:db

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HER = dirname(fileURLToPath(import.meta.url));
const MIG = join(HER, "..", "..", "supabase", "migrations");

export async function byggBase({ stille = true } = {}) {
  const db = await PGlite.create();

  // ── Omgivnadene migrasjonane forventar av Supabase ──
  //
  // gen_random_uuid() ligg i kjernen frå PG13, så pgcrypto trengst ikkje.
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
  `);

  /*
   * Storage, slik Supabase set det opp.
   *
   * Mottaksbileta ligg i ei privat bøtte, og policyane på storage.objects er
   * det einaste som held eit bilete frå eitt prosjekt unna eit anna. Utan desse
   * stubbane ville migrasjonen feila her, og då ville policyane aldri blitt
   * prøvde – dei viktigaste av dei alle, sidan bileta kan vise folk.
   */
  await db.exec(`
    create schema if not exists storage;

    create table if not exists storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );

    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text references storage.buckets(id),
      name text not null,
      owner uuid,
      created_at timestamptz not null default now()
    );

    alter table storage.objects enable row level security;

    -- Same oppførsel som Supabase sin: stien delt på skråstrek, utan filnamnet
    create or replace function storage.foldername(name text)
    returns text[] language sql immutable as $$
      select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1];
    $$;

    grant usage on schema storage to anon, authenticated;
    grant select, insert, update, delete on storage.objects to anon, authenticated;
    grant select on storage.buckets to anon, authenticated;
  `);

  /*
   * Supabase deler ut rettigheiter på alle tabellar i public til anon og
   * authenticated, og set default privileges så NYE tabellar får det same.
   *
   * Utan dette ville testane feila på tabellrettigheiter i staden for på RLS –
   * altså gitt ei falsk godkjenning av policyar som aldri blei prøvde. Det er
   * òg det som gjer at `revoke ... from anon` i prosjektmigrasjonen faktisk blir
   * testa: utan revoke ville anon fått dei nye tabellane gratis her.
   */
  await db.exec(`
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on sequences to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;
  `);

  const filer = readdirSync(MIG)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const f of filer) {
    try {
      await db.exec(readFileSync(join(MIG, f), "utf8"));
      if (!stille) console.log(`  ok    ${f}`);
    } catch (e) {
      console.log(`  FEIL  ${f}\n        ${e.message}`);
      throw e;
    }
  }

  return db;
}

/**
 * Køyrer noko som ein bestemt innlogga brukar, og ryddar opp etterpå.
 *
 * set_config med is_local = false, ikkje true: vi står ikkje i ein transaksjon,
 * og `set local` ville berre gitt ei åtvaring og ingen verknad.
 */
export async function som(db, { epost, uid }, fn) {
  const claims = JSON.stringify({ email: epost, sub: uid ?? "00000000-0000-0000-0000-0000000000ff" });
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);
  await db.exec(`set role authenticated`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query(`select set_config('request.jwt.claims', '', false)`);
  }
}

/** Køyrer noko som ein anonym besøkande – kunden i lageret. */
export async function somAnon(db, fn) {
  await db.query(`select set_config('request.jwt.claims', '', false)`);
  await db.exec("set role anon");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

/** Gir feilmeldinga dersom kallet feila, elles null. Eit nei er eit svar. */
export async function nekta(fn) {
  try {
    await fn();
    return null;
  } catch (e) {
    return e.message;
  }
}

/**
 * Ein liten testsamlar, så filene under slepp kvar sin.
 *
 * Pilfunksjonar heile vegen: desse blir destrukturerte hos kallaren, og ein
 * metode som bruker `this` ville mist bindinga si i det den blei plukka ut.
 */
export function lagFasit() {
  const tilstand = { feil: 0 };
  const ok = (t) => console.log(`  ok    ${t}`);
  const nei = (t, d) => {
    console.log(`  FEIL  ${t}\n        ${d}`);
    tilstand.feil++;
  };
  const sjekk = (t, faktisk, venta) =>
    JSON.stringify(faktisk) === JSON.stringify(venta)
      ? ok(t)
      : nei(t, `venta ${JSON.stringify(venta)}, fikk ${JSON.stringify(faktisk)}`);

  return { tilstand, ok, nei, sjekk };
}
