import { describe, expect, it } from "vitest";
import { fakturadetaljar, fakturakunde, nameKey } from "@/lib/fakturakunde";

type Ordre = Parameters<typeof fakturakunde>[0];

const uttak = (over: Partial<Ordre> = {}): Ordre => ({
  kind: "uttak",
  customer_type: null,
  customer_name: "  Ola   Nordmann ",
  company: null,
  org_number: null,
  billing_address: null,
  ...over,
});

const bedrift = (over: Partial<Ordre> = {}): Ordre => ({
  kind: "bestilling",
  customer_type: "bedrift",
  customer_name: "Kari Kontakt",
  company: "Firma AS",
  org_number: "974760673",
  billing_address: null,
  ...over,
});

const privat = (over: Partial<Ordre> = {}): Ordre => ({
  kind: "bestilling",
  customer_type: "privat",
  customer_name: "Ola Nordmann",
  company: null,
  org_number: null,
  billing_address: "Bakkevegen 3, 5700 Voss",
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
});

describe("fakturadetaljar", () => {
  it("tek med detaljane frå alle bestillingane, kvar éin gong", () => {
    expect(fakturadetaljar([bedrift(), uttak({ customer_name: "Firma AS" }), bedrift()])).toEqual([
      "Org.nr. 974 760 673",
    ]);
    expect(fakturadetaljar([uttak()])).toEqual([]);
  });
});
