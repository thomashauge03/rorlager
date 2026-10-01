import React from "react";
import { AbsoluteFill } from "remotion";
import { fram } from "../felles/hjelp";
import { Plater } from "../felles/Plater";
import { useBilde } from "../felles/Tempo";
import { Kort } from "./Kort";

/** Sluttslaget i musikken kommer på bilde 0–1: platene åpner, logoen kommer. */
export const SLUTT = { apne: 1, kortInn: 3 } as const;

/** Sluttkortet: platene glir av, og logoen med «Selvbetjent rørlager.» står igjen. */
export const Slutt: React.FC<{ varighet: number }> = ({ varighet }) => {
  const f = useBilde();
  return (
    <AbsoluteFill>
      <Kort tittel="Selvbetjent rørlager." inn={SLUTT.kortInn} logoHoyde={130} />
      <Plater startLukket apne={SLUTT.apne} />
      <AbsoluteFill style={{ background: "#000", opacity: fram(f, varighet - 22, varighet) }} />
    </AbsoluteFill>
  );
};
