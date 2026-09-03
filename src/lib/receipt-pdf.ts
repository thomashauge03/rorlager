// Mottakskontrollen som PDF.
//
// Dette er dokumentet du sender leverandøren når noko manglar eller kom skadd.
// Difor står bestilt og mottatt side om side på kvar linje, avviket i klartekst,
// og signaturen til den som tok imot nedst – ord mot ord blir fort dyrt.
//
// Bygd på hjelparane i order-pdf.ts, så uttaksseddelen og denne ser ut som same
// firma har laga dei.

import jsPDF from "jspdf";
import {
  BLACK,
  GREY,
  HAIRLINE,
  MARGIN,
  RED,
  ZEBRA,
  drawFooter,
  drawHeader,
  safeName,
  setDraw,
  setFill,
  setText,
  type CompanyInfo,
} from "@/lib/order-pdf";
import { hentBildeData, type Bildedata } from "@/lib/mottak-bilde";
import { dateTime, isoDate, num, pipeLabel } from "@/lib/format";
import { DEVIATION_LABEL } from "@/lib/types";
import type { ProjectOrderWithLines, ProjectReceiptRow, ProjectReceiptLineRow } from "@/lib/types";

export type ReceiptPdfDoc = {
  company: CompanyInfo;
  projectName: string;
  projectAddress: string | null;
  order: ProjectOrderWithLines;
  receipt: ProjectReceiptRow & { lines: ProjectReceiptLineRow[] };
  /** Bileta med måla sine. jsPDF kan ikkje hente dei sjølv. */
  photos?: Bildedata[];
  /** Bilete som skulle vore med, men ikkje lét seg hente. */
  photosMissing?: number;
};

