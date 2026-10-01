import React, { useId } from "react";
import { HM_LOGO } from "./hm-logo-vektor";

const [UX, UY, UB, UH] = HM_LOGO.utsnitt;

/** Bredde / høyde for logoen, for å regne ut plass. */
export const LOGO_FORHOLD = UB / UH;

/**
 * HM-logoen i vektor: svart kant og ekstrudering, hvit H og rød M.
 *
 * `glans` (0–1) sender et lysstreif skrått over flatene — samme vinkel som
 * kursiven i logoen. Utelatt: ingen glans.
 */
export const HmLogo: React.FC<{
  hoyde: number;
  glans?: number;
  stil?: React.CSSProperties;
}> = ({ hoyde, glans, stil }) => {
  const id = useId().replace(/:/g, "");
  const bredde = hoyde * LOGO_FORHOLD;
  // Streifet går fra venstre utenfor logoen til høyre utenfor den
  const gx = UX - UB * 0.5 + (glans ?? 0) * UB * 2;
  return (
    <svg
      width={bredde}
      height={hoyde}
      viewBox={`${UX} ${UY} ${UB} ${UH}`}
      style={{ display: "block", overflow: "visible", ...stil }}
    >
      <defs>
        <clipPath id={`flater-${id}`}>
          <path d={HM_LOGO.hvit} />
          <path d={HM_LOGO.rod} />
        </clipPath>
        <linearGradient id={`glans-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.75" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={HM_LOGO.silhuett} fill={HM_LOGO.farger.kant} />
      <path d={HM_LOGO.hvit} fill={HM_LOGO.farger.hvit} />
      <path d={HM_LOGO.rod} fill={HM_LOGO.farger.rod} />
      {glans !== undefined && glans > 0 && glans < 1 && (
        <g clipPath={`url(#flater-${id})`}>
          <rect
            x={gx}
            y={UY - UH}
            width={UB * 0.22}
            height={UH * 3}
            fill={`url(#glans-${id})`}
            transform={`skewX(-18) translate(${UH * 0.3} 0)`}
            style={{ mixBlendMode: "soft-light" }}
          />
        </g>
      )}
    </svg>
  );
};
