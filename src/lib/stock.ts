import type { PipeType, StockStatus } from "@/lib/types";

/** Same normalisering overalt: store/små bokstavar og doble mellomrom betyr ingenting */
export const searchKey = (value: string) => (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

export function stockStatus(t: Pick<PipeType, "stock" | "low_stock_threshold">): StockStatus {
  if (t.stock <= 0) return "tomt";
  const limit = t.low_stock_threshold ?? 0;
  if (limit > 0 && t.stock <= limit) return "snart";
  return "pa_lager";
}

export const STOCK_LABEL: Record<StockStatus, string> = {
  tomt: "Tomt",
  snart: "Snart tomt",
  pa_lager: "På lager",
};

// Tomt først når ein sorterer på status – det hastar mest
const STATUS_ORDER: Record<StockStatus, number> = { tomt: 0, snart: 1, pa_lager: 2 };

export type PipeSort = { key: "name" | "dimension" | "stock" | "price" | "status" | "location"; dir: "asc" | "desc" };

/**
 * Fritekstsøket treffer namn, dimensjon, varenummer, hylle og kategori under
 * eitt. Folk søkjer på det dei har framfor seg – "110", "A-01" eller "pvc" –
 * og skal finne røret uansett kva av dei dei skreiv.
 */
// Tek eit strukturelt utsnitt og ikkje PipeType: katalogvisninga manglar
// cost_price, og søket har uansett aldri sett på den kolonnen.
export type Søkbar = Pick<PipeType, "name" | "dimension" | "sku" | "location" | "description"> & {
  category_name?: string | null;
};

export function matchesSearch(t: Søkbar, term: string): boolean {
  const q = searchKey(term);
  if (!q) return true;
  const haystack = searchKey(
    [t.name, t.dimension, t.sku, t.location, t.category_name, t.description].filter(Boolean).join(" "),
  );
  return q.split(" ").every((word) => haystack.includes(word));
}

// Generisk over rada: både PipeType (kontoret) og CatalogItem (kundeflyten) skal
// kunne filtrerast og sorterast her, og cost_price er ikkje med i noko av det.
export function filterAndSortPipes<
  T extends Søkbar & Pick<PipeType, "active" | "category_id" | "stock" | "price" | "low_stock_threshold">,
>(
  rows: T[],
  opts: { search?: string; categoryId?: string | null; onlyActive?: boolean; sort?: PipeSort } = {},
): T[] {
  const { search = "", categoryId = null, onlyActive = false, sort = { key: "name", dir: "asc" } } = opts;
  const dir = sort.dir === "asc" ? 1 : -1;
  const nb = (a: string, b: string) => (a ?? "").localeCompare(b ?? "", "nb", { numeric: true });

  return rows
    .filter((t) => (!onlyActive || t.active) && (!categoryId || t.category_id === categoryId) && matchesSearch(t, search))
    .sort((a, b) => {
      switch (sort.key) {
        case "stock":
          return (a.stock - b.stock) * dir;
        case "price":
          return ((a.price ?? -1) - (b.price ?? -1)) * dir;
        case "dimension":
          return nb(a.dimension ?? "", b.dimension ?? "") * dir;
        case "location":
          return nb(a.location ?? "", b.location ?? "") * dir;
        case "status": {
          const diff = STATUS_ORDER[stockStatus(a)] - STATUS_ORDER[stockStatus(b)];
          return diff !== 0 ? diff * dir : nb(a.name, b.name);
        }
        default: {
          // Namn og dimensjon høyrer saman: "PVC 110" skal kome før "PVC 160",
          // ikkje spreiast utover lista fordi dimensjonen er eit eige felt.
          const byName = nb(a.name, b.name);
          return (byName !== 0 ? byName : nb(a.dimension ?? "", b.dimension ?? "")) * dir;
        }
      }
    });
}

export function stockTotals(rows: PipeType[]) {
  const perUnit = new Map<string, number>();
  rows.forEach((t) => perUnit.set(t.unit, (perUnit.get(t.unit) || 0) + t.stock));
  return {
    varer: rows.length,
    tomme: rows.filter((t) => stockStatus(t) === "tomt").length,
    snart: rows.filter((t) => stockStatus(t) === "snart").length,
    // Lagerverdien er berre meiningsfull der prisen er sett
    verdi: rows.reduce((sum, t) => (t.price === null ? sum : sum + t.price * Math.max(t.stock, 0)), 0),
    perUnit: [...perUnit.entries()].map(([unit, qty]) => ({ unit, qty: Math.round(qty * 100) / 100 })),
  };
}
