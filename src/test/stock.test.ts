import { describe, expect, it } from "vitest";
import { filterAndSortPipes, ikkeISisteListe, matchesSearch, sistePrislisteDato, stockStatus, stockTotals } from "@/lib/stock";
import type { PipeType } from "@/lib/types";

const pipe = (over: Partial<PipeType>): PipeType =>
  ({
    id: over.id ?? "1",
    category_id: null,
    name: "PVC avløpsrør",
    dimension: "110 mm",
    sku: "PVC-110",
    qr_slug: "pvc-110",
    unit: "m",
    price: 89,
    cost_price: null,
    stock: 100,
    low_stock_threshold: 20,
    location: "A-01",
    color: null,
    description: null,
    active: true,
    sort_order: 0,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...over,
  }) as PipeType;

describe("stockStatus", () => {
  it("er tomt på null og under", () => {
    expect(stockStatus(pipe({ stock: 0 }))).toBe("tomt");
    expect(stockStatus(pipe({ stock: -5 }))).toBe("tomt");
  });

  it("varsler når beholdningen er på eller under grensen", () => {
    expect(stockStatus(pipe({ stock: 20, low_stock_threshold: 20 }))).toBe("snart");
    expect(stockStatus(pipe({ stock: 21, low_stock_threshold: 20 }))).toBe("pa_lager");
  });

  it("slår av varselet når grensen er null", () => {
    expect(stockStatus(pipe({ stock: 1, low_stock_threshold: 0 }))).toBe("pa_lager");
  });
});

describe("matchesSearch", () => {
  const p = pipe({});
  it("treffer på dimensjon, hylle og varenummer", () => {
    expect(matchesSearch(p, "110")).toBe(true);
    expect(matchesSearch(p, "a-01")).toBe(true);
    expect(matchesSearch(p, "pvc-110")).toBe(true);
  });

  it("krever at alle ordene treffer", () => {
    expect(matchesSearch(p, "pvc 110")).toBe(true);
    expect(matchesSearch(p, "pvc 160")).toBe(false);
  });
});

describe("filterAndSortPipes", () => {
  const rows = [
    pipe({ id: "b", name: "PVC avløpsrør", dimension: "160 mm", stock: 5, low_stock_threshold: 10 }),
    pipe({ id: "a", name: "PVC avløpsrør", dimension: "110 mm", stock: 0 }),
    pipe({ id: "c", name: "PE trykkrør", dimension: "32 mm", stock: 600, active: false }),
  ];

  it("sorterer dimensjon numerisk innenfor samme navn", () => {
    const sorted = filterAndSortPipes(rows).map((r) => r.id);
    expect(sorted).toEqual(["c", "a", "b"]);
  });

  it("kan skjule inaktive varer", () => {
    expect(filterAndSortPipes(rows, { onlyActive: true }).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("setter tomme først når det sorteres på status", () => {
    const sorted = filterAndSortPipes(rows, { sort: { key: "status", dir: "asc" } }).map((r) => r.id);
    expect(sorted[0]).toBe("a");
    expect(sorted[1]).toBe("b");
  });
});

describe("stockTotals", () => {
  it("summerer per enhet og regner lagerverdi med kostpris, uten negative beholdninger", () => {
    const totals = stockTotals([
      pipe({ id: "a", stock: 10, price: 100, cost_price: 80, unit: "m" }),
      pipe({ id: "b", stock: -5, price: 100, cost_price: 80, unit: "m" }),
      pipe({ id: "c", stock: 2, price: null, cost_price: null, unit: "stk" }),
    ]);
    expect(totals.verdi).toBe(800);
    expect(totals.salsverdi).toBe(1000);
    expect(totals.perUnit).toEqual([
      { unit: "m", qty: 5 },
      { unit: "stk", qty: 2 },
    ]);
    expect(totals.tomme).toBe(1);
  });

  it("tel ikkje varer som aldri blir førte på lager som tomme", () => {
    const totals = stockTotals([
      pipe({ id: "dahl", stock: 0, low_stock_threshold: 0 }),
      pipe({ id: "ført", stock: 0, low_stock_threshold: 10 }),
      pipe({ id: "minus", stock: -2, low_stock_threshold: 0 }),
    ]);
    expect(totals.tomme).toBe(2);
  });
});

describe("siste prisliste", () => {
  const v = (prisliste_dato: string | null) => ({ prisliste_dato });
  it("er den største datoen, uansett format på tidssona", () => {
    const siste = sistePrislisteDato([v(null), v("2026-09-01T08:00:00+00:00"), v("2026-10-15T10:00:00+02:00")]);
    expect(siste).toBe("2026-10-15T10:00:00+02:00");
    expect(sistePrislisteDato([v(null)])).toBeNull();
  });

  it("ei vare var ikkje med når datoen er ein annan eller manglar – same tidspunkt i anna skrivemåte tel som med", () => {
    const siste = "2026-10-15T08:00:00+00:00";
    expect(ikkeISisteListe(v("2026-10-15T10:00:00+02:00"), siste)).toBe(false);
    expect(ikkeISisteListe(v("2026-09-01T08:00:00+00:00"), siste)).toBe(true);
    expect(ikkeISisteListe(v(null), siste)).toBe(true);
    // Før første import finst det inga liste å mangle i
    expect(ikkeISisteListe(v(null), null)).toBe(false);
  });
});
