import React from "react";
import { Klipp } from "./Klipp";
import { HOVEDFILM_PLAN, KORT_PLAN } from "./planer";

/** Hovedfilmen, 16:9, for nettsiden og YouTube. */
export const Hovedfilm: React.FC = () => <Klipp plan={HOVEDFILM_PLAN} />;

/** Kortversjonen: samme komposisjon i 9:16 og 4:5 — scenene legger seg etter formatet. */
export const Kortfilm: React.FC = () => <Klipp plan={KORT_PLAN} />;
