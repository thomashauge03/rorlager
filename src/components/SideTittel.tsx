// Tittelen i fana og for skjermlesaren, ut frå adressa.
//
// Alle sidene heitte «Rørlager Hauge Maskin», så ein skjermlesar sa det same
// kvar gong sida skifta, og fem faner med appen kunne ikkje skiljast frå
// kvarandre (WCAG 2.4.2). Éin stad i staden for i kvar side: ei ny side får ein
// fornuftig tittel med ein gong, og ingen kan gløyme det.

import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const APP = "Rørlager Hauge Maskin";

/** Første treff vinn, så dei mest spesifikke står først. */
const TITLAR: [RegExp, string][] = [
  [/^\/$/, "Rør på lager"],
  [/^\/(r|vare)\//, "Rør"],
  [/^\/kurv$/, "Handlekurv"],
  [/^\/kasse$/, "Send inn uttak"],
  [/^\/kvittering$/, "Kvittering"],
  [/^\/bestill\/kasse$/, "Fullfør bestillingen"],
  [/^\/bestill$/, "Bestill til henting"],
  [/^\/bestilling\//, "Bestillingen din"],
  [/^\/vilkar$/, "Kjøpsvilkår"],
  [/^\/personvern$/, "Personvern"],
  [/^\/login$/, "Logg inn"],
  [/^\/nytt-passord$/, "Velg nytt passord"],
  [/^\/konto$/, "Min konto"],
  [/^\/admin\/brukere$/, "Brukere"],
  [/^\/admin/, "Adminpanel"],
  [/^\/prosjekt\/[^/]+\/behov$/, "Meld inn behov"],
  [/^\/prosjekt\/[^/]+\/mottak\//, "Mottakskontroll"],
  [/^\/prosjekt\/[^/]+$/, "Prosjekt"],
  [/^\/prosjekt$/, "Prosjekter"],
];

export function tittelFor(sti: string): string {
  const treff = TITLAR.find(([m]) => m.test(sti));
  return treff ? `${treff[1]} – ${APP}` : APP;
}

export function SideTittel() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = tittelFor(pathname);
  }, [pathname]);
  return null;
}
