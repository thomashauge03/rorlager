import { format } from "date-fns";
import { nb } from "date-fns/locale";

/** Tal med norsk komma. Meter blir viste med opptil to desimalar, aldri fleire. */
export const num = (n: number | null | undefined, maxDecimals = 2) => {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  return n.toLocaleString("nb-NO", { maximumFractionDigits: maxDecimals });
};

/** Kroner med to desimalar – brukt i sumfelt og på fakturagrunnlaget. */
export const kr = (n: number | null | undefined) => {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  return n.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/** Kroner utan desimalar – brukt i lister der beløpa berre skal samanliknast. */
export const krShort = (n: number | null | undefined) => {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  return n.toLocaleString("nb-NO", { maximumFractionDigits: 0 });
};

export const shortDate = (d: string | Date | null | undefined) => {
  if (!d) return "–";
  try {
    return format(new Date(d), "dd.MM.yy", { locale: nb });
  } catch {
    return String(d);
  }
};

export const dateTime = (d: string | Date | null | undefined) => {
  if (!d) return "–";
  try {
    return format(new Date(d), "dd.MM.yy HH:mm", { locale: nb });
  } catch {
    return String(d);
  }
};

export const longDate = (d: string | Date | null | undefined) => {
  if (!d) return "–";
  try {
    return format(new Date(d), "d. MMMM yyyy", { locale: nb });
  } catch {
    return String(d);
  }
};

/** YYYY-MM-DD i lokal tid. new Date().toISOString() ville gitt UTC og bomma
 *  på datoen mellom midnatt og 02:00 om sommaren. */
export const isoDate = (d: Date = new Date()) => format(d, "yyyy-MM-dd");

/** "110 mm" bak namnet, men berre om dimensjonen finst */
/**
 * Står dimensjonen alt i namnet? «Bend 250 mm 45° PP» med dimensjon «250 mm»
 * – slik varene frå tellelista og hylleetikettane er namngitte. Mellomrom,
 * «mm», Ø og * mot x tel ikkje; eit tal må stå for seg sjølv, så «15°» ikkje
 * blir lese som «150 mm».
 */
export function namnHarDimensjon(name: string, dimension: string): boolean {
  // Mellomrom blir borte berre rundt skiljeteikna: «160 x 125» er «160x125», men
  // «F910 110» skal ikkje bli «f910110» og gøyme 110-en.
  const norm = (s: string) =>
    s.toLowerCase().replace(/ø/g, "").replace(/\*/g, "x").replace(/\s*([x/-])\s*/g, "$1").replace(/\s+/g, " ").trim();
  const kjerne = norm(dimension).replace(/\s*mm$/, "");
  if (!kjerne) return false;
  const trygg = kjerne.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  return new RegExp(`(?<!\\d)${trygg}(?!\\d)`).test(norm(name));
}

/** Namn med dimensjonen bak – med mindre namnet alt har henne, så ho ikkje står to gonger */
export const pipeLabel = (name: string, dimension?: string | null) =>
  dimension && !namnHarDimensjon(name, dimension) ? `${name} ${dimension}` : name;

/** Mengde med eining: "12,5 m" / "3 stk" */
export const qtyLabel = (quantity: number, unit: string) => `${num(quantity)} ${unit}`;

/** Godtek både komma og punktum – på mobil er komma det som ligg nærast. */
export const parseNum = (value: string): number | null => {
  const cleaned = (value ?? "").replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};
