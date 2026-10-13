import { describe, expect, it } from "vitest";
import { mestTattUt, perMånad, stårStille, toppkundar, visMånad } from "@/lib/statistikk";
import type { OrderWithLines, PipeType } from "@/lib/types";

const vare = (id: string, over: Partial<PipeType> = {}) =>
  ({ id, name: id, dimension: null, unit: "m", price: 100, cost_price: 60, stock: 10, active: true, ...over }) as PipeType;

const ordre = (over: Partial<OrderWithLines>) =>
  ({
    id: "o",
    kind: "uttak",
    customer_name: "Kari",
    company: null,
    project: null,
    created_by: null,
    created_at: "2026-10-14T08:00:00Z",
    total: 100,
    stock_drawn_at: "2026-10-14T08:00:00Z",
    status: "ny",
    lines: [],
    ...over,
  }) as OrderWithLines;

describe("statistikk", () => {
  it("mest tatt ut etter salsverdi", () => {
    const r = mestTattUt([vare("a", { price: 10 }), vare("b"), vare("c")], new Map([["a", 50], ["b", 10]]));
    expect(r.map((x) => [x.vare.id, x.salsverdi])).toEqual([["b", 1000], ["a", 500]]);
  });

  it("står stille: på lager utan forbruk, mest bunde først", () => {
    const r = stårStille(
      [vare("a"), vare("b", { stock: 100 }), vare("c", { stock: 0 }), vare("d", { active: false })],
      new Map([["a", 1]]),
    );
    expect(r.map((x) => [x.vare.id, x.bundet])).toEqual([["b", 6000]]);
  });

  it("toppkundar: firma samlar, ventande bestillingar tel ikkje, returar trekkjer frå", () => {
    const r = toppkundar([
      ordre({ id: "1", customer_name: "Per", company: "Firma AS", total: 300 }),
      ordre({ id: "2", customer_name: "Pål", company: "Firma AS", total: 200 }),
      ordre({ id: "3", customer_name: "Per", company: "Firma AS", total: -50, retur_av: "1" }),
      ordre({ id: "4", kind: "bestilling", customer_type: "privat", stock_drawn_at: null, total: 999 }),
      ordre({ id: "5", customer_name: "Kari", total: 100 }),
    ]);
    expect(r).toEqual([
      { namn: "Firma AS", uttak: 2, sum: 450 },
      { namn: "Kari", uttak: 1, sum: 100 },
    ]);
  });

  it("per månad, nyaste først", () => {
    const r = perMånad([
      ordre({ created_at: "2026-09-30T10:00:00Z", total: 50 }),
      ordre({ created_at: "2026-10-01T10:00:00Z", total: 70 }),
      ordre({ created_at: "2026-10-14T10:00:00Z", total: 30 }),
    ]);
    expect(r).toEqual([
      { månad: "2026-10", uttak: 2, sum: 100 },
      { månad: "2026-09", uttak: 1, sum: 50 },
    ]);
    expect(visMånad("2026-10")).toBe("oktober 2026");
  });
});
