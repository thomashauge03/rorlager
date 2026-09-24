// PDF-en for éi bestilling. Same dokument for kunden og kontoret. Bygd i
// nettlesaren, aldri på tenaren – to byggjarar av same dokument ville glidd frå
// kvarandre.
//
// For privatpersonar kjem heile vilkåra og angreskjemaet på eigne sider. Ein
// forbrukar skal ha dei på eit varig medium, og ein PDF kunden lastar ned eller
// får utskriven ved henting, er det, sjølv før e-post er sett opp.

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
import { dateTime, kr, longDate, num, pipeLabel } from "@/lib/format";
import { prisInklMva, summer } from "@/lib/mva";
import { visOrgnr } from "@/lib/orgnr";
import { angreskjema, vilkarAvsnitt, type Selger } from "@/lib/vilkar";
import { PICKUP_STATUS_LABEL } from "@/lib/types";
import type { PickupOrder } from "@/lib/pickup-orders";

export type PickupPdfDoc = {
  order: PickupOrder;
  company: CompanyInfo;
  selger: Selger;
  vatRate: number;
};

export function buildPickupPDF({ order, company, selger, vatRate }: PickupPdfDoc) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const contentW = pw - MARGIN * 2;
  const bottomLimit = ph - 26;
  const privat = order.customer_type === "privat";

  let y = drawHeader(doc, "BESTILLING", company, `Nr. ${order.order_number}`);

  const newPage = () => {
    doc.addPage();
    y = MARGIN + 4;
  };
  const ensure = (needed: number) => {
    if (y + needed > bottomLimit) newPage();
  };

  const sectionTitle = (title: string) => {
    ensure(14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    setText(doc, BLACK);
    doc.text(title.toUpperCase(), MARGIN, y);
    setDraw(doc, RED);
    doc.setLineWidth(0.6);
    doc.line(MARGIN, y + 1.8, MARGIN + doc.getTextWidth(title.toUpperCase()), y + 1.8);
    doc.setLineWidth(0.2);
    y += 7.5;
  };

  // Tomme felt blir hoppa over – ei linje med berre «–» seier ingenting
  const row = (label: string, value: string | null | undefined) => {
    if (!value) return;
    ensure(8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    setText(doc, GREY);
    doc.text(label, MARGIN, y);
    doc.setFont("helvetica", "bold");
    setText(doc, BLACK);
    const wrapped = doc.splitTextToSize(value, contentW - 42);
    doc.text(wrapped, MARGIN + 40, y);
    y += 5.6 * wrapped.length;
  };

  const paragraph = (text: string, size = 9.5) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    setText(doc, BLACK);
    const wrapped = doc.splitTextToSize(text, contentW);
    ensure(4.8 * wrapped.length + 2);
    doc.text(wrapped, MARGIN, y);
    y += 4.8 * wrapped.length + 2.5;
  };

  /* ---------- Bestillinga ---------- */
  sectionTitle("Bestilling");
  row("Status", PICKUP_STATUS_LABEL[order.status] ?? order.status);
  row("Sendt inn", dateTime(order.created_at));
  row("Hentes", order.pickup_now ? `Henter nå – ${longDate(order.pickup_date)}` : longDate(order.pickup_date));
  row("Betaling", `Faktura, ${selger.betalingsfrist} dager`);
  y += 3;

  sectionTitle("Kunde");
  if (privat) {
    row("Navn", order.customer_name);
    row("Fakturaadresse", order.billing_address);
  } else {
    row("Firma", order.company);
    row("Org.nr.", order.org_number ? visOrgnr(order.org_number) : null);
    row("Kontaktperson", order.customer_name);
  }
  row("Telefon", order.customer_phone);
  row("E-post", order.customer_email);
  y += 3;

  /* ---------- Varene ---------- */
  sectionTitle(privat ? "Varer (priser inkl. mva)" : "Varer (priser eks. mva)");

  const colBelop = pw - MARGIN;
  const colPris = pw - MARGIN - 32;
  const colMengde = pw - MARGIN - 64;
  const nameW = colMengde - MARGIN - 24;

  const tableHeader = () => {
    ensure(12);
    setFill(doc, BLACK);
    doc.rect(MARGIN, y - 4.4, contentW, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text("VARE", MARGIN + 2, y);
    doc.text("MENGDE", colMengde, y, { align: "right" });
    doc.text("PRIS", colPris, y, { align: "right" });
    doc.text("BELØP", colBelop, y, { align: "right" });
    y += 6.5;
  };

  tableHeader();
  order.lines.forEach((l, i) => {
    doc.setFontSize(9.5);
    const nameLines = doc.splitTextToSize(pipeLabel(l.name, l.dimension), nameW);
    const rowH = Math.max(6.4, 4.6 * nameLines.length + 2);
    if (y + rowH > bottomLimit) {
      newPage();
      tableHeader();
    }
    if (i % 2 === 1) {
      setFill(doc, ZEBRA);
      doc.rect(MARGIN, y - 4.2, contentW, rowH, "F");
    }

    const pris = l.unit_price === null ? null : privat ? prisInklMva(l.unit_price, vatRate) : l.unit_price;
    const belop = l.line_total === null ? null : privat ? summer([l.line_total], vatRate).inkl : l.line_total;

    doc.setFont("helvetica", "bold");
    setText(doc, BLACK);
    doc.setFontSize(9.5);
    doc.text(nameLines, MARGIN + 2, y);
    doc.setFont("helvetica", "normal");
    doc.text(`${num(l.quantity)} ${l.unit}`, colMengde, y, { align: "right" });
    setText(doc, GREY);
    doc.text(pris === null ? "–" : kr(pris), colPris, y, { align: "right" });
    doc.setFont("helvetica", "bold");
    setText(doc, BLACK);
    doc.text(belop === null ? "–" : kr(belop), colBelop, y, { align: "right" });
    y += rowH;
  });

  /* ---------- Summen ---------- */
  const sum = summer([order.total], vatRate);
  ensure(24);
  y += 2;
  setDraw(doc, BLACK);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, pw - MARGIN, y);
  doc.setLineWidth(0.2);
  y += 6;
  const sumRader: [string, string][] = [
    ["Sum eks. mva", `${kr(sum.eks)} kr`],
    [`Mva ${num(vatRate)} %`, `${kr(sum.mva)} kr`],
    ["Sum inkl. mva", `${kr(sum.inkl)} kr`],
  ];
  sumRader.forEach(([label, value], i) => {
    const sist = i === sumRader.length - 1;
    doc.setFont("helvetica", sist ? "bold" : "normal");
    doc.setFontSize(sist ? 11 : 9.5);
    setText(doc, sist ? BLACK : GREY);
    doc.text(label, MARGIN + 2, y);
    setText(doc, sist ? RED : GREY);
    doc.text(value, colBelop, y, { align: "right" });
    y += sist ? 8 : 5.6;
  });

  if (order.comment) {
    sectionTitle("Kommentar fra kunden");
    paragraph(order.comment);
  }
  if (order.customer_message) {
    sectionTitle("Melding fra oss");
    paragraph(order.customer_message);
  }

  sectionTitle("Henting");
  paragraph(
    [selger.adresse ? `Varene hentes på lageret, ${selger.adresse}.` : "Varene hentes på lageret.", selger.henteinfo ?? ""]
      .filter(Boolean)
      .join(" "),
  );

  /* ---------- Vilkåra og angreskjemaet, for privatpersonar ---------- */
  if (privat) {
    newPage();
    vilkarAvsnitt(selger).forEach((a) => {
      sectionTitle(a.tittel);
      a.tekst.forEach((t) => paragraph(t));
      y += 4;
    });

    // Skjemaet på ei eiga side, så det ikkje brekk midt i og kan skrivast ut og
    // sendast for seg.
    newPage();
    const s = angreskjema(selger);
    sectionTitle(s.tittel);
    paragraph(s.ingress, 9);
    s.felt.forEach((f) => {
      ensure(14);
      paragraph(f);
      setDraw(doc, HAIRLINE);
      doc.line(MARGIN, y + 2, pw - MARGIN, y + 2);
      y += 7;
    });
    paragraph(s.fotnote, 8.5);
  }

  drawFooter(doc, company);
  return doc;
}

export function downloadPickupPDF(input: PickupPdfDoc) {
  const namn = input.order.company ?? input.order.customer_name;
  buildPickupPDF(input).save(`bestilling_${input.order.order_number}_${safeName(namn)}.pdf`);
}
