import { describe, expect, it } from "vitest";
import { finnVare, kodeFraSkann } from "@/lib/scanner";

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
