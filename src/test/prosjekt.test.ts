import { describe, expect, it } from "vitest";
import {
  filtrerProsjekter,
  isOverdue,
  receivedForLine,
  remainderLabel,
  suggestDeviation,
  withReceived,
} from "@/lib/projects";
import type { ProjectOrderLineRow, ProjectReceiptLineRow, ProjectRow } from "@/lib/types";

// Mottakskontrollen står og fell på eitt tal: kor mykje som framleis manglar.
// Blir det rekna feil, kvitterer nokon ut ein leveranse som ikkje er komen –
// og då er det ingen som oppdagar at Dahl skuldar oss femten meter rør.

const linje = (id: string, requested: number, ordered: number | null): ProjectOrderLineRow => ({
  id,
  order_id: "o1",
  pipe_type_id: null,
  name: `Vare ${id}`,
  dimension: null,
  sku: null,
  unit: "m",
  requested_qty: requested,
  ordered_qty: ordered,
  line_note: null,
  sort_order: 0,
});

const mottak = (lineId: string, qty: number): ProjectReceiptLineRow => ({
  id: `r-${lineId}-${qty}`,
  receipt_id: "m1",
  order_line_id: lineId,
  received_qty: qty,
  deviation: "ingen",
  note: null,
  resolved_at: null,
  resolved_by: null,
});

describe("receivedForLine", () => {
  it("summerer over alle puljer", () => {
    expect(receivedForLine("a", [mottak("a", 25), mottak("a", 15)])).toBe(40);
  });

  it("teller ikke andre linjer med", () => {
    expect(receivedForLine("a", [mottak("a", 25), mottak("b", 100)])).toBe(25);
  });

  it("gir null når ingenting er mottatt", () => {
    expect(receivedForLine("a", [])).toBe(0);
  });
});

describe("withReceived", () => {
  it("regner ut resten etter det kontoret bestilte, ikke det plassen ba om", () => {
    // Plassen bad om 50, kontoret tinga 40, 25 er komne. Resten er 15 – ikkje 25.
    const [l] = withReceived([linje("a", 50, 40)], [mottak("a", 25)]);
    expect(l.received_qty).toBe(25);
    expect(l.remaining_qty).toBe(15);
  });

  it("lar resten bli negativ når det kom for mye", () => {
    const [l] = withReceived([linje("a", 10, 10)], [mottak("a", 12)]);
    expect(l.remaining_qty).toBe(-2);
  });

  it("gir ingen rest før kontoret har bestilt", () => {
    const [l] = withReceived([linje("a", 50, null)], []);
    expect(l.remaining_qty).toBe(0);
    expect(l.ordered_qty).toBeNull();
  });

  // 6,4 − 2,3 er 4.1000000000000005 i IEEE754. Blei det tallet forhåndsfylt i
  // mottaksskjemaet, sendte plassen inn litt mer enn det som sto igjen, og
  // databasen stemplet en helt korrekt leveranse som «For mye».
  it("runder bort flyttallsstøy i resten", () => {
    const [l] = withReceived([linje("a", 6.4, 6.4)], [mottak("a", 2.3)]);
    expect(l.remaining_qty).toBe(4.1);
    expect(String(l.remaining_qty)).toBe("4.1");
  });

  it("runder også summen av flere puljer", () => {
    const [l] = withReceived([linje("a", 10, 10)], [mottak("a", 0.1), mottak("a", 0.2)]);
    expect(l.received_qty).toBe(0.3);
    expect(l.remaining_qty).toBe(9.7);
  });
});

describe("isOverdue", () => {
  const iDag = new Date(2026, 8, 3); // 3. september 2026

  it("merker en bestilling som skulle kommet i går", () => {
    expect(isOverdue({ expected_at: "2026-09-02", status: "bestilt" }, iDag)).toBe(true);
  });

  it("merker ikke en som kommer i dag", () => {
    expect(isOverdue({ expected_at: "2026-09-03", status: "bestilt" }, iDag)).toBe(false);
  });

  it("merker ikke en som allerede er mottatt", () => {
    expect(isOverdue({ expected_at: "2026-01-01", status: "mottatt" }, iDag)).toBe(false);
  });

  it("merker delvis mottatte som fortsatt venter", () => {
    expect(isOverdue({ expected_at: "2026-09-01", status: "delvis" }, iDag)).toBe(true);
  });

  it("sier nei når ingen dato er satt", () => {
    expect(isOverdue({ expected_at: null, status: "bestilt" }, iDag)).toBe(false);
  });
});

