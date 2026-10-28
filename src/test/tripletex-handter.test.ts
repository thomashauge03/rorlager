// tripletex-ordre mot ein falsk base og eit falskt Tripletex. Ingenting her
// forlèt maskina – det finst ikkje noko testselskap hos Tripletex.

import { describe, expect, it } from "vitest";
import { handter, lesPdf, LINJETEKST, rensFilnavn, VEDLEGG_MAKS_BYTE } from "../../supabase/functions/tripletex-ordre/handter.ts";

const INV = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const KO = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PDF = btoa("%PDF-1.4 grunnlag");

/**
 * Kvar Tripletex-adresse funksjonen har lov å kalle, med metode. Ein ny adresse
 * må nokon ha bestemt seg for – og ingen av dei fakturerer eller sender.
 */
const TILLATT: RegExp[] = [
  /^POST https:\/\/tripletex\.no\/v2\/token\/session\/:createFromRefreshToken$/,
  /^GET https:\/\/tripletex\.no\/v2\/customer\?fields=id,customerNumber,organizationNumber,isInactive&from=\d+&count=1000$/,
  /^GET https:\/\/tripletex\.no\/v2\/product\?fields=id,number,isInactive&from=\d+&count=1000$/,
  /^POST https:\/\/tripletex\.no\/v2\/order$/,
  /^PUT https:\/\/tripletex\.no\/v2\/order\/\d+\/:attach\?addToInvoiceMode=NEXT&addToOrderMode=NONE$/,
];

type Kall = { metode: string; url: string; kropp: unknown };

const radTeken = (over: Record<string, unknown> = {}) => ({
  ko_id: KO,
  grunnlag_nr: 42,
  total: 1234.5,
  periode_fra: "2026-10-01",
  periode_til: "2026-10-27",
  laget: "2026-10-28",
  notat: null,
  intern: false,
  orgnr: ["987654321"],
  kundenr: null,
  produkt_nr: "5000",
  forfall_dagar: 14,
  ...over,
});

function oppsett(o: {
  kontor?: boolean;
  ta?: unknown;
  ordre?: { status: number; kropp?: unknown };
  vedlegg?: { status: number };
  kundar?: unknown[];
  utfallOk?: boolean;
} = {}) {
  const kall: Kall[] = [];
  const rpc: { namn: string; args: Record<string, unknown> }[] = [];
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

  const hent = (async (inn: RequestInfo | URL, init?: RequestInit) => {
    const url = String(inn);
    const metode = init?.method ?? "GET";
    const kropp = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
    kall.push({ metode, url, kropp });

    if (url.startsWith("https://db.test/rest/v1/rpc/")) {
      const namn = url.split("/").pop()!;
      rpc.push({ namn, args: kropp as Record<string, unknown> });
      if (namn === "hm_er_kontor") return json(o.kontor ?? true);
      if (namn === "pipe_tripletex_ta") return json(o.ta ?? radTeken());
      if (namn === "pipe_tripletex_utfall") return json(o.utfallOk ?? true);
      if (namn === "pipe_tripletex_vedlegg_ta") return json({ ko_id: KO, ordre_id: 777, arva: false });
      if (namn === "pipe_tripletex_vedlegg_utfall") return json(true);
      if (namn === "pipe_tripletex_hugs_kunde") return json(null);
      return json({ message: "ukjent rpc" }, 404);
    }
    if (url === "https://db.test/auth/v1/user") return json({ email: "kari@hauge.no" });

    if (url.includes("/token/session/")) return json({ value: { token: "sesjon" } });
    if (url.includes("/v2/customer?")) {
      return json({
        values: o.kundar ?? [
          { id: 9001, customerNumber: 10001, organizationNumber: "987 654 321", isInactive: false },
          { id: 9002, customerNumber: 10002, organizationNumber: "111222333", isInactive: false },
          { id: 9003, customerNumber: 30001, organizationNumber: "", isInactive: false },
          { id: 9004, customerNumber: 10004, organizationNumber: "987654321", isInactive: true },
        ],
      });
    }
    if (url.includes("/v2/product?")) return json({ values: [{ id: 5555, number: "5000", isInactive: false }, { id: 5556, number: "5001" }] });
    if (url.endsWith("/v2/order")) return json(o.ordre?.kropp ?? { value: { id: 777 } }, o.ordre?.status ?? 201);
    if (url.includes("/:attach")) return json({}, o.vedlegg?.status ?? 200);
    return json({}, 404);
  }) as typeof fetch;

  const env = (n: string) =>
    ({ SUPABASE_URL: "https://db.test", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "teneste", TRIPLETEX_NOKKEL: "nokkel" })[n];

  const send = (kropp: Record<string, unknown>, miljo: (n: string) => string | undefined = env) =>
    handter(
      new Request("https://fn.test", { method: "POST", headers: { Authorization: "Bearer brukar" }, body: JSON.stringify(kropp) }),
      miljo,
      { hent, token: { nokkel: null, token: null }, vent: async () => {} },
    ).then(async (r) => ({ status: r.status, data: (await r.json()) as Record<string, unknown> }));

  const tripletex = () => kall.filter((k) => k.url.startsWith("https://tripletex.no"));
  const ordrar = () => tripletex().filter((k) => k.url.endsWith("/v2/order"));
  const utfall = () => rpc.filter((r) => r.namn === "pipe_tripletex_utfall").map((r) => r.args);

  return { kall, rpc, send, tripletex, ordrar, utfall };
}

