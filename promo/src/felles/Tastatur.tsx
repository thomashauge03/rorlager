import React from "react";
import { geist } from "../fonter";
import { SKJERM_B } from "./Telefon";

/**
 * Mobiltastaturet: mørkt, som i Leveringsseddel-filmen, med norske
 * bokstaver og en forslagsstripe øverst. Der viser telefonen autofyll
 * («Storgata 14 …») — det er telefonens egen funksjon, ikke appens.
 */
export const TASTATUR_H = 318;
const STRIPE = 46;
const RAD_H = 50;
const GAP = 10;

const BOKSTAVER = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "å"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", "ø", "æ"],
];
const RAD3 = ["z", "x", "c", "v", "b", "n", "m"];
const TALL = [
  ["1", "2", "3", "−"],
  ["4", "5", "6", "␣"],
  ["7", "8", "9", "⌫"],
  [",", "0", ".", "↵"],
];

type Tast = { t: string; x: number; y: number; b: number; h: number; spesial?: boolean; vis?: string };

/** Alle tastene med posisjon, så både tegning og «hvor trykker fingeren» bruker samme mål. */
const tasterFor = (modus: "bokstaver" | "tall"): Tast[] => {
  const ut: Tast[] = [];
  const y0 = STRIPE + 6;
  if (modus === "tall") {
    const b = (SKJERM_B - 8 - 3 * 6) / 4;
    TALL.forEach((rad, r) =>
      rad.forEach((t, c) => ut.push({ t, x: 4 + c * (b + 6), y: y0 + r * (RAD_H + GAP), b, h: RAD_H, spesial: c === 3 || t === "," || t === "." })),
    );
    return ut;
  }
  const b = (SKJERM_B - 8 - 10 * 4) / 11;
  BOKSTAVER.forEach((rad, r) => rad.forEach((t, c) => ut.push({ t, x: 4 + c * (b + 4), y: y0 + r * (RAD_H + GAP), b, h: RAD_H })));
  const y3 = y0 + 2 * (RAD_H + GAP);
  const skift = b * 1.5 + 2;
  ut.push({ t: "⇧", x: 4, y: y3, b: skift, h: RAD_H, spesial: true });
  RAD3.forEach((t, c) => ut.push({ t, x: 4 + skift + 8 + c * (b + 4) + b * 0.75, y: y3, b, h: RAD_H }));
  ut.push({ t: "⌫", x: SKJERM_B - 4 - skift, y: y3, b: skift, h: RAD_H, spesial: true });
  const y4 = y0 + 3 * (RAD_H + GAP);
  ut.push({ t: "?123", x: 4, y: y4, b: skift, h: RAD_H, spesial: true });
  ut.push({ t: "@", x: 4 + skift + 4, y: y4, b, h: RAD_H, spesial: true });
  ut.push({ t: " ", x: 4 + skift + b + 12, y: y4, b: SKJERM_B - 2 * skift - 2 * b - 32, h: RAD_H, vis: "" });
  ut.push({ t: ".", x: SKJERM_B - 4 - skift - b - 4, y: y4, b, h: RAD_H, spesial: true });
  ut.push({ t: "↵", x: SKJERM_B - 4 - skift, y: y4, b: skift, h: RAD_H, spesial: true });
  return ut;
};

const TASTER = { bokstaver: tasterFor("bokstaver"), tall: tasterFor("tall") };

/** Tasten et tegn skrives med (store bokstaver bruker samme tast). */
const tastFor = (modus: "bokstaver" | "tall", tegn: string) => {
  const t = tegn.toLowerCase();
  const liste = TASTER[modus];
  return liste.find((k) => k.t === t) ?? (t === " " ? liste.find((k) => k.t === " ") : undefined) ?? (modus === "tall" ? undefined : liste.find((k) => k.t === "."));
};

/** Midten av tasten for et tegn, i tastaturets koordinater — for fingeren. */
export const tastPunkt = (modus: "bokstaver" | "tall", tegn: string) => {
  const k = tastFor(modus, tegn);
  return k ? { x: k.x + k.b / 2, y: k.y + k.h / 2 } : { x: SKJERM_B / 2, y: STRIPE + 120 };
};

/** Midten av forslaget i stripa. */
export const FORSLAG_PUNKT = { x: SKJERM_B / 2, y: STRIPE / 2 + 2 };

export const Tastatur: React.FC<{
  modus: "bokstaver" | "tall";
  /** Tegnet som trykkes akkurat nå */
  aktiv?: string;
  /** Autofyll-forslaget i stripa, og hvor langt trykket på det har kommet (0–1) */
  forslag?: { tekst: string; under?: string; trykk?: number };
  /** Hvor langt oppe tastaturet er: 0 = skjult under skjermen, 1 = helt oppe */
  oppe: number;
}> = ({ modus, aktiv, forslag, oppe }) => {
  if (oppe <= 0) return null;
  const aktivTast = aktiv ? tastFor(modus, aktiv) : undefined;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        bottom: 0,
        width: SKJERM_B,
        height: TASTATUR_H,
        background: "#1c1e21",
        transform: `translateY(${(1 - oppe) * 100}%)`,
        zIndex: 20,
        fontFamily: geist,
        boxShadow: "0 -1px 0 rgba(255,255,255,0.06)",
      }}
    >
      {/* Forslagsstripa */}
      <div style={{ position: "absolute", left: 0, top: 0, width: SKJERM_B, height: STRIPE, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {forslag ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 16px",
              borderRadius: 18,
              background: `rgba(255,255,255,${0.1 + (forslag.trykk ?? 0) * 0.22})`,
              color: "#fff",
              fontSize: 15,
              fontWeight: 500,
              maxWidth: SKJERM_B - 40,
              whiteSpace: "nowrap",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b9c4d0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <path d="M7 9h10M7 13h6" />
            </svg>
            <span>{forslag.tekst}</span>
            {forslag.under && <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 13 }}>{forslag.under}</span>}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 46, color: "rgba(255,255,255,0.45)", fontSize: 15 }}>
            <span>og</span>
            <span>er</span>
            <span>på</span>
          </div>
        )}
      </div>
      {TASTER[modus].map((k) => {
        const trykt = aktivTast === k;
        return (
          <div
            key={`${k.t}-${k.x}`}
            style={{
              position: "absolute",
              left: k.x,
              top: k.y,
              width: k.b,
              height: k.h,
              borderRadius: 7,
              background: trykt ? "#6b7078" : k.spesial ? "#2a2d31" : "#3b3f45",
              color: "#fff",
              fontSize: k.spesial ? 15 : modus === "tall" ? 24 : 21,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 1px 0 rgba(0,0,0,0.5)",
            }}
          >
            {k.vis ?? k.t}
          </div>
        );
      })}
      {/* Boblen over tasten som trykkes */}
      {aktivTast && !aktivTast.spesial && modus === "bokstaver" && aktivTast.t !== " " && (
        <div
          style={{
            position: "absolute",
            left: aktivTast.x + aktivTast.b / 2 - 25,
            top: aktivTast.y - 58,
            width: 50,
            height: 58,
            borderRadius: 9,
            background: "#6b7078",
            color: "#fff",
            fontSize: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
          }}
        >
          {aktivTast.t}
        </div>
      )}
    </div>
  );
};
