// Køyrer alle databasetestane etter kvarandre. npm run test:db
//
// Kvar fil byggjer sin eigen base frå migrasjonane, så dei kan ikkje smitte
// kvarandre. Det kostar nokre sekund per fil, og er verdt det: ein test som
// arvar tilstand frå ein annan fortel deg ikkje kva som faktisk er sant.

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";

const HER = dirname(fileURLToPath(import.meta.url));
const filer = readdirSync(HER)
  .filter((f) => f.endsWith(".test.mjs"))
  .sort();

let feila = 0;

for (const f of filer) {
  console.log(`\n═══ ${f} ═══`);
  const r = spawnSync(process.execPath, [join(HER, f)], { stdio: "inherit" });
  if (r.status !== 0) feila++;
}

console.log(
  feila === 0
    ? `\n${filer.length} testfil(er) kjørte gjennom.\n`
    : `\n${feila} av ${filer.length} testfiler feilet.\n`,
);

process.exit(feila === 0 ? 0 : 1);
