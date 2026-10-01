import React from "react";
import type { Signal } from "../lyd/Lydspor";
import { Scenenavn } from "../tid";
import { Apning, APNING } from "./Apning";
import { Flere } from "./Flere";
import { Mengde } from "./Mengde";
import { SendInn } from "./SendInn";
import { Skann } from "./Skann";
import { Slutt, SLUTT } from "./Slutt";
import { TaMed, TAMED_LUKK_FOR_SLUTT } from "./TaMed";

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

/**
 * Lydeffektene til hver scene, i scenens egne bilder (før tempo). `v` er
 * scenens lengde, for lyder som hører til slutten.
 */
export const SCENE_LYD: Record<Scenenavn, (v: number) => Signal[]> = {
  apning: () => [
    { lyd: "plater", ved: APNING.apne - 2, volum: 0.45 },
    { lyd: "dunk", ved: APNING.kortInn + 1, volum: 0.42 },
    { lyd: "plater", ved: APNING.lukk - 2, volum: 0.4 },
  ],
  skann: () => [],
  mengde: () => [],
  flere: () => [],
  sendInn: () => [],
  taMed: (v) => [{ lyd: "plater", ved: v - TAMED_LUKK_FOR_SLUTT - 2, volum: 0.4 }],
  // Sluttslaget i musikken bærer åpningen; platene og glimtet ligger oppå
  slutt: () => [
    { lyd: "plater", ved: Math.max(0, SLUTT.apne - 1), volum: 0.36 },
    { lyd: "glimt", ved: SLUTT.kortInn + 18, volum: 0.3 },
  ],
};