describe("suggestDeviation", () => {
  it("melder fra når det kom for mye", () => {
    expect(suggestDeviation(12, 10)).toBe("for_mye");
  });

  it("sier ingenting når tallet stemmer", () => {
    expect(suggestDeviation(10, 10)).toBe("ingen");
  });

  // En bestilling kommer i puljer – det er hele grunnen til at mottak er en
  // egen tabell. Pulje 1 av 3 er ikke et avvik, og skal ikke fylle kontorets
  // avviksliste med leveranser der ingenting er galt.
  it("regner ikke en delleveranse som avvik", () => {
    expect(suggestDeviation(8, 10)).toBe("ingen");
    expect(suggestDeviation(0, 10)).toBe("ingen");
  });
});

/*
 * Teksten på prosjektkortet.
 *
 * Overleveringen var usynlig: koden skrev «{ordered_qty} mottatt» for alt som
 * ikke manglet — altså det BESTILTE tallet der det MOTTATTE skulle stått. Kom
 * det 110 av 100, sa kortet «100 m mottatt», og de ti ekstra fantes ikke for
 * kontoret som skal reklamere på dem.
 */
describe("remainderLabel", () => {
  it("sier hva som mangler", () => {
    expect(remainderLabel(100, 40, "m")).toBe("mangler 40 m");
  });

  it("sier at alt kom", () => {
    expect(remainderLabel(100, 0, "m")).toBe("100 m mottatt");
  });

  it("viser overleveringen, ikke det bestilte tallet", () => {
    expect(remainderLabel(100, -10, "m")).toBe("110 m mottatt – 10 m for mye");
  });

  it("tåler at kontoret ikke har skrevet inn antallet ennå", () => {
    expect(remainderLabel(null, 0, "stk")).toBe("0 stk mottatt");
  });

  it("skriver norsk komma og ingen flyttallsstøy", () => {
    expect(remainderLabel(6.4, -0.30000000000000004, "m")).toBe("6,7 m mottatt – 0,3 m for mye");
  });
});

// Over 700 prosjekter kommer fra SmartDok, og de fleste er avsluttet. Slipper
// de gjennom, drukner de aktive i hvert valg; forsvinner et prosjekt en person
// alt står på, blir avhukingen fjernet neste gang noen trykker Lagre.
describe("filtrerProsjekter", () => {
  const prosjekt = (
    id: string,
    nr: number,
    name: string,
    status: ProjectRow["status"],
    client: string | null = null,
  ): ProjectRow => ({
    id,
    project_number: nr,
    name,
    client,
    address: null,
    status,
    note: null,
    created_at: "2026-10-12T00:00:00Z",
    updated_at: "2026-10-12T00:00:00Z",
    created_by: null,
  });

  const liste = [
    prosjekt("a", 4512, "Vann og avløp Sandnes", "aktiv", "Sandnes kommune"),
    prosjekt("b", 3301, "Gamle Fjellvei", "avsluttet"),
    prosjekt("c", 4520, "Tomt Hommersåk", "aktiv"),
  ];

  const ids = (rader: ProjectRow[]) => rader.map((p) => p.id);

  it("viser bare aktive som standard", () => {
    expect(ids(filtrerProsjekter(liste))).toEqual(["a", "c"]);
  });

  it("tar med avsluttede når brukeren ber om det", () => {
    expect(ids(filtrerProsjekter(liste, { visAvsluttede: true }))).toEqual(["a", "b", "c"]);
  });

  it("beholder avsluttede som står i alltidMed", () => {
    expect(ids(filtrerProsjekter(liste, { alltidMed: ["b"] }))).toEqual(["a", "b", "c"]);
  });

  it("søker i nummer, navn og oppdragsgiver, og krever alle ordene", () => {
    expect(ids(filtrerProsjekter(liste, { søk: "4520" }))).toEqual(["c"]);
    expect(ids(filtrerProsjekter(liste, { søk: "sandnes KOMMUNE" }))).toEqual(["a"]);
    expect(ids(filtrerProsjekter(liste, { søk: "sandnes hommersåk" }))).toEqual([]);
  });

  it("søket slipper ikke gjennom avsluttede uten at de er slått på", () => {
    expect(ids(filtrerProsjekter(liste, { søk: "fjellvei" }))).toEqual([]);
    expect(ids(filtrerProsjekter(liste, { søk: "fjellvei", visAvsluttede: true }))).toEqual(["b"]);
  });
});
