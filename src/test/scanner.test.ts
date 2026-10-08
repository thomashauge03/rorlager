import { describe, expect, it } from "vitest";
import { finnVare, kodeFraSkann, kodeFraSkannMedOppslag } from "@/lib/scanner";

describe("kodeFraSkann", () => {
  it("les QR-lenkja frå hylla, uansett vertsnamn", () => {
    expect(kodeFraSkann("https://rorlager.vercel.app/r/PVC-110")).toBe("pvc-110");
    expect(kodeFraSkann("http://localhost:8080/r/pvc-110?x=1")).toBe("pvc-110");
    expect(kodeFraSkann("https://gammalt-domene.no/vare/kob-32")).toBe("kob-32");
  });

  it("godtek ein naken kode og talet i ein strekkode", () => {
    expect(kodeFraSkann(" PVC-110 ")).toBe("pvc-110");
    expect(kodeFraSkann("7020512345678")).toBe("7020512345678");
    expect(kodeFraSkann("BD.99117")).toBe("bd.99117");
  });

  it("avviser det som ikkje høyrer til rørlageret", () => {
    expect(kodeFraSkann("")).toBeNull();
    expect(kodeFraSkann("https://example.com/noe/annet")).toBeNull();
    expect(kodeFraSkann("WIFI:S:gjestenett;T:WPA;P:hemmelig;;")).toBeNull();
  });

  it("krasjar ikkje på ei øydelagd lenkje", () => {
    expect(kodeFraSkann("https://x.no/r/%E0%A4%A")).toBe("%e0%a4%a");
  });
});

describe("finnVare", () => {
  const varer = [
    { id: "1", qr_slug: "pvc-110", sku: "3100501" },
    { id: "2", qr_slug: "kob-32", sku: "BD-99117" },
  ];

  it("finn vara på QR-koden først", () => {
    expect(finnVare("pvc-110", varer)?.id).toBe("1");
  });

  it("så på varenummeret, utan omsyn til store bokstavar", () => {
    expect(finnVare("3100501", varer)?.id).toBe("1");
    expect(finnVare("bd-99117", varer)?.id).toBe("2");
  });

  it("gir null når ingenting passar", () => {
    expect(finnVare("finst-ikkje", varer)).toBeNull();
    expect(finnVare("", varer)).toBeNull();
  });
});

describe("kodeFraSkannMedOppslag", () => {
  const id = "0b5c2f4e-1111-4222-8333-444455556666";
  const etikett = `https://qr-admin-fawn.vercel.app/q?k=${id}`;

  it("slår opp QR Admin-etiketten og les koden lenkja peikar på", async () => {
    let spurt = "";
    const svar = await kodeFraSkannMedOppslag(etikett, async (k) => {
      spurt = k;
      return "https://rorlager.vercel.app/r/PVC-110";
    });
    expect(spurt).toBe(id);
    expect(svar).toEqual({ kode: "pvc-110" });
  });

  it("kjenner att begge adressene til QR Admin, men ikkje /q på andre sider", async () => {
    const hent = async () => "https://rorlager.vercel.app/r/kob-32";
    expect(await kodeFraSkannMedOppslag(`https://qr.techauge.no/q/?k=${id.toUpperCase()}`, hent)).toEqual({ kode: "kob-32" });
    expect(await kodeFraSkannMedOppslag(`https://example.com/q?k=${id}`, hent)).toEqual({ kode: null });
  });

  it("vanlege kodar går som før, utan oppslag", async () => {
    const hent = async () => {
      throw new Error("skulle ikkje blitt kalla");
    };
    expect(await kodeFraSkannMedOppslag("https://rorlager.vercel.app/r/PVC-110", hent)).toEqual({ kode: "pvc-110" });
    expect(await kodeFraSkannMedOppslag("https://example.com/noe", hent)).toEqual({ kode: null });
  });

  it("seier frå når oppslaget feilar, og når koden peikar ein annan stad", async () => {
    const utanNett = await kodeFraSkannMedOppslag(etikett, async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(utanNett.kode).toBeNull();
    expect(utanNett.grunn).toMatch(/nett/i);
    expect(await kodeFraSkannMedOppslag(etikett, async () => null)).toEqual({ kode: null });
    expect(await kodeFraSkannMedOppslag(etikett, async () => "https://stock-smart-pi.vercel.app/h/a3")).toEqual({ kode: null });
    // Ein QR Admin-kode som peikar på ein annan blir ikkje følgd vidare
    expect(await kodeFraSkannMedOppslag(etikett, async () => etikett)).toEqual({ kode: null });
  });
});
