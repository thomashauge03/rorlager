// Inventur: tel hylle for hylle, sjå avvika, lagre alt på ein gong
// (pipe_inventur). Reine funksjonar for rekkjefølgja, avvika og utkastet.

import type { PipeType } from "@/lib/types";

const UTKAST = "rorlager.inventur.v1";

/** Hylleplass først (A-01, A-02, B-01 …), så namn. Utan hylle sist. */
export function iHylleorden(varer: PipeType[]): PipeType[] {
  const nb = new Intl.Collator("nb", { numeric: true, sensitivity: "base" });
  return [...varer].sort((a, b) => {
    const ha = (a.location ?? "").trim();
    const hb = (b.location ?? "").trim();
    if (!ha !== !hb) return ha ? -1 : 1;
    return nb.compare(ha, hb) || nb.compare(`${a.name} ${a.dimension ?? ""}`, `${b.name} ${b.dimension ?? ""}`);
  });
}

export type Avvik = { vare: PipeType; telt: number; diff: number; verdi: number | null };

/** Det som er telt, mot det som står i basen. Utan avvik blir vara ikkje med. */
export function avvik(varer: PipeType[], telt: Record<string, number>): Avvik[] {
  return varer
    .filter((v) => v.id in telt)
    .map((v) => {
      const diff = Math.round((telt[v.id] - Number(v.stock)) * 100) / 100;
      return { vare: v, telt: telt[v.id], diff, verdi: v.cost_price == null ? null : Math.round(diff * v.cost_price * 100) / 100 };
    })
    .filter((a) => a.diff !== 0)
    .sort((a, b) => Math.abs(b.verdi ?? b.diff) - Math.abs(a.verdi ?? a.diff));
}

/** Utkastet ligg på eininga, så ei omlasting eller eit nettbrot ikkje tek teljinga. */
export function lesUtkast(): Record<string, string> {
  try {
    const raw = localStorage.getItem(UTKAST);
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export function skrivUtkast(verdiar: Record<string, string>) {
  try {
    if (Object.values(verdiar).some((v) => v.trim() !== "")) localStorage.setItem(UTKAST, JSON.stringify(verdiar));
    else localStorage.removeItem(UTKAST);
  } catch {
    /* privat modus – utkastet lever berre så lenge sida er open */
  }
}

export function slettUtkast() {
  try {
    localStorage.removeItem(UTKAST);
  } catch {
    /* ingenting å slette */
  }
}
