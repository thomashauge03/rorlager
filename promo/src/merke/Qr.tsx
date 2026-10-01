import React from "react";
import { QR } from "./qr-data";

/**
 * QR-koden som én sti: hver rad av mørke moduler blir ett rektangel, så
 * kanten mellom modulene aldri får hårfine sprekker når koden skaleres.
 * Koordinatene er moduler, (0, 0) øverst til venstre i selve koden.
 */
export const QR_STI = (() => {
  const n = QR.storrelse;
  let d = "";
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      if (QR.moduler[y * n + x] !== "1") { x++; continue; }
      const start = x;
      while (x < n && QR.moduler[y * n + x] === "1") x++;
      d += `M${start} ${y}h${x - start}v1h${start - x}z`;
    }
  }
  return d;
})();

/** Antall moduler inkludert stille sone på hver side. */
export const qrModuler = (sone: number) => QR.storrelse + sone * 2;

/**
 * Koden som en gruppe inne i en annen SVG: en hvit, kvadratisk flate på
 * (x, y) med side `s`, med stille sone rundt.
 */
export const QrGruppe: React.FC<{ x: number; y: number; s: number; sone?: number; farge?: string; bakgrunn?: string }> = ({
  x,
  y,
  s,
  sone = 4,
  farge = "#0b0b0c",
  bakgrunn = "#ffffff",
}) => {
  const k = s / qrModuler(sone);
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`} shapeRendering="crispEdges">
      <rect x={0} y={0} width={qrModuler(sone)} height={qrModuler(sone)} fill={bakgrunn} />
      <path d={QR_STI} fill={farge} transform={`translate(${sone} ${sone})`} />
    </g>
  );
};

/** Koden som eget element. */
export const Qr: React.FC<{ storrelse: number; farge?: string; bakgrunn?: string; sone?: number }> = ({
  storrelse,
  farge,
  bakgrunn,
  sone = 4,
}) => (
  <svg width={storrelse} height={storrelse} viewBox={`0 0 ${storrelse} ${storrelse}`} style={{ display: "block" }}>
    <QrGruppe x={0} y={0} s={storrelse} sone={sone} farge={farge} bakgrunn={bakgrunn} />
  </svg>
);
