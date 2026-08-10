import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  deriveDimension,
  deriveName,
  diffAgainstCatalog,
  parsePriceWorkbook,
  slugifyPipe,
  type ImportRow,
} from "@/lib/price-import";
import type { PipeType } from "@/lib/types";

/** Bygger eit ark med same form som prislista frå Brødrene Dahl */
function workbook(rows: unknown[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

// Slik ser ei ekte varelinje ut: varenr i kolonne B, beskriving i C, mengd,
// eining og pris lenger ute – med tomme kolonnar imellom.
const line = (sku: string, desc: string, unit: string, price: unknown) => [
  "", sku, desc, "", "", "", "", 1, "", unit, "", price, "", price,
];

describe("parsePriceWorkbook", () => {
  it("plukker varelinjene ut av et ark med tomme kolonner", () => {
    const buf = workbook([
      ["", "", "", "", "- Side 3 -"],
      ["Pos.nr", "NR", "Beskrivelse", "", "", "", "", "Mengde", "", "Enh", "", "Kundepris matr."],
      line("3100501", "RØR OVERVANN 100 X-STREAM 6M SN8 M/MUFFE", "M", "66,70"),
      line("2251059", "RØR AVL. T 110 PLAST", "M", 63.7),
      line("2252254", "BEND GR.AVL. 110 15GR PLAST", "STK", "28,10"),
    ]);

    const { rows } = parsePriceWorkbook(buf);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      sku: "3100501",
      description: "RØR OVERVANN 100 X-STREAM 6M SN8 M/MUFFE",
      unit: "m",
      cost: 66.7,
    });
    expect(rows[2].unit).toBe("stk");
  });

  it("hopper over buntlinjer med samme varenummer og sier fra", () => {
    const buf = workbook([
      line("3100501", "RØR OVERVANN 100", "M", "66,70"),
      ["", "3100501", "RØR OVERVANN 100", "", "", "", "", 300, "", "M", "", "66,70", "", "20010,00"],
    ]);
    const res = parsePriceWorkbook(buf);
    expect(res.rows).toHaveLength(1);
    expect(res.warnings.join(" ")).toMatch(/gjentatte/i);
  });

  it("ignorerer overskrifter, sumlinjer og tomme rader", () => {
    const buf = workbook([
      ["Tilbud nr:", "94587"],
      ["", "", "SUM ", "", "", "", "", 1, "", "RS", "", "4 519,60"],
      line("3100502", "RØR OVERVANN 150", "M", "120,40"),
    ]);
    expect(parsePriceWorkbook(buf).rows).toHaveLength(1);
  });

  it("sier tydelig fra når arket ikke har varelinjer i det hele tatt", () => {
    const buf = workbook([["Bare", "tull"], ["her", "inne"]]);
    expect(() => parsePriceWorkbook(buf)).toThrow(/Fant ingen varelinjer/);
  });
});

describe("deriveName og deriveDimension", () => {
  const cases: [string, string, string | null][] = [
    ["RØR AVL. T 110 PLAST", "Avløpsrør PVC", "110 mm"],
    ["RØR OVERVANN 250 X-STREAM 6M M/MUFFE", "Overvannsrør X-Stream SN8", "250 mm"],
    ["RØR 32MM PE100 SDR11 KV. 300M BLÅ STRIPE", "PE100 SDR11 trykkrør (kveil 300 m)", "32 mm"],
    ["BEND GR.AVL. 160 45GR PLAST", "Bend grunnavløp 45°", "160 mm"],
    ["GRENRØR GR.AVL 160X110 PLAST", "Grenrør grunnavløp", "160X110 mm"],
    ["EL.MUFFE 63MM PE100 SDR11 SDR11-17 VOTEC", "Elektromuffe PE100", "63 mm"],
    ["RED. EL. SDR11 50-40 GEF+ 753901652", "Reduksjon elektro PE100", "50-40 mm"],
    ["STØTTEHYLSE ISIFLO 40 NR 180", "Støttehylse Isiflo", "40 mm"],
  ];

  it.each(cases)("%s", (desc, navn, dim) => {
    expect(deriveName(desc)).toBe(navn);
    expect(deriveDimension(desc)).toBe(dim);
  });

  // Rekkevidden er i centimeter og står allerede i navnet – leses den som en
  // rørdimensjon, får skiltet på hylla feil tall på seg.
  it("gir ikke spindelforlengere en oppdiktet dimensjon", () => {
    expect(deriveDimension("SPINDELFORLENGER XO 97-165CM HELNOR XO2")).toBeNull();
    expect(deriveName("SPINDELFORLENGER XO 97-165CM HELNOR XO2")).toBe("Spindelforlenger XO 97-165 cm");
  });
});

