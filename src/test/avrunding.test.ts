import { describe, expect, it } from "vitest";
import { previewPrice, rundPris } from "@/lib/orders";
import { avrundingTekst, prislinje, salsprisFraInnkjop } from "@/lib/prisoversikt";
import type { PipeType } from "@/lib/types";

// Same tal som scripts/db-test/avrunding.test.mjs, så appen og basen ikkje
// kan bli ueinige utan at ein test seier frå.
describe("rundPris – same som pipe_rund_pris", () => {
  it("rundar opp til hel krone, men ikkje eit tal som alt er rundt", () => {
    expect(rundPris(85.995, 1, true)).toBe(86);
    expect(rundPris(85.32, 1, true)).toBe(86);
    expect(rundPris(100 * 1.35, 1, true)).toBe(135); // flyttal: 135,00000000000003
  });

  it("næraste, trinn på 5 og øre", () => {
    expect(rundPris(85.32, 1, false)).toBe(85);
    expect(rundPris(85.32, 5, true)).toBe(90);
    expect(rundPris(85.32, 5, false)).toBe(85);
    expect(rundPris(17.685, 0.01, true)).toBe(17.69);
  });

  it("previewPrice tek retninga med", () => {
    expect(previewPrice(63.2, 35, 1, 1, true)).toBe(86);
    expect(previewPrice(63.2, 35, 1, 1, false)).toBe(85);
  });
});

describe("salsprisFraInnkjop", () => {
  it("bruker den lagra avrundinga", () => {
    expect(salsprisFraInnkjop(13.1, 35)).toBe(18);
    expect(salsprisFraInnkjop(13.1, 35, 1, { steg: 0.01, opp: false })).toBe(17.69);
    expect(salsprisFraInnkjop(13.1, 35, 1, { steg: 5, opp: true })).toBe(20);
  });
});

describe("prislinje", () => {
  const vare = (cost_price: number, price: number) =>
    ({ id: "v", name: "PE", dimension: null, cost_price, price, prishopp_faktor: 1, stock: 0, unit: "m", active: true }) as unknown as PipeType;

  it("ein pris runda opp tel som standard, og «Standard gir» fylgjer innstillinga", () => {
    const l = prislinje(vare(63.2, 86), 35, 25, { steg: 1, opp: true });
    expect(l.status).toBe("standard");
    expect(l.standardPris).toBe(86);
    expect(prislinje(vare(63.2, 85), 35, 25, { steg: 1, opp: true }).status).toBe("standard");
    expect(prislinje(vare(63.2, 86), 35, 25, { steg: 1, opp: false }).standardPris).toBe(85);
  });
});

describe("avrundingTekst", () => {
  it("les godt i ei setning", () => {
    expect(avrundingTekst({ steg: 1, opp: true })).toBe("opp til hel krone");
    expect(avrundingTekst({ steg: 5, opp: true })).toBe("opp til 5 kroner");
    expect(avrundingTekst({ steg: 1, opp: false })).toBe("nærmeste krone");
    expect(avrundingTekst({ steg: 0.01, opp: true })).toBe("øre");
  });
});
