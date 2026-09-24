import { describe, expect, it } from "vitest";
import { gyldigOrgnr, vaskOrgnr, visOrgnr } from "@/lib/orgnr";

describe("gyldigOrgnr", () => {
  it("godtek ekte nummer", () => {
    expect(gyldigOrgnr("974760673")).toBe(true);
    expect(gyldigOrgnr("923609016")).toBe(true);
  });

  it("godtek mellomrom", () => {
    expect(gyldigOrgnr("974 760 673")).toBe(true);
  });

  it("rest 0 gir kontrollsiffer 0", () => {
    expect(gyldigOrgnr("900000030")).toBe(true);
  });

  it("avviser feil kontrollsiffer", () => {
    expect(gyldigOrgnr("974760674")).toBe(false);
  });

  it("kontrollsiffer 10 finst ikkje – då er nummeret ugyldig uansett siste siffer", () => {
    for (let d = 0; d <= 9; d++) expect(gyldigOrgnr(`90000009${d}`)).toBe(false);
  });

  it("krev ni siffer som startar på 8 eller 9", () => {
    expect(gyldigOrgnr("97476067")).toBe(false);
    expect(gyldigOrgnr("174760673")).toBe(false);
    expect(gyldigOrgnr("abc")).toBe(false);
    expect(gyldigOrgnr("")).toBe(false);
  });
});

describe("vaskOrgnr og visOrgnr", () => {
  it("tek bort mellomrom", () => {
    expect(vaskOrgnr(" 974 760\t673 ")).toBe("974760673");
  });

  it("grupperer i tre, slik Brønnøysund skriv nummeret", () => {
    expect(visOrgnr("974760673")).toBe("974 760 673");
  });

  it("lèt alt anna stå som det er", () => {
    expect(visOrgnr("12")).toBe("12");
    expect(visOrgnr(null)).toBe("");
  });
});
