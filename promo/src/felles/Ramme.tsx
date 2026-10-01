import React from "react";
import { HmLogo, LOGO_FORHOLD } from "../merke/HmLogo";
import { farge } from "../tema";
import { useOppsett } from "./oppsett";

/**
 * Det som står fast gjennom stegene (.logo og .skinne i Leveringsseddel-
 * filmen): logoen i hjørnet og fem streker som fylles etter hvert.
 *
 * `framdrift` er 0–5: heltallsdelen er ferdige steg, resten er hvor langt
 * vi er i det gjeldende. I liggende film står strekene under tekstsøyla og
 * følger den når den bytter side (`side`), så de aldri havner over telefonen.
 */
export const Ramme: React.FC<{ synlig: number; framdrift: number; side: number }> = ({ synlig, framdrift, side }) => {
  const o = useOppsett();
  if (synlig <= 0) return null;
  const L = o.logo;
  const logoB = L.hoyde * LOGO_FORHOLD;
  const venstre = L.anker === "hoyre" ? L.x - logoB : L.x - logoB / 2;
  const liggende = o.type === "liggende";
  return (
    <>
      <div style={{ position: "absolute", left: venstre, top: L.y, opacity: synlig }}>
        <HmLogo hoyde={L.hoyde} />
      </div>
      {o.skinne && (
        <div
          style={{
            position: "absolute",
            left: liggende ? o.tekst(side).x : "50%",
            top: o.skinne.y,
            transform: liggende ? undefined : "translateX(-50%)",
            display: "flex",
            gap: 9,
            opacity: synlig,
          }}
        >
          {[0, 1, 2, 3, 4].map((i) => {
            const fyll = Math.max(0, Math.min(1, framdrift - i));
            return (
              <div key={i} style={{ position: "relative", width: 46, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.16)", overflow: "hidden" }}>
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${fyll * 100}%`, background: farge.rod }} />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};
