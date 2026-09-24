import { describe, expect, it } from "vitest";
import { ANGRERETT_KORT, angreskjema, angrerettAvsnitt, angrerettSomTekst, selgerFra, vilkarAvsnitt } from "@/lib/vilkar";

const S = {
  navn: "Hauge Maskin AS",
  orgnr: "974760673",
  adresse: "Industrivegen 1, 5700 Voss",
  epost: "post@hauge.no",
  telefon: "56 00 00 00",
  betalingsfrist: 14,
  henteinfo: "Lageret er åpent 07–15 på hverdager.",
};

const tekst = (tittel: string, s = S) => vilkarAvsnitt(s).find((a) => a.tittel === tittel)?.tekst.join(" ") ?? "";

describe("vilkåra", () => {
  it("har avsnitta i fast rekkjefølgje", () => {
    expect(vilkarAvsnitt(S).map((a) => a.tittel)).toEqual([
      "Selger",
      "Bestillingen",
      "Priser",
      "Betaling",
      "Henting",
      "Angrerett",
      "Reklamasjon",
      "Personopplysninger",
      "Tvister",
    ]);
  });

  it("namngir seljaren med org.nr., adresse og kontakt", () => {
    const t = tekst("Selger");
    expect(t).toContain("Hauge Maskin AS");
    expect(t).toContain("974760673");
    expect(t).toContain("Industrivegen 1");
    expect(t).toContain("post@hauge.no");
    expect(t).toContain("56 00 00 00");
  });

  it("brukar betalingsfristen frå innstillingane", () => {
    expect(tekst("Betaling", { ...S, betalingsfrist: 30 })).toContain("30 dager");
  });

  it("tek med henteinfo når ho finst, og hoppar over når ho ikkje gjer", () => {
    expect(tekst("Henting")).toContain("07–15");
    expect(vilkarAvsnitt({ ...S, henteinfo: " " }).find((a) => a.tittel === "Henting")?.tekst).toHaveLength(2);
  });

  it("seier at avtalen er bindande først ved stadfesting", () => {
    expect(tekst("Bestillingen")).toContain("«Klar til henting»");
  });

  it("gir fem års reklamasjon på rør i bakken", () => {
    expect(tekst("Reklamasjon")).toContain("fem år");
  });
});

describe("angreretten", () => {
  it("er 14 dagar frå henting", () => {
    const t = angrerettAvsnitt(S).tekst.join(" ");
    expect(t).toContain("14 dagers angrerett");
    expect(t).toContain("fra dagen du henter");
  });

  it("seier at kappa rør er unntatt", () => {
    expect(angrerettAvsnitt(S).tekst.join(" ")).toContain("§ 22");
  });

  it("den korte versjonen i kassen seier det same", () => {
    const k = ANGRERETT_KORT.join(" ");
    expect(k).toContain("14 dagers angrerett");
    expect(k).toContain("kapper");
  });
});

describe("angreskjemaet", () => {
  it("er adressert til seljaren", () => {
    expect(angreskjema(S).felt[0]).toBe("Til: Hauge Maskin AS, Industrivegen 1, 5700 Voss, post@hauge.no");
  });

  it("kjem med i tekstversjonen til e-posten", () => {
    const t = angrerettSomTekst(S);
    expect(t).toContain("ANGRESKJEMA");
    expect(t).toContain("Forbrukerens navn");
    expect(t).toContain("(*) Stryk det som ikke gjelder.");
  });
});

describe("selgerFra", () => {
  it("les firmaet og fristen frå innstillingane", () => {
    const s = selgerFra(
      { company_name: " Hauge Maskin AS ", org_number: "974760673", address: "Voss", email: "a@b.no", phone: "1", pickup_note: "Port 2" },
      { payment_terms_days: 30 },
    );
    expect(s).toEqual({
      navn: "Hauge Maskin AS",
      orgnr: "974760673",
      adresse: "Voss",
      epost: "a@b.no",
      telefon: "1",
      betalingsfrist: 30,
      henteinfo: "Port 2",
    });
  });

  it("fell tilbake på standardane når innstillingane manglar", () => {
    expect(selgerFra(undefined, undefined)).toMatchObject({ navn: "Hauge Maskin AS", betalingsfrist: 14 });
  });
});
