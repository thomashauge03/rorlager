// Bestillingskurva. Eiga kurv, skild frå uttakskurva i cart.ts, så eit uttak ved
// hylla og ei bestilling heimanfrå aldri blir blanda.

import { useCallback, useEffect, useState } from "react";
import { linjesum } from "@/lib/mva";
import type { KasseSkjema } from "@/lib/pickup-form";
import type { CatalogItem } from "@/lib/types";

const KEY = "rorlager.bestilling.v1";
const KUNDE_KEY = "rorlager.bestilling-kunde.v1";
const UTKAST_KEY = "rorlager.bestilling-utkast.v1";
const EVENT = "rorlager-bestilling";

export type PickupCartLine = {
  pipe_type_id: string;
  name: string;
  dimension: string | null;
  sku: string | null;
  unit: string;
  /** Prisen då vara blei lagd i kurva. Kassen hentar dagens pris på nytt. */
  price: number;
  quantity: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const erLinje = (v: unknown): v is PickupCartLine => {
  if (!v || typeof v !== "object") return false;
  const l = v as Record<string, unknown>;
  return (
    typeof l.pipe_type_id === "string" &&
    typeof l.name === "string" &&
    typeof l.unit === "string" &&
    typeof l.price === "number" &&
    typeof l.quantity === "number" &&
    l.quantity > 0
  );
};

export function readPickupCart(): PickupCartLine[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Ei halvskriven eller manipulert kurv skal ikkje velte butikken
    return Array.isArray(parsed) ? parsed.filter(erLinje) : [];
  } catch {
    return [];
  }
}

export function writePickupCart(lines: PickupCartLine[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    /* full disk eller privat modus – kurva lever i minnet så lenge fana er open */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function clearPickupCart() {
  writePickupCart([]);
}

/** Null for ei vare utan pris: ein privatperson skal sjå totalprisen før bestillinga. */
export const pickupLineFromItem = (t: CatalogItem, quantity: number): PickupCartLine | null =>
  t.price === null
    ? null
    : {
        pipe_type_id: t.id,
        name: t.name,
        dimension: t.dimension,
        sku: t.sku,
        unit: t.unit,
        price: t.price,
        quantity: round2(quantity),
      };

/** Summen eks. mva, rekna linje for linje slik basen gjer. */
export const pickupCartEks = (lines: PickupCartLine[]) =>
  lines.reduce((s, l) => s + Math.round(linjesum(l.price, l.quantity) * 100), 0) / 100;

/**
 * Kurva med reaktiv lesing. Endringar frå ei anna fane (storage) og frå andre
 * komponentar i same fane (CustomEvent) gir begge ny render.
 */
export function usePickupCart() {
  const [lines, setLines] = useState<PickupCartLine[]>(() => readPickupCart());

  useEffect(() => {
    const sync = () => setLines(readPickupCart());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  /** Same vare to gonger blir slått saman i staden for å bli to linjer. */
  const add = useCallback((line: PickupCartLine) => {
    const current = readPickupCart();
    const i = current.findIndex((l) => l.pipe_type_id === line.pipe_type_id);
    if (i >= 0) current[i] = { ...line, quantity: round2(current[i].quantity + line.quantity) };
    else current.push(line);
    writePickupCart(current);
  }, []);

  /** Set mengd, men fjern aldri ei linje – søppelbøtta er den eine vegen ut. */
  const setQuantity = useCallback((pipeTypeId: string, quantity: number) => {
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    writePickupCart(readPickupCart().map((l) => (l.pipe_type_id === pipeTypeId ? { ...l, quantity: round2(quantity) } : l)));
  }, []);

  const remove = useCallback((pipeTypeId: string) => {
    writePickupCart(readPickupCart().filter((l) => l.pipe_type_id !== pipeTypeId));
  }, []);

  const clear = useCallback(() => clearPickupCart(), []);

  return { lines, add, setQuantity, remove, clear, count: lines.length, eks: pickupCartEks(lines) };
}

// ── Kundeopplysningane ──
//
// Same person bestiller ofte, og skal sleppe å taste alt på nytt. Hentedag og
// kommentar høyrer til éi bestilling og blir ikkje hugsa.

export type LagraKunde = Pick<
  KasseSkjema,
  "kundetype" | "navn" | "epost" | "telefon" | "firma" | "orgnr" | "gate" | "postnr" | "sted"
>;

const KUNDEFELT: (keyof LagraKunde)[] = ["kundetype", "navn", "epost", "telefon", "firma", "orgnr", "gate", "postnr", "sted"];

export function lesKunde(): Partial<LagraKunde> {
  try {
    const raw = localStorage.getItem(KUNDE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function skrivKunde(k: LagraKunde) {
  const berre = Object.fromEntries(KUNDEFELT.map((f) => [f, k[f]]));
  try {
    localStorage.setItem(KUNDE_KEY, JSON.stringify(berre));
  } catch {
    /* berre ei bekvemmelegheit */
  }
}

// ── Utkastet ──
//
// Heile skjemaet medan det blir fylt ut, i sessionStorage: det overlever at
// kunden opnar vilkåra og går tilbake, men ikkje at fana blir lukka.

export function lesUtkast(): Partial<KasseSkjema> {
  try {
    const raw = sessionStorage.getItem(UTKAST_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function skrivUtkast(s: KasseSkjema) {
  try {
    sessionStorage.setItem(UTKAST_KEY, JSON.stringify(s));
  } catch {
    /* privat modus */
  }
}

export function slettUtkast() {
  try {
    sessionStorage.removeItem(UTKAST_KEY);
  } catch {
    /* privat modus */
  }
}
