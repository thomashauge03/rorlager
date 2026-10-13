import { describe, expect, it } from "vitest";
import { beskrivEndring } from "@/lib/revisjon";

describe("beskrivEndring", () => {
  it("frå → til på norsk, med desimalkomma", () => {
    expect(
      beskrivEndring({ handling: "endret", endringar: { price: { fra: 100, til: 112.5 }, cost_price: { fra: 60, til: 65 } } }),
    ).toBe("pris 100 → 112,5 · kostpris 60 → 65");
  });

  it("id-felt blir nemnde, ikkje viste som tal", () => {
    expect(beskrivEndring({ handling: "endret", endringar: { project_id: { fra: "a", til: "b" } } })).toBe("prosjekt (id) byttet");
  });

  it("fakturering og angring", () => {
    expect(beskrivEndring({ handling: "endret", endringar: { invoice_id: { fra: null, til: "x" } } })).toBe("fakturert");
    expect(beskrivEndring({ handling: "endret", endringar: { invoice_id: { fra: "x", til: null } } })).toBe("faktura angret");
  });

  it("slettet: verdiane som var der, utan id-felt", () => {
    expect(beskrivEndring({ handling: "slettet", endringar: { order_number: 42, status: "ny", project_id: "p" } })).toBe(
      "nr. 42 · status ny",
    );
  });

  it("ja/nei for brytarar", () => {
    expect(beskrivEndring({ handling: "endret", endringar: { active: { fra: true, til: false } } })).toBe("aktiv ja → nei");
  });
});
