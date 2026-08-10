import jsPDF from "jspdf";
// Nedskalert logo: full oppløysing gav PDF-ar på fleire megabyte
import hmLogo from "@/assets/hm-logo-pdf.png";
import { dateTime, isoDate, kr, num, pipeLabel, shortDate } from "@/lib/format";
import { ORDER_STATUS_LABEL } from "@/lib/types";
import type { PipeOrderLineRow, PipeOrderRow } from "@/lib/types";

// Forholdet må haldast, elles blir merket klemt
const LOGO_RATIO = 278 / 450;

const BLACK: [number, number, number] = [17, 17, 17];
const RED: [number, number, number] = [211, 18, 28];
const GREY: [number, number, number] = [110, 110, 110];
const ZEBRA: [number, number, number] = [247, 247, 247];
const HAIRLINE: [number, number, number] = [222, 222, 222];

const MARGIN = 16;

export type CompanyInfo = {
  name: string;
  orgNumber?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type OrderPdfDoc = {
  order: PipeOrderRow;
  lines: PipeOrderLineRow[];
  company: CompanyInfo;
};

/** Ei samanslått linje i plukklista */
type MergedLine = { name: string; dimension: string | null; sku: string | null; unit: string; quantity: number };

/* ---------- Små hjelparar ---------- */

const setText = (doc: jsPDF, c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
const setFill = (doc: jsPDF, c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
const setDraw = (doc: jsPDF, c: [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2]);

/** Filnamn utan teikn som Windows eller nettlesaren kan surre med */
const safeName = (s: string) =>
  (s || "").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "") || "kunde";

/** Meter og stykk kan ikkje leggjast saman – kvar eining må summerast for seg */
const unitSums = (lines: { unit: string; quantity: number }[]) => {
  const per = new Map<string, number>();
  lines.forEach((l) => per.set(l.unit, (per.get(l.unit) || 0) + (l.quantity || 0)));
  return [...per.entries()]
    .map(([unit, qty]) => `${num(Math.round(qty * 10000) / 10000)} ${unit}`)
    .join("   ");
};

/** Topp: logo til venstre, tittel og to grå linjer til høgre, raud strek under.
 *  Returnerer y-posisjonen der innhaldet kan starte. */
function drawHeader(doc: jsPDF, title: string, company: CompanyInfo, rightLine?: string) {
  const pw = doc.internal.pageSize.getWidth();
  const contentW = pw - MARGIN * 2;

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
  doc.text(title, pw - MARGIN, 22, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  setText(doc, GREY);
  doc.text(company.name, pw - MARGIN, 28, { align: "right" });
  if (rightLine) doc.text(rightLine, pw - MARGIN, 33.5, { align: "right" });

  const y = 14 + logoH + 6;
  setFill(doc, RED);
  doc.rect(MARGIN, y, contentW, 1.4, "F");
  return y + 10;
}

/** Botntekst blir teikna til slutt – først då veit vi kor mange sider det blei */
function drawFooter(doc: jsPDF, company: CompanyInfo, note?: string) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const contentW = pw - MARGIN * 2;
  const left = [company.name, company.orgNumber ? `Org.nr ${company.orgNumber}` : null, company.phone]
    .filter(Boolean)
    .join(" · ");

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    setFill(doc, RED);
    doc.rect(MARGIN, ph - 18, contentW, 0.8, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setText(doc, GREY);
    doc.text(note ? `${left}  ·  ${note}` : left, MARGIN, ph - 13);
    doc.text(`Side ${i} av ${pages}`, pw - MARGIN, ph - 13, { align: "right" });
  }
}

/* ---------- Uttaksseddel for éi bestilling ---------- */

export function buildOrderPDF(docInput: OrderPdfDoc, opts: { showPrices?: boolean } = {}) {
  const { showPrices = false } = opts;
  const { order, lines, company } = docInput;

  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const contentW = pw - MARGIN * 2;
  const bottomLimit = ph - 26;

  let y = drawHeader(doc, "UTTAKSSEDDEL", company, `Nr. ${order.order_number}`);

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

  // Tomme felt blir hoppa over – ei linje med berre "–" seier ingenting
  const row = (label: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === "") return;
    ensure(8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    setText(doc, GREY);
    doc.text(label, MARGIN, y);
    doc.setFont("helvetica", "bold");
    setText(doc, BLACK);
    const wrapped = doc.splitTextToSize(String(value), contentW - 42);
    doc.text(wrapped, MARGIN + 40, y);
    y += 5.6 * wrapped.length;
  };

  sectionTitle("Uttak");
  row("Kunde", order.customer_name);
  row("Firma", order.company);
  row("Prosjekt", order.project);
  row("Telefon", order.customer_phone);
  row("Dato", dateTime(order.created_at));
  row("Status", ORDER_STATUS_LABEL[order.status] ?? order.status);
  y += 4;

  /* ---------- Varetabell ---------- */
  sectionTitle("Varer");

  const colValue = pw - MARGIN;
  const colUnit = showPrices ? pw - MARGIN - 50 : pw - MARGIN - 14;
  const colQty = showPrices ? pw - MARGIN - 62 : pw - MARGIN - 26;
  const colSku = showPrices ? MARGIN + 82 : MARGIN + 96;
  const nameW = colSku - MARGIN - 6;

  const tableHeader = () => {
    ensure(12);
    setFill(doc, BLACK);
    doc.rect(MARGIN, y - 4.4, contentW, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text("VARE", MARGIN + 2, y);
    doc.text("VARENR", colSku, y);
    doc.text("MENGDE", colQty, y, { align: "right" });
    doc.text("ENHET", colUnit, y);
    if (showPrices) doc.text("BELØP", colValue, y, { align: "right" });
    y += 6.5;
  };

  tableHeader();
  doc.setFontSize(9.5);

  lines.forEach((line, i) => {
    const nameLines = doc.splitTextToSize(pipeLabel(line.name, line.dimension), nameW);
    const rowH = Math.max(6.4, 4.6 * nameLines.length + 2);

    if (y + rowH > bottomLimit) {
      newPage();
      tableHeader();
      doc.setFontSize(9.5);
    }

    if (i % 2 === 1) {
      setFill(doc, ZEBRA);
      doc.rect(MARGIN, y - 4.2, contentW, rowH, "F");
    }

    doc.setFont("helvetica", "bold");
    setText(doc, BLACK);
    doc.text(nameLines, MARGIN + 2, y);

    doc.setFont("helvetica", "normal");
    setText(doc, GREY);
    doc.text(doc.splitTextToSize(line.sku || "–", colQty - colSku - 8)[0], colSku, y);

    doc.setFont("helvetica", "bold");
    setText(doc, BLACK);
    doc.text(num(line.quantity), colQty, y, { align: "right" });

    doc.setFont("helvetica", "normal");
    setText(doc, GREY);
    doc.text(line.unit, colUnit, y);

    if (showPrices) {
      doc.setFont("helvetica", "bold");
      setText(doc, BLACK);
      // Manglar prisen, seier vi det rett ut i staden for å skrive 0,00
      doc.text(line.line_total === null || line.line_total === undefined ? "–" : kr(line.line_total), colValue, y, {
        align: "right",
      });
    }

    y += rowH;
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
  doc.text(showPrices ? `${kr(order.total)} kr` : unitSums(lines), pw - MARGIN, y, { align: "right" });
  y += 9;

  /* ---------- Kommentar frå kunden ---------- */
  if (order.comment) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    const wrapped = doc.splitTextToSize(order.comment, contentW - 8);
    ensure(5 * wrapped.length + 16);
    sectionTitle("Kommentar");
    setFill(doc, ZEBRA);
    doc.rect(MARGIN, y - 4.5, contentW, 5 * wrapped.length + 4, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    setText(doc, BLACK);
    doc.text(wrapped, MARGIN + 3, y);
    y += 5 * wrapped.length + 8;
  }

  /* ---------- Signatur ---------- */
  ensure(42);
  sectionTitle("Kvittering");
  const sigW = 68;
  const sigH = 26;
  setDraw(doc, HAIRLINE);
  doc.rect(MARGIN, y - 2, sigW, sigH);
  if (order.signature) {
    try {
      doc.addImage(order.signature, "PNG", MARGIN + 2, y, sigW - 4, sigH - 4);
    } catch {
      /* øydelagt data-URL skal ikkje velte heile dokumentet */
    }
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setText(doc, GREY);
  doc.text("Signatur kunde", MARGIN, y + sigH + 3);
  doc.text(order.customer_name, MARGIN + sigW + 8, y + sigH - 2);
  doc.line(MARGIN + sigW + 8, y + sigH, pw - MARGIN, y + sigH);
  doc.text("Hentet av", MARGIN + sigW + 8, y + sigH + 3);

  drawFooter(doc, company, showPrices ? undefined : "Uttaksseddel uten priser.");
  return doc;
}

export function downloadOrderPDF(docInput: OrderPdfDoc, opts: { showPrices?: boolean } = {}) {
  const doc = buildOrderPDF(docInput, opts);
  doc.save(`uttaksseddel_${docInput.order.order_number}_${safeName(docInput.order.customer_name)}.pdf`);
}

/* ---------- Plukkliste for fleire bestillingar ---------- */

export function buildPickListPDF(
  orders: { order: PipeOrderRow; lines: PipeOrderLineRow[] }[],
  company: CompanyInfo,
  opts: { showPrices?: boolean; title?: string } = {},
) {
  const { showPrices = false, title = "PLUKKLISTE" } = opts;

  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const contentW = pw - MARGIN * 2;
  const bottomLimit = ph - 26;

  let y = drawHeader(doc, title, company, `Utskrift ${dateTime(new Date())}`);

  const newPage = () => {
    doc.addPage();
    y = MARGIN + 4;
  };
  const ensure = (needed: number) => {
    if (y + needed > bottomLimit) newPage();
  };

  const sectionTitle = (t: string) => {
    ensure(14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    setText(doc, BLACK);
    doc.text(t.toUpperCase(), MARGIN, y);
    setDraw(doc, RED);
    doc.setLineWidth(0.6);
    doc.line(MARGIN, y + 1.8, MARGIN + doc.getTextWidth(t.toUpperCase()), y + 1.8);
    doc.setLineWidth(0.2);
    y += 7.5;
  };

  /* ---------- Samla plukk: dette er lista lagerarbeidaren går etter ---------- */
  const merged: MergedLine[] = [];
  orders.forEach((o) =>
    o.lines.forEach((l) => {
      const hit = merged.find(
        (m) => m.name === l.name && (m.dimension || "") === (l.dimension || "") && m.unit === l.unit,
      );
      if (hit) {
        hit.quantity = Math.round((hit.quantity + l.quantity) * 10000) / 10000;
      } else {
        merged.push({ name: l.name, dimension: l.dimension, sku: l.sku, unit: l.unit, quantity: l.quantity });
      }
    }),
  );
  // Hyllenummeret ligg ikkje på ordrelinja, så namnet er det næraste vi kjem
  merged.sort((a, b) => pipeLabel(a.name, a.dimension).localeCompare(pipeLabel(b.name, b.dimension), "nb"));

  const colUnit = pw - MARGIN - 14;
  const colQty = pw - MARGIN - 26;
  const colSku = MARGIN + 96;
  const boxX = MARGIN + 2;
  const nameX = MARGIN + 9;

  sectionTitle("Samlet plukk");

  const summaryHeader = () => {
    ensure(12);
    setFill(doc, BLACK);
    doc.rect(MARGIN, y - 4.4, contentW, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text("VARE", nameX, y);
    doc.text("VARENR", colSku, y);
    doc.text("MENGDE", colQty, y, { align: "right" });
    doc.text("ENHET", colUnit, y);
    y += 6.5;
  };

  summaryHeader();
  doc.setFontSize(9.5);

  merged.forEach((item, i) => {
    const nameLines = doc.splitTextToSize(pipeLabel(item.name, item.dimension), colSku - nameX - 6);
    const rowH = Math.max(7, 4.6 * nameLines.length + 2.6);

    if (y + rowH > bottomLimit) {
      newPage();
      summaryHeader();
      doc.setFontSize(9.5);
    }

    if (i % 2 === 1) {
      setFill(doc, ZEBRA);
      doc.rect(MARGIN, y - 4.4, contentW, rowH, "F");
    }

    // Avkryssingsboks: plukkinga skjer med lista i handa
    setDraw(doc, GREY);
    doc.rect(boxX, y - 3.4, 3.8, 3.8);

    doc.setFont("helvetica", "bold");
    setText(doc, BLACK);
    doc.text(nameLines, nameX, y);

    doc.setFont("helvetica", "normal");
    setText(doc, GREY);
    doc.text(doc.splitTextToSize(item.sku || "–", colQty - colSku - 8)[0], colSku, y);

    doc.setFont("helvetica", "bold");
    setText(doc, BLACK);
    doc.text(num(item.quantity), colQty, y, { align: "right" });

    doc.setFont("helvetica", "normal");
    setText(doc, GREY);
    doc.text(item.unit, colUnit, y);

    y += rowH;
  });

  ensure(14);
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
  doc.text(
    showPrices
      ? `${kr(orders.reduce((sum, o) => sum + (o.order.total || 0), 0))} kr`
      : unitSums(merged),
    pw - MARGIN,
    y,
    { align: "right" },
  );
  y += 12;

  /* ---------- Ein blokk per bestilling ---------- */
  sectionTitle(`Bestillinger (${orders.length})`);

  orders.forEach(({ order, lines }) => {
    ensure(20);

    setFill(doc, ZEBRA);
    doc.rect(MARGIN, y - 4.6, contentW, 7.2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    setText(doc, BLACK);
    doc.text(`#${order.order_number}  ${order.customer_name}`, MARGIN + 2, y);
    doc.setFont("helvetica", "normal");
    setText(doc, GREY);
    const meta = [order.project, order.company, shortDate(order.created_at)].filter(Boolean).join(" · ");
    doc.text(doc.splitTextToSize(meta, contentW / 2 - 6)[0] || "", pw - MARGIN, y, { align: "right" });
    y += 8.4;

    lines.forEach((line) => {
      const nameLines = doc.splitTextToSize(pipeLabel(line.name, line.dimension), colQty - nameX - 10);
      const rowH = Math.max(5.6, 4.4 * nameLines.length + 1.4);
      ensure(rowH + 2);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      setText(doc, BLACK);
      doc.text(nameLines, nameX, y);

      doc.setFont("helvetica", "bold");
      doc.text(num(line.quantity), colQty, y, { align: "right" });
      doc.setFont("helvetica", "normal");
      setText(doc, GREY);
      doc.text(line.unit, colUnit, y);
      y += rowH;
    });

    if (order.comment) {
      const wrapped = doc.splitTextToSize(`Kommentar: ${order.comment}`, contentW - 12);
      ensure(4.2 * wrapped.length + 2);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      setText(doc, GREY);
      doc.text(wrapped, nameX, y);
      y += 4.2 * wrapped.length;
    }

    setDraw(doc, HAIRLINE);
    doc.line(MARGIN, y + 1, pw - MARGIN, y + 1);
    y += 7;
  });

  drawFooter(doc, company, "Plukkliste");
  return doc;
}

export function downloadPickListPDF(
  orders: { order: PipeOrderRow; lines: PipeOrderLineRow[] }[],
  company: CompanyInfo,
  opts: { showPrices?: boolean; title?: string } = {},
) {
  const doc = buildPickListPDF(orders, company, opts);
  doc.save(`plukkliste_${isoDate()}.pdf`);
}
