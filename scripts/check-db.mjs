// Sjekkar at .env peikar på eit Supabase-prosjekt der supabase-setup.sql har
// køyrt. Køyr med: npm run check:db
//
// Testen brukar anon-nøkkelen med vilje – det er den kunden faktisk møter, så
// dette avslører òg om RLS-reglene stenger nokon ute som ikkje skulle vore
// stengt, eller slepper nokon inn som skulle vore stengt.

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
const nei = (t, e) => {
  feil(t, e);
  problemer++;
};

console.log(`\nSjekker ${url}\n`);

// ── Det kundeflyten må nå ──
//
// Katalogen blir lesen gjennom pipe_catalog, ikkje pipe_types. Visninga er
// utan cost_price, og tabellen bak er stengd for anonyme.

console.log("Åpent for kunden, som det skal:");
for (const tabell of ["pipe_categories", "pipe_catalog", "pipe_public_settings"]) {
  const { error, count } = await supabase.from(tabell).select("*", { count: "exact", head: true });
  if (error) nei(`${tabell} (skal være lesbar for alle)`, error.message);
  else ok(`${tabell} — ${count} rader`);
}

// ── Innkjøpsprisen ──
//
// Fram til 20260903090200 låg cost_price og markup_percent opne for kven som
// helst på nettet. Denne sjekken er heile grunnen til at visningane finst.

console.log("\nInnkjøpspris og avanse, som ingen utanfor kontoret skal se:");

/*
 * MERK at fråværet av kolonnen blir prøvd på ei EKTE RAD.
 *
 * Ein tidlegare versjon sa `data?.[0] && "cost_price" in data[0]`, som hoppa
 * rett til grønt om visninga var tom – altså godkjenning utan å ha sett på
 * noko. Ei tom visning er dessutan i seg sjølv eit problem verdt å seie frå om:
 * då får ingen kunde sjå katalogen.
 */
const utanKolonne = async (visning, kolonne) => {
  const { data, error } = await supabase.from(visning).select("*").limit(1);
  if (error) return nei(visning, error.message);
  if (!data?.[0]) return nei(visning, "ingen rader – kan ikke avgjøre om kolonnen er der, og kunden ser ingenting");
  if (kolonne in data[0]) return nei(visning, `${kolonne} ligger i visningen!`);
  ok(`${visning} har ingen ${kolonne}`);
};

await utanKolonne("pipe_catalog", "cost_price");
await utanKolonne("pipe_public_settings", "markup_percent");

/*
 * Den eine spørjinga i kundeflyten ingen annan test dekkjer.
 *
 * fetchCatalog og fetchPipeTypeBySlug gjer `select("*, pipe_categories(name)")`
 * mot ei VISNING. Visningar har ingen framandnøklar, så PostgREST må utleie
 * relasjonen sjølv – og klarer han det ikkje, kastar datalaget og framsida,
 * QR-sida og behovssida blir svarte. pglite-testane køyrer rå SQL og rører
 * aldri denne vegen.
 */
{
  const { data, error } = await supabase.from("pipe_catalog").select("*, pipe_categories(name)").limit(1);
  if (error) nei("pipe_catalog med kategorinavn (som framsiden henter)", error.message);
  else if (!data?.[0]) nei("pipe_catalog med kategorinavn", "ingen rader");
  else ok(`pipe_catalog med kategorinavn — «${data[0].pipe_categories?.name ?? "uten kategori"}»`);
}

// ── Alt som SKAL vere stengt for anonyme ──
//
// Ein feil her er ikkje ein feil i testen, det er poenget: får vi lese, ligg
// dataa opne på nettet.

console.log("\nStengt for anonyme, som det skal:");
const stengde = [
  ["pipe_types", "innkjøpsprisen ligger her"],
  ["pipe_settings", "påslaget ligger her"],
  ["pipe_orders", "kundenavn, telefon og signaturer"],
  ["pipe_order_lines", null],
  ["pipe_invoices", null],
  ["pipe_stock_log", null],
  ["projects", null],
  ["project_members", null],
  ["project_orders", null],
  ["project_order_lines", null],
  ["project_receipts", null],
  ["project_receipt_lines", null],
];

