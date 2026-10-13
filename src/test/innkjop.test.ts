import { describe, expect, it } from "vitest";
import { bestillingCsv, bestillingTekst, innkjøpsforslag } from "@/lib/innkjop";
import type { PipeType } from "@/lib/types";

const vare = (over: Partial<PipeType>): PipeType =>
  ({
    id: "v",
    name: "PVC",
    dimension: "110 mm",
    sku: "2251059",
    unit: "m",
    stock: 100,
    low_stock_threshold: 20,
    active: true,
    ...over,
  }) as PipeType;

describe("innkjøpsforslag", () => {
  it("tek med ei vare under grensa og fyller opp til to gonger grensa utan forbruk", () => {
    const [l] = innkjøpsforslag([vare({ stock: 5 })], new Map(), 90);
    expect(l).toMatchObject({ forslag: 35, grunn: "under_grense", dagarIgjen: null });
  });

  it("med forbruk: fyller opp til grensa pluss 30 dagar", () => {
    // 180 m på 90 dagar = 2 m/dag → 30 dagar = 60 m. Mål 20 + 60 = 80, har 10 → 70
    const [l] = innkjøpsforslag([vare({ stock: 10 })], new Map([["v", 180]]), 90);
    expect(l.forslag).toBe(70);
    expect(l.dagarIgjen).toBe(5);
  });

  it("utan grense: med når ho går tom innan 14 dagar", () => {
    const linjer = innkjøpsforslag(
      [vare({ id: "a", stock: 20, low_stock_threshold: 0 }), vare({ id: "b", stock: 40, low_stock_threshold: 0 })],
      new Map([["a", 180], ["b", 180]]),
      90,
    );
    // a: 20 m / 2 per dag = 10 dagar → med. b: 20 dagar → ikkje med.
    expect(linjer.map((l) => l.vare.id)).toEqual(["a"]);
    expect(linjer[0]).toMatchObject({ grunn: "går_tom", forslag: 40 });
  });

  it("hoppar over avslåtte varer og varer over grensa, og sorterer det som går tom først øvst", () => {
    const linjer = innkjøpsforslag(
      [
        vare({ id: "av", stock: 0, active: false }),
        vare({ id: "ok", stock: 50 }),
        vare({ id: "seint", stock: 18 }),
        vare({ id: "snart", stock: 2 }),
      ],
      new Map([["seint", 90], ["snart", 90]]),
      90,
    );
    expect(linjer.map((l) => l.vare.id)).toEqual(["snart", "seint"]);
  });

  it("negativ beholdning tel som null dagar igjen, og forslaget dekkjer minuset", () => {
    const [l] = innkjøpsforslag([vare({ stock: -5 })], new Map(), 90);
    expect(l.forslag).toBe(45);
    expect(l.dagarIgjen).toBeNull();
  });
});

describe("bestillingslista", () => {
  const linjer = [{ varenr: "2251059", vare: "PVC 110 mm", mengde: 12.5, enhet: "m" }];
  it("CSV med varenummer først og desimalkomma", () => {
    expect(bestillingCsv(linjer)).toBe("﻿Varenr;Vare;Antall;Enhet\r\n2251059;PVC 110 mm;12,5;m\r\n");
  });
  it("tekst til e-post", () => {
    expect(bestillingTekst(linjer)).toBe("2251059  PVC 110 mm – 12,5 m");
  });
});
