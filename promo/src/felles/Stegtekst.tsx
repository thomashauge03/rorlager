import React from "react";
import { dmSans } from "../fonter";
import { ease, farge } from "../tema";
import { fram, mellom } from "./hjelp";
import { useOppsett } from "./oppsett";
import { useBilde } from "./Tempo";

export type Steg = { nr: string; av: number; tittel: string; under: string };

/**
 * Tekstsøyla ved siden av telefonen (.tekst i Leveringsseddel-filmen): stort
 * rødt nummer, «STEG N AV 5», tittel, undertekst og en rød strek.
 *
 * Kommer den etter et steg på samme side, ruller nummeret (01 → 02) og den
 * gamle teksten går ut idet den nye kommer inn. Tittelen avdekkes bak en
 * skrå maske i logoens vinkel.
 */
const NR_H = 118;

/** Ord med bindestrek («e-post») skal ikke deles over to linjer. */
const helOrd = (tekst: string) =>
  tekst.split(" ").map((ord, i) => (
    <React.Fragment key={i}>
      {i > 0 && " "}
      {ord.includes("-") ? <span style={{ whiteSpace: "nowrap" }}>{ord}</span> : ord}
    </React.Fragment>
  ));

/** Skrå maske: `p` 0 → 1 avdekker fra venstre mot høyre. */
const skraMaske = (p: number, bredde: number, hoyde: number) => {
  const w = ((hoyde * 0.325) / bredde) * 100; // tan 18° ≈ 0,325
  const topp = p * (100 + w);
  return `polygon(0 -20%, ${topp}% -20%, ${topp - w}% 120%, 0 120%)`;
};

const Tekster: React.FC<{ s: Steg; inn: number; ut?: number; utHelt?: boolean; rull?: boolean }> = ({ s, inn, ut, rull }) => {
  const f = useBilde();
  const pTittel = fram(f, inn + 6, inn + 26, ease.inn);
  const pUnder = fram(f, inn + 14, inn + 32, ease.inn);
  const pStrek = fram(f, inn + 18, inn + 40, ease.inn);
  const q = ut === undefined ? 0 : fram(f, ut, ut + 10, ease.ut);
  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 26, height: NR_H, marginBottom: 18 }}>
        <div style={{ height: NR_H, overflow: "hidden", position: "relative", minWidth: 172 }}>
          {/* Nummeret: ruller opp fra under streken */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              fontSize: 136,
              fontWeight: 800,
              lineHeight: `${NR_H}px`,
              color: farge.rod,
              letterSpacing: "-0.06em",
              whiteSpace: "nowrap",
              transform: `translateY(${(1 - fram(f, inn + (rull ? 2 : 0), inn + (rull ? 18 : 20), ease.inn)) * NR_H - q * NR_H}px)`,
            }}
          >
            {s.nr}
          </div>
        </div>
        <div
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: farge.hvitDempet,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            transform: `translateY(-14px) translateX(${(1 - fram(f, inn + 4, inn + 20, ease.inn)) * -14}px)`,
            opacity: fram(f, inn + 4, inn + 18) * (1 - q),
            whiteSpace: "nowrap",
          }}
        >
          Steg {Number(s.nr)} av {s.av}
        </div>
      </div>
      <div
        style={{
          fontSize: 78,
          fontWeight: 700,
          lineHeight: 1.04,
          letterSpacing: "-0.035em",
          color: farge.hvit,
          clipPath: skraMaske(pTittel, 800, 170),
          transform: `translateX(${(1 - pTittel) * -26}px)`,
          opacity: 1 - q,
          textWrap: "balance",
        }}
      >
        {s.tittel}
      </div>
      <div
        style={{
          marginTop: 22,
          fontSize: 33,
          lineHeight: 1.42,
          color: farge.hvitSvak,
          maxWidth: 700,
          fontWeight: 400,
          opacity: pUnder * (1 - q),
          transform: `translateY(${(1 - pUnder) * 14}px)`,
          // Jevne linjer: ingen ord alene på siste linje
          textWrap: "balance",
        }}
      >
        {helOrd(s.under)}
      </div>
      <div style={{ height: 5, background: farge.rod, marginTop: 30, borderRadius: 3, width: 110 * pStrek * (1 - q) }} />
    </>
  );
};

export const Stegtekst: React.FC<{
  steg: Steg;
  /** Bildet teksten begynner å komme inn på */
  inn: number;
  /** Bildet teksten begynner å gå ut på (utelatt: blir stående) */
  ut?: number;
  /** Steget før, på samme side: det gamle nummeret ruller ut og teksten viker */
  forrige?: Steg;
  /** 0 = teksten til høyre for telefonen, 1 = til venstre */
  side: number;
}> = ({ steg, inn, ut, forrige, side }) => {
  const o = useOppsett();
  const t = o.tekst(side);
  const f = useBilde();
  const skifter = forrige !== undefined;
  const gammelUt = skifter ? inn - 1 : undefined;
  return (
    <div
      style={{
        position: "absolute",
        left: t.x,
        top: t.y,
        width: t.bredde / t.skala,
        transform: `${t.loddrett === "midt" ? "translateY(-50%) " : ""}scale(${t.skala})`,
        transformOrigin: "0 0",
        fontFamily: dmSans,
        color: farge.hvit,
      }}
    >
      {/* Det gamle steget går ut oppå det nye, på nøyaktig samme plass */}
      {skifter && f < inn + 12 && (
        <div style={{ position: "absolute", left: 0, top: 0, right: 0 }}>
          <Tekster s={forrige} inn={-1000} ut={gammelUt} />
        </div>
      )}
      <div style={{ opacity: skifter ? mellom(f, [inn + 2, inn + 6], [0, 1]) : 1 }}>
        <Tekster s={steg} inn={skifter ? inn + 2 : inn} ut={ut} rull={skifter} />
      </div>
    </div>
  );
};
