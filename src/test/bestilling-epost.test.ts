import { describe, expect, it } from "vitest";
import { byggEpost, esc, type Bestilling, type Krav } from "../../supabase/functions/bestilling-epost/epost.ts";
import { sendKrav, type Utsending } from "../../supabase/functions/bestilling-epost/send.ts";

const APP = "https://rorlager.no";
const ID = "11111111-2222-3333-4444-555555555555";

const krav = (over: Partial<Bestilling> = {}): Krav => ({
  emails: [],
  order: {
    id: ID,
    order_number: 1042,
    created_at: "2026-09-24T10:00:00Z",
    status: "ny",
    pickup_date: "2026-10-02",
    pickup_now: false,
    customer_type: "privat",
    customer_name: "Ola <b>Privat</b>",
    customer_email: "ola@privat.no",
    customer_phone: "900 00 000",
    company: null,
    org_number: null,
    billing_address: "Bakkevegen 3, 5700 Voss",
    comment: "Ring meg <script>alert(1)</script>",
    customer_message: null,
    total: 1350,
    ...over,
  },
  lines: [
    { name: "PVC 110", dimension: null, sku: "B-110", unit: "m", quantity: 12.5, unit_price: 100, line_total: 1250, stock: 10 },
    { name: "Bend", dimension: null, sku: null, unit: "stk", quantity: 4, unit_price: 25, line_total: 100, stock: 6 },
  ],
  company: {
    name: "Hauge Maskin AS",
    org_number: "974760673",
    address: "Industrivegen 1, 5700 Voss",
    phone: "56 00 00 00",
    email: "post@hauge.no",
    pickup_note: "Åpent 07–15",
    vat_rate: 25,
    payment_terms_days: 14,
  },
});

const bedrift = { customer_type: "bedrift" as const, company: "Firma AS", org_number: "974760673", billing_address: null };

