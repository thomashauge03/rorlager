// Sjekkar at .env peikar på eit Supabase-prosjekt der supabase-setup.sql har
// køyrt. Køyr med: npm run check:db
//
// Testen brukar anon-nøkkelen med vilje – det er den kunden faktisk møter, så
// dette avslører òg om RLS-reglene stenger nokon ute som ikkje skulle vore stengt.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
try {
  for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m) env[m[1]] = m[2];
  }
} catch {
  console.error("Fant ikke .env. Kopier .env.example til .env og fyll inn verdiene.");
  process.exit(1);
}

const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error("VITE_SUPABASE_URL eller VITE_SUPABASE_PUBLISHABLE_KEY mangler i .env");
  process.exit(1);
}

const supabase = createClient(url, key);
const ok = (t) => console.log(`  ok    ${t}`);
const feil = (t, e) => console.log(`  FEIL  ${t}  ->  ${e}`);

let problemer = 0;

console.log(`\nSjekker ${url}\n`);

for (const tabell of ["pipe_categories", "pipe_types", "pipe_settings"]) {
  const { error, count } = await supabase.from(tabell).select("*", { count: "exact", head: true });
  if (error) {
    feil(`${tabell} (skal være lesbar for alle)`, error.message);
    problemer++;
  } else {
    ok(`${tabell} — ${count} rader`);
  }
}

// Desse SKAL vere stengde for anonyme. Ein feil her er ikkje ein feil i testen,
// det er poenget: får vi lese, ligg dataa til kundane opne på nettet.
for (const tabell of ["pipe_orders", "pipe_order_lines", "pipe_invoices", "pipe_stock_log"]) {
  const { error } = await supabase.from(tabell).select("id").limit(1);
  if (error) {
    ok(`${tabell} — stengt for anonyme, som den skal`);
  } else {
    feil(`${tabell}`, "ANONYME KAN LESE DENNE. Kjør supabase-setup.sql på nytt.");
    problemer++;
  }
}

const { error: rpcFeil } = await supabase.rpc("pipe_submit_order", { p_customer_name: "", p_lines: [] });
if (rpcFeil && /Navn må fylles ut|tom/i.test(rpcFeil.message)) {
  ok("pipe_submit_order — svarer og validerer");
} else if (rpcFeil) {
  feil("pipe_submit_order", rpcFeil.message);
  problemer++;
} else {
  feil("pipe_submit_order", "godtok en tom bestilling");
  problemer++;
}

console.log(
  problemer === 0
    ? "\nAlt i orden. Databasen er klar.\n"
    : `\n${problemer} problem(er). Har du kjørt supabase-setup.sql i SQL Editor?\n`,
);
process.exit(problemer === 0 ? 0 : 1);
