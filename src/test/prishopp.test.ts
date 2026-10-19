import { describe, expect, it } from "vitest";
import { hoppSidanImport, prisEtterHopp, type PrisHending } from "@/lib/prishopp";
import { prislinje } from "@/lib/prisoversikt";
import type { PipeType } from "@/lib/types";

const hending = (over: Partial<PrisHending>): PrisHending => ({
  id: Math.random().toString(36),
  created_at: "2026-10-01T10:00:00Z",
  created_by: null,
  created_by_name: "Thomas",
  slag: "hopp",
  prosent: 5,
  grunn: null,
  category_id: null,
  kategori_namn: null,
  avrunding: 1,
  antall: 10,
  ...over,
});

const vare = (cost_price: number | null, price: number | null, prishopp_faktor = 1) =>
  ({ id: "v", name: "PE", dimension: null, cost_price, price, prishopp_faktor, stock: 0, unit: "m", active: true }) as unknown as PipeType;

describe("hoppSidanImport", () => {
  it("tel berre hopp etter siste prisliste, og gangar dei saman", () => {
    const s = hoppSidanImport([
      hending({ created_at: "2026-10-20T00:00:00Z", prosent: -2, grunn: "ned" }),
      hending({ created_at: "2026-10-19T00:00:00Z", prosent: 5, grunn: "opp" }),
      hending({ created_at: "2026-10-18T00:00:00Z", slag: "paaslag", prosent: 35 }),
      hending({ created_at: "2026-10-15T00:00:00Z", slag: "import", prosent: 35 }),
      hending({ created_at: "2026-10-10T00:00:00Z", prosent: 10, grunn: "før lista" }),
    ]);
    expect(s.import?.created_at).toBe("2026-10-15T00:00:00Z");
    expect(s.hopp.map((h) => h.grunn)).toEqual(["opp", "ned"]);
    expect(s.faktor).toBeCloseTo(1.029, 10);
  });

  it("held hopp på éi varegruppe utanfor den samla faktoren", () => {
    const s = hoppSidanImport([hending({ category_id: "k", kategori_namn: "Messing" }), hending({})]);
    expect(s.gruppehopp).toHaveLength(1);
    expect(s.faktor).toBeCloseTo(1.05, 10);
  });

  it("utan import i sporet tel alle hoppa", () => {
    expect(hoppSidanImport([hending({}), hending({})]).faktor).toBeCloseTo(1.1025, 10);
    expect(hoppSidanImport([]).faktor).toBe(1);
  });
});

describe("prisEtterHopp – same reglar som pipe_prishopp", () => {
  it("formelvare blir rekna frå Dahl-prisen med den nye faktoren", () => {
    expect(prisEtterHopp(vare(100, 135), 35, 5)).toBe(142); // 141,75
    expect(prisEtterHopp(vare(100, 142, 1.05), 35, 5)).toBe(149); // 100 × 1,35 × 1,1025 = 148,84
  });

  it("handsett pris og vare utan innkjøp får hoppet på prisen ho har", () => {
    expect(prisEtterHopp(vare(100, 150), 35, 5)).toBe(158);
    expect(prisEtterHopp(vare(null, 80), 35, -2)).toBe(78);
  });
});

describe("prislinje med prishopp", () => {
  it("ein pris med hopp fylgjer framleis formelen", () => {
    const l = prislinje(vare(100, 142, 1.05), 35, 25);
    expect(l.status).toBe("standard");
    expect(l.hopp).toBeCloseTo(5, 10);
    expect(l.paaslag).toBe(42); // over Dahl, påslag og hopp til saman
    expect(l.standardPris).toBe(142);
  });
});
