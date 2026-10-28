// Oppdaterer Supabase frå repoet: databasen, serverfunksjonane og sjekken.
// Køyr med: npm run supabase:oppdater
//
// KVIFOR DETTE FINST
//
// Kvar endring i basen betydde å opne SQL Editor, lime inn heile
// supabase-setup.sql, opne Edge Functions, lime inn index.ts – og håpe at det
// var den nyaste fila som blei limt. Her går det same frå repoet, og
// check:db fortel etterpå om det sat.
//
// TOKENET
//
// Ligg i .env.supabase (i .gitignore), aldri i .env, som Vite les og som
// derfor er éin skrivefeil frå å hamne i nettlesaren. Eit «personal access
// token» opnar ALLE prosjekta på kontoen, ikkje berre rørlageret. Gi det ei
// utløpsdato, og trekk det tilbake når du ikkje treng det lenger.
//
// Skriptet skriv aldri ut tokenet, og sender det berre til api.supabase.com.
//
// Valfritt:
//   --berre-sql        hopp over serverfunksjonane
//   --med-epost        rull òg ut bestilling-epost (krev Resend-oppsettet)

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROT = fileURLToPath(new URL("..", import.meta.url));
const args = new Set(process.argv.slice(2));

// ── Tokenet ──

const env = {};
try {
  for (const line of readFileSync(new URL("../.env.supabase", import.meta.url), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m) env[m[1]] = m[2].trim();
  }
} catch {
  console.error("Fant ikke .env.supabase. Kopier .env.supabase.example til .env.supabase og lim inn tokenet.");
  process.exit(1);
}

const token = env.SUPABASE_ACCESS_TOKEN;
const ref = env.SUPABASE_PROJECT_REF;

if (!token || token.startsWith("lim-inn")) {
  console.error("SUPABASE_ACCESS_TOKEN mangler i .env.supabase.");
  process.exit(1);
}
if (!/^[a-z0-9]{20}$/.test(ref ?? "")) {
  console.error("SUPABASE_PROJECT_REF i .env.supabase ser ikke riktig ut (20 små bokstaver og tall).");
  process.exit(1);
}

// Same prosjekt som appen? Eit token opnar alle prosjekta, så ein feil ref
// ville køyrt SQL-en mot eit anna prosjekt utan at noko klaga.
try {
  const appEnv = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const appRef = appEnv.match(/https:\/\/([a-z0-9]{20})\.supabase\.co/)?.[1];
  if (appRef && appRef !== ref) {
    console.error(`SUPABASE_PROJECT_REF (${ref}) er ikke samme prosjekt som .env (${appRef}). Stopper.`);
    process.exit(1);
  }
} catch {
  /* utan .env er det ingenting å samanlikne med – check:db stoppar seinare */
}

const steg = (t) => console.log(`\n── ${t} ──\n`);

// ── 1. Databasen ──

steg(`Databasen (${ref})`);
const sql = readFileSync(new URL("../supabase-setup.sql", import.meta.url), "utf8");
const svar = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});
if (!svar.ok) {
  const tekst = await svar.text();
  console.error(`  FEIL  supabase-setup.sql ble ikke kjørt (${svar.status})`);
  // Feilmeldinga frå Postgres er det einaste som seier kva linje som feila
  console.error(`        ${tekst.slice(0, 1500)}`);
  if (svar.status === 401) console.error("        Tokenet er ugyldig eller utløpt. Lag et nytt under Account → Access Tokens.");
  process.exit(1);
}
console.log(`  ok    supabase-setup.sql kjørt (${Math.round(sql.length / 1024)} kB)`);

// ── 2. Serverfunksjonane ──

const deploy = (namn, ekstra = []) => {
  const r = spawnSync(
    "npx",
    ["--yes", "supabase@2", "functions", "deploy", namn, "--project-ref", ref, "--use-api", ...ekstra],
    {
      cwd: ROT,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      shell: process.platform === "win32",
      env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
    },
  );
  // Utdata utan tokenet, i tilfelle CLI-en nokon gong skulle skrive det ut
  const ut = `${r.stdout ?? ""}${r.stderr ?? ""}`.split(token).join("***");
  if (r.status === 0) {
    console.log(`  ok    ${namn} rullet ut`);
    return true;
  }
  console.error(`  FEIL  ${namn} ble ikke rullet ut\n${ut.trim().split("\n").map((l) => `        ${l}`).join("\n")}`);
  return false;
};

let funksjonarOk = true;
if (!args.has("--berre-sql")) {
  steg("Serverfunksjonene");
  funksjonarOk = deploy("opprett-bruker") && funksjonarOk;
  // Sender ingenting før TRIPLETEX_NOKKEL ligg i hemmelegheitene OG bryteren
  // (pipe_tripletex_innstilling.fra_dato) er sett – sjå supabase/functions/tripletex-ordre
  funksjonarOk = deploy("tripletex-ordre") && funksjonarOk;
  // Kassen kallar bestilling-epost utan innlogging, så JWT-sjekken skal vere av
  // – sjå docs/bestilling-epost.md
  if (args.has("--med-epost")) funksjonarOk = deploy("bestilling-epost", ["--no-verify-jwt"]) && funksjonarOk;
}

// ── 3. Sjekken ──

steg("Sjekk");
const sjekk = spawnSync(process.execPath, ["scripts/check-db.mjs"], { cwd: ROT, stdio: "inherit" });

process.exit(sjekk.status === 0 && funksjonarOk ? 0 : 1);
