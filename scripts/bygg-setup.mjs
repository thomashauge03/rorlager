// Byggjer supabase-setup.sql frå migrasjonane. Køyr med: npm run bygg:setup
//
// HISTORIKKEN BAK DETTE SKRIPTET
//
// supabase-setup.sql og supabase-oppdatering.sql var handhaldne kopiar av
// skjemaet. Dei blei sist oppdaterte før tilgangsmodellen og prisimport-vakta
// kom, og innehaldt difor framleis `for all to authenticated using (true)` og
// `if auth.uid() is null` som einaste vakt – medan README bad operatøren lime
// heile fila inn i SQL Editor.
//
// Å køyre den fila ville rulla tilbake begge sikringane utan eit einaste
// varselord. Ei generert fil som driv frå kjelda er verre enn inga fil.
//
// Difor: samlefila blir bygd frå migrasjonane, i same rekkjefølgje som dei
// køyrer. Ho kan ikkje lenger seie noko anna enn dei gjer.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const rot = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const migMappe = join(rot, "supabase", "migrations");
const ut = join(rot, "supabase-setup.sql");

const filer = readdirSync(migMappe)
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (filer.length === 0) {
  console.error("Fant ingen migrasjoner i supabase/migrations/");
  process.exit(1);
}

const strek = "-- " + "═".repeat(70);

const deler = filer.map((f) => {
  const sql = readFileSync(join(migMappe, f), "utf8").trimEnd();
  return `${strek}\n-- ${f}\n${strek}\n\n${sql}\n`;
});

const topp = `-- Hele skjemaet til rørlageret, i den rekkefølgen migrasjonene kjører.
--
-- GENERERT AV scripts/bygg-setup.mjs. Ikke rediger denne filen for hånd –
-- endringen ville forsvunnet ved neste generering, og verre: filen ville igjen
-- kunne si noe annet enn migrasjonene. Legg endringer i en ny migrasjon under
-- supabase/migrations/ og kjør «npm run bygg:setup».
--
-- Filen kan kjøres flere ganger på samme prosjekt uten at noe går tapt: ingen
-- feil, og ingen data borte. Det er ikke en antakelse — scripts/db-test/
-- omkoyring.test.mjs kjører nettopp denne filen to ganger mot en ekte Postgres
-- med lagerbeholdning, justert påslag, egne varer og importerte innkjøpspriser
-- i basen, og sjekker at alt står igjen etterpå.
--
-- Den testen finnes fordi det en gang IKKE var sant: seedingen av katalogen
-- slettet pipe_types, og siden hver fremmednøkkel dit er «on delete set null»,
-- gikk det gjennom uten en eneste feilmelding.
--
-- Bygget fra ${filer.length} migrasjoner:
${filer.map((f) => `--   ${f}`).join("\n")}

`;

writeFileSync(ut, topp + "\n" + deler.join("\n"), "utf8");

console.log(`\nsupabase-setup.sql bygd fra ${filer.length} migrasjoner.\n`);
for (const f of filer) console.log(`  ${f}`);
console.log();
