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
import { dateTime, isoDate, num, pipeLabel } from "@/lib/format";
import { DEVIATION_LABEL } from "@/lib/types";
import type { ProjectOrderWithLines, ProjectReceiptRow, ProjectReceiptLineRow } from "@/lib/types";

export type ReceiptPdfDoc = {
  company: CompanyInfo;
  projectName: string;
  projectAddress: string | null;
  order: ProjectOrderWithLines;
  receipt: ProjectReceiptRow & { lines: ProjectReceiptLineRow[] };
};

export function buildReceiptPDF({ company, projectName, projectAddress, order, receipt }: ReceiptPdfDoc) {
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

  // ---------- Linjene ----------
  const kolonner = [
    { tittel: "Vare", x: MARGIN, w: contentW - 96 },
    { tittel: "Bestilt", x: pw - MARGIN - 96, w: 24, høgre: true },
    { tittel: "Mottatt", x: pw - MARGIN - 70, w: 24, høgre: true },
    { tittel: "Avvik", x: pw - MARGIN - 44, w: 44 },
  ];

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
    const bestilt = linje?.ordered_qty == null ? "–" : `${num(Number(linje.ordered_qty))} ${enhet}`;
    const mottatt = `${num(Number(rl.received_qty))} ${enhet}`;

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
    doc.text(mottatt, kolonner[2].x + kolonner[2].w, y + 5, { align: "right" });

    if (rl.deviation !== "ingen") {
      harAvvik = true;
      setText(doc, RED);
      doc.setFont("helvetica", "bold");
    } else {
      setText(doc, GREY);
    }
    doc.text(DEVIATION_LABEL[rl.deviation] ?? rl.deviation, kolonner[3].x, y + 5);
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
