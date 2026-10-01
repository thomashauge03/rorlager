import React, { useId } from "react";
import type { Vare } from "../data";
import { ETIKETT, ETIKETT_QR, EtikettGruppe } from "./Hylleskilt";

/**
 * Delehylla i steg 3, som kameraet i appens skanner ser den: en plukkasse
 * med rødbrune 45°-bend på hylla, og etiketten fra etikettarket limt på
 * hyllekanten under. Stående, som skannervinduet (3:4).
 *
 * Samme HM-stil som reolen: mørke konturer, to–tre toner per flate.
 */
export const DELEHYLLE_VIEWBOX = { x: 0, y: 0, b: 600, h: 800 } as const;

/** Etiketten på hyllekanten, i hyllas koordinater. */
export const DELEHYLLE_ETIKETT = { x: 185, y: 524, b: 230, h: (230 * ETIKETT.h) / ETIKETT.b } as const;
const EK = DELEHYLLE_ETIKETT.b / ETIKETT.b;
/** QR-koden på etiketten, i hyllas koordinater. */
export const DELEHYLLE_KODE = {
  x: DELEHYLLE_ETIKETT.x + ETIKETT_QR.x * EK,
  y: DELEHYLLE_ETIKETT.y + ETIKETT_QR.y * EK,
  s: ETIKETT_QR.s * EK,
} as const;

const K = {
  kontur: "#0b0b0c",
  stal: "#4b5058",
  stalLys: "#6b7179",
  stalMork: "#2c3036",
  kasse: "#5d636b",
  kasseLys: "#7a8089",
  kasseMork: "#3d4248",
  kasseInne: "#2a2e33",
  vegg: "#1d2024",
};

const BRUN = { lys: "#d0733c", mid: "#b3552b", mork: "#86391a", inne: "#2a1209" };

/**
 * Et 45°-bend sett fra siden: muffe og rett stykke, knekk, og spissende.
 * (x, y) er knekkpunktet, `d` ytre diameter, `vinkel` retningen på
 * muffestykket. Hvert stykke har lys overkant og mørk underkant.
 */
const Bend: React.FC<{ x: number; y: number; d: number; vinkel: number; gid: string }> = ({ x, y, d, vinkel, gid }) => {
  const a = d * 1.15;
  const b = d * 0.95;
  const m = d * 1.16;
  return (
    <g transform={`translate(${x} ${y}) rotate(${vinkel})`}>
      {/* Spissenden: 45° fra muffestykket */}
      <g transform="rotate(-135)">
        <rect x={0} y={-d / 2} width={b} height={d} fill={`url(#${gid})`} stroke={K.kontur} strokeWidth={3.4} />
        <ellipse cx={b} cy={0} rx={d * 0.16} ry={d / 2} fill={BRUN.mork} stroke={K.kontur} strokeWidth={3} />
        <ellipse cx={b} cy={0} rx={d * 0.12} ry={d * 0.4} fill={BRUN.inne} />
      </g>
      {/* Knekken */}
      <circle cx={0} cy={0} r={d / 2} fill={`url(#${gid})`} stroke={K.kontur} strokeWidth={3.4} />
      {/* Det rette stykket og muffen ytterst */}
      <rect x={0} y={-d / 2} width={a} height={d} fill={`url(#${gid})`} stroke={K.kontur} strokeWidth={3.4} />
      <rect x={a - d * 0.05} y={-m / 2} width={d * 0.72} height={m} rx={3} fill={`url(#${gid})`} stroke={K.kontur} strokeWidth={3.4} />
      <line x1={a + d * 0.08} x2={a + d * 0.08} y1={-m / 2 + 3} y2={m / 2 - 3} stroke={BRUN.mork} strokeWidth={3} />
      <ellipse cx={a + d * 0.67} cy={0} rx={d * 0.17} ry={m / 2} fill={BRUN.mork} stroke={K.kontur} strokeWidth={3} />
      <ellipse cx={a + d * 0.67} cy={0} rx={d * 0.12} ry={d * 0.41} fill={BRUN.inne} />
    </g>
  );
};

