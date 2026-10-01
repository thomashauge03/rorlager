import React from "react";
import { TELEFON_B, TELEFON_H } from "./Telefon";

/**
 * Plasserer telefonen i bildet: midtpunkt (x, y), vridning i rommet og
 * `zoom`. Zoomen gis videre til telefonen (CSS-zoom, skarpt); her flyttes
 * og vris den bare.
 */
export const Rigg: React.FC<{
  x: number;
  y: number;
  zoom: number;
  rx?: number;
  ry?: number;
  rz?: number;
  /** Lite støt ved trykk (1 = i ro) */
  stot?: number;
  opacity?: number;
  children: (zoom: number) => React.ReactNode;
}> = ({ x, y, zoom, rx = 0, ry = 0, rz = 0, stot = 1, opacity = 1, children }) => {
  const b = TELEFON_B * zoom;
  const h = TELEFON_H * zoom;
  return (
    <div
      style={{
        position: "absolute",
        left: x - b / 2,
        top: y - h / 2,
        width: b,
        height: h,
        transform: `perspective(2600px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${stot})`,
        opacity,
      }}
    >
      {children(zoom)}
    </div>
  );
};

/** Et punkt på skjermen (skjermens punkter) → punkt i bildet, for en telefon uten vridning. */
export const skjermTilBilde = (rigg: { x: number; y: number; zoom: number }, p: { x: number; y: number }) => ({
  x: rigg.x - (TELEFON_B * rigg.zoom) / 2 + (12 + p.x) * rigg.zoom,
  y: rigg.y - (TELEFON_H * rigg.zoom) / 2 + (12 + p.y) * rigg.zoom,
});
