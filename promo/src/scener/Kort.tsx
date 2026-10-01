import React from "react";
import { AbsoluteFill } from "remotion";
import { useFormat } from "../format";
import { dmSans } from "../fonter";
import { fram } from "../felles/hjelp";
import { useBilde } from "../felles/Tempo";
import { HmLogo } from "../merke/HmLogo";
import { ease, farge } from "../tema";

/**
 * Kortene i åpningen og på slutten (.kort i Leveringsseddel-filmen): logo,
 * stor tittel, liten undertekst og en rød hårstrek, midt i bildet.
 */
export const Kort: React.FC<{
  tittel: string;
  under?: string;
  /** Bildet kortet begynner å komme inn på */
  inn: number;
  logoHoyde?: number;
}> = ({ tittel, under, inn, logoHoyde = 112 }) => {
  const f = useBilde();
  const { type } = useFormat();
  const skala = type === "liggende" ? 1 : type === "feed" ? 0.8 : 0.78;
  const pLogo = fram(f, inn, inn + 22, ease.inn);
  const pTittel = fram(f, inn + 10, inn + 32, ease.inn);
  const pUnder = fram(f, inn + 22, inn + 40, ease.inn);
  const pStrek = fram(f, inn + 30, inn + 54, ease.inn);
  const glans = fram(f, inn + 22, inn + 52, ease.myk);
  // Skrå maske som i stegteksten
  const w = 12;
  const topp = pTittel * (100 + w);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily: dmSans, color: farge.hvit }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", transform: `scale(${skala})` }}>
        <div style={{ opacity: pLogo, transform: `scale(${1.08 - 0.08 * pLogo})`, marginBottom: 44 }}>
          <HmLogo hoyde={logoHoyde} glans={glans} />
        </div>
        <div
          style={{
            fontSize: 128,
            fontWeight: 800,
            letterSpacing: "-0.045em",
            lineHeight: 1,
            whiteSpace: "nowrap",
            padding: "0 20px",
            clipPath: `polygon(0 -20%, ${topp}% -20%, ${topp - w}% 120%, 0 120%)`,
            transform: `translateX(${(1 - pTittel) * -30}px)`,
          }}
        >
          {tittel}
        </div>
        {under && (
          <div style={{ marginTop: 26, fontSize: 36, color: farge.hvitSvak, fontWeight: 400, opacity: pUnder, transform: `translateY(${(1 - pUnder) * 14}px)` }}>
            {under}
          </div>
        )}
        <div style={{ width: 120 * pStrek, height: 5, background: farge.rod, marginTop: 38, borderRadius: 3 }} />
      </div>
    </AbsoluteFill>
  );
};
