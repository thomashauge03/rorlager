import { describe, expect, it } from "vitest";
import {
  filterAndSortPipes,
  ikkeISisteListe,
  matchesSearch,
  sistePrislisteDato,
  stockStatus,
  stockTotals,
  varselgrense,
} from "@/lib/stock";
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

  it("sorterer på kolonnane i tabellen, begge vegar", () => {
    const tabell = [
      pipe({ id: "x", name: "B", sku: "100", low_stock_threshold: 5, cost_price: 30, active: true }),
      pipe({ id: "y", name: "A", sku: "20", low_stock_threshold: 0, cost_price: null, active: false }),
      pipe({ id: "z", name: "C", sku: "3", low_stock_threshold: 5, cost_price: 10, active: true }),
    ];
    const ids = (key: "sku" | "threshold" | "cost" | "active", dir: "asc" | "desc" = "asc") =>
      filterAndSortPipes(tabell, { sort: { key, dir } }).map((r) => r.id);
    // Varenummeret numerisk: 3 før 20 før 100
    expect(ids("sku")).toEqual(["z", "y", "x"]);
    expect(ids("sku", "desc")).toEqual(["x", "y", "z"]);
    // Lik varselgrense: namnet avgjer
    expect(ids("threshold")).toEqual(["y", "x", "z"]);
    // Utan kostpris først stigande
    expect(ids("cost")).toEqual(["y", "z", "x"]);
    expect(ids("active")).toEqual(["y", "x", "z"]);
    expect(ids("active", "desc")).toEqual(["x", "z", "y"]);
  });

  it("sorterer på innkjøps- og salgsverdi", () => {
    const tabell = [
      pipe({ id: "x", name: "X", stock: 10, cost_price: 5, price: 10 }), // 50 / 100
      pipe({ id: "y", name: "Y", stock: 2, cost_price: 40, price: 30 }), // 80 / 60
      pipe({ id: "z", name: "Z", stock: -3, cost_price: 100, price: 200 }), // negativ = 0
    ];
    const ids = (key: "costValue" | "saleValue") =>
      filterAndSortPipes(tabell, { sort: { key, dir: "desc" } }).map((r) => r.id);
    expect(ids("costValue")).toEqual(["y", "x", "z"]);
    expect(ids("saleValue")).toEqual(["x", "y", "z"]);
  });
});

describe("standard varselgrense", () => {
  const STD = { stk: 2, m: 10 };

  it("gjeld berre varer utan eiga grense, per eining", () => {
    expect(varselgrense(pipe({ unit: "stk", low_stock_threshold: 0 }), STD)).toBe(2);
    expect(varselgrense(pipe({ unit: "m", low_stock_threshold: 0 }), STD)).toBe(10);
    expect(varselgrense(pipe({ unit: "stk", low_stock_threshold: 7 }), STD)).toBe(7);
    // Utan standard (kundeflyten): som før
    expect(varselgrense(pipe({ unit: "stk", low_stock_threshold: 0 }))).toBe(0);
  });

  it("gir «snart» på grensa, men aldri for ei tom vare", () => {
    expect(stockStatus(pipe({ unit: "stk", stock: 2, low_stock_threshold: 0 }), STD)).toBe("snart");
    expect(stockStatus(pipe({ unit: "stk", stock: 3, low_stock_threshold: 0 }), STD)).toBe("pa_lager");
    expect(stockStatus(pipe({ unit: "m", stock: 8, low_stock_threshold: 0 }), STD)).toBe("snart");
    expect(stockStatus(pipe({ unit: "stk", stock: 0, low_stock_threshold: 0 }), STD)).toBe("tomt");
    expect(stockStatus(pipe({ unit: "stk", stock: 2, low_stock_threshold: 0 }), { stk: 0, m: 0 })).toBe("pa_lager");
  });

  it("tel med i «snart», men ikkje i «tomme»", () => {
    const rader = [
      pipe({ id: "a", unit: "stk", stock: 1, low_stock_threshold: 0 }), // snart via standard
      pipe({ id: "b", unit: "stk", stock: 0, low_stock_threshold: 0 }), // aldri teken inn – ikkje støy
    ];
    const t = stockTotals(rader, STD);
    expect(t.snart).toBe(1);
    expect(t.tomme).toBe(0);
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
