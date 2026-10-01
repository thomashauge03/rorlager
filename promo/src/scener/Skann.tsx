import React from "react";
import { AbsoluteFill } from "remotion";
import { boblePunkt, Kamera } from "../app/Kamera";
import { Rorside } from "../app/Rorside";
import { AVLOPSROR } from "../data";
import { Glod } from "../felles/Bakgrunn";
import { Finger, stot } from "../felles/Finger";
import { fram, mellom } from "../felles/hjelp";
import { useOppsett } from "../felles/oppsett";
import { Plater } from "../felles/Plater";
import { Rigg } from "../felles/Rigg";
import { Steg, Stegtekst } from "../felles/Stegtekst";
import { STATUS_H, Telefon } from "../felles/Telefon";
import { useBilde } from "../felles/Tempo";
import { Rorhylle, RORHYLLE_KODE, RORHYLLE_VIEWBOX } from "../tegning/Rorhylle";
import { ease, farge } from "../tema";

export const STEG1: Steg = { nr: "01", av: 5, tittel: "Skann koden på hylla", under: "Bruk kameraet på mobilen. Ingen app, ingen innlogging." };

export const SKANN = {
  apne: 0,
  tekst: 10,
  refleks: 16,
  puls: [20, 36],
  telefonInn: 42,
  telefonFram: 80,
  las: 94,
  pip: 106,
  boble: 108,
  trykk: 130,
  side: 136,
} as const;

/** Rørsiden slik den åpner: tomt mengdefelt, og knappene av til det står noe der. */
export const TOM_RORSIDE = { vare: AVLOPSROR, mengde: { fra: null, til: null, p: 0 }, knapperAv: 1 } as const;

/** En rød ring som pulserer rundt QR-koden på skiltet: «her er koden». */
const Puls: React.FC<{ x: number; y: number; s: number; start: number }> = ({ x, y, s: side, start }) => {
  const f = useBilde();
  const p = fram(f, start, start + 22, ease.inn);
  if (f < start || p >= 1) return null;
  const s = 1 + p * 0.45;
  return (
    <div
      style={{
        position: "absolute",
        left: x - (side * s) / 2,
        top: y - (side * s) / 2,
        width: side * s,
        height: side * s,
        borderRadius: 14 * s,
        border: `4px solid ${farge.rod}`,
        boxShadow: "0 0 24px rgba(211,18,33,0.55)",
        opacity: 1 - p,
      }}
    />
  );
};

/**
 * Rørreolen der den store tegningen står, og hvor koden er (bildets punkter).
 * Reolen er bredere enn den er høy, så den gjøres litt mindre enn plassen og
 * skyves ut mot kanten (`skyv`), så den ikke går inn i tekstsøyla.
 */
export const hylleIScenen = (sc: { x: number; y: number; bredde: number }, skyv = 0) => {
  const bredde = sc.bredde * 0.92;
  const k = bredde / RORHYLLE_VIEWBOX.b;
  const hoyde = RORHYLLE_VIEWBOX.h * k;
  const x = sc.x + skyv - bredde / 2;
  const y = sc.y - hoyde / 2;
  const kode = { x: x + (RORHYLLE_KODE.x + RORHYLLE_KODE.s / 2) * k, y: y + (RORHYLLE_KODE.y + RORHYLLE_KODE.s / 2) * k, s: RORHYLLE_KODE.s * k + 26 };
  return { x, y, bredde, hoyde, kode };
};

/**
 * Steg 1: rørreolen med hylleskiltet, så telefonen som kommer opp foran den
 * med kameraet åpent. Søkeren låser seg på koden, det piper, «Åpne siden»
 * trykkes, og rørsiden glir opp.
 */
export const Skann: React.FC<{ varighet: number }> = ({ varighet }) => {
  const f = useBilde();
  const o = useOppsett();
  const T = SKANN;
  const tlf = o.telefon(0);
  const sc = o.scene(0);
  const h = hylleIScenen(sc, o.type === "liggende" ? -20 : 0);

  const opp = fram(f, T.telefonInn, T.telefonFram, ease.inn);
  const fokus = fram(f, T.telefonInn + 8, T.telefonFram, ease.myk);
  const push = fram(f, T.side + 14, varighet, ease.myk);
  const bp = boblePunkt("skilt", f);
  const trykk = [{ f: T.trykk, x: bp.x, y: bp.y + STATUS_H }];
  const sideOpp = fram(f, T.side, T.side + 18, ease.inn);

  return (
    <AbsoluteFill>
      <Glod x={tlf.x} y={tlf.y} styrke={fram(f, 30, 80)} />
      {/* Lyset fra taket på reolen, så grafitten skiller seg fra den mørke bakgrunnen */}
      <div
        style={{
          position: "absolute",
          left: sc.x - sc.bredde * 0.75,
          top: sc.y - h.hoyde * 1.1,
          width: sc.bredde * 1.5,
          height: h.hoyde * 2.2,
          background: "radial-gradient(ellipse 50% 50% at 50% 52%, rgba(235,238,245,0.15) 0%, rgba(235,238,245,0.05) 45%, rgba(0,0,0,0) 72%)",
          opacity: fram(f, 0, 14) * (1 - 0.6 * fokus),
        }}
      />
      <div
        style={{
          position: "absolute",
          left: h.x,
          top: h.y,
          opacity: fram(f, 0, 10),
          transform: `scale(${1.04 - 0.04 * fram(f, 0, 34, ease.inn) - 0.03 * fokus})`,
          transformOrigin: "50% 60%",
          filter: fokus > 0.01 ? `blur(${fokus * 5}px) brightness(${1 - fokus * 0.45})` : undefined,
        }}
      >
        <Rorhylle bredde={h.bredde} vare={AVLOPSROR} refleks={fram(f, T.refleks, T.refleks + 30)} />
      </div>
      {T.puls.map((s) => (
        <Puls key={s} x={h.kode.x} y={h.kode.y} s={h.kode.s} start={s} />
      ))}
      <Rigg x={tlf.x} y={tlf.y + (1 - opp) * 1050} zoom={tlf.zoom * (1 + 0.04 * push)} rx={(1 - opp) * 16} ry={tlf.ry} stot={stot(f, trykk)} opacity={opp > 0 ? 1 : 0}>
        {(z) => (
          <Telefon zoom={z} klokke="07:38" statusFarge={sideOpp > 0.5 ? "#171717" : undefined} over={<Finger trykk={trykk} />}>
            <Kamera
              motiv="skilt"
              las={fram(f, T.las, T.pip, ease.inn)}
              boble={fram(f, T.boble, T.boble + 10, ease.inn)}
              bobleTrykk={mellom(f, [T.trykk - 1, T.trykk + 1, T.side], [0, 1, 1])}
            />
            {sideOpp > 0 && (
              <div style={{ position: "absolute", inset: 0, transform: `translateY(${(1 - sideOpp) * 917}px)`, boxShadow: "0 -20px 40px rgba(0,0,0,0.45)" }}>
                <Rorside s={TOM_RORSIDE} />
              </div>
            )}
          </Telefon>
        )}
      </Rigg>
      <Stegtekst steg={STEG1} inn={T.tekst} side={0} />
      <Plater startLukket apne={T.apne} />
    </AbsoluteFill>
  );
};
