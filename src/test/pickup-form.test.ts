import { describe, expect, it } from "vitest";
import { TOMT_SKJEMA, fakturaadresse, leggTilDager, osloIDag, sjekkSkjema, tilInnsending, type KasseSkjema } from "@/lib/pickup-form";

const I_DAG = "2026-09-24";
const O = { kreverTelefon: true, iDag: I_DAG };

const privat = (over: Partial<KasseSkjema> = {}): KasseSkjema => ({
  ...TOMT_SKJEMA,
  kundetype: "privat",
  navn: "Ola Privat",
  epost: "ola@privat.no",
  telefon: "900 00 000",
  gate: "Bakkevegen 3",
  postnr: "5700",
  sted: "Voss",
  henterNaa: false,
  hentedag: "2026-09-30",
  ...over,
});

const bedrift = (over: Partial<KasseSkjema> = {}): KasseSkjema => ({
  ...privat(),
  kundetype: "bedrift",
  firma: "Firma AS",
  orgnr: "974 760 673",
  ...over,
});

describe("osloIDag og leggTilDager", () => {
  it("gir norsk dato, ikkje UTC", () => {
    // 22:30 UTC i september er 00:30 neste dag i Noreg
    expect(osloIDag(new Date("2026-09-24T22:30:00Z"))).toBe("2026-09-25");
    expect(osloIDag(new Date("2026-01-10T23:30:00Z"))).toBe("2026-01-11");
  });

  it("legg til dagar over månadsskifte", () => {
    expect(leggTilDager("2026-09-24", 90)).toBe("2026-12-23");
    expect(leggTilDager("2026-09-24", -1)).toBe("2026-09-23");
  });
});

describe("sjekkSkjema", () => {
  it("godtek eit fullt utfylt skjema", () => {
    expect(sjekkSkjema(privat(), O)).toBeNull();
    expect(sjekkSkjema(bedrift(), O)).toBeNull();
    expect(sjekkSkjema(privat({ henterNaa: true, hentedag: "" }), O)).toBeNull();
  });

  it("spør først om når, så om kven – i same rekkjefølgje som skjemaet", () => {
    expect(sjekkSkjema(TOMT_SKJEMA, O)?.felt).toBe("henterNaa");
    expect(sjekkSkjema({ ...TOMT_SKJEMA, henterNaa: true }, O)?.felt).toBe("kundetype");
  });

  it("krev ein hentedag frå i dag og høgst 90 dagar fram", () => {
    expect(sjekkSkjema(privat({ hentedag: "" }), O)?.melding).toBe("Velg hvilken dag du vil hente");
    expect(sjekkSkjema(privat({ hentedag: "2026-09-23" }), O)?.melding).toBe("Hentedagen kan ikke være tilbake i tid");
    expect(sjekkSkjema(privat({ hentedag: I_DAG }), O)).toBeNull();
    expect(sjekkSkjema(privat({ hentedag: "2026-12-23" }), O)).toBeNull();
    expect(sjekkSkjema(privat({ hentedag: "2026-12-24" }), O)?.melding).toBe("Hentedagen kan være høyst 90 dager fram");
  });

  it("krev firma og gyldig org.nr. for bedrift", () => {
    expect(sjekkSkjema(bedrift({ firma: " " }), O)?.felt).toBe("firma");
    expect(sjekkSkjema(bedrift({ orgnr: "974760674" }), O)?.melding).toBe("Organisasjonsnummeret er ikke gyldig");
  });

  it("kallar namnet kontaktperson for bedrift", () => {
    expect(sjekkSkjema(bedrift({ navn: "" }), O)?.melding).toBe("Kontaktperson må fylles ut");
    expect(sjekkSkjema(privat({ navn: "" }), O)?.melding).toBe("Navn må fylles ut");
  });

  it("krev fakturaadresse for privatperson, med firesifra postnummer", () => {
    expect(sjekkSkjema(privat({ gate: "" }), O)?.felt).toBe("gate");
    expect(sjekkSkjema(privat({ postnr: "570" }), O)?.melding).toBe("Postnummeret skal ha fire siffer");
    expect(sjekkSkjema(privat({ sted: "" }), O)?.felt).toBe("sted");
  });

  it("krev telefon berre når innstillinga seier det", () => {
    expect(sjekkSkjema(privat({ telefon: "" }), O)?.felt).toBe("telefon");
    expect(sjekkSkjema(privat({ telefon: "" }), { ...O, kreverTelefon: false })).toBeNull();
  });

  it("krev e-post som ser ut som ei adresse", () => {
    expect(sjekkSkjema(privat({ epost: "" }), O)?.melding).toBe("E-post må fylles ut");
    expect(sjekkSkjema(privat({ epost: "ola.privat.no" }), O)?.melding).toBe("E-postadressen ser ikke riktig ut");
  });

  it("godtek berre ei vanleg, heil adresse – same mønster som basen og e-postfunksjonen", () => {
    for (const epost of [
      "ola@privat.no.",
      "<offer@x.no>",
      "a<offer@x.no>",
      `"x"<offer@x.no>`,
      "ola..hansen@x.no",
      "ola@privat.no,",
      ".ola@x.no",
      `${"a".repeat(245)}@privat.no`,
    ]) {
      expect(sjekkSkjema(privat({ epost }), O)?.melding, epost).toBe("E-postadressen ser ikke riktig ut");
    }
    for (const epost of ["ola@privat.no", "Ola.Hansen+bestilling@firma-navn.no", "o_la@sub.domene.com"]) {
      expect(sjekkSkjema(privat({ epost }), O), epost).toBeNull();
    }
  });

  it("stoppar for lange felt med same grenser som basen", () => {
    expect(sjekkSkjema(privat({ navn: "x".repeat(101) }), O)?.felt).toBe("navn");
    expect(sjekkSkjema(bedrift({ firma: "x".repeat(121) }), O)?.felt).toBe("firma");
    expect(sjekkSkjema(privat({ kommentar: "x".repeat(1001) }), O)?.felt).toBe("kommentar");
  });
});

describe("fakturaadresse og tilInnsending", () => {
  it("set saman adressa på éi linje", () => {
    expect(fakturaadresse({ gate: " Bakkevegen 3 ", postnr: "5700", sted: "Voss " })).toBe("Bakkevegen 3, 5700 Voss");
  });

  it("sender adresse for privatperson og ikkje firma", () => {
    const i = tilInnsending(privat({ firma: "Rest", orgnr: "123" }), [{ pipe_type_id: "a", quantity: 2 }], I_DAG);
    expect(i).toMatchObject({
      customer_type: "privat",
      company: null,
      org_number: null,
      billing_address: "Bakkevegen 3, 5700 Voss",
      pickup_now: false,
      pickup_date: "2026-09-30",
    });
    expect(i.lines).toEqual([{ pipe_type_id: "a", quantity: 2 }]);
  });

  it("sender firma og org.nr. utan mellomrom for bedrift, og ikkje adresse", () => {
    const i = tilInnsending(bedrift(), [], I_DAG);
    expect(i).toMatchObject({ customer_type: "bedrift", company: "Firma AS", org_number: "974760673", billing_address: null });
  });

  it("«henter nå» sender dagens dato", () => {
    expect(tilInnsending(privat({ henterNaa: true, hentedag: "" }), [], I_DAG)).toMatchObject({
      pickup_now: true,
      pickup_date: I_DAG,
    });
  });

  it("tomme valfrie felt blir null", () => {
    expect(tilInnsending(privat({ telefon: " ", kommentar: "" }), [], I_DAG)).toMatchObject({
      customer_phone: null,
      comment: null,
    });
  });
});
