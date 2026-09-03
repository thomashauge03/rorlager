import { useCallback, useEffect, useState } from "react";
import type { CartLine, CatalogItem } from "@/lib/types";

const KEY = "rorlager.kurv.v1";
const CUSTOMER_KEY = "rorlager.kunde.v1";
const EVENT = "rorlager-cart";

/** Kvitteringa må overleve at kunden dreg ned og oppdaterer sida etterpå.
 *  Nøkkelen bur her saman med dei andre lagringsnøklane, slik at kvitteringssida
 *  slepp å dra inn heile kassemodulen for å lese henne. */
export const LAST_ORDER_KEY = "rorlager.siste-ordre";

/** Kundeopplysningane blir hugsa mellom besøk – same person hentar rør ofte,
 *  og skal sleppe å taste namn og telefon på nytt kvar gong. */
export type SavedCustomer = {
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  company: string;
  project: string;
};

export const EMPTY_CUSTOMER: SavedCustomer = {
  customer_name: "",
  customer_phone: "",
  customer_email: "",
  company: "",
  project: "",
};

const isCartLine = (v: unknown): v is CartLine => {
  if (!v || typeof v !== "object") return false;
  const l = v as Record<string, unknown>;
  return typeof l.pipe_type_id === "string" && typeof l.name === "string" && typeof l.quantity === "number";
};

export function readCart(): CartLine[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Ein halvskriven eller manipulert kurv skal ikkje velte framsida
    return Array.isArray(parsed) ? parsed.filter(isCartLine) : [];
  } catch {
    return [];
  }
}

export function writeCart(lines: CartLine[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    /* full disk eller privat modus – kurven lever i minnet så lenge fana er open */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function clearCart() {
  writeCart([]);
}

export function readCustomer(): SavedCustomer {
  try {
    const raw = localStorage.getItem(CUSTOMER_KEY);
    if (!raw) return { ...EMPTY_CUSTOMER };
    return { ...EMPTY_CUSTOMER, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY_CUSTOMER };
  }
}

export function writeCustomer(c: SavedCustomer) {
  try {
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify(c));
  } catch {
    /* ignorer – dette er berre ei bekvemmelegheit */
  }
}

// CatalogItem og ikkje PipeType: kurven blir fylt frå kundesida, som les
// katalogvisninga utan innkjøpspris. Ein PipeType passar like fullt inn her.
export const cartLineFromType = (t: CatalogItem, quantity: number): CartLine => ({
  pipe_type_id: t.id,
  name: t.name,
  dimension: t.dimension,
  sku: t.sku,
  unit: t.unit,
  price: t.price,
  quantity,
  location: t.location,
});

export const cartCount = (lines: CartLine[]) => lines.length;

export const cartTotal = (lines: CartLine[]) =>
  lines.reduce((sum, l) => (l.price === null ? sum : sum + l.price * l.quantity), 0);

/** Sant når minst éi linje manglar pris – då er summen ikkje heile sanninga */
export const cartHasUnpriced = (lines: CartLine[]) => lines.some((l) => l.price === null);

/**
 * Kurven med reaktiv lesing. Endringar frå ei anna fane (storage) og frå andre
 * komponentar i same fane (CustomEvent) gir begge ny render, slik at telljaren
 * i toppen alltid stemmer med innhaldet.
 */
export function useCart() {
  const [lines, setLines] = useState<CartLine[]>(() => readCart());

  useEffect(() => {
    const sync = () => setLines(readCart());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  /** Same rørtype to gonger blir slått saman i staden for å bli to linjer */
  const add = useCallback((line: CartLine) => {
    const current = readCart();
    const i = current.findIndex((l) => l.pipe_type_id === line.pipe_type_id);
    if (i >= 0) {
      current[i] = { ...line, quantity: Math.round((current[i].quantity + line.quantity) * 100) / 100 };
    } else {
      current.push(line);
    }
    writeCart(current);
  }, []);

  /**
   * Set mengd, men fjern aldri ei linje. Talfeltet melder frå om 0 midt i
   * tastinga – når nokon markerer feltet og skriv om att, eller trykkjer minus
   * frå 0,5 – og då ville linja og mengda vore borte utan at kunden bad om det.
   * Søppelbøtta (remove) er den eine vegen ut av kurven.
   */
  const setQuantity = useCallback((pipeTypeId: string, quantity: number) => {
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    writeCart(
      readCart().map((l) =>
        l.pipe_type_id === pipeTypeId ? { ...l, quantity: Math.round(quantity * 100) / 100 } : l,
      ),
    );
  }, []);

  const remove = useCallback((pipeTypeId: string) => {
    writeCart(readCart().filter((l) => l.pipe_type_id !== pipeTypeId));
  }, []);

  const clear = useCallback(() => clearCart(), []);

  return {
    lines,
    add,
    setQuantity,
    remove,
    clear,
    count: cartCount(lines),
    total: cartTotal(lines),
    hasUnpriced: cartHasUnpriced(lines),
  };
}
