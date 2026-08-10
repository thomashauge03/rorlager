import jsPDF from "jspdf";
import QRCode from "qrcode";
// Nedskalert logo: full oppløysing gav PDF-ar på fleire megabyte
import hmLogo from "@/assets/hm-logo-pdf.png";
import { isoDate, kr, longDate } from "@/lib/format";

// Forholdet må haldast, elles blir merket klemt
const LOGO_RATIO = 278 / 450;

const BLACK: [number, number, number] = [17, 17, 17];
const RED: [number, number, number] = [211, 18, 28];
const GREY: [number, number, number] = [110, 110, 110];
const HAIRLINE: [number, number, number] = [222, 222, 222];

/** Rørtypen slik etikettane treng henne – berre felta som faktisk blir trykte. */
export type LabelPipe = {
  name: string;
  dimension?: string | null;
  sku?: string | null;
  qr_slug: string;
  unit: string;
  price?: number | null;
  location?: string | null;
  category_name?: string | null;
};

export type LabelSheetOptions = {
  perRow?: 2 | 3;
  showPrice?: boolean;
  baseUrl?: string;
  companyName?: string;
};

export type ShelfSignOptions = {
  showPrice?: boolean;
  baseUrl?: string;
  companyName?: string;
};

const DEFAULT_COMPANY = "Hauge Maskin AS";

/* ------------------------------------------------------------------ */
/*  Adresse og QR                                                      */
/* ------------------------------------------------------------------ */

/**
 * Adressa kunden hamnar på når han skannar etiketten.
 * Etterfølgjande skråstrek blir fjerna frå basen – elles blir det "//r/" i lenkja,
 * og somme QR-lesarar viser det som eit anna domene.
 */
export function pipeUrl(slug: string, baseUrl?: string): string {
  const raw = baseUrl ?? (typeof window !== "undefined" ? window.location.origin : "");
  const base = String(raw ?? "").replace(/\/+$/, "");
  return `${base}/r/${slug}`;
}

/**
 * QR som data-URL.
 * "M" og ikkje "H": etikettane blir skitne i eit lager, men URL-ane er korte, og
 * "H" ville gjort mønsteret tettare enn nødvendig – det er verre for eit kamera
 * på avstand enn litt slitasje er. "M" med god margin er rett kompromiss.
 */
export async function qrDataUrl(text: string, sizePx = 512): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: sizePx,
    color: { dark: "#111111", light: "#FFFFFF" },
  });
}

/* ------------------------------------------------------------------ */
/*  Felles hjelparar                                                   */
/* ------------------------------------------------------------------ */

/** Linjehøgd i mm for ei punktstorleik – jsPDF reknar i punkt, arket i mm. */
const lh = (pt: number, factor = 1.2) => pt * 0.3528 * factor;

const priceLabel = (unit: string) => (unit === "m" ? "Pris per meter" : "Pris per stk");

const safeFileName = (s: string) =>
  String(s ?? "")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase() || "etikett";

/**
 * Genererer QR-ane på førehand. Ein kode som ikkje let seg lage skal berre gi ei
 * tom rute på arket – ikkje velte trykkjobben for alle dei andre hyllene.
 */
async function qrBatch(pipes: LabelPipe[], sizePx: number, baseUrl?: string): Promise<(string | null)[]> {
  const results = await Promise.all(
    pipes.map(async (p) => {
      try {
        return await qrDataUrl(pipeUrl(p.qr_slug, baseUrl), sizePx);
      } catch {
        return null;
      }
    }),
  );
  return results;
}

/** Tom rute med forklaring, slik at den som trykkjer ser kva som mangla. */
function drawMissingQr(doc: jsPDF, x: number, y: number, size: number) {
  doc.setDrawColor(HAIRLINE[0], HAIRLINE[1], HAIRLINE[2]);
  doc.setLineWidth(0.3);
  doc.rect(x, y, size, size);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(Math.max(6, size * 0.22));
  doc.setTextColor(GREY[0], GREY[1], GREY[2]);
  doc.text("QR mangler", x + size / 2, y + size / 2 + 1, { align: "center" });
}

/* ------------------------------------------------------------------ */
/*  Etikettark (A4 ståande)                                            */
/* ------------------------------------------------------------------ */

// Måla er valde slik at eit ark blir fullt utnytta: 2 per rad gir 10 etikettar,
// 3 per rad gir 18.
const LAYOUT = {
  2: { labelH: 46, qr: 32, pad: 4, name: 11, dim: 15, small: 7.5, slug: 6.5, priceSize: 9 },
  3: { labelH: 34, qr: 22, pad: 3.2, name: 8.5, dim: 11.5, small: 6.2, slug: 5.4, priceSize: 7.5 },
} as const;