/*
 * Same skiljet som for funksjonane under: «stengt» og «finst ikkje» er ikkje
 * det same.
 *
 * Ein tidlegare versjon talde KVA SOM HELST av feil som bestått – ein feilstava
 * tabell, ein som aldri blei oppretta, eller eit nettverksbrot. Med tolv
 * tabellar i lista var blindsona stor nok til å gi grønt lys på ein base der
 * halve skjemaet mangla.
 */
for (const [tabell, hvorfor] of stengde) {
  const { error } = await supabase.from(tabell).select("*").limit(1);
  if (!error) {
    nei(tabell, `ANONYME KAN LESE DENNE${hvorfor ? ` – ${hvorfor}` : ""}. Kjør supabase-setup.sql på nytt.`);
    continue;
  }
  const kode = error.code ?? "";
  if (kode === "PGRST205" || /Could not find the table/i.test(error.message)) {
    nei(tabell, "finnes ikke i databasen. Har du kjørt supabase-setup.sql?");
  } else if (kode === "42501" || /permission denied/i.test(error.message)) {
    ok(`${tabell}`);
  } else {
    nei(tabell, `uventet svar: ${error.message}`);
  }
}

// ── Det anon kan LESE, men ikke skrive ──
//
// Katalogen og kategoriene skal være åpne for kunden. Men lesetilgang er ikke
// det samme som skrivetilgang, og Supabase deler ut ALT på nye objekter til
// anon som standard — så en `grant select` legger bare til, den avgrenser
// ingenting.
//
// Denne sjekken fantes ikke da pipe_catalog ble laget, og da lå hele katalogen
// åpen for en anonym DELETE. Den står her nå fordi et hull uten en test er et
// hull som kommer tilbake.

console.log("\nLesbart for kunden, men ikke skrivbart:");
for (const tabell of ["pipe_categories", "pipe_catalog", "pipe_public_settings"]) {
  const { error, status } = await supabase.from(tabell).delete().neq("id", "00000000-0000-0000-0000-000000000000");
  // 204 uten feil betyr at rettigheten er der og bare RLS stanset radene.
  // Rettigheten skal ikke være der i det hele tatt.
  if (error) ok(`${tabell} — DELETE nektes`);
  else nei(tabell, `ANONYME HAR DELETE (svarte ${status}). Kjør supabase-setup.sql på nytt.`);
}

// ── Funksjonane ──

console.log("\nFunksjoner:");
{
  const { error } = await supabase.rpc("pipe_submit_order", { p_customer_name: "", p_lines: [] });
  if (error && /Navn må fylles ut|tom/i.test(error.message)) ok("pipe_submit_order — svarer og validerer");
  else if (error) nei("pipe_submit_order", error.message);
  else nei("pipe_submit_order", "godtok en tom bestilling");
}

/*
 * Vaktene skal ikkje svare på ein anonym førespurnad i det heile.
 *
 * MERK skilnaden mellom «stengd» og «finst ikkje». Ein manglande funksjon gir
 * òg ein feil, og ein tidlegare versjon av dette skriptet talde det som eit
 * bestått punkt – altså grønt lys for ei vakt som ikkje eksisterte. Difor blir
 * feilen lesen: berre ei rettigheitsnekting tel.
 */
const stengtForAnon = async (navn, args = undefined) => {
  const { error } = await supabase.rpc(navn, args);
  if (!error) return nei(navn, "ANONYME KAN KALLE DENNE");
  const kode = error.code ?? "";
  if (kode === "PGRST202" || /Could not find the function/i.test(error.message)) {
    return nei(navn, "finnes ikke i databasen. Har du kjørt supabase-setup.sql?");
  }
  if (kode === "42501" || /permission denied/i.test(error.message)) {
    return ok(`${navn} — stengt for anonyme`);
  }
  // Ein annan feil er ikkje det same som ei nekting, og skal ikkje passere stilt
  nei(navn, `uventet svar: ${error.message}`);
};

for (const fn of ["hm_er_kontor", "hm_rolle", "hm_har_tilgang"]) await stengtForAnon(fn);

await stengtForAnon("project_submit_receipt", {
  p_order_id: "00000000-0000-0000-0000-000000000000",
  p_received_by_name: "test",
  p_lines: [],
});

console.log(
  problemer === 0
    ? "\nAlt i orden. Databasen er klar.\n"
    : `\n${problemer} problem(er). Har du kjørt supabase-setup.sql i SQL Editor?\n`,
);
process.exit(problemer === 0 ? 0 : 1);
