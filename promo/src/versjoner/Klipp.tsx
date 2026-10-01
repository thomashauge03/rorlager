import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { useFormat } from "../format";
import { Bakgrunn } from "../felles/Bakgrunn";
import { fram } from "../felles/hjelp";
import { Korn } from "../felles/Korn";
import { Ramme } from "../felles/Ramme";
import { Tempo } from "../felles/Tempo";
import { Effekt, Musikk, Musikkbit, Signal } from "../lyd/Lydspor";
import { SCENE_LYD, SCENER } from "../scener/register";
import { TAMED } from "../scener/TaMed";
import { ease } from "../tema";
import { LENGDE, Scenenavn, STEGENE } from "../tid";

export type Del = { scene: Scenenavn; fra: number; til: number };
export type Plan = { deler: Del[]; musikk: Musikkbit[]; lengde: number };

/** Hvor fort scenen spilles: lengden den er skrevet for, delt på plassen den får. */
export const tempoFor = (d: Del) => LENGDE[d.scene] / (d.til - d.fra);

/** Lydeffektene i en plan, flyttet til filmens bilder og justert for tempo. */
export const effekterFor = (plan: Plan): Signal[] =>
  plan.deler.flatMap((d) => {
    const tempo = tempoFor(d);
    const v = Math.round((d.til - d.fra) * tempo);
    return SCENE_LYD[d.scene](v)
      .map((s) => ({ ...s, ved: d.fra + s.ved / tempo, varighet: s.varighet ? Math.round(s.varighet / tempo) : undefined }))
      .filter((s) => s.ved >= 0 && s.ved < d.til);
  });

/** Der lyset i bakgrunnen står (0 venstre, 1 høyre), og hvor langt i stegene vi er. */
const tilstand = (plan: Plan, g: number) => {
  const d = plan.deler.find((x) => g >= x.fra && g < x.til) ?? plan.deler[plan.deler.length - 1];
  const lokal = (g - d.fra) * tempoFor(d);
  // Telefonen står til venstre i steg 1–4 og glir til høyre i steg 5
  const lys = d.scene === "apning" || d.scene === "slutt" ? 0.5 : d.scene === "taMed" ? fram(lokal, TAMED.glidFra, TAMED.glidTil, ease.kamera) : 0;
  const steg = STEGENE.map((s) => plan.deler.find((x) => x.scene === s)!);
  let framdrift = 0;
  steg.forEach((s, i) => {
    if (g >= s.til) framdrift = i + 1;
    else if (g >= s.fra) framdrift = i + (g - s.fra) / (s.til - s.fra);
  });
  const forste = steg[0];
  const siste = steg[steg.length - 1];
  const synlig = Math.min(fram(g, forste.fra + 8, forste.fra + 22), 1 - fram(g, siste.til - 30, siste.til - 18));
  return { lys, framdrift, synlig };
};

/**
 * En versjon av filmen bygget fra en plan: bakgrunnen, scenene etter
 * hverandre i sitt tempo, rammen (logo og framdrift), korn, og lyden.
 */
export const Klipp: React.FC<{ plan: Plan; medLyd?: boolean }> = ({ plan, medLyd = true }) => {
  const g = useCurrentFrame();
  const { type } = useFormat();
  const t = tilstand(plan, g);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Bakgrunn lys={t.lys} drift={g / plan.lengde} staaende={type !== "liggende"} />
      {plan.deler.map((d) => {
        const tempo = tempoFor(d);
        const plass = d.til - d.fra;
        return (
          <Sequence key={`${d.scene}-${d.fra}`} name={d.scene} from={d.fra} durationInFrames={plass}>
            <Tempo tempo={tempo}>{SCENER[d.scene](Math.round(plass * tempo))}</Tempo>
          </Sequence>
        );
      })}
      <Ramme synlig={t.synlig} framdrift={t.framdrift} side={t.lys} />
      <Korn />
      {medLyd && (
        <>
          {plan.musikk.length > 0 && <Musikk biter={plan.musikk} />}
          {effekterFor(plan).map((s, i) => (
            <Effekt key={i} {...s} />
          ))}
        </>
      )}
    </AbsoluteFill>
  );
};
