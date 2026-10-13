import { describe, expect, it } from "vitest";
import { forbrukCsv, forbrukLinjer, summerForbruk } from "@/lib/forbruk";
import type { OrderWithLines } from "@/lib/types";

const ordre = (over: Partial<OrderWithLines>): OrderWithLines =>
  ({
    id: "o1",
    order_number: 7,
    created_at: "2026-10-14T08:30:00Z",
    customer_name: "Ola Ansatt",
    project: "9000123 · Storgata 4",
    project_id: "p1",
    kind: "uttak",
    lines: [],
    ...over,
  }) as OrderWithLines;

const linje = (over: object) => ({
  id: "l",
  name: "PVC",
  dimension: "110 mm",
  sku: "2251059",
  unit: "m",
  quantity: 10,
  unit_price: 100,
  line_total: 1000,
  unit_cost: 60,
  ...over,
});

const prosjekt = new Map([["p1", { project_number: 9000123, name: "Storgata 4" }]]);

describe("forbrukLinjer", () => {
  it("tek berre uttak på eit prosjekt frå lista", () => {
    const rader = forbrukLinjer(
      [
        ordre({ lines: [linje({})] as never }),
        ordre({ id: "o2", project_id: null, project: "Verkstedet", lines: [linje({})] as never }),
        ordre({ id: "o3", kind: "bestilling", lines: [linje({})] as never }),
      ],
      prosjekt,
    );
    expect(rader).toHaveLength(1);
    expect(rader[0]).toMatchObject({ prosjektnr: 9000123, prosjekt: "Storgata 4", dato: "2026-10-14", kostSum: 600, salgSum: 1000 });
  });

  it("summerer kost og sal, og tel linjer utan kostpris", () => {
    const rader = forbrukLinjer(
      [ordre({ lines: [linje({}), linje({ id: "l2", unit_cost: null, quantity: 2, line_total: 200 })] as never })],
      prosjekt,
    );
    expect(summerForbruk(rader)).toEqual({ uttak: 1, linjer: 2, kost: 600, salg: 1200, utanKost: 1 });
  });
});

describe("forbrukCsv", () => {
  it("har BOM, semikolon og desimalkomma, og held namn med semikolon samla", () => {
    const rader = forbrukLinjer(
      [ordre({ lines: [linje({ name: 'Rør; "spesial"', quantity: 12.5, line_total: 1250, unit_cost: 60.4 })] as never })],
      prosjekt,
    );
    const csv = forbrukCsv(rader);
    expect(csv.startsWith("﻿Prosjektnr;Prosjekt;Dato")).toBe(true);
    const rad = csv.split("\r\n")[1];
    expect(rad).toContain('"Rør; ""spesial"" 110 mm"');
    expect(rad).toContain(";12,5;m;60,4;755;");
  });
});

describe("retur i forbruket", () => {
  it("ein retur trekkjer mengd, kost og sal frå jobben", () => {
    const rader = forbrukLinjer(
      [
        ordre({ lines: [linje({})] as never }),
        ordre({ id: "r1", order_number: 8, retur_av: "o1", lines: [linje({ quantity: 3, unit_price: -100, line_total: -300 })] as never }),
      ],
      prosjekt,
    );
    expect(rader[1]).toMatchObject({ mengde: -3, kostSum: -180, salgSum: -300 });
    expect(summerForbruk(rader)).toMatchObject({ kost: 420, salg: 700 });
  });
});
