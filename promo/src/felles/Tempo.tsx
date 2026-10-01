import React, { createContext, useContext } from "react";
import { useCurrentFrame } from "remotion";

const TempoKontekst = createContext(1);

/**
 * Kortversjonene bruker de samme scenene som hovedfilmen, bare fortere. En
 * scene skrevet for 240 bilder kan spilles på 150 med tempo 1,6: alt inni —
 * tekst, finger, tasting — går like mye fortere, så ingenting kommer ut av
 * takt med hverandre.
 */
export const Tempo: React.FC<{ tempo: number; children: React.ReactNode }> = ({ tempo, children }) => (
  <TempoKontekst.Provider value={tempo}>{children}</TempoKontekst.Provider>
);

/** Bildet i scenen, justert for tempoet. Brukes i stedet for useCurrentFrame. */
export const useBilde = () => useCurrentFrame() * useContext(TempoKontekst);
