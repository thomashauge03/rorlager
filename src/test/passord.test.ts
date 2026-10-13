import { describe, expect, it } from "vitest";
import { lagPassord, norskPassordFeil, sjekkNyttPassord, sjekkPassord } from "@/lib/passord";

describe("sjekkPassord", () => {
  it("godtek 8 teikn", () => expect(sjekkPassord("abcdefgh")).toBeNull());
  it("nektar 7", () => expect(sjekkPassord("abcdefg")).toMatch(/minst 8/));
  it("tel byte, ikkje teikn: 36 × ø er 72 byte og går", () => expect(sjekkPassord("ø".repeat(36))).toBeNull());
  it("37 × ø er 74 byte og går ikkje", () => expect(sjekkPassord("ø".repeat(37))).toMatch(/for langt/));
});

describe("sjekkNyttPassord", () => {
  it("godtek to like", () => expect(sjekkNyttPassord("langtpassord", "langtpassord")).toBeNull());
  it("seier frå om ulike", () => expect(sjekkNyttPassord("langtpassord", "langtpassorD")).toMatch(/ikke like/));
  it("lengda blir sjekka før likskapen", () => expect(sjekkNyttPassord("kort", "annet")).toMatch(/nye passordet.*minst 8/));
});

describe("norskPassordFeil", () => {
  it("same_password", () =>
    expect(norskPassordFeil({ code: "same_password", message: "x" })).toMatch(/annet passord enn det du fikk/));
  it("same_password berre på tekst", () =>
    expect(norskPassordFeil({ message: "New password should be different from the old password." })).toMatch(
      /annet passord/,
    ));
  it("weak_password", () => expect(norskPassordFeil({ code: "weak_password" })).toMatch(/for svakt/));
  it("nettverk", () => expect(norskPassordFeil({ message: "Failed to fetch" })).toMatch(/kontakt/));
  it("alt anna", () => expect(norskPassordFeil(null)).toMatch(/Prøv igjen/));
});

describe("lagPassord", () => {
  it("tre klumper à fem frå alfabetet utan I, O, 0 og 1", () => {
    for (let i = 0; i < 50; i++) {
      const p = lagPassord();
      expect(p).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
      expect(sjekkPassord(p)).toBeNull();
    }
  });
  it("blir ulike", () => expect(new Set(Array.from({ length: 20 }, lagPassord)).size).toBe(20));
});
