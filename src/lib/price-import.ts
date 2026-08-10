// Innlesing av prisliste frå grossist.
//
// Brødrene Dahl sender prislista som eit Excel-ark der kvar side har sitt eige
// kolonneoppsett og beskrivingane er store bokstavar og forkortingar. Her blir
// arket gjort om til varelinjer, og linjene samanlikna med katalogen slik at
// admin ser kva som faktisk kjem til å endre seg før han trykkjer.
//
// Alt i denne fila er reine funksjonar utan nettverk eller React, slik at
// parsinga kan testast mot ei ekte fil.

import * as XLSX from "xlsx";
import type { PipeType } from "@/lib/types";

export type ImportRow = {
  /** Varenummeret hos grossisten. Dette er nøkkelen mot katalogen. */
  sku: string;
  description: string;
  unit: "m" | "stk";
  cost: number;
};

export type ParseResult = {
  rows: ImportRow[];
  sheetCount: number;
  /** Ting brukaren bør vite, men som ikkje stoppar importen */
  warnings: string[];
};

const UNITS = new Set(["M", "STK", "PK", "RL"]);

/** Godtek både 1 234,50 og 1234.5, og hardt mellomrom frå Excel */
const toNumber = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const cleaned = String(v ?? "")
    .replace(/\s| /g, "")
    .replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

/**
 * Les arbeidsboka.
 *
 * Kolonnetalet varierer mellom sidene, så vi kan ikkje nøkle på faste indeksar.
 * I staden kjenner vi att ei varelinje på at kolonne B er eit varenummer, og
 * hentar prisen som det første talet etter einingskolonnen. Summen står lenger
 * ute på rada, men med mengde 1 er han lik prisen – difor tek vi den første.
 */
export function parsePriceWorkbook(data: ArrayBuffer): ParseResult {
  const warnings: string[] = [];
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(data, { type: "array" });
  } catch (e) {
    throw new Error(`Klarte ikke å lese filen. Er det et Excel-ark? (${(e as Error).message})`);
  }

  const found = new Map<string, ImportRow>();
  let duplicates = 0;

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" });

    for (const row of rows) {
      const sku = String(row[1] ?? "").trim();
      if (!/^\d{6,8}$/.test(sku)) continue;

      const unitIndex = row.findIndex((c) => UNITS.has(String(c ?? "").trim().toUpperCase()));
      if (unitIndex < 0) continue;

      let cost: number | null = null;
      for (let i = unitIndex + 1; i < row.length; i++) {
        const v = toNumber(row[i]);
        if (v !== null && v > 0) {
          cost = v;
          break;
        }
      }
      if (cost === null) continue;

      const description = String(row[2] ?? "").replace(/\s+/g, " ").trim();
      if (!description) continue;

      // Same vare kjem att som buntlinje med mengde 300. Einingsprisen er den
      // same, så vi held på den første og tel resten som duplikat.
      if (found.has(sku)) {
        duplicates++;
        continue;
      }
      found.set(sku, {
        sku,
        description,
        unit: String(row[unitIndex]).trim().toUpperCase() === "M" ? "m" : "stk",
        cost,
      });
    }
  }

  if (found.size === 0) {
    throw new Error(
      "Fant ingen varelinjer i arket. Filen må ha varenummer i kolonne B, enhet (M/STK) og pris på samme rad.",
    );
  }
  if (duplicates > 0) {
    warnings.push(`${duplicates} gjentatte linjer ble hoppet over – samme varenummer flere ganger i arket.`);
  }

  return { rows: [...found.values()], sheetCount: wb.SheetNames.length, warnings };
}

/* ------------------------------------------------------------------ navn */

