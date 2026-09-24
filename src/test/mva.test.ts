import { describe, expect, it } from "vitest";
import { linjesum, prisInklMva, summer } from "@/lib/mva";

describe("linjesum", () => {
  it("rundar halve øre opp, slik Postgres gjer", () => {
    // 103,39 × 12,5 = 1292,375. Rein flyttalsrekning gir 1292,37.
    expect(linjesum(103.39, 12.5)).toBe(1292.38);
  });

  it("gir heile kroner når det går opp", () => {
    expect(linjesum(100, 12.5)).toBe(1250);
    expect(linjesum(25, 4)).toBe(100);
  });

  it("tåler pris 0", () => {
    expect(linjesum(0, 7)).toBe(0);
  });
});

describe("summer", () => {
  it("reknar mva av summen, ikkje per linje – som fakturagrunnlaget", () => {
    expect(summer([1250, 100], 25)).toEqual({ eks: 1350, mva: 337.5, inkl: 1687.5 });
  });

  it("legg saman øre utan flyttalsstøy", () => {
    expect(summer([0.1, 0.2], 0).eks).toBe(0.3);
    expect(summer(Array(100).fill(0.01), 25)).toEqual({ eks: 1, mva: 0.25, inkl: 1.25 });
  });

  it("sats 0 gir ingen mva", () => {
    expect(summer([100], 0)).toEqual({ eks: 100, mva: 0, inkl: 100 });
  });

  it("brukar same formel som invoice-pdf.ts", () => {
    const eks = 1292.38;
    expect(summer([eks], 25).mva).toBe(Math.round(eks * 25) / 100);
  });
});

describe("prisInklMva", () => {
  it("legg på satsen og rundar i øre", () => {
    expect(prisInklMva(103, 25)).toBe(128.75);
    expect(prisInklMva(103.39, 25)).toBe(129.24);
  });
});
