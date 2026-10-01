import React from "react";
import { helvetica } from "../fonter";
import { HmLogo, LOGO_FORHOLD } from "../merke/HmLogo";
import { QrGruppe } from "../merke/Qr";

/*
 * Det trykte på hylla, gjenskapt fra src/lib/qr-labels.ts i appen: samme
 * mål i millimeter, samme skriftstørrelser og samme rekkefølge. jsPDF regner
 * i punkt; her står de omregnet (1 pt = 0,3528 mm). Pris er av, som er
 * standard i appen (showPrice = false).
 *
 * QR-mønsteret koder https://haugemaskin.no (merke/qr-data.ts), ikke en
 * rørside. Koden under mønsteret er varens ekte kode.
 */

const SVART = "#111111";
const ROD = "#d3121c";
const GRA = "#6e6e6e";
const PAPIR = "#ffffff";

/** Punkt → millimeter, og linjehøyden jsPDF bruker (lh i qr-labels.ts). */
const pt = (p: number) => p * 0.3528;
const lh = (p: number, faktor = 1.2) => pt(p) * faktor;

export type Vare = { kategori: string; navn: string; dimensjon: string; varenr: string; hylle: string; kode: string };

export const AVLOPSROR: Vare = {
  kategori: "Avløpsrør",
  navn: "Avløpsrør PVC",
  dimensjon: "110 mm",
  varenr: "2251059",
  hylle: "B3",
  kode: "avlopsror-pvc-110-mm",
};

export const BEND: Vare = {
  kategori: "Deler avløp",
  navn: "Bend grunnavløp 45°",
  dimensjon: "110 mm",
  varenr: "2252269",
  hylle: "C1",
  kode: "bend-grunnavlop-45gr-110-mm",
};

/* ------------------------------------------------------------------ */
/*  Hylleskiltet: A5 liggende (buildShelfSignPDF)                      */
/* ------------------------------------------------------------------ */

export const SKILT = { b: 210, h: 148 } as const;
/** QR-koden på skiltet, i skiltets millimeter (med én moduls stille sone, som qrcode-pakken gir). */
export const SKILT_QR = { x: 14, y: 24, s: 70 } as const;

/** Skiltet som gruppe i en annen SVG, i millimeter med (0, 0) øverst til venstre. */
export const HylleskiltGruppe: React.FC<{ v: Vare; refleks?: number }> = ({ v, refleks }) => {
  const tx = SKILT_QR.x + SKILT_QR.s + 10;
  // Plassene står regnet ut som i buildShelfSignPDF: ty starter på qrY − 2
  let ty = SKILT_QR.y - 2;
  const kategoriY = ty;
  ty += 7;
  ty += lh(22);
  const navnY = ty;
  ty += lh(36) - 1;
  const dimY = ty;
  ty += lh(11) + 2;
  const varenrY = ty;
  ty += lh(11) + 1;
  const hylleY = ty;
  const logoB = 26;
  const logoH = logoB / LOGO_FORHOLD;
  return (
    <g fontFamily={helvetica}>
      <rect x={0} y={0} width={SKILT.b} height={SKILT.h} fill={PAPIR} />
      {/* Rød kant øverst: skiltet skal kjennes igjen som Hauge Maskin på lang lei */}
      <rect x={0} y={0} width={SKILT.b} height={6} fill={ROD} />
      <QrGruppe x={SKILT_QR.x} y={SKILT_QR.y} s={SKILT_QR.s} sone={1} farge={SVART} />
      <text x={SKILT_QR.x + SKILT_QR.s / 2} y={SKILT_QR.y + SKILT_QR.s + 6} fontSize={pt(10)} fill={GRA} textAnchor="middle">
        {v.kode}
      </text>
      <text x={tx} y={kategoriY} fontSize={pt(9)} fontWeight={700} fill={ROD}>
        {v.kategori.toUpperCase()}
      </text>
      <text x={tx} y={navnY} fontSize={pt(22)} fontWeight={700} fill={SVART}>
        {v.navn}
      </text>
      <text x={tx} y={dimY} fontSize={pt(36)} fontWeight={700} fill={SVART}>
        {v.dimensjon}
      </text>
      <text x={tx} y={varenrY} fontSize={pt(11)} fill={GRA}>
        Varenr. {v.varenr}
      </text>
      <text x={tx} y={hylleY} fontSize={pt(11)} fill={GRA}>
        Hylle {v.hylle}
      </text>
      <text x={14} y={SKILT.h - 14} fontSize={pt(14)} fontWeight={700} fill={SVART}>
        Skann for å registrere uttak
      </text>
      <text x={14} y={SKILT.h - 8} fontSize={pt(9)} fill={GRA}>
        Hauge Maskin AS
      </text>
      <g transform={`translate(${SKILT.b - 12 - logoB} ${SKILT.h - 10 - logoH})`}>
        <HmLogo hoyde={logoH} />
      </g>
      {/* Lamineringen: en svak glans som kan gli over */}
      {refleks !== undefined && refleks > 0 && refleks < 1 && (
        <rect
          x={-SKILT.b * 0.6 + refleks * SKILT.b * 2}
          y={-20}
          width={SKILT.b * 0.18}
          height={SKILT.h + 40}
          fill="#fff"
          opacity={0.28}
          transform="skewX(-18)"
        />
      )}
    </g>
  );
};

/* ------------------------------------------------------------------ */
/*  Etiketten: etikettarket med to per rad (buildLabelSheetPDF)        */
/* ------------------------------------------------------------------ */

export const ETIKETT = { b: 93, h: 46 } as const;
/** QR-koden på etiketten, i etikettens millimeter. */
export const ETIKETT_QR = { x: 4, y: 4, s: 32 } as const;

/** Etiketten som gruppe i en annen SVG, i millimeter med (0, 0) øverst til venstre. */
export const EtikettGruppe: React.FC<{ v: Vare }> = ({ v }) => {
  const q = ETIKETT_QR;
  const tx = q.x + q.s + 4;
  let ty = 4 + lh(11);
  const navnY = ty;
  ty += lh(11);
  ty += 1;
  ty += lh(15) - lh(11);
  const dimY = ty;
  ty += 1;
  ty += lh(7.5);
  const varenrY = ty;
  ty += lh(7.5);
  const hylleY = ty;
  return (
    <g fontFamily={helvetica}>
      <rect x={0} y={0} width={ETIKETT.b} height={ETIKETT.h} fill={PAPIR} />
      <QrGruppe x={q.x} y={q.y} s={q.s} sone={1} farge={SVART} />
      <text x={q.x + q.s / 2} y={q.y + q.s + 3.2} fontSize={pt(6.5)} fill={GRA} textAnchor="middle">
        {v.kode}
      </text>
      <text x={tx} y={navnY} fontSize={pt(11)} fontWeight={700} fill={SVART}>
        {v.navn}
      </text>
      <text x={tx} y={dimY} fontSize={pt(15)} fontWeight={700} fill={SVART}>
        {v.dimensjon}
      </text>
      <text x={tx} y={varenrY} fontSize={pt(7.5)} fill={GRA}>
        Varenr. {v.varenr}
      </text>
      <text x={tx} y={hylleY} fontSize={pt(7.5)} fill={GRA}>
        Hylle {v.hylle}
      </text>
    </g>
  );
};
