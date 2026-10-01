import React from "react";
import { KUNDE } from "../data";
import { tastetider } from "../felles/skriving";
import type { Signal } from "../lyd/Lydspor";
import { Scenenavn } from "../tid";
import { Apning, APNING } from "./Apning";
import { Flere, FLERE } from "./Flere";
import { Mengde, MENGDE } from "./Mengde";
import { SEND, SendInn } from "./SendInn";
import { Skann, SKANN } from "./Skann";
import { Slutt, SLUTT } from "./Slutt";
import { TaMed, TAMED, TAMED_LUKK_FOR_SLUTT } from "./TaMed";

/** Scenene. `v` er scenens lengde i dens egne bilder (etter tempo). */
export const SCENER: Record<Scenenavn, (v: number) => React.ReactNode> = {
  apning: (v) => <Apning varighet={v} />,
  skann: (v) => <Skann varighet={v} />,
  mengde: (v) => <Mengde varighet={v} />,
  flere: (v) => <Flere varighet={v} />,
  sendInn: (v) => <SendInn varighet={v} />,
  taMed: (v) => <TaMed varighet={v} />,
  slutt: (v) => <Slutt varighet={v} />,
};

const tast = (tider: number[], volum = 0.16): Signal[] =>
  tider.map((ved, i) => ({ lyd: (["tast1", "tast2", "tast3"] as const)[i % 3], ved, volum: volum * (0.85 + ((i * 37) % 10) / 50) }));

const trykk = (ved: number, volum = 0.38): Signal => ({ lyd: "trykk", ved, volum });

/**
 * Lydeffektene til hver scene, i scenens egne bilder (før tempo). `v` er
 * scenens lengde, for lyder som hører til slutten. Sidebytter i appen har
 * ingen lyd i appen, så de får bare et svakt sveip her.
 */
export const SCENE_LYD: Record<Scenenavn, (v: number) => Signal[]> = {
  apning: () => [
    { lyd: "plater", ved: APNING.apne - 2, volum: 0.45 },
    { lyd: "dunk", ved: APNING.kortInn + 1, volum: 0.42 },
    { lyd: "plater", ved: APNING.lukk - 2, volum: 0.4 },
  ],
  skann: () => [
    { lyd: "sveip-kort", ved: SKANN.telefonInn, volum: 0.3 },
    { lyd: "pip", ved: SKANN.pip, volum: 0.5 },
    trykk(SKANN.trykk),
    { lyd: "sveip-kort", ved: SKANN.side, volum: 0.22 },
  ],
  mengde: () => [
    trykk(MENGDE.ti, 0.34),
    trykk(MENGDE.en1, 0.34),
    trykk(MENGDE.en2, 0.34),
    { lyd: "klikk", ved: MENGDE.legg, volum: 0.45 },
    { lyd: "sveip-kort", ved: MENGDE.forside, volum: 0.14 },
  ],
  flere: () => [
    trykk(FLERE.skann),
    { lyd: "sveip-kort", ved: FLERE.apne, volum: 0.2 },
    { lyd: "pip", ved: FLERE.pip, volum: 0.5 },
    trykk(FLERE.to1, 0.34),
    trykk(FLERE.to2, 0.34),
    { lyd: "klikk", ved: FLERE.legg, volum: 0.45 },
    { lyd: "sveip-kort", ved: FLERE.forside, volum: 0.14 },
  ],
  sendInn: () => [
    trykk(SEND.seKurven),
    trykk(SEND.videre),
    trykk(SEND.navnTrykk),
    ...tast(tastetider(KUNDE.navn, SEND.navnFra, SEND.navnTil)),
    trykk(SEND.telefonTrykk),
    ...tast(tastetider(KUNDE.telefon, SEND.telefonFra, SEND.telefonTil)),
    trykk(SEND.epostTrykk),
    trykk(SEND.epostForslag, 0.3),
    trykk(SEND.neste1, 0.3),
    trykk(SEND.neste2, 0.3),
    ...tast(tastetider(KUNDE.prosjekt, SEND.prosjektFra, SEND.prosjektTil)),
    trykk(SEND.ferdig, 0.3),
    { lyd: "klikk", ved: SEND.send, volum: 0.48 },
  ],
  taMed: (v) => [
    { lyd: "sveip", ved: TAMED.glidFra, volum: 0.28 },
    { lyd: "pling", ved: TAMED.pling, volum: 0.45 },
    { lyd: "sveip-kort", ved: TAMED.ned, volum: 0.24 },
    { lyd: "sveip", ved: TAMED.tattFra + 8, volum: 0.2 },
    { lyd: "sveip", ved: TAMED.tattFra + 24, volum: 0.18 },
    { lyd: "plater", ved: v - TAMED_LUKK_FOR_SLUTT - 2, volum: 0.4 },
  ],
  // Sluttslaget i musikken bærer åpningen; platene og glimtet ligger oppå
  slutt: () => [
    { lyd: "plater", ved: Math.max(0, SLUTT.apne - 1), volum: 0.36 },
    { lyd: "glimt", ved: SLUTT.kortInn + 18, volum: 0.3 },
  ],
};
