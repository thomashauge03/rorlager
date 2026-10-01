import React from "react";
import { AbsoluteFill } from "remotion";
import { Plater } from "../felles/Plater";
import { Steg, Stegtekst } from "../felles/Stegtekst";

export const STEG1: Steg = { nr: "01", av: 5, tittel: "Skann koden på hylla", under: "Bruk kameraet på mobilen. Ingen app, ingen innlogging." };

export const SKANN = {
  apne: 0,
  tekst: 10,
} as const;

/**
 * Steg 1: rørhylla med hylleskiltet, så telefonen som kommer opp foran den
 * med kameraet åpent. Søkeren låser seg på koden, det piper, «Åpne siden»
 * trykkes, og rørsiden glir opp.
 */
export const Skann: React.FC<{ varighet: number }> = () => (
  <AbsoluteFill>
    <Stegtekst steg={STEG1} inn={SKANN.tekst} side={0} />
    <Plater startLukket apne={SKANN.apne} />
  </AbsoluteFill>
);
