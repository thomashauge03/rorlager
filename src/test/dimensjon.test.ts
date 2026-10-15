// Namn og dimensjon: dimensjonen står bak namnet, men ikkje to gonger.

import { describe, expect, it } from "vitest";
import { namnHarDimensjon, pipeLabel } from "@/lib/format";

describe("pipeLabel", () => {
  it("hengjer dimensjonen bak når namnet ikkje har henne – som Dahl-katalogen", () => {
    expect(pipeLabel("Bend X-Stream 15°", "150 mm")).toBe("Bend X-Stream 15° 150 mm");
    expect(pipeLabel("Union Isiflo", "32 mm")).toBe("Union Isiflo 32 mm");
    expect(pipeLabel("Avløpsrør PVC", null)).toBe("Avløpsrør PVC");
  });

  it("lèt namnet stå når dimensjonen alt står der – varene frå tellelista", () => {
    expect(pipeLabel("Bend 250 mm 45° PP", "250 mm")).toBe("Bend 250 mm 45° PP");
    expect(pipeLabel("Overgang 315x250 mm PP eksentrisk", "315x250 mm")).toBe("Overgang 315x250 mm PP eksentrisk");
    expect(pipeLabel("Bend 110x15° sort Wafix PP", "110 mm")).toBe("Bend 110x15° sort Wafix PP");
    expect(pipeLabel('Overgangsmuffe 1 1/2" R x 1 1/4" R', '1 1/2" R x 1 1/4" R')).toBe('Overgangsmuffe 1 1/2" R x 1 1/4" R');
    expect(pipeLabel("Sluseventil, DN100, HL, PN16", "DN100")).toBe("Sluseventil, DN100, HL, PN16");
    expect(pipeLabel("Kabelrør 3*40 mm gul DL (trommel)", "3*40 mm")).toBe("Kabelrør 3*40 mm gul DL (trommel)");
    expect(pipeLabel("Kumlokk og ramme Ø315 D400", "315 mm")).toBe("Kumlokk og ramme Ø315 D400");
    expect(pipeLabel("Kumgjennomføring 911 OD105-175", "105-175 mm")).toBe("Kumgjennomføring 911 OD105-175");
  });
});

describe("namnHarDimensjon", () => {
  it("eit tal må stå for seg sjølv: 15° er ikkje 150 mm, og 1600 er ikkje 160", () => {
    expect(namnHarDimensjon("Bend X-Stream 15°", "150 mm")).toBe(false);
    expect(namnHarDimensjon("Pakning GLI 1600 for betongkumring", "160 mm")).toBe(false);
    expect(namnHarDimensjon("Pakning GLI 1600 for betongkumring", "1600 mm")).toBe(true);
  });
});

describe("migrasjonane som legg dimensjonen frå namnet i eige felt", () => {
  it.each([
    ["20261015120000_dimensjon_fra_namnet.sql", 225],
    ["20261015140000_dimensjon_resten.sql", 8],
  ])("%s: kvar dimensjon blir kjend att i namnet sitt, så ingen etikett får henne to gonger", async (fil, antal) => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync(`supabase/migrations/${fil}`, "utf8");
    const rader = [...sql.matchAll(/\('(\d+)', '((?:[^']|'')*)'\),? -- (.*)/g)].map((m) => ({
      sku: m[1],
      dim: m[2].replace(/''/g, "'"),
      namn: m[3],
    }));
    expect(rader.length).toBe(antal);
    expect(rader.filter((r) => !namnHarDimensjon(r.namn, r.dim))).toEqual([]);
  });
});
