import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { SE_KURVEN } from "../app/deler";
import { Forside } from "../app/Forside";
import { Kasse, kasseFelt, Kassefelt, SEND_KNAPP, TOMT } from "../app/Kasse";
import { GA_VIDERE, Kurv } from "../app/Kurv";
import { KUNDE } from "../data";
import { Glod } from "../felles/Bakgrunn";
import { Finger, stot, Trykk } from "../felles/Finger";
import { fram, mellom } from "../felles/hjelp";
import { kameraer, miksKam } from "../felles/kamera";
import { useOppsett } from "../felles/oppsett";
import { Rigg } from "../felles/Rigg";
import { skriving } from "../felles/skriving";
import { Steg, Stegtekst } from "../felles/Stegtekst";
import { FORSLAG_PUNKT, Tastatur, TASTATUR_H, tastPunkt } from "../felles/Tastatur";
import { SKJERM_H, STATUS_H, Telefon } from "../felles/Telefon";
import { useBilde } from "../felles/Tempo";
import { ease } from "../tema";
import { BEKREFTELSE_2, KURV_2, STEG3 } from "./Flere";

export const STEG4: Steg = { nr: "04", av: 5, tittel: "Send inn uttaket", under: "Navn, telefon og e-post. Prosjekt eller adresse hvis du vil." };

export const SEND = {
  seKurven: 16,
  videre: 40,
  navnTrykk: 58,
  navnFra: 68,
  navnTil: 100,
  telefonTrykk: 106,
  telefonFra: 114,
  telefonTil: 134,
  epostTrykk: 140,
  epostForslag: 152,
  neste1: 162,
  neste2: 174,
  prosjektFra: 184,
  prosjektTil: 228,
  ferdig: 236,
  send: 256,
} as const;

const T = SEND;

/**
 * Rullingen: siden skyves opp så feltet som skrives i står over tastaturet,
 * som nettleseren gjør når «Neste» flytter fokus. Når tastaturet går ned,
 * kan siden ikke rulles lenger enn den er høy (1041 − 917 = 124).
 */
const rullNå = (f: number) =>
  interpolate(f, [T.neste1 + 1, T.neste1 + 9, T.neste2 + 1, T.neste2 + 9, T.ferdig + 1, T.ferdig + 9], [0, 70, 70, 160, 160, 124], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease.myk,
  });

const fokusNå = (f: number): Kassefelt | null =>
  f < T.navnTrykk
    ? null
    : f < T.telefonTrykk
      ? "navn"
      : f < T.epostTrykk
        ? "telefon"
        : f < T.neste1
          ? "epost"
          : f < T.neste2
            ? "firma"
            : f < T.ferdig
              ? "prosjekt"
              : null;

const TASTATUR_TOPP = SKJERM_H - TASTATUR_H;
const feltTrykk = (felt: Kassefelt, ved: number): Trykk => ({ f: ved, x: kasseFelt(felt).x, y: kasseFelt(felt).y - rullNå(ved) + STATUS_H });
const enter = (modus: "bokstaver" | "tall", ved: number): Trykk => ({ f: ved, x: tastPunkt(modus, "↵").x, y: TASTATUR_TOPP + tastPunkt(modus, "↵").y });

export const SEND_TRYKK: Trykk[] = [
  { f: T.seKurven, x: SE_KURVEN.x, y: SE_KURVEN.y + STATUS_H },
  { f: T.videre, x: GA_VIDERE.x, y: GA_VIDERE.y + STATUS_H },
  feltTrykk("navn", T.navnTrykk),
  feltTrykk("telefon", T.telefonTrykk),
  feltTrykk("epost", T.epostTrykk),
  { f: T.epostForslag, x: FORSLAG_PUNKT.x, y: TASTATUR_TOPP + FORSLAG_PUNKT.y },
  enter("bokstaver", T.neste1),
  enter("bokstaver", T.neste2),
  enter("bokstaver", T.ferdig),
  { f: T.send, x: SEND_KNAPP.x, y: SEND_KNAPP.y + STATUS_H },
];