export const Delehylle: React.FC<{ bredde: number; vare: Vare; stil?: React.CSSProperties }> = ({ bredde, vare, stil }) => {
  const id = useId().replace(/:/g, "");
  const V = DELEHYLLE_VIEWBOX;
  const gid = `bend-${id}`;
  return (
    <svg width={bredde} height={(bredde * V.h) / V.b} viewBox={`${V.x} ${V.y} ${V.b} ${V.h}`} style={{ display: "block", overflow: "hidden", ...stil }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={BRUN.lys} />
          <stop offset="0.45" stopColor={BRUN.mid} />
          <stop offset="1" stopColor={BRUN.mork} />
        </linearGradient>
        <linearGradient id={`vegg-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#15171a" />
          <stop offset="1" stopColor={K.vegg} />
        </linearGradient>
        <filter id={`skygge-${id}`} x="-20%" y="-20%" width="140%" height="160%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* Bakveggen i hylla */}
      <rect x={0} y={0} width={V.b} height={V.h} fill={`url(#vegg-${id})`} />

      {/* Nabokassene i kanten av bildet */}
      <rect x={-120} y={150} width={140} height={372} rx={10} fill={K.kasseMork} stroke={K.kontur} strokeWidth={4} />
      <rect x={580} y={150} width={140} height={372} rx={10} fill={K.kasseMork} stroke={K.kontur} strokeWidth={4} />

      {/* Plukkassen: bakre del og innsiden */}
      <rect x={40} y={110} width={520} height={412} rx={12} fill={K.kasse} stroke={K.kontur} strokeWidth={4.5} />
      <rect x={58} y={128} width={484} height={380} rx={6} fill={K.kasseInne} />

      {/* Bendene i kassen */}
      <Bend x={170} y={300} d={92} vinkel={-12} gid={gid} />
      <Bend x={430} y={286} d={92} vinkel={196} gid={gid} />
      <Bend x={300} y={220} d={92} vinkel={-62} gid={gid} />
      <Bend x={230} y={384} d={92} vinkel={168} gid={gid} />
      <Bend x={350} y={404} d={92} vinkel={14} gid={gid} />

      {/* Kassens front: lav vegg med grep, så innholdet ligger åpent oppå */}
      <path d="M40 420 L560 420 L560 510 Q560 522 548 522 L52 522 Q40 522 40 510 Z" fill={K.kasse} stroke={K.kontur} strokeWidth={4.5} strokeLinejoin="round" />
      <rect x={46} y={426} width={508} height={10} fill={K.kasseLys} />
      <rect x={230} y={446} width={140} height={38} rx={6} fill={K.kasseMork} stroke={K.kontur} strokeWidth={3} />
      <rect x={46} y={500} width={508} height={14} fill={K.kasseMork} />

      {/* Hyllekanten med etiketten */}
      <rect x={-10} y={520} width={V.b + 20} height={122} fill={K.stal} stroke={K.kontur} strokeWidth={4.5} />
      <rect x={-10} y={523} width={V.b + 20} height={8} fill={K.stalLys} />
      <rect x={-10} y={630} width={V.b + 20} height={9} fill={K.stalMork} />
      <rect
        x={DELEHYLLE_ETIKETT.x + 4}
        y={DELEHYLLE_ETIKETT.y + 6}
        width={DELEHYLLE_ETIKETT.b}
        height={DELEHYLLE_ETIKETT.h}
        fill="#000"
        opacity={0.35}
        filter={`url(#skygge-${id})`}
      />
      <g transform={`translate(${DELEHYLLE_ETIKETT.x} ${DELEHYLLE_ETIKETT.y}) scale(${EK})`}>
        <EtikettGruppe v={vare} />
      </g>

      {/* Under hylla: skygge, og toppen av kassene på hylla under */}
      <rect x={0} y={642} width={V.b} height={V.h - 642} fill="#0d0e10" />
      <rect x={60} y={742} width={480} height={80} rx={10} fill={K.kasseMork} opacity={0.55} />
    </svg>
  );
};
