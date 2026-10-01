import { noise2D } from "@remotion/noise";
import React from "react";
import { AVLOPSROR, BEND } from "../data";
import { useBilde } from "../felles/Tempo";
import { DELEHYLLE_ETIKETT, DELEHYLLE_KODE, DELEHYLLE_VIEWBOX, Delehylle } from "../tegning/Delehylle";
import { Rorhylle, RORHYLLE_KODE, RORHYLLE_SKILT, RORHYLLE_VIEWBOX } from "../tegning/Rorhylle";

/**
 * Det kameraet ser. Alt er tegnet, og posisjonene regnes fra tegningenes
 * egne mål, så søkerrammen vet nøyaktig hvor koden står.
 *
 *   skilt    hylleskiltet på rørreolen (telefonens kamera, steg 1)
 *   etikett  etiketten på hyllekanten under bendene (appens skanner, steg 3).
 *            `pan` 0 → 1 fører bildet fra kassen med bend ned til etiketten.
 */
export type MotivType = "skilt" | "etikett";

/** Hvor QR-koden står i motivet, i motivets punkter (for søkerrammen). */
export type Kodeflate = { x: number; y: number; s: number };

export const motivOppsett = (type: MotivType, b: number, h: number, pan = 1) => {
  if (type === "skilt") {
    // Skiltet fyller fire femtedeler av bredden, litt over midten
    const k = (b * 0.78) / RORHYLLE_SKILT.b;
    const left = b / 2 - (RORHYLLE_SKILT.x + RORHYLLE_SKILT.b / 2) * k;
    const top = h * 0.46 - (RORHYLLE_SKILT.y + RORHYLLE_SKILT.h / 2) * k;
    const kode: Kodeflate = { x: left + RORHYLLE_KODE.x * k, y: top + RORHYLLE_KODE.y * k, s: RORHYLLE_KODE.s * k };
    return { bredde: RORHYLLE_VIEWBOX.b * k, left, top, kode, under: top + (RORHYLLE_SKILT.y + RORHYLLE_SKILT.h) * k };
  }
  // Etiketten fyller tre femtedeler av bredden. Ferdig panorert står koden
  // midt i bildet, der skannerens ramme er; før det ser vi kassen over.
  const k = (b * 0.6) / DELEHYLLE_ETIKETT.b;
  const kx = (DELEHYLLE_KODE.x + DELEHYLLE_KODE.s / 2) * k;
  const ky = (DELEHYLLE_KODE.y + DELEHYLLE_KODE.s / 2) * k;
  const left = b / 2 - kx;
  const top = h / 2 - ky + (1 - pan) * h * 0.42;
  const kode: Kodeflate = { x: left + DELEHYLLE_KODE.x * k, y: top + DELEHYLLE_KODE.y * k, s: DELEHYLLE_KODE.s * k };
  return { bredde: DELEHYLLE_VIEWBOX.b * k, left, top, kode, under: top + (DELEHYLLE_ETIKETT.y + DELEHYLLE_ETIKETT.h) * k };
};

/** Underkanten av skiltet eller etiketten akkurat nå, i motivets punkter (for lenkeboblen). */
export const underkantNå = (type: MotivType, b: number, h: number, f: number, pan = 1) => motivOppsett(type, b, h, pan).under + hand(f).dy;

/** Den håndholdte bevegelsen: små, myke utslag, som når noen holder telefonen. */
const hand = (f: number) => ({
  dx: noise2D("hx", f * 0.018, 0) * 7,
  dy: noise2D("hy", f * 0.018, 3) * 6,
  rot: noise2D("hr", f * 0.014, 7) * 0.5,
});

export const Motiv: React.FC<{
  type: MotivType;
  b: number;
  h: number;
  pan?: number;
  handholdt?: boolean;
}> = ({ type, b, h, pan = 1, handholdt = true }) => {
  const f = useBilde();
  const { dx, dy, rot } = handholdt ? hand(f) : { dx: 0, dy: 0, rot: 0 };
  const o = motivOppsett(type, b, h, pan);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#16181b" }}>
      <div style={{ position: "absolute", inset: -20, transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg)` }}>
        <div style={{ position: "absolute", left: 20, top: 20, width: b, height: h }}>
          {type === "skilt" && (
            <>
              {/* Lageret bak reolen, og lyset fra taket over skiltet */}
              <div style={{ position: "absolute", inset: -40, background: "linear-gradient(180deg, #24272b 0%, #1a1c1f 60%, #2b2e33 100%)" }} />
              <div style={{ position: "absolute", left: o.left, top: o.top }}>
                <Rorhylle bredde={o.bredde} vare={AVLOPSROR} utenSkygge />
              </div>
              <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 70% 55% at 50% 46%, rgba(255,250,240,0.10), rgba(0,0,0,0.35) 100%)" }} />
            </>
          )}
          {type === "etikett" && (
            <div style={{ position: "absolute", left: o.left, top: o.top }}>
              <Delehylle bredde={o.bredde} vare={BEND} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/** Der koden står i motivet akkurat nå, med den håndholdte bevegelsen. */
export const kodeNå = (type: MotivType, b: number, h: number, f: number, pan = 1, handholdt = true): Kodeflate => {
  const o = motivOppsett(type, b, h, pan);
  const { dx, dy } = handholdt ? hand(f) : { dx: 0, dy: 0 };
  return { x: o.kode.x + dx, y: o.kode.y + dy, s: o.kode.s };
};
