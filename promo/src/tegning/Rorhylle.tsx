import React, { useId } from "react";
import type { Vare } from "../data";
import { HylleskiltGruppe, SKILT, SKILT_QR } from "./Hylleskilt";

/**
 * Rørreolen på lageret, tegnet i HM-stil som vibroplaten i leiefilmen:
 * kraftige mørke konturer, flater med to–tre toner og en hard 3D-kant ned
 * mot venstre, samme grep som ekstruderingen i logoen.
 *
 * Sett forfra, med rørendene mot oss: tre båser i to høyder. Midtbåsen
 * øverst har avløpsrørene (PVC, rødbrune), og hylleskiltet henger på
 * bjelken under dem, slik hyllemerking sitter. Rundt står svarte
 * overvannsrør (grå innvendig, som X-Stream og IQ) og grå PVC.
 *
 * Koordinatene er reolens egne (RORHYLLE_VIEWBOX); `bredde` bestemmer
 * størrelsen.
 */
export const RORHYLLE_VIEWBOX = { x: 0, y: 0, b: 1000, h: 640 } as const;

/** Der skiltet henger, i reolens koordinater. */
export const RORHYLLE_SKILT = { x: 375, y: 318, b: 250, h: (250 * SKILT.h) / SKILT.b } as const;
const SK = RORHYLLE_SKILT.b / SKILT.b;
/** QR-koden på skiltet, i reolens koordinater. */
export const RORHYLLE_KODE = {
  x: RORHYLLE_SKILT.x + SKILT_QR.x * SK,
  y: RORHYLLE_SKILT.y + SKILT_QR.y * SK,
  s: SKILT_QR.s * SK,
} as const;

const K = {
  kontur: "#0b0b0c",
  stal: "#4b5058",
  stalLys: "#6b7179",
  stalMork: "#2c3036",
  hull: "#16181b",
  bas: "#101214",
  ekstrudering: "#060707",
};

type Rorfarge = { lys: string; mid: string; mork: string; vegg: string; dyp: string };

/** Avløpsrør i PVC: rødbrune, som de som ligger på lageret. */
const BRUN: Rorfarge = { lys: "#d0733c", mid: "#b3552b", mork: "#86391a", vegg: "#8a3f1c", dyp: "#2a1209" };
/** Overvannsrør i PP: svarte utvendig, lyse innvendig. */
const SVART: Rorfarge = { lys: "#4a4f57", mid: "#2b2f35", mork: "#17191c", vegg: "#9aa0a8", dyp: "#2d3136" };
/** Grå PVC. */
const GRA: Rorfarge = { lys: "#cdd1d6", mid: "#a9aeb5", mork: "#7c818a", vegg: "#6d7279", dyp: "#24272b" };

type Ror = { x: number; y: number; r: number; f: Rorfarge; muffe?: boolean; id?: string };

/**
 * Rør stablet i en bås, rad på rad nedenfra. Radene er midtstilt, og
 * annenhver rad har ett rør mindre og ligger nede mellom rørene under,
 * slik rør legger seg. Muffe på annethvert rør i annenhver rad: rør
 * stables med muffene vekselvis, så de ikke ligger og vipper.
 */
const stabel = (
  bas: { x0: number; x1: number; y0: number; y1: number },
  r: number,
  f: Rorfarge,
  prefiks: string,
): Ror[] => {
  const ut: Ror[] = [];
  const mellomrom = 3;
  const dx = r * 2 + mellomrom;
  const dy = r * Math.sqrt(3) + 0.5;
  const bredde = bas.x1 - bas.x0 - 6;
  const flest = Math.floor((bredde + mellomrom) / dx);
  for (let rad = 0; ; rad++) {
    const y = bas.y1 - r - 2 - rad * dy;
    if (y - r < bas.y0 + 2) break;
    // To i bredden blir en pyramide: to rør på ett ville ikke ligget
    if (flest <= 2 && rad >= 2) break;
    const n = flest - (rad % 2);
    const start = bas.x0 + (bas.x1 - bas.x0 - (n * dx - mellomrom)) / 2 + r;
    for (let i = 0; i < n; i++) {
      ut.push({ x: start + i * dx, y, r, f, muffe: rad % 2 === 1 && i % 2 === 0, id: `${prefiks}-${rad}-${i}` });
    }
  }
  return ut;
};

const Rorende: React.FC<{ ror: Ror; gid: string }> = ({ ror, gid }) => {
  const { x, y, r, f, muffe } = ror;
  const ri = r * 0.78;
  // Muffen: ytterkanten er litt større, og godset synes som en bredere ring
  const ytre = muffe ? r * 1.08 : r;
  return (
    <g>
      <circle cx={x} cy={y} r={ytre} fill={`url(#${gid})`} stroke={K.kontur} strokeWidth={3.2} />
      {/* Innsiden: veggen som går innover, og mørket lenger inne */}
      <circle cx={x} cy={y} r={ri} fill={f.vegg} stroke={K.kontur} strokeWidth={2.4} />
      <circle cx={x - r * 0.08} cy={y - r * 0.11} r={ri * 0.8} fill={f.dyp} />
    </g>
  );
};

