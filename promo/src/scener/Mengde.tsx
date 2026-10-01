import React from "react";
import { AbsoluteFill } from "remotion";
import { Steg, Stegtekst } from "../felles/Stegtekst";
import { STEG1 } from "./Skann";

export const STEG2: Steg = { nr: "02", av: 5, tittel: "Hvor mye tar du ut?", under: "Tast inn meter, eller trykk på knappene." };

/**
 * Steg 2: rørsiden. Fingeren trykker +10, +1, +1, tallet ruller til 12 m,
 * og «Legg i handlekurv» trykkes.
 */
export const Mengde: React.FC<{ varighet: number }> = () => (
  <AbsoluteFill>
    <Stegtekst steg={STEG2} forrige={STEG1} inn={0} side={0} />
  </AbsoluteFill>
);