describe("slugifyPipe", () => {
  it("gjør norske tegn og grader om til noe som tåler en URL", () => {
    expect(slugifyPipe("Avløpsrør PVC 110 mm")).toBe("avlopsror-pvc-110-mm");
    expect(slugifyPipe("Bend grunnavløp 45° 160 mm")).toBe("bend-grunnavlop-45gr-160-mm");
  });
});

describe("diffAgainstCatalog", () => {
  const pipe = (over: Partial<PipeType>): PipeType =>
    ({
      id: "id-1",
      category_id: null,
      name: "Avløpsrør PVC",
      dimension: "110 mm",
      sku: "2251059",
      qr_slug: "avlopsror-pvc-110-mm",
      unit: "m",
      price: 80,
      cost_price: 63.7,
      stock: 0,
      low_stock_threshold: 0,
      location: null,
      color: null,
      description: null,
      active: true,
      sort_order: 0,
      created_at: "",
      updated_at: "",
      ...over,
    }) as PipeType;

  const row = (over: Partial<ImportRow>): ImportRow => ({
    sku: "2251059",
    description: "RØR AVL. T 110 PLAST",
    unit: "m",
    cost: 63.7,
    ...over,
  });

  it("skiller endret fra uendret på innkjøpspris", () => {
    const d = diffAgainstCatalog([row({ cost: 70 })], [pipe({})], { markupPercent: 25 });
    expect(d.changed).toHaveLength(1);
    expect(d.changed[0].oldCost).toBe(63.7);
    expect(d.changed[0].newCost).toBe(70);
    expect(d.changed[0].newPrice).toBe(88); // 70 * 1,25 = 87,5 -> 88
  });

  it("regner øreavvik fra avrunding i arket som uendret", () => {
    const d = diffAgainstCatalog([row({ cost: 63.703 })], [pipe({})], { markupPercent: 25 });
    expect(d.unchanged).toHaveLength(1);
    expect(d.changed).toHaveLength(0);
  });

  it("foreslår navn og kortkode for varer som ikke finnes fra før", () => {
    const d = diffAgainstCatalog(
      [row({ sku: "9999999", description: "BEND GR.AVL. 200 90GR PLAST", cost: 472.5 })],
      [pipe({})],
      { markupPercent: 25 },
    );
    expect(d.created).toHaveLength(1);
    expect(d.created[0].name).toBe("Bend grunnavløp 90°");
    expect(d.created[0].dimension).toBe("200 mm");
    expect(d.created[0].qrSlug).toBe("bend-grunnavlop-90gr-200-mm");
  });

  it("gir kolliderende kortkoder et varenummer bak seg", () => {
    const d = diffAgainstCatalog(
      [row({ sku: "9999999", description: "RØR AVL. T 110 PLAST", cost: 70 })],
      [pipe({})],
      { markupPercent: 25 },
    );
    expect(d.created[0].qrSlug).toBe("avlopsror-pvc-110-mm-9999999");
  });

  it("melder fra om varer i katalogen som mangler i filen", () => {
    const d = diffAgainstCatalog([], [pipe({})], { markupPercent: 25 });
    expect(d.missing).toEqual([{ sku: "2251059", name: "Avløpsrør PVC", dimension: "110 mm" }]);
  });

  it("lar katalogen beholde sitt eget navn selv om filen beskriver varen annerledes", () => {
    const d = diffAgainstCatalog(
      [row({ description: "NOE HELT ANNET 999", cost: 70 })],
      [pipe({ name: "Håndrettet navn" })],
      { markupPercent: 25 },
    );
    expect(d.changed[0].name).toBe("Håndrettet navn");
  });
});