/** Dimensjonen slik han står i beskrivinga: 110, 160X110, 40-32, 83/100 */
export function deriveDimension(description: string): string | null {
  const b = description.toUpperCase();
  // Spindelforlengarar blir målte i cm og har rekkjevidda i namnet. Talet er
  // ikkje ein rørdimensjon og skal ikkje lesast som ein.
  if (/SPINDELFORLENGER/.test(b)) return null;

  const m =
    b.match(/\b(\d{2,4}\s*\/\s*\d{2,4})\b/) ||
    b.match(/\b(\d{2,4}\s*[X-]\s*\d{2,4})(?!\s*GR)\b/) ||
    b.match(/\b(\d{2,4})\s*MM\b/) ||
    b.match(/(?:RØR|ROR|BEND|MUFFE|GREN|TERS|UNION|HYLSE|KRAN|GR\.AVL\.?|T)\s+(\d{2,4})\b/) ||
    b.match(/\b(\d{2,4})\b/);
  return m ? `${m[1].replace(/\s+/g, "")} mm` : null;
}

const angle = (b: string): string | null => {
  const m = b.match(/(\d{1,3})\s*(?:GR\b|GRADER|°)/);
  return m ? `${m[1]}°` : null;
};

/**
 * Kort, lesbart namn ut av grossisten si beskriving.
 *
 * "RØR AVL. T 110 PLAST" blir "Avløpsrør PVC" med dimensjonen skild ut, fordi
 * appen sorterer og søkjer på namn og dimensjon kvar for seg – og fordi ingen
 * skal måtte lese store bokstavar og forkortingar på ei hylle.
 */
