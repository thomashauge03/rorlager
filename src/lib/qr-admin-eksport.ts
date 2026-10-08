import { pipeUrl } from "@/lib/qr-labels";

/*
 * Eksport av rørtypane til QR Admin (eige prosjekt i ~/qr-admin, mot eit anna
 * Supabase-prosjekt enn dette – difor tekst å lime inn, ikkje direkte skriving).
 *
 * Målforma er CategoryInsert i qr-admin/types/index.ts: éi rad i `categories`
 * er éin klistrelapp. qr_type "url" gjer at QR Admin lagar ein kode som opnar
 * rørsida; standarden "shop" ville gitt ein JSON-klump som ikkje opnar noko.
 *
 * Lenkja blir bygd med same pipeUrl som PDF-etikettane, så ein lapp frå QR
 * Admin og ein frå rørlageret kan aldri peike kvar sin stad.
 */

/** Speglar CategoryInsert i qr-admin. Blir han endra der, må denne følgje etter. */
export type QrAdminRad = {
  name: string;
  shelf_number: string;
  description: string | null;
  color: string;
  qr_type: "url";
  qr_data: { type: "url"; url: string };
  info_lines: { label: string; value: string }[] | null;
  folder_id: null;
};

export type EksportRor = {
  name: string;
  dimension?: string | null;
  sku?: string | null;
  qr_slug: string;
  location?: string | null;
  category_name?: string | null;
};

/** Raudt frå etikettane og hylleskiltet – lappane skal kjennast att som rørlageret. */
const FARGE = "#D3121C";

const tekst = (v: string | null | undefined) => (v ?? "").trim();

/**
 * Rør utan QR-kode blir hoppa over: ein lapp utan lenkje er verdilaus på hylla.
 * Talet kjem i retur så knappen kan seie frå i staden for å miste dei i stillheit.
 */
export function byggQrAdminRader(ror: EksportRor[], baseUrl: string): { rader: QrAdminRad[]; utanKode: number } {
  const rader: QrAdminRad[] = [];
  let utanKode = 0;

  for (const r of ror) {
    const slug = tekst(r.qr_slug);
    if (!slug) {
      utanKode += 1;
      continue;
    }
    const dim = tekst(r.dimension);
    const sku = tekst(r.sku);
    const hylle = tekst(r.location);

    rader.push({
      name: [tekst(r.name), dim].filter(Boolean).join(" "),
      // Påkravd i QR Admin. Hylla er det naturlege svaret; manglar ho, står
      // varenummeret eller koden der framfor ein strek som ikkje seier noko.
      shelf_number: hylle || sku || slug,
      description: tekst(r.category_name) || null,
      color: FARGE,
      qr_type: "url",
      qr_data: { type: "url", url: pipeUrl(slug, baseUrl) },
      // Viktigast først: QR Admin tek bort linjer bakfrå når lappen blir trong
      info_lines: [
        ...(dim ? [{ label: "Dimensjon", value: dim }] : []),
        ...(sku ? [{ label: "Varenr.", value: sku }] : []),
        ...(hylle ? [{ label: "Hylle", value: hylle }] : []),
      ],
      folder_id: null,
    });
  }

  return { rader, utanKode };
}

/** Forma QR Admin si import les: eit objekt med lista under «rader». */
export function qrAdminJson(rader: QrAdminRad[]): string {
  return JSON.stringify({ versjon: 1, kilde: "rorlager", generert: new Date().toISOString(), antall: rader.length, rader }, null, 2);
}