const vanleg = { invoice_id: INV, pdf: PDF, filnavn: "fakturagrunnlag_42_Bygg_AS.pdf", kunde_nokkel: "bygg as" };

describe("tripletex-ordre", () => {
  it("lagar éin ordre med éi linje «Pris ihht vedlegg» og legg PDF-en ved", async () => {
    const f = oppsett();
    const r = await f.send(vanleg);

    expect(r.data).toEqual({ sendt: true, ordreId: 777, vedlegg: { status: "lagt_ved" } });
    expect(f.ordrar()).toHaveLength(1);
    expect(f.ordrar()[0].kropp).toEqual({
      customer: { id: 9001 },
      orderDate: "2026-10-28",
      deliveryDate: "2026-10-27",
      invoicesDueIn: 14,
      invoicesDueInType: "DAYS",
      internalComment: "Fra rørlageret: fakturagrunnlag nr. 42, 01.10.2026–27.10.2026.",
      invoiceComment: "Fakturagrunnlag nr. 42, 01.10.2026–27.10.2026. Se vedlegg.",
      isPrioritizeAmountsIncludingVat: false,
      orderLines: [
        { product: { id: 5555 }, description: LINJETEKST, count: 1, unitPriceExcludingVatCurrency: 1234.5, vatType: { id: 3 } },
      ],
    });
    expect(LINJETEKST).toBe("Pris ihht vedlegg");
    expect(f.utfall()).toEqual([{ p_ko_id: KO, p_status: "sendt", p_ordre_id: 777, p_feil: null }]);

    const vedlegg = f.tripletex().find((k) => k.url.includes(":attach"))!;
    expect(vedlegg.metode).toBe("PUT");
    expect(vedlegg.url).toContain("/order/777/:attach?addToInvoiceMode=NEXT&addToOrderMode=NONE");
    const fil = (vedlegg.kropp as FormData).get("file") as File;
    expect(fil.name).toBe("fakturagrunnlag_42_Bygg_AS.pdf");
    expect(fil.size).toBe("%PDF-1.4 grunnlag".length);
    expect(f.rpc.find((x) => x.namn === "pipe_tripletex_vedlegg_utfall")?.args).toEqual({ p_ko_id: KO, p_status: "lagt_ved" });
  });

  it("kallar berre adresser på tillatingslista, og aldri noko som fakturerer eller sender", async () => {
    const f = oppsett();
    await f.send({ ...vanleg, kundenr: 10002 });
    await f.send({ handling: "vedlegg", invoice_id: INV, pdf: PDF });
    for (const k of f.tripletex()) {
      const linje = `${k.metode} ${k.url}`;
      expect(TILLATT.some((m) => m.test(linje)), linje).toBe(true);
      expect(new URL(k.url).pathname).not.toMatch(/invoice|:send|sendToCustomer/i);
    }
  });

  it("berre kontoret kjem inn, og ingenting anna blir kalla", async () => {
    const f = oppsett({ kontor: false });
    const r = await f.send(vanleg);
    expect(r.status).toBe(403);
    expect(f.rpc.map((x) => x.namn)).toEqual(["hm_er_kontor"]);
    expect(f.tripletex()).toHaveLength(0);
  });

  it("utan nøkkel blir ingenting teke eller sendt", async () => {
    const f = oppsett();
    const r = await f.send(vanleg, (n) => (n === "TRIPLETEX_NOKKEL" ? undefined : { SUPABASE_URL: "https://db.test", SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s" }[n]));
    expect(r.data.grunn).toBe("ikke satt opp");
    expect(f.rpc.some((x) => x.namn === "pipe_tripletex_ta")).toBe(false);
  });

  it("ein ugyldig PDF blir avvist før rada blir teken", async () => {
    const f = oppsett();
    const r = await f.send({ ...vanleg, pdf: btoa("ikkje ein pdf") });
    expect(r.status).toBe(400);
    expect(f.rpc.some((x) => x.namn === "pipe_tripletex_ta")).toBe(false);
  });

  it("ordet frå basen går rett ut, og Tripletex blir ikkje kalla", async () => {
    const f = oppsett({ ta: { grunn: "overlapp", grunnlag: [12] } });
    const r = await f.send(vanleg);
    expect(r.data).toEqual({ sendt: false, grunn: "overlapp", grunnlag: [12] });
    expect(f.tripletex()).toHaveLength(0);
  });

  it("serverfeil på ordren blir ukjent_utfall, og blir ikkje prøvd på nytt", async () => {
    const f = oppsett({ ordre: { status: 500, kropp: { message: "Bygg AS, Storgata 1" } } });
    const r = await f.send(vanleg);
    expect(f.ordrar()).toHaveLength(1);
    expect(r.data.koStatus).toBe("ukjent_utfall");
    expect(f.utfall()[0].p_status).toBe("ukjent_utfall");
    // Svarteksten frå ein 5xx blir korkje lagra eller vist
    expect(JSON.stringify(f.utfall())).not.toContain("Storgata");
    expect(JSON.stringify(r.data)).not.toContain("Storgata");
  });

  it("ei avvising blir feilet: teksten frå Tripletex blir vist, men ikkje lagra", async () => {
    const f = oppsett({ ordre: { status: 422, kropp: { code: 15000, message: "Kunden Bygg AS er sperra" } } });
    const r = await f.send(vanleg);
    expect(r.data.koStatus).toBe("feilet");
    expect(r.data.tripletexTekst).toContain("sperra");
    expect(f.utfall()[0].p_feil).toBe("HTTP 422, Tripletex-kode 15000: Tripletex avviste ordren. Ingenting er opprettet.");
    expect(f.rpc.some((x) => x.namn === "pipe_tripletex_vedlegg_ta")).toBe(false);
  });

  it("utan org.nr. og utan kundenummer: mangler_kunde, og ingen ordre", async () => {
    const f = oppsett({ ta: radTeken({ orgnr: [] }) });
    const r = await f.send(vanleg);
    expect(r.data.grunn).toBe("mangler_kunde");
    expect(f.utfall()[0].p_status).toBe("mangler_kunde");
    expect(f.ordrar()).toHaveLength(0);
  });

  it("to aktive kundar med same org.nr.: ikkje gjett", async () => {
    const f = oppsett({
      kundar: [
        { id: 1, customerNumber: 1, organizationNumber: "987654321" },
        { id: 2, customerNumber: 2, organizationNumber: "987654321" },
      ],
    });
    const r = await f.send(vanleg);
    expect(r.data.grunn).toBe("mangler_kunde");
    expect(String(r.data.melding)).toMatch(/Flere kunder/);
    expect(f.ordrar()).toHaveLength(0);
  });

  it("eit innskrive kundenummer går føre org.nr., og blir hugsa etter at ordren finst", async () => {
    const f = oppsett();
    await f.send({ ...vanleg, kundenr: 10002 });
    expect((f.ordrar()[0].kropp as { customer: unknown }).customer).toEqual({ id: 9002 });
    expect(f.rpc.find((x) => x.namn === "pipe_tripletex_hugs_kunde")?.args).toEqual({
      p_nokkel: "bygg as",
      p_kundenr: 10002,
      p_av: "kari@hauge.no",
    });
  });

  it("eit kundenummer som ikkje finst, blir ikkje hugsa", async () => {
    const f = oppsett();
    const r = await f.send({ ...vanleg, kundenr: 424242 });
    expect(r.data.grunn).toBe("mangler_kunde");
    expect(f.rpc.some((x) => x.namn === "pipe_tripletex_hugs_kunde")).toBe(false);
  });

  it("internt: felleskontoen frå basen, og ikkje noko innskrive nummer", async () => {
    const f = oppsett({ ta: radTeken({ intern: true, kundenr: 30001, orgnr: [] }) });
    await f.send({ ...vanleg, intern: true, kundenr: 10002 });
    expect(f.rpc.find((x) => x.namn === "pipe_tripletex_ta")?.args.p_intern).toBe(true);
    expect((f.ordrar()[0].kropp as { customer: unknown }).customer).toEqual({ id: 9003 });
    expect(String((f.ordrar()[0].kropp as { internalComment: string }).internalComment)).toContain("internt uttak");
    expect(f.rpc.some((x) => x.namn === "pipe_tripletex_hugs_kunde")).toBe(false);
  });

  it("ordren finst sjølv om PDF-en er for stor: vedlegget blir feilet", async () => {
    const stor = btoa("%PDF-1") + "A".repeat(Math.ceil((VEDLEGG_MAKS_BYTE * 4) / 3) + 8);
    const f = oppsett();
    const r = await f.send({ ...vanleg, pdf: stor.slice(0, stor.length - (stor.length % 4)) });
    expect(r.data.sendt).toBe(true);
    expect((r.data.vedlegg as { status: string }).status).toBe("feilet");
    expect(f.tripletex().some((k) => k.url.includes(":attach"))).toBe(false);
  });

  it("ein serverfeil på vedlegget blir ukjent, ikkje feilet", async () => {
    const f = oppsett({ vedlegg: { status: 503 } });
    const r = await f.send(vanleg);
    expect(r.data.sendt).toBe(true);
    expect((r.data.vedlegg as { status: string }).status).toBe("ukjent");
  });

  it("ordren finst, men basen fekk ikkje vite det: seier det rett ut, og legg ikkje ved", async () => {
    const f = oppsett({ utfallOk: false });
    const r = await f.send(vanleg);
    expect(r.data).toMatchObject({ sendt: true, ordreId: 777, lagret: false });
    expect(String(r.data.melding)).toMatch(/Ikke send på nytt/);
    expect(f.tripletex().some((k) => k.url.includes(":attach"))).toBe(false);
  });
});

describe("PDF og filnamn", () => {
  it("PDF-en må vere base64 og byrje med %PDF-", () => {
    expect(lesPdf(PDF).ok).toBe(true);
    expect(lesPdf("ikkje base64!").ok).toBe(false);
    expect(lesPdf(btoa("<html>")).ok).toBe(false);
  });

  it("filnamnet blir ASCII og endar på .pdf", () => {
    expect(rensFilnavn("fakturagrunnlag_42_Ådneram_fjellpark_med_pris.pdf")).toBe("fakturagrunnlag_42_Adneram_fjellpark_med_pris.pdf");
    expect(rensFilnavn("Rør/Søppel")).toBe("Ror_Soppel.pdf");
    expect(rensFilnavn("../../")).toBe("fakturagrunnlag.pdf");
  });
});
