// Sjekker at tidslinja holder det planene lover: klippene ligger på slag,
// sluttslaget treffer sluttkortet, hoppet i musikken skjer på en taktgrense,
// og lengdene og tempoene er innenfor det filmen tåler.
//
//   node scripts/sjekk-tider.mjs
//
// Planene er TypeScript; esbuild (fra Remotion) pakker dem til et midlertidig
// skript som kjøres her. Avslutter med kode 1 hvis noe er galt.
import { buildSync } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const mappe = mkdtempSync(path.join(tmpdir(), "sjekk-tider-"));
const ut = path.join(mappe, "planer.mjs");
buildSync({
  stdin: {
    contents: `export * from "./src/versjoner/planer"; export * from "./src/tid";`,
    resolveDir: path.resolve("."),
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: ut,
  logLevel: "error",
});
const m = await import(pathToFileURL(ut).href);
rmSync(mappe, { recursive: true, force: true });

const feil = [];
const sjekk = (ok, tekst) => {
  console.log(`${ok ? "  ok " : "FEIL "} ${tekst}`);
  if (!ok) feil.push(tekst);
};

const erPaSlag = (bilde) => {
  const n = bilde / m.SLAG;
  return Math.abs(bilde - Math.round(n) * m.SLAG) <= 0.5;
};

for (const [navn, plan, lengde] of [
  ["Hovedfilm", m.HOVEDFILM_PLAN, [44, 49]],
  ["Kortversjon", m.KORT_PLAN, [28, 33]],
]) {
  console.log(`\n${navn} (${(plan.lengde / m.FPS).toFixed(1)} s)`);
  const sek = plan.lengde / m.FPS;
  sjekk(sek >= lengde[0] && sek <= lengde[1], `lengde ${sek.toFixed(1)} s innenfor ${lengde[0]}–${lengde[1]} s`);

  plan.deler.forEach((d, i) => {
    if (i > 0) sjekk(d.fra === plan.deler[i - 1].til, `${d.scene} starter der ${plan.deler[i - 1].scene} slutter`);
    const tempo = m.LENGDE[d.scene] / (d.til - d.fra);
    sjekk(tempo >= 0.8 && tempo <= 1.9, `${d.scene}: tempo ${tempo.toFixed(2)}`);
    if (d.scene !== "apning") sjekk(erPaSlag(d.fra), `${d.scene} starter på et slag (bilde ${d.fra})`);
  });

  const slutt = plan.deler.find((d) => d.scene === "slutt");
  const [bit1, bit2] = plan.musikk;
  const sluttslagIFilm = bit2.film + (m.sporSlag(m.SPOR.sluttslag) - bit2.spor);
  sjekk(Math.abs(sluttslagIFilm - slutt.fra) <= 2, `sluttslaget (bilde ${sluttslagIFilm}) treffer sluttkortet (bilde ${slutt.fra})`);
  sjekk(bit1.film + bit1.lengde === bit2.film, "musikkbitene henger sammen");

  // Hoppet: sporets slag der bit 1 slutter må være starten av en takt (slag 3, 7, 11 …)
  const sporSlagVedHopp = (bit1.spor + bit1.lengde) / m.FPS;
  const slagNr = Math.round((sporSlagVedHopp - m.MUSIKK.forsteSlag) / (60 / m.MUSIKK.bpm));
  sjekk((slagNr - 3) % 4 === 0, `hoppet i musikken ligger på en taktgrense (slag ${slagNr})`);
  sjekk((m.SPOR.sluttBygg - 3) % 4 === 0, `avslutningen starter på en taktgrense (slag ${m.SPOR.sluttBygg})`);
  sjekk(bit2.spor + bit2.lengde <= 129.07 * m.FPS, "musikken slutter før sporet gjør");

  // Grooven skal slå inn når steg 1 begynner
  const skann = plan.deler.find((d) => d.scene === "skann");
  const grooveIFilm = bit1.film + (m.sporSlag(m.SPOR.grooveInn) - bit1.spor);
  sjekk(Math.abs(grooveIFilm - skann.fra) <= 2, `grooven (bilde ${grooveIFilm}) slår inn når steg 1 starter (bilde ${skann.fra})`);
}

console.log(feil.length ? `\n${feil.length} feil.` : "\nAlt stemmer.");
process.exit(feil.length ? 1 : 0);