describe("esc", () => {
  it("kodar alt som kan tolkast som markering", () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});

describe("kvitteringa til kunden", () => {
  const e = byggEpost("kvittering", krav(), APP, "ola@privat.no")!;

  it("har emne med nummer og firma", () => {
    expect(e.subject).toBe("Bestilling nr. 1042 er mottatt – Hauge Maskin AS");
  });

  it("lenkjer til bestillinga på APP_URL", () => {
    expect(e.html).toContain(`${APP}/bestilling/${ID}`);
    expect(e.text).toContain(`${APP}/bestilling/${ID}`);
  });

  it("tek ikkje med namnet eller kommentaren – ingenting frå skjemaet", () => {
    expect(e.html).not.toContain("Ola");
    expect(e.text).not.toContain("Ola");
    expect(e.html).not.toContain("Ring meg");
    expect(e.text).not.toContain("Ring meg");
  });

  it("viser summen med mva for ein privatperson", () => {
    expect(e.html).toMatch(/1\s687,50/);
    expect(e.html).toContain("inkl. mva");
  });

  it("har angreretten og angreskjemaet for ein privatperson", () => {
    expect(e.html).toContain("14 dagers angrerett");
    expect(e.html).toContain("Angreskjema");
    expect(e.text).toContain("ANGRESKJEMA");
  });

  it("har ikkje angrerett for ei bedrift", () => {
    const b = byggEpost("kvittering", krav(bedrift), APP, "ola@privat.no")!;
    expect(b.html).not.toContain("angrerett");
    expect(b.html).toContain("eks. mva");
  });

  it("svar går til firmaet", () => {
    expect(e.replyTo).toBe("post@hauge.no");
  });
});

describe("varselet til kontoret", () => {
  it("seier kva dag bestillinga skal hentast", () => {
    expect(byggEpost("kontor", krav(), APP, "ordre@hauge.no")!.subject).toBe("Ny bestilling nr. 1042 – hentes fredag 2. oktober");
  });

  it("set «Henter nå» først i emnet", () => {
    expect(byggEpost("kontor", krav({ ...bedrift, pickup_now: true }), APP, "ordre@hauge.no")!.subject).toBe(
      "Henter nå: bestilling nr. 1042 – Firma AS",
    );
  });

  it("tek ikkje med linjeskift i emnet", () => {
    const e = byggEpost("kontor", krav({ ...bedrift, pickup_now: true, company: "Firma\nBcc: x@y.no" }), APP, "o@h.no")!;
    expect(e.subject).not.toMatch(/[\r\n]/);
  });

  it("har kommentaren, koda", () => {
    const e = byggEpost("kontor", krav(), APP, "ordre@hauge.no")!;
    expect(e.html).toContain("Ring meg &lt;script&gt;");
    expect(e.html).not.toContain("<script>");
  });

  it("åtvarar når lageret viser for lite", () => {
    expect(byggEpost("kontor", krav(), APP, "ordre@hauge.no")!.html).toContain("For lite på lager");
  });

  it("lenkjer til adminpanelet, og svar går til kunden", () => {
    const e = byggEpost("kontor", krav(), APP, "ordre@hauge.no")!;
    expect(e.html).toContain(`${APP}/admin?fane=bestillinger`);
    expect(e.replyTo).toBe("ola@privat.no");
  });
});

describe("klar og avvist", () => {
  it("«klar» har meldinga frå kontoret og er ordrestadfestinga", () => {
    const e = byggEpost("klar", krav({ status: "behandlet", customer_message: "Port <2>" }), APP, "ola@privat.no")!;
    expect(e.subject).toBe("Bestilling nr. 1042 er klar til henting – Hauge Maskin AS");
    expect(e.html).toContain("Port &lt;2&gt;");
    expect(e.html).toContain("ordrebekreftelsen");
    expect(e.html).toContain("14 dagers angrerett");
  });

  it("«klar» kodar namnet", () => {
    const html = byggEpost("klar", krav({ status: "behandlet" }), APP, "ola@privat.no")!.html;
    expect(html).toContain("Ola &lt;b&gt;Privat&lt;/b&gt;");
    expect(html).not.toContain("<b>Privat</b>");
  });

  it("«avvist» har grunngjevinga", () => {
    const e = byggEpost("avvist", krav({ status: "avvist", customer_message: "Utgått hos leverandøren" }), APP, "ola@privat.no")!;
    expect(e.subject).toBe("Bestilling nr. 1042 – vi kan dessverre ikke levere");
    expect(e.html).toContain("Utgått hos leverandøren");
    expect(e.text).toContain("Utgått hos leverandøren");
  });
});

describe("lenkjene", () => {
  it("peikar berre på APP_URL", () => {
    for (const type of ["kvittering", "kontor", "klar", "avvist"] as const) {
      const e = byggEpost(type, krav(), APP, "x@y.no")!;
      const lenkjer: string[] = e.html.match(/https?:\/\/[^"'\s<]+/g) ?? [];
      expect(lenkjer.every((l) => l.startsWith(APP))).toBe(true);
    }
  });

  it("tåler skråstrek på slutten av APP_URL", () => {
    expect(byggEpost("kvittering", krav(), `${APP}/`, "x@y.no")!.html).toContain(`${APP}/bestilling/${ID}`);
  });

  it("gir null utan bestilling", () => {
    expect(byggEpost("kvittering", { emails: [] }, APP, "x@y.no")).toBeNull();
  });
});

describe("fritekst frå kunden", () => {
  it("namnet blir éi linje, også i tekstdelen", () => {
    const e = byggEpost("klar", krav({ status: "behandlet", customer_name: "Ola\nKjøp billig på x.no" }), APP, "x@y.no")!;
    expect(e.text).toContain("Hei Ola Kjøp billig på x.no.");
    expect(e.text).not.toMatch(/Ola\r?\n/);
  });

  it("kommentaren står aldri i ei e-post til kunden", () => {
    for (const type of ["kvittering", "klar", "avvist"] as const) {
      const e = byggEpost(type, krav({ status: type === "avvist" ? "avvist" : "behandlet" }), APP, "x@y.no")!;
      expect(e.html).not.toContain("Ring meg");
      expect(e.text).not.toContain("Ring meg");
    }
  });

  it("varselet til kontoret går fram sjølv om kunden skreiv adressa feil", () => {
    const e = byggEpost("kontor", krav({ customer_email: "ola@privat.no." }), APP, "ordre@hauge.no")!;
    expect(e.replyTo).toBeUndefined();
    expect(e.html).not.toContain("mailto:");
    expect(e.html).toContain("ola@privat.no.");
  });
});

describe("sendinga", () => {
  const TO: Krav["emails"] = [
    { type: "kvittering", to: "ola@privat.no" },
    { type: "kontor", to: "ordre@hauge.no" },
  ];
  const medEposter = (emails: Krav["emails"]): Krav => ({ ...krav(), emails });

  function oppsett(over: Partial<Utsending> = {}) {
    const merkt: string[] = [];
    const sleppt: string[] = [];
    const logg: string[] = [];
    const u: Utsending = {
      send: async () => ({ ok: true, id: "re_1" }),
      merk: async (t) => {
        merkt.push(t);
        return true;
      },
      slepp: async (t) => {
        sleppt.push(t);
        return true;
      },
      logg: (...d) => {
        logg.push(d.map(String).join(" "));
      },
      ...over,
    };
    return { u, merkt, sleppt, logg };
  }

  it("sender alle og merkjer kvar som sendt", async () => {
    const { u, merkt, sleppt } = oppsett();
    expect(await sendKrav(medEposter(TO), APP, u)).toEqual({ sendt: ["kvittering", "kontor"], feilet: [] });
    expect(merkt).toEqual(["kvittering", "kontor"]);
    expect(sleppt).toEqual([]);
  });

  it("ei som feilar, blir sleppt og stoppar ikkje den neste", async () => {
    const { u, merkt, sleppt } = oppsett({
      send: async (m) => (m.to === "ola@privat.no" ? { ok: false, feil: "resend 500" } : { ok: true, id: "re_2" }),
    });
    expect(await sendKrav(medEposter(TO), APP, u)).toEqual({ sendt: ["kontor"], feilet: ["kvittering"] });
    expect(sleppt).toEqual(["kvittering"]);
    expect(merkt).toEqual(["kontor"]);
  });

  it("eit kast i sendinga blir fanga", async () => {
    let n = 0;
    const { u, merkt, sleppt } = oppsett({
      send: async () => {
        if (n++ === 0) throw new Error("nettet er borte");
        return { ok: true, id: "re_3" };
      },
    });
    expect(await sendKrav(medEposter(TO), APP, u)).toEqual({ sendt: ["kontor"], feilet: ["kvittering"] });
    expect(sleppt).toEqual(["kvittering"]);
    expect(merkt).toEqual(["kontor"]);
  });

  it("går ikkje sleppinga, held løkka fram, og det blir logga", async () => {
    const { u, logg } = oppsett({
      send: async () => ({ ok: false, feil: "resend 500" }),
      slepp: async () => {
        throw new Error("basen svarar ikkje");
      },
    });
    expect(await sendKrav(medEposter(TO), APP, u)).toEqual({ sendt: [], feilet: ["kvittering", "kontor"] });
    expect(logg.filter((l) => l.includes("låsen")).length).toBe(2);
  });

  it("går e-posten, men ikkje merkinga, er ho sendt – og blir ikkje sleppt", async () => {
    const { u, sleppt, logg } = oppsett({ merk: async () => false });
    expect(await sendKrav(medEposter(TO), APP, u)).toEqual({ sendt: ["kvittering", "kontor"], feilet: [] });
    expect(sleppt).toEqual([]);
    expect(logg.filter((l) => l.includes("ikke merket")).length).toBe(2);
  });

  it("manglar kravet bestillinga, blir e-posten sleppt utan å sendast", async () => {
    let sendte = 0;
    const { u, sleppt } = oppsett({
      send: async () => {
        sendte++;
        return { ok: true };
      },
    });
    const r = await sendKrav({ emails: [{ type: "kvittering", to: "x@y.no" }] }, APP, u);
    expect(r).toEqual({ sendt: [], feilet: ["kvittering"] });
    expect(sendte).toBe(0);
    expect(sleppt).toEqual(["kvittering"]);
  });

  it("svaret frå Resend går berre til loggen", async () => {
    const { u, logg } = oppsett({ send: async () => ({ ok: false, feil: "resend 403 domain not verified" }) });
    const r = await sendKrav(medEposter(TO), APP, u);
    expect(JSON.stringify(r)).not.toContain("403");
    expect(logg.some((l) => l.includes("403"))).toBe(true);
  });
});
