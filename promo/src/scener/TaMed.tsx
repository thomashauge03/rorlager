import React from "react";
import { AbsoluteFill } from "remotion";
import { useOppsett } from "../felles/oppsett";
import { Plater } from "../felles/Plater";
import { Steg, Stegtekst } from "../felles/Stegtekst";
import { STEG4 } from "./SendInn";

export const STEG5: Steg = { nr: "05", av: 5, tittel: "Ta med varene", under: "Kvitteringen ligger på mobilen. Uttaket faktureres i etterkant." };

export const TAMED = {
  /** Telefonen glir over til høyre side (og lyset i bakgrunnen med den) */
  glidFra: 0,
  glidTil: 44,
  tekstInn: 18,
} as const;

/** Platene lukker seg så mange bilder før slutten, og sluttkortet åpner dem. */
export const TAMED_LUKK_FOR_SLUTT = 20;

/**
 * Steg 5: kvitteringen. Telefonen glir til høyre og teksten bytter side;
 * bak telefonen står hylla. Mot slutten går fokus fra telefonen tilbake til
 * hylla, og rørene glir ut — speilbildet av steg 1.
 */
export const TaMed: React.FC<{ varighet: number }> = ({ varighet }) => {
  const o = useOppsett();
  const liggende = o.type === "liggende";
  const ut = varighet - TAMED_LUKK_FOR_SLUTT - 8;
  return (
    <AbsoluteFill>
      {liggende ? (
        <>
          {/* Steg 4 går ut på høyre side mens telefonen glir dit */}
          <Stegtekst steg={STEG4} inn={-1000} ut={0} side={0} />
          <Stegtekst steg={STEG5} inn={TAMED.tekstInn} side={1} ut={ut} />
        </>
      ) : (
        <Stegtekst steg={STEG5} forrige={STEG4} inn={0} side={0} ut={ut} />
      )}
      <Plater lukk={varighet - TAMED_LUKK_FOR_SLUTT} />
    </AbsoluteFill>
  );
};