export async function buildLabelSheetPDF(pipes: LabelPipe[], opts: LabelSheetOptions = {}): Promise<jsPDF> {
  const { perRow = 2, showPrice = false, baseUrl, companyName = DEFAULT_COMPANY } = opts;
  const cfg = LAYOUT[perRow] ?? LAYOUT[2];
  const list = pipes ?? [];

  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 10;
  const contentW = pw - margin * 2;
  const gap = 4;
  const labelW = (contentW - gap * (perRow - 1)) / perRow;

  const setColor = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);

  // Prent QR-ane i om lag 300 dpi – lågare gir synleg trapping på limte etikettar
  const qrPx = Math.round((cfg.qr / 25.4) * 300);
  const codes = await qrBatch(list, qrPx, baseUrl);

  const gridTop = 28;

  const drawHeader = () => {
    const logoW = 22;
    try {
      doc.addImage(hmLogo, "PNG", margin, 8, logoW, logoW * LOGO_RATIO);
    } catch {
      /* held fram utan logo */
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    setColor(BLACK);
    doc.text("QR-ETIKETTER", pw - margin, 13, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setColor(GREY);
    doc.text(`${companyName} · ${longDate(new Date())}`, pw - margin, 18, { align: "right" });
    doc.setFillColor(RED[0], RED[1], RED[2]);
    doc.rect(margin, 23.5, contentW, 0.9, "F");
  };

  const rows = Math.max(1, Math.floor((ph - gridTop - margin + gap) / (cfg.labelH + gap)));
  const perPage = rows * perRow;

  drawHeader();

  if (list.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    setColor(GREY);
    doc.text("Ingen rørtyper er valgt.", margin, gridTop + 8);
    return doc;
  }

  list.forEach((pipe, i) => {
    const onPage = i % perPage;
    if (i > 0 && onPage === 0) {
      doc.addPage();
      drawHeader();
    }
    const col = onPage % perRow;
    const row = Math.floor(onPage / perRow);
    const x = margin + col * (labelW + gap);
    const y = gridTop + row * (cfg.labelH + gap);

    // Klipperamme: stipla så det er tydeleg kvar saksa skal gå
    doc.setDrawColor(HAIRLINE[0], HAIRLINE[1], HAIRLINE[2]);
    doc.setLineWidth(0.2);
    setDash(doc, true);
    doc.rect(x, y, labelW, cfg.labelH);
    setDash(doc, false);

    const qrX = x + cfg.pad;
    const qrY = y + cfg.pad;
    const code = codes[i];
    if (code) {
      try {
        doc.addImage(code, "PNG", qrX, qrY, cfg.qr, cfg.qr);
      } catch {
        drawMissingQr(doc, qrX, qrY, cfg.qr);
      }
    } else {
      drawMissingQr(doc, qrX, qrY, cfg.qr);
    }

    // Kortkoden under QR-en: kan tastast manuelt om kameraet ikkje vil
    doc.setFont("helvetica", "normal");
    doc.setFontSize(cfg.slug);
    setColor(GREY);
    doc.text(pipe.qr_slug ?? "", qrX + cfg.qr / 2, qrY + cfg.qr + 3.2, { align: "center" });

    const tx = qrX + cfg.qr + cfg.pad;
    const tw = x + labelW - cfg.pad - tx;
    let ty = y + cfg.pad + lh(cfg.name);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(cfg.name);
    setColor(BLACK);
    const nameLines = doc.splitTextToSize(pipe.name ?? "", tw) as string[];
    const shown = nameLines.slice(0, 2);
    if (nameLines.length > 2) shown[1] = `${shown[1]} …`;
    shown.forEach((line) => {
      doc.text(line, tx, ty);
      ty += lh(cfg.name);
    });

    if (pipe.dimension) {
      ty += 1;
      doc.setFontSize(cfg.dim);
      ty += lh(cfg.dim) - lh(cfg.name);
      doc.text(doc.splitTextToSize(pipe.dimension, tw)[0], tx, ty);
      ty += 1;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(cfg.small);
    setColor(GREY);
    if (pipe.sku) {
      ty += lh(cfg.small);
      doc.text(`Varenr. ${pipe.sku}`, tx, ty);
    }
    if (pipe.location) {
      ty += lh(cfg.small);
      doc.text(`Hylle ${pipe.location}`, tx, ty);
    }

    if (showPrice) {
      ty += lh(cfg.priceSize) + 0.8;
      doc.setFontSize(cfg.small);
      setColor(GREY);
      doc.text(priceLabel(pipe.unit), tx, ty);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(cfg.priceSize);
      setColor(RED);
      // Manglar prisen, seier vi det rett ut i staden for å trykkje 0,00 på hylla
      const text = pipe.price === null || pipe.price === undefined ? "–" : `${kr(pipe.price)} kr`;
      doc.text(text, x + labelW - cfg.pad, ty, { align: "right" });
    }
  });

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    setColor(GREY);
    doc.text("Klipp langs rammene og lim på hyllekanten.", margin, ph - 6);
    doc.text(`Side ${p} av ${pages}`, pw - margin, ph - 6, { align: "right" });
  }

  return doc;
}

export async function downloadLabelSheetPDF(pipes: LabelPipe[], opts: LabelSheetOptions = {}): Promise<void> {
  const doc = await buildLabelSheetPDF(pipes, opts);
  doc.save(`qr_etiketter_${isoDate()}.pdf`);
}

/* ------------------------------------------------------------------ */
/*  Hylleskilt (A5 liggjande)                                          */
/* ------------------------------------------------------------------ */

/**
 * Skiltet som faktisk heng på hylla. Alt her er dimensjonert for å lesast på tre
 * meters avstand, difor éin rørtype per ark og lite anna på flata.
 */
export async function buildShelfSignPDF(pipe: LabelPipe, opts: ShelfSignOptions = {}): Promise<jsPDF> {
  const { showPrice = false, baseUrl, companyName = DEFAULT_COMPANY } = opts;

  const doc = new jsPDF({ unit: "mm", format: "a5", orientation: "landscape", compress: true });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 12;

  const setColor = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);

  const qrSize = 70;
  const qrX = margin + 2;
  const qrY = 24;

  let code: string | null = null;
  try {
    code = await qrDataUrl(pipeUrl(pipe.qr_slug, baseUrl), 900);
  } catch {
    code = null;
  }

  // Raud kant øvst: skiltet skal kjennast att som Hauge Maskin på lang lei
  doc.setFillColor(RED[0], RED[1], RED[2]);
  doc.rect(0, 0, pw, 6, "F");

  if (code) {
    try {
      doc.addImage(code, "PNG", qrX, qrY, qrSize, qrSize);
    } catch {
      drawMissingQr(doc, qrX, qrY, qrSize);
    }
  } else {
    drawMissingQr(doc, qrX, qrY, qrSize);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  setColor(GREY);
  doc.text(pipe.qr_slug ?? "", qrX + qrSize / 2, qrY + qrSize + 6, { align: "center" });

  const tx = qrX + qrSize + 10;
  const tw = pw - margin - tx;
  let ty = qrY - 2;

  if (pipe.category_name) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    setColor(RED);
    doc.text(String(pipe.category_name).toUpperCase(), tx, ty);
    ty += 7;
  } else {
    ty += 5;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  setColor(BLACK);
  const nameLines = (doc.splitTextToSize(pipe.name ?? "", tw) as string[]).slice(0, 2);
  ty += lh(22);
  nameLines.forEach((line, i) => {
    doc.text(line, tx, ty + i * lh(22));
  });
  ty += (nameLines.length - 1) * lh(22);

  if (pipe.dimension) {
    doc.setFontSize(36);
    ty += lh(36) - 1;
    doc.text(doc.splitTextToSize(pipe.dimension, tw)[0], tx, ty);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  setColor(GREY);
  if (pipe.sku) {
    ty += lh(11) + 2;
    doc.text(`Varenr. ${pipe.sku}`, tx, ty);
  }
  if (pipe.location) {
    ty += lh(11) + 1;
    doc.text(`Hylle ${pipe.location}`, tx, ty);
  }

  if (showPrice) {
    ty += lh(16) + 3;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    setColor(GREY);
    doc.text(priceLabel(pipe.unit), tx, ty);
    ty += lh(16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    setColor(RED);
    doc.text(pipe.price === null || pipe.price === undefined ? "–" : `${kr(pipe.price)} kr`, tx, ty);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  setColor(BLACK);
  doc.text("Skann for å registrere uttak", margin + 2, ph - 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  setColor(GREY);
  doc.text(companyName, margin + 2, ph - 8);

  const logoW = 26;
  try {
    doc.addImage(hmLogo, "PNG", pw - margin - logoW, ph - 10 - logoW * LOGO_RATIO, logoW, logoW * LOGO_RATIO);
  } catch {
    /* held fram utan logo */
  }

  return doc;
}

export async function downloadShelfSignPDF(pipe: LabelPipe, opts: ShelfSignOptions = {}): Promise<void> {
  const doc = await buildShelfSignPDF(pipe, opts);
  const navn = safeFileName([pipe.name, pipe.dimension].filter(Boolean).join(" "));
  doc.save(`hylleskilt_${navn}.pdf`);
}

/* ------------------------------------------------------------------ */

/** setLineDashPattern finst ikkje i alle jsPDF-byggja – ei solid ramme er
 *  betre enn eit unntak midt i utskrifta. */
function setDash(doc: jsPDF, on: boolean) {
  const fn = (doc as any).setLineDashPattern;
  if (typeof fn === "function") fn.call(doc, on ? [1.2, 1.2] : [], 0);
}
