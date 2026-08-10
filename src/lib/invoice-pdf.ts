import jsPDF from "jspdf";
// Nedskalert logo: full oppløysing gav PDF-ar på fleire megabyte
import hmLogo from "@/assets/hm-logo-pdf.png";
import { kr, longDate, num, pipeLabel, shortDate } from "@/lib/format";
import type { CompanyInfo } from "@/lib/order-pdf";
import type { PipeOrderLineRow } from "@/lib/types";

// Forholdet må haldast, elles blir merket klemt
const LOGO_RATIO = 278 / 450;

const BLACK: [number, number, number] = [17, 17, 17];
const RED: [number, number, number] = [211, 18, 28];
const GREY: [number, number, number] = [110, 110, 110];
const ZEBRA: [number, number, number] = [247, 247, 247];
const HAIRLINE: [number, number, number] = [222, 222, 222];

const MARGIN = 16;

export type InvoiceOrder = {
  order_number: number;
  created_at: string;
  project?: string | null;
  comment?: string | null;
  signature?: string | null;
  lines: PipeOrderLineRow[];
};

export type InvoiceDoc = {
  invoice_number: number | string;
  customer_name: string;
  period_from: string;
  period_to: string;
  total: number;
  orders: InvoiceOrder[];
  company: CompanyInfo;
  /** Mva-satsen i prosent. Utelaten eller 0 tyder eit reint grunnlag utan mva. */
  vatRate?: number;
};

export type InvoiceOptions = {
  /** Prisar er av som standard – dei skal aktivt hakast på */
  showPrices?: boolean;
  /** Signaturane er dokumentasjonen på at røra faktisk blei henta */
  showSignatures?: boolean;
  showProject?: boolean;
  showOrderNumbers?: boolean;
};