/** Gradientene til rørendene: lys oppe til venstre, mørk nede til høyre. */
const Gradienter: React.FC<{ id: string }> = ({ id }) => (
  <>
    {(
      [
        ["brun", BRUN],
        ["svart", SVART],
        ["gra", GRA],
      ] as const
    ).map(([navn, f]) => (
      <linearGradient key={navn} id={`${navn}-${id}`} x1="0.15" y1="0.1" x2="0.85" y2="0.9">
        <stop offset="0" stopColor={f.lys} />
        <stop offset="0.55" stopColor={f.mid} />
        <stop offset="1" stopColor={f.mork} />
      </linearGradient>
    ))}
  </>
);

const navnFor = (f: Rorfarge) => (f === BRUN ? "brun" : f === SVART ? "svart" : "gra");

/** Stolpe med hullrekke, som en pallereol. */
const Stolpe: React.FC<{ x: number; y0: number; y1: number }> = ({ x, y0, y1 }) => {
  const b = 34;
  const hull = [];
  for (let y = y0 + 22; y < y1 - 18; y += 24) hull.push(y);
  return (
    <g>
      <rect x={x} y={y0} width={b} height={y1 - y0} fill={K.stal} stroke={K.kontur} strokeWidth={4.5} strokeLinejoin="round" />
      <rect x={x + 3} y={y0 + 3} width={7} height={y1 - y0 - 6} fill={K.stalLys} />
      <rect x={x + b - 8} y={y0 + 3} width={5} height={y1 - y0 - 6} fill={K.stalMork} />
      {hull.map((y) => (
        <rect key={y} x={x + 14} y={y} width={8} height={12} rx={2.5} fill={K.hull} />
      ))}
    </g>
  );
};

/** Bjelke mellom stolpene, med lys overside og festeplater ved stolpene. */
const Bjelke: React.FC<{ x0: number; x1: number; y: number; h: number; stolper: number[] }> = ({ x0, x1, y, h, stolper }) => (
  <g>
    <rect x={x0} y={y} width={x1 - x0} height={h} fill={K.stal} stroke={K.kontur} strokeWidth={4.5} strokeLinejoin="round" />
    <rect x={x0 + 3} y={y + 3} width={x1 - x0 - 6} height={6} fill={K.stalLys} />
    <rect x={x0 + 3} y={y + h - 8} width={x1 - x0 - 6} height={5} fill={K.stalMork} />
    {stolper.map((sx) => (
      <g key={sx}>
        <rect x={sx - 6} y={y - 4} width={46} height={h + 8} rx={3} fill={K.stalMork} stroke={K.kontur} strokeWidth={3.5} />
        <circle cx={sx + 6} cy={y + h / 2} r={3.4} fill={K.stalLys} />
        <circle cx={sx + 28} cy={y + h / 2} r={3.4} fill={K.stalLys} />
      </g>
    ))}
  </g>
);

/** Strips rundt bjelken som holder skiltet. */
const Strips: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <g>
    <rect x={x - 5} y={y - 26} width={10} height={44} rx={4} fill="#121212" stroke={K.kontur} strokeWidth={2} />
    <rect x={x - 7} y={y + 12} width={14} height={10} rx={2} fill="#1d1d1d" />
  </g>
);

