import { describe, expect, it } from "vitest";
import { erAnsattUttak, fakturadetaljar, fakturakunde, nameKey } from "@/lib/fakturakunde";

type Ordre = Parameters<typeof fakturakunde>[0];

const uttak = (over: Partial<Ordre> = {}): Ordre => ({
  kind: "uttak",
  customer_type: null,
  customer_name: "  Ola   Nordmann ",
  company: null,
  org_number: null,
  billing_address: null,
  project: null,
  created_by: null,
  ...over,
});

const bedrift = (over: Partial<Ordre> = {}): Ordre => ({
  kind: "bestilling",
  customer_type: "bedrift",
  customer_name: "Kari Kontakt",
  company: "Firma AS",
  org_number: "974760673",
  billing_address: null,
  project: null,
  created_by: null,
  ...over,
});

const privat = (over: Partial<Ordre> = {}): Ordre => ({
  kind: "bestilling",
  customer_type: "privat",
  customer_name: "Ola Nordmann",
  company: null,
  org_number: null,
  billing_address: "Bakkevegen 3, 5700 Voss",
  project: null,
  created_by: null,
  ...over,
});

/** Eit uttak frå ein tilsett som er logga inn: registrert på brukaren, til ein jobb. */
const ansatt = (over: Partial<Ordre> = {}): Ordre =>
  uttak({
    customer_name: "Leif Lager",
    created_by: "55555555-5555-5555-5555-555555555555",
    project: "Byggefelt Vest, tomt 4",
    ...over,
  });

describe("fakturakunde", () => {
  it("eit uttak blir gruppert på namnet, som før", () => {
    expect(fakturakunde(uttak())).toEqual({
      key: nameKey("  Ola   Nordmann "),
      namn: "  Ola   Nordmann ",
      detaljar: [],
    });
    expect(nameKey("  Ola   Nordmann ")).toBe("ola nordmann");
  });

  it("utan kind (før migrasjonen) er alt uttak", () => {
    expect(fakturakunde(uttak({ kind: undefined })).key).toBe("ola nordmann");
  });

  it("ei bestilling frå ei bedrift går på firmaet, med org.nr.", () => {
    expect(fakturakunde(bedrift())).toEqual({
      key: "firma as",
      namn: "Firma AS",
      detaljar: ["Org.nr. 974 760 673"],
    });
  });

  it("ei bedrift og eit uttak med same firmanamn møtest i éin kunde", () => {
    expect(fakturakunde(bedrift()).key).toBe(fakturakunde(uttak({ customer_name: "firma  AS" })).key);
  });

  it("to privatpersonar med same namn og ulik adresse blir aldri slått saman", () => {
    const a = fakturakunde(privat());
    const b = fakturakunde(privat({ billing_address: "Storgata 1, 0155 Oslo" }));
    expect(a.key).not.toBe(b.key);
    expect(a.namn).toBe(b.namn);
    expect(a.detaljar).toEqual(["Fakturaadresse: Bakkevegen 3, 5700 Voss"]);
  });

  it("ein privatperson deler ikkje kunde med eit uttak med same namn", () => {
    expect(fakturakunde(privat()).key).not.toBe(fakturakunde(uttak({ customer_name: "Ola Nordmann" })).key);
  });

  it("eit uttak frå ein tilsett går på jobben, med kven som tok ut", () => {
    expect(fakturakunde(ansatt())).toEqual({
      key: "jobb:byggefelt vest, tomt 4",
      namn: "Byggefelt Vest, tomt 4",
      detaljar: ["Tatt ut av Leif Lager"],
    });
  });

  it("to tilsette på same jobb havnar på same grunnlag", () => {
    expect(fakturakunde(ansatt()).key).toBe(
      fakturakunde(ansatt({ customer_name: "Kari Nordmann", project: "byggefelt  Vest, tomt 4" })).key,
    );
  });

  it("ein jobb deler ikkje kunde med ein kiosk-kunde med same namn", () => {
    expect(fakturakunde(ansatt()).key).not.toBe(fakturakunde(uttak({ customer_name: "Byggefelt Vest, tomt 4" })).key);
  });

  it("utan jobb står uttaket på den tilsette", () => {
    expect(fakturakunde(ansatt({ project: null })).namn).toBe("Leif Lager");
  });
});

describe("erAnsattUttak", () => {
  it("kjenner att eit uttak frå ein innlogga tilsett", () => {
    expect(erAnsattUttak(ansatt())).toBe(true);
    expect(erAnsattUttak(uttak())).toBe(false);
    expect(erAnsattUttak(uttak({ created_by: undefined }))).toBe(false);
    expect(erAnsattUttak(bedrift({ created_by: "55555555-5555-5555-5555-555555555555" }))).toBe(false);
  });
});

describe("fakturadetaljar", () => {
  it("tek med detaljane frå alle bestillingane, kvar éin gong", () => {
    expect(fakturadetaljar([bedrift(), uttak({ customer_name: "Firma AS" }), bedrift()])).toEqual([
      "Org.nr. 974 760 673",
    ]);
    expect(fakturadetaljar([uttak()])).toEqual([]);
  });

  it("viser alle som tok ut til same jobb", () => {
    expect(fakturadetaljar([ansatt(), ansatt({ customer_name: "Kari Nordmann" }), ansatt()])).toEqual([
      "Tatt ut av Leif Lager",
      "Tatt ut av Kari Nordmann",
    ]);
  });
});
