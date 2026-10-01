import React from "react";
import { AbsoluteFill } from "remotion";
import { Plater } from "../felles/Plater";
import { Kort } from "./Kort";

/** kortInn + 1 treffer andre slag i hovedfilmen (se register: dunk) */
export const APNING = { apne: 12, kortInn: 14, lukk: 104 } as const;

/**
 * Åpningen: lukkeren fra mobilappen glir av og avdekker logoen og
 * «Ta ut rør / med mobilen». Platene lukker seg igjen på slutten, og
 * åpnes av steg 1 — samme overgang som appen bruker mellom sider.
 */
export const Apning: React.FC<{ varighet: number }> = () => (
  <AbsoluteFill>
    <Kort tittel="Ta ut rør" under="med mobilen" inn={APNING.kortInn} />
    <Plater startLukket apne={APNING.apne} lukk={APNING.lukk} />
  </AbsoluteFill>
);
