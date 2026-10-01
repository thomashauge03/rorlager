import React from "react";
import { dmSans } from "../fonter";
import { app, RADIUS } from "../tema";
import { Ikon, Knapp, SKJERM } from "./deler";
import { Motiv } from "./Motiv";

/*
 * Appens egen skanner (src/components/Scanner.tsx i dialogen fra shadcn):
 * på mobil er dialogen like bred som skjermen og uten runde hjørner
 * (sm:rounded-lg). Kameravinduet er 3:4 med en rød ramme på 192 punkter
 * midt i, og mørkere rundt. Når koden leses, lukkes dialogen og varesiden
 * kommer: appen har ingen egen «låst»-animasjon.
 */

const PADDING = 24;
const VINDU_B = SKJERM.b - 2 * PADDING;
const VINDU_H = (VINDU_B * 4) / 3;
// p-6, overskrift 18 + 6 + beskrivelse 20, gap-4, vinduet, gap, status 20, gap, knapp 48, p-6, kantlinjer
const DIALOG_H = 1 + PADDING + 44 + 16 + VINDU_H + 16 + 20 + 16 + 48 + PADDING + 1;
const DIALOG_TOPP = (SKJERM.h - DIALOG_H) / 2;

/** Kameravinduet, i skjermens punkter (innholdsflaten under statuslinja). */
export const SKANNER_VINDU = { x: PADDING, y: DIALOG_TOPP + 1 + PADDING + 44 + 16, b: VINDU_B, h: VINDU_H } as const;

export const Skanner: React.FC<{
  /** 0–1: dialogen kommer fram (fade, zoom fra 95 %, litt nedenfra) */
  apne: number;
  /** 0–1: kameraet føres fra kassen ned til etiketten */
  pan: number;
}> = ({ apne, pan }) => {
  if (apne <= 0) return null;
  return (
    <>
      {/* bg-black/80 */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.8)", opacity: apne, zIndex: 50 }} />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: DIALOG_TOPP,
          width: SKJERM.b,
          height: DIALOG_H,
          boxSizing: "border-box",
          borderTop: `1px solid ${app.kant}`,
          borderBottom: `1px solid ${app.kant}`,
          background: app.bakgrunn,
          padding: PADDING,
          boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)",
          fontFamily: dmSans,
          color: app.blekk,
          opacity: apne,
          transform: `translateY(${(1 - apne) * DIALOG_H * 0.02}px) scale(${0.95 + 0.05 * apne})`,
          zIndex: 51,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 18, lineHeight: "18px", fontWeight: 600, letterSpacing: "-0.025em" }}>Skann QR-koden</div>
          <div style={{ fontSize: 14, lineHeight: "20px", color: app.blekkSvak }}>Hold kameraet mot koden som henger på hylla.</div>
        </div>
        <div style={{ position: "relative", width: VINDU_B, height: VINDU_H, borderRadius: RADIUS.lg, overflow: "hidden", background: "#000" }}>
          <Motiv type="etikett" b={VINDU_B} h={VINDU_H} pan={pan} />
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 192, height: 192, boxSizing: "border-box", borderRadius: 12, border: "2px solid rgba(211,18,28,0.8)", boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)" }} />
          </div>
        </div>
        <div style={{ height: 20 }} />
        <Knapp tekst="Avbryt" variant="kontur" hoyde={48} ikon="kryss" />
        {/* Lukkekrysset øverst til høyre: absolute right-4 top-4, opacity-70 */}
        <div style={{ position: "absolute", right: 16, top: 16, opacity: 0.7 }}>
          <Ikon navn="kryss" storrelse={16} />
        </div>
      </div>
    </>
  );
};
