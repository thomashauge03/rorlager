import React from "react";
import { geist } from "../fonter";
import { miks } from "../felles/hjelp";
import { SKJERM_B } from "../felles/Telefon";
import { useBilde } from "../felles/Tempo";
import { kodeNå, Motiv, MotivType, underkantNå } from "./Motiv";

/*
 * Kameraappen på telefonen (fra leiefilmen): søkeren låser seg rundt koden,
 * og lenkeboblen «Åpne siden» kommer fram. Ingen adresse i boblen.
 */

/** Kameraappen, fordelt på innholdsflaten under statuslinja (440 × 917). */
export const KAMERA = { topp: 56, visning: 587, bunn: 274 } as const;
/** Midten av utløserknappen, i innholdsflatens punkter. */
export const UTLOSER = { x: SKJERM_B / 2, y: KAMERA.topp + KAMERA.visning + 128 } as const;

/** Hvor lenkeboblen står når koden er funnet (innholdsflatens punkter). */
export const boblePunkt = (motiv: MotivType, f: number) => {
  // Under hele skiltet, så teksten på det kan leses
  const under = underkantNå(motiv, SKJERM_B, KAMERA.visning, f);
  return { x: SKJERM_B / 2, y: KAMERA.topp + Math.min(under + 44, KAMERA.visning - 36) };
};

const Hjorne: React.FC<{ x: number; y: number; rot: number; storrelse: number }> = ({ x, y, rot, storrelse }) => (
  <svg
    width={storrelse}
    height={storrelse}
    viewBox="0 0 30 30"
    style={{ position: "absolute", left: x, top: y, transform: `rotate(${rot}deg)`, transformOrigin: "0 0", overflow: "visible" }}
  >
    <path d="M2 28 V8 Q2 2 8 2 H28" fill="none" stroke="#fff" strokeWidth={4.5} strokeLinecap="round" style={{ filter: "drop-shadow(0 0 4px rgba(0,0,0,0.5))" }} />
  </svg>
);

export const Kamera: React.FC<{
  motiv: MotivType;
  /** 0–1: søkerhjørnene låser seg rundt koden */
  las?: number;
  /** 0–1: lenkeboblen kommer fram */
  boble?: number;
  /** 0–1: boblen trykkes */
  bobleTrykk?: number;
}> = ({ motiv, las = 0, boble = 0, bobleTrykk = 0 }) => {
  const f = useBilde();
  const V = KAMERA.visning;
  const kode = kodeNå(motiv, SKJERM_B, V, f);
  // Søkerhjørnene: fra en løs ramme midt i bildet til rett rundt koden
  const løs = { x: 70, y: 130, s: SKJERM_B - 140 };
  const r = { x: kode.x - 12, y: kode.y - 12, s: kode.s + 24 };
  const x0 = miks(løs.x, r.x, las);
  const y0 = miks(løs.y, r.y, las);
  const s = miks(løs.s, r.s, las);
  const hj = miks(30, 26, las);
  const bp = boblePunkt(motiv, f);
  return (
    // isolation: boblen (zIndex) skal ikke legge seg over sider som glir inn over kameraet
    <div style={{ position: "absolute", inset: 0, background: "#000", fontFamily: geist, isolation: "isolate" }}>
      {/* Toppen: blits og innstillinger */}
      <div style={{ position: "absolute", left: 0, top: 0, width: SKJERM_B, height: KAMERA.topp, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 26px" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round">
          <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
          <path d="M3 3l18 18" />
        </svg>
        <svg width="16" height="10" viewBox="0 0 16 10" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
          <path d="M2 8l6-6 6 6" />
        </svg>
        <div style={{ width: 26, height: 26, borderRadius: "50%", border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />
        </div>
      </div>

      {/* Søkeren */}
      <div style={{ position: "absolute", left: 0, top: KAMERA.topp, width: SKJERM_B, height: V, overflow: "hidden" }}>
        <Motiv type={motiv} b={SKJERM_B} h={V} />
        {las > 0 && (
          <div style={{ position: "absolute", inset: 0, opacity: Math.min(1, las * 3) }}>
            <Hjorne x={x0} y={y0} rot={0} storrelse={hj} />
            <Hjorne x={x0 + s} y={y0} rot={90} storrelse={hj} />
            <Hjorne x={x0 + s} y={y0 + s} rot={180} storrelse={hj} />
            <Hjorne x={x0} y={y0 + s} rot={270} storrelse={hj} />
          </div>
        )}
      </div>

      {/* Lenkeboblen */}
      {boble > 0 && (
        <div
          style={{
            position: "absolute",
            left: bp.x,
            top: bp.y,
            transform: `translate(-50%, -50%) scale(${(0.85 + 0.15 * boble) * (1 - bobleTrykk * 0.06)})`,
            opacity: boble,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 18px",
            borderRadius: 22,
            background: bobleTrykk > 0.3 ? "#d9d9dc" : "rgba(255,255,255,0.96)",
            color: "#0b0b0c",
            fontSize: 16,
            fontWeight: 600,
            whiteSpace: "nowrap",
            boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
            zIndex: 5,
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0b0b0c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
            <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
          </svg>
          Åpne siden
        </div>
      )}

      {/* Bunnen: modus, utløser, galleri og snu */}
      <div style={{ position: "absolute", left: 0, top: KAMERA.topp + V, width: SKJERM_B, height: KAMERA.bunn }}>
        <div style={{ position: "absolute", top: 20, width: "100%", display: "flex", justifyContent: "center", gap: 26, fontSize: 13, fontWeight: 600, letterSpacing: "0.06em" }}>
          <span style={{ color: "rgba(255,255,255,0.75)" }}>VIDEO</span>
          <span style={{ color: "#ffd60a" }}>FOTO</span>
          <span style={{ color: "rgba(255,255,255,0.75)" }}>PORTRETT</span>
        </div>
        <div
          style={{
            position: "absolute",
            left: UTLOSER.x - 39,
            top: 128 - 39,
            width: 78,
            height: 78,
            borderRadius: "50%",
            border: "5px solid #fff",
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ width: 60, height: 60, borderRadius: "50%", background: "#fff" }} />
        </div>
        <div style={{ position: "absolute", left: 44, top: 128 - 24, width: 48, height: 48, borderRadius: 9, background: "linear-gradient(135deg, #3a3e44, #1f2226)", border: "2px solid rgba(255,255,255,0.25)" }} />
        <div style={{ position: "absolute", right: 44, top: 128 - 24, width: 48, height: 48, borderRadius: "50%", background: "rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" />
            <path d="M4 4v4h4" />
            <path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" />
            <path d="M20 20v-4h-4" />
          </svg>
        </div>
      </div>
    </div>
  );
};
