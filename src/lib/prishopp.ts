// Prishopp: justeringar oppå påslaget når kronen svingar, og sporet som viser
// kor mykje over Dahl-prisen ein ligg og kvifor. Basen gjer jobben
// (20261019100000_prishopp.sql); her blir det berre kalla og gjort lesbart.

import { supabase } from "@/integrations/supabase/client";
import { previewPrice, rundPris } from "@/lib/orders";
import { fylgjerAvansen } from "@/lib/prisoversikt";
import type { PipePrishendingRow, PipeType } from "@/lib/types";

export type PrisHending = PipePrishendingRow;

export const SLAG_LABEL: Record<PrisHending["slag"], string> = {
  import: "Ny prisliste fra Dahl",
  paaslag: "Oppdater prisene",
  hopp: "Prishopp",
};

/** Hoppet på ei vare, i prosent. 1,029 → 2,9. */
export const hoppProsent = (faktor: number | null | undefined) => ((faktor ?? 1) - 1) * 100;

const MANGLAR = /pipe_prishendingar|pipe_prishopp|prishopp_faktor/;
const manglarMelding = "Databasen mangler oppdateringen for prishopp. Kjør supabase-setup.sql på nytt.";

export async function fetchPrisHendingar(grense = 200): Promise<PrisHending[]> {
  const { data, error } = await supabase
    .from("pipe_prishendingar")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(grense);
  if (error) {
    throw new Error(MANGLAR.test(error.message) ? manglarMelding : `Klarte ikke å hente prissporet: ${error.message}`);
  }
  return (data ?? []) as PrisHending[];
}

/** Legg eit hopp på prisane. Returnerer talet på varer som fekk det. */
export async function prishopp(
  prosent: number,
  grunn: string,
  opts: { categoryId?: string | null; roundTo?: number } = {},
): Promise<number> {
  const { data, error } = await supabase.rpc("pipe_prishopp", {
    p_prosent: prosent,
    p_grunn: grunn,
    p_category_id: opts.categoryId ?? null,
    p_round_to: opts.roundTo ?? 1,
  });
  if (error) {
    throw new Error(
      MANGLAR.test(error.message) || /function .* does not exist/i.test(error.message)
        ? manglarMelding
        : error.message || "Klarte ikke å legge på prishoppet",
    );
  }
  return Number(data ?? 0);
}

/**
 * Kva varene får av eit nytt hopp – same reglar som pipe_prishopp. Ei vare som
 * fylgjer formelen blir rekna frå innkjøpsprisen; ei med handsett pris, eller
 * utan innkjøpspris, får hoppet på prisen ho har.
 */
export function prisEtterHopp(
  vare: PipeType,
  paaslagProsent: number,
  prosent: number,
  roundTo = 1,
  opp = false,
): number | null {
  const faktor = vare.prishopp_faktor ?? 1;
  const f = 1 + prosent / 100;
  const fylgjerFormel =
    vare.cost_price !== null &&
    (vare.price === null || fylgjerAvansen(vare.cost_price, vare.price, paaslagProsent, faktor));
  if (fylgjerFormel) return previewPrice(vare.cost_price, paaslagProsent, roundTo, faktor * f, opp);
  if (vare.price === null) return null;
  return rundPris(vare.price * f, roundTo, opp);
}

export type HoppSidanImport = {
  /** Siste import, eller null om ingen import står i sporet */
  import: PrisHending | null;
  /** Hopp på alle varer sidan importen, eldste først */
  hopp: PrisHending[];
  /** Hopp på berre éi varegruppe sidan importen – tel ikkje med i faktoren */
  gruppehopp: PrisHending[];
  /** Hoppa på alle varer ganga saman */
  faktor: number;
};

/**
 * Hoppa som gjeld no: dei som kom etter siste prisliste. Lista kjem nyaste
 * først, slik basen gir henne.
 */
export function hoppSidanImport(hendingar: PrisHending[]): HoppSidanImport {
  const sortert = [...hendingar].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const iImport = sortert.findIndex((h) => h.slag === "import");
  const etter = (iImport === -1 ? sortert : sortert.slice(0, iImport)).filter((h) => h.slag === "hopp").reverse();
  const hopp = etter.filter((h) => h.category_id === null && h.kategori_namn === null);
  const gruppehopp = etter.filter((h) => !(h.category_id === null && h.kategori_namn === null));
  const faktor = hopp.reduce((f, h) => f * (1 + (h.prosent ?? 0) / 100), 1);
  return { import: iImport === -1 ? null : sortert[iImport], hopp, gruppehopp, faktor };
}
