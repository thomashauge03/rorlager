import React from "react";
import { AbsoluteFill } from "remotion";
import { Kasse, TOMT } from "../app/Kasse";
import { Kvittering } from "../app/Kvittering";
import { AVLOPSROR, KUNDE } from "../data";
import { Glod } from "../felles/Bakgrunn";
import { fram } from "../felles/hjelp";
import { kameraer, miksKam } from "../felles/kamera";
import { useOppsett } from "../felles/oppsett";
import { Plater } from "../felles/Plater";
import { Rigg } from "../felles/Rigg";
import { Steg, Stegtekst } from "../felles/Stegtekst";
import { Telefon } from "../felles/Telefon";
import { useBilde } from "../felles/Tempo";
import { Rorhylle } from "../tegning/Rorhylle";
import { ease } from "../tema";
import { STEG4 } from "./SendInn";
import { hylleIScenen } from "./Skann";

export const STEG5: Steg = { nr: "05", av: 5, tittel: "Ta med varene", under: "Kvitteringen ligger på mobilen. Uttaket faktureres i etterkant." };

export const TAMED = {
  /** Telefonen glir over til høyre side (og lyset i bakgrunnen med den) */
  glidFra: 0,
  glidTil: 44,
  pling: 4,
  tekstInn: 18,
  hylleInn: 20,
  ned: 130,
  fokusFra: 134,
  fokusTil: 166,
  tattFra: 168,
  tattTil: 214,
} as const;

/** Platene lukker seg så mange bilder før slutten, og sluttkortet åpner dem. */
export const TAMED_LUKK_FOR_SLUTT = 20;

const T = TAMED;

/**
 * Steg 5: kvitteringen. Telefonen glir til høyre og teksten bytter side;
 * bak telefonen står hylla uskarp. Så senkes telefonen, fokus går fra den
 * til hylla — speilbildet av steg 1 — og de to rørene tas ut.
 */
export const TaMed: React.FC<{ varighet: number }> = ({ varighet }) => {
  const f = useBilde();
  const o = useOppsett();
  const liggende = o.type === "liggende";
  const K = kameraer(o);
  const kam = f < T.glidTil ? miksKam(K.sendInnSlutt, K.taMed, fram(f, T.glidFra, T.glidTil, ease.kamera)) : miksKam(K.taMed, K.taMedSlutt, fram(f, T.glidTil, T.ned, ease.myk));
  const sc = o.scene(1);
  const h = hylleIScenen(sc, liggende ? 20 : 0);

  const inn = fram(f, 0, 8, ease.inn);
  const ned = fram(f, T.ned, T.ned + 28, ease.ut);
  const fokus = 1 - fram(f, T.fokusFra, T.fokusTil, ease.myk);
  const ut = varighet - TAMED_LUKK_FOR_SLUTT - 8;

  return (
    <AbsoluteFill>
      {/* Lyset fra taket på reolen, sterkere når den kommer i fokus */}
      <div
        style={{
          position: "absolute",
          left: sc.x - sc.bredde * 0.75,
          top: sc.y - h.hoyde * 1.1,
          width: sc.bredde * 1.5,
          height: h.hoyde * 2.2,
          background: "radial-gradient(ellipse 50% 50% at 50% 52%, rgba(235,238,245,0.15) 0%, rgba(235,238,245,0.05) 45%, rgba(0,0,0,0) 72%)",
          opacity: fram(f, T.hylleInn, T.hylleInn + 30) * (1 - 0.6 * fokus),
        }}
      />
      <div
        style={{
          position: "absolute",
          left: h.x,
          top: h.y,
          opacity: fram(f, T.hylleInn, T.hylleInn + 30),
          transform: `scale(${1 - 0.03 * fokus})`,
          transformOrigin: "50% 60%",
          filter: fokus > 0.01 ? `blur(${fokus * 5}px) brightness(${1 - fokus * 0.45})` : undefined,
        }}
      >
        <Rorhylle bredde={h.bredde} vare={AVLOPSROR} tatt={fram(f, T.tattFra, T.tattTil)} />
      </div>
      <Glod x={kam.x} y={K.y} styrke={1 - ned} />
      <Rigg x={kam.x} y={K.y + ned * 1100} zoom={kam.zoom} ry={kam.ry} rx={ned * 14} opacity={ned < 1 ? 1 : 0}>
        {(z) => (
          <Telefon zoom={z} klokke="07:42" statusFarge="#171717">
            {/* «Sender inn …» fra steg 4 ligger under til kvitteringen har skalert seg inn */}
            {inn < 1 && (
              <Kasse
                s={{
                  ...TOMT,
                  verdier: { navn: KUNDE.navn, telefon: KUNDE.telefon, epost: KUNDE.epost, prosjekt: KUNDE.prosjekt },
                  rull: 124,
                  sender: (f + 30) * 24,
                }}
              />
            )}
            <div style={{ position: "absolute", inset: 0, opacity: inn }}>
              <Kvittering inn={inn} />
            </div>
          </Telefon>
        )}
      </Rigg>
      {liggende ? (
        <>
          {/* Steg 4 går ut på høyre side mens telefonen glir dit */}
          <Stegtekst steg={STEG4} inn={-1000} ut={0} side={0} />
          <Stegtekst steg={STEG5} inn={T.tekstInn} side={1} ut={ut} />
        </>
      ) : (
        <Stegtekst steg={STEG5} forrige={STEG4} inn={0} side={0} ut={ut} />
      )}
      <Plater lukk={varighet - TAMED_LUKK_FOR_SLUTT} />
    </AbsoluteFill>
  );
};
