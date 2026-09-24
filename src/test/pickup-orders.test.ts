import { describe, expect, it } from "vitest";
import { somBestilling, sorterVenter } from "@/lib/pickup-orders";
import type { OrderWithLines } from "@/lib/types";

describe("sorterVenter", () => {
  it("set «henter nå» først, så tidlegaste hentedag, så eldste innsending", () => {
    const rader = [
      { id: "c", pickup_now: false, pickup_date: "2026-10-03", created_at: "2026-09-24T08:00:00Z" },
      { id: "d", pickup_now: false, pickup_date: "2026-10-01", created_at: "2026-09-24T09:00:00Z" },
      { id: "b", pickup_now: true, pickup_date: "2026-09-24", created_at: "2026-09-24T10:00:00Z" },
      { id: "e", pickup_now: false, pickup_date: "2026-10-01", created_at: "2026-09-24T07:00:00Z" },
    ];
    expect(sorterVenter(rader).map((r) => r.id)).toEqual(["b", "e", "d", "c"]);
  });
});

describe("somBestilling", () => {
  it("gjer ei rad frå adminlista om til det PDF-en treng", () => {
    const o = {
      id: "x",
      order_number: 7,
      created_at: "2026-09-24T10:00:00Z",
      status: "behandlet",
      kind: "bestilling",
      pickup_date: "2026-10-01",
      pickup_now: false,
      customer_type: "bedrift",
      customer_name: "Kari",
      customer_email: "kari@firma.no",
      customer_phone: null,
      company: "Firma AS",
      org_number: "974760673",
      billing_address: null,
      comment: null,
      customer_message: "Port 2",
      handled_at: null,
      total: 100,
      lines: [{ id: "l", name: "Rør", dimension: null, sku: null, unit: "m", quantity: 1, unit_price: 100, line_total: 100 }],
    } as unknown as OrderWithLines;
    const b = somBestilling(o);
    expect(b).toMatchObject({ order_number: 7, customer_type: "bedrift", company: "Firma AS", customer_message: "Port 2" });
    expect(b.lines).toEqual([{ name: "Rør", dimension: null, sku: null, unit: "m", quantity: 1, unit_price: 100, line_total: 100 }]);
    expect(b.emails).toEqual({});
  });
});