const setText = (doc: jsPDF, c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
const setFill = (doc: jsPDF, c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
const setDraw = (doc: jsPDF, c: [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2]);

const safeName = (s: string) =>
  (s || "").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "") || "kunde";

/** Ei linje manglar pris når databasen ikkje har rekna ut noko beløp for henne */
const missingPrice = (l: PipeOrderLineRow) =>
  l.line_total === null || l.line_total === undefined || l.unit_price === null || l.unit_price === undefined;

export function buildInvoicePDF(inv: InvoiceDoc, opts: InvoiceOptions = {}) {
  const {
    showPrices = false,
    showSignatures = true,
    showProject = true,
    showOrderNumbers = true,
  } = opts;

  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const contentW = pw - MARGIN * 2;
  const bottomLimit = ph - 26;

  const orders = inv.orders ?? [];
  const allLines = orders.flatMap((o) => o.lines ?? []);

  let y = 0;
  const newPage = () => {
    doc.addPage();
    y = MARGIN + 4;
  };
  const ensure = (needed: number) => {
    if (y + needed > bottomLimit) newPage();
  };

  /* ---------- Topp ---------- */
  const logoW = 38;
  const logoH = logoW * LOGO_RATIO;
  try {
    doc.addImage(hmLogo, "PNG", MARGIN, 14, logoW, logoH);
  } catch {
    /* utan logo held vi fram med tekst */
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  setText(doc, BLACK);
  doc.text(showPrices ? "FAKTURAGRUNNLAG" : "UTTAKSOVERSIKT", pw - MARGIN, 22, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  setText(doc, GREY);
  doc.text(inv.company.name, pw - MARGIN, 28, { align: "right" });
  doc.text(`Nr. ${inv.invoice_number}`, pw - MARGIN, 33.5, { align: "right" });

  y = 14 + logoH + 6;
  setFill(doc, RED);
  doc.rect(MARGIN, y, contentW, 1.4, "F");
  y += 10;

  /* ---------- Infoblokk ---------- */
  const row = (label: string, value: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    setText(doc, GREY);
    doc.text(label, MARGIN, y);
    doc.setFont("helvetica", "bold");
    setText(doc, BLACK);
    doc.text(value, MARGIN + 40, y);
    y += 5.6;
  };

  row("Kunde", inv.customer_name);
  row("Periode", `${longDate(inv.period_from)} – ${longDate(inv.period_to)}`);
  row("Antall uttak", String(orders.length));
  y += 6;

  /* ---------- Tabell ---------- */
  // Utan beløpskolonne går plassen til varenamnet i staden
  const colValue = pw - MARGIN;
  const colUnit = showPrices ? pw - MARGIN - 50 : pw - MARGIN - 14;
  const colQty = showPrices ? pw - MARGIN - 62 : pw - MARGIN - 26;
  const colDate = MARGIN + 2;
  const colName = MARGIN + 22;

  const tableHeader = () => {
    setFill(doc, BLACK);
    doc.rect(MARGIN, y - 4.4, contentW, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text("DATO", colDate, y);
    doc.text("VARE", colName, y);
    doc.text("MENGDE", colQty, y, { align: "right" });
    doc.text("ENHET", colUnit, y);
    if (showPrices) doc.text("BELØP", colValue, y, { align: "right" });
    y += 6.5;
  };

  tableHeader();
  doc.setFontSize(9.5);

  // Sebrastripene held fram på tvers av bestillingane, elles blir dei uroleg
  let stripe = 0;

  orders.forEach((order) => {
    const lines = order.lines ?? [];

    if (showOrderNumbers) {
      ensure(12);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      setText(doc, GREY);
      const head = [
        `#${order.order_number} · ${shortDate(order.created_at)}`,
        showProject && order.project ? order.project : null,
      ]
        .filter(Boolean)
        .join("  ·  ");
      doc.text(doc.splitTextToSize(head, contentW - 4)[0], colDate, y + 0.4);
      setDraw(doc, HAIRLINE);
      doc.line(MARGIN, y + 2.2, pw - MARGIN, y + 2.2);
      y += 6.4;
      doc.setFontSize(9.5);
    }

    lines.forEach((line) => {
      const nameW = colQty - colName - 8;
      const nameLines = doc.splitTextToSize(pipeLabel(line.name, line.dimension), nameW);
      const rowH = Math.max(6.4, 4.6 * nameLines.length + 2);

      if (y + rowH > bottomLimit) {
        newPage();
        tableHeader();
        doc.setFontSize(9.5);
      }

      if (stripe % 2 === 1) {
        setFill(doc, ZEBRA);
        doc.rect(MARGIN, y - 4.2, contentW, rowH, "F");
      }
      stripe += 1;

      doc.setFont("helvetica", "normal");
      setText(doc, GREY);
      doc.text(shortDate(order.created_at), colDate, y);

      doc.setFont("helvetica", "bold");
      setText(doc, BLACK);
      doc.text(nameLines, colName, y);

      doc.text(num(line.quantity), colQty, y, { align: "right" });
      doc.setFont("helvetica", "normal");
      setText(doc, GREY);
      doc.text(line.unit, colUnit, y);

      if (showPrices) {
        doc.setFont("helvetica", "bold");
        setText(doc, BLACK);
        // Manglar prisen, seier vi det rett ut i staden for å skrive 0,00
        doc.text(missingPrice(line) ? "–" : kr(line.line_total), colValue, y, { align: "right" });
      }

      y += rowH;
    });
  });

  /* ---------- Sum ---------- */
  ensure(16);
  y += 2;
  setDraw(doc, BLACK);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, pw - MARGIN, y);
  doc.setLineWidth(0.2);
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  setText(doc, BLACK);
  doc.text("SUM", MARGIN + 2, y);
  setText(doc, RED);

  if (showPrices) {
    doc.text(`${kr(inv.total)} kr`, colValue, y, { align: "right" });
  } else {
    // Meter og stykk kan ikkje leggjast saman – kvar eining må summerast for seg
    const per = new Map<string, number>();
    allLines.forEach((l) => per.set(l.unit, (per.get(l.unit) || 0) + (l.quantity || 0)));
    const sums = [...per.entries()]
      .map(([unit, qty]) => `${num(Math.round(qty * 10000) / 10000)} ${unit}`)
      .join("   ");
    doc.text(sums, pw - MARGIN, y, { align: "right" });
  }
  y += 8;

  /* ---------- Mva ---------- */
  // Satsen kjem frå innstillingane. Er han 0, er dette eit reint grunnlag utan
  // mva, og då skal det ikkje stå ei mva-linje på 0,00 og villeie rekneskapen.
  const vatRate = inv.vatRate ?? 0;
  if (showPrices && vatRate > 0) {
    ensure(20);
    // Rundar i øre, slik at summen inkl. mva stemmer med linja over
    const vat = Math.round(inv.total * vatRate) / 100;
    const rows: [string, string][] = [
      ["Grunnlag eks. mva", `${kr(inv.total)} kr`],
      [`Mva ${num(vatRate)} %`, `${kr(vat)} kr`],
      ["Sum inkl. mva", `${kr(inv.total + vat)} kr`],
    ];
    doc.setFontSize(9.5);
    rows.forEach(([label, value], i) => {
      const sist = i === rows.length - 1;
      doc.setFont("helvetica", sist ? "bold" : "normal");
      setText(doc, sist ? BLACK : GREY);
      doc.text(label, MARGIN + 2, y);
      setText(doc, sist ? RED : GREY);
      doc.text(value, colValue, y, { align: "right" });
      y += 5.6;
    });
    y += 3;
  }

  const utenPris = allLines.filter(missingPrice).length;
  if (showPrices && utenPris > 0) {
    ensure(8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    setText(doc, RED);
    doc.text(
      `Merk: ${utenPris} ${utenPris === 1 ? "linje mangler" : "linjer mangler"} pris og er ikke med i summen.`,
      MARGIN + 2,
      y,
    );
    y += 6;
  }

  /* ---------- Kvitteringar: signaturane som ligg bak kvart uttak ---------- */
  const signerte = orders.filter((o) => o.signature);
  if (showSignatures && signerte.length > 0) {
    y += 4;
    if (y + 34 > bottomLimit) newPage();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    setText(doc, BLACK);
    doc.text("KVITTERINGER", MARGIN, y);
    setDraw(doc, RED);
    doc.setLineWidth(0.6);
    doc.line(MARGIN, y + 1.8, MARGIN + doc.getTextWidth("KVITTERINGER"), y + 1.8);
    doc.setLineWidth(0.2);
    y += 8;

    // To i breidda: signaturane er breie og låge, fleire per rad blir uleselege
    const boxW = (contentW - 6) / 2;
    const boxH = 22;
    signerte.forEach((order, i) => {
      const col = i % 2;
      if (col === 0 && y + boxH + 8 > bottomLimit) newPage();
      const x = MARGIN + col * (boxW + 6);

      setDraw(doc, HAIRLINE);
      doc.rect(x, y, boxW, boxH);
      try {
        doc.addImage(order.signature as string, "PNG", x + 2, y + 2, boxW - 4, boxH - 4);
      } catch {
        /* øydelagt data-URL skal ikkje velte heile dokumentet */
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      setText(doc, GREY);
      const merke = [shortDate(order.created_at), `#${order.order_number}`, showProject ? order.project : null]
        .filter(Boolean)
        .join(" · ");
      doc.text(doc.splitTextToSize(merke, boxW)[0], x, y + boxH + 3.5);

      if (col === 1 || i === signerte.length - 1) y += boxH + 8;
    });
    doc.setFontSize(9.5);
  }

  const usignerte = orders.length - signerte.length;
  if (showSignatures && usignerte > 0) {
    ensure(8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    setText(doc, RED);
    doc.text(`Merk: ${usignerte} uttak mangler signatur.`, MARGIN, y);
  }

  /* ---------- Botntekst på alle sider ---------- */
  const left = [
    inv.company.name,
    inv.company.orgNumber ? `Org.nr ${inv.company.orgNumber}` : null,
    inv.company.phone,
  ]
    .filter(Boolean)
    .join(" · ");
  const note = showPrices ? "Internt grunnlag – ikke en faktura." : "Uttaksoversikt – uten priser.";
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    setFill(doc, RED);
    doc.rect(MARGIN, ph - 18, contentW, 0.8, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setText(doc, GREY);
    doc.text(`${left}  ·  ${note}`, MARGIN, ph - 13);
    doc.text(`Side ${i} av ${pages}`, pw - MARGIN, ph - 13, { align: "right" });
  }

  return doc;
}

export function downloadInvoicePDF(inv: InvoiceDoc, opts: InvoiceOptions = {}) {
  const doc = buildInvoicePDF(inv, opts);
  const suffix = opts.showPrices ? "med_pris" : "uten_pris";
  doc.save(`fakturagrunnlag_${inv.invoice_number}_${safeName(inv.customer_name)}_${suffix}.pdf`);
}
