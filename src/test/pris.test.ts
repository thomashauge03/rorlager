import { describe, expect, it } from "vitest";
import { previewPrice } from "@/lib/orders";

// Førehandsvisinga i innstillingane må vise nøyaktig det databasen kjem til å
// skrive. Blir dei to ueinige, oppdagar ingen det før prisane alt er endra.
describe("previewPrice", () => {
  it("legger påslaget på innkjøpsprisen", () => {
    expect(previewPrice(100, 25)).toBe(125);
    expect(previewPrice(66.7, 25)).toBe(83); // rundar til heile kroner
  });

  it("runder til det trinnet som er valgt", () => {
    expect(previewPrice(100, 25, 5)).toBe(125);
    expect(previewPrice(101, 25, 5)).toBe(125);
    expect(previewPrice(105, 25, 10)).toBe(130);
    expect(previewPrice(66.7, 25, 0.01)).toBe(83.38);
  });

  it("lar prisen stå urørt på null påslag", () => {
    expect(previewPrice(250, 0)).toBe(250);
  });

  it("gir null når innkjøpsprisen mangler – ikke 0 kr", () => {
    expect(previewPrice(null, 25)).toBeNull();
    expect(previewPrice(undefined as unknown as number, 25)).toBeNull();
  });

  it("behandler avrunding 0 som hele kroner i stedet for å dele på null", () => {
    expect(previewPrice(100, 25, 0)).toBe(125);
  });
});
