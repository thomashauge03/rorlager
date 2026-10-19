import { describe, expect, it } from "vitest";
import { dekningsgradAv, prislinje, prisoppsummering } from "@/lib/prisoversikt";
import type { PipeType } from "@/lib/types";

const vare = (cost_price: number | null, price: number | null, stock = 0): PipeType => ({
  id: `${cost_price}-${price}`,
  category_id: null,
  name: "PE-rør",
  dimension: "110",
  sku: null,
  qr_slug: "x",
  unit: "m",
  price,
  cost_price,
  stock,
  low_stock_threshold: 0,
  location: null,
  color: null,
  description: null,
  active: true,
  sort_order: 0,
  created_at: "",
  updated_at: "",
});

describe("prislinje", () => {
  it("viser tillegg i kroner, påslag og dekningsgrad", () => {
    const l = prislinje(vare(100, 125), 25, 25);
    expect(l.tillegg).toBe(25);
    expect(l.paaslag).toBe(25);
    expect(l.dekningsgrad).toBe(20);
    expect(l.utsalgInklMva).toBe(156.25);
    expect(l.status).toBe("standard");
  });

  it("tel ein pris runda til 5 eller 10 kroner som standard", () => {
    expect(prislinje(vare(101, 125), 25, 25).status).toBe("standard"); // 126,25 → 125
    expect(prislinje(vare(105, 130), 25, 25).status).toBe("standard"); // 131,25 → 130
    expect(prislinje(vare(66.7, 83.38), 25, 25).status).toBe("standard"); // øre
  });

  it("flaggar ein pris som er sett for hand", () => {
    const l = prislinje(vare(100, 150), 25, 25);
    expect(l.status).toBe("avvik");
    expect(l.paaslag).toBe(50);
    expect(l.standardPris).toBe(125);
  });

  it("seier frå når ein av prisane manglar, i staden for å vise 0 %", () => {
    expect(prislinje(vare(null, 125), 25, 25)).toMatchObject({ status: "utenInnkjop", paaslag: null });
    expect(prislinje(vare(100, null), 25, 25)).toMatchObject({ status: "utenPris", tillegg: null });
  });
});

describe("prisoppsummering", () => {
  it("tel opp status, snitt og lagerverdi", () => {
    const s = prisoppsummering(
      [vare(100, 125, 10), vare(100, 150, 2), vare(null, 80, 5), vare(40, null, 3)].map((v) =>
        prislinje(v, 25, 25),
      ),
    );
    expect(s.perStatus).toEqual({ standard: 1, avvik: 1, utenInnkjop: 1, utenPris: 1 });
    expect(s.snittPaaslag).toBe(37.5);
    expect(s.lavestPaaslag).toBe(25);
    expect(s.hoyestPaaslag).toBe(50);
    expect(s.lagerverdiInnkjop).toBe(1200);
    expect(s.lagerverdiUtsalg).toBe(1550);
  });
});

describe("dekningsgradAv", () => {
  it("reknar påslag om til del av salsprisen", () => {
    expect(dekningsgradAv(25)).toBe(20);
    expect(dekningsgradAv(100)).toBe(50);
    expect(dekningsgradAv(0)).toBe(0);
  });
});
