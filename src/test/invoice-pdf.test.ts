import { describe, expect, it } from "vitest";
import { buildInvoicePDF, type InvoiceDoc } from "@/lib/invoice-pdf";

const grunnlag = (over: Partial<InvoiceDoc> = {}): InvoiceDoc => ({
  invoice_number: 7,
  customer_name: "Ola Nordmann",
  period_from: "2026-09-01",
  period_to: "2026-09-30",
  total: 1350,
  orders: [
    {
      order_number: 1042,
      created_at: "2026-09-24T10:00:00Z",
      lines: [
        {
          id: "l1",
          order_id: "o1",
          pipe_type_id: null,
          name: "PVC 110",
          dimension: null,
          sku: null,
          unit: "m",
          quantity: 12.5,
          unit_price: 100,
          line_total: 1250,
          sort_order: 0,
        },
      ],
    },
  ],
  company: { name: "Hauge Maskin AS", orgNumber: "974760673", address: null, phone: null, email: null },
  vatRate: 25,
  ...over,
});

/** Teksten på første side, slik jsPDF har skrive han før komprimeringa. */
const side1 = (inv: InvoiceDoc) =>
  (buildInvoicePDF(inv).internal as unknown as { pages: string[][] }).pages[1].join("\n");

describe("fakturagrunnlaget", () => {
  it("viser org.nr. eller fakturaadresse rett under kunden", () => {
    const t = side1(grunnlag({ customer_details: ["Fakturaadresse: Bakkevegen 3, 5700 Voss"] }));
    expect(t).toContain("(Fakturaadresse: Bakkevegen 3, 5700 Voss)");
    expect(t.indexOf("(Ola Nordmann)")).toBeLessThan(t.indexOf("(Fakturaadresse:"));
    expect(t.indexOf("(Fakturaadresse:")).toBeLessThan(t.indexOf("(Periode)"));
  });

  it("utan detaljar er alt som før", () => {
    expect(side1(grunnlag())).not.toContain("Fakturaadresse");
  });
});
