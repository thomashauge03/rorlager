import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ANNET_GRENSER, TOMT_ANNET, erAnnetId, sjekkAnnet, tilInnsendingslinje, type AnnetSkjema } from "@/lib/annet";
import { cartHasUnpriced, cartLineFromAnnet, cartTotal, clearCart, readCart, useCart, writeCart } from "@/lib/cart";
import {
  clearPickupCart,
  pickupCartEks,
  pickupLineFromAnnet,
  readPickupCart,
  usePickupCart,
  writePickupCart,
  type PickupCartLine,
} from "@/lib/pickup-cart";
import { tilInnsending, TOMT_SKJEMA } from "@/lib/pickup-form";

const skjema = (over: Partial<AnnetSkjema> = {}): AnnetSkjema => ({
  ...TOMT_ANNET,
  name: "PE-rør",
  dimension: "40 mm",
  quantity: 12.5,
  note: "Lå bak kummene",
  ...over,
});

beforeEach(() => {
  clearCart();
  clearPickupCart();
});

describe("sjekkAnnet", () => {
  it("godtar et utfylt skjema", () => {
    expect(sjekkAnnet(skjema())).toBeNull();
  });

  it("krever navn, og teller ikke mellomrom som navn", () => {
    expect(sjekkAnnet(skjema({ name: "   " }))).toBe("Skriv hva varen er");
  });

  it("krever en mengde over null", () => {
    expect(sjekkAnnet(skjema({ quantity: null }))).toBe("Skriv hvor mye");
    expect(sjekkAnnet(skjema({ quantity: 0 }))).toBe("Skriv hvor mye");
  });

  it("har de samme grensene som basen", () => {
    expect(sjekkAnnet(skjema({ name: "x".repeat(ANNET_GRENSER.namn + 1) }))).toMatch(/høyst 120 tegn/);
    expect(sjekkAnnet(skjema({ dimension: "x".repeat(ANNET_GRENSER.dimensjon + 1) }))).toMatch(/høyst 60 tegn/);
    expect(sjekkAnnet(skjema({ note: "x".repeat(ANNET_GRENSER.merknad + 1) }))).toMatch(/høyst 300 tegn/);
    expect(sjekkAnnet(skjema({ quantity: 100001 }))).toMatch(/urimelig/);
  });
});

describe("annet i uttakskurven", () => {
  it("blir en linje uten vare og uten pris, med vasket tekst", () => {
    const l = cartLineFromAnnet(skjema({ name: "  PE-rør ", dimension: "  ", note: "" }));
    expect(erAnnetId(l.pipe_type_id)).toBe(true);
    expect(l).toMatchObject({ name: "PE-rør", dimension: null, price: null, sku: null, annet: { note: null } });
  });

  it("to like annet-linjer slås ikke sammen", () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      result.current.add(cartLineFromAnnet(skjema()));
      result.current.add(cartLineFromAnnet(skjema()));
    });
    expect(result.current.lines).toHaveLength(2);
    expect(result.current.annetCount).toBe(2);
  });

  it("teller ikke i summen, og skjuler ikke summen for katalogvarene", () => {
    const vare = { pipe_type_id: "a", name: "PVC", dimension: null, sku: null, unit: "m", price: 100, quantity: 2, location: null };
    const lines = [vare, cartLineFromAnnet(skjema())];
    expect(cartTotal(lines)).toBe(200);
    expect(cartHasUnpriced(lines)).toBe(false);
    // En katalogvare uten pris gjør fortsatt summen ufullstendig
    expect(cartHasUnpriced([...lines, { ...vare, pipe_type_id: "b", price: null }])).toBe(true);
  });

  it("overlever lagring", () => {
    writeCart([cartLineFromAnnet(skjema())]);
    expect(readCart()[0].annet).toEqual({ note: "Lå bak kummene" });
  });
});

describe("annet i bestillingskurven", () => {
  it("er den eneste linja som får stå uten pris", () => {
    const annet = pickupLineFromAnnet(skjema());
    const utanPris: PickupCartLine = { ...annet, pipe_type_id: "x", annet: undefined };
    writePickupCart([annet, utanPris]);
    const lest = readPickupCart();
    expect(lest).toHaveLength(1);
    expect(lest[0].annet).toBeTruthy();
  });

  it("teller ikke i summen", () => {
    const vare: PickupCartLine = { pipe_type_id: "a", name: "PVC", dimension: null, sku: null, unit: "m", price: 100, quantity: 2 };
    expect(pickupCartEks([vare, pickupLineFromAnnet(skjema())])).toBe(200);
  });

  it("slås ikke sammen", () => {
    const { result } = renderHook(() => usePickupCart());
    act(() => {
      result.current.add(pickupLineFromAnnet(skjema()));
      result.current.add(pickupLineFromAnnet(skjema()));
    });
    expect(result.current.lines).toHaveLength(2);
  });
});

describe("innsendingen", () => {
  it("sender en katalogvare som id og mengde, og annet med egne ord", () => {
    const annet = cartLineFromAnnet(skjema({ unit: "stk", quantity: 3 }));
    expect(tilInnsendingslinje({ pipe_type_id: "a", quantity: 2 })).toEqual({ pipe_type_id: "a", quantity: 2 });
    expect(tilInnsendingslinje(annet)).toEqual({
      annet: { name: "PE-rør", dimension: "40 mm", unit: "stk", note: "Lå bak kummene" },
      quantity: 3,
    });
  });

  it("bestillingsskjemaet tar med annet-linjene", () => {
    const linjer = [
      { pipe_type_id: "a", name: "PVC", dimension: null, sku: null, unit: "m", price: 100, quantity: 2 },
      pickupLineFromAnnet(skjema()),
    ];
    const ut = tilInnsending({ ...TOMT_SKJEMA, navn: "Ola" }, linjer, "2026-10-13");
    expect(ut.lines).toEqual([
      { pipe_type_id: "a", quantity: 2 },
      { annet: { name: "PE-rør", dimension: "40 mm", unit: "m", note: "Lå bak kummene" }, quantity: 12.5 },
    ]);
  });
});
