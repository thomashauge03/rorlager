import React from "react";
import { AbsoluteFill } from "remotion";
import { Steg, Stegtekst } from "../felles/Stegtekst";
import { STEG3 } from "./Flere";

export const STEG4: Steg = { nr: "04", av: 5, tittel: "Send inn uttaket", under: "Navn, telefon og e-post. Prosjekt eller adresse hvis du vil." };

/**
 * Steg 4: kurven, «Gå videre», og kassen der navn, telefon, e-post og
 * prosjekt fylles inn. «Send inn uttak» setter seg ned i skyggen.
 */
export const SendInn: React.FC<{ varighet: number }> = () => (
  <AbsoluteFill>
    <Stegtekst steg={STEG4} forrige={STEG3} inn={0} side={0} />
  </AbsoluteFill>
);
