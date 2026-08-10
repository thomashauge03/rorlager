import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { cartHasUnpriced, cartLineFromType, cartTotal, clearCart, readCart, useCart, writeCart } from "@/lib/cart";
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

describe("setQuantity fjerner aldri en linje", () => {
  // Talfeltet melder fra om 0 midt i tastingen – markerer man feltet og skriver
  // om att, kommer 0 før det nye tallet. Forsvant linja da, var mengden tapt.
  it("ignorerer 0 og negative verdier", () => {
    writeCart([line({ quantity: 30 })]);
    const { result } = renderHook(() => useCart());

    act(() => result.current.setQuantity("a", 0));
    expect(readCart()[0].quantity).toBe(30);

    act(() => result.current.setQuantity("a", -5));
    expect(readCart()[0].quantity).toBe(30);
  });

  it("setter mengden når den er et reelt tall", () => {
    writeCart([line({ quantity: 30 })]);
    const { result } = renderHook(() => useCart());

    act(() => result.current.setQuantity("a", 12.5));
    expect(readCart()[0].quantity).toBe(12.5);
  });

  it("lar søppelbøtta være eneste vei ut av kurven", () => {
    writeCart([line({ quantity: 30 })]);
    const { result } = renderHook(() => useCart());

    act(() => result.current.remove("a"));
    expect(readCart()).toEqual([]);
  });
});

describe("add slår sammen samme rørtype", () => {
  it("legger meterne oppå hverandre i stedet for å lage to linjer", () => {
    const { result } = renderHook(() => useCart());
    act(() => result.current.add(line({ quantity: 10 })));
    act(() => result.current.add(line({ quantity: 5.5 })));

    const kurv = readCart();
    expect(kurv).toHaveLength(1);
    expect(kurv[0].quantity).toBe(15.5);
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