export const Rorhylle: React.FC<{
  bredde: number;
  vare: Vare;
  /** 0–1: lysrefleksen over skiltet */
  refleks?: number;
  /** 0–1: to av rørene øverst i midtbåsen tas ut (steg 5) */
  tatt?: number;
  utenSkygge?: boolean;
  stil?: React.CSSProperties;
}> = ({ bredde, vare, refleks, tatt = 0, utenSkygge = false, stil }) => {
  const id = useId().replace(/:/g, "");
  const V = RORHYLLE_VIEWBOX;
  const hoyde = (bredde * V.h) / V.b;
  const steg = Array.from({ length: 8 }, (_, i) => i + 1);

  const stolper = [20, 330, 636, 946];
  const topp = { y0: 44, y1: 300 };
  const bunn = { y0: 330, y1: 588 };
  const baser = [
    { x0: 54, x1: 330 },
    { x0: 364, x1: 636 },
    { x0: 670, x1: 946 },
  ];
  const ror: Ror[] = [
    ...stabel({ ...baser[0], ...topp }, 40, SVART, "vt"),
    ...stabel({ ...baser[1], ...topp }, 32, BRUN, "mt"),
    ...stabel({ ...baser[2], ...topp }, 32, GRA, "ht"),
    ...stabel({ ...baser[0], ...bunn }, 58, SVART, "vb"),
    ...stabel({ ...baser[1], ...bunn }, 46, BRUN, "mb"),
    ...stabel({ ...baser[2], ...bunn }, 40, GRA, "hb"),
  ];
  // De to som tas ut i steg 5: øverste rad i midtbåsen, til høyre
  const iMidten = ror.filter((r) => r.id?.startsWith("mt-"));
  const oversteRad = Math.min(...iMidten.map((r) => r.y));
  const ut = iMidten.filter((r) => r.y === oversteRad).slice(-2);
  const utIder = new Set(ut.map((r) => r.id));

  return (
    <svg width={bredde} height={hoyde} viewBox={`${V.x} ${V.y} ${V.b} ${V.h}`} style={{ display: "block", overflow: "visible", ...stil }}>
      <defs>
        <filter id={`ekstr-${id}`} x="-8%" y="-8%" width="116%" height="120%" colorInterpolationFilters="sRGB">
          <feFlood floodColor={K.ekstrudering} result="farge" />
          <feComposite in="farge" in2="SourceAlpha" operator="in" result="silhuett" />
          {steg.map((n) => (
            <feOffset key={n} in="silhuett" dx={-2.4 * n} dy={2.4 * n} result={`e${n}`} />
          ))}
          <feMerge>
            {[...steg].reverse().map((n) => (
              <feMergeNode key={n} in={`e${n}`} />
            ))}
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={`bakke-${id}`} x="-20%" y="-200%" width="140%" height="500%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
        <filter id={`uskarp-${id}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={2 + tatt * 6} />
        </filter>
        <linearGradient id={`dyp-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0c0d0f" />
          <stop offset="1" stopColor="#1b1e22" />
        </linearGradient>
        <Gradienter id={id} />
      </defs>

      {!utenSkygge && <ellipse cx={500} cy={620} rx={500} ry={14} fill="#000" opacity={0.55} filter={`url(#bakke-${id})`} />}

      <g filter={`url(#ekstr-${id})`}>
        {/* Båsene: mørkt innover i reolen, så tomme plasser ser tomme ut */}
        <rect x={20} y={18} width={960} height={594} fill={`url(#dyp-${id})`} stroke={K.kontur} strokeWidth={4.5} />
        {ror
          .filter((r) => !utIder.has(r.id))
          .map((r) => (
            <Rorende key={r.id} ror={r} gid={`${navnFor(r.f)}-${id}`} />
          ))}
        <Bjelke x0={20} x1={980} y={18} h={26} stolper={stolper} />
        <Bjelke x0={20} x1={980} y={300} h={30} stolper={stolper} />
        <Bjelke x0={20} x1={980} y={588} h={24} stolper={stolper} />
        {stolper.map((x) => (
          <Stolpe key={x} x={x} y0={10} y1={620} />
        ))}
      </g>

      {/* Rørene som tas ut: de kommer mot oss og blir borte */}
      {ut.map((r, i) => {
        const p = Math.max(0, Math.min(1, tatt * 1.6 - i * 0.6));
        if (p >= 1) return null;
        const s = 1 + p * 0.5;
        return (
          <g
            key={r.id}
            transform={`translate(${r.x} ${r.y}) scale(${s}) translate(${-r.x} ${-r.y})`}
            opacity={1 - p}
            filter={p > 0 ? `url(#uskarp-${id})` : undefined}
          >
            <Rorende ror={r} gid={`${navnFor(r.f)}-${id}`} />
          </g>
        );
      })}

      {/* Skiltet, laminert, i strips rundt bjelken */}
      <g>
        <rect
          x={RORHYLLE_SKILT.x + 6}
          y={RORHYLLE_SKILT.y + 10}
          width={RORHYLLE_SKILT.b}
          height={RORHYLLE_SKILT.h}
          rx={4}
          fill="#000"
          opacity={0.5}
          filter={`url(#bakke-${id})`}
        />
        <rect
          x={RORHYLLE_SKILT.x - 4}
          y={RORHYLLE_SKILT.y - 4}
          width={RORHYLLE_SKILT.b + 8}
          height={RORHYLLE_SKILT.h + 8}
          rx={5}
          fill="rgba(255,255,255,0.14)"
          stroke="rgba(255,255,255,0.5)"
          strokeWidth={1.4}
        />
        <g transform={`translate(${RORHYLLE_SKILT.x} ${RORHYLLE_SKILT.y}) scale(${SK})`}>
          <HylleskiltGruppe v={vare} refleks={refleks} />
        </g>
        <Strips x={RORHYLLE_SKILT.x + 22} y={RORHYLLE_SKILT.y} />
        <Strips x={RORHYLLE_SKILT.x + RORHYLLE_SKILT.b - 22} y={RORHYLLE_SKILT.y} />
      </g>
    </svg>
  );
};
