import { describe, expect, it } from "vitest";
import { buildPickupPDF } from "@/lib/pickup-pdf";
import type { PickupOrder } from "@/lib/pickup-orders";

const bestilling = (over: Partial<PickupOrder> = {}): PickupOrder => ({
  id: "x",
  order_number: 1042,
  created_at: "2026-09-24T10:00:00Z",
  status: "ny",
  pickup_date: "2026-10-03",
  pickup_now: false,
  customer_type: "privat",
  customer_name: "Ola Privat",
  customer_email: "ola@privat.no",
  customer_phone: "900 00 000",
  company: null,
  org_number: null,
  billing_address: "Bakkevegen 3, 5700 Voss",
  comment: "Henter med tilhenger",
  customer_message: null,
  handled_at: null,
  total: 1350,
  lines: [
    { name: "PVC 110", dimension: null, sku: "B-110", unit: "m", quantity: 12.5, unit_price: 100, line_total: 1250 },
    { name: "Bend", dimension: null, sku: null, unit: "stk", quantity: 4, unit_price: 25, line_total: 100 },
  ],
  emails: {},
  ...over,
});

const doc = (o: PickupOrder) =>
  buildPickupPDF({
    order: o,
    company: { name: "Hauge Maskin AS", orgNumber: "974760673" },
    selger: { navn: "Hauge Maskin AS", adresse: "Industrivegen 1", epost: "post@hauge.no", betalingsfrist: 14 },
    vatRate: 25,
  });

const bedrift = () =>
  bestilling({ customer_type: "bedrift", company: "Firma AS", org_number: "974760673", billing_address: null });

describe("PDF-en for bestillinga", () => {
  it("har ingen angrerettsside for bedrifter", () => {
    expect(doc(bedrift()).getNumberOfPages()).toBe(1);
  });

  it("får eigne sider med angrerett og angreskjema for privatpersonar", () => {
    // Større enn, ikkje lik 2: skjemaet kan brekke over på ei tredje side
    // dersom teksten blir lengre, og det er ikkje ein feil.
    expect(doc(bestilling()).getNumberOfPages()).toBeGreaterThan(doc(bedrift()).getNumberOfPages());
  });

  it("tåler mange linjer og brekk over fleire sider", () => {
    const mange = Array.from({ length: 60 }, (_, i) => ({
      name: `Rør nr. ${i}`,
      dimension: null,
      sku: null,
      unit: "m",
      quantity: 1,
      unit_price: 10,
      line_total: 10,
    }));
    expect(doc(bestilling({ customer_type: "bedrift", company: "Firma AS", lines: mange })).getNumberOfPages()).toBeGreaterThan(1);
  });
});