export function deriveName(description: string): string {
  const b = description.toUpperCase();
  const v = angle(b);

  if (/^RØR DRENS|^ROR DRENS|^DRENSRØR|^DRENSROR/.test(b)) {
    if (/VOTEC/.test(b)) return "Drensrør PE korrugert";
    if (/UPERFORERT|U\/SLISS/.test(b)) return "Drensrør uten slisser";
    return "Drensrør korrugert PEH";
  }
  if (/PE100 SDR11 KV\./.test(b)) {
    const kv = b.match(/KV\.\s*(\d+)M/);
    return `PE100 SDR11 trykkrør${kv ? ` (kveil ${kv[1]} m)` : ""}`;
  }
  if (/OVERVANN|OVERVANNSR|OVERV\.PVC/.test(b)) {
    if (/X-STREAM/.test(b)) return "Overvannsrør X-Stream SN8";
    if (/\bIQ\b/.test(b)) return "Overvannsrør IQ SN8";
    if (/OVERV\.PVC/.test(b)) return "Overvannsrør PVC glatt";
    return "Overvannsrør";
  }
  if (/^RØR AVL\.|^ROR AVL\./.test(b)) return "Avløpsrør PVC";
  if (/EL\.MUFFE/.test(b)) return "Elektromuffe PE100";
  if (/EL\.ALBUE/.test(b)) return `Elektroalbue PE100${v ? ` ${v}` : ""}`;
  if (/T-RØR EL\.|T-ROR EL\./.test(b)) return `T-rør elektro PE100${v ? ` ${v}` : ""}`;
  if (/RED\. EL\./.test(b)) return "Reduksjon elektro PE100";
  if (/TIPPUNION/.test(b)) {
    const g = description.match(/X\s*([\d./"]+)/);
    return `Tippunion Isiflo${g ? ` × ${g[1]}` : ""}`;
  }
  if (/UNION/.test(b)) return "Union Isiflo";
  if (/STØTTEHYLSE|STOTTEHYLSE/.test(b)) return "Støttehylse Isiflo";
  if (/BAKKEKRAN/.test(b)) return "Bakkekran Isiflo m/mutter";
  if (/SPINDELFORLENGER/.test(b)) {
    const r = b.match(/(\d+-\d+)CM/);
    return `Spindelforlenger XO${r ? ` ${r[1]} cm` : ""}`;
  }
  if (/X-STREAM/.test(b)) {
    if (/DOBBELTMUFFE/.test(b)) return "Dobbeltmuffe X-Stream";
    return `Bend X-Stream${v ? ` ${v}` : ""}`;
  }
  if (/STAKE\/SPYLEGREN/.test(b)) return "Stake- og spylegren PP";
  if (/GRENRØR|GRENROR/.test(b)) return `Grenrør grunnavløp${v ? ` ${v}` : ""}`;
  if (/LØPEMUFFE|LOPEMUFFE/.test(b)) return "Løpemuffe grunnavløp";
  if (/DOBBELMUFFE/.test(b)) return "Dobbelmuffe grunnavløp";
  if (/TERS/.test(b)) return "Ters grunnavløp";
  if (/BEND LANGE/.test(b)) return `Bend langt avløp${v ? ` ${v}` : ""}`;
  if (/BEND/.test(b)) return `Bend grunnavløp${v ? ` ${v}` : ""}`;

  // Ukjend vare: behald beskrivinga, men gjer henne lesbar
  return description
    .toLowerCase()
    .replace(/(^|\s)([a-zæøå])/g, (_, s, c: string) => s + c.toUpperCase());
}

export const slugifyPipe = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[æä]/g, "a")
    .replace(/[øö]/g, "o")
    .replace(/å/g, "a")
    .replace(/°/g, "gr")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/* ------------------------------------------------------------------ diff */

export type DiffLine = {
  sku: string;
  name: string;
  dimension: string | null;
  unit: string;
  oldCost: number | null;
  newCost: number;
  oldPrice: number | null;
  newPrice: number;
  pipeTypeId: string | null;
  /** Foreslått kortkode for varer som ikkje finst frå før */
  qrSlug?: string;
};

export type ImportDiff = {
  /** Finst i katalogen, og innkjøpsprisen er ein annan enn i fila */
  changed: DiffLine[];
  /** Finst i katalogen med same innkjøpspris */
  unchanged: DiffLine[];
  /** Står i fila, men ikkje i katalogen */
  created: DiffLine[];
  /** Står i katalogen, men ikkje i fila – kan vere utgått hos grossisten */
  missing: { sku: string; name: string; dimension: string | null }[];
};

const round = (value: number, step: number) => {
  const s = step || 1;
  return Math.round(value / s) * s;
};

/**
 * Samanliknar fila med katalogen.
 *
 * Nøkkelen er varenummeret. Namn og dimensjon i katalogen blir IKKJE rørte av
 * ein import – admin kan ha retta dei for hand, og ei prisoppdatering skal ikkje
 * skrive over det arbeidet.
 */
export function diffAgainstCatalog(
  rows: ImportRow[],
  types: PipeType[],
  opts: { markupPercent: number; roundTo?: number },
): ImportDiff {
  const { markupPercent, roundTo = 1 } = opts;
  const priceOf = (cost: number) => round(cost * (1 + markupPercent / 100), roundTo);

  const bySku = new Map<string, PipeType>();
  types.forEach((t) => {
    if (t.sku) bySku.set(t.sku.trim(), t);
  });

  const usedSlugs = new Set(types.map((t) => t.qr_slug));
  const diff: ImportDiff = { changed: [], unchanged: [], created: [], missing: [] };
  const seen = new Set<string>();

  for (const row of rows) {
    seen.add(row.sku);
    const match = bySku.get(row.sku);

    if (match) {
      const line: DiffLine = {
        sku: row.sku,
        name: match.name,
        dimension: match.dimension,
        unit: match.unit,
        oldCost: match.cost_price,
        newCost: row.cost,
        oldPrice: match.price,
        newPrice: priceOf(row.cost),
        pipeTypeId: match.id,
      };
      // Øre-avvik frå avrunding i arket skal ikkje telje som ei endring
      const same = match.cost_price !== null && Math.abs(match.cost_price - row.cost) < 0.005;
      (same ? diff.unchanged : diff.changed).push(line);
      continue;
    }

    const name = deriveName(row.description);
    const dimension = deriveDimension(row.description);
    let slug = slugifyPipe(`${name} ${dimension ?? ""}`);
    if (usedSlugs.has(slug)) slug = `${slug}-${row.sku}`;
    usedSlugs.add(slug);

    diff.created.push({
      sku: row.sku,
      name,
      dimension,
      unit: row.unit,
      oldCost: null,
      newCost: row.cost,
      oldPrice: null,
      newPrice: priceOf(row.cost),
      pipeTypeId: null,
      qrSlug: slug,
    });
  }

  types.forEach((t) => {
    if (t.sku && !seen.has(t.sku.trim())) {
      diff.missing.push({ sku: t.sku, name: t.name, dimension: t.dimension });
    }
  });

  return diff;
}
