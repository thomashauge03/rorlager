import React from "react";
import { AbsoluteFill } from "remotion";
import { Steg, Stegtekst } from "../felles/Stegtekst";
import { STEG2 } from "./Mengde";

export const STEG3: Steg = { nr: "03", av: 5, tittel: "Flere varer?", under: "Skann neste kode. Rør og deler havner i samme kurv." };

/**
 * Steg 3: tilbake på forsiden med kurvlinja. Appens egen skanner låser på
 * etiketten på hyllekanten, bendene legges i kurven, og kurvmerket teller
 * til 2.
 */
export const Flere: React.FC<{ varighet: number }> = () => (
  <AbsoluteFill>
    <Stegtekst steg={STEG3} forrige={STEG2} inn={0} side={0} />
  </AbsoluteFill>
);