/**
 * Steg 4: «Se kurven», «Gå videre», og kassen. Navn og telefon skrives,
 * e-posten kommer fra telefonens autofyll, og «Neste» fører videre til
 * prosjektfeltet, som appen gjør (neste-felt.ts). «Ferdig» legger
 * tastaturet ned, og «Send inn uttak» viser «Sender inn …».
 */
export const SendInn: React.FC<{ varighet: number }> = ({ varighet }) => {
  const f = useBilde();
  const o = useOppsett();
  // Vrir seg rett og kommer nærmere, mens skjemaet fylles
  const K = kameraer(o);
  const kam = f < 30 ? miksKam(K.flereSlutt, K.sendInn, fram(f, 0, 30, ease.myk)) : miksKam(K.sendInn, K.sendInnSlutt, fram(f, 30, varighet, ease.myk));

  const fokus = fokusNå(f);
  const navn = skriving(KUNDE.navn, T.navnFra, T.navnTil, f);
  const telefon = skriving(KUNDE.telefon, T.telefonFra, T.telefonTil, f);
  const prosjekt = skriving(KUNDE.prosjekt, T.prosjektFra, T.prosjektTil, f);
  const tastaturOppe = f < T.ferdig ? fram(f, T.navnTrykk + 1, T.navnTrykk + 11, ease.inn) : 1 - fram(f, T.ferdig + 1, T.ferdig + 9, ease.ut);
  const bunn = f < T.ferdig ? 1 - fram(f, T.navnTrykk + 1, T.navnTrykk + 5) : fram(f, T.ferdig + 5, T.ferdig + 13);
  const kurv = fram(f, T.seKurven + 4, T.seKurven + 6);
  const kasse = fram(f, T.videre + 6, T.videre + 8);
  const aktiv = navn.nede ?? telefon.nede ?? prosjekt.nede;

  return (
    <AbsoluteFill>
      <Glod x={kam.x} y={K.y} styrke={1} />
      <Rigg x={kam.x} y={K.y} zoom={kam.zoom} ry={kam.ry} stot={stot(f, SEND_TRYKK)}>
        {(z) => (
          <Telefon
            zoom={z}
            klokke="07:41"
            statusFarge="#171717"
            over={
              <>
                <Tastatur
                  modus={fokus === "telefon" ? "tall" : "bokstaver"}
                  aktiv={aktiv}
                  oppe={tastaturOppe}
                  enter={fokus === "prosjekt" || f >= T.ferdig ? "Ferdig" : "Neste"}
                  forslag={fokus === "epost" ? { tekst: KUNDE.epost, trykk: mellom(f, [T.epostForslag - 1, T.epostForslag + 1], [0, 1]) } : undefined}
                />
                <Finger trykk={SEND_TRYKK} />
              </>
            }
          >
            <Forside s={{ kurv: KURV_2, skann: 0, bekreftelse: { tekst: BEKREFTELSE_2, synlig: 1 - fram(f, 0, 12, ease.ut) } }} />
            {kurv > 0 && (
              <div style={{ position: "absolute", inset: 0, opacity: kurv }}>
                <Kurv videre={mellom(f, [T.videre - 2, T.videre + 1, T.videre + 6], [0, 1, 1])} />
              </div>
            )}
            {kasse > 0 && (
              <div style={{ position: "absolute", inset: 0, opacity: kasse }}>
                <Kasse
                  s={{
                    ...TOMT,
                    verdier: {
                      navn: navn.skrevet,
                      telefon: telefon.skrevet,
                      epost: f > T.epostForslag ? KUNDE.epost : "",
                      prosjekt: prosjekt.skrevet,
                    },
                    fokus,
                    markor: Math.floor(f / 9) % 2 === 0 || aktiv !== undefined,
                    rull: rullNå(f),
                    bunn,
                    send: mellom(f, [T.send - 2, T.send + 1, T.send + 8], [0, 1, 0]),
                    sender: f > T.send + 1 ? (f - T.send) * 24 : undefined,
                  }}
                />
              </div>
            )}
          </Telefon>
        )}
      </Rigg>
      <Stegtekst steg={STEG4} forrige={STEG3} inn={0} side={0} />
    </AbsoluteFill>
  );
};
