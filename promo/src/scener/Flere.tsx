import React from "react";
import { AbsoluteFill } from "remotion";
import { Forside, SKANN_KNAPP } from "../app/Forside";
import { hurtigPunkt, leggIKurvPunkt, Rorside } from "../app/Rorside";
import { Skanner } from "../app/Skanner";
import { BEND, mengdeTekst, varenavn } from "../data";
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
import { BEKREFTELSE_1, KURV_1, STEG2 } from "./Mengde";

export const STEG3: Steg = { nr: "03", av: 5, tittel: "Flere varer?", under: "Skann neste kode. Rør og deler havner i samme kurv." };

export const FLERE = {
  skann: 22,
  apne: 24,
  panFra: 30,
  panTil: 66,
  pip: 72,
  lukk: 74,
  to1: 96,
  to2: 112,
  legg: 136,
  forside: 146,
} as const;

const T = FLERE;

export const FLERE_TRYKK: Trykk[] = [
  { f: T.skann, x: SKANN_KNAPP.x, y: SKANN_KNAPP.y + STATUS_H },
  { f: T.to1, x: hurtigPunkt(BEND, 2).x, y: hurtigPunkt(BEND, 2).y + STATUS_H },
  { f: T.to2, x: hurtigPunkt(BEND, 2).x, y: hurtigPunkt(BEND, 2).y + STATUS_H },
  { f: T.legg, x: leggIKurvPunkt(BEND).x, y: leggIKurvPunkt(BEND).y + STATUS_H },
];

/** Kurven etter steg 3: mengdene summert per enhet, som kurvlinja gjør når prisene er av. */
export const KURV_2 = { antall: 2, mengde: `${mengdeTekst(12, "m")} · ${mengdeTekst(4, "stk")}` };
export const BEKREFTELSE_2 = `${mengdeTekst(4, "stk")} ${varenavn(BEND)} lagt i kurven`;

/**
 * Steg 3: tilbake på forsiden med kurvlinja. «Skann QR-kode» åpner appens
 * egen skanner; kameraet føres fra kassen med bend ned til etiketten på
 * hyllekanten, og koden leses. +2, +2, «Legg i handlekurv», og kurvmerket
 * teller til 2.
 */
export const Flere: React.FC<{ varighet: number }> = ({ varighet }) => {
  const f = useBilde();
  const o = useOppsett();
  // Vrir seg mer og trekker seg tilbake, så sakte innover mot bildet
  const K = kameraer(o);
  const kam = f < 30 ? miksKam(K.mengdeSlutt, K.flere, fram(f, 0, 30, ease.myk)) : miksKam(K.flere, K.flereSlutt, fram(f, 30, varighet, ease.myk));

  const apne = fram(f, T.apne, T.apne + 6, ease.inn) - fram(f, T.lukk, T.lukk + 6, ease.ut);
  const pan = fram(f, T.panFra, T.panTil, ease.myk);
  const pasiden = f >= T.lukk;
  const tilbake = fram(f, T.forside, T.forside + 2);
  const mengde =
    f < T.to1 + 1
      ? { fra: null, til: null, p: 0 }
      : f < T.to2 + 1
        ? { fra: null, til: 2, p: fram(f, T.to1 + 1, T.to1 + 8, ease.inn) }
        : { fra: 2, til: 4, p: fram(f, T.to2 + 1, T.to2 + 8, ease.inn) };
  const trykket = [T.to1, T.to2].find((t) => f >= t - 1 && f < t + 7);

  return (
    <AbsoluteFill>
      <Glod x={kam.x} y={K.y} styrke={1} />
      <Rigg x={kam.x} y={K.y} zoom={kam.zoom} ry={kam.ry} stot={stot(f, FLERE_TRYKK)}>
        {(z) => (
          <Telefon zoom={z} klokke="07:40" statusFarge="#171717" over={<Finger trykk={FLERE_TRYKK} />}>
            {pasiden ? (
              <Rorside
                s={{
                  vare: BEND,
                  mengde,
                  trykket: trykket !== undefined ? { verdi: 2, p: 1 } : undefined,
                  knapperAv: 1 - fram(f, T.to1 + 1, T.to1 + 6),
                  legg: mellom(f, [T.legg - 2, T.legg + 1, T.legg + 8], [0, 1, 0]),
                  // Kurven telles opp idet varen legges i, før appen går til forsiden
                  kurv: f > T.legg + 2 ? KURV_2 : KURV_1,
                }}
              />
            ) : (
              <Forside
                s={{
                  kurv: KURV_1,
                  skann: mellom(f, [T.skann - 2, T.skann + 1, T.skann + 8], [0, 1, 0]),
                  bekreftelse: { tekst: BEKREFTELSE_1, synlig: 1 - fram(f, 0, 14, ease.ut) },
                }}
              />
            )}
            <Skanner apne={apne} pan={pan} />
            {tilbake > 0 && (
              <div style={{ position: "absolute", inset: 0, opacity: tilbake }}>
                <Forside s={{ kurv: KURV_2, bekreftelse: { tekst: BEKREFTELSE_2, synlig: fram(f, T.forside + 3, T.forside + 13, ease.inn) } }} />
              </div>
            )}
          </Telefon>
        )}
      </Rigg>
      <Stegtekst steg={STEG3} forrige={STEG2} inn={0} side={0} />
    </AbsoluteFill>
  );
};