export function buildReceiptPDF({
  company,
  projectName,
  projectAddress,
  order,
  receipt,
  photos = [],
  photosMissing = 0,
}: ReceiptPdfDoc) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const contentW = pw - MARGIN * 2;

  let y = drawHeader(doc, "Mottakskontroll", company, `Mottak #${receipt.receipt_number}`);

  // ---------- Kva dette gjeld ----------
  const rad = (label: string, verdi: string | null) => {
    if (!verdi) return;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    setText(doc, GREY);
    doc.text(label, MARGIN, y);
    setText(doc, BLACK);
    doc.text(verdi, MARGIN + 38, y);
    y += 5.5;
  };

  rad("Prosjekt", projectName);
  rad("Adresse", projectAddress);
  rad("Bestilling", `#${order.order_number}`);
  rad("Leverandør", order.supplier);
  rad("Ordrenr.", order.supplier_ref);
  rad("Mottatt", dateTime(receipt.received_at));
  rad("Tatt imot av", receipt.received_by_name);

  y += 4;

  /* ---------- Linjene ----------
   *
   * FIRE TALKOLONNER, IKKJE TO.
   *
   * «Bestilt» er heile bestillinga, medan «Mottatt» berre er DENNE pulja. På
   * pulje to av tre stod det difor «Bestilt 100 m / Mottatt 30 m / Ingen
   * avvik» – og dette er dokumentet som følgjer ein reklamasjon til
   * leverandøren. Han les det som at 70 meter manglar.
   *
   * «Tidl.» og «Gjenstår» er det som gjer arket sant åleine. Utan dei må den
   * som les det ha alle puljene framfor seg for å forstå kva han ser på.
   */
  const kolonner = [
    { tittel: "Vare", x: MARGIN, w: contentW - 140 },
    { tittel: "Bestilt", x: pw - MARGIN - 140, w: 24, høgre: true },
    { tittel: "Tidl.", x: pw - MARGIN - 113, w: 22, høgre: true },
    { tittel: "Nå", x: pw - MARGIN - 88, w: 22, høgre: true },
    { tittel: "Gjenstår", x: pw - MARGIN - 63, w: 24, høgre: true },
    { tittel: "Avvik", x: pw - MARGIN - 36, w: 36 },
  ];

  /**
   * Kor mykje som var motteke på denne linja FØR denne pulja.
   *
   * Berre puljer med eit lågare mottaksnummer tel. Hadde vi teke alle, ville
   * eit ark skrive ut i ettertid vist puljer som kom etter det sjølv.
   */
  const tidlegare = (orderLineId: string) =>
    order.receipts
      .filter((r) => r.receipt_number < receipt.receipt_number)
      .flatMap((r) => r.lines)
      .filter((l) => l.order_line_id === orderLineId)
      .reduce((s, l) => s + Number(l.received_qty), 0);

  const tegnKolonneHoder = () => {
    setFill(doc, BLACK);
    doc.rect(MARGIN, y, contentW, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    for (const k of kolonner) {
      doc.text(k.tittel, k.høgre ? k.x + k.w : k.x + 2, y + 4.7, { align: k.høgre ? "right" : "left" });
    }
    y += 7;
  };

  tegnKolonneHoder();

  let stripe = false;
  let harAvvik = false;

  for (const rl of receipt.lines) {
    const linje = order.lines.find((l) => l.id === rl.order_line_id);
    const navn = linje ? pipeLabel(linje.name, linje.dimension) : "Ukjent vare";
    const enhet = linje?.unit ?? "";
    const bestiltTal = linje?.ordered_qty == null ? null : Number(linje.ordered_qty);
    const før = tidlegare(rl.order_line_id);
    const no = Number(rl.received_qty);

    const bestilt = bestiltTal == null ? "–" : `${num(bestiltTal)} ${enhet}`;
    const tidl = før > 0 ? `${num(før)} ${enhet}` : "–";
    const mottatt = `${num(no)} ${enhet}`;
    // Negativt tal er ei overlevering, og det skal stå med sitt eige forteikn –
    // ikkje kappast til «0» slik at ti meter for mye blir usynlege.
    const gjenstår = bestiltTal == null ? "–" : `${num(bestiltTal - før - no)} ${enhet}`;

    const navnLinjer = doc.splitTextToSize(navn, kolonner[0].w - 4) as string[];
    const merknad = rl.note ? (doc.splitTextToSize(rl.note, kolonner[0].w - 4) as string[]) : [];
    const høgde = Math.max(7, (navnLinjer.length + merknad.length) * 4.4 + 2.6);

    // Ny side før rada blir delt over sideskiftet
    if (y + høgde > ph - 26) {
      doc.addPage();
      y = MARGIN + 6;
      tegnKolonneHoder();
      stripe = false;
    }

    if (stripe) {
      setFill(doc, ZEBRA);
      doc.rect(MARGIN, y, contentW, høgde, "F");
    }
    stripe = !stripe;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    setText(doc, BLACK);
    navnLinjer.forEach((t, i) => doc.text(t, kolonner[0].x + 2, y + 5 + i * 4.4));

    if (merknad.length > 0) {
      doc.setFontSize(8);
      setText(doc, GREY);
      merknad.forEach((t, i) => doc.text(t, kolonner[0].x + 2, y + 5 + (navnLinjer.length + i) * 4.4));
      doc.setFontSize(9);
    }

    setText(doc, BLACK);
    doc.text(bestilt, kolonner[1].x + kolonner[1].w, y + 5, { align: "right" });
    doc.text(tidl, kolonner[2].x + kolonner[2].w, y + 5, { align: "right" });
    doc.text(mottatt, kolonner[3].x + kolonner[3].w, y + 5, { align: "right" });
    doc.text(gjenstår, kolonner[4].x + kolonner[4].w, y + 5, { align: "right" });

    if (rl.deviation !== "ingen") {
      harAvvik = true;
      setText(doc, RED);
      doc.setFont("helvetica", "bold");
    } else {
      setText(doc, GREY);
    }
    doc.setFontSize(8);
    doc.text(DEVIATION_LABEL[rl.deviation] ?? rl.deviation, kolonner[5].x, y + 5);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");

    y += høgde;
    setDraw(doc, HAIRLINE);
    doc.line(MARGIN, y, pw - MARGIN, y);
  }

  y += 8;

  if (receipt.note) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    setText(doc, BLACK);
    doc.text("Merknad", MARGIN, y);
    doc.setFont("helvetica", "normal");
    setText(doc, GREY);
    const linjer = doc.splitTextToSize(receipt.note, contentW) as string[];
    linjer.forEach((t, i) => doc.text(t, MARGIN, y + 5 + i * 4.4));
    y += 6 + linjer.length * 4.4;
  }

  // ---------- Bileta ----------
  //
  // To per rad. Dette er dokumentasjonen som følgjer reklamasjonen, så dei skal
  // vere store nok til at ein sprekk faktisk er synleg på papir.
  if (photos.length > 0) {
    if (y + 30 > ph - 26) {
      doc.addPage();
      y = MARGIN + 6;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    setText(doc, BLACK);
    doc.text(`Bilder fra mottaket (${photos.length})`, MARGIN, y);
    y += 6;

    /*
     * SIDEFORHOLDET BLIR BEVART.
     *
     * Tidlegare fekk kvart bilete ein fast 4:3-boks, og jsPDF fyller det
     * rektangelet uansett kva bildet har av mål. Eit mobilbilete i portrett –
     * altså normalen når nokon fotograferer ein palle – blei strekt nesten det
     * dobbelte på breidda. Eit reklamasjonsdokument som viser ein forvrengd
     * palle er verre enn ingen bilete.
     *
     * Kvart bilete blir no skalert INN i ruta si, sentrert, med sine eigne mål.
     */
    const rute = (contentW - 6) / 2;
    const ruteHøgd = rute * 0.75;

    photos.forEach((f, i) => {
      const kol = i % 2;
      if (kol === 0) {
        if (y + ruteHøgd > ph - 26) {
          doc.addPage();
          y = MARGIN + 6;
        }
      }

      const skala = Math.min(rute / f.bredde, ruteHøgd / f.høgde);
      const b = f.bredde * skala;
      const h = f.høgde * skala;
      const x = MARGIN + kol * (rute + 6) + (rute - b) / 2;

      try {
        doc.addImage(f.data, x, y + (ruteHøgd - h) / 2, b, h, undefined, "FAST");
      } catch {
        /* eit bilete som ikkje let seg teikne skal ikkje velte heile PDF-en */
      }
      if (kol === 1 || i === photos.length - 1) y += ruteHøgd + 4;
    });
    y += 6;
  }

  /*
   * Bilete som skulle vore her, men ikkje kom.
   *
   * Utan denne linja ser eit dokument der alle bileta feila å hente NØYAKTIG
   * ut som eit mottak der det aldri blei tatt bilete. For eit
   * reklamasjonsgrunnlag er stille utelating verre enn ei feilmelding.
   */
  if (photosMissing > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    setText(doc, RED);
    doc.text(
      `${photosMissing} ${photosMissing === 1 ? "bilde" : "bilder"} kunne ikke hentes — be om utskriften på nytt`,
      MARGIN,
      y,
    );
    doc.setFont("helvetica", "normal");
    y += 8;
  }

  if (receipt.no_photo_reason) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    setText(doc, RED);
    doc.text("Uten bilde", MARGIN, y);
    doc.setFont("helvetica", "normal");
    setText(doc, GREY);
    doc.text(receipt.no_photo_reason, MARGIN + 24, y);
    y += 8;
  }

  // ---------- Signaturen ----------
  if (receipt.signature) {
    if (y + 34 > ph - 26) {
      doc.addPage();
      y = MARGIN + 6;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    setText(doc, BLACK);
    doc.text("Signatur", MARGIN, y);
    try {
      doc.addImage(receipt.signature, "PNG", MARGIN, y + 2, 60, 24);
    } catch {
      /* utan signaturbilete held vi fram – namnet står uansett over */
    }
    y += 30;
    setDraw(doc, HAIRLINE);
    doc.line(MARGIN, y, MARGIN + 60, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setText(doc, GREY);
    doc.text(receipt.received_by_name, MARGIN, y + 4);
  }

  drawFooter(
    doc,
    company,
    harAvvik ? "Inneholder avvik – grunnlag for reklamasjon" : "Mottatt uten avvik",
  );

  return doc;
}

export function downloadReceiptPDF(input: ReceiptPdfDoc) {
  const doc = buildReceiptPDF(input);
  doc.save(`mottak-${input.receipt.receipt_number}-${safeName(input.projectName)}-${isoDate()}.pdf`);
}

/**
 * Same, men hentar bileta først.
 *
 * Bileta ligg i ei privat bøtte og må hentast gjennom signerte lenker før de
 * kan leggjast i dokumentet. Går det ikkje – dårleg dekning, ei lenke som gjekk
 * ut – blir PDF-en laga likevel, med linjene og avvika. Ein PDF utan bilete er
 * langt betre enn ingen når du står i ein reklamasjon.
 */
export async function downloadReceiptPDFMedBilder(
  input: Omit<ReceiptPdfDoc, "photos"> & { photoPaths: string[] },
): Promise<void> {
  const { photoPaths, ...resten } = input;
  let photos: Bildedata[] = [];
  try {
    photos = await hentBildeData(photoPaths);
  } catch {
    /* PDF-en blir laga utan, men seier frå om det */
  }
  downloadReceiptPDF({ ...resten, photos, photosMissing: photoPaths.length - photos.length });
}
