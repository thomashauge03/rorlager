import React from "react";
import { AbsoluteFill } from "remotion";
import { Forside } from "../app/Forside";
import { hurtigPunkt, leggIKurvPunkt, Rorside } from "../app/Rorside";
import { AVLOPSROR, mengdeTekst, varenavn } from "../data";
import { Glod } from "../felles/Bakgrunn";
import { Finger, stot, Trykk } from "../felles/Finger";
import { fram, mellom } from "../felles/hjelp";
import { kameraer, miksKam } from "../felles/kamera";
import { useOppsett } from "../felles/oppsett";
import { Rigg } from "../felles/Rigg";
import { Steg, Stegtekst } from "../felles/Stegtekst";
import { STATUS_H, Telefon } from "../felles/Telefon";
import { useBilde } from "../felles/Tempo";
import { ease } from "../tema";
import { STEG1 } from "./Skann";

export const STEG2: Steg = { nr: "02", av: 5, tittel: "Hvor mye tar du ut?", under: "Tast inn meter, eller trykk på knappene." };

export const MENGDE = {
  ti: 40,
  en1: 70,
  en2: 92,
  legg: 128,
  /** Appen går rett tilbake til forsiden: neste hylle er som regel ett skann unna */
  forside: 140,
} as const;

const T = MENGDE;

/** Mengdene etter hvert trykk: +10, +1, +1. */
const TRINN: { ved: number; fra: number | null; til: number; verdi: number }[] = [
  { ved: T.ti, fra: null, til: 10, verdi: 10 },
  { ved: T.en1, fra: 10, til: 11, verdi: 1 },
  { ved: T.en2, fra: 11, til: 12, verdi: 1 },
];

export const MENGDE_TRYKK: Trykk[] = [
  ...TRINN.map((t) => ({ f: t.ved, x: hurtigPunkt(AVLOPSROR, t.verdi).x, y: hurtigPunkt(AVLOPSROR, t.verdi).y + STATUS_H })),
  { f: T.legg, x: leggIKurvPunkt(AVLOPSROR).x, y: leggIKurvPunkt(AVLOPSROR).y + STATUS_H },
];

/** Kurven etter steg 2, og bekreftelsen appen viser. */
export const KURV_1 = { antall: 1, mengde: mengdeTekst(12, "m") };
export const BEKREFTELSE_1 = `${mengdeTekst(12, "m")} ${varenavn(AVLOPSROR)} lagt i kurven`;

/**
 * Steg 2: rørsiden. Fingeren trykker +10, +1, +1, tallet ruller til 12 m og
 * knappene våkner. «Legg i handlekurv», og appen går tilbake til forsiden
 * med bekreftelsen og kurvlinja nederst.
 */
export const Mengde: React.FC<{ varighet: number }> = ({ varighet }) => {
  const f = useBilde();
  const o = useOppsett();
  // Glir fra der steg 1 slapp, litt til venstre og nærmere, og driver sakte videre
  const K = kameraer(o);
  const kam = f < 30 ? miksKam(K.skannSlutt, K.mengde, fram(f, 0, 30, ease.myk)) : miksKam(K.mengde, K.mengdeSlutt, fram(f, 30, varighet, ease.myk));

  // Siste trykk som har skjedd, og hvor langt tallet har rullet
  const trinn = [...TRINN].reverse().find((t) => f >= t.ved + 1);
  const mengde = trinn ? { fra: trinn.fra, til: trinn.til, p: fram(f, trinn.ved + 1, trinn.ved + 8, ease.inn) } : { fra: null, til: null, p: 0 };
  const trykket = TRINN.find((t) => f >= t.ved - 1 && f < t.ved + 7);
  const forside = fram(f, T.forside, T.forside + 2);

  return (
    <AbsoluteFill>
      <Glod x={kam.x} y={K.y} styrke={1} />
      <Rigg x={kam.x} y={K.y} zoom={kam.zoom} ry={kam.ry} stot={stot(f, MENGDE_TRYKK)}>
        {(z) => (
          <Telefon zoom={z} klokke="07:39" statusFarge="#171717" over={<Finger trykk={MENGDE_TRYKK} />}>
            <Rorside
              s={{
                vare: AVLOPSROR,
                mengde,
                trykket: trykket ? { verdi: trykket.verdi, p: 1 } : undefined,
                knapperAv: 1 - fram(f, T.ti + 1, T.ti + 6),
                legg: mellom(f, [T.legg - 2, T.legg + 1, T.legg + 8], [0, 1, 0]),
              }}
            />
            {forside > 0 && (
              <div style={{ position: "absolute", inset: 0, opacity: forside }}>
                <Forside s={{ kurv: KURV_1, bekreftelse: { tekst: BEKREFTELSE_1, synlig: fram(f, T.forside + 3, T.forside + 13, ease.inn) } }} />
              </div>
            )}
          </Telefon>
        )}
      </Rigg>
      <Stegtekst steg={STEG2} forrige={STEG1} inn={0} side={0} />
    </AbsoluteFill>
  );
};
