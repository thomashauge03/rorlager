import { beforeEach, describe, expect, it } from "vitest";
import { cartHasUnpriced, cartLineFromType, cartTotal, clearCart, readCart, writeCart } from "@/lib/cart";
import { parseNum, qtyLabel } from "@/lib/format";
import type { CartLine, PipeType } from "@/lib/types";

const line = (over: Partial<CartLine> = {}): CartLine => ({
  pipe_type_id: "a",
  name: "PVC avløpsrør",
  dimension: "110 mm",
  sku: "PVC-110",
  unit: "m",
  price: 89,
  quantity: 10,
  location: "A-01",
  ...over,
});

beforeEach(() => {
  clearCart();
});

describe("kurven i localStorage", () => {
  it("overlever skriving og lesing", () => {
    writeCart([line(), line({ pipe_type_id: "b", price: null })]);
    expect(readCart()).toHaveLength(2);
  });

  it("kaster søppel i stedet for å krasje", () => {
    localStorage.setItem("rorlager.kurv.v1", "{ikke json");
    expect(readCart()).toEqual([]);

    localStorage.setItem("rorlager.kurv.v1", JSON.stringify([{ name: "uten id" }, line()]));
    expect(readCart()).toHaveLength(1);
  });
});

describe("summering", () => {
  it("hopper over linjer uten pris i stedet for å regne dem som null", () => {
    const lines = [line({ price: 100, quantity: 2 }), line({ pipe_type_id: "b", price: null, quantity: 5 })];
    expect(cartTotal(lines)).toBe(200);
    expect(cartHasUnpriced(lines)).toBe(true);
  });
});

describe("cartLineFromType", () => {
  it("tar med hylleplassen så plukkingen finner røret", () => {
    const t = { id: "x", name: "PE100", dimension: "63 mm", sku: "PE-63", unit: "m", price: 69, location: "B-04" } as PipeType;
    expect(cartLineFromType(t, 12.5)).toMatchObject({ pipe_type_id: "x", quantity: 12.5, location: "B-04" });
  });
});

describe("parseNum", () => {
  it("godtar komma, punktum og mellomrom", () => {
    expect(parseNum("12,5")).toBe(12.5);
    expect(parseNum("12.5")).toBe(12.5);
    expect(parseNum("1 000")).toBe(1000);
  });

  it("gir null på tomt og tull", () => {
    expect(parseNum("")).toBeNull();
    expect(parseNum("abc")).toBeNull();
  });
});

describe("qtyLabel", () => {
  it("viser enheten sammen med tallet", () => {
    expect(qtyLabel(12.5, "m")).toBe("12,5 m");
    expect(qtyLabel(3, "stk")).toBe("3 stk");
  });
});
