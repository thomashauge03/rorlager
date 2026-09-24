import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPickupCart,
  lesKunde,
  lesUtkast,
  pickupCartEks,
  pickupLineFromItem,
  readPickupCart,
  skrivKunde,
  skrivUtkast,
  slettUtkast,
  usePickupCart,
  writePickupCart,
  type PickupCartLine,
} from "@/lib/pickup-cart";
import { TOMT_SKJEMA } from "@/lib/pickup-form";
import type { CatalogItem } from "@/lib/types";

const linje = (over: Partial<PickupCartLine> = {}): PickupCartLine => ({
  pipe_type_id: "a",
  name: "PVC avløpsrør",
  dimension: "110 mm",
  sku: "PVC-110",
  unit: "m",
  price: 103.39,
  quantity: 12.5,
  ...over,
});

const vare = (over: Partial<CatalogItem> = {}) =>
  ({
    id: "a",
    name: "PVC avløpsrør",
    dimension: "110 mm",
    sku: "PVC-110",
    unit: "m",
    price: 100,
    ...over,
  }) as CatalogItem;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  clearPickupCart();
});

describe("kurva i localStorage", () => {
  it("overlever skriving og lesing", () => {
    writePickupCart([linje(), linje({ pipe_type_id: "b" })]);
    expect(readPickupCart()).toHaveLength(2);
  });

  it("kastar søppel i staden for å krasje", () => {
    localStorage.setItem("rorlager.bestilling.v1", "{ikkje json");
    expect(readPickupCart()).toEqual([]);
    localStorage.setItem(
      "rorlager.bestilling.v1",
      JSON.stringify([{ name: "utan id" }, linje({ price: null as unknown as number }), linje({ quantity: 0 }), linje()]),
    );
    expect(readPickupCart()).toHaveLength(1);
  });

  it("er skild frå uttakskurva", () => {
    writePickupCart([linje()]);
    expect(localStorage.getItem("rorlager.kurv.v1")).toBeNull();
  });
});

describe("pickupLineFromItem", () => {
  it("lagar ei linje med prisen, og rundar mengda til to desimalar", () => {
    expect(pickupLineFromItem(vare(), 2.346)).toMatchObject({ pipe_type_id: "a", price: 100, quantity: 2.35 });
  });

  it("gir null for ei vare utan pris – ho kan ikkje bestillast", () => {
    expect(pickupLineFromItem(vare({ price: null }), 1)).toBeNull();
  });
});

describe("pickupCartEks", () => {
  it("summerer linjene slik basen gjer", () => {
    expect(pickupCartEks([linje(), linje({ pipe_type_id: "b", price: 25, quantity: 4 })])).toBe(1392.38);
  });
});

describe("usePickupCart", () => {
  it("slår saman same vare i staden for to linjer", () => {
    const { result } = renderHook(() => usePickupCart());
    act(() => result.current.add(linje({ quantity: 2 })));
    act(() => result.current.add(linje({ quantity: 3.5 })));
    expect(result.current.lines).toHaveLength(1);
    expect(result.current.lines[0].quantity).toBe(5.5);
    expect(result.current.count).toBe(1);
  });

  it("set mengd, men fjernar aldri ei linje på 0", () => {
    const { result } = renderHook(() => usePickupCart());
    act(() => result.current.add(linje()));
    act(() => result.current.setQuantity("a", 0));
    expect(result.current.lines[0].quantity).toBe(12.5);
    act(() => result.current.remove("a"));
    expect(result.current.lines).toEqual([]);
  });
});

describe("kundeopplysningar og utkast", () => {
  it("hugsar kontaktopplysningane, men ikkje hentedag og kommentar", () => {
    skrivKunde({ ...TOMT_SKJEMA, kundetype: "privat", navn: "Ola", hentedag: "2026-10-01", kommentar: "hei" } as never);
    const k = lesKunde();
    expect(k.navn).toBe("Ola");
    expect("hentedag" in k).toBe(false);
    expect("kommentar" in k).toBe(false);
  });

  it("utkastet lever i økta og kan slettast", () => {
    skrivUtkast({ ...TOMT_SKJEMA, kommentar: "Ring før" });
    expect(lesUtkast().kommentar).toBe("Ring før");
    slettUtkast();
    expect(lesUtkast()).toEqual({});
  });

  it("eit øydelagt utkast gir tomt", () => {
    sessionStorage.setItem("rorlager.bestilling-utkast.v1", "{");
    expect(lesUtkast()).toEqual({});
  });
});
